const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// arquivos estáticos da pasta views
app.use(express.static(path.join(__dirname, 'views')));

// conexao
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'termosti';
const COLL_NAME = 'termosti';

let db, collection;

const tecnologiasNoTSI = [
    'javascript',
    'php',
    'sql',
    'typescript',
    'nosql',
    'c',
    'java'
];

const tecnologiasForaDoTSI = [
    'python',
    'bdd',
    'tdd',
    'api'
];

// tecnologias concorrentes
const gruposTecnologias = {
    'Frontend': {
        principal: 'python',
        concorrentes: ['typescript', 'javascript']
    },
    'Backend': {
        principal: 'python',
        concorrentes: ['java', 'php']
    },
    'Banco de Dados': {
        principal: 'mysql',
        concorrentes: ['postgresql', 'mongodb']
    }
};

// ranking
const tecnologiasFrontend = ['javascript', 'typescript', 'angular', 'html', 'css'];
const tecnologiasBackend = ['java', 'python', 'php', 'ruby', 'c#'];

// carregar o template html
function loadTemplate(name) {
    return fs.readFileSync(path.join(__dirname, 'views', name), 'utf8');
}

// conecta mogno e inicia o sercer
async function start() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    console.log('Conectado ao MongoDB');
    db = client.db(DB_NAME);
    collection = db.collection(COLL_NAME);

    app.listen(PORT, () => {
        console.log(`server rodando em http://localhost:${PORT}`);
    });
}

app.get('/', async (req, res) => {
    try {
        const docs = await collection.find().toArray();

        const rows = docs.map(d => `
      <tr>
        <td>${d.Termo}</td>
        <td>${d.Mensuracao}</td>
        <td>${d.Participacao}</td>
      </tr>
    `).join('\n');

        const template = loadTemplate('index.html');
        const html = template.replace('{{{ rows }}}', rows);

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao buscar dados.');
    }
});

app.get('/desempenho', async (req, res) => {
    try {
        // filtra as tecnologias da const
        const query = {
            Termo: { $in: tecnologiasNoTSI }
        };

        const docs = await collection.find(query).sort({
            Termo: 1,
            Mensuracao: 1
        }).toArray();

        const rows = docs.map(d => {
            const techClass = d.Termo.toLowerCase().replace(/\s+/g, '-');
            return `
      <tr>
        <td><span class="tech-badge tech-${techClass}">${d.Termo}</span></td>
        <td class="date-cell">${d.Mensuracao}</td>
        <td><span class="participation">${d.Participacao}</span></td>
      </tr>
    `;
        }).join('\n');

        const template = loadTemplate('desempenho.html');
        const html = template.replace('{{{ rows }}}', rows);

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao buscar dados de desempenho.');
    }
});

app.get('/fora-do-tsi', async (req, res) => {
    try {
        // filtra pela const
        const query = {
            Termo: { $in: tecnologiasForaDoTSI }
        };

        const docs = await collection.find(query).toArray();

        const dadosJaneiro = docs.filter(d => {
            const mensuracao = d.Mensuracao.toString();
            // ve se é 01 ou se começa com jan 
            return mensuracao.includes('01/') || mensuracao.toLowerCase().includes('jan');
        });

        // agrupa  por ano e tecnologia
        const dadosAgrupados = {};
        dadosJaneiro.forEach(d => {
            const ano = d.Mensuracao.toString().match(/(\d{4})/)?.[1] || 'N/A';
            const key = `${d.Termo}-${ano}`;

            if (!dadosAgrupados[key]) {
                dadosAgrupados[key] = {
                    termo: d.Termo,
                    ano: ano,
                    participacao: d.Participacao
                };
            }
        });

        const dadosOrdenados = Object.values(dadosAgrupados).sort((a, b) => {
            if (a.ano !== b.ano) return a.ano.localeCompare(b.ano);
            return a.termo.localeCompare(b.termo);
        });

        const rows = dadosOrdenados.map(d => {
            const techClass = d.termo.toLowerCase().replace(/\s+/g, '-');
            return `
      <tr>
        <td><span class="tech-badge tech-${techClass}">${d.termo}</span></td>
        <td class="date-cell">${d.ano}</td>
        <td><span class="participation">${d.participacao}</span></td>
      </tr>
    `;
        }).join('\n');

        const template = loadTemplate('fora-do-tsi.html');
        const html = template.replace('{{{ rows }}}', rows);

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao buscar dados de tecnologias fora do curso.');
    }
});

