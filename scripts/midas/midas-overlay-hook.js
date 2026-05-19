#!/usr/bin/env node
/**
 * Midas — Overlay de hook nos cortes MAC
 *
 * Adiciona texto de hook nos primeiros 3 segundos do vídeo (texto branco
 * com sombra + fundo escuro semi-transparente). Resolve o problema crítico
 * diagnosticado por Brendan Kane: cortes MAC chegam sem scroll-stop.
 *
 * Pipeline:
 *   1. Baixa vídeo original do Cloudinary (URL passada como --videoUrl)
 *   2. Aplica drawtext do hook (gerado pelo caption-generator) nos primeiros 3s
 *   3. Sobe versão com overlay pro Cloudinary com sufixo "_hooked"
 *   4. Output JSON: { url novo, public_id novo }
 *
 * Uso:
 *   node midas-overlay-hook.js --video=corte_00001.mp4 --videoUrl=https://... --hook="Texto do hook"
 *
 * Requer: ffmpeg, CLOUDINARY_*
 */

require('dotenv').config({ quiet: true });
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    args[k] = rest.length ? rest.join('=') : true;
  }
  return args;
}

function findFontFile() {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

function wrapText(text, max = 22) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

async function downloadVideo(url, dest) {
  console.error(`⬇️  Download ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
  const ab = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(ab));
}

function probeDuration(videoPath) {
  const r = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) return null;
  const d = parseFloat((r.stdout || '').toString().trim());
  return isFinite(d) ? d : null;
}

function applyOverlay(inputPath, outputPath, hook, overlayCta = null) {
  const fontFile = findFontFile();
  if (!fontFile) throw new Error('Nenhuma fonte bold encontrada');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'midas-hook-'));
  const textPath = path.join(tmpDir, 'hook.txt');
  const wrapped = wrapText(hook, 22);
  fs.writeFileSync(textPath, wrapped);

  const ff = (p) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');

  const filters = [];

  // (1) Hook nos primeiros 3.2s — texto branco grande no terço superior
  filters.push([
    `drawtext=fontfile='${ff(fontFile)}'`,
    `textfile='${ff(textPath)}'`,
    `fontsize=72`,
    `fontcolor=white`,
    `borderw=3`,
    `bordercolor=black@0.9`,
    `box=1`,
    `boxcolor=black@0.55`,
    `boxborderw=30`,
    `line_spacing=14`,
    `x=(w-text_w)/2`,
    `y=h*0.18`,
    `enable='between(t,0.3,3.5)'`,
  ].join(':'));

  // (2) Overlay CTA nos últimos ~4s — texto amarelo no terço inferior
  // Algoritmo Reels 2026 pesa CTA visual >> CTA em caption (80% nunca expande).
  if (overlayCta && overlayCta.trim()) {
    const ctaPath = path.join(tmpDir, 'overlay-cta.txt');
    fs.writeFileSync(ctaPath, wrapText(overlayCta.trim(), 18));
    const duration = probeDuration(inputPath);
    // Se conseguimos duração, mostra nos últimos 4s. Senão, fallback: gt(t,8) garante aparição em cortes 30-60s.
    const ctaEnable = duration && duration > 6
      ? `enable='between(t,${(duration - 4).toFixed(2)},${duration.toFixed(2)})'`
      : `enable='gt(t,8)'`;
    filters.push([
      `drawtext=fontfile='${ff(fontFile)}'`,
      `textfile='${ff(ctaPath)}'`,
      `fontsize=58`,
      `fontcolor=yellow`,
      `borderw=3`,
      `bordercolor=black@0.9`,
      `box=1`,
      `boxcolor=black@0.6`,
      `boxborderw=22`,
      `x=(w-text_w)/2`,
      `y=h*0.78`,
      ctaEnable,
    ].join(':'));
  }

  const drawtextFilter = filters.join(',');

  const args = [
    '-y',
    '-i', inputPath,
    '-vf', drawtextFilter,
    '-c:v', 'libx264',
    '-c:a', 'copy',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    outputPath,
  ];

  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    const err = (r.stderr || Buffer.alloc(0)).toString().slice(-1500);
    throw new Error(`ffmpeg falhou:\n${err}`);
  }

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
  const folder = 'midas/hooked';
  const paramsToSign = { folder, public_id: publicId, timestamp };
  const signature = signParams(paramsToSign, apiSecret);

  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
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

async function main() {
  const args = parseArgs();
  if (!args.video || !args.videoUrl || !args.hook) {
    throw new Error('Uso: --video=X.mp4 --videoUrl=URL --hook="texto" [--overlayCta="texto curto"]');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'midas-overlay-'));
  const inputPath = path.join(tmpDir, args.video);
  const outputName = `${path.basename(args.video, '.mp4')}_hooked.mp4`;
  const outputPath = path.join(tmpDir, outputName);

  await downloadVideo(args.videoUrl, inputPath);

  const overlayCta = typeof args.overlayCta === 'string' && args.overlayCta.trim() ? args.overlayCta : null;
  console.error(`🎯 Aplicando overlay hook (${args.hook.length} chars)` + (overlayCta ? ` + CTA "${overlayCta}"` : ''));
  applyOverlay(inputPath, outputPath, args.hook, overlayCta);

  console.error(`☁️  Upload Cloudinary...`);
  const publicId = `${path.basename(args.video, '.mp4')}_hooked`;
  const up = await uploadCloudinary(outputPath, publicId);

  // cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  process.stdout.write(JSON.stringify({
    video: outputName,
    public_id: up.public_id,
    url: up.secure_url || up.url,
    bytes: up.bytes,
    duration: up.duration,
  }));
}

if (require.main === module) {
  main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
}

module.exports = { applyOverlay, probeDuration, wrapText };
