/**
 * Newsletter Subscribers — Vercel Serverless Function
 * GET  /api/newsletter/subscribers?newsletter_id=xxx&admin_key=xxx
 * DELETE /api/newsletter/subscribers?newsletter_id=xxx&email=xxx&admin_key=xxx
 *
 * Also supports unsubscribe via GET with action=unsub (for email links).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;

const ALLOWED_ORIGINS = [
  'https://marinaveauvy.github.io',
  'https://marinaveauvy.com.br',
  'https://www.marinaveauvy.com.br',
];

const NEWSLETTERS = {
  'impulso-ia': { name: 'Impulso IA' },
  'dinheiro-simples': { name: 'Dinheiro Simples' },
  'renda-extra': { name: 'Renda Extra Report' },
};

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
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
  // DELETE returns 200 with { deleted: true }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Resend API error: ${res.status}`);
  }
  return data;
}

/**
 * Find the Resend Audience ID for the given newsletter_id.
 */
async function findAudienceId(newsletterId) {
  const newsletter = NEWSLETTERS[newsletterId];
  if (!newsletter) {
    throw new Error(`Unknown newsletter_id: ${newsletterId}`);
  }

  const listRes = await resendFetch('/audiences?limit=100');
  const audiences = listRes.data || [];
  const audience = audiences.find(
    (a) => a.name === `Newsletter: ${newsletter.name}`
  );

  if (!audience) {
    throw new Error(
      `Audience "Newsletter: ${newsletter.name}" nao encontrada.`
    );
  }

  return audience.id;
}

/**
 * Fetch ALL contacts for an audience, handling pagination.
 */
async function getAllContacts(audienceId) {
  const contacts = [];
  let hasMore = true;
  let after = undefined;

  while (hasMore) {
    const params = new URLSearchParams({ limit: '100' });
    if (after) params.set('after', after);

    const res = await resendFetch(
      `/audiences/${audienceId}/contacts?${params.toString()}`
    );

    contacts.push(...(res.data || []));

    hasMore = res.has_more === true;
    if (hasMore && res.data && res.data.length > 0) {
      after = res.data[res.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  return contacts;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const headers = corsHeaders(origin);
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { newsletter_id, admin_key, email, action } = req.query || {};

  // --- Public unsubscribe via GET (from email links) ---
  if (req.method === 'GET' && action === 'unsub' && email) {
    try {
      // Unsubscribe from ALL newsletters (global unsubscribe)
      const listRes = await resendFetch('/audiences?limit=100');
      const audiences = listRes.data || [];

      for (const audience of audiences) {
        try {
          await resendFetch(
            `/audiences/${audience.id}/contacts/${encodeURIComponent(email)}`,
            { method: 'DELETE' }
          );
        } catch (_) {
          // Contact may not exist in this audience, ignore
        }
      }

      // Return a user-friendly HTML page
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Inscricao cancelada</title>
          <style>
            body { font-family: 'Inter', sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
            .card { background: white; padding: 3rem; border-radius: 12px; text-align: center; max-width: 480px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
            h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #333; }
            p { color: #666; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Inscricao cancelada</h1>
            <p>O email <strong>${email.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]))}</strong> foi removido das nossas newsletters.</p>
            <p style="margin-top:1rem;font-size:0.9rem;">Se isso foi um engano, voce pode se inscrever novamente nas nossas paginas.</p>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      console.error('Unsubscribe error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // --- Admin endpoints (require admin_key) ---
  if (admin_key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Admin key invalida' });
  }

  // --- GET: List subscribers ---
  if (req.method === 'GET') {
    try {
      if (!newsletter_id || !NEWSLETTERS[newsletter_id]) {
        return res.status(400).json({
          error: 'newsletter_id invalido. Use: impulso-ia, dinheiro-simples ou renda-extra',
        });
      }

      const audienceId = await findAudienceId(newsletter_id);
      const contacts = await getAllContacts(audienceId);

      return res.status(200).json({
        success: true,
        newsletter: NEWSLETTERS[newsletter_id].name,
        total: contacts.length,
        subscribed: contacts.filter((c) => !c.unsubscribed).length,
        contacts: contacts.map((c) => ({
          id: c.id,
          email: c.email,
          first_name: c.first_name,
          last_name: c.last_name,
          unsubscribed: c.unsubscribed,
          created_at: c.created_at,
        })),
      });
    } catch (error) {
      console.error('List subscribers error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // --- DELETE: Remove subscriber ---
  if (req.method === 'DELETE') {
    try {
      if (!newsletter_id || !NEWSLETTERS[newsletter_id]) {
        return res.status(400).json({
          error: 'newsletter_id invalido',
        });
      }

      if (!email) {
        return res.status(400).json({ error: 'email e obrigatorio' });
      }

      const audienceId = await findAudienceId(newsletter_id);

      await resendFetch(
        `/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`,
        { method: 'DELETE' }
      );

      return res.status(200).json({
        success: true,
        message: `${email} removido da newsletter ${NEWSLETTERS[newsletter_id].name}`,
      });
    } catch (error) {
      console.error('Delete subscriber error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
