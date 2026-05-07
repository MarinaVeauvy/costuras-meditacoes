#!/usr/bin/env node
/**
 * Midas — Instagram Story Publisher
 *
 * Publica 1 story (vídeo OU imagem) em 1 conta IG Business via Graph API.
 * Suporta 2 modos:
 *   --mode=cross-post  : reposta vídeo de Reel publicado como story
 *   --mode=engagement  : posta imagem de pergunta/enquete pra engajamento
 *
 * Uso:
 *   node midas-publish-story.js --account=pros_peridade_do_reino --videoUrl=https://...
 *   node midas-publish-story.js --account=orar_prosperar --imageUrl=https://...
 *
 * Env vars: IG_TOKEN_<N> (mesmo padrão do publisher de Reels)
 */

const fs = require('fs');
const path = require('path');

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const STATE_PATH = path.join(__dirname, '..', '..', 'midas', 'state', 'published-stories.json');

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.replace(/^--/, '').split('=');
    args[k] = v === undefined ? true : v;
  }
  return args;
}

function loadJson(p, def = null) {
  if (!fs.existsSync(p)) return def;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function getTokenForAccount(accountId, allActive) {
  const idx = allActive.findIndex(a => a.id === accountId);
  if (idx === -1) throw new Error(`Conta inativa/desconhecida: ${accountId}`);
  const tokenN = idx + 1;
  const token = process.env[`IG_TOKEN_${tokenN}`];
  if (!token) throw new Error(`IG_TOKEN_${tokenN} não definido para ${accountId}`);
  return token;
}

async function createStoryContainer({ igBusinessId, accessToken, mediaUrl, isVideo }) {
  const url = `${GRAPH_BASE}/${igBusinessId}/media`;
  const body = new URLSearchParams({
    media_type: 'STORIES',
    access_token: accessToken,
  });
  if (isVideo) body.append('video_url', mediaUrl);
  else body.append('image_url', mediaUrl);

  const res = await fetch(url, { method: 'POST', body });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Story container falhou: ${JSON.stringify(data.error || data)}`);
  }
  return data.id;
}

async function waitContainerReady(containerId, accessToken, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`);
    const data = await res.json();
    if (data.status_code === 'FINISHED') return true;
    if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') {
      throw new Error(`Container falhou: ${JSON.stringify(data)}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('Container não ficou pronto após 150s');
}

async function publishStory({ igBusinessId, accessToken, containerId }) {
  const url = `${GRAPH_BASE}/${igBusinessId}/media_publish`;
  const body = new URLSearchParams({
    creation_id: containerId,
    access_token: accessToken,
  });
  const res = await fetch(url, { method: 'POST', body });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Publish story falhou: ${JSON.stringify(data.error || data)}`);
  }
  return data.id;
}

async function main() {
  const args = parseArgs();
  if (!args.account) throw new Error('--account obrigatório');
  if (!args.videoUrl && !args.imageUrl) throw new Error('--videoUrl ou --imageUrl obrigatório');

  const config = loadJson(CONFIG_PATH);
  const allActive = config.accounts.filter(a => a.active);
  const account = allActive.find(a => a.id === args.account);
  if (!account) throw new Error(`Conta inativa: ${args.account}`);
  if (!account.instagram_business_id || account.instagram_business_id === 'PENDING_META_SETUP') {
    throw new Error(`instagram_business_id pendente em ${args.account}`);
  }

  const token = getTokenForAccount(args.account, allActive);
  const isVideo = !!args.videoUrl;
  const mediaUrl = args.videoUrl || args.imageUrl;
  const mode = args.mode || (isVideo ? 'cross-post' : 'engagement');

  console.log(`📲 Story ${mode} em ${args.account}: ${isVideo ? 'video' : 'image'}`);

  const containerId = await createStoryContainer({
    igBusinessId: account.instagram_business_id,
    accessToken: token,
    mediaUrl,
    isVideo,
  });
  console.log(`  Container ${containerId}, aguardando processar...`);

  await waitContainerReady(containerId, token);

  const storyId = await publishStory({
    igBusinessId: account.instagram_business_id,
    accessToken: token,
    containerId,
  });
  console.log(`  ✅ Story publicada: ${storyId}`);

  const state = loadJson(STATE_PATH, { stories: [] });
  state.stories = state.stories || [];
  state.stories.push({
    account: args.account,
    storyId,
    mode,
    mediaUrl,
    type: isVideo ? 'video' : 'image',
    sourceVideo: args.sourceVideo || null,
    publishedAt: new Date().toISOString(),
  });
  saveJson(STATE_PATH, state);

  process.stdout.write(JSON.stringify({ storyId, account: args.account, mode }));
}

if (require.main === module) {
  main().catch(err => { console.error('ERRO story:', err.message); process.exit(1); });
}
