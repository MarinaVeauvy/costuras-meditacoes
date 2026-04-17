#!/usr/bin/env node
/**
 * Midas Publer Batch Generator
 *
 * Monta pasta "publer-batch-YYYY-MM-DD" com:
 *   - 15-20 vídeos renomeados pra "conta_NN.mp4"
 *   - Planilha CSV com colunas que o Publer bulk importer entende
 *   - Arquivo captions.txt pra copiar/colar rápido
 *
 * Uso: node midas-publer-batch.js [--count=15]
 *
 * Fluxo manual depois:
 *   1. Abre pasta midas/publer-batches/YYYY-MM-DD/
 *   2. Entra no Publer web → Library → Bulk upload
 *   3. Solta os mp4 + cola captions do CSV
 *   4. Publer agenda automaticamente nos dias seguintes
 */

const fs = require('fs');
const path = require('path');
const { generateCaptions } = require('./midas-generate-captions');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const CAPTIONS_DIR = path.join(__dirname, '..', '..', 'midas', 'captions');
const BATCHES_DIR = path.join(__dirname, '..', '..', 'midas', 'publer-batches');
const STATE_PATH = path.join(__dirname, '..', '..', 'midas', 'state', 'published-tiktok.json');
const CORTES_DIR = process.env.MIDAS_CORTES_DIR || 'C:/Users/marin/midas-cortes/Cortes Prontos';

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    args[k] = v || true;
  }
  return args;
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { used: [] };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function listAvailableCortes(used) {
  const all = fs.readdirSync(CORTES_DIR).filter(f => f.endsWith('.mp4')).sort();
  return all.filter(f => !used.includes(f));
}

function formatCsvRow(fields) {
  return fields.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',');
}

async function ensureCaptions(videoFile) {
  const outPath = path.join(CAPTIONS_DIR, `${path.basename(videoFile, '.mp4')}.json`);
  if (fs.existsSync(outPath)) {
    return JSON.parse(fs.readFileSync(outPath, 'utf8'));
  }
  const captions = await generateCaptions({ videoFile });
  fs.mkdirSync(CAPTIONS_DIR, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(captions, null, 2));
  return captions;
}

async function main() {
  const args = parseArgs();
  const count = parseInt(args.count || '15', 10);

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const state = loadState();
  const available = listAvailableCortes(state.used);

  if (available.length < count) {
    console.warn(`⚠️  Apenas ${available.length} cortes disponíveis (${state.used.length} já usados). Resetando pool...`);
    state.used = [];
    saveState(state);
  }

  const selected = available.slice(0, count);
  const dateStr = new Date().toISOString().slice(0, 10);
  const batchDir = path.join(BATCHES_DIR, dateStr);
  fs.mkdirSync(batchDir, { recursive: true });

  const accounts = config.accounts.filter(a => a.active || a.persona !== 'PENDING');
  const csvHeader = formatCsvRow(['Filename', 'Conta', 'Handle TikTok', 'Caption']);
  const csvLines = [csvHeader];
  const captionsTxt = [];

  let counter = 1;
  for (const video of selected) {
    console.log(`\n[${counter}/${selected.length}] Processando ${video}...`);
    const captions = await ensureCaptions(video);

    for (const account of accounts) {
      const caption = captions[account.id];
      if (!caption) continue;

      const newName = `${account.id}_${String(counter).padStart(2, '0')}.mp4`;
      const srcPath = path.join(CORTES_DIR, video);
      const dstPath = path.join(batchDir, newName);
      fs.copyFileSync(srcPath, dstPath);

      csvLines.push(formatCsvRow([
        newName,
        account.id,
        account.tiktok_handle || 'PENDING',
        caption.caption_tiktok,
      ]));

      captionsTxt.push(`=== ${newName} | @${account.tiktok_handle || 'PENDING'} ===\n${caption.caption_tiktok}\n`);
    }

    state.used.push(video);
    counter++;
  }

  fs.writeFileSync(path.join(batchDir, 'publer-import.csv'), csvLines.join('\n'));
  fs.writeFileSync(path.join(batchDir, 'captions.txt'), captionsTxt.join('\n'));
  saveState(state);

  const totalFiles = (count * accounts.length);
  console.log(`\n✅ Batch gerado em ${batchDir}`);
  console.log(`   ${totalFiles} arquivos mp4 (${count} cortes × ${accounts.length} contas)`);
  console.log(`   publer-import.csv — importa no Publer Bulk Upload`);
  console.log(`   captions.txt — lista pra copiar caption por caption`);
  console.log(`\n📌 Próximo passo manual:`);
  console.log(`   1. Abre ${batchDir}`);
  console.log(`   2. No Publer web: Library → Upload → solta todos mp4`);
  console.log(`   3. Pra cada vídeo, cola caption correspondente do CSV`);
  console.log(`   4. Agenda nos próximos 10-15 dias (2 posts/dia/conta)`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('ERRO:', err.message);
    process.exit(1);
  });
}
