// Gera áudio narração para vídeos YouTube via Edge TTS (gratuito)
// Voz: pt-BR-FranciscaNeural (feminina, brasileira, friendly)
// Output: /youtube/{slug}.mp3

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PYTHON = process.env.PYTHON_PATH || 'C:/Users/marin/AppData/Local/Programs/Python/Python312/python.exe';
const VOICE = 'pt-BR-FranciscaNeural';
const RATE = '+5%'; // Slightly faster for YouTube
const YOUTUBE_DIR = path.join(__dirname, '..', 'youtube');

function getUnnarrated() {
  const files = fs.readdirSync(YOUTUBE_DIR).filter(f => f.endsWith('-narration.txt'));
  return files.filter(f => {
    const mp3 = f.replace('-narration.txt', '.mp3');
    return !fs.existsSync(path.join(YOUTUBE_DIR, mp3));
  });
}

async function generateAudio(narrationFile) {
  const slug = narrationFile.replace('-narration.txt', '');
  const textPath = path.join(YOUTUBE_DIR, narrationFile);
  const mp3Path = path.join(YOUTUBE_DIR, `${slug}.mp3`);

  const text = fs.readFileSync(textPath, 'utf8').trim();
  if (!text) {
    console.log(`  ⚠️ Narração vazia: ${slug}`);
    return null;
  }

  // Edge TTS via Python
  const cmd = `${PYTHON} -m edge_tts --voice "${VOICE}" --rate="${RATE}" --text "${text.replace(/"/g, '\\"').replace(/\n/g, ' ')}" --write-media "${mp3Path}"`;

  try {
    execSync(cmd, { timeout: 120000, stdio: 'pipe' });
    const stats = fs.statSync(mp3Path);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`  ✅ ${slug}.mp3 (${sizeMB}MB)`);
    return mp3Path;
  } catch (err) {
    console.error(`  ❌ Erro TTS: ${err.message.substring(0, 200)}`);
    return null;
  }
}

async function main() {
  const maxAudios = parseInt(process.env.AUDIO_COUNT || '10');
  const pending = getUnnarrated().slice(0, maxAudios);

  console.log(`🎙️ Gerando ${pending.length} narrações com Edge TTS (${VOICE})...\n`);

  if (pending.length === 0) {
    console.log('✅ Todas as narrações já foram geradas!');
    return;
  }

  let created = 0;
  for (const file of pending) {
    const slug = file.replace('-narration.txt', '');
    console.log(`🎙️ ${slug.substring(0, 50)}...`);
    const result = await generateAudio(file);
    if (result) created++;
  }

  console.log(`\n📊 ${created}/${pending.length} áudios gerados`);
  console.log('Próximo passo: combinar áudio + stock footage com FFmpeg');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
