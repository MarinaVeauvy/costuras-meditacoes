#!/usr/bin/env node
/**
 * Midas — Gerador de Reel de versículo v2 (pós-Brendan Kane diagnostic)
 *
 * MUDANÇAS v2:
 * - Background = vídeo Pexels (movimento orgânico — natureza/golden hour/luz)
 * - Áudio = Edge TTS narração + (futuro: música de fundo)
 * - Texto kinetic: aparece palavra por palavra
 * - Duração 8s (loops melhor + retém mais)
 * - CTA "Salve pra ler depois 🤍" no último segundo
 * - Referência destacada após texto completo
 *
 * Output (stdout, JSON):
 *   { video, public_id, url, type: "versiculo", caption, hashtags }
 *
 * Requer: ffmpeg, Python3 + edge-tts, PEXELS_API_KEY, CLOUDINARY_*
 */

require('dotenv').config({ quiet: true });
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
const TTS_SCRIPT = path.join(__dirname, 'midas-tts-versiculo.py');

// Pool de queries Pexels — temas que combinam com versículos (calmo, contemplativo, luz)
const PEXELS_QUERIES = [
  'golden hour nature',
  'sunlight forest',
  'ocean waves slow',
  'sky clouds time lapse',
  'candle flame slow',
  'sunset mountains',
  'water reflection light',
  'wheat field wind',
  'morning mist',
  'silhouette sunset prayer',
  'dove flying slow',
  'cross silhouette light',
];

// Duração total do Reel
const TOTAL_DURATION = 8.0;

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    args[k] = rest.length ? rest.join('=') : true;
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
  console.error('⚠️  Pool de versículos esgotado, reiniciando ciclo');
  saveJson(ROTATION_PATH, { used_ids: [] });
  return pool.versiculos[0];
}

function markUsed(versiculoId) {
  const rotation = loadJson(ROTATION_PATH, { used_ids: [] });
  rotation.used_ids = [...new Set([...rotation.used_ids, versiculoId])];
  saveJson(ROTATION_PATH, rotation);
}

function findFontFile() {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSerif-Bold.ttf',
    'C:/Windows/Fonts/georgia.ttf',
    'C:/Windows/Fonts/times.ttf',
    '/System/Library/Fonts/Georgia.ttf',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error('Nenhuma fonte serifada encontrada');
}

async function fetchPexelsVideo(query) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error('PEXELS_API_KEY ausente');

  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=15`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) throw new Error(`Pexels falhou: ${res.status}`);
  const data = await res.json();
  if (!data.videos || !data.videos.length) throw new Error(`Pexels sem resultados pra "${query}"`);

  // Pega vídeo random com duração >= 8s
  const ok = data.videos.filter(v => v.duration >= 8);
  if (!ok.length) throw new Error(`Nenhum vídeo Pexels >= 8s pra "${query}"`);

  const video = ok[Math.floor(Math.random() * ok.length)];

  // Pega arquivo HD vertical (preferencialmente 1080p ou 720p, MP4)
  const files = video.video_files
    .filter(f => f.file_type === 'video/mp4' && f.height >= f.width)
    .sort((a, b) => Math.abs(b.height - 1920) - Math.abs(a.height - 1920));

  // Fallback: aceita qualquer aspect se não tem vertical
  const file = files[0] || video.video_files.find(f => f.file_type === 'video/mp4');
  if (!file) throw new Error(`Pexels: nenhum arquivo MP4 utilizável pra "${query}"`);

  return {
    url: file.link,
    width: file.width,
    height: file.height,
    duration: video.duration,
    pexels_id: video.id,
  };
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download falhou ${url}: ${res.status}`);
  const ab = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(ab));
}

function generateTTS(texto, ref, outputMp3) {
  const r = spawnSync('python3', [TTS_SCRIPT, texto, ref, outputMp3], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) {
    // tenta python (sem 3) como fallback
    const r2 = spawnSync('python', [TTS_SCRIPT, texto, ref, outputMp3], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r2.status !== 0) {
      const err = (r2.stderr || r.stderr || Buffer.alloc(0)).toString().slice(-1500);
      throw new Error(`TTS falhou:\n${err}`);
    }
  }
  if (!fs.existsSync(outputMp3)) throw new Error('TTS não gerou arquivo de áudio');
}

function escapeText(text) {
  // ffmpeg drawtext escape: : , ' \ %
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%');
}

