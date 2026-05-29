#!/usr/bin/env node
/**
 * Midas Next-Pick (v4 — 3 tipos: corte_mac | story_post | versiculo)
 *
 * Decide qual conta + qual tipo publicar agora.
 *
 * Mix 50/35/15 (06/05 — pivot foco vendas afiliado MAC):
 *   - 50% corte_mac: cortes do Bruno com hook overlay
 *   - 35% story_post: narrativa Marina (gera 70% das vendas afiliado historicamente)
 *   - 15% versiculo: alimenta feed humano
 *
 * Sequência por conta (ciclo de 20 posts): C S C S C V C S C S C V C S C V C S C V
 * Onde C=corte_mac, S=story_post, V=versiculo
 *
 * Output: JSON no stdout
 *   versiculo:  { type: "versiculo", account }
 *   story_post: { type: "story_post", account }
 *   corte_mac:  { type: "corte_mac", account, video, url, public_id }
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const MANIFEST_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'cortes-manifest.json');
const CRISTAOS_MANIFEST = path.join(__dirname, '..', '..', 'midas', 'config', 'cristaos-manifest.json');
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

// Sequência ótima de 20 slots: 8 corte_mac (40%) + 5 corte_cristao (25%)
//                              + 4 story_post (20%) + 3 versiculo (15%)
// Distribuição: nunca 2 versiculos/cristaos seguidos, intercala formatos
const ROTATION_SEQUENCE = [
  'corte_mac',     'corte_cristao', 'corte_mac',     'story_post',
  'versiculo',     'corte_mac',     'corte_cristao', 'corte_mac',
  'story_post',    'corte_cristao', 'corte_mac',     'versiculo',
  'corte_mac',     'corte_cristao', 'story_post',    'corte_mac',
  'corte_cristao', 'corte_mac',     'story_post',    'versiculo',
];

function decideTypeForAccount(accountId, args, rotation) {
  // Forçado por flag
  if (['corte_mac', 'corte_cristao', 'story_post', 'versiculo'].includes(args.type)) return args.type;
  const accState = rotation.accounts[accountId] || {};
  const slotIdx = (accState.slot_idx || 0) % ROTATION_SEQUENCE.length;
  return ROTATION_SEQUENCE[slotIdx];
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

  // 2. Decide tipo POR CONTA via sequência fixa de 20 slots
  const postType = decideTypeForAccount(account.id, args, rotation);

  // 3. Atualiza state — avança slot_idx (loop em 20)
  const prevSlot = rotation.accounts[account.id]?.slot_idx || 0;
  const nextSlot = (prevSlot + 1) % ROTATION_SEQUENCE.length;
  rotation.accounts[account.id] = {
    last_type: postType,
    slot_idx: nextSlot,
    updated_at: new Date().toISOString(),
  };
  saveRotation(rotation);

  if (postType === 'versiculo') {
    console.log(JSON.stringify({ type: 'versiculo', account: account.id }));
    return;
  }
  if (postType === 'story_post') {
    console.log(JSON.stringify({ type: 'story_post', account: account.id }));
    return;
  }
  if (postType === 'corte_cristao') {
    // Busca corte cristao pre-gerado do banco; sinaliza se precisa gerar on-demand
    const MIN = parseInt(process.env.MIN_VIRAL_SCORE || '80', 10);
    const FALLBACK = parseInt(process.env.FALLBACK_VIRAL_SCORE || '60', 10);
    const cristaos = loadJson(CRISTAOS_MANIFEST, { cristaos: [] });
    const usedSet = new Set();
    for (const p of (ig.published || [])) {
      if (p.account === account.id && (p.source === 'corte_cristao' || /cristao_/.test(p.video || ''))) usedSet.add(p.video);
    }
    for (const p of (yt.published || [])) {
      if (p.account === account.id && (p.source === 'corte_cristao' || /cristao_/.test(p.video || ''))) usedSet.add(p.video);
    }
    const unused = (cristaos.cristaos || []).filter(c => !usedSet.has(c.file));
    const publishable = unused.filter(c => (c.viral_score || 0) >= MIN);
    const unscored = unused.filter(c => c.viral_score === undefined);
    const fallback = unused.filter(c => {
      const s = c.viral_score;
      return s !== undefined && s >= FALLBACK && s < MIN;
    });
    publishable.sort((a, b) => (b.viral_score || 0) - (a.viral_score || 0));
    fallback.sort((a, b) => (b.viral_score || 0) - (a.viral_score || 0));

    let pick = publishable[0] || unscored[0] || fallback[0] || unused[0];
    if (!pick) {
      // Banco vazio — sinaliza "generate on-demand"
      console.log(JSON.stringify({
        type: 'corte_cristao',
        account: account.id,
        generate_on_demand: true,
        reason: 'banco_vazio',
      }));
      return;
    }
    console.log(JSON.stringify({
      type: 'corte_cristao',
      video: pick.file,
      account: account.id,
      url: pick.url,
      public_id: pick.public_id,
      template_id: pick.template_id,
      viral_score: pick.viral_score,
      hook_strength: pick.hook_strength,
      theme_category: pick.theme_category || 'fe',
    }));
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
    // Gate de score: prioriza cortes >= MIN_VIRAL_SCORE (default 80).
    // Fallback gracioso: se nenhum passar, usa cortes sem score; se tudo esta
    // scorado e nada >= gate, libera ate score >= FALLBACK_SCORE (60).
    const MIN_VIRAL_SCORE = parseInt(process.env.MIN_VIRAL_SCORE || '80', 10);
    const FALLBACK_VIRAL_SCORE = parseInt(process.env.FALLBACK_VIRAL_SCORE || '60', 10);
    const unused = manifest.cortes.filter(c => !usedByAccount.has(c.file));

    const publishable = unused.filter(c => (c.viral_score || 0) >= MIN_VIRAL_SCORE);
    const unscored = unused.filter(c => c.viral_score === undefined);
    const fallback = unused.filter(c => {
      const s = c.viral_score;
      return s !== undefined && s >= FALLBACK_VIRAL_SCORE && s < MIN_VIRAL_SCORE;
    });

    // Ordena por viral_score DESC (cortes com score mais alto primeiro)
    publishable.sort((a, b) => (b.viral_score || 0) - (a.viral_score || 0));
    fallback.sort((a, b) => (b.viral_score || 0) - (a.viral_score || 0));

    if (publishable.length > 0) {
      corte = publishable[0];
    } else if (unscored.length > 0) {
      // Cortes sem score ainda — assume neutro e usa
      corte = unscored[0];
      console.error(`ℹ️  Sem cortes >=${MIN_VIRAL_SCORE}, usando unscored: ${corte.file}`);
    } else if (fallback.length > 0) {
      corte = fallback[0];
      console.error(`⚠️  Sem cortes >=${MIN_VIRAL_SCORE}, fallback >=${FALLBACK_VIRAL_SCORE}: ${corte.file} (vs=${corte.viral_score})`);
    } else if (unused.length > 0) {
      corte = unused[0];
      console.error(`⚠️  Todos cortes <${FALLBACK_VIRAL_SCORE}, usando melhor disponivel: ${corte.file} (vs=${corte.viral_score})`);
    } else {
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
    viral_score: corte.viral_score,
    hook_strength: corte.hook_strength,
    theme_category: corte.theme_category,
  }));
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('ERRO:', e.message); process.exit(1); }
}
