#!/usr/bin/env node
/**
 * Midas — Gerador de Reel de versículo
 *
 * Pega próximo versículo do pool (rotação), gera MP4 vertical 12s via FFmpeg
 * (gradient + texto + referência), upa pro Cloudinary, retorna metadata.
 *
 * Output (stdout, JSON):
 *   { video, public_id, url, type: "versiculo", caption, hashtags }
 *
 * Uso (no workflow ou local com ffmpeg disponível):
 *   node scripts/midas/midas-generate-versiculo.js [--versiculo-id=v001]
 *
 * Requer: ffmpeg no PATH, CLOUDINARY_* no env.
 */

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const POOL_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'versiculos-pool.json');
const ROTATION_PATH = path.join(__dirname, '..', '..', 'midas', 'state', 'versiculo-rotation.json');
const VERSICULOS_MANIFEST = path.join(__dirname, '..', '..', 'midas', 'config', 'versiculos-manifest.json');
const ACCOUNTS_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const CAPTIONS_DIR = path.join(__dirname, '..', '..', 'midas', 'captions');

// Paletas (background -> texto -> referência). Rotaciona pra variedade visual.
const PALETTES = [
  { bg: '0x1a3d5c', text: 'white',     ref: '0xd4a574' }, // azul-noite + dourado
  { bg: '0x2d4a3e', text: 'white',     ref: '0xe8c878' }, // verde-musgo + dourado-claro
  { bg: '0x4a3a2c', text: 'white',     ref: '0xf2d49b' }, // marrom-quente + bege
  { bg: '0x3a2d4e', text: 'white',     ref: '0xc9a9d1' }, // roxo-escuro + lavanda
  { bg: '0x5e3a2d', text: 'white',     ref: '0xf0c89a' }, // terracota + areia
  { bg: '0xf2ead3', text: '0x3a2d1e', ref: '0x8b6f3f' }, // bege-claro + terra (modo claro)
];

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.replace(/^--/, '').split('=');
    args[k] = v || true;
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

function pickNextVersiculo(pool, args) {
  if (args['versiculo-id']) {
    const v = pool.versiculos.find(x => x.id === args['versiculo-id']);
    if (!v) throw new Error(`Versículo não encontrado: ${args['versiculo-id']}`);
    return v;
  }
  const rotation = loadJson(ROTATION_PATH, { used_ids: [] });
  const usedSet = new Set(rotation.used_ids);
  const next = pool.versiculos.find(v => !usedSet.has(v.id));
  if (next) return next;
  // Pool esgotado, reseta ciclo
  console.error('⚠️  Pool de versículos esgotado, reiniciando ciclo');
  saveJson(ROTATION_PATH, { used_ids: [] });
  return pool.versiculos[0];
}

function markUsed(versiculoId) {
  const rotation = loadJson(ROTATION_PATH, { used_ids: [] });
  rotation.used_ids = [...new Set([...rotation.used_ids, versiculoId])];
  saveJson(ROTATION_PATH, rotation);
}

function wrapText(text, maxCharsPerLine = 28) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxCharsPerLine) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

