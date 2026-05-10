// CORS helper — replicado dos endpoints Vercel originais

const ALLOWED_ORIGINS = [
  'https://marinaveauvy.github.io',
  'https://marinaveauvy.com.br',
  'https://www.marinaveauvy.com.br',
  'https://quiz.marinaveauvy.com.br',
  'http://localhost:3000',
];

export function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    'Vary': 'Origin',
  };
}

export function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin);
}

export function jsonResponse(body, init = {}, origin = '') {
  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders(origin),
    ...(init.headers || {}),
  };
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function corsPreflight(req) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get('Origin') || ''),
  });
}
