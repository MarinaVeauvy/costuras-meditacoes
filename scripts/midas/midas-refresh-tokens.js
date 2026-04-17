#!/usr/bin/env node
/**
 * Midas IG Token Refresh
 *
 * Long-lived tokens IG vencem em 60 dias.
 * Roda 1x/mês via GitHub Action pra trocar antes de vencer.
 *
 * Uso: node midas-refresh-tokens.js
 *
 * Env:
 *   META_APP_ID
 *   META_APP_SECRET
 *   IG_TOKEN_1, IG_TOKEN_2, IG_TOKEN_3 (tokens atuais)
 *
 * Output: imprime novos tokens no stdout (pra atualizar Secret manualmente)
 *         OU chama GitHub API pra atualizar secret (se GH_TOKEN configurado)
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

async function refreshToken(currentToken) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error('META_APP_ID e META_APP_SECRET obrigatórios');

  const url = `${GRAPH_BASE}/oauth/access_token?` +
    `grant_type=fb_exchange_token&` +
    `client_id=${appId}&` +
    `client_secret=${appSecret}&` +
    `fb_exchange_token=${currentToken}`;

  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(`Refresh failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function tokenExpiresAt(token) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const url = `${GRAPH_BASE}/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || !json.data) return null;
  return json.data.data_access_expires_at
    ? new Date(json.data.data_access_expires_at * 1000)
    : null;
}

async function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const results = [];

  for (const account of config.accounts) {
    const envKey = account.instagram_access_token_env;
    const current = process.env[envKey];
    if (!current) {
      console.warn(`⚠️  ${account.id}: ${envKey} não setado, pulando`);
      continue;
    }

    const expiresAt = await tokenExpiresAt(current);
    const daysLeft = expiresAt ? Math.floor((expiresAt - Date.now()) / 86400000) : '?';
    console.log(`${account.id}: expira em ${daysLeft} dias (${expiresAt?.toISOString() || 'desconhecido'})`);

    if (daysLeft !== '?' && daysLeft > 20) {
      console.log(`   → ainda longe do vencimento, skip`);
      continue;
    }

    console.log(`   → renovando...`);
    try {
      const newToken = await refreshToken(current);
      results.push({ account: account.id, env: envKey, token: newToken });
      console.log(`   ✅ Renovado`);
    } catch (err) {
      console.error(`   ❌ Falhou: ${err.message}`);
    }
  }

  if (results.length) {
    console.log('\n📋 Novos tokens (atualizar nos GitHub Secrets):\n');
    for (const r of results) {
      console.log(`${r.env}=${r.token}`);
    }
    console.log('\n⚠️  Por segurança, os tokens não são salvos automaticamente em .env/Secrets.');
    console.log('    Copia os valores acima e atualiza manualmente em:');
    console.log('    https://github.com/<user>/<repo>/settings/secrets/actions');
  } else {
    console.log('\n✅ Nenhum token precisa renovar agora.');
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('ERRO:', err.message);
    process.exit(1);
  });
}
