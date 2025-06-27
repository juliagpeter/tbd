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

// Grupos de tecnologias concorrentes
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

start().catch(err => {
    console.error('Falha ao iniciar:', err);
});
