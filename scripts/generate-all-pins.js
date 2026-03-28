// Gera pins para TODOS os artigos do blog que ainda não têm pin
// Lê pinterest-pins.json existente e adiciona novos pins sem duplicar

const fs = require('fs');
const path = require('path');

const { generate } = require('./ai-provider');
const WP_URL = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts';
const WP_AUTH = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');
const PINS_FILE = path.join(__dirname, '..', 'pinterest-pins.json');

const BOARDS_MAP = {
  'clt': 'CLT vs PJ — Simulador',
  'pj': 'CLT vs PJ — Simulador',
  'cdb': 'Investimentos e Rendimentos',
  'poupanca': 'Investimentos e Rendimentos',
  'investimento': 'Investimentos e Rendimentos',
  'investir': 'Investimentos e Rendimentos',
  'tesouro': 'Investimentos e Rendimentos',
  'renda extra': 'Renda Extra e Trabalho Online',
  'freelanc': 'Renda Extra e Trabalho Online',
  'ganhar dinheiro': 'Renda Extra e Trabalho Online',
  'chatgpt': 'Inteligência Artificial para Negócios',
  'ia': 'Inteligência Artificial para Negócios',
  'inteligencia artificial': 'Inteligência Artificial para Negócios',
  'inteligência artificial': 'Inteligência Artificial para Negócios',
  'prompts': 'Inteligência Artificial para Negócios',
  'gemini': 'Inteligência Artificial para Negócios',
  'automação': 'Produtividade e Automação',
  'automatizar': 'Produtividade e Automação',
  'zapier': 'Produtividade e Automação',
  'notion': 'Produtividade e Automação',
  'produtividade': 'Produtividade e Automação',
  'livro': 'Livros Recomendados',
  'resenha': 'Livros Recomendados',
  'empreendedorismo': 'Empreendedorismo Feminino',
  'empreendedora': 'Empreendedorismo Feminino',
  'negócio': 'Empreendedorismo Feminino',
  'financeiro': 'Finanças Pessoais',
  'financeira': 'Finanças Pessoais',
  'finanças': 'Finanças Pessoais',
  'orçamento': 'Finanças Pessoais',
  'planilha': 'Finanças Pessoais',
  'mei': 'Empreendedorismo Feminino',
  'canva': 'Renda Extra e Trabalho Online',
  'template': 'Renda Extra e Trabalho Online',
  'newsletter': 'Marketing Digital',
  'marketing': 'Marketing Digital',
  'instagram': 'Marketing Digital',
  'funil': 'Marketing Digital',
  'chatbot': 'Inteligência Artificial para Negócios',
  'whatsapp': 'Inteligência Artificial para Negócios',
  'app': 'Ferramentas e Apps Úteis',
  'ferramenta': 'Ferramentas e Apps Úteis',
  'notebook': 'Ferramentas e Apps Úteis',
};

function guessBoard(title) {
  const lower = title.toLowerCase();
  for (const [keyword, board] of Object.entries(BOARDS_MAP)) {
    if (lower.includes(keyword)) return board;
  }
  return 'Dicas de Finanças e Negócios';
}

async function getArticles() {
  const res = await fetch(`${WP_URL}?per_page=100&_fields=id,title,link,excerpt`, {
    headers: { Authorization: `Basic ${WP_AUTH}` },
  });
  return res.json();
}

async function generatePinBatch(articles) {
  const articlesText = articles.map((a, i) =>
    `${i + 1}. Título: "${a.title.rendered}" | URL: ${a.link}`
  ).join('\n');

  const prompt = `Gere metadados de Pinterest pins para estes artigos de blog. Para cada um, crie um pin atraente.

ARTIGOS:
${articlesText}

Para CADA artigo, retorne:
- pin_title: título chamativo para Pinterest (max 100 chars, pt-BR)
- description: descrição otimizada com keywords e 3-5 hashtags no final (max 500 chars, pt-BR)
- alt_text: texto alternativo para acessibilidade

Retorne um JSON com chave "pins" contendo array de objetos com: article_index (1-based), pin_title, description, alt_text`;

  const result = await generate(prompt, { json: true, maxTokens: 8192 });
  return result.pins || result;
}

async function main() {
  console.log('Buscando artigos do blog...');
  const articles = await getArticles();

  // Filtrar "Olá, mundo!" e duplicatas
  const validArticles = articles.filter(a =>
    !a.title.rendered.includes('mundo') &&
    a.link.includes('wp.marinaveauvy.com.br')
  );

  // Carregar pins existentes
  let existingPins = [];
  if (fs.existsSync(PINS_FILE)) {
    existingPins = JSON.parse(fs.readFileSync(PINS_FILE, 'utf8'));
  }
  const existingUrls = new Set(existingPins.map(p => p.article_url));

  // Filtrar artigos sem pin
  const needsPins = validArticles.filter(a => !existingUrls.has(a.link));
  console.log(`📊 ${validArticles.length} artigos | ${existingPins.length} pins existentes | ${needsPins.length} precisam de pin`);

  if (needsPins.length === 0) {
    console.log('✅ Todos os artigos já têm pins!');
    process.exit(0);
  }

  // Processar em batches de 10
  const batchSize = 10;
  const newPins = [];

  for (let i = 0; i < needsPins.length; i += batchSize) {
    const batch = needsPins.slice(i, i + batchSize);
    console.log(`\n📦 Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} artigos`);

    try {
      const results = await generatePinBatch(batch);
      for (const result of results) {
        const article = batch[result.article_index - 1];
        if (!article) continue;

        const pin = {
          article_url: article.link,
          article_title: article.title.rendered,
          pin_title: result.pin_title,
          description: result.description,
          board: guessBoard(article.title.rendered),
          alt_text: result.alt_text,
        };
        newPins.push(pin);
        console.log(`  📌 ${pin.pin_title.substring(0, 50)}...`);
      }
    } catch (err) {
      console.error(`  ❌ Erro no batch: ${err.message}`);
    }

    // Rate limit entre batches
    if (i + batchSize < needsPins.length) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // Merge e salvar
  const allPins = [...existingPins, ...newPins];
  fs.writeFileSync(PINS_FILE, JSON.stringify(allPins, null, 2));
  console.log(`\n📊 Resultado: ${newPins.length} novos pins gerados`);
  console.log(`📁 Total: ${allPins.length} pins em pinterest-pins.json`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