app.get('/comparativo-tecnologias', async (req, res) => {
    try {
        // Buscar todos os dados das tecnologias que vamos comparar
        const todasTecnologias = [];
        Object.values(gruposTecnologias).forEach(grupo => {
            todasTecnologias.push(grupo.principal, ...grupo.concorrentes);
        });

        const query = {
            Termo: { $in: todasTecnologias }
        };

        const docs = await collection.find(query).toArray();

        // Agrupar dados por tecnologia e ano
        const dadosPorTecnologia = {};
        docs.forEach(d => {
            const ano = d.Mensuracao.toString().match(/(\d{4})/)?.[1] || 'N/A';
            const tech = d.Termo.toLowerCase();

            if (!dadosPorTecnologia[tech]) {
                dadosPorTecnologia[tech] = {};
            }

            if (!dadosPorTecnologia[tech][ano]) {
                dadosPorTecnologia[tech][ano] = [];
            }

            dadosPorTecnologia[tech][ano].push(parseFloat(d.Participacao) || 0);
        });

        // Calcular médias anuais
        const mediasPorTecnologia = {};
        Object.keys(dadosPorTecnologia).forEach(tech => {
            mediasPorTecnologia[tech] = {};
            Object.keys(dadosPorTecnologia[tech]).forEach(ano => {
                const valores = dadosPorTecnologia[tech][ano];
                const media = valores.reduce((a, b) => a + b, 0) / valores.length;
                mediasPorTecnologia[tech][ano] = media.toFixed(2);
            });
        });

        // Gerar rows para a tabela
        const rows = [];
        Object.entries(gruposTecnologias).forEach(([categoria, grupo]) => {
            const tecnologias = [grupo.principal, ...grupo.concorrentes];

            tecnologias.forEach(tech => {
                const techLower = tech.toLowerCase();
                const techClass = techLower.replace(/\s+/g, '-');

                if (mediasPorTecnologia[techLower]) {
                    // Calcular média geral
                    const mediaGeral = Object.values(mediasPorTecnologia[techLower])
                        .reduce((a, b) => parseFloat(a) + parseFloat(b), 0) /
                        Object.values(mediasPorTecnologia[techLower]).length;

                    const isPrincipal = tech === grupo.principal;
                    const badgeClass = isPrincipal ? 'tech-principal' : 'tech-concorrente';

                    rows.push(`
                        <tr>
                            <td>${categoria}</td>
                            <td><span class="tech-badge tech-${techClass} ${badgeClass}">${tech}</span></td>
                            <td class="participation">${mediaGeral.toFixed(2)}%</td>
                            <td class="status">${isPrincipal ? 'Principal' : 'Concorrente'}</td>
                        </tr>
                    `);
                }
            });
        });

        const template = loadTemplate('comparativo-tecnologias.html');
        const html = template.replace('{{{ rows }}}', rows.join('\n'));

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao buscar dados do comparativo.');
    }
});

