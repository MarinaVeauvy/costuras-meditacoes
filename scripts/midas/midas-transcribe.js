#!/usr/bin/env node
/**
 * Midas Transcribe — utilitário compartilhado de transcrição de clip.
 *
 * Resolve o transcript de um corte (.mp4) com cache idempotente.
 * Usa faster-whisper local (small, language=pt, vad_filter=True).
 *
 * Cache: <videoPath>.transcript.json ao lado do .mp4
 *   { language, duration, text, segments: [{ start, end, text }] }
 *
 * Hard fail: se Whisper falhar, lança erro. NÃO retorna null silencioso.
 *
 * Uso programático:
 *   const { transcribeClip } = require('./midas-transcribe');
 *   const tr = await transcribeClip('/path/to/corte_00001.mp4');
 *   console.log(tr.text);
 *
 * Uso CLI:
 *   node midas-transcribe.js --video=corte_00001.mp4
 *   node midas-transcribe.js --video=/abs/path/corte_00001.mp4 [--force]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');

const DEFAULT_CORTES_DIR = process.env.MIDAS_CORTES_DIR || 'C:/Users/marin/midas-cortes/Cortes Prontos';
const REPO_TRANSCRIPTS_DIR = path.join(__dirname, '..', '..', 'midas', 'transcripts');
const TMP_DIR = path.join(os.tmpdir(), 'midas-transcribe');
const WHISPER_MODEL = process.env.MIDAS_WHISPER_MODEL || 'small';

function resolvePython() {
  if (process.env.MIDAS_PYTHON) return process.env.MIDAS_PYTHON;
  const candidates = [
    'C:/Users/marin/AppData/Local/Programs/Python/Python312/python.exe',
    'py',
    'python3',
    'python',
  ];
  for (const cmd of candidates) {
    try {
      execSync(`"${cmd}" --version`, { stdio: 'ignore' });
      return cmd;
    } catch { /* try next */ }
  }
  throw new Error('Python não encontrado. Defina MIDAS_PYTHON ou instale Python 3.10+.');
}

const PYTHON = resolvePython();

function resolveVideoPath(videoFileOrPath) {
  if (path.isAbsolute(videoFileOrPath) && fs.existsSync(videoFileOrPath)) return videoFileOrPath;
  const candidate = path.join(DEFAULT_CORTES_DIR, videoFileOrPath);
  if (fs.existsSync(candidate)) return candidate;
  if (fs.existsSync(videoFileOrPath)) return path.resolve(videoFileOrPath);
  throw new Error(`Vídeo não encontrado: tentei "${videoFileOrPath}" e "${candidate}"`);
}

function transcriptPathFor(videoPath) {
  return videoPath.replace(/\.mp4$/i, '.transcript.json');
}

