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

function checkDeps() {
  const missing = [];
  try { execSync('yt-dlp --version', { stdio: 'ignore' }); } catch { missing.push('yt-dlp (pip install yt-dlp)'); }
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); } catch { missing.push('ffmpeg'); }
  try {
    execSync('python -c "from faster_whisper import WhisperModel"', { stdio: 'ignore' });
  } catch {
    missing.push('faster-whisper (pip install faster-whisper)');
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
  const { stdout } = await runCommand('python', [tmpScript], { silent: true });
  fs.unlinkSync(tmpScript);

  const transcript = JSON.parse(stdout);
  fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
  console.log(`   Duração: ${transcript.duration.toFixed(0)}s | ${transcript.segments.length} segmentos`);
  return transcript;
}

async function findViralMoments(transcript, clipsWanted = 5) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const transcriptText = transcript.segments
    .map(s => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
    .join('\n');

  const prompt = `Você analisa transcrição de vídeo educativo sobre mercado cripto e identifica os ${clipsWanted} momentos mais virais pra cortar em clips de 30-60s.

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

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Claude retorno inválido:\n${text}`);
  return JSON.parse(jsonMatch[0]);
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
  const n = state.cortes_count + 1;
  return `corte_${String(n).padStart(5, '0')}.mp4`;
}

async function processVideo(videoUrl, clipsWanted) {
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
      newCortes.push({ file: name, hook: m.hook_suggestion, reason: m.reason });
      console.log(`   ✅ ${name} — "${m.hook_suggestion}"`);
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

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY obrigatório');
  }

  const missing = checkDeps();
  if (missing.length) {
    console.error('❌ Dependências faltando:\n  ' + missing.join('\n  '));
    process.exit(1);
  }

  fs.mkdirSync(TMP_DIR, { recursive: true });

  if (args.url) {
    const cortes = await processVideo(args.url, clipsPerVideo);
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
      const cortes = await processVideo(video.url, clipsPerVideo);
      total += cortes.length;
    }
    console.log(`\n✅ Total: ${total} cortes novos`);
  } else {
    console.error('Uso: --url=<youtube_url> OU --channel=@handle');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('ERRO:', err.message);
    process.exit(1);
  });
}
