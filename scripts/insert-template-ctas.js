// Insere CTAs dos Notion Templates pagos nos artigos do blog
// Adiciona um box CTA elegante no final de artigos relevantes

const WP_URL = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts';
const WP_AUTH = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');
const SITE = 'https://marinaveauvy.github.io/costuras-meditacoes';

const TEMPLATES = {
  financeiro: {
    url: 'https://payment.ticto.app/O93AF2A6D',
    landing: `${SITE}/template-financeiro-pessoal.html`,
    title: 'Dashboard Financeiro Pessoal',
    price: 'R$27',
    keywords: ['finanç', 'investiment', 'orçamento', 'economiz', 'dívida', 'reserva', 'cdb', 'poupanç', 'tesouro', 'renda fixa', 'controle financeiro', 'planilha', 'gastos'],
  },
  empreendedora: {
    url: 'https://payment.ticto.app/OEB5D91EE',
    landing: `${SITE}/template-empreendedora.html`,
    title: 'Kit Empreendedora Digital (5 Templates)',
    price: 'R$37',
    keywords: ['empreendedor', 'negócio', 'freelanc', 'marketing', 'instagram', 'conteúdo', 'funil', 'newsletter', 'canva', 'template', 'mei', 'vender'],
  },
};

async function getPosts() {
  const res = await fetch(`${WP_URL}?per_page=100&_fields=id,title,content,slug`, {
    headers: { Authorization: `Basic ${WP_AUTH}` },
  });
  return res.json();
}

async function updatePost(id, content) {
  await fetch(`${WP_URL}/${id}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${WP_AUTH}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
}

function matchTemplate(title) {
  const lower = title.toLowerCase();
  for (const [key, tmpl] of Object.entries(TEMPLATES)) {
    if (tmpl.keywords.some(kw => lower.includes(kw))) return tmpl;
  }
  return null;
}

function buildCTA(tmpl) {
  return `
<div style="background:linear-gradient(135deg,#0B0A12,#1a1a2e);border-radius:16px;padding:32px;margin:32px 0;text-align:center;">
<p style="color:#D4AF37;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">Template Notion</p>
<p style="color:#F5EDE3;font-size:22px;font-weight:700;margin:0 0 8px;">${tmpl.title}</p>
<p style="color:rgba(245,237,227,0.7);font-size:15px;margin:0 0 20px;">Organize tudo em um só lugar. Pronto para usar.</p>
<a href="${tmpl.url}" target="_blank" rel="noopener" style="display:inline-block;background:#D4AF37;color:#0B0A12;padding:14px 36px;border-radius:24px;text-decoration:none;font-weight:700;font-size:16px;">Conhecer por ${tmpl.price}</a>
</div>`;
}

async function main() {
  console.log('Inserindo CTAs de templates nos artigos...\n');

  const posts = await getPosts();
  const valid = posts.filter(p => !p.title.rendered.includes('mundo'));

  let inserted = 0;
  const max = parseInt(process.env.MAX_UPDATES || '100');

  for (const post of valid.slice(0, max)) {
    // Já tem CTA de template?
    if (post.content.rendered.includes('template-financeiro-pessoal') ||
        post.content.rendered.includes('template-empreendedora')) continue;

    const tmpl = matchTemplate(post.title.rendered);
    if (!tmpl) continue;

    // Adicionar CTA no final do artigo
    const content = post.content.rendered + buildCTA(tmpl);

    if (process.env.DRY_RUN !== 'true') {
      await updatePost(post.id, content);
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`  📦 ${post.title.rendered.substring(0, 50)} → ${tmpl.title.substring(0, 30)}`);
    inserted++;
  }

  console.log(`\n📊 ${inserted} CTAs de templates inseridos`);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