function checkWhisperAvailable() {
  try {
    execSync(`"${PYTHON}" -c "from faster_whisper import WhisperModel"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runPython(scriptText) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const scriptPath = path.join(TMP_DIR, `whisper-${Date.now()}-${process.pid}.py`);
    fs.writeFileSync(scriptPath, scriptText, 'utf8');
    const child = spawn(PYTHON, [scriptPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    let stderr = '';
    child.stdout.on('data', d => { /* drain, we read from file */ stderr += ''; void d; });
    child.stderr.on('data', d => { stderr += d.toString('utf8'); });
    child.on('close', code => {
      try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
      if (code === 0) resolve(stderr);
      else reject(new Error(`whisper exit ${code}\nstderr: ${stderr.slice(0, 800)}`));
    });
    child.on('error', err => {
      try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
      reject(err);
    });
  });
}

async function runWhisper(videoPath) {
  if (!checkWhisperAvailable()) {
    throw new Error('faster-whisper não está instalado. Rode: pip install faster-whisper');
  }
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const outPath = path.join(TMP_DIR, `whisper-out-${Date.now()}-${process.pid}.json`);
  const pyScript = `
# -*- coding: utf-8 -*-
import json, io
from faster_whisper import WhisperModel

model = WhisperModel("${WHISPER_MODEL}", device="cpu", compute_type="int8")
segments, info = model.transcribe(
    r"${videoPath.replace(/"/g, '\\"')}",
    language="pt",
    vad_filter=True,
)
out = {
    "language": info.language,
    "duration": info.duration,
    "segments": [],
}
texts = []
for s in segments:
    txt = s.text.strip()
    out["segments"].append({"start": round(s.start, 2), "end": round(s.end, 2), "text": txt})
    texts.append(txt)
out["text"] = " ".join(texts).strip()

with io.open(r"${outPath.replace(/\\/g, '/').replace(/"/g, '\\"')}", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
`;
  await runPython(pyScript);
  if (!fs.existsSync(outPath)) {
    throw new Error(`Whisper rodou mas não gerou ${outPath}`);
  }
  const result = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  try { fs.unlinkSync(outPath); } catch { /* ignore */ }
  return result;
}

/**
 * Transcreve um clip com cache idempotente.
 * @param {string} videoFileOrPath - filename (resolvido contra MIDAS_CORTES_DIR) ou path absoluto.
 * @param {object} opts
 * @param {boolean} opts.force - se true, ignora cache e re-transcreve.
 * @returns {Promise<{ text, segments, duration, language, fromCache }>}
 */
async function transcribeClip(videoFileOrPath, opts = {}) {
  // (1) Cache do repo: midas/transcripts/corte_NNNNN.json
  // Tem prioridade — funciona em CI mesmo sem mp4 local.
  if (!opts.force) {
    const filename = path.basename(videoFileOrPath, '.mp4');
    const repoCachePath = path.join(REPO_TRANSCRIPTS_DIR, `${filename}.transcript.json`);
    if (fs.existsSync(repoCachePath)) {
      const cached = JSON.parse(fs.readFileSync(repoCachePath, 'utf8'));
      if (cached.text && typeof cached.text === 'string' && cached.text.trim()) {
        return { ...cached, fromCache: true, cacheSource: 'repo' };
      }
    }
  }

  // (2) Cache local ao lado do mp4 + Whisper fallback (modo desenvolvimento)
  const videoPath = resolveVideoPath(videoFileOrPath);
  const cachePath = transcriptPathFor(videoPath);

  if (!opts.force && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (cached.text && typeof cached.text === 'string' && cached.text.trim()) {
      return { ...cached, fromCache: true, cacheSource: 'local' };
    }
  }

  const result = await runWhisper(videoPath);
  if (!result.text || !result.text.trim()) {
    throw new Error(`Transcript vazio para ${path.basename(videoPath)} — Whisper rodou mas não retornou texto`);
  }
  fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));
  // Também salva no repo cache pra futuras execuções em CI
  try {
    fs.mkdirSync(REPO_TRANSCRIPTS_DIR, { recursive: true });
    const filename = path.basename(videoPath, '.mp4');
    fs.writeFileSync(path.join(REPO_TRANSCRIPTS_DIR, `${filename}.transcript.json`), JSON.stringify(result, null, 2));
  } catch { /* não crítico — local cache já tem */ }
  return { ...result, fromCache: false };
}

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    args[k] = v === undefined ? true : v;
  }
  return args;
}

async function main() {
  const args = parseArgs();
  if (!args.video) {
    console.error('Uso: node midas-transcribe.js --video=corte_00001.mp4 [--force]');
    process.exit(1);
  }
  const t = await transcribeClip(args.video, { force: !!args.force });
  console.log(`📝 ${args.video} (${t.duration?.toFixed?.(0) || '?'}s, ${t.segments.length} seg, cache=${t.fromCache})`);
  console.log('---');
  console.log(t.text);
}

if (require.main === module) {
  main().catch(err => {
    console.error('ERRO:', err.message);
    process.exit(1);
  });
}

module.exports = { transcribeClip, resolveVideoPath, transcriptPathFor };
