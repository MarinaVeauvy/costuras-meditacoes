// Adiciona Pinterest Rich Pin meta tags (Open Graph) aos artigos do WordPress
// Rich Pins mostram título, descrição e preço automaticamente no Pinterest
// Requer: Validar em https://developers.pinterest.com/tools/url-debugger/

const WP_URL = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2';
const WP_AUTH = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');
const SITE_NAME = 'Marina Veauvy';

async function getPosts() {
  const res = await fetch(`${WP_URL}/posts?per_page=100&_fields=id,title,link,excerpt,content,yoast_head`, {
    headers: { Authorization: `Basic ${WP_AUTH}` },
  });
  return res.json();
}

async function checkOGTags(url) {
  try {
    const res = await fetch(url);
    const html = await res.text();
    const hasOG = html.includes('og:title') && html.includes('og:image');
    const hasPinterest = html.includes('pinterest') || html.includes('pin:');
    return { hasOG, hasPinterest, html };
  } catch {
    return { hasOG: false, hasPinterest: false, html: '' };
  }
}

async function main() {
  console.log('Verificando Rich Pin meta tags nos artigos...\n');

  const posts = await getPosts();
  let withOG = 0;
  let withoutOG = 0;
  const issues = [];

  for (const post of posts.slice(0, 30)) {
    const title = post.title.rendered;
    const { hasOG } = await checkOGTags(post.link);

    if (hasOG) {
      withOG++;
      console.log(`  ✅ ${title.substring(0, 50)}`);
    } else {
      withoutOG++;
      issues.push(post);
      console.log(`  ❌ ${title.substring(0, 50)} — SEM og:tags`);
    }
  }

  console.log(`\n📊 Resultado: ${withOG} com OG tags | ${withoutOG} sem OG tags`);

  if (withoutOG > 0) {
    console.log('\n🔧 SOLUÇÃO: Instale o plugin Yoast SEO ou RankMath no WordPress.');
    console.log('   Ambos adicionam automaticamente og:title, og:description, og:image a todos os posts.');
    console.log('   Após instalar, valide em: https://developers.pinterest.com/tools/url-debugger/');
  }

  if (withOG > 0) {
    console.log('\n✅ Artigos com OG tags já são elegíveis para Rich Pins!');
    console.log('   Valide em: https://developers.pinterest.com/tools/url-debugger/');
    console.log(`   Teste com: ${posts[0].link}`);
  }

  // Verificar se existe tag do Pinterest no site
  const homeCheck = await checkOGTags('https://wp.marinaveauvy.com.br');
  if (!homeCheck.html.includes('p:domain_verify')) {
    console.log('\n⚠️  Pinterest domain verification tag não encontrada.');
    console.log('   Adicione ao <head> do tema WordPress:');
    console.log('   <meta name="p:domain_verify" content="SEU_CODIGO_PINTEREST"/>');
    console.log('   Encontre o código em: Pinterest Business > Settings > Claimed Accounts');
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
