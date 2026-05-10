import { resendFetch, isValidEmail, readJsonBody } from '../resend.js';
import { jsonResponse, corsHeaders } from '../cors.js';

const PRODUCTS = {
  'planilha-auditoria': { name: 'Planilha Auditoria Financeira', audienceId: '29856ea4-2cf0-4721-b3c3-2c954ea051c1' },
  'pack-prompts':       { name: 'Pack de Prompts IA',           audienceId: '20a1b639-8752-4008-9db2-2bf54e98da51' },
  'ebook-ia-pmes':      { name: 'E-book IA para PMEs',          audienceId: '20a1b639-8752-4008-9db2-2bf54e98da51' },
};

export async function handle(req, env) {
  const origin = req.headers.get('Origin') || '';
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 }, origin);
  }

  const ct = req.headers.get('Content-Type') || '';
  let body;
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    body = Object.fromEntries(fd);
  } else {
    body = await readJsonBody(req);
  }
  if (!body) return jsonResponse({ error: 'Invalid JSON' }, { status: 400 }, origin);

  const { email, name, product_id } = body;
  if (!email || !isValidEmail(email)) {
    return jsonResponse({ error: 'Email invalido' }, { status: 400 }, origin);
  }
  if (!product_id || !PRODUCTS[product_id]) {
    return jsonResponse({
      error: 'product_id invalido. Use: planilha-auditoria, pack-prompts ou ebook-ia-pmes',
    }, { status: 400 }, origin);
  }

  const product = PRODUCTS[product_id];
  const nameParts = String(name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  try {
    await resendFetch(env, `/audiences/${product.audienceId}/contacts`, {
      method: 'POST',
      body: JSON.stringify({
        email: String(email).toLowerCase().trim(),
        first_name: firstName,
        last_name: lastName,
        unsubscribed: false,
      }),
    });
  } catch (e) {
    if (!String(e.message).toLowerCase().includes('already exists')) {
      console.error('Product download error:', e.message);
      return jsonResponse({ error: e.message || 'Erro interno' }, { status: 500 }, origin);
    }
  }

  // Sempre redireciona pra obrigada (form HTML)
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders(origin),
      'Location': `https://marinaveauvy.github.io/costuras-meditacoes/download-obrigada.html?product=${encodeURIComponent(product_id)}`,
    },
  });
}
