// Gera Google Web Stories (AMP) a partir dos artigos do blog
// Web Stories aparecem no Google Discover = tráfego mobile massivo
// Cada story tem 5-8 slides visuais com texto curto
// Output: arquivos HTML em /web-stories/ (deploy via GitHub Pages)

const { generate } = require('./ai-provider');
const fs = require('fs');
const path = require('path');

const WP_URL = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts';
const WP_AUTH = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');
const STORIES_DIR = path.join(__dirname, '..', 'web-stories');
const PUBLISHED_FILE = path.join(STORIES_DIR, 'stories-index.json');
const SITE_URL = 'https://marinaveauvy.github.io/costuras-meditacoes';
const BLOG_URL = 'https://wp.marinaveauvy.com.br';

// Brand colors
const COLORS = {
  navy: '#0B0A12',
  gold: '#D4AF37',
  cream: '#F5EDE3',
  coral: '#e94560',
  espresso: '#2C1810',
};

// Unsplash collections for free stock images (finance, business, tech)
const BG_IMAGES = [
  'https://images.unsplash.com/photo-1553729459-uj8ax209b85f?w=720&h=1280&fit=crop', // desk workspace
  'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=720&h=1280&fit=crop', // money coins
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=720&h=1280&fit=crop', // laptop analytics
  'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=720&h=1280&fit=crop', // calculator finance
  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=720&h=1280&fit=crop', // dashboard data
  'https://images.unsplash.com/photo-1586953208448-b95a79798f07?w=720&h=1280&fit=crop', // phone business
  'https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?w=720&h=1280&fit=crop', // AI tech
  'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=720&h=1280&fit=crop', // woman entrepreneur
];

async function getArticles(count = 10) {
  const res = await fetch(`${WP_URL}?per_page=${count}&orderby=date&order=desc&_fields=id,title,link,excerpt,slug`, {
    headers: { Authorization: `Basic ${WP_AUTH}` },
  });
  return res.json();
}

function getPublishedSlugs() {
  if (fs.existsSync(PUBLISHED_FILE)) {
    return new Set(JSON.parse(fs.readFileSync(PUBLISHED_FILE, 'utf8')).map(s => s.slug));
  }
  return new Set();
}

function saveIndex(index) {
  fs.writeFileSync(PUBLISHED_FILE, JSON.stringify(index, null, 2));
}

async function generateStoryContent(article) {
  const title = article.title.rendered;
  const excerpt = article.excerpt.rendered.replace(/<[^>]+>/g, '').substring(0, 300);

  const prompt = `Crie uma Google Web Story sobre este artigo de blog.

ARTIGO: "${title}"
RESUMO: "${excerpt}"

Gere exatamente 6 slides para a Web Story. Cada slide deve ter:
- heading: título curto e impactante (max 40 chars)
- text: texto breve explicativo (max 80 chars)
- cta_text: texto do botão se for o último slide (ex: "Ler Artigo Completo")

Retorne JSON com chave "slides" contendo array de 6 objetos com: heading, text, cta_text (apenas no último slide, null nos outros).

Tom: direto, prático, empoderador. Português pt-BR.`;

  return await generate(prompt, { json: true, maxTokens: 2048 });
}

