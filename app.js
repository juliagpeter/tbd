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

const tecnologiasNoTi = [
    'javascript',
    'php',
    'sql',
    'typescript',
    'nosql',
    'c'
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

        const template = loadTemplate('listagem.html');
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
            Termo: { $in: tecnologiasNoTi }
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

start().catch(err => {
    console.error('Falha ao iniciar:', err);
});
