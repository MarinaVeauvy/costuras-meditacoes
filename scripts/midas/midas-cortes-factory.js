#!/usr/bin/env node
/**
 * Midas Cortes Factory
 *
 * Pipeline: YouTube público → cortes prontos pra pipeline Midas.
 *
 * 1. yt-dlp baixa vídeo longo
 * 2. ffmpeg extrai áudio
 * 3. Whisper (faster-whisper local) transcreve com timestamps
 * 4. Claude analisa transcrição e identifica N momentos mais virais
 * 5. ffmpeg corta clips 30-60s com legenda burned-in
 * 6. Resultado: arquivos corte_XXXXX.mp4 em midas-cortes/Cortes Prontos/
 *
 * Uso:
 *   node midas-cortes-factory.js --url="https://www.youtube.com/watch?v=XXXX" [--clips=5]
 *   node midas-cortes-factory.js --channel="@brunoaguiar3261" [--max=10] [--clips=5]
 *
 * Deps externas (checar disponibilidade):
 *   - yt-dlp (pip install yt-dlp)
 *   - ffmpeg (já instalado no sistema)
 *   - faster-whisper (pip install faster-whisper)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

// Carrega .env do projeto (caso nao venha via shell)
try { require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true }); } catch {}

const Anthropic = require('@anthropic-ai/sdk');

const CORTES_DIR = process.env.MIDAS_CORTES_DIR || 'C:/Users/marin/midas-cortes/Cortes Prontos';
const TMP_DIR = path.join(os.tmpdir(), 'midas-factory');
const STATE_PATH = path.join(__dirname, '..', '..', 'midas', 'state', 'factory-state.json');

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    args[k] = v || true;
  }
  return args;
}

function findPython3() {
  const candidates = [
    process.env.PYTHON_EXE,
    'C:/Users/marin/AppData/Local/Programs/Python/Python312/python.exe',
    'C:/Users/marin/AppData/Local/Programs/Python/Python311/python.exe',
    'py',
    'python3',
    'python',
  ].filter(Boolean);
  for (const cmd of candidates) {
    try {
      const r = require('child_process').spawnSync(cmd, ['-c', 'import sys; print(sys.version_info[0])'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (r.status === 0 && r.stdout.toString().trim() === '3') return cmd;
    } catch {}
  }
  return null;
}

function checkDeps() {
  const missing = [];
  try { execSync('yt-dlp --version', { stdio: 'ignore' }); } catch { missing.push('yt-dlp (pip install yt-dlp)'); }
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); } catch { missing.push('ffmpeg'); }
  const py = findPython3();
  if (!py) {
    missing.push('python3 (tentei: PYTHON_EXE, Python312, Python311, py, python3, python)');
  } else {
    try {
      execSync(`"${py}" -c "from faster_whisper import WhisperModel"`, { stdio: 'ignore' });
      process.env.PYTHON_EXE = py; // exporta pro uso posterior
    } catch {
      missing.push(`faster-whisper (${py} -m pip install faster-whisper)`);
    }
  }
  return missing;
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { processed_videos: [], cortes_count: 0 };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: options.silent ? 'pipe' : 'inherit', ...options });
    let stdout = '', stderr = '';
    if (options.silent) {
      child.stdout.on('data', d => stdout += d);
      child.stderr.on('data', d => stderr += d);
    }
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exit ${code}: ${stderr}`));
    });
  });
}

async function downloadVideo(url, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const outputTemplate = path.join(outDir, '%(id)s.%(ext)s');
  console.log(`📥 Baixando: ${url}`);
  await runCommand('yt-dlp', [
    '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]',
    '--merge-output-format', 'mp4',
    '-o', outputTemplate,
    '--no-playlist',
    url,
  ]);

  const files = fs.readdirSync(outDir).filter(f => f.endsWith('.mp4'));
  if (!files.length) throw new Error('yt-dlp não produziu arquivo mp4');
  return path.join(outDir, files[files.length - 1]);
}

async function listChannelVideos(channelHandle, max = 10) {
  console.log(`📋 Listando últimos ${max} vídeos de ${channelHandle}...`);
  const url = channelHandle.startsWith('@')
    ? `https://www.youtube.com/${channelHandle}/videos`
    : channelHandle;

  const { stdout } = await runCommand('yt-dlp', [
    '--flat-playlist',
    '--print', '%(id)s|%(title)s|%(duration)s',
    '--playlist-end', String(max),
    url,
  ], { silent: true });

  return stdout.trim().split('\n').filter(Boolean).map(line => {
    const [id, title, duration] = line.split('|');
    return { id, title, duration: parseInt(duration || '0', 10), url: `https://www.youtube.com/watch?v=${id}` };
  });
}

async function transcribeAudio(videoPath) {
  console.log(`🎙️  Transcrevendo com Whisper...`);
  const transcriptPath = videoPath.replace(/\.mp4$/, '.whisper.json');

  const pythonScript = `
import sys, json
from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe("${videoPath.replace(/\\/g, '/')}", language="pt", vad_filter=True)
out = {"language": info.language, "duration": info.duration, "segments": []}
for s in segments:
    out["segments"].append({"start": s.start, "end": s.end, "text": s.text.strip()})
print(json.dumps(out, ensure_ascii=False))
`;

  const tmpScript = path.join(TMP_DIR, `whisper-${Date.now()}.py`);
  fs.writeFileSync(tmpScript, pythonScript);
  const pyExe = process.env.PYTHON_EXE || 'python';
  const { stdout } = await runCommand(pyExe, [tmpScript], { silent: true });
  fs.unlinkSync(tmpScript);

  const transcript = JSON.parse(stdout);
  fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
  console.log(`   Duração: ${transcript.duration.toFixed(0)}s | ${transcript.segments.length} segmentos`);
  return transcript;
}

function buildViralMomentsPrompt(transcript, clipsWanted) {
  const transcriptText = transcript.segments
    .map(s => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join('\n');

  return `Você analisa transcrição de vídeo educativo sobre investimentos/cripto e identifica os ${clipsWanted} momentos mais virais pra cortar em clips de 30-60s.

CRITÉRIOS DE MOMENTO VIRAL:
- Hook forte (afirmação contra-intuitiva, pergunta intrigante, quebra de expectativa)
- Conteúdo auto-contido (entende sem contexto anterior)
- Ensinamento ou insight prático
- Tom conversacional (não técnico demais)
- Duração 30-60s (calcula pelo start/end)

TRANSCRIÇÃO (${transcript.duration.toFixed(0)}s total):
${transcriptText}

Retorne JSON array com ${clipsWanted} clips:
[
  {
    "start": 45.2,
    "end": 98.5,
    "reason": "Por que esse trecho vai viralizar",
    "hook_suggestion": "Frase hook pra começar o corte (max 8 palavras)"
  },
  ...
]

REGRAS:
- start/end DEVEM estar dentro dos timestamps da transcrição
- Duração (end - start) entre 30 e 60 segundos
- NÃO escolha trechos com palavras proibidas: garantido, lucro certo, milionário, valores específicos
- Priorize trechos educativos sobre blockchain/cripto/mercado

Retorne APENAS JSON array válido, sem markdown.`;
}

async function callGroqOnce(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    // Em rate limit, espera retry_after e tenta de novo (1x)
    if (res.status === 429) {
      const m = t.match(/try again in ([\d.]+)s/i);
      const waitMs = m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : 5000;
      console.log(`   Groq 429 — aguardando ${Math.ceil(waitMs/1000)}s...`);
      await new Promise(r => setTimeout(r, waitMs));
      return callGroqOnce(prompt);
    }
    throw new Error(`Groq ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) throw new Error(`Groq retorno invalido: ${text.slice(0, 200)}`);
    parsed = JSON.parse(m[0]);
  }
  if (Array.isArray(parsed)) return parsed;
  for (const k of Object.keys(parsed)) {
    if (Array.isArray(parsed[k])) return parsed[k];
  }
  throw new Error(`Groq nao retornou array: ${text.slice(0, 200)}`);
}

/**
 * Estima tokens grosseiramente (português ~3 chars/token).
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 3);
}

/**
 * Divide segments em chunks que cabem no TPM do Groq (~10K tokens por chunk,
 * deixando ~2K pra prompt overhead + response).
 */
