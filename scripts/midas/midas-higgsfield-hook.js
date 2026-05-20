#!/usr/bin/env node
/**
 * Midas Higgsfield Hook — gera 3s cinematográfico via Higgsfield CLI
 * e concatena com o corte Bruno via ffmpeg.
 *
 * Estratégia: hook 3s antes do corte aumenta retenção dos primeiros segundos
 * (scroll-stop premium) sem perder áudio autoritário do MAC.
 *
 * Uso:
 *   node midas-higgsfield-hook.js --video=corte_00001.mp4 --account=pros_peridade_do_reino
 *   node midas-higgsfield-hook.js --video=corte_00001.mp4 --account=X --dry-run
 *
 * Output: corte_NNNNN_with_intro.mp4 ao lado do original.
 *
 * Pré-requisitos:
 *   - higgsfield CLI instalado + autenticado (higgsfield auth login)
 *   - ffmpeg disponível no PATH
 *   - caption JSON em midas/captions/ com hook + theme_category
 *
 * Fail mode: se Higgsfield não estiver disponível (auth ausente, créditos
 * esgotados, rate limit), aborta com mensagem clara — NÃO sobe corte sem hook.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const fs = require('fs');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const CAPTIONS_DIR = path.join(__dirname, '..', '..', 'midas', 'captions');
const CORTES_DIR = process.env.MIDAS_CORTES_DIR || 'C:/Users/marin/midas-cortes/Cortes Prontos';
const HIGGS_MODEL = process.env.MIDAS_HIGGS_MODEL || 'cinema_studio_3_5';
const HIGGS_DURATION = parseInt(process.env.MIDAS_HIGGS_DURATION || '3', 10);

// Templates de prompt cinematográfico por tema. Foco: religioso/familiar,
// fotorrealista, vertical 9:16, mood que ressoa com público cristão BR.
const PROMPT_TEMPLATES = {
  financeiro: 'Cinematic vertical 9:16 shot, 4K, warm golden hour lighting. Open hands receiving coins of light against a soft religious altar background, blurred candles. Hopeful, sacred atmosphere. Slow zoom in. No text on screen.',
  fe: 'Cinematic vertical 9:16 shot, 4K, sun rays streaming through cathedral stained glass window onto an open Bible on a wooden table. Dust particles dance in the light. Peaceful, divine atmosphere. Slow camera tilt up. No text on screen.',
  familia: 'Cinematic vertical 9:16 shot, 4K, golden hour, mother and young daughter hands intertwined on a wooden kitchen table with flour and bread, warm home atmosphere, soft focus background. Slow push in. No text on screen.',
  proposito: 'Cinematic vertical 9:16 shot, 4K, woman silhouette walking confidently toward a mountain sunrise on a forest trail, golden rays cutting through trees, determined posture. Slow tracking shot. No text on screen.',
};

function parseArgs() {
  const out = { dryRun: false };
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') { out.dryRun = true; continue; }
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function loadCaption(videoFile) {
  const base = path.basename(videoFile, '.mp4');
  const captionPath = path.join(CAPTIONS_DIR, `${base}.json`);
  if (!fs.existsSync(captionPath)) {
    throw new Error(`Caption não encontrada: ${captionPath}. Rode midas-generate-captions.js primeiro.`);
  }
  return JSON.parse(fs.readFileSync(captionPath, 'utf8'));
}

function buildPrompt(hook, themeCategory) {
  const base = PROMPT_TEMPLATES[themeCategory] || PROMPT_TEMPLATES.fe;
  // hook entra no caption do video, não no prompt visual (evita Higgsfield
  // tentar renderizar texto, o que sai mal). Caption visual fica por conta
  // do midas-overlay-hook.js que já roda depois.
  return base;
}

function checkHiggsfieldAvailable() {
  try {
    execSync('higgsfield version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkAuthenticated() {
  try {
    const out = execSync('higgsfield account', { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    return !/Not authenticated/i.test(out);
  } catch (err) {
    return false;
  }
}

function generateHookVideo(prompt) {
  console.log(`🎬 Higgsfield generate: ${HIGGS_MODEL} (${HIGGS_DURATION}s)`);
  console.log(`   Prompt: ${prompt.slice(0, 120)}...`);

  // Cria job
  const createOut = execSync(
    `higgsfield generate create ${HIGGS_MODEL} --prompt ${JSON.stringify(prompt)} --duration ${HIGGS_DURATION} --aspect 9:16 --json`,
    { encoding: 'utf8' }
  );
  const job = JSON.parse(createOut);
  const jobId = job.id || job.job_id;
  if (!jobId) throw new Error(`Higgsfield não retornou job_id: ${createOut}`);
  console.log(`   job_id=${jobId} — aguardando...`);

  // Espera completar (pode demorar 30s-2min)
  execSync(`higgsfield generate wait ${jobId}`, { stdio: 'inherit' });

  // Pega resultado final
  const getOut = execSync(`higgsfield generate get ${jobId} --json`, { encoding: 'utf8' });
  const result = JSON.parse(getOut);
  const videoUrl = result.output?.url || result.video_url || result.result?.url;
  if (!videoUrl) throw new Error(`Higgsfield não retornou URL do vídeo: ${getOut}`);
  return { jobId, videoUrl, result };
}

function downloadVideo(url, destPath) {
  console.log(`⬇️  Download ${url}`);
  const r = spawnSync('curl', ['-s', '-L', url, '-o', destPath]);
  if (r.status !== 0 || !fs.existsSync(destPath)) {
    throw new Error(`Download falhou: status ${r.status}`);
  }
}

function concatVideos(introPath, cortePath, outPath) {
  console.log(`🎞️  ffmpeg concat: intro 3s + corte`);
  // Re-encode pra garantir compatibilidade (intro AI pode ter codec/fps diferente)
  // Resolução alvo: 1080x1920 (match dos cortes Bruno)
  const concatList = path.join(os.tmpdir(), `midas-concat-${Date.now()}.txt`);
  fs.writeFileSync(concatList,
    `file '${introPath.replace(/\\/g, '/')}'\n` +
    `file '${cortePath.replace(/\\/g, '/')}'\n`
  );

  // Tenta concat fast (mesmo codec). Se falhar, re-encode.
  let r = spawnSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0', '-i', concatList,
    '-c', 'copy', outPath,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  if (r.status !== 0) {
    console.log('   ⚠️  concat fast falhou — re-encoding...');
    r = spawnSync('ffmpeg', [
      '-y', '-i', introPath, '-i', cortePath,
      '-filter_complex',
      '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0];' +
      '[1:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1];' +
      '[v0][0:a?][v1][1:a?]concat=n=2:v=1:a=1[outv][outa]',
      '-map', '[outv]', '-map', '[outa]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', 128 + 'k',
      outPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
  }

  try { fs.unlinkSync(concatList); } catch { /* ignore */ }

  if (r.status !== 0 || !fs.existsSync(outPath)) {
    const stderr = (r.stderr || Buffer.alloc(0)).toString().slice(-1500);
    throw new Error(`ffmpeg concat falhou:\n${stderr}`);
  }
}

