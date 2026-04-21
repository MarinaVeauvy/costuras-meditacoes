#!/usr/bin/env node
/**
 * Midas — Publer Accounts Lister
 *
 * Lista workspaces + contas conectadas no Publer Business.
 * Rode depois de:
 *   1. Upgrade Publer → Business plan
 *   2. Conectar IG/TikTok/YT das contas na UI do Publer
 *   3. Gerar API key em Settings → API
 *
 * Uso:
 *   PUBLER_API_KEY=xxx node scripts/midas/midas-publer-list-accounts.js
 *
 * Output: JSON com workspace_id + account_id de cada conta/plataforma,
 * pronto pra preencher midas/config/accounts.json.
 */

const API_BASE = 'https://app.publer.io/api/v1';

async function main() {
  const apiKey = process.env.PUBLER_API_KEY;
  if (!apiKey) throw new Error('PUBLER_API_KEY ausente no env');

  const headers = {
    Authorization: `Bearer-API ${apiKey}`,
    'Content-Type': 'application/json',
  };

  console.log('🔍 Listando workspaces...');
  const ws = await fetch(`${API_BASE}/workspaces`, { headers }).then(r => r.json());
  if (!ws || ws.error) throw new Error(`Erro workspaces: ${JSON.stringify(ws)}`);
  console.log(JSON.stringify(ws, null, 2));

  const workspaces = Array.isArray(ws) ? ws : ws.workspaces || ws.data || [];
  if (!workspaces.length) {
    console.log('⚠️ Nenhum workspace retornado. Check API key.');
    return;
  }

  for (const w of workspaces) {
    const wid = w.id || w._id;
    console.log(`\n═══════════════════════════════════════`);
    console.log(`Workspace: ${w.name || '(sem nome)'} | ID: ${wid}`);

    const accountsHeaders = { ...headers, 'Publer-Workspace-Id': wid };
    const accounts = await fetch(`${API_BASE}/accounts`, { headers: accountsHeaders }).then(r => r.json());
    console.log('Contas conectadas:');
    console.log(JSON.stringify(accounts, null, 2));
  }
}

main().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
