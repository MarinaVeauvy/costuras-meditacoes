// publish-20-affiliate-articles.mjs
// Generates 20 review/comparison articles via Gemini API and publishes to WordPress

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const WP_TOKEN = Buffer.from(`${process.env.WP_USER || 'wp.marinaveauvy.com.br'}:${process.env.WP_APP_PASSWORD}`).toString('base64');
const WP_API = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts';
const AFFILIATE_TAG = 'marinaveauv04-20';

const ASINS = {
  paiRico: 'B07H3GFRKY',
  maisEsperto: 'B09FKJL8WQ',
  poderHabito: 'B07QFDGBDC',
  mindset: 'B07QFZ9C4N7', // actually B07QFDC4N7
  psicologiaFinanceira: 'B07QFZ9C4N',
  habitosAtomicos: 'B08WWKX47Z',
  comecePeloPortque: 'B07QG1W5SW',
  homemMaisRico: 'B09HQYR4BN',
  segredosMenteMilionaria: 'B07C7KRSXG',
  costurasAbundancia: 'B0F1Y3QKQ7',
};

// Fix: use exact ASINs from the brief
const ASIN_MAP = {
  'B07H3GFRKY': 'Pai Rico, Pai Pobre - Robert Kiyosaki',
  'B09FKJL8WQ': 'Mais Esperto que o Diabo - Napoleon Hill',
  'B07QFDGBDC': 'O Poder do Hábito - Charles Duhigg',
  'B07QFDC4N7': 'Mindset - Carol Dweck',
  'B07QFZ9C4N': 'A Psicologia Financeira - Morgan Housel',
  'B08WWKX47Z': 'Hábitos Atômicos - James Clear',
  'B07QG1W5SW': 'Comece pelo Porquê - Simon Sinek',
  'B09HQYR4BN': 'O Homem Mais Rico da Babilônia - George Clason',
  'B07C7KRSXG': 'Os Segredos da Mente Milionária - T. Harv Eker',
  'B0F1Y3QKQ7': 'Costuras da Abundância - Marina Veauvy',
};

function affiliateLink(asin) {
  return `https://www.amazon.com.br/dp/${asin}?tag=${AFFILIATE_TAG}`;
}

const PRODUCTS_URL = 'https://marinaveauvy.github.io/costuras-meditacoes/produtos-digitais.html';

const CTA_PRODUTOS = `
<div style="background: linear-gradient(135deg, #6c3483 0%, #a569bd 100%); border-radius: 12px; padding: 32px; margin: 40px 0; text-align: center;">
<h3 style="color: #ffeaa7; margin-bottom: 12px; font-size: 22px;">📚 Materiais Gratuitos para Acelerar Sua Jornada</h3>
<p style="color: #f0f0f0; margin-bottom: 20px; font-size: 16px;">Baixe planilhas, e-books e packs de prompts — tudo gratuito e prático para aplicar hoje mesmo.</p>
<a href="${PRODUCTS_URL}" style="display: inline-block; background: #ffeaa7; color: #6c3483; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">Ver Produtos Digitais Gratuitos</a>
</div>`;

const CTA_COSTURAS = `
<div style="background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%); border-radius: 12px; padding: 32px; margin: 40px 0; text-align: center;">
<h3 style="color: #fff; margin-bottom: 12px; font-size: 22px;">✨ Costuras da Abundância — O Livro</h3>
<p style="color: #f0f0f0; margin-bottom: 20px; font-size: 16px;">Descubra o framework que conecta autoconhecimento e prosperidade financeira através de 3 eixos transformadores. Disponível na Amazon.</p>
<a href="${affiliateLink('B0F1Y3QKQ7')}" style="display: inline-block; background: #e74c3c; color: #fff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;" target="_blank" rel="noopener">Comprar na Amazon</a>
</div>`;

