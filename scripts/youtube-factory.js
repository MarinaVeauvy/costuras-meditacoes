// ============================================================
// YOUTUBE FACTORY — Pipeline Completo de Vídeos Faceless
// ============================================================
// Artigo → Script → Narração TTS → B-roll Pexels → Render → Upload
// Gera vídeos profissionais 100% automáticos
//
// Dependências: edge-tts (Python), ffmpeg, playwright
// APIs: OpenAI (script), Pexels (footage), YouTube (upload)
// ============================================================

const { generate } = require('./ai-provider');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Config
const YOUTUBE_DIR = path.join(__dirname, '..', 'youtube');
const FACTORY_DIR = path.join(YOUTUBE_DIR, 'factory');
const UPLOADED_FILE = path.join(YOUTUBE_DIR, 'uploaded-index.json');
const PEXELS_KEY = process.env.PEXELS_API_KEY;
const PYTHON = process.env.PYTHON_PATH || 'C:/Users/marin/AppData/Local/Programs/Python/Python312/python.exe';
const WP_URL = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts';
const WP_AUTH = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', (err) => { fs.unlinkSync(dest); reject(err); });
  });
}

// ============================================================
// STEP 1: Get articles that need videos
// ============================================================
async function getArticlesForVideos(count = 5) {
  const res = await fetch(`${WP_URL}?per_page=30&orderby=date&order=desc&_fields=id,title,link,excerpt,slug`, {
    headers: { Authorization: `Basic ${WP_AUTH}` },
  });
  const articles = await res.json();

  // Filter out calculators and already processed
  const uploaded = getUploaded();
  const uploadedSlugs = new Set(uploaded.map(u => u.slug));
  const factoryDone = fs.existsSync(FACTORY_DIR)
    ? new Set(fs.readdirSync(FACTORY_DIR).filter(f => f.endsWith('.mp4')).map(f => f.replace('.mp4', '')))
    : new Set();

  return articles.filter(a =>
    !uploadedSlugs.has(a.slug) &&
    !factoryDone.has(a.slug) &&
    !a.slug.includes('salario-') &&
    !a.slug.includes('quanto-rende-') &&
    !a.slug.includes('calculadora-') &&
    !a.slug.includes('simulador-') &&
    !a.title.rendered.includes('mundo')
  ).slice(0, count);
}

function getUploaded() {
  if (fs.existsSync(UPLOADED_FILE)) return JSON.parse(fs.readFileSync(UPLOADED_FILE, 'utf8'));
  return [];
}

// ============================================================
// STEP 2: Generate video script with AI
// ============================================================
async function generateScript(article) {
  const title = article.title.rendered;
  const excerpt = article.excerpt.rendered.replace(/<[^>]+>/g, '').substring(0, 300);

  const prompt = `Crie um roteiro de YouTube Short (60 segundos) sobre este artigo.

ARTIGO: "${title}"
RESUMO: "${excerpt}"

Retorne JSON com:
- youtube_title: título SEO YouTube (max 70 chars, keyword no início, pt-BR)
- description: descrição YouTube com keywords (300 chars, pt-BR)
- tags: array de 10 tags em português
- thumbnail_text: texto curto para thumbnail (max 25 chars)
- scenes: array de 5-6 objetos, cada um com:
  - narration: texto da narração para essa cena (1-2 frases, pt-BR)
  - visual_query: busca em inglês para stock footage no Pexels (ex: "woman working laptop", "money coins finance")
  - duration: duração em segundos (total deve dar ~60s)

REGRAS:
- Cena 1: HOOK forte (5-7 segundos)
- Cenas 2-4: conteúdo prático (10-15 segundos cada)
- Cena 5: CTA inscrever-se (5-7 segundos)
- Tom: direto, prático, empoderador
- NUNCA mencionar "Quarta Via", "manifestar", "lei da atração"`;

  return await generate(prompt, { json: true, maxTokens: 2048 });
}

