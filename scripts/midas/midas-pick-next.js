#!/usr/bin/env node
/**
 * Midas Next-Pick (v2 com manifest Cloudinary)
 *
 * Decide qual corte + qual conta publicar agora.
 * Estratégia: round-robin entre contas ativas, menos usado primeiro.
 * Usa manifest Cloudinary como fonte — funciona tanto local quanto em GitHub Actions.
 *
 * Output: JSON no stdout
 *   { video, account, url, public_id }
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const MANIFEST_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'cortes-manifest.json');
const STATE_IG = path.join(__dirname, '..', '..', 'midas', 'state', 'published-ig.json');
const STATE_YT = path.join(__dirname, '..', '..', 'midas', 'state', 'published-yt.json');

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

function main() {
  const args = parseArgs();
  const config = loadJson(CONFIG_PATH);
  const manifest = loadJson(MANIFEST_PATH, { cortes: [] });
  const ig = loadJson(STATE_IG, { published: [] });
  const yt = loadJson(STATE_YT, { published: [] });

  if (!manifest.cortes.length) throw new Error('Manifest vazio — rode midas-upload-all-cortes.js');

  const allActive = config.accounts.filter(a => a.active);
  if (!allActive.length) throw new Error('Nenhuma conta ativa em accounts.json');

  let account;
  if (args.account) {
    account = allActive.find(a => a.id === args.account);
    if (!account) throw new Error(`Conta inativa/inexistente: ${args.account}`);
  } else {
    const usageCount = Object.fromEntries(allActive.map(a => [a.id, 0]));
    for (const p of ig.published) if (usageCount[p.account] !== undefined) usageCount[p.account]++;
    for (const p of yt.published) if (usageCount[p.account] !== undefined) usageCount[p.account]++;
    allActive.sort((a, b) => usageCount[a.id] - usageCount[b.id]);
    account = allActive[0];
  }

  let corte;
  if (args.video) {
    corte = manifest.cortes.find(c => c.file === args.video);
    if (!corte) throw new Error(`Corte não está no manifest: ${args.video}`);
  } else {
    const usedByAccount = new Set();
    for (const p of ig.published) if (p.account === account.id) usedByAccount.add(p.video);
    for (const p of yt.published) if (p.account === account.id) usedByAccount.add(p.video);
    corte = manifest.cortes.find(c => !usedByAccount.has(c.file));
    if (!corte) {
      console.error(`⚠️  Pool esgotado pra ${account.id}, reset implícito`);
      corte = manifest.cortes[0];
    }
  }

  console.log(JSON.stringify({
    video: corte.file,
    account: account.id,
    url: corte.url,
    public_id: corte.public_id,
  }));
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('ERRO:', e.message); process.exit(1); }
}
