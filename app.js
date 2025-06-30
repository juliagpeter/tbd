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

// Lista de bancos de dados para comparação
const bancosDesempenho = ['mysql', 'postgresql', 'mongodb', 'sqlite', 'redis'];

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

app.get('/bancos-desempenho', async (req, res) => {
    try {
        const query = {
            Termo: { $in: bancosDesempenho }
        };

        const docs = await collection.find(query).sort({
            Mensuracao: 1
        }).toArray();

        // Agrupar dados por banco e ano
        const dadosPorBanco = {};
        docs.forEach(d => {
            const banco = d.Termo.toLowerCase();
            const ano = d.Mensuracao.toString().match(/(\d{4})/)?.[1];

            if (ano) {
                if (!dadosPorBanco[banco]) {
                    dadosPorBanco[banco] = {};
                }

                if (!dadosPorBanco[banco][ano]) {
                    dadosPorBanco[banco][ano] = [];
                }

                dadosPorBanco[banco][ano].push(parseFloat(d.Participacao) || 0);
            }
        });

        // Calcular médias anuais
        const mediasPorBanco = {};
        Object.keys(dadosPorBanco).forEach(banco => {
            mediasPorBanco[banco] = {};
            Object.keys(dadosPorBanco[banco]).forEach(ano => {
                const valores = dadosPorBanco[banco][ano];
                mediasPorBanco[banco][ano] = valores.reduce((sum, val) => sum + val, 0) / valores.length;
            });
        });

        // Preparar dados para o gráfico
        const anos = [...new Set(docs.map(d => d.Mensuracao.toString().match(/(\d{4})/)?.[1]).filter(Boolean))].sort();

        const chartData = {
            labels: anos,
            datasets: bancosDesempenho.map((banco, index) => {
                const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6f42c1'];
                return {
                    label: banco.toUpperCase(),
                    data: anos.map(ano => mediasPorBanco[banco]?.[ano] || 0),
                    borderColor: colors[index],
                    backgroundColor: colors[index] + '20',
                    tension: 0.4
                };
            })
        };

        // Gerar dados para a tabela
        const rows = bancosDesempenho.map(banco => {
            const dadosBanco = mediasPorBanco[banco] || {};
            const mediasAnuais = anos.map(ano => dadosBanco[ano] || 0);
            const mediaGeral = mediasAnuais.reduce((sum, val) => sum + val, 0) / mediasAnuais.length;

            const colunasBanco = anos.map(ano =>
                `<td class="participation">${(dadosBanco[ano] || 0).toFixed(2)}%</td>`
            ).join('');

            return `
                <tr>
                    <td><span class="tech-badge tech-${banco}">${banco.toUpperCase()}</span></td>
                    ${colunasBanco}
                    <td class="participation" style="font-weight: 600;">${mediaGeral.toFixed(2)}%</td>
                </tr>
            `;
        }).join('');

        const headerColunas = anos.map(ano => `<th>${ano}</th>`).join('');

        const template = loadTemplate('bancos-desempenho.html');
        const html = template
            .replace('{{{ chartData }}}', JSON.stringify(chartData))
            .replace('{{{ headerColunas }}}', headerColunas)
            .replace('{{{ rows }}}', rows);

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao buscar dados de desempenho dos bancos.');
    }
});

