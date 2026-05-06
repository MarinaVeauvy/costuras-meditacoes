/**
 * Click Tracking — Vercel Serverless Function
 * POST /api/click/track
 *
 * Recebe beacon de cliques no link-in-bio (bio.html) e armazena log
 * agregado pra análise. Não bloqueia user (sendBeacon).
 *
 * Storage: console log (Vercel Logs visível no dashboard) +
 * agregação semanal lida pelo dashboard /metricas.html.
 *
 * Body: { from, platform, action, dest, ts }
 */

module.exports = async (req, res) => {
  // CORS — bio é servida do GitHub Pages
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const event = {
    type: 'click',
    from: body?.from || 'unknown',
    platform: body?.platform || '',
    action: body?.action || 'unknown',
    dest: body?.dest || 'unknown',
    ua: (req.headers['user-agent'] || '').slice(0, 200),
    ip_country: req.headers['x-vercel-ip-country'] || '',
    referer: (req.headers['referer'] || '').slice(0, 200),
    ts: body?.ts || Date.now(),
    iso: new Date().toISOString(),
  };

  // Vercel Logs persiste 24h (Pro: 7d). Pra retenção longa, agregar via dashboard.
  console.log(`CLICK ${JSON.stringify(event)}`);

  return res.status(200).json({ ok: true });
};
