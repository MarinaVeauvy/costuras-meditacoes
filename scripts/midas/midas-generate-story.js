#!/usr/bin/env node
/**
 * Midas — Gerador de Story Post (afiliada MAC)
 *
 * Posts story-based que historicamente convertem ~70% das vendas afiliado.
 * Estrutura: dor (3s) → descoberta (8s) → transformação (8s) → CTA bio (5s)
 *
 * Reutiliza pipeline do versículo: TTS Edge → Pexels B-roll → ffmpeg compose →
 * Cloudinary upload. Difere em: narrativa LLM personalizada, kinetic legenda,
 * CTA explícito "Link na bio →" no final.
 *
 * Output (stdout, JSON):
 *   { video, public_id, url, type: "story_post", story_id, theme }
 */

require('dotenv').config({ quiet: true });
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { generate } = require('../ai-provider');

const POOL_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'stories-pool.json');
const ROTATION_PATH = path.join(__dirname, '..', '..', 'midas', 'state', 'story-rotation.json');
const MANIFEST_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'stories-manifest.json');
const ACCOUNTS_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const CAPTIONS_DIR = path.join(__dirname, '..', '..', 'midas', 'captions');
const TTS_SCRIPT = path.join(__dirname, 'midas-tts-versiculo.py');

const TOTAL_DURATION = 24.0; // story posts são mais longos que versículos

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

function pickNextStory(pool, args) {
  if (args['story-id']) {
    const t = pool.templates.find(x => x.id === args['story-id']);
    if (!t) throw new Error(`Story template não encontrado: ${args['story-id']}`);
    return t;
  }
  const rotation = loadJson(ROTATION_PATH, { used_ids: [] });
  const usedSet = new Set(rotation.used_ids);
  const next = pool.templates.find(t => !usedSet.has(t.id));
  if (next) return next;
  console.error('⚠️  Pool de stories esgotado, reiniciando ciclo');
  saveJson(ROTATION_PATH, { used_ids: [] });
  return pool.templates[0];
}