function findFontFile() {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSerif-Bold.ttf',
    'C:/Windows/Fonts/georgia.ttf',
    'C:/Windows/Fonts/times.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/System/Library/Fonts/Georgia.ttf',
    '/Library/Fonts/Georgia.ttf',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function escapeForFfmpegFile(text) {
  // ffmpeg textfile não precisa de escape extensivo, mas evitamos chars problemáticos
  return text.replace(/\r/g, '');
}

function generateMp4(versiculo, palette, outPath) {
  const fontFile = findFontFile();
  if (!fontFile) throw new Error('Nenhuma fonte serifada encontrada (DejaVuSerif/Liberation/Georgia)');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'midas-vers-'));
  const textPath = path.join(tmpDir, 'texto.txt');
  const refPath = path.join(tmpDir, 'ref.txt');

  const wrapped = wrapText(versiculo.texto, 28);
  fs.writeFileSync(textPath, escapeForFfmpegFile(wrapped));
  fs.writeFileSync(refPath, escapeForFfmpegFile(versiculo.ref));

  // Em ffmpeg filter syntax, paths Windows precisam de escape especial.
  // Conversão: C:\path → C\:/path. Mais seguro forçar forward-slash.
  const ff = (p) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');

  const filters = [
    `drawtext=fontfile='${ff(fontFile)}':textfile='${ff(textPath)}':fontsize=56:fontcolor=${palette.text}:line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2-180`,
    `drawtext=fontfile='${ff(fontFile)}':textfile='${ff(refPath)}':fontsize=44:fontcolor=${palette.ref}:x=(w-text_w)/2:y=(h-text_h)/2+260`,
    `fade=t=in:st=0:d=0.6,fade=t=out:st=11.4:d=0.6`,
  ].join(',');

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=${palette.bg}:s=1080x1920:d=12:rate=30`,
    '-vf', filters,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-t', '12',
    outPath,
  ];

  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    const err = (r.stderr || Buffer.alloc(0)).toString().slice(-2000);
    throw new Error(`ffmpeg falhou:\n${err}`);
  }

  // cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

function signParams(params, apiSecret) {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(sorted + apiSecret).digest('hex');
}

async function uploadCloudinary(filePath, publicId) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error('CLOUDINARY_* env ausente');

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'midas/versiculos';
  const paramsToSign = { folder, public_id: publicId, timestamp };
  const signature = signParams(paramsToSign, apiSecret);

  const form = new FormData();
  const buffer = fs.readFileSync(filePath);
  form.append('file', new Blob([buffer]), path.basename(filePath));
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);
  form.append('public_id', publicId);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;
  const res = await fetch(url, { method: 'POST', body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(`Cloudinary erro: ${JSON.stringify(json)}`);
  return json;
}

function buildCaption(versiculo, hashtags) {
  return [
    versiculo.texto,
    '',
    `— ${versiculo.ref}`,
    '',
    hashtags,
  ].join('\n');
}

function buildCaptionsByAccount(versiculo, pool) {
  const accounts = loadJson(ACCOUNTS_PATH);
  if (!accounts || !accounts.accounts) throw new Error('accounts.json inválido');

  const hashtagsIg = pool.hashtags_default || '#fé #Deus #família #propósito #prosperidade #bíblia';
  const hashtagsTk = '#fé #Deus #salmos #provérbios #família #fyp';
  const hashtagsYt = '#Shorts #Fé #Versículo #Bíblia';

  const baseText = `${versiculo.texto}\n\n— ${versiculo.ref}`;
  const hook = versiculo.texto.length > 100 ? versiculo.texto.slice(0, 97) + '...' : versiculo.texto;

  const out = {};
  for (const acc of accounts.accounts.filter(a => a.active)) {
    out[acc.id] = {
      hook,
      body: versiculo.texto,
      cta: '',
      full_caption: baseText,
      hashtags_instagram: hashtagsIg,
      hashtags_tiktok: hashtagsTk,
      hashtags_youtube: hashtagsYt,
      caption_ig: `${baseText}\n\n${hashtagsIg}`,
      caption_tiktok: `${baseText}\n\n${hashtagsTk}`,
      caption_youtube: `${versiculo.ref} ${hashtagsYt}`,
    };
  }
  return out;
}

function writeCaptionsFile(videoBase, captionsByAccount) {
  fs.mkdirSync(CAPTIONS_DIR, { recursive: true });
  const captionsPath = path.join(CAPTIONS_DIR, `${videoBase}.json`);
  fs.writeFileSync(captionsPath, JSON.stringify(captionsByAccount, null, 2));
  return captionsPath;
}

function appendToManifest(entry) {
  const manifest = loadJson(VERSICULOS_MANIFEST, { versiculos: [] });
  manifest.versiculos = manifest.versiculos || [];
  // dedup por public_id
  manifest.versiculos = manifest.versiculos.filter(v => v.public_id !== entry.public_id);
  manifest.versiculos.push(entry);
  saveJson(VERSICULOS_MANIFEST, manifest);
}

async function main() {
  const args = parseArgs();
  const pool = loadJson(POOL_PATH);
  if (!pool || !pool.versiculos) throw new Error('Pool de versículos não encontrado');

  const versiculo = pickNextVersiculo(pool, args);
  const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];

  const fileBase = `versiculo_${versiculo.id}`;
  const outDir = process.env.MIDAS_OUTPUT_DIR || path.join(os.tmpdir(), 'midas-out');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${fileBase}.mp4`);

  console.error(`📜 Gerando ${versiculo.id}: ${versiculo.ref}`);
  generateMp4(versiculo, palette, outPath);

  console.error(`☁️  Upload Cloudinary...`);
  const up = await uploadCloudinary(outPath, fileBase);

  const entry = {
    file: `${fileBase}.mp4`,
    public_id: up.public_id,
    url: up.secure_url || up.url,
    versiculo_id: versiculo.id,
    versiculo_ref: versiculo.ref,
    duration: up.duration,
    bytes: up.bytes,
    uploaded_at: new Date().toISOString(),
  };
  appendToManifest(entry);
  markUsed(versiculo.id);

  const hashtags = pool.hashtags_default || '#fé #Deus #família';
  const caption = buildCaption(versiculo, hashtags);

  // Escreve captions/{file}.json compatível com midas-publish-upload-post.js
  const captionsByAccount = buildCaptionsByAccount(versiculo, pool);
  writeCaptionsFile(fileBase, captionsByAccount);

  // cleanup arquivo local (não precisamos guardar)
  try { fs.unlinkSync(outPath); } catch {}

  process.stdout.write(JSON.stringify({
    video: entry.file,
    public_id: entry.public_id,
    url: entry.url,
    type: 'versiculo',
    versiculo_id: versiculo.id,
    versiculo_ref: versiculo.ref,
    caption,
    hashtags,
  }));
}

if (require.main === module) {
  main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
}