const ARTICLES = [
  {
    title: 'Melhores Livros de Finanças Pessoais em 2026: Top 10',
    slug: 'melhores-livros-financas-pessoais-2026',
    asins: ['B07H3GFRKY','B07QFZ9C4N','B09HQYR4BN','B07C7KRSXG','B0F1Y3QKQ7'],
    category: 'financas',
    metaDesc: 'Descubra os 10 melhores livros de finanças pessoais em 2026. Resenhas completas com prós, contras e links para compra na Amazon.',
  },
  {
    title: 'Melhores Livros sobre Inteligência Artificial para Iniciantes',
    slug: 'melhores-livros-inteligencia-artificial-iniciantes',
    asins: ['B08WWKX47Z','B07QFDGBDC','B07QG1W5SW','B0F1Y3QKQ7'],
    category: 'ia',
    metaDesc: 'Os melhores livros sobre IA para quem está começando. Guia completo com resenhas, comparativos e recomendações.',
  },
  {
    title: 'Top 7 Livros de Empreendedorismo para Mulheres',
    slug: 'livros-empreendedorismo-mulheres',
    asins: ['B07H3GFRKY','B07QFDC4N7','B07C7KRSXG','B07QG1W5SW','B0F1Y3QKQ7'],
    category: 'empreendedorismo',
    metaDesc: 'Os 7 melhores livros de empreendedorismo para mulheres em 2026. Resenhas detalhadas e links para compra.',
  },
  {
    title: 'Melhores Ferramentas de IA Gratuitas para Pequenos Negócios',
    slug: 'ferramentas-ia-gratuitas-pequenos-negocios',
    asins: ['B08WWKX47Z','B07QFDGBDC','B0F1Y3QKQ7'],
    category: 'ia',
    metaDesc: 'As melhores ferramentas de IA gratuitas para pequenos negócios em 2026. Comparativo completo com prós e contras.',
  },
  {
    title: 'Melhores Livros de Investimento para Quem Está Começando',
    slug: 'melhores-livros-investimento-iniciantes',
    asins: ['B07H3GFRKY','B07QFZ9C4N','B09HQYR4BN','B07C7KRSXG','B0F1Y3QKQ7'],
    category: 'investimentos',
    metaDesc: 'Os melhores livros de investimento para iniciantes. Guia completo com resenhas e recomendações para 2026.',
  },
  {
    title: 'Como Escolher o Melhor Livro de Produtividade para Você',
    slug: 'melhor-livro-produtividade',
    asins: ['B08WWKX47Z','B07QFDGBDC','B07QFDC4N7','B07QG1W5SW','B0F1Y3QKQ7'],
    category: 'produtividade',
    metaDesc: 'Guia definitivo para escolher o melhor livro de produtividade. Comparativo entre Hábitos Atômicos, Poder do Hábito e mais.',
  },
  {
    title: 'Top 5 Livros sobre Mindset e Mentalidade de Abundância',
    slug: 'livros-mindset-mentalidade-abundancia',
    asins: ['B07QFDC4N7','B07C7KRSXG','B09FKJL8WQ','B09HQYR4BN','B0F1Y3QKQ7'],
    category: 'mindset',
    metaDesc: 'Os 5 melhores livros sobre mindset e mentalidade de abundância. Resenhas completas para transformar sua relação com dinheiro.',
  },
  {
    title: 'Melhores Planilhas Financeiras Gratuitas: Comparativo Completo',
    slug: 'melhores-planilhas-financeiras-gratuitas',
    asins: ['B07QFZ9C4N','B07H3GFRKY','B0F1Y3QKQ7'],
    category: 'financas',
    metaDesc: 'Comparativo das melhores planilhas financeiras gratuitas em 2026. Baixe e organize suas finanças hoje.',
  },
  {
    title: 'Pai Rico Pai Pobre Vale a Pena? Resenha Completa 2026',
    slug: 'pai-rico-pai-pobre-resenha-vale-a-pena',
    asins: ['B07H3GFRKY','B07QFZ9C4N','B09HQYR4BN','B07C7KRSXG','B0F1Y3QKQ7'],
    category: 'resenha',
    metaDesc: 'Pai Rico Pai Pobre vale a pena em 2026? Resenha completa, prós, contras e para quem é indicado.',
  },
  {
    title: 'Hábitos Atômicos: Resenha e Como Aplicar no Seu Negócio',
    slug: 'habitos-atomicos-resenha-aplicar-negocio',
    asins: ['B08WWKX47Z','B07QFDGBDC','B07QFDC4N7','B0F1Y3QKQ7'],
    category: 'resenha',
    metaDesc: 'Resenha completa de Hábitos Atômicos de James Clear. Aprenda como aplicar os conceitos no seu negócio.',
  },
  {
    title: 'Top 10 Cursos Online Gratuitos de Marketing Digital',
    slug: 'cursos-online-gratuitos-marketing-digital',
    asins: ['B07QG1W5SW','B08WWKX47Z','B0F1Y3QKQ7'],
    category: 'marketing',
    metaDesc: 'Os 10 melhores cursos gratuitos de marketing digital em 2026. Lista completa com links e avaliações.',
  },
  {
    title: 'Melhores Apps de Controle Financeiro Pessoal 2026',
    slug: 'melhores-apps-controle-financeiro-2026',
    asins: ['B07QFZ9C4N','B07H3GFRKY','B09HQYR4BN','B0F1Y3QKQ7'],
    category: 'financas',
    metaDesc: 'Os melhores aplicativos de controle financeiro pessoal em 2026. Comparativo completo com prós e contras.',
  },
  {
    title: 'Livros sobre Prosperidade e Abundância: Os 7 Melhores',
    slug: 'livros-prosperidade-abundancia-melhores',
    asins: ['B0F1Y3QKQ7','B07C7KRSXG','B09HQYR4BN','B09FKJL8WQ','B07QFDC4N7'],
    category: 'prosperidade',
    metaDesc: 'Os 7 melhores livros sobre prosperidade e abundância. De Costuras da Abundância a Segredos da Mente Milionária.',
  },
  {
    title: 'Como Usar ChatGPT para Ganhar Dinheiro: Guia Completo',
    slug: 'como-usar-chatgpt-ganhar-dinheiro-guia',
    asins: ['B08WWKX47Z','B07QG1W5SW','B0F1Y3QKQ7'],
    category: 'ia',
    metaDesc: 'Guia completo de como usar ChatGPT para ganhar dinheiro em 2026. 15 formas práticas testadas e aprovadas.',
  },
  {
    title: 'Melhores Livros de Desenvolvimento Pessoal 2026',
    slug: 'melhores-livros-desenvolvimento-pessoal-2026',
    asins: ['B07QFDC4N7','B08WWKX47Z','B07QFDGBDC','B09FKJL8WQ','B0F1Y3QKQ7'],
    category: 'desenvolvimento',
    metaDesc: 'Os melhores livros de desenvolvimento pessoal para ler em 2026. Resenhas e comparativos detalhados.',
  },
  {
    title: 'Investimento para Iniciantes: Por Onde Começar em 2026',
    slug: 'investimento-iniciantes-por-onde-comecar-2026',
    asins: ['B07H3GFRKY','B07QFZ9C4N','B09HQYR4BN','B07C7KRSXG','B0F1Y3QKQ7'],
    category: 'investimentos',
    metaDesc: 'Guia completo de investimento para iniciantes em 2026. Por onde começar, melhores livros e recursos.',
  },
  {
    title: 'Melhores Notebooks para Trabalhar com IA: Guia de Compra',
    slug: 'melhores-notebooks-trabalhar-ia-guia-compra',
    asins: ['B08WWKX47Z','B07QFDGBDC','B0F1Y3QKQ7'],
    category: 'ia',
    metaDesc: 'Os melhores notebooks para trabalhar com inteligência artificial em 2026. Guia de compra com comparativos.',
  },
  {
    title: 'Top 5 Ferramentas de Automação para Empreendedores',
    slug: 'ferramentas-automacao-empreendedores',
    asins: ['B08WWKX47Z','B07QG1W5SW','B07QFDGBDC','B0F1Y3QKQ7'],
    category: 'empreendedorismo',
    metaDesc: 'As 5 melhores ferramentas de automação para empreendedores em 2026. Comparativo com prós, contras e preços.',
  },
  {
    title: 'A Psicologia Financeira: Resenha e Principais Lições',
    slug: 'psicologia-financeira-resenha-licoes',
    asins: ['B07QFZ9C4N','B07H3GFRKY','B09HQYR4BN','B07C7KRSXG','B0F1Y3QKQ7'],
    category: 'resenha',
    metaDesc: 'Resenha completa de A Psicologia Financeira de Morgan Housel. As principais lições e como aplicar na vida.',
  },
  {
    title: 'Renda Extra Online: Melhores Livros e Recursos para Começar',
    slug: 'renda-extra-online-melhores-livros-recursos',
    asins: ['B07H3GFRKY','B08WWKX47Z','B07QG1W5SW','B07C7KRSXG','B0F1Y3QKQ7'],
    category: 'renda-extra',
    metaDesc: 'Os melhores livros e recursos para começar a ganhar renda extra online em 2026. Guia prático e completo.',
  },
];

