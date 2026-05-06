/**
 * MAC Bridge Subscribe — Vercel Serverless Function
 * POST /api/mac-bridge/subscribe
 *
 * Captura lead da LP-bridge (patrimonio-com-proposito.html) ANTES do checkout Ticto.
 * Adiciona contato no Resend audience "MAC Bridge" (env: MAC_BRIDGE_AUDIENCE_ID)
 * pra disparar sequência de 7 emails de aquecimento.
 *
 * Accepts: { email, name, whatsapp? }
 * Returns: { success, ticto_url, lead_id }
 *
 * Setup (Marina):
 *   1. Criar audience "MAC Bridge" em https://resend.com/audiences
 *   2. Copiar UUID e setar MAC_BRIDGE_AUDIENCE_ID no Vercel env vars
 *   3. Configurar broadcast/automation com a sequência de 7 emails
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAC_BRIDGE_AUDIENCE_ID = process.env.MAC_BRIDGE_AUDIENCE_ID;
const TICTO_URL = process.env.MAC_TICTO_URL || 'https://payment.ticto.app/OA1B58ADA?pid=AFCAA6C80D';

const ALLOWED_ORIGINS = [
  'https://marinaveauvy.github.io',
  'https://marinaveauvy.com.br',
  'https://www.marinaveauvy.com.br',
  'https://vidanovaprospera.com.br',
  'https://novavidaprospera.com.br',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
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
  if (!res.ok) throw new Error(data.message || `Resend ${res.status}`);
  return data;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  const headers = corsHeaders(origin);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY missing' });
  if (!MAC_BRIDGE_AUDIENCE_ID) return res.status(500).json({ error: 'MAC_BRIDGE_AUDIENCE_ID missing — Marina precisa criar audience no Resend' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const email = (body?.email || '').trim().toLowerCase();
  const name = (body?.name || '').trim();
  const whatsapp = (body?.whatsapp || '').trim();

  if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Email inválido' });
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  try {
    const contact = await resendFetch(`/audiences/${MAC_BRIDGE_AUDIENCE_ID}/contacts`, {
      method: 'POST',
      body: JSON.stringify({
        email,
        first_name: name.split(' ')[0],
        last_name: name.split(' ').slice(1).join(' ') || undefined,
        unsubscribed: false,
      }),
    });

    return res.status(200).json({
      success: true,
      lead_id: contact.id,
      ticto_url: TICTO_URL,
      whatsapp_received: !!whatsapp,
    });
  } catch (e) {
    if (String(e.message).includes('already exists')) {
      return res.status(200).json({
        success: true,
        already_subscribed: true,
        ticto_url: TICTO_URL,
      });
    }
    console.error('MAC bridge subscribe error:', e);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
};
