import { resendFetch } from '../resend.js';
import { jsonResponse, corsHeaders } from '../cors.js';

const NEWSLETTERS = {
  'impulso-ia':       { name: 'Impulso IA',         audienceId: '20a1b639-8752-4008-9db2-2bf54e98da51' },
  'dinheiro-simples': { name: 'Dinheiro Simples',   audienceId: '29856ea4-2cf0-4721-b3c3-2c954ea051c1' },
  'renda-extra':      { name: 'Renda Extra Report', audienceId: '0be5cf6b-98fe-4799-bec9-b4658a52d555' },
};

async function getAllContacts(env, audienceId) {
  const contacts = [];
  let hasMore = true;
  let after;
  while (hasMore) {
    const params = new URLSearchParams({ limit: '100' });
    if (after) params.set('after', after);
    const res = await resendFetch(env, `/audiences/${audienceId}/contacts?${params.toString()}`);
    const batch = res.data || [];
    contacts.push(...batch);
    hasMore = res.has_more === true && batch.length > 0;
    if (hasMore) after = batch[batch.length - 1].id;
  }
  return contacts;
}

function htmlEscape(s) {
  return String(s || '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
}

export async function handle(req, env) {
  const origin = req.headers.get('Origin') || '';
  const url = new URL(req.url);
  const newsletter_id = url.searchParams.get('newsletter_id');
  const admin_key = url.searchParams.get('admin_key') || req.headers.get('X-Admin-Key');
  const email = url.searchParams.get('email');
  const action = url.searchParams.get('action');

  // --- Public unsubscribe (GET com action=unsub) ---
  if (req.method === 'GET' && action === 'unsub' && email) {
    try {
      const listRes = await resendFetch(env, '/audiences?limit=100');
      for (const audience of (listRes.data || [])) {
        try {
          await resendFetch(env, `/audiences/${audience.id}/contacts/${encodeURIComponent(email)}`, { method: 'DELETE' });
        } catch {}
      }
      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Inscricao cancelada</title><style>body{font-family:system-ui,sans-serif;background:#f5f5f5;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.card{background:white;padding:3rem;border-radius:12px;text-align:center;max-width:480px;box-shadow:0 2px 12px rgba(0,0,0,.08)}h1{font-size:1.5rem;margin-bottom:1rem;color:#333}p{color:#666;line-height:1.6}</style></head><body><div class="card"><h1>Inscricao cancelada</h1><p>O email <strong>${htmlEscape(email)}</strong> foi removido das nossas newsletters.</p><p style="margin-top:1rem;font-size:.9rem">Se isso foi um engano, voce pode se inscrever novamente.</p></div></body></html>`;
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders(origin) },
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, { status: 500 }, origin);
    }
  }

  // Admin auth
  if (admin_key !== env.ADMIN_KEY) {
    return jsonResponse({ error: 'Admin key invalida' }, { status: 401 }, origin);
  }

  // GET — listar
  if (req.method === 'GET') {
    if (!newsletter_id || !NEWSLETTERS[newsletter_id]) {
      return jsonResponse({ error: 'newsletter_id invalido' }, { status: 400 }, origin);
    }
    try {
      const contacts = await getAllContacts(env, NEWSLETTERS[newsletter_id].audienceId);
      return jsonResponse({
        success: true,
        newsletter: NEWSLETTERS[newsletter_id].name,
        total: contacts.length,
        subscribed: contacts.filter(c => !c.unsubscribed).length,
        contacts: contacts.map(c => ({ id: c.id, email: c.email, first_name: c.first_name, last_name: c.last_name, unsubscribed: c.unsubscribed, created_at: c.created_at })),
      }, { status: 200 }, origin);
    } catch (e) {
      return jsonResponse({ error: e.message }, { status: 500 }, origin);
    }
  }

  // DELETE — remover contato
  if (req.method === 'DELETE') {
    if (!newsletter_id || !NEWSLETTERS[newsletter_id]) {
      return jsonResponse({ error: 'newsletter_id invalido' }, { status: 400 }, origin);
    }
    if (!email) return jsonResponse({ error: 'email obrigatorio' }, { status: 400 }, origin);
    try {
      await resendFetch(env, `/audiences/${NEWSLETTERS[newsletter_id].audienceId}/contacts/${encodeURIComponent(email)}`, { method: 'DELETE' });
      return jsonResponse({ success: true, message: `${email} removido da ${NEWSLETTERS[newsletter_id].name}` }, { status: 200 }, origin);
    } catch (e) {
      return jsonResponse({ error: e.message }, { status: 500 }, origin);
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, { status: 405 }, origin);
}
