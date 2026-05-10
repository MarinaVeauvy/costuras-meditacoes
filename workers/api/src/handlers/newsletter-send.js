import { resendFetch, readJsonBody } from '../resend.js';
import { jsonResponse } from '../cors.js';

const NEWSLETTERS = {
  'impulso-ia':       { name: 'Impulso IA',          from: 'Impulso IA <impulso@marinaveauvy.com.br>',         audienceId: '20a1b639-8752-4008-9db2-2bf54e98da51' },
  'dinheiro-simples': { name: 'Dinheiro Simples',    from: 'Dinheiro Simples <dinheiro@marinaveauvy.com.br>',  audienceId: '29856ea4-2cf0-4721-b3c3-2c954ea051c1' },
  'renda-extra':      { name: 'Renda Extra Report',  from: 'Renda Extra Report <renda@marinaveauvy.com.br>',   audienceId: '0be5cf6b-98fe-4799-bec9-b4658a52d555' },
};

async function getAllContacts(env, audienceId) {
  const contacts = [];
  let hasMore = true;
  let after;
  while (hasMore) {
    const params = new URLSearchParams({ limit: '100' });
    if (after) params.set('after', after);
    const res = await resendFetch(env, `/audiences/${audienceId}/contacts?${params.toString()}`);
    const batch = (res.data || []).filter(c => !c.unsubscribed);
    contacts.push(...batch);
    hasMore = res.has_more === true && batch.length > 0;
    if (hasMore) after = batch[batch.length - 1].id;
  }
  return contacts;
}

async function sendBatchEmails(env, from, subject, htmlContent, contacts, apiBase) {
  const results = { sent: 0, failed: 0, errors: [] };
  const unsubBase = `${apiBase}/api/newsletter/subscribers`;
  for (let i = 0; i < contacts.length; i += 100) {
    const chunk = contacts.slice(i, i + 100);
    const emails = chunk.map(c => {
      const unsubLink = `${unsubBase}?action=unsub&email=${encodeURIComponent(c.email)}`;
      const footer = `<div style="text-align:center;padding:20px;font-size:12px;color:#999;border-top:1px solid #eee;margin-top:30px;"><p>Voce recebeu este email porque se inscreveu na nossa newsletter.</p><p><a href="${unsubLink}" style="color:#999;">Cancelar inscricao</a></p></div>`;
      return { from, to: c.email, subject, html: htmlContent + footer };
    });
    try {
      await resendFetch(env, '/emails/batch', { method: 'POST', body: JSON.stringify(emails) });
      results.sent += chunk.length;
    } catch (e) {
      results.failed += chunk.length;
      results.errors.push(e.message);
    }
  }
  return results;
}

export async function handle(req, env) {
  const origin = req.headers.get('Origin') || '';
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 }, origin);
  }
  const body = await readJsonBody(req);
  if (!body) return jsonResponse({ error: 'Invalid JSON' }, { status: 400 }, origin);

  const { newsletter_id, subject, html_content, admin_key } = body;
  if (admin_key !== env.ADMIN_KEY) {
    return jsonResponse({ error: 'Admin key invalida' }, { status: 401 }, origin);
  }
  if (!newsletter_id || !NEWSLETTERS[newsletter_id]) {
    return jsonResponse({ error: 'newsletter_id invalido' }, { status: 400 }, origin);
  }
  if (!subject || !html_content) {
    return jsonResponse({ error: 'subject e html_content sao obrigatorios' }, { status: 400 }, origin);
  }

  const newsletter = NEWSLETTERS[newsletter_id];
  const apiBase = new URL(req.url).origin; // self-reference para unsub link

  try {
    const contacts = await getAllContacts(env, newsletter.audienceId);
    if (contacts.length === 0) {
      return jsonResponse({ success: true, message: 'Nenhum inscrito', sent: 0, failed: 0 }, { status: 200 }, origin);
    }
    const results = await sendBatchEmails(env, newsletter.from, subject, html_content, contacts, apiBase);
    return jsonResponse({
      success: true,
      newsletter: newsletter.name,
      total_subscribers: contacts.length,
      sent: results.sent,
      failed: results.failed,
      errors: results.errors.length ? results.errors : undefined,
    }, { status: 200 }, origin);
  } catch (e) {
    console.error('Send error:', e.message);
    return jsonResponse({ error: e.message || 'Erro interno' }, { status: 500 }, origin);
  }
}