function buildAffiliateLinksSection(asins) {
  let html = '';
  for (const asin of asins) {
    const name = ASIN_MAP[asin] || asin;
    html += `<li><a href="${affiliateLink(asin)}" target="_blank" rel="noopener nofollow">${name}</a></li>\n`;
  }
  return html;
}

async function generateArticle(article, index) {
  const booksList = article.asins.map(a => `- ${ASIN_MAP[a]} (link: ${affiliateLink(a)})`).join('\n');

  const prompt = `Você é um redator especialista em SEO e marketing de afiliados no Brasil. Escreva um artigo completo em português brasileiro (pt-BR) com acentuação correta.

TÍTULO: "${article.title}"

REQUISITOS:
- Entre 1800 e 2500 palavras
- Formato HTML puro (sem markdown, sem blocos de código)
- Use tags H2 e H3 para estruturar
- Inclua listas (ul/li), tabelas comparativas quando fizer sentido, e parágrafos bem desenvolvidos
- Tom: profissional mas acessível, como uma amiga experiente dando conselhos
- SEO: use variações da palavra-chave principal naturalmente ao longo do texto
- Inclua uma introdução envolvente e uma conclusão com call-to-action

LINKS DE AFILIADO AMAZON (OBRIGATÓRIO incluir todos estes como links clicáveis no artigo):
${booksList}

IMPORTANTE:
- O livro "Costuras da Abundância" de Marina Veauvy DEVE ser mencionado como uma recomendação especial/destaque, descrevendo-o como um livro que conecta autoconhecimento e prosperidade financeira através do framework Costuras da Abundância, com 3 eixos: Merecimento, Transmutação e Dissolução
- Cada link de afiliado deve aparecer pelo menos 2 vezes no artigo (uma no corpo, uma na seção de resumo/conclusão)
- Use atributos target="_blank" rel="noopener nofollow" em todos os links Amazon
- Inclua uma tabela comparativa HTML quando relevante (livros lado a lado)
- NÃO inclua tags <html>, <head>, <body> — apenas o conteúdo interno do artigo
- NÃO use classes CSS — use inline styles quando precisar estilizar
- Comece direto com um parágrafo de introdução (NÃO repita o título em H1)

ESTRUTURA SUGERIDA:
1. Introdução (2-3 parágrafos)
2. Seções principais com H2 (uma para cada item/livro/ferramenta)
3. Tabela comparativa (se aplicável)
4. Seção de destaque para Costuras da Abundância
5. Conclusão com resumo e links

Retorne APENAS o HTML do artigo, sem explicações adicionais.`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 8192,
    },
  };

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error for article ${index + 1}: ${res.status} — ${err}`);
  }

  const data = await res.json();
  let html = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Clean up any markdown code fences Gemini might add
  html = html.replace(/^```html?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  return html;
}