async function main() {
  const args = parseArgs();
  if (!args.video || !args.account) {
    throw new Error('Uso: --video=corte_NNNNN.mp4 --account=ACCOUNT_ID [--dry-run]');
  }

  const captions = loadCaption(args.video);
  const accountCaption = captions[args.account];
  if (!accountCaption) {
    throw new Error(`Caption não tem entry pra account "${args.account}"`);
  }
  const hook = accountCaption.hook;
  const themeCategory = accountCaption.theme_category || 'fe';
  const prompt = buildPrompt(hook, themeCategory);

  console.log(`📝 Video: ${args.video}`);
  console.log(`👤 Account: ${args.account}`);
  console.log(`🎯 Hook: "${hook}"`);
  console.log(`🏷️  Theme: ${themeCategory}`);
  console.log(`📜 Prompt: ${prompt}`);
  console.log('');

  if (args.dryRun) {
    console.log('🌫️  --dry-run: parando aqui. Nenhum crédito consumido.');
    return;
  }

  if (!checkHiggsfieldAvailable()) {
    throw new Error('higgsfield CLI não encontrado no PATH. Veja midas/SETUP-HIGGSFIELD.md');
  }
  if (!checkAuthenticated()) {
    throw new Error('Higgsfield não autenticado. Rode: higgsfield auth login');
  }

  const { jobId, videoUrl } = generateHookVideo(prompt);

  // Salva intro temporário
  const introPath = path.join(os.tmpdir(), `midas-intro-${jobId}.mp4`);
  downloadVideo(videoUrl, introPath);

  // Concat com corte original
  const cortePath = path.join(CORTES_DIR, args.video);
  if (!fs.existsSync(cortePath)) throw new Error(`Corte não encontrado: ${cortePath}`);

  const baseName = path.basename(args.video, '.mp4');
  const outPath = path.join(CORTES_DIR, `${baseName}_with_intro.mp4`);
  concatVideos(introPath, cortePath, outPath);

  // Cleanup intro temp
  try { fs.unlinkSync(introPath); } catch { /* ignore */ }

  console.log(`\n✅ Pronto: ${outPath}`);
  console.log(`   Próximo passo: midas-overlay-hook.js usa esse arquivo no Cloudinary upload.`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('ERRO:', err.message);
    process.exit(1);
  });
}

module.exports = { buildPrompt, PROMPT_TEMPLATES };