function buildKineticDrawtext(texto, fontFile, fontSize, color, yPos) {
  // Quebra texto em palavras, cada palavra aparece em slot temporal
  const words = texto.split(/\s+/);
  const startTime = 0.5;       // espera 0.5s antes da 1a palavra
  const revealDuration = 5.0;  // total 5s pra revelar texto completo
  const perWord = revealDuration / words.length;

  const ff = (p) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');

  // Estratégia kinetic: cada palavra individualmente desenhada com seu próprio enable
  // Usar "showText" cumulativo — cada palavra ENTRA e fica até o fim
  // Vamos fazer: a cada slot, o texto VISÍVEL é a substring até a palavra N
  // Implementação: criar N drawtext, cada um com text="palavras 1..N", enable=[start_n, fim]
  const filters = [];
  for (let i = 0; i < words.length; i++) {
    const visibleText = words.slice(0, i + 1).join(' ');
    const startThis = startTime + (i * perWord);
    const endThis = TOTAL_DURATION;
    // Mostra apenas durante esse slot — senão temos N camadas sobrepostas (que é o que queremos!)
    // Cada drawtext usa enable individual mas TODOS escrevem texto cumulativo no mesmo lugar:
    // Na verdade só precisamos de UM drawtext por slot, mas só o ÚLTIMO ativo é visível por estar no topo
    // Simplificação: usar ENTRY de fade pra cada palavra
    // Mais simples: 1 drawtext por slot, enable só no slot dele (so ele aparece naquele slot)
    // Mas aí texto some entre slots. Não. Eu quero ACUMULAR.
    // Alternativa: enable só do startThis até endThis, com textfile diferente
    // Eficiente mas complexo. Vamos pelo caminho simples:
    filters.push(
      `drawtext=fontfile='${ff(fontFile)}'` +
      `:text='${escapeText(visibleText)}'` +
      `:fontsize=${fontSize}` +
      `:fontcolor=${color}` +
      `:borderw=2` +
      `:bordercolor=black@0.7` +
      `:line_spacing=14` +
      `:x=(w-text_w)/2` +
      `:y=${yPos}` +
      `:enable='between(t,${startThis.toFixed(2)},${(startThis + perWord).toFixed(2)})'`
    );
  }
  // E mais um drawtext final que mantém o texto completo do fim do reveal até o end
  const visibleAll = words.join(' ');
  const finalStart = startTime + revealDuration;
  filters.push(
    `drawtext=fontfile='${ff(fontFile)}'` +
    `:text='${escapeText(visibleAll)}'` +
    `:fontsize=${fontSize}` +
    `:fontcolor=${color}` +
    `:borderw=2` +
    `:bordercolor=black@0.7` +
    `:line_spacing=14` +
    `:x=(w-text_w)/2` +
    `:y=${yPos}` +
    `:enable='gte(t,${finalStart.toFixed(2)})'`
  );

  return filters.join(',');
}