async function publishToWordPress(article, htmlContent) {
  // Add CTAs at the end
  const fullContent = htmlContent + '\n' + CTA_COSTURAS + '\n' + CTA_PRODUTOS;

  const postData = {
    title: article.title,
    slug: article.slug,
    content: fullContent,
    status: 'publish',
    excerpt: article.metaDesc,
    meta: {
      _yoast_wpseo_metadesc: article.metaDesc,
    },
  };

  const res = await fetch(WP_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${WP_TOKEN}`,
    },
    body: JSON.stringify(postData),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WordPress API error: ${res.status} — ${err}`);
  }

  const post = await res.json();
  return { id: post.id, link: post.link, title: post.title?.rendered || article.title };
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Publishing 20 Affiliate Review Articles ===\n');
  const results = [];
  const errors = [];

  for (let i = 0; i < ARTICLES.length; i++) {
    const article = ARTICLES[i];
    console.log(`\n[${i + 1}/20] Generating: ${article.title}`);

    try {
      // Generate via Gemini
      const html = await generateArticle(article, i);
      console.log(`  ✓ Generated (${html.length} chars)`);

      // Brief pause to avoid rate limits
      await sleep(2000);

      // Publish to WordPress
      console.log(`  Publishing to WordPress...`);
      const result = await publishToWordPress(article, html);
      console.log(`  ✓ Published: ID=${result.id} — ${result.link}`);
      results.push(result);

      // Pause between articles
      await sleep(3000);
    } catch (err) {
      console.error(`  ✗ ERROR: ${err.message}`);
      errors.push({ title: article.title, error: err.message });
    }
  }

  console.log('\n\n=== RESULTS ===');
  console.log(`Published: ${results.length}/20`);
  console.log(`Errors: ${errors.length}/20`);

  console.log('\n--- Published Articles ---');
  for (const r of results) {
    console.log(`  ID: ${r.id} | ${r.title} | ${r.link}`);
  }

  if (errors.length > 0) {
    console.log('\n--- Errors ---');
    for (const e of errors) {
      console.log(`  ${e.title}: ${e.error}`);
    }
  }

  return { results, errors };
}

main().catch(console.error);
