// Gera e publica artigos SEO no WordPress via AI (OpenAI primary, Gemini fallback)
const { generate } = require('./ai-provider');
const WP_USER = process.env.WP_USER;
const WP_PASS = process.env.WP_PASS;
const WP_URL = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts';
const AMAZON_TAG = 'marinaveauv04-20';

const TOPICS = [
  'IA para pequenos negócios',
  'finanças pessoais para mulheres empreendedoras',
  'renda extra com habilidades digitais',
  'produtividade com inteligência artificial',
  'como automatizar tarefas repetitivas',
  'investimentos para iniciantes',
  'marketing digital com IA',
  'como criar produtos digitais',
  'economia doméstica inteligente',
  'ferramentas gratuitas de IA',
  'como ganhar dinheiro na internet',
  'planejamento financeiro pessoal',
  'ChatGPT para empreendedores',
  'como sair das dívidas',
  'freelancing para iniciantes',
  'automação de redes sociais',
  'como criar uma renda passiva',
  'IA para criação de conteúdo',
  'educação financeira prática',
  'como monetizar conhecimento online',
  'como organizar finanças de casal',
  'melhores investimentos de renda fixa em 2026',
  'como precificar serviços como freelancer',
  'IA para criação de cursos online',
  'como montar um negócio com IA',
  'dicas de economia para famílias',
  'como criar um canal no YouTube com IA',
  'ferramentas de IA para designers',
  'como fazer orçamento pessoal do zero',
  'empreendedorismo digital para mães',
  'como vender no Instagram com IA',
  'melhores investimentos para autônomos',
  'como usar IA para atendimento ao cliente',
  'planejamento financeiro para aposentadoria',
  'como criar um podcast com ferramentas de IA',
  'melhores formas de monetizar um blog',
  'como economizar em compras online',
  'IA para pequenas lojas e e-commerce',
  'como investir em ações pela primeira vez',
  'como construir múltiplas fontes de renda',
];

async function getExistingTitles() {
  const auth = Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
  const res = await fetch(`${WP_URL}?per_page=100&_fields=title`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const posts = await res.json();
  return posts.map(p => p.title.rendered.toLowerCase());
}

async function generateArticle(topic, existingTitles) {
  const prompt = `Você é um redator SEO brasileiro especialista. Gere um artigo completo para blog.

TEMA: ${topic}
PÚBLICO: Mulheres empreendedoras brasileiras, 30-50 anos
IDIOMA: Português (pt-BR) com acentuação correta

TÍTULOS JÁ EXISTENTES (NÃO repetir):
${existingTitles.slice(0, 20).join('\n')}

REQUISITOS:
- Título SEO otimizado (long-tail keyword, 50-65 caracteres)
- Meta description (150-160 caracteres)
- 1000-1500 palavras
- HTML formatado (H2, H3, listas, parágrafos)
- 5-7 seções com headings H2
- Dicas práticas e acionáveis
- Tom: acessível, empoderador, prático
- Incluir 2-3 links afiliados Amazon naturalmente: use o formato https://www.amazon.com.br/dp/{ASIN}?tag=${AMAZON_TAG}
  - Use estes ASINs REAIS: B07H3GFRKY (Pai Rico Pai Pobre), B08WWKX47Z (Hábitos Atômicos), B07QFZ9C4N (A Psicologia Financeira), B07QFDC4N7 (Mindset), B07QG1W5SW (Comece pelo Porquê), B09HQYR4BN (O Homem Mais Rico da Babilônia), B07C7KRSXG (Segredos da Mente Milionária), B0F1Y3QKQ7 (Costuras da Abundância - Marina Veauvy)
  - Escolha os mais relevantes ao tema do artigo
- Incluir ao final uma seção "Leitura Recomendada" com 2-3 livros afiliados
- Incluir um CTA para produtos digitais: https://marinaveauvy.github.io/costuras-meditacoes/produtos-digitais.html
- NÃO incluir tags <html>, <head>, <body> — apenas o conteúdo do artigo

FORMATO DE RESPOSTA (JSON):
{
  "title": "Título do Artigo",
  "excerpt": "Meta description aqui",
  "content": "<h2>Primeira seção</h2><p>Conteúdo...</p>"
}

Responda APENAS o JSON, sem markdown, sem code blocks.`;

  return await generate(prompt, { json: true, maxTokens: 8192 });
}

async function publishArticle(article) {
  const auth = Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
  const res = await fetch(WP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      status: 'publish',
    }),
  });

  const data = await res.json();
  if (data.id) {
    console.log(`✅ Publicado: "${article.title}" (ID: ${data.id})`);
    return data.id;
  } else {
    console.error('❌ Erro ao publicar:', JSON.stringify(data).substring(0, 200));
    return null;
  }
}

async function main() {
  const count = parseInt(process.env.ARTICLE_COUNT || '2');
  console.log(`Gerando ${count} artigo(s)...`);

  const existingTitles = await getExistingTitles();
  console.log(`${existingTitles.length} artigos existentes no blog`);

  const usedTopics = new Set();
  let published = 0;

  for (let i = 0; i < count; i++) {
    // Escolher topic aleatório não usado
    const available = TOPICS.filter(t => !usedTopics.has(t));
    const topic = available[Math.floor(Math.random() * available.length)];
    usedTopics.add(topic);

    console.log(`\n[${i + 1}/${count}] Tema: ${topic}`);

    try {
      const article = await generateArticle(topic, existingTitles);
      const id = await publishArticle(article);
      if (id) {
        published++;
        existingTitles.push(article.title.toLowerCase());
      }
    } catch (err) {
      console.error(`❌ Erro: ${err.message}`);
    }

    // Rate limit
    if (i < count - 1) await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`\n📊 Resultado: ${published}/${count} artigos publicados`);

  // Enviar push notification do último artigo publicado
  if (published > 0 && process.env.ONESIGNAL_APP_ID) {
    try {
      const { pushLatestArticle } = require('./setup-push-notifications');
      await pushLatestArticle();
    } catch (err) {
      console.log(`⚠️ Push notification pulada: ${err.message}`);
    }
  }
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