function markUsed(storyId) {
  const rotation = loadJson(ROTATION_PATH, { used_ids: [] });
  rotation.used_ids = [...new Set([...rotation.used_ids, storyId])];
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

async function fetchPexelsVideo(query) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error('PEXELS_API_KEY ausente');
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=15`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) throw new Error(`Pexels falhou: ${res.status}`);
  const data = await res.json();
  if (!data.videos || !data.videos.length) throw new Error(`Pexels sem resultados: "${query}"`);
  // Aceita >=8s — ffmpeg faz stream_loop infinito pra cobrir 24s
  const candidates = data.videos.filter(v => v.duration >= 8);
  if (!candidates.length) throw new Error(`Nenhum Pexels >=8s pra "${query}"`);
  const video = candidates[Math.floor(Math.random() * candidates.length)];
  const files = video.video_files
    .filter(f => f.file_type === 'video/mp4' && f.height >= f.width)
    .sort((a, b) => Math.abs(b.height - 1920) - Math.abs(a.height - 1920));
  const file = files[0] || video.video_files.find(f => f.file_type === 'video/mp4');
  if (!file) throw new Error(`Pexels sem arquivo MP4 utilizável`);
  return { url: file.link, width: file.width, height: file.height, duration: video.duration, pexels_id: video.id };
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
  const ab = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(ab));
}

function generateTTS(textoCompleto, outputMp3) {
  // Edge TTS pt-BR-FranciscaNeural via mesmo script do versículo
  // Passa texto inteiro como argumento 1, ref vazia como argumento 2
  const r = spawnSync('python3', [TTS_SCRIPT, textoCompleto, '', outputMp3], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    const r2 = spawnSync('python', [TTS_SCRIPT, textoCompleto, '', outputMp3], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (r2.status !== 0) {
      const err = (r2.stderr || r.stderr || Buffer.alloc(0)).toString().slice(-1500);
      throw new Error(`TTS falhou:\n${err}`);
    }
  }
  if (!fs.existsSync(outputMp3)) throw new Error('TTS não gerou arquivo');
}

function escapeText(text) {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/,/g, '\\,').replace(/%/g, '\\%');
}

async function generateNarrative(template, persona) {
  const prompt = `Você é Marina Veauvy, mulher cristã, mãe, empreendedora, especialista em educação financeira feminina. Sua audiência: mulheres cristãs 28-50 que querem prosperar com propósito.

Vou te dar uma estrutura de história. Você vai expandir em narrativa CONCRETA na voz da Marina, em 4 partes que serão narradas em vídeo de 24s:

ESTRUTURA:
- Tema: ${template.theme}
- Tom: ${template.tom}
- Dor inicial: ${template.estrutura.dor}
- Descoberta: ${template.estrutura.descoberta}
- Transformação: ${template.estrutura.transformacao}

REGRAS DE NARRAÇÃO:
- Português BR coloquial, como se contando a uma amiga
- Primeira pessoa, vulnerável mas não vitimista
- USE 1 número específico, 1 valor concreto, OU 1 referência bíblica curta
- Evite frases vazias ("transforma sua vida", "muda tudo")
- Tom: testemunho, não pitch
- NÃO mencione cripto, MAC, Bruno Aguiar, investimento direto
- TEMA NEUTRO: fé, família, finanças domésticas, propósito

ESTRUTURA OBRIGATÓRIA (4 frases curtas, total MÁXIMO 55 palavras — Edge TTS narra ~150 palavras/min, precisa caber em 22s de áudio):
1. ABERTURA com gancho de dor (~10 palavras, scroll-stop nos 3s)
2. CONTEXTUALIZAÇÃO da dor (~14 palavras, valida a realidade)
3. DESCOBERTA / virada (~17 palavras, o insight que mudou)
4. TRANSFORMAÇÃO + GANCHO PRA CTA (~14 palavras, fecha curiosity gap parcialmente)

⚠️ CONTAR PALAVRAS — se passar de 55 totais, REESCREVE menor.

Retorne JSON válido APENAS:
{
  "frase_1_abertura": "...",
  "frase_2_contexto": "...",
  "frase_3_descoberta": "...",
  "frase_4_transformacao": "...",
  "narracao_completa": "frase 1. frase 2. frase 3. frase 4.",
  "legenda_curta": "frase principal pra texto na tela (~10 palavras)"
}`;

  const required = ['frase_1_abertura', 'frase_2_contexto', 'frase_3_descoberta', 'frase_4_transformacao', 'narracao_completa', 'legenda_curta'];
  // 1 retry — LLM às vezes retorna JSON malformado, campos faltando ou texto longo
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await generate(prompt, { json: true, maxTokens: 800 });
      const missing = required.filter(k => !result[k] || typeof result[k] !== 'string' || !result[k].trim());
      if (missing.length) throw new Error(`Narrativa incompleta: faltou ${missing.join(', ')}`);
      // Validação de length — TTS Edge a -8% rate narra ~145 palavras/min
      // Limite: 60 palavras pra ficar <=24s com folga
      const wordCount = result.narracao_completa.split(/\s+/).filter(Boolean).length;
      if (wordCount > 65) {
        throw new Error(`Narrativa muito longa: ${wordCount} palavras (máx 65, alvo 55)`);
      }
      return result;
    } catch (e) {
      lastErr = e;
      console.error(`⚠️  Tentativa ${attempt} falhou: ${e.message}`);
      if (attempt < 2) console.error(`   Retentando...`);
    }
  }
  throw new Error(`Narrativa falhou após 2 tentativas: ${lastErr.message}`);
}

function composeReel({ bgVideoPath, ttsAudioPath, narrative, ctaText, outputPath }) {
  const fontFile = findFontFile();
  const ff = (p) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');

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

  // Caption-style legenda: cada frase aparece em janela temporal
  // Total 24s: 0-5s frase1, 5-11s frase2, 11-18s frase3, 18-22s frase4, 22-24s CTA
  const legenda1 = wrap(narrative.frase_1_abertura, 24);
  const legenda2 = wrap(narrative.frase_2_contexto, 24);
  const legenda3 = wrap(narrative.frase_3_descoberta, 24);
  const legenda4 = wrap(narrative.frase_4_transformacao, 24);
  const ctaWrapped = wrap(ctaText, 22);

  const slot = (text, start, end, fontSize = 50, color = 'white') =>
    `drawtext=fontfile='${ff(fontFile)}'` +
    `:text='${escapeText(text)}'` +
    `:fontsize=${fontSize}` +
    `:fontcolor=${color}` +
    `:borderw=3:bordercolor=black@0.85` +
    `:box=1:boxcolor=black@0.50:boxborderw=18` +
    `:line_spacing=12` +
    `:x=(w-text_w)/2` +
    `:y=h*0.42` +
    `:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`;

  const ctaSlot = (text, start, end) =>
    `drawtext=fontfile='${ff(fontFile)}'` +
    `:text='${escapeText(text)}'` +
    `:fontsize=58` +
    `:fontcolor=#FFE082` +
    `:borderw=3:bordercolor=black@0.9` +
    `:box=1:boxcolor=#1A4030@0.85:boxborderw=22` +
    `:line_spacing=12` +
    `:x=(w-text_w)/2` +
    `:y=h*0.40` +
    `:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`;

  const drawtexts = [
    slot(legenda1, 0.2, 5.0),
    slot(legenda2, 5.0, 11.0),
    slot(legenda3, 11.0, 18.0),
    slot(legenda4, 18.0, 22.0),
    ctaSlot(ctaWrapped, 22.0, TOTAL_DURATION),
  ].join(',');

  const videoFilter = [
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,trim=duration=${TOTAL_DURATION},setpts=PTS-STARTPTS,format=yuv420p[bg]`,
    `[bg]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.35:t=fill[bg2]`,
    `[bg2]${drawtexts}[v]`,
  ].join(';');

  const args = [
    '-y',
    '-stream_loop', '-1',
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
  const folder = 'midas/stories';
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

function buildCaptionsByAccount(template, narrative, ctaText, pool) {
  const accounts = loadJson(ACCOUNTS_PATH);
  if (!accounts || !accounts.accounts) throw new Error('accounts.json inválido');
  const hashtagsIg = pool.hashtags_default;
  const hashtagsTk = '#mulhercrista #fe #familia #fyp #parati #cristã #financasdomesticas';
  const hashtagsYt = '#Shorts #MulherCrista #FinancasFamiliares';

  const hook = narrative.frase_1_abertura;
  const body = `${narrative.frase_2_contexto} ${narrative.frase_3_descoberta} ${narrative.frase_4_transformacao}`;
  const fullCaption = `${hook}\n\n${body}\n\n${ctaText}`;

  const out = {};
  for (const acc of accounts.accounts.filter(a => a.active)) {
    out[acc.id] = {
      hook,
      body,
      cta: ctaText,
      format_used: 'ST-' + template.id.split('-')[1],
      cta_category: 'bio',
      story_template_id: template.id,
      full_caption: fullCaption,
      hashtags_instagram: hashtagsIg,
      hashtags_tiktok: hashtagsTk,
      hashtags_youtube: hashtagsYt,
      caption_ig: `${fullCaption}\n\n${hashtagsIg}`,
      caption_tiktok: `${fullCaption}\n\n${hashtagsTk}`,
      caption_youtube: `${hook} ${hashtagsYt}`,
    };
  }
  return out;
}

function writeCaptionsFile(videoBase, captionsByAccount) {
  fs.mkdirSync(CAPTIONS_DIR, { recursive: true });
  fs.writeFileSync(path.join(CAPTIONS_DIR, `${videoBase}.json`), JSON.stringify(captionsByAccount, null, 2));
}

function appendToManifest(entry) {
  const m = loadJson(MANIFEST_PATH, { stories: [] });
  m.stories = m.stories || [];
  m.stories = m.stories.filter(s => s.public_id !== entry.public_id);
  m.stories.push(entry);
  saveJson(MANIFEST_PATH, m);
}

async function main() {
  const args = parseArgs();
  const pool = loadJson(POOL_PATH);
  if (!pool || !pool.templates) throw new Error('Pool de stories não encontrado');

  const template = pickNextStory(pool, args);
  console.error(`📖 Gerando story ${template.id}: ${template.theme}`);

  // 1. LLM gera narrativa concreta
  console.error(`🧠 LLM gerando narrativa...`);
  const narrative = await generateNarrative(template);

  // 2. Pexels B-roll
  const query = pool.pexels_queries[Math.floor(Math.random() * pool.pexels_queries.length)];
  console.error(`🎥 Pexels query: "${query}"`);
  const pex = await fetchPexelsVideo(query);
  console.error(`🎥 Vídeo: id=${pex.pexels_id} ${pex.width}x${pex.height} ${pex.duration}s`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'midas-story-'));
  const bgPath = path.join(tmpDir, 'bg.mp4');
  const ttsPath = path.join(tmpDir, 'tts.mp3');
  const outPath = path.join(tmpDir, `story_${template.id}.mp4`);

  await downloadFile(pex.url, bgPath);

  // 3. TTS narração completa
  console.error(`🎤 TTS narrando ${narrative.narracao_completa.length} chars...`);
  generateTTS(narrative.narracao_completa, ttsPath);

  // 4. CTA bio (pick random)
  const ctaText = pool.ctas_bio[Math.floor(Math.random() * pool.ctas_bio.length)];

  // 5. Compose reel
  console.error(`🎬 Compondo Reel ${TOTAL_DURATION}s...`);
  composeReel({ bgVideoPath: bgPath, ttsAudioPath: ttsPath, narrative, ctaText, outputPath: outPath });

  // 6. Upload Cloudinary
  console.error(`☁️  Upload Cloudinary...`);
  const fileBase = `story_${template.id}_${Date.now()}`;
  const up = await uploadCloudinary(outPath, fileBase);

  const entry = {
    file: `${fileBase}.mp4`,
    public_id: up.public_id,
    url: up.secure_url || up.url,
    story_template_id: template.id,
    theme: template.theme,
    duration: up.duration,
    bytes: up.bytes,
    pexels_query: query,
    pexels_id: pex.pexels_id,
    cta_text: ctaText,
    narrative,
    uploaded_at: new Date().toISOString(),
  };
  appendToManifest(entry);
  markUsed(template.id);

  // 7. Captions
  const captionsByAccount = buildCaptionsByAccount(template, narrative, ctaText, pool);
  writeCaptionsFile(fileBase, captionsByAccount);

  // cleanup
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  process.stdout.write(JSON.stringify({
    video: entry.file,
    public_id: entry.public_id,
    url: entry.url,
    type: 'story_post',
    story_id: template.id,
    theme: template.theme,
    pexels_query: query,
  }));
}

if (require.main === module) {
  main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
}