// ============================================================
// STEP 3: Generate TTS narration for each scene
// ============================================================
function generateTTS(text, outputPath) {
  const escaped = text.replace(/"/g, '\\"').replace(/\n/g, ' ');
  const cmd = `${PYTHON} -m edge_tts --voice "pt-BR-FranciscaNeural" --rate="+5%" --text "${escaped}" --write-media "${outputPath}"`;
  execSync(cmd, { timeout: 30000, stdio: 'pipe' });
}

function getAudioDuration(filePath) {
  try {
    const result = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`, { stdio: 'pipe' });
    return parseFloat(result.toString().trim());
  } catch { return 5; }
}

// ============================================================
// STEP 4: Download B-roll from Pexels
// ============================================================
async function downloadBroll(query, outputPath, minDuration = 5) {
  if (!PEXELS_KEY) throw new Error('PEXELS_API_KEY não configurada');

  const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&size=medium&orientation=portrait`, {
    headers: { Authorization: PEXELS_KEY },
  });
  const data = await res.json();

  if (!data.videos || data.videos.length === 0) {
    // Fallback: generic business footage
    const fallback = await fetch(`https://api.pexels.com/videos/search?query=business+woman+office&per_page=3&size=medium&orientation=portrait`, {
      headers: { Authorization: PEXELS_KEY },
    });
    const fbData = await fallback.json();
    if (!fbData.videos?.length) throw new Error('No Pexels videos found');
    data.videos = fbData.videos;
  }

  // Pick best video (prefer HD, portrait)
  const video = data.videos[0];
  const file = video.video_files
    .filter(f => f.width >= 720)
    .sort((a, b) => (a.width <= 1080 ? -1 : 1))[0] || video.video_files[0];

  await downloadFile(file.link, outputPath);
  return outputPath;
}

// ============================================================
// STEP 5: Render final video with FFmpeg
// ============================================================
function renderVideo(scenes, outputPath) {
  const tempDir = path.join(FACTORY_DIR, 'temp_' + Date.now());
  ensureDir(tempDir);

  const segmentPaths = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const audioPath = scene.audioPath;
    const videoPath = scene.videoPath;
    const audioDuration = scene.audioDuration;
    const segmentPath = path.join(tempDir, `segment_${i}.mp4`);

    // Trim/loop video to match audio duration, add subtle zoom effect
    // Scale to 1080x1920 (9:16 portrait for Shorts)
    const cmd = `ffmpeg -y -stream_loop -1 -i "${videoPath}" -i "${audioPath}" ` +
      `-filter_complex "` +
      `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
      `zoompan=z='min(zoom+0.0005,1.15)':d=${Math.ceil(audioDuration * 25)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25,` +
      `drawtext=text='Marina Veauvy':fontcolor=white@0.3:fontsize=20:x=40:y=h-50` +
      `[v]" ` +
      `-map "[v]" -map 1:a -c:v libx264 -preset fast -c:a aac -b:a 192k ` +
      `-t ${audioDuration} -shortest "${segmentPath}"`;

    try {
      execSync(cmd, { timeout: 120000, stdio: 'pipe' });
      segmentPaths.push(segmentPath);
    } catch {
      // Fallback simpler render without zoompan
      const cmdSimple = `ffmpeg -y -stream_loop -1 -i "${videoPath}" -i "${audioPath}" ` +
        `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" ` +
        `-c:v libx264 -preset fast -c:a aac -b:a 192k ` +
        `-t ${audioDuration} -shortest "${segmentPath}"`;
      try {
        execSync(cmdSimple, { timeout: 120000, stdio: 'pipe' });
        segmentPaths.push(segmentPath);
      } catch (err2) {
        console.log(`    Cena ${i} falhou: ${err2.message.substring(0, 60)}`);
      }
    }
  }

  if (segmentPaths.length === 0) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return null;
  }

  // Concat all segments
  const concatFile = path.join(tempDir, 'concat.txt');
  fs.writeFileSync(concatFile, segmentPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));

  const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c:v libx264 -c:a aac -movflags +faststart "${outputPath}"`;
  execSync(concatCmd, { timeout: 120000, stdio: 'pipe' });

  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
  return outputPath;
}

// ============================================================
// HELPER: Build optimized YouTube description with affiliate CTA
// ============================================================
function buildDescription(summary, articleUrl) {
  const affiliateLink = 'https://novavidaprospera.com.br/?ref=yt_marina';
  const amazonBook = 'https://www.amazon.com.br/dp/B0F1Y3QKQ7?tag=marinaveauv04-20';
  const blog = 'https://wp.marinaveauvy.com.br';
  const channel = 'https://www.youtube.com/@marinaveauvy';

  return `${summary}

