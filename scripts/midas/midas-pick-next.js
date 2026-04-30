#!/usr/bin/env node
/**
 * Midas Next-Pick (v3 — alternância POR CONTA + state files corretos)
 *
 * Decide qual conta + qual tipo (corte_mac | versiculo) publicar agora.
 *
 * Lógica nova (29/04 fix):
 * 1. Round-robin de conta lendo published-instagram.json + published-yt.json
 *    (BUG corrigido: antes lia published-ig.json que nunca era atualizado)
 * 2. Tipo alterna POR CONTA (não global). Cada conta tem seu próprio
 *    last_type em post-rotation.json. Garante intercalação 1:1 dentro
 *    de cada conta.
 *
 * Output: JSON no stdout
 *   versiculo: { type, account }
 *   corte_mac: { type, account, video, url, public_id }
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const MANIFEST_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'cortes-manifest.json');
const STATE_IG = path.join(__dirname, '..', '..', 'midas', 'state', 'published-instagram.json');
const STATE_YT = path.join(__dirname, '..', '..', 'midas', 'state', 'published-yt.json');
const ROTATION_PATH = path.join(__dirname, '..', '..', 'midas', 'state', 'post-rotation.json');

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    args[k] = v || true;
  }
  return args;
}

function loadJson(filepath, defaultVal = null) {
  if (!fs.existsSync(filepath)) return defaultVal;
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function loadRotation() {
  // Estrutura nova: { accounts: { acc_id: { last_type, updated_at } }, last_type (legacy) }
  const r = loadJson(ROTATION_PATH, { accounts: {} });
  if (!r.accounts) r.accounts = {};
  return r;
}

function saveRotation(rotation) {
  fs.mkdirSync(path.dirname(ROTATION_PATH), { recursive: true });
  fs.writeFileSync(ROTATION_PATH, JSON.stringify(rotation, null, 2));
}

function decideTypeForAccount(accountId, args, rotation) {
  // Forçado por flag
  if (args.type === 'corte_mac' || args.type === 'versiculo') return args.type;
  const accState = rotation.accounts[accountId] || {};
  if (accState.last_type === 'corte_mac') return 'versiculo';
  return 'corte_mac'; // default e após versiculo, volta pro corte
}

function pickAccount(args, allActive, ig, yt) {
  if (args.account) {
    const account = allActive.find(a => a.id === args.account);
    if (!account) throw new Error(`Conta inativa/inexistente: ${args.account}`);
    return account;
  }
  // Round-robin: conta com menor uso total. Empate → alfabético.
  const usageCount = Object.fromEntries(allActive.map(a => [a.id, 0]));
  for (const p of ig.published || []) if (usageCount[p.account] !== undefined) usageCount[p.account]++;
  for (const p of yt.published || []) if (usageCount[p.account] !== undefined) usageCount[p.account]++;
  const sorted = [...allActive].sort((a, b) => {
    const diff = usageCount[a.id] - usageCount[b.id];
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });
  return sorted[0];
}

function main() {
  const args = parseArgs();
  const config = loadJson(CONFIG_PATH);
  const manifest = loadJson(MANIFEST_PATH, { cortes: [] });
  const ig = loadJson(STATE_IG, { published: [] });
  const yt = loadJson(STATE_YT, { published: [] });
  const rotation = loadRotation();

  const allActive = config.accounts.filter(a => a.active);
  if (!allActive.length) throw new Error('Nenhuma conta ativa em accounts.json');

  // 1. Escolhe conta primeiro (round-robin por usage)
  const account = pickAccount(args, allActive, ig, yt);

  // 2. Decide tipo POR CONTA
  const postType = decideTypeForAccount(account.id, args, rotation);

  // 3. Atualiza state da conta
  rotation.accounts[account.id] = {
    last_type: postType,
    updated_at: new Date().toISOString(),
  };
  saveRotation(rotation);

  if (postType === 'versiculo') {
    console.log(JSON.stringify({ type: 'versiculo', account: account.id }));
    return;
  }

  // corte_mac
  if (!manifest.cortes.length) throw new Error('Manifest vazio — rode midas-upload-all-cortes.js');

  let corte;
  if (args.video) {
    corte = manifest.cortes.find(c => c.file === args.video);
    if (!corte) throw new Error(`Corte não está no manifest: ${args.video}`);
  } else {
    // Próximo corte não usado por essa conta
    const usedByAccount = new Set();
    for (const p of ig.published || []) {
      if (p.account === account.id) {
        // Aceita tanto video original quanto _hooked
        const base = (p.video || '').replace(/_hooked\.mp4$/, '.mp4');
        usedByAccount.add(base);
      }
    }
    for (const p of yt.published || []) {
      if (p.account === account.id) {
        const base = (p.video || '').replace(/_hooked\.mp4$/, '.mp4');
        usedByAccount.add(base);
      }
    }
    corte = manifest.cortes.find(c => !usedByAccount.has(c.file));
    if (!corte) {
      console.error(`⚠️  Pool esgotado pra ${account.id}, reset implícito`);
      corte = manifest.cortes[0];
    }
  }

  console.log(JSON.stringify({
    type: 'corte_mac',
    video: corte.file,
    account: account.id,
    url: corte.url,
    public_id: corte.public_id,
  }));
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('ERRO:', e.message); process.exit(1); }
}
