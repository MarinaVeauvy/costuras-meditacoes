// Render YouTube Faceless Videos V2
// Cria slides visuais com texto para cada seção do vídeo
// Cada seção do script vira um slide com heading + texto
// Background gradiente da marca + texto animado

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const YOUTUBE_DIR = path.join(__dirname, '..', 'youtube');
const TEMP_DIR = path.join(YOUTUBE_DIR, 'temp');
const FONT = process.platform === 'win32' ? 'C\\\\:/Windows/Fonts/arial.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD = process.platform === 'win32' ? 'C\\\\:/Windows/Fonts/arialbd.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

// Brand colors
const BG_COLOR = '0B0A12';
const GOLD = 'D4AF37';
const CREAM = 'F5EDE3';
const CORAL = 'e94560';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escapeFFmpeg(text) {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/:/g, '\\\\:')
    .replace(/'/g, "'\\\\\\\\\\\\\\''")
    .replace(/\[/g, '\\\\[')
    .replace(/\]/g, '\\\\]')
    .replace(/;/g, '\\\\;')
    .replace(/%/g, '%%');
}

function wrapText(text, maxChars = 45) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      lines.push(current.trim());
      current = word;
    } else {
      current += ' ' + word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function createSlideImage(slideNum, heading, text, isFirst, isLast) {
  ensureDir(TEMP_DIR);
  const outPath = path.join(TEMP_DIR, `slide_${String(slideNum).padStart(3, '0')}.png`);

  // Wrap text for multiple lines
  const headingLines = wrapText(heading, 35);
  const textLines = wrapText(text, 50);

  // Build drawtext filters
  let filters = [];

  // Background gradient (dark navy)
  // Gold accent line at top
  filters.push(`drawbox=x=0:y=0:w=1920:h=6:color=0x${GOLD}:t=fill`);

  // Slide number indicator (small dots)
  if (!isFirst && !isLast) {
    filters.push(`drawtext=text='${escapeFFmpeg('●  ●  ●')}':fontfile=${FONT}:fontcolor=0x${GOLD}:fontsize=20:x=(w-text_w)/2:y=50`);
  }

  // Marina Veauvy branding top-left
  filters.push(`drawtext=text='${escapeFFmpeg('MARINA VEAUVY')}':fontfile=${FONT}:fontcolor=0x${GOLD}40:fontsize=18:x=60:y=50`);

  // Heading (centered, large, gold/white)
  const headColor = isFirst ? CORAL : GOLD;
  const headSize = isFirst ? 64 : 56;
  headingLines.forEach((line, i) => {
    const y = isFirst ? 320 + (i * (headSize + 10)) : 280 + (i * (headSize + 10));
    filters.push(`drawtext=text='${escapeFFmpeg(line)}':fontfile=${FONT_BOLD}:fontcolor=0x${headColor}:fontsize=${headSize}:x=(w-text_w)/2:y=${y}`);
  });

  // Body text (centered, cream, smaller)
  const textStartY = isFirst ? 320 + headingLines.length * 74 + 40 : 280 + headingLines.length * 66 + 40;
  textLines.forEach((line, i) => {
    const y = textStartY + (i * 40);
    filters.push(`drawtext=text='${escapeFFmpeg(line)}':fontfile=${FONT}:fontcolor=0x${CREAM}B0:fontsize=30:x=(w-text_w)/2:y=${y}`);
  });

  // CTA on last slide
  if (isLast) {
    filters.push(`drawbox=x=660:y=700:w=600:h=70:color=0x${GOLD}:t=fill`);
    filters.push(`drawtext=text='${escapeFFmpeg('INSCREVA-SE NO CANAL')}':fontfile=${FONT_BOLD}:fontcolor=0x${BG_COLOR}:fontsize=28:x=(w-text_w)/2:y=718`);
  }

  // Footer
  filters.push(`drawtext=text='${escapeFFmpeg('wp.marinaveauvy.com.br')}':fontfile=${FONT}:fontcolor=0x${CREAM}30:fontsize=16:x=(w-text_w)/2:y=1030`);

  const filterStr = filters.join(',');

  const cmd = `ffmpeg -y -f lavfi -i "color=c=0x${BG_COLOR}:s=1920x1080:d=1" -vframes 1 -vf "${filterStr}" "${outPath}" 2>&1`;

  try {
    execSync(cmd, { timeout: 15000, stdio: 'pipe' });
    return outPath;
  } catch (err) {
    // Fallback: simple slide without fancy text
    const cmdSimple = `ffmpeg -y -f lavfi -i "color=c=0x${BG_COLOR}:s=1920x1080:d=1" -vframes 1 -vf "drawtext=text='${escapeFFmpeg(heading.substring(0, 40))}':fontcolor=0x${GOLD}:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2" "${outPath}"`;
    try {
      execSync(cmdSimple, { timeout: 15000, stdio: 'pipe' });
      return outPath;
    } catch {
      return null;
    }
  }
}

function renderVideo(slug) {
  const jsonPath = path.join(YOUTUBE_DIR, `${slug}.json`);
  const mp3Path = path.join(YOUTUBE_DIR, `${slug}.mp3`);
  const mp4Path = path.join(YOUTUBE_DIR, `${slug}.mp4`);

  if (!fs.existsSync(jsonPath) || !fs.existsSync(mp3Path)) return null;

  const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const sections = meta.script || [];
  if (sections.length === 0) return null;

  // Get audio duration
  let duration;
  try {
    const probe = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp3Path}"`, { stdio: 'pipe' }).toString().trim();
    duration = parseFloat(probe);
  } catch {
    duration = 300; // fallback 5 min
  }

  // Calculate duration per section
  const totalSections = sections.length;
  const durationPerSection = duration / totalSections;

  // Create slide images for each section
  const slideImages = [];
  sections.forEach((section, i) => {
    const heading = section.section === 'HOOK' ? (meta.youtube_title || meta.article_title || 'Video') :
                    section.section === 'END' ? 'Obrigada por assistir!' :
                    section.section === 'CTA' ? 'Gostou? Inscreva-se!' :
                    (section.visual_note || section.section || `Parte ${i + 1}`);
    const text = (section.text || '').substring(0, 200);
    const isFirst = i === 0;
    const isLast = i === totalSections - 1;

    const slidePath = createSlideImage(i, heading, text, isFirst, isLast);
    if (slidePath) {
      slideImages.push({ path: slidePath, duration: section.duration_seconds || durationPerSection });
    }
  });

  if (slideImages.length === 0) return null;

  // Create concat file for FFmpeg
  const concatFile = path.join(TEMP_DIR, `${slug}-concat.txt`);
  const concatContent = slideImages.map(s =>
    `file '${s.path.replace(/\\/g, '/')}'\nduration ${s.duration}`
  ).join('\n') + `\nfile '${slideImages[slideImages.length - 1].path.replace(/\\/g, '/')}'`;
  fs.writeFileSync(concatFile, concatContent);

  // Render: slideshow + audio → MP4
  const cmd = `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -i "${mp3Path}" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart "${mp4Path}"`;

  try {
    execSync(cmd, { timeout: 300000, stdio: 'pipe' });
    const stats = fs.statSync(mp4Path);
    return { path: mp4Path, size: (stats.size / 1024 / 1024).toFixed(1) };
  } catch (err) {
    console.error(`  ❌ Render falhou: ${err.message.substring(0, 200)}`);
    return null;
  }
}

function cleanup() {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
}

function main() {
  ensureDir(TEMP_DIR);

  const mp3s = fs.readdirSync(YOUTUBE_DIR).filter(f => f.endsWith('.mp3'));
  const maxVideos = parseInt(process.env.RENDER_COUNT || '10');
  const toRender = mp3s.slice(0, maxVideos);

  console.log(`🎬 Renderizando ${toRender.length} videos com slides visuais...\n`);

  let created = 0;
  for (const mp3 of toRender) {
    const slug = mp3.replace('.mp3', '');
    console.log(`🎬 ${slug.substring(0, 50)}...`);
    const result = renderVideo(slug);
    if (result) {
      console.log(`  ✅ ${result.size}MB`);
      created++;
    }
  }

  cleanup();
  console.log(`\n📊 ${created}/${toRender.length} videos renderizados com slides`);
}

main();