app.get('/categorias-analise', async (req, res) => {
    try {
        // 1. Buscar os 80 termos mais presentes (por frequência de aparição)
        const termosFrequentes = await collection.aggregate([
            {
                $group: {
                    _id: "$Termo",
                    count: { $sum: 1 },
                    participacaoMedia: { $avg: { $toDouble: "$Participacao" } }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 80 }
        ]).toArray();

        // 2. Categorização manual dos termos mais frequentes
        const categorizacao = {
            'javascript': 'Linguagens de Programação',
            'java': 'Linguagens de Programação',
            'python': 'Linguagens de Programação',
            'c': 'Linguagens de Programação',
            'php': 'Linguagens de Programação',
            'typescript': 'Linguagens de Programação',
            'c#': 'Linguagens de Programação',
            'ruby': 'Linguagens de Programação',
            'go': 'Linguagens de Programação',
            'rust': 'Linguagens de Programação',
            'kotlin': 'Linguagens de Programação',
            'swift': 'Linguagens de Programação',

            'react': 'Frameworks e Bibliotecas',
            'angular': 'Frameworks e Bibliotecas',
            'vue': 'Frameworks e Bibliotecas',
            'node.js': 'Frameworks e Bibliotecas',
            'spring': 'Frameworks e Bibliotecas',
            'django': 'Frameworks e Bibliotecas',
            'flask': 'Frameworks e Bibliotecas',
            'express': 'Frameworks e Bibliotecas',
            'jquery': 'Frameworks e Bibliotecas',
            'bootstrap': 'Frameworks e Bibliotecas',

            'mysql': 'Bancos de Dados',
            'postgresql': 'Bancos de Dados',
            'mongodb': 'Bancos de Dados',
            'redis': 'Bancos de Dados',
            'sqlite': 'Bancos de Dados',
            'oracle': 'Bancos de Dados',
            'sql': 'Bancos de Dados',
            'nosql': 'Bancos de Dados',

            'aws': 'Cloud e DevOps',
            'azure': 'Cloud e DevOps',
            'docker': 'Cloud e DevOps',
            'kubernetes': 'Cloud e DevOps',
            'jenkins': 'Cloud e DevOps',
            'git': 'Cloud e DevOps',
            'github': 'Cloud e DevOps',
            'gitlab': 'Cloud e DevOps',

            'html': 'Tecnologias Web',
            'css': 'Tecnologias Web',
            'rest': 'Tecnologias Web',
            'api': 'Tecnologias Web',
            'json': 'Tecnologias Web',
            'xml': 'Tecnologias Web',
            'graphql': 'Tecnologias Web',

            'android': 'Mobile',
            'ios': 'Mobile',
            'react native': 'Mobile',
            'flutter': 'Mobile',

            'agile': 'Metodologias e Práticas',
            'scrum': 'Metodologias e Práticas',
            'tdd': 'Metodologias e Práticas',
            'bdd': 'Metodologias e Práticas',
            'devops': 'Metodologias e Práticas',

            'linux': 'Sistemas Operacionais',
            'windows': 'Sistemas Operacionais',
            'ubuntu': 'Sistemas Operacionais',
            'macos': 'Sistemas Operacionais',

            'machine learning': 'Inteligência Artificial',
            'ai': 'Inteligência Artificial',
            'tensorflow': 'Inteligência Artificial'
        };

        // 3. Aplicar categorização e buscar dados completos
        const termosCategorizados = termosFrequentes.map(termo => ({
            termo: termo._id,
            categoria: categorizacao[termo._id.toLowerCase()] || 'Outros',
            frequencia: termo.count
        }));

        // 4. Buscar todos os dados dos termos categorizados
        const termosLista = termosCategorizados.map(t => t.termo);
        const dadosCompletos = await collection.find({
            Termo: { $in: termosLista }
        }).toArray();

        // 5. Agrupar dados por categoria e ano
        const dadosPorCategoriaAno = {};

        dadosCompletos.forEach(doc => {
            const termo = termosCategorizados.find(t => t.termo === doc.Termo);
            if (!termo) return;

            const categoria = termo.categoria;
            const ano = doc.Mensuracao.toString().match(/(\d{4})/)?.[1] || 'N/A';
            const participacao = parseFloat(doc.Participacao) || 0;

            const key = `${categoria}-${ano}`;
            if (!dadosPorCategoriaAno[key]) {
                dadosPorCategoriaAno[key] = {
                    categoria,
                    ano,
                    participacoes: [],
                    termos: new Set()
                };
            }

            dadosPorCategoriaAno[key].participacoes.push(participacao);
            dadosPorCategoriaAno[key].termos.add(doc.Termo);
        });

        // 6. Calcular médias por categoria e ano
        const resultadosAgregados = Object.values(dadosPorCategoriaAno).map(dados => ({
            categoria: dados.categoria,
            ano: dados.ano,
            participacaoMedia: dados.participacoes.reduce((a, b) => a + b, 0) / dados.participacoes.length,
            quantidadeTermos: dados.termos.size
        })).sort((a, b) => {
            if (a.categoria !== b.categoria) return a.categoria.localeCompare(b.categoria);
            return a.ano.localeCompare(b.ano);
        });

        // 7. Gerar HTML da tabela
        const rows = resultadosAgregados.map(dados => `
            <tr>
                <td><span class="categoria-badge categoria-${dados.categoria.toLowerCase().replace(/\s+/g, '-')}">${dados.categoria}</span></td>
                <td class="date-cell">${dados.ano}</td>
                <td><span class="participation">${dados.participacaoMedia.toFixed(2)}%</span></td>
                <td>${dados.quantidadeTermos}</td>
            </tr>
        `).join('\n');

        // 8. Gerar resumo por categoria
        const resumoPorCategoria = {};
        resultadosAgregados.forEach(dados => {
            if (!resumoPorCategoria[dados.categoria]) {
                resumoPorCategoria[dados.categoria] = {
                    participacaoTotal: 0,
                    termosTotal: 0,
                    anos: 0
                };
            }
            resumoPorCategoria[dados.categoria].participacaoTotal += dados.participacaoMedia;
            resumoPorCategoria[dados.categoria].termosTotal += dados.quantidadeTermos;
            resumoPorCategoria[dados.categoria].anos++;
        });

        const resumoCards = Object.entries(resumoPorCategoria).map(([categoria, dados]) => `
            <div class="categoria-card">
                <h4>${categoria}</h4>
                <div class="categoria-stats">
                    <span class="stat-number">${(dados.participacaoTotal / dados.anos).toFixed(1)}%</span>
                    <span class="stat-label">Média Anual</span>
                </div>
                <div class="categoria-stats">
                    <span class="stat-number">${Math.round(dados.termosTotal / dados.anos)}</span>
                    <span class="stat-label">Termos por Ano</span>
                </div>
            </div>
        `).join('\n');

        const template = loadTemplate('categorias-analise.html');
        const html = template
            .replace('{{{ rows }}}', rows)
            .replace('{{{ resumoCards }}}', resumoCards);

        res.send(html);
    } catch (err) {
        console.error('Erro ao buscar dados de categorização:', err);
        res.status(500).send('Erro ao buscar dados de categorização.');
    }
});

// Rota de teste para verificar se o servidor está funcionando
app.get('/teste', (req, res) => {
    res.send('<h1>Servidor funcionando!</h1><p>Teste de conectividade OK</p>');
});

// Rota para criar coleção auxiliar (apenas para demonstração do exercício)
app.get('/criar-colecao-auxiliar', async (req, res) => {
    try {
        // Esta rota demonstra como seria criada a coleção auxiliar
        // Em um cenário real, isso seria feito uma única vez

        // 1. Buscar os 80 termos mais presentes
        const termosFrequentes = await collection.aggregate([
            {
                $group: {
                    _id: "$Termo",
                    count: { $sum: 1 },
                    participacaoMedia: { $avg: { $toDouble: "$Participacao" } }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 80 }
        ]).toArray();

        // 2. Categorização dos termos
        const categorizacao = {
            'javascript': 'Linguagens de Programação',
            'java': 'Linguagens de Programação',
            'python': 'Linguagens de Programação',
            'c': 'Linguagens de Programação',
            'php': 'Linguagens de Programação',
            'typescript': 'Linguagens de Programação',
            // ... (outros termos conforme definido anteriormente)
        };

        // 3. Criar documentos para a coleção auxiliar
        const colecaoAuxiliar = termosFrequentes.map(termo => ({
            termo: termo._id,
            categoria: categorizacao[termo._id.toLowerCase()] || 'Outros',
            frequencia: termo.count,
            participacaoMedia: termo.participacaoMedia,
            criadoEm: new Date()
        }));

        // 4. Inserir na coleção auxiliar (comentado para não duplicar dados)
        // const auxiliarCollection = db.collection('termos_categorizados');
        // await auxiliarCollection.insertMany(colecaoAuxiliar);

        res.json({
            message: `Coleção auxiliar criada com ${colecaoAuxiliar.length} termos categorizados`,
            preview: colecaoAuxiliar.slice(0, 10), // Mostra apenas os primeiros 10
            categorias: [...new Set(colecaoAuxiliar.map(t => t.categoria))]
        });
    } catch (err) {
        console.error('Erro ao criar coleção auxiliar:', err);
        res.status(500).json({ error: 'Erro ao criar coleção auxiliar' });
    }
});

start().catch(err => {
    console.error('Falha ao iniciar:', err);
});
