// Cloudflare Worker — API Router
// Replica os endpoints Vercel originais (api/*) num único Worker.
//
// Routes:
//   POST   /api/newsletter/subscribe
//   POST   /api/newsletter/send            (admin)
//   GET    /api/newsletter/subscribers     (admin OR public unsub via ?action=unsub)
//   DELETE /api/newsletter/subscribers     (admin)
//   POST   /api/product/download
//   POST   /api/mac-bridge/subscribe       (legacy, pode ser removido)
//   POST   /api/click/track                (legacy, pode ser removido)
//   POST   /api/minicurso/subscribe
//
// CORS preflight (OPTIONS) é tratado primeiro — todas as rotas suportam.

import { corsPreflight, jsonResponse } from './cors.js';
import { handle as newsletterSubscribe } from './handlers/newsletter-subscribe.js';
import { handle as newsletterSend }      from './handlers/newsletter-send.js';
import { handle as newsletterSubscribers } from './handlers/newsletter-subscribers.js';
import { handle as productDownload }     from './handlers/product-download.js';
import { handle as minicursoSubscribe }  from './handlers/minicurso-subscribe.js';

const ROUTES = [
  { path: '/api/newsletter/subscribe',     handler: newsletterSubscribe },
  { path: '/api/newsletter/send',          handler: newsletterSend },
  { path: '/api/newsletter/subscribers',   handler: newsletterSubscribers },
  { path: '/api/product/download',         handler: productDownload },
  { path: '/api/minicurso/subscribe',      handler: minicursoSubscribe },
];

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return corsPreflight(request);

    const url = new URL(request.url);
    const route = ROUTES.find(r => url.pathname === r.path);
    if (!route) {
      return jsonResponse({ error: 'Not found', path: url.pathname }, { status: 404 }, request.headers.get('Origin') || '');
    }

    try {
      return await route.handler(request, env);
    } catch (e) {
      console.error('Worker handler crash:', e.stack || e.message);
      return jsonResponse({ error: 'Internal server error', detail: e.message }, { status: 500 }, request.headers.get('Origin') || '');
    }
  },
};
