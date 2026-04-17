#!/usr/bin/env node
/**
 * Midas YouTube Shorts Publisher
 *
 * Delega pro youtube-upload.py existente mas com metadata otimizada pra Shorts.
 * Uso:
 *   node midas-publish-yt-shorts.js --account=orar_prosperar --video=corte_00001.mp4 --title="..." --description="..."
 *
 * Env vars:
 *   YT_OAUTH_<N> — OAuth token JSON da conta N (conteúdo do youtube/oauth-token.json)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const STATE_PATH = path.join(__dirname, '..', '..', 'midas', 'state', 'published-yt.json');
const CORTES_DIR = process.env.MIDAS_CORTES_DIR || 'C:/Users/marin/midas-cortes/Cortes Prontos';
const YT_UPLOADER = path.join(__dirname, '..', 'youtube-upload.py');

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    args[k] = v || true;
  }
  return args;
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { published: [] };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function runPython(args, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const python = process.env.PYTHON || 'python';
    const child = spawn(python, args, {
      env: { ...process.env, ...envOverrides },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; process.stdout.write(d); });
    child.stderr.on('data', d => { stderr += d; process.stderr.write(d); });
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`python exit ${code}: ${stderr}`));
    });
  });
}

async function main() {
  const args = parseArgs();
  if (!args.account || !args.video) {
    console.error('Uso: node midas-publish-yt-shorts.js --account=<id> --video=<arquivo.mp4> [--title="..."] [--description="..."]');
    process.exit(1);
  }

  const config = loadConfig();
  const account = config.accounts.find(a => a.id === args.account);
  if (!account) throw new Error(`Conta não encontrada: ${args.account}`);
  if (!account.active) throw new Error(`Conta inativa: ${args.account}`);

  const ytToken = process.env[account.youtube_oauth_env];
  if (!ytToken) throw new Error(`Env var ausente: ${account.youtube_oauth_env}`);

  const videoPath = path.join(CORTES_DIR, args.video);
  if (!fs.existsSync(videoPath)) throw new Error(`Vídeo não encontrado: ${videoPath}`);

  const title = (args.title || `Renda extra de casa 💸 #Shorts`).slice(0, 100);
  const descriptionBody = args.description || `${config.affiliate_link ? `Link: ${config.bridge_site}` : ''}`;
  const description = `${descriptionBody}\n\n#Shorts #RendaExtra #TrabalheEmCasa #EmpreendedorismoDigital`;

  const metadataJson = {
    title,
    description,
    tags: ['Shorts', 'renda extra', 'trabalhe em casa', 'empreendedorismo digital'],
    categoryId: '22',
    privacyStatus: 'public',
    madeForKids: false,
  };

  const tmpMetadata = path.join(__dirname, '..', '..', 'midas', 'state', `yt-metadata-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(tmpMetadata), { recursive: true });
  fs.writeFileSync(tmpMetadata, JSON.stringify(metadataJson, null, 2));

  console.log(`[${account.id}] Subindo pro YouTube Shorts...`);
  await runPython([YT_UPLOADER, videoPath, tmpMetadata], {
    YOUTUBE_OAUTH_TOKEN: ytToken,
  });

  fs.unlinkSync(tmpMetadata);

  const state = loadState();
  state.published.push({
    account: args.account,
    video: args.video,
    title,
    publishedAt: new Date().toISOString(),
  });
  saveState(state);

  console.log('✅ YouTube Short publicado');
}

if (require.main === module) {
  main().catch(err => {
    console.error('ERRO:', err.message);
    process.exit(1);
  });
}
