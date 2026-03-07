/**
 * Product Download — Vercel Serverless Function
 * POST /api/product/download
 *
 * Accepts: { email, name, product_id }
 * Adds contact to the corresponding Resend Audience (newsletter),
 * then redirects to the download thank-you page.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;

const ALLOWED_ORIGINS = [
  'https://marinaveauvy.github.io',
  'https://marinaveauvy.com.br',
  'https://www.marinaveauvy.com.br',
  'http://localhost:3000',
];

const PRODUCTS = {
  'planilha-auditoria': {
    name: 'Planilha Auditoria Financeira',
    audienceId: '29856ea4-2cf0-4721-b3c3-2c954ea051c1',
  },
  'pack-prompts': {
    name: 'Pack de Prompts IA',
    audienceId: '20a1b639-8752-4008-9db2-2bf54e98da51',
  },
  'ebook-ia-pmes': {
    name: 'E-book IA para PMEs',
    audienceId: '20a1b639-8752-4008-9db2-2bf54e98da51',
  },
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
    const { email, name, product_id } = req.body || {};

    // Validate inputs
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Email invalido' });
    }

    if (!product_id || !PRODUCTS[product_id]) {
      return res.status(400).json({
        error: 'product_id invalido. Use: planilha-auditoria, pack-prompts ou ebook-ia-pmes',
      });
    }

    const product = PRODUCTS[product_id];

    // Split name into first/last
    const nameParts = (name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    // Add contact to Resend audience
    await resendFetch(`/audiences/${product.audienceId}/contacts`, {
      method: 'POST',
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        first_name: firstName,
        last_name: lastName,
        unsubscribed: false,
      }),
    });

    // Redirect to download thank-you page
    res.setHeader(
      'Location',
      `https://marinaveauvy.github.io/costuras-meditacoes/download-obrigada.html?product=${product_id}`
    );
    return res.status(302).end();
  } catch (error) {
    console.error('Product download error:', error);
    return res.status(500).json({ error: error.message || 'Erro interno' });
  }
};