function chunkSegments(segments, maxTokensPerChunk = 9000) {
  const chunks = [];
  let current = [];
  let currentText = '';
  let currentTokens = 0;

  for (const s of segments) {
    const line = `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}\n`;
    const lineTokens = estimateTokens(line);
    if (currentTokens + lineTokens > maxTokensPerChunk && current.length > 0) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(s);
    currentTokens += lineTokens;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function findViralMomentsGroq(transcript, clipsWanted) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY ausente');

  // Estima tokens da transcricao completa + overhead do prompt (~800 tokens)
  const fullTokens = estimateTokens(JSON.stringify(transcript.segments)) + 800;
  const TPM_LIMIT = 11500; // Groq free tier ~12K TPM

  // Se cabe em 1 chamada, manda direto
  if (fullTokens < TPM_LIMIT) {
    const prompt = buildViralMomentsPrompt(transcript, clipsWanted);
    return callGroqOnce(prompt);
  }

  // Chunking: cada chunk fica em ~4500 tokens (com prompt overhead vai pra ~5500-6000)
  const chunks = chunkSegments(transcript.segments, 4500);
  const clipsPerChunk = Math.max(2, Math.ceil(clipsWanted / chunks.length) + 1);
  console.log(`   transcript grande (${fullTokens} tokens) — chunking em ${chunks.length} partes (${clipsPerChunk} clips/parte)`);

  const allMoments = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkSegs = chunks[i];
    const subTranscript = {
      duration: chunkSegs[chunkSegs.length - 1].end - chunkSegs[0].start,
      segments: chunkSegs,
    };
    console.log(`   chunk ${i + 1}/${chunks.length} (${chunkSegs.length} segmentos, ${chunkSegs[0].start.toFixed(0)}s-${chunkSegs[chunkSegs.length-1].end.toFixed(0)}s)`);
    try {
      const moments = await callGroqOnce(buildViralMomentsPrompt(subTranscript, clipsPerChunk));
      allMoments.push(...moments);
    } catch (e) {
      console.log(`   chunk ${i + 1} falhou: ${e.message.slice(0, 150)}`);
    }
    // Pausa entre chunks pra respeitar TPM
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 8000));
  }

  // Filtra invalidos e retorna top clipsWanted ordenado por start
  const valid = allMoments
    .filter(m => typeof m.start === 'number' && typeof m.end === 'number' && m.end - m.start >= 25 && m.end - m.start <= 65)
    .sort((a, b) => a.start - b.start);

  if (valid.length === 0) throw new Error('Nenhum momento valido apos chunking');

  // Espalha selecao ao longo do video (pega N distribuidos)
  if (valid.length <= clipsWanted) return valid;
  const stride = valid.length / clipsWanted;
  const selected = [];
  for (let i = 0; i < clipsWanted; i++) {
    selected.push(valid[Math.floor(i * stride)]);
  }
  return selected;
}

