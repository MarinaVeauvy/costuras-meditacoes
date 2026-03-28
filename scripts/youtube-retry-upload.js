// Retry upload de vídeos pendentes
// Roda diariamente até todos serem enviados
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const YOUTUBE_DIR = path.join(__dirname, '..', 'youtube');
const UPLOADED_FILE = path.join(YOUTUBE_DIR, 'uploaded-index.json');
const PYTHON = process.env.PYTHON_PATH || 'python';

function main() {
  const uploaded = fs.existsSync(UPLOADED_FILE)
    ? JSON.parse(fs.readFileSync(UPLOADED_FILE, 'utf8'))
    : [];
  const uploadedSlugs = new Set(uploaded.map(u => u.slug));

  const mp4s = fs.readdirSync(YOUTUBE_DIR).filter(f => f.endsWith('.mp4'));
  const pending = mp4s.filter(f => !uploadedSlugs.has(f.replace('.mp4', '')));

  if (pending.length === 0) {
    console.log('✅ Todos os vídeos já foram enviados!');
    return;
  }

  console.log(`${pending.length} vídeos pendentes. Tentando upload...`);
  try {
    execSync(`${PYTHON} ${path.join(__dirname, 'youtube-upload.py')}`, {
      stdio: 'inherit',
      env: { ...process.env, UPLOAD_COUNT: '5' },
      timeout: 300000,
    });
  } catch (err) {
    console.log('Upload parcial ou bloqueado. Tentará novamente amanhã.');
  }
}

main();