💡 Método completo passo a passo no link:
👉 ${affiliateLink}

📖 Artigo completo: ${articleUrl}

━━━━━━━━━━━━━━━━━━━━━━━
🎯 QUER IR MAIS FUNDO?
━━━━━━━━━━━━━━━━━━━━━━━

📝 Blog com conteúdo novo toda semana:
${blog}

📚 Meu livro na Amazon:
${amazonBook}

📧 Newsletters gratuitas (assina direto):
• Dinheiro Simples (toda quinta 07h)
• Impulso IA (toda terça 07h)
• Renda Extra Report (todo sábado 09h)
${blog}

📺 Inscreva-se pra mais conteúdo:
${channel}

━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Conteúdo educativo. Não é recomendação de investimento. Decisões financeiras são pessoais — estude e consulte profissional qualificado.

#financas #investimentos #iaparamulheres #empreendedorismo #educacaofinanceira #rendaextra #mulheresempreendedoras`;
}

// ============================================================
// STEP 6: Upload to YouTube
// ============================================================
async function uploadToYouTube(videoPath, metadata, articleUrl) {
  const uploadScript = path.join(__dirname, 'youtube-upload-single.py');

  // Create temp metadata file
  const metaPath = videoPath.replace('.mp4', '-meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    youtube_title: metadata.youtube_title,
    youtube_description: buildDescription(metadata.description, articleUrl),
    tags: metadata.tags || [],
  }));

  const cmd = `${PYTHON} "${uploadScript}" "${videoPath}" "${metaPath}"`;
  try {
    const result = execSync(cmd, { timeout: 120000, stdio: 'pipe' }).toString();
    const videoId = result.match(/VIDEO_ID:(\S+)/)?.[1];
    return videoId;
  } catch (err) {
    console.log(`    Upload erro: ${err.message.substring(0, 100)}`);
    return null;
  }
}

// ============================================================
// MAIN PIPELINE
// ============================================================
async function processArticle(article) {
  const slug = article.slug;
  const workDir = path.join(FACTORY_DIR, slug);
  ensureDir(workDir);

  console.log(`\n🎬 ${article.title.rendered.substring(0, 55)}...`);

  // Step 1: Generate script
  console.log('  1/5 Gerando script...');
  const script = await generateScript(article);
  fs.writeFileSync(path.join(workDir, 'script.json'), JSON.stringify(script, null, 2));

  const scenes = script.scenes || [];
  if (scenes.length < 3) {
    console.log('  ⚠️ Script com poucas cenas, pulando');
    return null;
  }

  // Step 2: Generate TTS for each scene
  console.log('  2/5 Gerando narração...');
  for (let i = 0; i < scenes.length; i++) {
    const audioPath = path.join(workDir, `audio_${i}.mp3`);
    generateTTS(scenes[i].narration, audioPath);
    scenes[i].audioPath = audioPath;
    scenes[i].audioDuration = getAudioDuration(audioPath);
  }

  // Step 3: Download B-roll for each scene
  console.log('  3/5 Baixando footage Pexels...');
  for (let i = 0; i < scenes.length; i++) {
    const videoPath = path.join(workDir, `broll_${i}.mp4`);
    try {
      await downloadBroll(scenes[i].visual_query, videoPath);
      scenes[i].videoPath = videoPath;
    } catch (err) {
      console.log(`    B-roll cena ${i} fallback...`);
      // Use previous scene's video or generic
      scenes[i].videoPath = i > 0 ? scenes[i - 1].videoPath : null;
    }
    await new Promise(r => setTimeout(r, 500)); // Pexels rate limit
  }

  // Filter scenes with both audio and video
  const validScenes = scenes.filter(s => s.audioPath && s.videoPath);
  if (validScenes.length < 2) {
    console.log('  ⚠️ Poucas cenas válidas');
    return null;
  }

  // Step 4: Render video
  console.log('  4/5 Renderizando vídeo...');
  const outputPath = path.join(FACTORY_DIR, `${slug}.mp4`);
  const rendered = renderVideo(validScenes, outputPath);
  if (!rendered) {
    console.log('  ❌ Render falhou');
    return null;
  }

  const size = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
  console.log(`  5/5 Vídeo pronto! (${size}MB)`);

  // Save metadata (inclui youtube_description montada com CTA afiliado)
  fs.writeFileSync(path.join(FACTORY_DIR, `${slug}.json`), JSON.stringify({
    ...script,
    article_url: article.link,
    article_title: article.title.rendered,
    youtube_description: buildDescription(script.description || '', article.link),
    slug,
    rendered_at: new Date().toISOString(),
  }, null, 2));

  // Cleanup work dir
  fs.rmSync(workDir, { recursive: true, force: true });

  return { path: outputPath, metadata: script, slug };
}