function buildStoryHTML(article, slides, storyIndex) {
  const title = article.title.rendered.replace(/"/g, '&quot;');
  const slug = article.slug;
  const articleUrl = article.link;
  const storyUrl = `${SITE_URL}/web-stories/${slug}.html`;

  const slidesHTML = slides.map((slide, i) => {
    const bgImg = BG_IMAGES[i % BG_IMAGES.length];
    const isLast = i === slides.length - 1;
    const ctaHTML = isLast ? `
      <amp-story-cta-layer>
        <a href="${articleUrl}" class="cta-btn">${slide.cta_text || 'Ler Artigo Completo'}</a>
      </amp-story-cta-layer>` : '';

    return `
    <amp-story-page id="slide-${i + 1}">
      <amp-story-grid-layer template="fill">
        <amp-img src="${bgImg}" width="720" height="1280" layout="fill" alt="${slide.heading}"></amp-img>
      </amp-story-grid-layer>
      <amp-story-grid-layer template="vertical" class="overlay">
        <div class="slide-content">
          <h2 class="slide-heading">${slide.heading}</h2>
          <p class="slide-text">${slide.text}</p>
        </div>
      </amp-story-grid-layer>${ctaHTML}
    </amp-story-page>`;
  }).join('\n');

  return `<!doctype html>
<html amp lang="pt-BR">
<head>
  <meta charset="utf-8">
  <script async src="https://cdn.ampproject.org/v0.js"></script>
  <script async custom-element="amp-story" src="https://cdn.ampproject.org/v0/amp-story-1.0.js"></script>
  <title>${title}</title>
  <link rel="canonical" href="${storyUrl}">
  <meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1">
  <link rel="amphtml" href="${storyUrl}">
  <style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style><noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;animation:none}</style></noscript>
  <style amp-custom>
    .overlay { background: linear-gradient(0deg, rgba(11,10,18,0.85) 0%, rgba(11,10,18,0.4) 50%, rgba(11,10,18,0.2) 100%); }
    .slide-content { display: flex; flex-direction: column; justify-content: flex-end; padding: 32px 24px; height: 100%; }
    .slide-heading { font-family: sans-serif; font-size: 28px; font-weight: 700; color: #F5EDE3; margin-bottom: 12px; line-height: 1.2; }
    .slide-text { font-family: sans-serif; font-size: 18px; color: rgba(245,237,227,0.85); line-height: 1.5; margin-bottom: 16px; }
    .cta-btn { display: inline-block; background: ${COLORS.gold}; color: ${COLORS.navy}; padding: 14px 32px; border-radius: 24px; text-decoration: none; font-weight: 700; font-size: 16px; text-align: center; }
  </style>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${title}",
    "author": {"@type": "Person", "name": "Marina Veauvy"},
    "publisher": {"@type": "Organization", "name": "Marina Veauvy", "logo": {"@type": "ImageObject", "url": "${SITE_URL}/logo.png"}},
    "mainEntityOfPage": "${articleUrl}"
  }
  </script>
</head>
<body>
  <amp-story standalone
    title="${title}"
    publisher="Marina Veauvy"
    publisher-logo-src="${SITE_URL}/logo-96.png"
    poster-portrait-src="${BG_IMAGES[storyIndex % BG_IMAGES.length]}">
${slidesHTML}
  </amp-story>
</body>
</html>`;
}

async function main() {
  // Ensure output dir exists
  if (!fs.existsSync(STORIES_DIR)) fs.mkdirSync(STORIES_DIR, { recursive: true });

  const maxStories = parseInt(process.env.STORY_COUNT || '5');
  console.log(`Gerando até ${maxStories} Web Stories...\n`);

  const articles = await getArticles(20);
  const published = getPublishedSlugs();

  // Filter articles that don't have stories yet, skip calculators/simulators
  const candidates = articles.filter(a =>
    !published.has(a.slug) &&
    !a.slug.includes('salario-') &&
    !a.slug.includes('quanto-rende-') &&
    !a.slug.includes('calculadora-') &&
    !a.slug.includes('simulador-') &&
    !a.title.rendered.includes('mundo')
  );

  const toGenerate = candidates.slice(0, maxStories);
  console.log(`${articles.length} artigos | ${published.size} stories existentes | ${toGenerate.length} a gerar\n`);

  if (toGenerate.length === 0) {
    console.log('✅ Todos os artigos elegíveis já têm Web Story!');
    process.exit(0);
  }

  // Load existing index
  let index = [];
  if (fs.existsSync(PUBLISHED_FILE)) {
    index = JSON.parse(fs.readFileSync(PUBLISHED_FILE, 'utf8'));
  }

  let created = 0;
  for (const article of toGenerate) {
    console.log(`📖 ${article.title.rendered.substring(0, 50)}...`);
    try {
      const result = await generateStoryContent(article);
      const slides = result.slides || result;

      if (!Array.isArray(slides) || slides.length < 3) {
        console.log('  ⚠️ Slides insuficientes, pulando');
        continue;
      }

      const html = buildStoryHTML(article, slides, created);
      const filePath = path.join(STORIES_DIR, `${article.slug}.html`);
      fs.writeFileSync(filePath, html);

      index.push({
        slug: article.slug,
        title: article.title.rendered,
        article_url: article.link,
        story_url: `${SITE_URL}/web-stories/${article.slug}.html`,
        created_at: new Date().toISOString(),
      });

      created++;
      console.log(`  ✅ Web Story criada: /web-stories/${article.slug}.html`);
    } catch (err) {
      console.error(`  ❌ Erro: ${err.message}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 2000));
  }

  saveIndex(index);
  console.log(`\n📊 ${created} Web Stories criadas`);
  console.log(`📁 Total: ${index.length} stories em /web-stories/`);
  console.log('\nPara indexar no Google:');
  console.log('1. Deploy via GitHub Pages (git push)');
  console.log('2. Submeta o sitemap em Google Search Console');
  console.log('3. Stories aparecem no Google Discover automaticamente');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
