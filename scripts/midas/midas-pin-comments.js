#!/usr/bin/env node
/**
 * Midas — Pin Comments retroativo
 *
 * Aplica comentário-driver ("Comenta AMÉM..." etc) em todos os posts
 * IG já publicados. Brendan Kane: comment é peso máximo no algoritmo.
 *
 * Uso:
 *   node midas-pin-comments.js              # dry-run, lista posts
 *   node midas-pin-comments.js --execute    # aplica de verdade
 *   node midas-pin-comments.js --account=pros_peridade_do_reino --execute
 *   node midas-pin-comments.js --since=2026-04-29 --execute
 *
 * Env vars: IG_TOKEN_<N> (mesmo padrão do publisher)
 */

const fs = require('fs');
const path = require('path');

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const STATE_PATH = path.join(__dirname, '..', '..', 'midas', 'state', 'published-instagram.json');
const PIN_STATE_PATH = path.join(__dirname, '..', '..', 'midas', 'state', 'pinned-comments.json');

const COMMENT_DRIVERS_BY_PERSONA = {
  'prosperidade-do-reino': [
    'Comenta AMÉM se concorda 🙏',
    'Comenta SIM e te mando uma palavra de fé 🤍',
    'Comenta 1 se quer aprofundar isso aqui',
  ],
  'mae-empreendedora': [
    'Comenta SIM se também sente isso na sua casa 🤍',
    'Comenta AMÉM se acredita que dá pra prosperar com fé 🙏',
    'Conta aqui: você já passou por isso?',
  ],
  'transformacao': [
    'Conta aqui: o que mudou na sua vida?',
    'Comenta SIM se você precisa ouvir isso hoje 🙏',
    'Comenta AMÉM e fica firme 🤍',
  ],
  default: [
    'Comenta AMÉM se concorda 🙏',
    'Comenta SIM e te mando o resto 🤍',
  ],
};

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    args[k] = v === undefined ? true : v;
  }
  return args;
}

function getTokenForAccount(accountId, allActive) {
  const idx = allActive.findIndex(a => a.id === accountId);
  if (idx === -1) throw new Error(`Conta inativa/desconhecida: ${accountId}`);
  const tokenN = idx + 1;
  const token = process.env[`IG_TOKEN_${tokenN}`];
  if (!token) throw new Error(`IG_TOKEN_${tokenN} não definido para ${accountId}`);
  return token;
}

function pickComment(persona, postId) {
  const pool = COMMENT_DRIVERS_BY_PERSONA[persona] || COMMENT_DRIVERS_BY_PERSONA.default;
  // Determinístico por postId pra idempotência
  const hash = [...String(postId)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return pool[hash % pool.length];
}

async function postComment({ mediaId, accessToken, message }) {
  const url = `${GRAPH_BASE}/${mediaId}/comments`;
  const body = new URLSearchParams({ message, access_token: accessToken });
  const res = await fetch(url, { method: 'POST', body });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`comment fail: ${JSON.stringify(data.error || data)}`);
  }
  return data.id;
}

async function loadPinned() {
  if (!fs.existsSync(PIN_STATE_PATH)) return { pinned: [] };
  return JSON.parse(fs.readFileSync(PIN_STATE_PATH, 'utf8'));
}

function savePinned(state) {
  fs.mkdirSync(path.dirname(PIN_STATE_PATH), { recursive: true });
  fs.writeFileSync(PIN_STATE_PATH, JSON.stringify(state, null, 2));
}

async function main() {
  const args = parseArgs();
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const allActive = config.accounts.filter(a => a.active);

  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  let posts = state.published.filter(p => p.platform === 'instagram' && p.success);

  if (args.account) posts = posts.filter(p => p.account === args.account);
  if (args.since) {
    const cut = new Date(args.since).getTime();
    posts = posts.filter(p => new Date(p.publishedAt).getTime() >= cut);
  }

  const pinnedState = await loadPinned();
  const alreadyPinned = new Set(pinnedState.pinned.map(p => p.mediaId));
  posts = posts.filter(p => !alreadyPinned.has(p.postId));

  console.log(`Posts elegíveis para pin comment: ${posts.length}`);
  if (!posts.length) {
    console.log('Nada a fazer (todos já têm pin OU filtros vazios).');
    return;
  }

  if (!args.execute) {
    console.log('\n=== DRY-RUN (use --execute para aplicar) ===');
    for (const p of posts) {
      const account = allActive.find(a => a.id === p.account);
      const comment = pickComment(account?.persona, p.postId);
      console.log(`- ${p.account} :: ${p.video} :: ${p.postId}`);
      console.log(`  → "${comment}"`);
    }
    return;
  }

  console.log('\n=== EXECUTANDO ===');
  let ok = 0, fail = 0;
  for (const p of posts) {
    const account = allActive.find(a => a.id === p.account);
    if (!account) { console.warn(`  ⚠️  conta ${p.account} não está mais ativa, pulando`); continue; }

    let token;
    try { token = getTokenForAccount(p.account, allActive); }
    catch (e) { console.warn(`  ⚠️  ${e.message}`); fail++; continue; }

    const comment = pickComment(account.persona, p.postId);
    try {
      const commentId = await postComment({ mediaId: p.postId, accessToken: token, message: comment });
      pinnedState.pinned.push({
        mediaId: p.postId,
        commentId,
        comment,
        account: p.account,
        postedAt: new Date().toISOString(),
      });
      savePinned(pinnedState);
      console.log(`  ✅ ${p.account} ${p.postId} → "${comment}" (cId=${commentId})`);
      ok++;
      // throttle pra evitar rate limit (60 req/h por user em IG Graph)
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.error(`  ❌ ${p.account} ${p.postId}: ${e.message}`);
      fail++;
    }
  }
  console.log(`\nResultado: ${ok} ok, ${fail} falhas. State em ${PIN_STATE_PATH}`);
  console.log('\n⚠️  IG Graph API NÃO suporta "pin" de comentário próprio via API.');
  console.log('   O comentário foi POSTADO. Marina precisa abrir cada post no app e fixar manualmente');
  console.log('   (3 dots no comentário → Fixar) — leva ~10 segundos por post.');
}

main().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
