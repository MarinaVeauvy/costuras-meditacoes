// LinkedIn Articles Syndication
// Republica artigos do WordPress como LinkedIn Articles
// Usa canonical URL para evitar penalidade SEO (mesmo que Medium)
// Requer: LINKEDIN_ACCESS_TOKEN (OAuth2)
// Se não tem token, gera versão texto para copiar e colar manualmente

const { generate } = require('./ai-provider');
const fs = require('fs');
const path = require('path');

const WP_URL = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts';
const WP_AUTH = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');
const LINKEDIN_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;
const LINKEDIN_URN = process.env.LINKEDIN_AUTHOR_URN;
const OUTPUT_DIR = path.join(__dirname, '..', 'linkedin');
const INDEX_FILE = path.join(OUTPUT_DIR, 'articles-index.json');

async function getArticles(count = 10) {
  const res = await fetch(`${WP_URL}?per_page=${count}&orderby=date&order=desc&_fields=id,title,link,excerpt,content,slug`, {
    headers: { Authorization: `Basic ${WP_AUTH}` },
  });
  return res.json();
}

function getProcessedSlugs() {
  if (fs.existsSync(INDEX_FILE)) {
    return new Set(JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')).map(a => a.slug));
  }
  return new Set();
}

async function adaptForLinkedIn(article) {
  const title = article.title.rendered;
  const content = article.content.rendered.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 2000);

  const prompt = `Adapte este artigo de blog para um post no LinkedIn (artigo longo).

TÍTULO ORIGINAL: "${title}"
CONTEÚDO (resumo): "${content.substring(0, 1000)}"

REQUISITOS:
- Título adaptado para LinkedIn (profissional, instigante)
- Introdução com hook pessoal (1-2 frases sobre experiência)
- 3-4 seções com insights práticos
- Tom: profissional mas acessível, como uma mentora
- Incluir pergunta no final para gerar engajamento
- Máximo 1500 palavras
- Incluir "📌 Salve este post para consultar depois"
- Último parágrafo: CTA sutil para o artigo completo
- Português pt-BR

Retorne JSON com:
- linkedin_title: título para LinkedIn
- linkedin_content: conteúdo formatado (texto simples com \\n para quebras de linha, sem HTML)
- hashtags: array de 3-5 hashtags relevantes`;

  return await generate(prompt, { json: true, maxTokens: 4096 });
}

async function publishToLinkedIn(title, content, articleUrl) {
  if (!LINKEDIN_TOKEN || !LINKEDIN_URN) return null;

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LINKEDIN_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: LINKEDIN_URN,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'ARTICLE',
          media: [{
            status: 'READY',
            originalUrl: articleUrl,
            title: { text: title },
          }],
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });

  return res.json();
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const maxArticles = parseInt(process.env.LINKEDIN_COUNT || '5');
  console.log(`💼 Gerando até ${maxArticles} artigos LinkedIn...\n`);

  const articles = await getArticles(20);
  const processed = getProcessedSlugs();

  const candidates = articles.filter(a =>
    !processed.has(a.slug) &&
    !a.slug.includes('salario-') &&
    !a.slug.includes('quanto-rende-') &&
    !a.slug.includes('calculadora-') &&
    !a.slug.includes('simulador-') &&
    !a.title.rendered.includes('mundo')
  );

  const toGenerate = candidates.slice(0, maxArticles);
  console.log(`${candidates.length} elegíveis | ${processed.size} já processados | ${toGenerate.length} a gerar\n`);

  let index = [];
  if (fs.existsSync(INDEX_FILE)) {
    index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  }

  let created = 0;
  for (const article of toGenerate) {
    console.log(`💼 ${article.title.rendered.substring(0, 50)}...`);
    try {
      const adapted = await adaptForLinkedIn(article);

      // Salvar artigo adaptado
      const filePath = path.join(OUTPUT_DIR, `${article.slug}.json`);
      fs.writeFileSync(filePath, JSON.stringify({
        article_url: article.link,
        original_title: article.title.rendered,
        ...adapted,
        generated_at: new Date().toISOString(),
      }, null, 2));

      // Salvar versão texto para copiar e colar
      const textPath = path.join(OUTPUT_DIR, `${article.slug}.txt`);
      const hashtags = (adapted.hashtags || []).map(h => h.startsWith('#') ? h : '#' + h).join(' ');
      fs.writeFileSync(textPath, `${adapted.linkedin_title}\n\n${adapted.linkedin_content}\n\n${hashtags}\n\n🔗 Artigo completo: ${article.link}`);

      // Publicar se tiver token
      if (LINKEDIN_TOKEN && LINKEDIN_URN) {
        const result = await publishToLinkedIn(
          adapted.linkedin_title,
          adapted.linkedin_content + '\n\n' + hashtags,
          article.link
        );
        console.log(`  ✅ Publicado no LinkedIn: ${result?.id || 'ok'}`);
      } else {
        console.log(`  ✅ Salvo (sem token LinkedIn — publicar manualmente via .txt)`);
      }

      index.push({
        slug: article.slug,
        title: adapted.linkedin_title,
        article_url: article.link,
        published: !!LINKEDIN_TOKEN,
        created_at: new Date().toISOString(),
      });

      created++;
    } catch (err) {
      console.error(`  ❌ Erro: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`\n📊 ${created} artigos LinkedIn gerados`);
  console.log(`📁 Total: ${index.length} em /linkedin/`);

  if (!LINKEDIN_TOKEN) {
    console.log('\n⚠️ LINKEDIN_ACCESS_TOKEN não configurado.');
    console.log('Os artigos foram salvos como .txt — copie e publique manualmente.');
    console.log('Para automatizar: configure OAuth2 LinkedIn com escopo w_member_social');
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
