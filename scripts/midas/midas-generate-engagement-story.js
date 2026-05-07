#!/usr/bin/env node
/**
 * Midas — Gerador de Story de Engagement (pergunta visual)
 *
 * Gera imagem 1080x1920 com pergunta + CTA visual + watermark.
 * Posta como Instagram Story (image_url) via Graph API.
 * Sem sticker de link (precisa 10k followers) — CTA vai no texto: comenta/DM.
 *
 * Output (stdout JSON): { image: filename, public_id, url, type: 'engagement_story',
 *                         template_id, follow_up_caption }
 *
 * Requer: ffmpeg, CLOUDINARY_*
 */

require('dotenv').config({ quiet: true });
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const POOL_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'engagement-stories-pool.json');
const ROTATION_PATH = path.join(__dirname, '..', '..', 'midas', 'state', 'engagement-rotation.json');
const ACCOUNTS_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');

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

function pickTemplate(pool, args, accountPersona) {
  if (args['template-id']) {
    const t = pool.templates.find(x => x.id === args['template-id']);
    if (!t) throw new Error(`Template não encontrado: ${args['template-id']}`);
    return t;
  }
  const rotation = loadJson(ROTATION_PATH, { used_ids: [] });
  const usedSet = new Set(rotation.used_ids);
  let candidates = pool.templates.filter(t => !usedSet.has(t.id));
  if (!candidates.length) {
    saveJson(ROTATION_PATH, { used_ids: [] });
    candidates = pool.templates;
  }
  if (accountPersona) {
    const weighted = [];
    for (const t of candidates) {
      const w = t.persona_priority?.[accountPersona] || 1;
      for (let i = 0; i < w; i++) weighted.push(t);
    }
    if (weighted.length) return weighted[Math.floor(Math.random() * weighted.length)];
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function markUsed(templateId) {
  const rotation = loadJson(ROTATION_PATH, { used_ids: [] });
  rotation.used_ids = [...new Set([...rotation.used_ids, templateId])];
  saveJson(ROTATION_PATH, rotation);
}

function findFontFile() {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/calibrib.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('Nenhuma fonte sem-serifa encontrada');
}

function escapeText(text) {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/,/g, '\\,').replace(/%/g, '\\%');
}

function composeImage({ template, bgColor, outputPath }) {
  const fontFile = findFontFile();
  const ff = (p) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');

  const perguntaText = template.pergunta_visual; // already has \n line breaks
  const ctaText = template.cta_texto;
  const watermarkText = '@marinaveauvy';

  // Compose: solid background + pergunta centro + CTA inferior + watermark canto
  // Drawtext usa newline literal — converter \n pra \\n no escape
  const perguntaEscaped = escapeText(perguntaText);
  const ctaEscaped = escapeText(ctaText);

  const drawPergunta =
    `drawtext=fontfile='${ff(fontFile)}'` +
    `:text='${perguntaEscaped}'` +
    `:fontsize=98` +
    `:fontcolor=${bgColor.text_hex}` +
    `:line_spacing=18` +
    `:x=(w-text_w)/2` +
    `:y=(h-text_h)/2-100`;

  const drawCta =
    `drawtext=fontfile='${ff(fontFile)}'` +
    `:text='${ctaEscaped}'` +
    `:fontsize=46` +
    `:fontcolor=${bgColor.text_hex}@0.85` +
    `:box=1:boxcolor=${bgColor.text_hex === '#FDF8F0' ? '#1A4030' : 'black'}@0.35:boxborderw=18` +
    `:x=(w-text_w)/2` +
    `:y=h*0.78`;

  const drawWatermark =
    `drawtext=fontfile='${ff(fontFile)}'` +
    `:text='${escapeText(watermarkText)}'` +
    `:fontsize=32` +
    `:fontcolor=${bgColor.text_hex}@0.55` +
    `:x=w-text_w-40` +
    `:y=60`;

  const filter = `color=c=${bgColor.hex}:s=1080x1920:d=1[bg];[bg]${drawPergunta},${drawCta},${drawWatermark}[v]`;

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=${bgColor.hex}:s=1080x1920:d=1`,
    '-filter_complex', `${drawPergunta},${drawCta},${drawWatermark}`,
    '-frames:v', '1',
    outputPath,
  ];

  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    const err = (r.stderr || Buffer.alloc(0)).toString().slice(-2500);
    throw new Error(`ffmpeg compose engagement falhou:\n${err}`);
  }
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
  const folder = 'midas/engagement';
  const paramsToSign = { folder, public_id: publicId, timestamp };
  const signature = signParams(paramsToSign, apiSecret);
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);
  form.append('public_id', publicId);
  // Image upload endpoint
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const res = await fetch(url, { method: 'POST', body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(`Cloudinary erro: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const args = parseArgs();
  const pool = loadJson(POOL_PATH);
  if (!pool || !pool.templates) throw new Error('Pool engagement não encontrado');

  const accounts = loadJson(ACCOUNTS_PATH);
  let accountPersona = null;
  if (args.account) {
    const acc = accounts.accounts.find(a => a.id === args.account);
    accountPersona = acc?.persona;
  }

  const template = pickTemplate(pool, args, accountPersona);
  console.error(`💬 Engagement story ${template.id}: ${template.categoria}`);

  // Pick random background
  const bgColor = pool.background_colors[Math.floor(Math.random() * pool.background_colors.length)];
  console.error(`🎨 Background: ${bgColor.name}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'midas-eng-'));
  const outPath = path.join(tmpDir, `eng_${template.id}_${Date.now()}.png`);

  composeImage({ template, bgColor, outputPath: outPath });
  console.error(`🖼️  Imagem composta: ${outPath}`);

  const fileBase = `eng_${template.id}_${Date.now()}`;
  const up = await uploadCloudinary(outPath, fileBase);
  console.error(`☁️  Upload: ${up.secure_url}`);

  markUsed(template.id);

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  process.stdout.write(JSON.stringify({
    image: `${fileBase}.png`,
    public_id: up.public_id,
    url: up.secure_url || up.url,
    type: 'engagement_story',
    template_id: template.id,
    categoria: template.categoria,
    follow_up_caption: template.follow_up_caption,
    bg_color: bgColor.name,
  }));
}

if (require.main === module) {
  main().catch(e => { console.error('ERRO engagement:', e.message); process.exit(1); });
}
