import { resendFetch, isValidEmail, readJsonBody } from '../resend.js';
import { jsonResponse, corsHeaders } from '../cors.js';

const NEWSLETTERS = {
  'impulso-ia': { name: 'Impulso IA', audienceId: '20a1b639-8752-4008-9db2-2bf54e98da51' },
  'dinheiro-simples': { name: 'Dinheiro Simples', audienceId: '29856ea4-2cf0-4721-b3c3-2c954ea051c1' },
  'renda-extra': { name: 'Renda Extra Report', audienceId: '0be5cf6b-98fe-4799-bec9-b4658a52d555' },
};

export async function handle(req, env) {
  const origin = req.headers.get('Origin') || '';
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 }, origin);
  }

  // Suporta application/json E form-urlencoded (HTML form submit)
  const ct = req.headers.get('Content-Type') || '';
  let body;
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    body = Object.fromEntries(fd);
  } else {
    body = await readJsonBody(req);
  }
  if (!body) return jsonResponse({ error: 'Invalid JSON' }, { status: 400 }, origin);

  const { email, name, newsletter_id } = body;
  if (!email || !isValidEmail(email)) {
    return jsonResponse({ error: 'Email invalido' }, { status: 400 }, origin);
  }
  if (!newsletter_id || !NEWSLETTERS[newsletter_id]) {
    return jsonResponse({
      error: 'newsletter_id invalido. Use: impulso-ia, dinheiro-simples ou renda-extra',
    }, { status: 400 }, origin);
  }

  const audienceId = NEWSLETTERS[newsletter_id].audienceId;
  const nameParts = String(name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  try {
    await resendFetch(env, `/audiences/${audienceId}/contacts`, {
      method: 'POST',
      body: JSON.stringify({
        email: String(email).toLowerCase().trim(),
        first_name: firstName,
        last_name: lastName,
        unsubscribed: false,
      }),
    });
  } catch (e) {
    // Resend retorna erro se contato já existe — tratamos como sucesso silencioso
    if (!String(e.message).toLowerCase().includes('already exists')) {
      console.error('Subscribe error:', e.message);
      return jsonResponse({ error: e.message || 'Erro interno' }, { status: 500 }, origin);
    }
  }

  // Form HTML → redirect 302 pra obrigada
  const acceptsHtml = (req.headers.get('Accept') || '').includes('text/html')
    || ct.includes('application/x-www-form-urlencoded');
  if (acceptsHtml) {
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders(origin),
        'Location': `https://marinaveauvy.github.io/costuras-meditacoes/newsletter-obrigada.html?nl=${encodeURIComponent(newsletter_id)}`,
      },
    });
  }
  return jsonResponse({
    success: true,
    message: `Inscrito com sucesso na newsletter ${NEWSLETTERS[newsletter_id].name}`,
  }, { status: 200 }, origin);
}