async function findViralMomentsGemini(transcript, clipsWanted) {
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = buildViralMomentsPrompt(transcript, clipsWanted);

  const resp = await ai.models.generateContent({
    model: process.env.FACTORY_MODEL || 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.5,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const text = resp.text || resp.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    if (!m) throw new Error(`Gemini retorno invalido: ${text.slice(0, 200)}`);
    return JSON.parse(m[0]);
  }
}

async function findViralMomentsAnthropic(transcript, clipsWanted) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildViralMomentsPrompt(transcript, clipsWanted);
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Claude retorno invalido:\n${text}`);
  return JSON.parse(jsonMatch[0]);
}

async function findViralMoments(transcript, clipsWanted = 5) {
  // Default novo: groq (gratuito, sem limite agressivo). Fallback: gemini -> anthropic.
  const provider = (process.env.FACTORY_PROVIDER || 'groq').toLowerCase();

  if (provider === 'groq') {
    return findViralMomentsGroq(transcript, clipsWanted);
  }
  if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY ausente');
    return findViralMomentsGemini(transcript, clipsWanted);
  }
  if (provider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith('sk-or-v1')) {
      throw new Error('ANTHROPIC_API_KEY ausente ou invalida (OpenRouter mal-rotulada?)');
    }
    return findViralMomentsAnthropic(transcript, clipsWanted);
  }
  throw new Error(`FACTORY_PROVIDER desconhecido: ${provider}`);
}

async function cutClip({ videoPath, start, end, outPath }) {
  const duration = end - start;
  console.log(`   ✂️  ${start.toFixed(1)}s → ${end.toFixed(1)}s (${duration.toFixed(1)}s)`);

  await runCommand('ffmpeg', [
    '-ss', String(start),
    '-i', videoPath,
    '-t', String(duration),
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-y',
    outPath,
  ], { silent: true });
}

function nextCorteName(state) {
  // Le tambem maior numero do manifest pra evitar overwrite se state foi resetado.
  let maxFromManifest = 0;
  try {
    const MANIFEST_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'cortes-manifest.json');
    if (fs.existsSync(MANIFEST_PATH)) {
      const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      for (const c of (m.cortes || [])) {
        const match = (c.file || '').match(/corte_(\d+)\.mp4$/);
        if (match) maxFromManifest = Math.max(maxFromManifest, parseInt(match[1], 10));
      }
    }
  } catch {}
  // Tambem ve maior nome de arquivo no diretorio
  let maxFromDir = 0;
  try {
    if (fs.existsSync(CORTES_DIR)) {
      for (const f of fs.readdirSync(CORTES_DIR)) {
        const match = f.match(/^corte_(\d+)\.mp4$/);
        if (match) maxFromDir = Math.max(maxFromDir, parseInt(match[1], 10));
      }
    }
  } catch {}
  const maxN = Math.max(state.cortes_count || 0, maxFromManifest, maxFromDir);
  const n = maxN + 1;
  state.cortes_count = n; // mantém consistente
  return `corte_${String(n).padStart(5, '0')}.mp4`;
}

async function transcribeCorte(mp4Path) {
  // Lazy load — modulo pode nao existir em todos os ambientes (e.g. CI sem python)
  try {
    const { transcribeVideo } = require('./midas-transcribe');
    return await transcribeVideo(mp4Path);
  } catch (e) {
    console.warn(`   ⚠️  transcribe falhou: ${e.message}`);
    return null;
  }
}

async function scoreCorteSafe(mp4Path, transcriptPath) {
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { scoreCorte } = require('./midas-score-corte');
    return await scoreCorte({ mp4Path, transcriptPath });
  } catch (e) {
    console.warn(`   ⚠️  scoring falhou: ${e.message}`);
    return null;
  }
}

function mergeIntoManifest(corteEntry) {
  const MANIFEST_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'cortes-manifest.json');
  let manifest = { cortes: [] };
  if (fs.existsSync(MANIFEST_PATH)) {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    if (!manifest.cortes) manifest.cortes = [];
  }
  const idx = manifest.cortes.findIndex(c => c.file === corteEntry.file);
  if (idx >= 0) manifest.cortes[idx] = { ...manifest.cortes[idx], ...corteEntry };
  else manifest.cortes.push(corteEntry);
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

async function processVideo(videoUrl, clipsWanted, opts = {}) {
  const state = loadState();
  if (state.processed_videos.includes(videoUrl)) {
    console.log(`⏭️  Já processado: ${videoUrl}`);
    return [];
  }

  const tmpSub = path.join(TMP_DIR, crypto.randomBytes(4).toString('hex'));
  fs.mkdirSync(tmpSub, { recursive: true });

  try {
    const videoPath = await downloadVideo(videoUrl, tmpSub);
    const transcript = await transcribeAudio(videoPath);
    const moments = await findViralMoments(transcript, clipsWanted);

    console.log(`🎯 ${moments.length} momentos virais identificados`);
    fs.mkdirSync(CORTES_DIR, { recursive: true });

    const newCortes = [];
    for (const m of moments) {
      const name = nextCorteName(state);
      const outPath = path.join(CORTES_DIR, name);
      await cutClip({ videoPath, start: m.start, end: m.end, outPath });
      state.cortes_count++;
      const entry = { file: name, hook: m.hook_suggestion, reason: m.reason };
      console.log(`   ✅ ${name} — "${m.hook_suggestion}"`);

      if (opts.score) {
        const transcriptPath = outPath.replace(/\.mp4$/i, '.transcript.json');
        if (!fs.existsSync(transcriptPath)) {
          console.log(`   📝 transcrevendo ${name}...`);
          await transcribeCorte(outPath);
        }
        if (fs.existsSync(transcriptPath)) {
          console.log(`   🎯 scoreando ${name}...`);
          const score = await scoreCorteSafe(outPath, transcriptPath);
          if (score) {
            Object.assign(entry, score);
            const gate = score.viral_score >= (parseInt(process.env.MIN_VIRAL_SCORE || '80', 10));
            console.log(`   ${gate ? '⭐' : '·'} score=${score.viral_score} hook=${score.hook_strength}`);
          }
        }
        mergeIntoManifest(entry);
      }
      newCortes.push(entry);
    }

    state.processed_videos.push(videoUrl);
    saveState(state);
    return newCortes;
  } finally {
    try { fs.rmSync(tmpSub, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  const args = parseArgs();
  const clipsPerVideo = parseInt(args.clips || '5', 10);

  const provider = (process.env.FACTORY_PROVIDER || 'groq').toLowerCase();
  if (provider === 'groq' && !process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY obrigatório');
  }
  if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY obrigatório (ou set FACTORY_PROVIDER=groq)');
  }
  if (provider === 'anthropic' && (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith('sk-or-v1'))) {
    throw new Error('ANTHROPIC_API_KEY obrigatório e valido');
  }

  const missing = checkDeps();
  if (missing.length) {
    console.error('❌ Dependências faltando:\n  ' + missing.join('\n  '));
    process.exit(1);
  }

  fs.mkdirSync(TMP_DIR, { recursive: true });

  const opts = { score: args.score === true || args.score === 'true' };

  if (args.url) {
    const cortes = await processVideo(args.url, clipsPerVideo, opts);
    console.log(`\n✅ ${cortes.length} cortes gerados`);
  } else if (args.channel) {
    const max = parseInt(args.max || '3', 10);
    const videos = await listChannelVideos(args.channel, max);
    console.log(`📺 ${videos.length} vídeos encontrados`);

    let total = 0;
    for (const video of videos) {
      if (video.duration < 300) {
        console.log(`⏭️  ${video.title} muito curto (${video.duration}s), skip`);
        continue;
      }
      console.log(`\n--- ${video.title} (${video.duration}s) ---`);
      const cortes = await processVideo(video.url, clipsPerVideo, opts);
      total += cortes.length;
    }
    console.log(`\n✅ Total: ${total} cortes novos${opts.score ? ' (com scoring)' : ''}`);
  } else {
    console.error('Uso: --url=<youtube_url> OU --channel=@handle [--score]');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('ERRO:', err.message);
    process.exit(1);
  });
}
