// Gera e envia newsletter via Gemini + Resend API
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const SEND_URL = 'https://costuras-meditacoes.vercel.app/api/newsletter/send';
const ADMIN_KEY = process.env.NEWSLETTER_ADMIN_KEY;
const BLOG_URL = 'https://wp.marinaveauvy.com.br';
const SITE_URL = 'https://marinaveauvy.github.io/costuras-meditacoes';

const NEWSLETTERS = {
  'impulso-ia': {
    from: 'Impulso IA <impulso@marinaveauvy.com.br>',
    audienceId: '20a1b639-8752-4008-9db2-2bf54e98da51',
    focus: 'IA prática, ferramentas de automação, prompts, produtividade com IA',
    cta: `${SITE_URL}/pack-prompts.html`,
    ctaText: 'Pack 50+ Prompts ChatGPT',
    day: 2, // terça
  },
  'dinheiro-simples': {
    from: 'Dinheiro Simples <dinheiro@marinaveauvy.com.br>',
    audienceId: '29856ea4-2cf0-4721-b3c3-2c954ea051c1',
    focus: 'finanças pessoais, economia, investimentos para iniciantes, prosperidade',
    cta: `${SITE_URL}/planilha-auditoria.html`,
    ctaText: 'Planilha Auditoria Financeira',
    extraCta: `${SITE_URL}/webinario.html`,
    extraCtaText: 'Masterclass Gratuita: Costuras da Abundância',
    day: 4, // quinta
  },
  'renda-extra': {
    from: 'Renda Extra Report <renda@marinaveauvy.com.br>',
    audienceId: '0be5cf6b-98fe-4799-bec9-b4658a52d555',
    focus: 'oportunidades de renda extra, freelancing, produtos digitais, monetização',
    cta: `${SITE_URL}/ebook-ia-pmes.html`,
    ctaText: 'E-book IA Prática para PMEs',
    day: 6, // sábado
  },
};

async function getRecentArticles() {
  try {
    const res = await fetch(`${BLOG_URL}/wp-json/wp/v2/posts?per_page=5&_fields=title,link`);
    const posts = await res.json();
    return posts.map(p => ({ title: p.title.rendered, link: p.link }));
  } catch { return []; }
}

async function generateNewsletter(name, config, articles) {
  const articleLinks = articles.slice(0, 3).map(a => `- ${a.title}: ${a.link}`).join('\n');

  const prompt = `Você é a redatora da newsletter "${name}" de Marina Veauvy. Gere a edição da semana.

FOCO: ${config.focus}
ARTIGOS RECENTES DO BLOG (incluir 1-2 como links):
${articleLinks}

PRODUTO DIGITAL PARA CTA: ${config.ctaText} (${config.cta})
${config.extraCta ? `CTA EXTRA (sutil, no final): ${config.extraCtaText} (${config.extraCta})` : ''}

REQUISITOS:
- Subject line: curiosa, urgente, máximo 60 caracteres
- 3-4 seções curtas com conteúdo valioso
- Tom: amigável, prático, empoderador
- Português (pt-BR) com acentuação correta
- NUNCA mencionar "Quarta Via"
- HTML email com inline styles, mobile-friendly
- Cores: fundo #f8f9fa, cards brancos, accent #7c3aed
- Fonte: Arial, sans-serif
- Largura máxima: 600px
- Incluir header com nome da newsletter e emoji
- Incluir footer com "Responda este email se tiver dúvidas"

FORMATO JSON:
{
  "subject": "Subject line aqui",
  "html": "<div style='max-width:600px;margin:0 auto;font-family:Arial,sans-serif'>...</div>"
}

Responda APENAS o JSON.`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 4096 },
    }),
  });

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini empty: ' + JSON.stringify(data).substring(0, 200));

  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  cleaned = cleaned.replace(/[\x00-\x1f\x7f]/g, m => m === '\n' || m === '\r' || m === '\t' ? m : '');
  cleaned = cleaned.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  cleaned = cleaned.replace(/\\n\s*"/g, '\n"').replace(/\\n\s*\}/g, '\n}').replace(/\{\\n/g, '{\n');
  try {
    return JSON.parse(cleaned);
  } catch {
    const subjectMatch = text.match(/"subject"\s*:\s*"([^"]+)"/);
    const htmlMatch = text.match(/"html"\s*:\s*"([\s\S]+?)"\s*\}/);
    if (subjectMatch && htmlMatch) {
      return {
        subject: subjectMatch[1],
        html: htmlMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
      };
    }
    throw new Error('JSON parse failed');
  }
}

async function sendNewsletter(config, content) {
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      admin_key: ADMIN_KEY,
      from: config.from,
      audienceId: config.audienceId,
      subject: content.subject,
      html: content.html,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function main() {
  const target = process.env.NEWSLETTER_NAME;
  const dayOfWeek = new Date().getDay(); // 0=dom, 1=seg, 2=ter...

  // Se target específico, enviar esse. Senão, enviar o do dia.
  const toSend = [];

  if (target) {
    if (NEWSLETTERS[target]) {
      toSend.push([target, NEWSLETTERS[target]]);
    } else {
      console.error('Newsletter não encontrada:', target);
      process.exit(1);
    }
  } else {
    for (const [name, config] of Object.entries(NEWSLETTERS)) {
      if (config.day === dayOfWeek) {
        toSend.push([name, config]);
      }
    }
  }

  if (toSend.length === 0) {
    console.log('Nenhuma newsletter para enviar hoje (dia ' + dayOfWeek + ')');
    return;
  }

  const articles = await getRecentArticles();
  console.log(`${articles.length} artigos recentes do blog`);

  for (const [name, config] of toSend) {
    console.log(`\n📧 Gerando ${name}...`);
    try {
      const content = await generateNewsletter(name, config, articles);
      console.log(`Subject: "${content.subject}"`);

      const result = await sendNewsletter(config, content);
      console.log(`✅ Enviada! ${JSON.stringify(result)}`);
    } catch (err) {
      console.error(`❌ Erro em ${name}: ${err.message}`);
    }
  }
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
