/**
 * Newsletter Subscribe — Vercel Serverless Function
 * POST /api/newsletter/subscribe
 *
 * Accepts: { email, name, newsletter_id }
 * Creates contact in the corresponding Resend Audience.
 * If the audience doesn't exist yet, creates it on first use.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY || 'pa-admin-a3f7c9e1b2d4';

const ALLOWED_ORIGINS = [
  'https://marinaveauvy.github.io',
  'https://marinaveauvy.com.br',
  'https://www.marinaveauvy.com.br',
  'http://localhost:3000',
];

const NEWSLETTERS = {
  'impulso-ia': { name: 'Impulso IA', audienceId: '20a1b639-8752-4008-9db2-2bf54e98da51' },
  'dinheiro-simples': { name: 'Dinheiro Simples', audienceId: '29856ea4-2cf0-4721-b3c3-2c954ea051c1' },
  'renda-extra': { name: 'Renda Extra Report', audienceId: '0be5cf6b-98fe-4799-bec9-b4658a52d555' },
};

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

async function resendFetch(path, options = {}) {
  const res = await fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Resend API error: ${res.status}`);
  }
  return data;
}

function getAudienceId(newsletterId) {
  const newsletter = NEWSLETTERS[newsletterId];
  if (!newsletter || !newsletter.audienceId) {
    throw new Error(`Unknown newsletter_id: ${newsletterId}`);
  }
  return newsletter.audienceId;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const headers = corsHeaders(origin);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, name, newsletter_id } = req.body || {};

    // Validate inputs
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Email invalido' });
    }

    if (!newsletter_id || !NEWSLETTERS[newsletter_id]) {
      return res.status(400).json({
        error: 'newsletter_id invalido. Use: impulso-ia, dinheiro-simples ou renda-extra',
      });
    }

    // Get audience ID
    const audienceId = getAudienceId(newsletter_id);

    // Split name into first/last
    const nameParts = (name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // Create contact in audience
    await resendFetch(`/audiences/${audienceId}/contacts`, {
      method: 'POST',
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        first_name: firstName,
        last_name: lastName,
        unsubscribed: false,
      }),
    });

    // Check if redirect was requested (form submission from HTML page)
    const acceptsHtml =
      (req.headers.accept || '').includes('text/html') ||
      req.headers['content-type']?.includes('application/x-www-form-urlencoded');

    if (acceptsHtml) {
      res.setHeader('Location', `https://marinaveauvy.github.io/costuras-meditacoes/newsletter-obrigada.html?nl=${newsletter_id}`);
      return res.status(302).end();
    }

    return res.status(200).json({
      success: true,
      message: `Inscrito com sucesso na newsletter ${NEWSLETTERS[newsletter_id].name}`,
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    return res.status(500).json({ error: error.message || 'Erro interno' });
  }
};