function composeReel({ bgVideoPath, ttsAudioPath, versiculo, outputPath }) {
  const fontFile = findFontFile();
  const ff = (p) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');

  // Wrap texto em ~26 chars/linha
  const wrap = (text, max) => {
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
  };

  // Texto wrapped pra exibição
  const textoWrapped = wrap(versiculo.texto, 26);
  const refText = versiculo.ref;
  const ctaText = 'Salve pra ler depois';

  const kineticVerse = buildKineticDrawtext(textoWrapped, fontFile, 56, 'white', 'h*0.30');

  // Referência: aparece após reveal completo
  const refStart = 0.5 + 5.0;  // start + reveal duration
  const refDrawtext =
    `drawtext=fontfile='${ff(fontFile)}'` +
    `:text='${escapeText(refText)}'` +
    `:fontsize=44:fontcolor=#d4a574` +
    `:borderw=2:bordercolor=black@0.7` +
    `:x=(w-text_w)/2:y=h*0.62` +
    `:enable='gte(t,${refStart.toFixed(2)})'`;

  // CTA: aparece no segundo 6.5
  const ctaDrawtext =
    `drawtext=fontfile='${ff(fontFile)}'` +
    `:text='${escapeText(ctaText)}'` +
    `:fontsize=42:fontcolor=white` +
    `:borderw=2:bordercolor=black@0.7` +
    `:box=1:boxcolor=black@0.45:boxborderw=20` +
    `:x=(w-text_w)/2:y=h*0.78` +
    `:enable='gte(t,6.5)'`;

  // Filter complete:
  // 1. scale + crop bg pra 1080x1920
  // 2. trim/loop pra 8s
  // 3. apply darken (overlay preto 25% pra texto ler melhor)
  // 4. drawtexts
  const videoFilter = [
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,trim=duration=${TOTAL_DURATION},setpts=PTS-STARTPTS,format=yuv420p[bg]`,
    `[bg]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.30:t=fill[bg2]`,
    `[bg2]${kineticVerse},${refDrawtext},${ctaDrawtext}[v]`,
  ].join(';');

  const args = [
    '-y',
    '-stream_loop', '-1',  // loop infinito do bg caso precise
    '-i', bgVideoPath,
    '-i', ttsAudioPath,
    '-filter_complex', videoFilter,
    '-map', '[v]',
    '-map', '1:a',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-shortest',
    '-t', String(TOTAL_DURATION),
    outputPath,
  ];

  const r = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    const err = (r.stderr || Buffer.alloc(0)).toString().slice(-2500);
    throw new Error(`ffmpeg compose falhou:\n${err}`);
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
  const folder = 'midas/versiculos';
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

function buildCaptionsByAccount(versiculo, pool) {
  const accounts = loadJson(ACCOUNTS_PATH);
  if (!accounts || !accounts.accounts) throw new Error('accounts.json inválido');

  const hashtagsIg = pool.hashtags_default || '#fé #Deus #família #propósito';
  const hashtagsTk = '#fé #Deus #salmos #provérbios #família #fyp';
  const hashtagsYt = '#Shorts #Fé #Versículo #Bíblia';

  const baseText = `${versiculo.texto}\n\n— ${versiculo.ref}\n\nSalve pra ler depois 🤍`;
  const hook = versiculo.texto.length > 100 ? versiculo.texto.slice(0, 97) + '...' : versiculo.texto;

  const out = {};
  for (const acc of accounts.accounts.filter(a => a.active)) {
    out[acc.id] = {
      hook,
      body: versiculo.texto,
      cta: 'Salve pra ler depois 🤍',
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
}

function appendToManifest(entry) {
  const manifest = loadJson(VERSICULOS_MANIFEST, { versiculos: [] });
  manifest.versiculos = manifest.versiculos || [];
  manifest.versiculos = manifest.versiculos.filter(v => v.public_id !== entry.public_id);
  manifest.versiculos.push(entry);
  saveJson(VERSICULOS_MANIFEST, manifest);
}

async function main() {
  const args = parseArgs();
  const pool = loadJson(POOL_PATH);
  if (!pool || !pool.versiculos) throw new Error('Pool de versículos não encontrado');

  const versiculo = pickNextVersiculo(pool, args);
  console.error(`📜 Gerando ${versiculo.id}: ${versiculo.ref}`);

  // 1. Pexels
  const query = PEXELS_QUERIES[Math.floor(Math.random() * PEXELS_QUERIES.length)];
  console.error(`🎥 Pexels query: "${query}"`);
  const pex = await fetchPexelsVideo(query);
  console.error(`🎥 Vídeo: id=${pex.pexels_id} ${pex.width}x${pex.height} ${pex.duration}s`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'midas-vers-'));
  const bgPath = path.join(tmpDir, 'bg.mp4');
  const ttsPath = path.join(tmpDir, 'tts.mp3');
  const outPath = path.join(tmpDir, `versiculo_${versiculo.id}.mp4`);

  await downloadFile(pex.url, bgPath);

  // 2. TTS
  console.error(`🎤 Gerando TTS...`);
  generateTTS(versiculo.texto, versiculo.ref, ttsPath);

  // 3. Compose
  console.error(`🎬 Compondo Reel ${TOTAL_DURATION}s...`);
  composeReel({ bgVideoPath: bgPath, ttsAudioPath: ttsPath, versiculo, outputPath: outPath });

  // 4. Upload Cloudinary
  console.error(`☁️  Upload Cloudinary...`);
  const fileBase = `versiculo_${versiculo.id}`;
  const up = await uploadCloudinary(outPath, fileBase);

  const entry = {
    file: `${fileBase}.mp4`,
    public_id: up.public_id,
    url: up.secure_url || up.url,
    versiculo_id: versiculo.id,
    versiculo_ref: versiculo.ref,
    duration: up.duration,
    bytes: up.bytes,
    pexels_query: query,
    pexels_id: pex.pexels_id,
    uploaded_at: new Date().toISOString(),
  };
  appendToManifest(entry);
  markUsed(versiculo.id);

  // 5. Captions
  const captionsByAccount = buildCaptionsByAccount(versiculo, pool);
  writeCaptionsFile(fileBase, captionsByAccount);

  // cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  process.stdout.write(JSON.stringify({
    video: entry.file,
    public_id: entry.public_id,
    url: entry.url,
    type: 'versiculo',
    versiculo_id: versiculo.id,
    versiculo_ref: versiculo.ref,
    pexels_query: query,
  }));
}

if (require.main === module) {
  main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
}
