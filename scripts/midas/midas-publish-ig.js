#!/usr/bin/env node
/**
 * Midas Instagram Reels Publisher
 *
 * Publica 1 reel em 1 conta IG Business via Graph API.
 * Uso:
 *   node midas-publish-ig.js --account=pros_peridade_do_reino --video=corte_00001.mp4
 *
 * Env vars necessárias:
 *   IG_TOKEN_<N>  - Access token da conta N
 *   MIDAS_CORTES_DIR - Caminho local dos cortes (default: C:/Users/marin/midas-cortes/Cortes Prontos)
 */

const fs = require('fs');
const path = require('path');

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const STATE_PATH = path.join(__dirname, '..', '..', 'midas', 'state', 'published-ig.json');
const CORTES_DIR = process.env.MIDAS_CORTES_DIR || 'C:/Users/marin/midas-cortes/Cortes Prontos';

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    args[k] = v || true;
  }
  return args;
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { published: [] };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function createReelContainer({ igBusinessId, accessToken, videoUrl, caption }) {
  const url = `${GRAPH_BASE}/${igBusinessId}/media`;
  const body = new URLSearchParams({
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    access_token: accessToken,
  });
  const res = await fetch(url, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok) throw new Error(`createReelContainer failed: ${JSON.stringify(json)}`);
  return json.id;
}

async function waitForContainerReady({ containerId, accessToken, maxWaitMs = 180000 }) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const url = `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status_code === 'FINISHED') return true;
    if (json.status_code === 'ERROR') throw new Error(`Container error: ${JSON.stringify(json)}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('Container timeout — did not reach FINISHED within 3min');
}

async function publishContainer({ igBusinessId, accessToken, containerId }) {
  const url = `${GRAPH_BASE}/${igBusinessId}/media_publish`;
  const body = new URLSearchParams({ creation_id: containerId, access_token: accessToken });
  const res = await fetch(url, { method: 'POST', body });
  const json = await res.json();
  if (!res.ok) throw new Error(`publishContainer failed: ${JSON.stringify(json)}`);
  return json.id;
}

async function main() {
  const args = parseArgs();
  if (!args.account || !args.video) {
    console.error('Uso: node midas-publish-ig.js --account=<id> --video=<arquivo.mp4> [--caption="texto"]');
    process.exit(1);
  }

  const config = loadConfig();
  const account = config.accounts.find(a => a.id === args.account);
  if (!account) throw new Error(`Conta não encontrada: ${args.account}`);
  if (!account.active) throw new Error(`Conta inativa: ${args.account}`);
  if (account.instagram_business_id === 'PENDING_META_SETUP') {
    throw new Error(`Conta ${args.account} ainda sem IG Business ID configurado`);
  }

  const accessToken = process.env[account.instagram_access_token_env];
  if (!accessToken) throw new Error(`Env var ausente: ${account.instagram_access_token_env}`);

  if (!args.videoUrl) {
    throw new Error('IG Graph API exige URL pública do vídeo. Passe --videoUrl=https://... (do manifest Cloudinary)');
  }

  const caption = args.caption || `Link na bio 👆\n\n${config.affiliate_link ? '' : ''}`;

  console.log(`[${account.id}] Criando container Reel...`);
  const containerId = await createReelContainer({
    igBusinessId: account.instagram_business_id,
    accessToken,
    videoUrl: args.videoUrl,
    caption,
  });
  console.log(`Container: ${containerId}`);

  console.log('Aguardando processamento...');
  await waitForContainerReady({ containerId, accessToken });

  console.log('Publicando...');
  const mediaId = await publishContainer({
    igBusinessId: account.instagram_business_id,
    accessToken,
    containerId,
  });
  console.log(`✅ Publicado! Media ID: ${mediaId}`);

  const state = loadState();
  state.published.push({
    account: args.account,
    video: args.video,
    caption,
    mediaId,
    publishedAt: new Date().toISOString(),
  });
  saveState(state);
}

if (require.main === module) {
  main().catch(err => {
    console.error('ERRO:', err.message);
    process.exit(1);
  });
}

module.exports = { createReelContainer, waitForContainerReady, publishContainer };
