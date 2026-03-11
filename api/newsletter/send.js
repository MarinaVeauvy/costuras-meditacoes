/**
 * Newsletter Send — Vercel Serverless Function
 * POST /api/newsletter/send
 *
 * Accepts: { newsletter_id, subject, html_content, admin_key }
 * Fetches all subscribers for that newsletter from Resend Audiences,
 * then sends via batch email API.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;

const ALLOWED_ORIGINS = [
  'https://marinaveauvy.github.io',
  'https://marinaveauvy.com.br',
  'https://www.marinaveauvy.com.br',
];

const NEWSLETTERS = {
  'impulso-ia': {
    name: 'Impulso IA',
    from: 'Impulso IA <impulso@marinaveauvy.com.br>',
    audienceId: '20a1b639-8752-4008-9db2-2bf54e98da51',
  },
  'dinheiro-simples': {
    name: 'Dinheiro Simples',
    from: 'Dinheiro Simples <dinheiro@marinaveauvy.com.br>',
    audienceId: '29856ea4-2cf0-4721-b3c3-2c954ea051c1',
  },
  'renda-extra': {
    name: 'Renda Extra Report',
    from: 'Renda Extra Report <renda@marinaveauvy.com.br>',
    audienceId: '0be5cf6b-98fe-4799-bec9-b4658a52d555',
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

function getAudienceId(newsletterId) {
  const newsletter = NEWSLETTERS[newsletterId];
  if (!newsletter || !newsletter.audienceId) {
    throw new Error(`Unknown newsletter_id: ${newsletterId}`);
  }
  return newsletter.audienceId;
}

/**
 * Fetch ALL contacts for an audience, handling pagination.
 * Returns only subscribed contacts.
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

    const batch = (res.data || []).filter((c) => !c.unsubscribed);
    contacts.push(...batch);

    hasMore = res.has_more === true;
    if (hasMore && batch.length > 0) {
      after = batch[batch.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  return contacts;
}

/**
 * Send emails in batches of up to 100 (Resend batch limit).
 */
async function sendBatchEmails(from, subject, htmlContent, contacts) {
  const results = { sent: 0, failed: 0, errors: [] };

  // Add unsubscribe link to HTML
  const unsubBase = 'https://costuras-meditacoes.vercel.app/api/newsletter/subscribers';

  for (let i = 0; i < contacts.length; i += 100) {
    const chunk = contacts.slice(i, i + 100);

    const emails = chunk.map((contact) => {
      // Personalize unsubscribe footer
      const unsubLink = `${unsubBase}?action=unsub&email=${encodeURIComponent(contact.email)}`;
      const footer = `
        <div style="text-align:center;padding:20px;font-size:12px;color:#999;border-top:1px solid #eee;margin-top:30px;">
          <p>Voce recebeu este email porque se inscreveu na nossa newsletter.</p>
          <p><a href="${unsubLink}" style="color:#999;">Cancelar inscricao</a></p>
        </div>
      `;
      return {
        from,
        to: contact.email,
        subject,
        html: htmlContent + footer,
      };
    });

    try {
      await resendFetch('/emails/batch', {
        method: 'POST',
        body: JSON.stringify(emails),
      });
      results.sent += chunk.length;
    } catch (error) {
      results.failed += chunk.length;
      results.errors.push(error.message);
    }
  }

  return results;
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
    const { newsletter_id, subject, html_content, admin_key } = req.body || {};

    // Auth check
    if (admin_key !== ADMIN_KEY) {
      return res.status(401).json({ error: 'Admin key invalida' });
    }

    // Validate inputs
    if (!newsletter_id || !NEWSLETTERS[newsletter_id]) {
      return res.status(400).json({
        error: 'newsletter_id invalido. Use: impulso-ia, dinheiro-simples ou renda-extra',
      });
    }

    if (!subject || !html_content) {
      return res.status(400).json({
        error: 'subject e html_content sao obrigatorios',
      });
    }

    const newsletter = NEWSLETTERS[newsletter_id];

    // Get audience ID
    const audienceId = getAudienceId(newsletter_id);

    // Get all subscribed contacts
    const contacts = await getAllContacts(audienceId);

    if (contacts.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Nenhum inscrito encontrado para esta newsletter',
        sent: 0,
        failed: 0,
      });
    }

    // Send emails
    const results = await sendBatchEmails(
      newsletter.from,
      subject,
      html_content,
      contacts
    );

    return res.status(200).json({
      success: true,
      newsletter: newsletter.name,
      total_subscribers: contacts.length,
      sent: results.sent,
      failed: results.failed,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error) {
    console.error('Send error:', error);
    return res.status(500).json({ error: error.message || 'Erro interno' });
  }
};
