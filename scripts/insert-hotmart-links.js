// Insere links de afiliados Hotmart nos artigos do WordPress
// Mapeia keywords → links de afiliados e insere naturalmente no conteúdo
// Requer: HOTMART_LINKS env var (JSON) ou editar AFFILIATE_LINKS abaixo

const WP_URL = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts';
const WP_AUTH = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');

// ============================================================
// CONFIGURE SEUS LINKS AQUI (ou via env HOTMART_LINKS)
// Formato: keyword → { text: texto âncora, url: link hotmart, category: tema }
// ============================================================
const DEFAULT_LINKS = {
  'finanças pessoais': {
    text: 'curso completo de finanças pessoais',
    url: 'https://go.hotmart.com/XXXXX', // SUBSTITUIR
    category: 'financas',
  },
  'chatgpt': {
    text: 'curso prático de ChatGPT para negócios',
    url: 'https://go.hotmart.com/XXXXX', // SUBSTITUIR
    category: 'ia',
  },
  'renda extra': {
    text: 'método comprovado de renda extra online',
    url: 'https://go.hotmart.com/XXXXX', // SUBSTITUIR
    category: 'renda',
  },
  'investimento': {
    text: 'curso de investimentos para iniciantes',
    url: 'https://go.hotmart.com/XXXXX', // SUBSTITUIR
    category: 'investimento',
  },
  'empreendedorismo': {
    text: 'treinamento de empreendedorismo digital',
    url: 'https://go.hotmart.com/XXXXX', // SUBSTITUIR
    category: 'empreendedorismo',
  },
};

function getLinks() {
  if (process.env.HOTMART_LINKS) {
    try { return JSON.parse(process.env.HOTMART_LINKS); } catch {}
  }
  return DEFAULT_LINKS;
}

async function getPosts() {
  const res = await fetch(`${WP_URL}?per_page=100&_fields=id,title,content,slug`, {
    headers: { Authorization: `Basic ${WP_AUTH}` },
  });
  return res.json();
}

async function updatePost(id, content) {
  const res = await fetch(`${WP_URL}/${id}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${WP_AUTH}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  return res.json();
}

function insertAffiliateLinks(post, links) {
  let content = post.content.rendered;
  let inserted = 0;

  for (const [keyword, linkInfo] of Object.entries(links)) {
    // Não inserir link placeholder
    if (linkInfo.url.includes('XXXXX')) continue;

    // Já tem esse link?
    if (content.includes(linkInfo.url)) continue;

    // Já tem hotmart link?
    if (content.includes('go.hotmart.com') && inserted >= 1) continue;

    // Procurar posição boa para inserir (após um </p> no meio do artigo)
    const paragraphs = content.split('</p>');
    if (paragraphs.length < 4) continue;

    // Inserir CTA box após o 3o parágrafo
    const insertAt = Math.floor(paragraphs.length * 0.4); // ~40% do artigo
    const ctaBox = `
<div style="background:linear-gradient(135deg,#f8f4ff,#fff5f5);border-left:4px solid #7c3aed;padding:20px 24px;margin:24px 0;border-radius:0 12px 12px 0;">
<p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#7c3aed;">💡 Recomendação</p>
<p style="margin:0;font-size:15px;line-height:1.6;">Se você quer se aprofundar neste tema, conheça o <a href="${linkInfo.url}" target="_blank" rel="noopener sponsored" style="color:#7c3aed;font-weight:700;">${linkInfo.text}</a>. Milhares de alunas já transformaram seus resultados.</p>
</div>`;

    paragraphs[insertAt] += ctaBox;
    content = paragraphs.join('</p>');
    inserted++;
  }

  return { content, inserted };
}

async function main() {
  const links = getLinks();

  // Verificar se tem links reais configurados
  const realLinks = Object.values(links).filter(l => !l.url.includes('XXXXX'));
  if (realLinks.length === 0) {
    console.log('⚠️ Nenhum link Hotmart configurado.');
    console.log('Edite o arquivo e substitua os XXXXX pelos seus links.');
    console.log('Ou configure via env: HOTMART_LINKS=\'{"keyword":{"text":"...","url":"https://go.hotmart.com/ABC123","category":"..."}}\' ');
    process.exit(0);
  }

  console.log(`${realLinks.length} links de afiliados configurados\n`);

  const posts = await getPosts();
  const validPosts = posts.filter(p => !p.title.rendered.includes('mundo'));

  const maxUpdates = parseInt(process.env.MAX_UPDATES || '100');
  let totalInserted = 0;
  let postsUpdated = 0;

  for (const post of validPosts.slice(0, maxUpdates)) {
    const { content, inserted } = insertAffiliateLinks(post, links);

    if (inserted > 0) {
      console.log(`  💰 ${post.title.rendered.substring(0, 50)} — +${inserted} Hotmart link(s)`);

      if (process.env.DRY_RUN !== 'true') {
        await updatePost(post.id, content);
        await new Promise(r => setTimeout(r, 1000));
      }

      totalInserted += inserted;
      postsUpdated++;
    }
  }

  console.log(`\n📊 Resultado: ${totalInserted} links Hotmart inseridos em ${postsUpdated} artigos`);
  if (process.env.DRY_RUN === 'true') {
    console.log('⚠️ DRY_RUN ativo — nada alterado.');
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
