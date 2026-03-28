// Render YouTube Faceless Videos
// Combina narração MP3 + imagem de fundo estática → MP4
// Usa FFmpeg para criar vídeo com áudio
// Output: /youtube/{slug}.mp4

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const YOUTUBE_DIR = path.join(__dirname, '..', 'youtube');
const COVERS_DIR = path.join(__dirname, '..', 'covers');

// Background image for videos (dark gradient with branding)
const BG_IMAGE = path.join(COVERS_DIR, 'youtube-bg.png');

function createBackground() {
  if (fs.existsSync(BG_IMAGE)) return;

  // Create a simple branded background with FFmpeg
  const cmd = `ffmpeg -y -f lavfi -i "color=c=0x0B0A12:s=1920x1080:d=1" -vframes 1 "${BG_IMAGE}" 2>&1`;
  execSync(cmd, { timeout: 10000 });
  console.log('✅ Background criado');
}

function getUnrendered() {
  const mp3s = fs.readdirSync(YOUTUBE_DIR).filter(f => f.endsWith('.mp3'));
  return mp3s.filter(f => {
    const mp4 = f.replace('.mp3', '.mp4');
    return !fs.existsSync(path.join(YOUTUBE_DIR, mp4));
  });
}

function renderVideo(mp3File) {
  const slug = mp3File.replace('.mp3', '');
  const mp3Path = path.join(YOUTUBE_DIR, mp3File);
  const mp4Path = path.join(YOUTUBE_DIR, `${slug}.mp4`);
  const jsonPath = path.join(YOUTUBE_DIR, `${slug}.json`);

  // Get video metadata
  let title = slug;
  let thumbnailText = '';
  if (fs.existsSync(jsonPath)) {
    const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    title = meta.youtube_title || meta.article_title || slug;
    thumbnailText = meta.thumbnail_text || '';
  }

  // FFmpeg: combine static image + audio → video
  // -loop 1: loop the image
  // -shortest: stop when audio ends
  // -c:v libx264: H.264 codec (YouTube compatible)
  // -tune stillimage: optimize for static image
  // -pix_fmt yuv420p: YouTube compatible pixel format
  const cmd = `ffmpeg -y -loop 1 -i "${BG_IMAGE}" -i "${mp3Path}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -vf "drawtext=text='${title.replace(/'/g, "'\\''").substring(0, 60)}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2-40:fontfile=/Windows/Fonts/arial.ttf,drawtext=text='Marina Veauvy':fontcolor=0xD4AF37:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2+40:fontfile=/Windows/Fonts/arial.ttf" "${mp4Path}" 2>&1`;

  try {
    execSync(cmd, { timeout: 300000, stdio: 'pipe' });
    const stats = fs.statSync(mp4Path);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    return { path: mp4Path, size: sizeMB };
  } catch (err) {
    // Fallback sem drawtext se fonte não funcionar
    const cmdSimple = `ffmpeg -y -loop 1 -i "${BG_IMAGE}" -i "${mp3Path}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest "${mp4Path}"`;
    try {
      execSync(cmdSimple, { timeout: 300000, stdio: 'pipe' });
      const stats = fs.statSync(mp4Path);
      return { path: mp4Path, size: (stats.size / 1024 / 1024).toFixed(1) };
    } catch (err2) {
      console.error(`  ❌ FFmpeg erro: ${err2.message.substring(0, 200)}`);
      return null;
    }
  }
}

function main() {
  if (!fs.existsSync(COVERS_DIR)) fs.mkdirSync(COVERS_DIR, { recursive: true });

  createBackground();

  const pending = getUnrendered();
  const maxVideos = parseInt(process.env.RENDER_COUNT || '10');
  const toRender = pending.slice(0, maxVideos);

  console.log(`🎬 Renderizando ${toRender.length} vídeos...\n`);

  if (toRender.length === 0) {
    console.log('✅ Todos os vídeos já foram renderizados!');
    return;
  }

  let created = 0;
  for (const mp3 of toRender) {
    const slug = mp3.replace('.mp3', '');
    console.log(`🎬 ${slug.substring(0, 50)}...`);
    const result = renderVideo(mp3);
    if (result) {
      console.log(`  ✅ ${result.size}MB`);
      created++;
    }
  }

  console.log(`\n📊 ${created}/${toRender.length} vídeos renderizados`);
  console.log(`📁 Arquivos em: ${YOUTUBE_DIR}`);
  console.log('\nPara upload no YouTube:');
  console.log('1. Abra studio.youtube.com');
  console.log('2. Clique "Criar" → "Enviar vídeos"');
  console.log('3. Arraste os arquivos .mp4');
  console.log('4. Use título e descrição do .json correspondente');
}

main();
