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

start().catch(err => {
    console.error('Falha ao iniciar:', err);
});
