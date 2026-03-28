// Twitter/X Thread Generator
// Transforma artigos do blog em threads para Twitter
// Output: /twitter/ com threads prontas para publicar

const { generate } = require('./ai-provider');
const fs = require('fs');
const path = require('path');

const WP_URL = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts';
const WP_AUTH = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');
const OUTPUT_DIR = path.join(__dirname, '..', 'twitter');
const INDEX_FILE = path.join(OUTPUT_DIR, 'threads-index.json');
const SITE = 'https://marinaveauvy.github.io/costuras-meditacoes';

async function getArticles(count = 20) {
  const res = await fetch(`${WP_URL}?per_page=${count}&orderby=date&order=desc&_fields=id,title,link,excerpt,slug`, {
    headers: { Authorization: `Basic ${WP_AUTH}` },
  });
  return res.json();
}

function getProcessedSlugs() {
  if (fs.existsSync(INDEX_FILE)) {
    return new Set(JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')).map(t => t.slug));
  }
  return new Set();
}

async function generateThread(article) {
  const title = article.title.rendered;
  const excerpt = article.excerpt.rendered.replace(/<[^>]+>/g, '').substring(0, 300);

  const prompt = `Crie uma thread para Twitter/X baseada neste artigo de blog.

ARTIGO: "${title}"
RESUMO: "${excerpt}"
LINK: ${article.link}

REGRAS:
- Thread com 6-8 tweets
- Cada tweet: máximo 280 caracteres
- Tweet 1: hook forte que gera curiosidade (terminar com "🧵👇")
- Tweets 2-6: conteúdo valioso, dicas práticas, dados
- Penúltimo tweet: CTA para o artigo completo com link
- Último tweet: pedir retweet e seguir
- Tom: direto, prático, empoderador
- Usar emojis com moderação (1-2 por tweet)
- Português pt-BR
- Não usar hashtags nos tweets do meio, apenas no último (máx 3)

Retorne JSON com chave "tweets" contendo array de strings (cada string é um tweet).`;

  return await generate(prompt, { json: true, maxTokens: 2048 });
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const maxThreads = parseInt(process.env.THREAD_COUNT || '10');
  console.log(`🐦 Gerando até ${maxThreads} threads...\n`);

  const articles = await getArticles(30);
  const processed = getProcessedSlugs();

  const candidates = articles.filter(a =>
    !processed.has(a.slug) &&
    !a.slug.includes('salario-') &&
    !a.slug.includes('quanto-rende-') &&
    !a.title.rendered.includes('mundo')
  );

  const toGenerate = candidates.slice(0, maxThreads);
  console.log(`${candidates.length} elegíveis | ${processed.size} já gerados | ${toGenerate.length} a gerar\n`);

  let index = [];
  if (fs.existsSync(INDEX_FILE)) {
    index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  }

  let created = 0;
  for (const article of toGenerate) {
    console.log(`🐦 ${article.title.rendered.substring(0, 50)}...`);
    try {
      const result = await generateThread(article);
      const tweets = result.tweets || result;

      if (!Array.isArray(tweets) || tweets.length < 3) {
        console.log('  ⚠️ Tweets insuficientes');
        continue;
      }

      // Salvar thread
      const threadPath = path.join(OUTPUT_DIR, `${article.slug}.json`);
      fs.writeFileSync(threadPath, JSON.stringify({
        article_url: article.link,
        article_title: article.title.rendered,
        tweets,
        tweet_count: tweets.length,
        generated_at: new Date().toISOString(),
      }, null, 2));

      // Salvar versão texto (para copiar e colar)
      const textPath = path.join(OUTPUT_DIR, `${article.slug}.txt`);
      const text = tweets.map((t, i) => `[${i + 1}/${tweets.length}]\n${t}`).join('\n\n---\n\n');
      fs.writeFileSync(textPath, text);

      index.push({
        slug: article.slug,
        title: article.title.rendered,
        article_url: article.link,
        tweet_count: tweets.length,
        hook: tweets[0].substring(0, 100),
        created_at: new Date().toISOString(),
      });

      created++;
      console.log(`  ✅ ${tweets.length} tweets gerados`);
    } catch (err) {
      console.error(`  ❌ Erro: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`\n📊 ${created} threads geradas`);
  console.log(`📁 Total: ${index.length} threads em /twitter/`);
  console.log('\nPara publicar:');
  console.log('1. Abra os arquivos .txt e copie cada tweet');
  console.log('2. Ou use a Twitter API para publicar automaticamente');
  console.log('3. Publique 1-2 threads por dia para máximo alcance');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
