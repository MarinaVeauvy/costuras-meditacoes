// Adiciona internal links entre artigos do blog para melhorar SEO
// Analisa títulos e palavras-chave e insere links contextuais

const WP_URL = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts';
const WP_AUTH = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');

// Mapa de keywords → artigos para cross-linking
const LINK_KEYWORDS = {
  'chatgpt': { text: 'como usar ChatGPT no seu negócio', slug: 'como-usar-chatgpt-ganhar-dinheiro-guia' },
  'renda extra': { text: 'ideias de renda extra', slug: 'renda-extra-online-melhores-livros-recursos' },
  'investimento': { text: 'investimentos para iniciantes', slug: 'investimento-para-iniciantes-por-onde-comecar-em-2026' },
  'finanças pessoais': { text: 'melhores livros de finanças pessoais', slug: 'melhores-livros-financas-pessoais-2026' },
  'produtividade': { text: 'melhor livro de produtividade', slug: 'melhor-livro-produtividade' },
  'automação': { text: 'ferramentas de automação', slug: 'ferramentas-automacao-empreendedores' },
  'empreendedorismo feminino': { text: 'livros de empreendedorismo para mulheres', slug: 'livros-empreendedorismo-mulheres' },
  'controle financeiro': { text: 'melhores apps de controle financeiro', slug: 'melhores-apps-controle-financeiro-2026' },
  'clt vs pj': { text: 'calculadora CLT vs PJ', url: 'https://marinaveauvy.github.io/costuras-meditacoes/calculadora-clt-pj.html' },
  'cdb': { text: 'simulador CDB vs Poupança', url: 'https://marinaveauvy.github.io/costuras-meditacoes/calculadora-cdb-poupanca.html' },
  'prompts': { text: 'gerador de prompts gratuito', url: 'https://marinaveauvy.github.io/costuras-meditacoes/gerador-prompts.html' },
  'inteligência artificial': { text: 'IA para pequenas empresas', slug: 'inteligencia-artificial-para-pequenas-empresas-por-onde-comecar' },
  'freelancer': { text: 'calculadora freelancer', url: 'https://marinaveauvy.github.io/costuras-meditacoes/calculadora-freelancer.html' },
  'planilha': { text: 'planilha de controle financeiro gratuita', slug: 'planilha-controle-financeiro-pessoal-modelo-gratis-download' },
};

async function getPosts() {
  const res = await fetch(`${WP_URL}?per_page=100&_fields=id,title,content,slug,link`, {
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

function addInternalLinks(post, allPosts) {
  let content = post.content.rendered;
  let linksAdded = 0;
  const postSlug = post.slug;

  for (const [keyword, linkInfo] of Object.entries(LINK_KEYWORDS)) {
    // Não linkar para si mesmo
    if (linkInfo.slug === postSlug) continue;

    const linkUrl = linkInfo.url || `https://wp.marinaveauvy.com.br/${linkInfo.slug}/`;

    // Verificar se já tem esse link
    if (content.includes(linkUrl)) continue;

    // Procurar keyword no texto (fora de tags HTML e links existentes)
    const regex = new RegExp(`(?<![<\\/a-zA-Z"=])\\b(${keyword})\\b(?![^<]*>)(?![^<]*<\\/a>)`, 'i');
    const match = content.match(regex);

    if (match && linksAdded < 3) {
      // Substituir apenas primeira ocorrência
      content = content.replace(regex, `<a href="${linkUrl}" title="${linkInfo.text}">${match[1]}</a>`);
      linksAdded++;
    }
  }

  return { content, linksAdded };
}

async function main() {
  console.log('Analisando artigos para internal linking...\n');

  const posts = await getPosts();
  const validPosts = posts.filter(p => !p.title.rendered.includes('mundo'));

  let totalLinksAdded = 0;
  let postsUpdated = 0;
  const maxUpdates = parseInt(process.env.MAX_UPDATES || '20');

  for (const post of validPosts.slice(0, maxUpdates)) {
    const { content, linksAdded } = addInternalLinks(post, validPosts);

    if (linksAdded > 0) {
      console.log(`  🔗 ${post.title.rendered.substring(0, 50)} — +${linksAdded} links`);

      if (process.env.DRY_RUN !== 'true') {
        await updatePost(post.id, content);
        await new Promise(r => setTimeout(r, 1000));
      }

      totalLinksAdded += linksAdded;
      postsUpdated++;
    }
  }

  console.log(`\n📊 Resultado: ${totalLinksAdded} links adicionados em ${postsUpdated} artigos`);
  if (process.env.DRY_RUN === 'true') {
    console.log('⚠️ DRY_RUN ativo — nada foi alterado. Remova DRY_RUN=true para aplicar.');
  }

  // Verificar sitemap
  console.log('\n🗺️ Verificando sitemap...');
  try {
    const sitemapRes = await fetch('https://wp.marinaveauvy.com.br/sitemap.xml');
    if (sitemapRes.ok) {
      console.log('  ✅ Sitemap XML encontrado em /sitemap.xml');
    } else {
      console.log('  ⚠️ Sitemap não encontrado. Instale Yoast SEO ou Google XML Sitemaps plugin.');
    }
  } catch {
    console.log('  ❌ Erro ao verificar sitemap');
  }

  // Verificar robots.txt
  try {
    const robotsRes = await fetch('https://wp.marinaveauvy.com.br/robots.txt');
    const robotsTxt = await robotsRes.text();
    if (robotsTxt.includes('Sitemap')) {
      console.log('  ✅ robots.txt referencia o sitemap');
    } else {
      console.log('  ⚠️ robots.txt não referencia sitemap — adicione: Sitemap: https://wp.marinaveauvy.com.br/sitemap.xml');
    }
  } catch {
    console.log('  ❌ Erro ao verificar robots.txt');
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