app.get('/ranking-frontend-backend', async (req, res) => {
    try {
        const todasTecnologias = [...tecnologiasFrontend, ...tecnologiasBackend];

        const query = {
            Termo: { $in: todasTecnologias }
        };

        const docs = await collection.find(query).toArray();

        // Agrupar por ano e mês
        const dadosPorPeriodo = {};
        docs.forEach(d => {
            const periodo = d.Mensuracao.toString();
            const anoMatch = periodo.match(/(\d{4})/);
            const ano = anoMatch ? anoMatch[1] : 'N/A';

            if (ano !== 'N/A') {
                if (!dadosPorPeriodo[ano]) {
                    dadosPorPeriodo[ano] = {};
                }

                const tech = d.Termo.toLowerCase();
                if (!dadosPorPeriodo[ano][tech]) {
                    dadosPorPeriodo[ano][tech] = [];
                }

                dadosPorPeriodo[ano][tech].push(parseFloat(d.Participacao) || 0);
            }
        });

        // Calcular médias anuais e criar ranking
        const rankingPorAno = {};
        Object.keys(dadosPorPeriodo).sort().forEach(ano => {
            const mediasPorTech = {};

            Object.keys(dadosPorPeriodo[ano]).forEach(tech => {
                const valores = dadosPorPeriodo[ano][tech];
                const media = valores.reduce((a, b) => a + b, 0) / valores.length;
                mediasPorTech[tech] = media;
            });

            // Separar frontend e backend
            const frontendData = tecnologiasFrontend
                .filter(tech => mediasPorTech[tech] !== undefined)
                .map(tech => ({ tech, media: mediasPorTech[tech] }))
                .sort((a, b) => b.media - a.media);

            const backendData = tecnologiasBackend
                .filter(tech => mediasPorTech[tech] !== undefined)
                .map(tech => ({ tech, media: mediasPorTech[tech] }))
                .sort((a, b) => b.media - a.media);

            rankingPorAno[ano] = {
                frontend: frontendData,
                backend: backendData
            };
        });

        // Gerar HTML das tabelas
        const anosOrdenados = Object.keys(rankingPorAno).sort();
        const tabelasHTML = anosOrdenados.map(ano => {
            const frontend = rankingPorAno[ano].frontend;
            const backend = rankingPorAno[ano].backend;

            const frontendRows = frontend.map((item, index) => {
                const posicao = index + 1;
                const medal = posicao === 1 ? '🥇' : posicao === 2 ? '🥈' : posicao === 3 ? '🥉' : `${posicao}º`;
                const techClass = item.tech.replace(/\s+/g, '-').replace('#', 'sharp');

                return `
                    <tr>
                        <td class="ranking-pos">${medal}</td>
                        <td><span class="tech-badge tech-${techClass}">${item.tech}</span></td>
                        <td class="participation">${item.media.toFixed(2)}%</td>
                    </tr>
                `;
            }).join('');

            const backendRows = backend.map((item, index) => {
                const posicao = index + 1;
                const medal = posicao === 1 ? '🥇' : posicao === 2 ? '🥈' : posicao === 3 ? '🥉' : `${posicao}º`;
                const techClass = item.tech.replace(/\s+/g, '-').replace('#', 'sharp');

                return `
                    <tr>
                        <td class="ranking-pos">${medal}</td>
                        <td><span class="tech-badge tech-${techClass}">${item.tech}</span></td>
                        <td class="participation">${item.media.toFixed(2)}%</td>
                    </tr>
                `;
            }).join('');

            return `
                <div class="year-section">
                    <h2 class="year-title">${ano}</h2>
                    <div class="ranking-tables">
                        <div class="ranking-table">
                            <h3>Frontend</h3>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Posição</th>
                                        <th>Tecnologia</th>
                                        <th>Participação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${frontendRows}
                                </tbody>
                            </table>
                        </div>
                        <div class="ranking-table">
                            <h3>Backend</h3>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Posição</th>
                                        <th>Tecnologia</th>
                                        <th>Participação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${backendRows}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const template = loadTemplate('ranking-frontend-backend.html');
        const html = template.replace('{{{ rankings }}}', tabelasHTML);

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao buscar dados do ranking.');
    }
});

app.get('/frontend-vs-backend', async (req, res) => {
    try {
        const todasTecnologias = [...tecnologiasFrontend, ...tecnologiasBackend];

        const query = {
            Termo: { $in: todasTecnologias }
        };

        const docs = await collection.find(query).toArray();

        // Agrupar por ano
        const dadosPorAno = {};
        docs.forEach(d => {
            const periodo = d.Mensuracao.toString();
            const anoMatch = periodo.match(/(\d{4})/);
            const ano = anoMatch ? anoMatch[1] : 'N/A';

            if (ano !== 'N/A') {
                if (!dadosPorAno[ano]) {
                    dadosPorAno[ano] = {
                        frontend: [],
                        backend: []
                    };
                }

                const tech = d.Termo.toLowerCase();
                const participacao = parseFloat(d.Participacao) || 0;

                if (tecnologiasFrontend.includes(tech)) {
                    dadosPorAno[ano].frontend.push(participacao);
                } else if (tecnologiasBackend.includes(tech)) {
                    dadosPorAno[ano].backend.push(participacao);
                }
            }
        });

        // Calcular somatórios por ano
        const comparativoPorAno = {};
        Object.keys(dadosPorAno).sort().forEach(ano => {
            const frontendTotal = dadosPorAno[ano].frontend.reduce((a, b) => a + b, 0);
            const backendTotal = dadosPorAno[ano].backend.reduce((a, b) => a + b, 0);
            const total = frontendTotal + backendTotal;

            comparativoPorAno[ano] = {
                frontend: {
                    total: frontendTotal,
                    percentual: total > 0 ? (frontendTotal / total * 100) : 0,
                    count: dadosPorAno[ano].frontend.length
                },
                backend: {
                    total: backendTotal,
                    percentual: total > 0 ? (backendTotal / total * 100) : 0,
                    count: dadosPorAno[ano].backend.length
                },
                totalGeral: total
            };
        });

        // Gerar rows para a tabela
        const rows = Object.keys(comparativoPorAno).sort().map(ano => {
            const dados = comparativoPorAno[ano];

            return `
                <tr>
                    <td class="year-cell">${ano}</td>
                    <td class="participation frontend-total">${dados.frontend.total.toFixed(2)}%</td>
                    <td class="participation backend-total">${dados.backend.total.toFixed(2)}%</td>
                    <td class="participation">${dados.totalGeral.toFixed(2)}%</td>
                    <td class="percentage ${dados.frontend.percentual > dados.backend.percentual ? 'winner' : ''}">${dados.frontend.percentual.toFixed(1)}%</td>
                    <td class="percentage ${dados.backend.percentual > dados.frontend.percentual ? 'winner' : ''}">${dados.backend.percentual.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');

        // Calcular tendências
        const anos = Object.keys(comparativoPorAno).sort();
        const tendenciaFrontend = anos.length > 1 ?
            (comparativoPorAno[anos[anos.length - 1]].frontend.total - comparativoPorAno[anos[0]].frontend.total) : 0;
        const tendenciaBackend = anos.length > 1 ?
            (comparativoPorAno[anos[anos.length - 1]].backend.total - comparativoPorAno[anos[0]].backend.total) : 0;

        const resumoHTML = `
            <div class="summary-cards">
                <div class="summary-card frontend-card">
                    <h3>Frontend</h3>
                    <div class="big-number">${Object.values(comparativoPorAno).reduce((acc, dados) => acc + dados.frontend.total, 0).toFixed(1)}%</div>
                    <div class="trend ${tendenciaFrontend >= 0 ? 'positive' : 'negative'}">
                        ${tendenciaFrontend >= 0 ? '↗️' : '↘️'} ${Math.abs(tendenciaFrontend).toFixed(1)}% desde ${anos[0]}
                    </div>
                </div>
                <div class="summary-card backend-card">
                    <h3>Backend</h3>
                    <div class="big-number">${Object.values(comparativoPorAno).reduce((acc, dados) => acc + dados.backend.total, 0).toFixed(1)}%</div>
                    <div class="trend ${tendenciaBackend >= 0 ? 'positive' : 'negative'}">
                        ${tendenciaBackend >= 0 ? '↗️' : '↘️'} ${Math.abs(tendenciaBackend).toFixed(1)}% desde ${anos[0]}
                    </div>
                </div>
            </div>
        `;

        const template = loadTemplate('frontend-vs-backend.html');
        const html = template
            .replace('{{{ summary }}}', resumoHTML)
            .replace('{{{ rows }}}', rows);

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao buscar dados do comparativo agregado.');
    }
});

start().catch(err => {
    console.error('Falha ao iniciar:', err);
});