async function main() {
  ensureDir(FACTORY_DIR);

  const maxVideos = parseInt(process.env.VIDEO_COUNT || '3');
  console.log(`🏭 YouTube Factory — Gerando ${maxVideos} vídeos profissionais\n`);

  const articles = await getArticlesForVideos(maxVideos);
  console.log(`${articles.length} artigos disponíveis para vídeo`);

  if (articles.length === 0) {
    console.log('✅ Todos os artigos já têm vídeo!');
    return;
  }

  let success = 0;
  for (const article of articles) {
    try {
      const result = await processArticle(article);
      if (result) {
        success++;
        console.log(`  ✅ ${result.metadata.youtube_title?.substring(0, 50)}`);
      }
    } catch (err) {
      console.log(`  ❌ ${err.message.substring(0, 100)}`);
    }
  }

  console.log(`\n📊 ${success}/${articles.length} vídeos criados em /youtube/factory/`);

  // Upload all factory videos
  if (success > 0 && process.env.YOUTUBE_UPLOAD !== 'false') {
    console.log('\n📤 Enviando para YouTube...');

    // Ensure token file exists from env var (GitHub Actions)
    const tokenFile = path.join(YOUTUBE_DIR, 'oauth-token.json');
    if (!fs.existsSync(tokenFile) && process.env.YOUTUBE_OAUTH_TOKEN) {
      fs.writeFileSync(tokenFile, process.env.YOUTUBE_OAUTH_TOKEN, 'utf8');
      console.log('  Token criado a partir de YOUTUBE_OAUTH_TOKEN env var');
    }

    const uploaded = getUploaded();

    const mp4s = fs.readdirSync(FACTORY_DIR).filter(f => f.endsWith('.mp4'));
    for (const mp4 of mp4s) {
      const slug = mp4.replace('.mp4', '');
      if (uploaded.some(u => u.slug === slug)) continue;

      const metaFile = path.join(FACTORY_DIR, `${slug}.json`);
      if (!fs.existsSync(metaFile)) continue;

      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      console.log(`  📤 ${meta.youtube_title?.substring(0, 50)}...`);

      // Use Python uploader
      try {
        const tokenFile = path.join(YOUTUBE_DIR, 'oauth-token.json');
        if (!fs.existsSync(tokenFile)) {
          console.log('    ⚠️ YouTube token não encontrado');
          break;
        }

        const uploaderScript = path.join(__dirname, 'youtube-upload-single.py');
        const videoPath = path.join(FACTORY_DIR, mp4);
        const metaPath = path.join(FACTORY_DIR, slug + '.json');
        const uploadCmd = `${PYTHON} "${uploaderScript}" "${videoPath}" "${metaPath}"`;

        const result = execSync(uploadCmd, { timeout: 300000, stdio: 'pipe' }).toString();
        const videoId = result.match(/VIDEO_ID:(\S+)/)?.[1];

        if (videoId) {
          uploaded.push({
            slug,
            video_id: videoId,
            url: `https://youtube.com/watch?v=${videoId}`,
            title: meta.youtube_title,
            uploaded_at: new Date().toISOString(),
            source: 'factory',
          });
          fs.writeFileSync(UPLOADED_FILE, JSON.stringify(uploaded, null, 2));
          console.log(`    ✅ https://youtube.com/watch?v=${videoId}`);
        }
      } catch (err) {
        const stderr = err.stderr ? err.stderr.toString() : '';
        const stdout = err.stdout ? err.stdout.toString() : '';
        console.log(`    ❌ Upload falhou: ${err.message.substring(0, 200)}`);
        if (stderr) console.log(`       stderr:\n${stderr}`);
        if (stdout) console.log(`       stdout:\n${stdout}`);
      }

      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
