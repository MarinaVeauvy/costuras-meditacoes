#!/usr/bin/env node
/**
 * Midas — Publish via Upload-Post API
 *
 * Substitui midas-publish-ig.js, midas-publish-yt-shorts.js e midas-publish-publer.js.
 * Publica em IG + TikTok + YouTube numa chamada HTTP.
 *
 * Pré-requisitos:
 *   - Conta Upload-Post com profile criado (1 profile por conta social da Marina)
 *   - UPLOAD_POST_API_KEY no env
 *   - midas/config/accounts.json com upload_post_username por conta:
 *       upload_post_username: "pros_peridade_do_reino"
 *       upload_post_platforms: ["instagram", "youtube"]  (lista das conectadas)
 *
 * Uso:
 *   node midas-publish-upload-post.js \
 *     --account=pros_peridade_do_reino \
 *     --video=corte_00001.mp4 \
 *     --videoUrl=https://res.cloudinary.com/.../corte_00001.mp4
 *
 * Docs: https://docs.upload-post.com/openapi.json
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.upload-post.com/api';
const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const CAPTIONS_DIR = path.join(__dirname, '..', '..', 'midas', 'captions');
const STATE_DIR = path.join(__dirname, '..', '..', 'midas', 'state');

const YT_TITLE_MAX = 100; // Upload-Post rejeita acima disso

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

function appendPublished(platform, entry) {
  const file = path.join(STATE_DIR, `published-${platform}.json`);
  const data = loadJson(file, { published: [] });
  data.published = data.published || [];
  data.published.push(entry);
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function truncateTitle(hook, maxLen = YT_TITLE_MAX) {
  const suffix = ' #Shorts';
  const available = maxLen - suffix.length;
  const base = hook.length > available ? hook.slice(0, available).trimEnd() : hook;
  return base + suffix;
}

async function uploadPostCreate({ apiKey, profileUsername, platforms, videoUrl, captions }) {
  const form = new FormData();
  form.append('user', profileUsername);
  for (const p of platforms) form.append('platform[]', p);

  form.append('video', videoUrl);

  const ytTitle = truncateTitle(captions.hook || captions.full_caption || 'Post');
  form.append('title', ytTitle);

  if (platforms.includes('instagram')) {
    form.append('instagram_title', captions.caption_ig || captions.full_caption);
  }
  if (platforms.includes('youtube')) {
    form.append('youtube_title', ytTitle);
    form.append('description', captions.caption_youtube || captions.full_caption);
  }
  if (platforms.includes('tiktok')) {
    form.append('tiktok_title', captions.caption_tiktok || captions.full_caption);
  }

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { Authorization: `Apikey ${apiKey}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(`Upload-Post erro ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function pollStatus({ apiKey, requestId, maxAttempts = 24, delaySec = 10 }) {
  let lastData = null;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delaySec * 1000));
    const res = await fetch(`${API_BASE}/uploadposts/status?request_id=${requestId}`, {
      headers: { Authorization: `Apikey ${apiKey}` },
    });
    const data = await res.json();
    lastData = data;
    console.log(`  [${i + 1}/${maxAttempts}] status=${data.status} completed=${data.completed}/${data.total}`);
    if (data.status === 'completed' || data.status === 'failed' || data.completed === data.total) {
      return data;
    }
  }
  // Timeout depois de 4min: aceitar success parcial se ao menos 1 plataforma já completou
  if (lastData && lastData.completed >= 1 && Array.isArray(lastData.results)) {
    console.warn(`⚠️  Polling timeout após 4min, mas ${lastData.completed}/${lastData.total} já completou — aceitando success parcial.`);
    return { ...lastData, partial_timeout: true };
  }
  throw new Error('Polling timeout — Upload-Post ainda processando após 4min e nada completou');
}

async function main() {
  const args = parseArgs();
  if (!args.account || !args.video || !args.videoUrl) {
    throw new Error('Uso: --account=X --video=Y --videoUrl=Z');
  }

  const apiKey = process.env.UPLOAD_POST_API_KEY;
  if (!apiKey) throw new Error('UPLOAD_POST_API_KEY ausente');

  const config = loadJson(CONFIG_PATH);
  const account = config.accounts.find(a => a.id === args.account);
  if (!account) throw new Error(`Conta não encontrada: ${args.account}`);
  if (!account.upload_post_username) {
    throw new Error(`accounts.json[${args.account}].upload_post_username ausente`);
  }

  const videoBase = path.basename(args.video, '.mp4');
  const captions = loadJson(path.join(CAPTIONS_DIR, `${videoBase}.json`));
  if (!captions || !captions[account.id]) {
    throw new Error(`Captions ausentes pra ${account.id}`);
  }

  const platforms = account.upload_post_platforms || ['instagram', 'youtube'];
  console.log(`📤 [${account.id}] Publicando ${args.video} em: ${platforms.join(', ')}`);

  const initial = await uploadPostCreate({
    apiKey,
    profileUsername: account.upload_post_username,
    platforms,
    videoUrl: args.videoUrl,
    captions: captions[account.id],
  });

  console.log(`✅ Upload aceito. request_id=${initial.request_id} job_id=${initial.job_id}`);
  console.log('⏳ Aguardando confirmação (polling)...');

  const final = await pollStatus({ apiKey, requestId: initial.request_id });
  console.log('\n📊 Resultado final:');
  console.log(JSON.stringify(final.results, null, 2));

  for (const r of final.results || []) {
    const platformKey = r.platform === 'youtube' ? 'yt' : r.platform;
    const postId = r.platform_post_id || r.post_id || r.external_id || initial.job_id;
    const entry = {
      account: account.id,
      video: args.video,
      platform: r.platform,
      postId,
      success: r.success === true,
      status: r.status,
      requestId: initial.request_id,
      publishedAt: new Date().toISOString(),
    };
    if (r.platform === 'youtube' && r.platform_post_id) {
      entry.postUrl = `https://www.youtube.com/watch?v=${r.platform_post_id}`;
    }
    if (r.platform === 'instagram' && r.platform_post_id) {
      entry.postUrl = `https://www.instagram.com/p/${r.platform_post_id}/`;
    }
    appendPublished(platformKey, entry);
  }

  const anySuccess = (final.results || []).some(r => r.success);
  if (!anySuccess) {
    console.error('❌ Nenhuma plataforma publicou com sucesso');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
