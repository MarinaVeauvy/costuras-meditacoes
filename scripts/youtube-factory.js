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
// STEP 2: Generate video script with AI (Format Vault edition)
// ============================================================
const VOICE_POOL = [
  'pt-BR-FranciscaNeural',  // calma, calorosa
  'pt-BR-ThalitaNeural',    // jovem, dinâmica
];

const BGM_POOL = [
  // Mixkit royalty-free (URLs públicas, licença permissiva)
  'https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3',
  'https://assets.mixkit.co/music/preview/mixkit-driving-ambition-32.mp3',
  'https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3',
  'https://assets.mixkit.co/music/preview/mixkit-uplifting-pop-619.mp3',
  'https://assets.mixkit.co/music/preview/mixkit-getting-ready-39.mp3',
  'https://assets.mixkit.co/music/preview/mixkit-positive-business-685.mp3',
];

async function generateScript(article) {
  const title = article.title.rendered;
  const excerpt = article.excerpt.rendered.replace(/<[^>]+>/g, '').substring(0, 300);

  const prompt = `Crie um roteiro de YouTube Short (45-60 segundos) sobre este artigo.

ARTIGO: "${title}"
RESUMO: "${excerpt}"

ESTRUTURA OBRIGATÓRIA (Format Vault Brendan Kane):
- Cena 1 HOOK (3-5s): Format Vault — escolha 1:
  * FV-001 Counter-Intuitive: "Tudo que te ensinaram sobre X está errado"
  * FV-005 Secret Reveal: "O que ninguém conta sobre Y"
  * FV-007 Data Drop: "97% das pessoas erram nisso"
  * FV-006 Pattern Interrupt: "Pare. Você precisa ver isso"
- Cenas 2-4 CONTEÚDO (8-12s cada): especificidade obrigatória — 1 número/fato concreto por cena, sem "transforma sua vida"
- Cena 5 CTA (5-7s): "Tá no link da bio" / "Salve pra ler depois" / "Comenta AMÉM se concorda"

Retorne JSON:
- youtube_title: max 70 chars, keyword no início, hook scroll-stop
- description: 300 chars com keywords pt-BR
- tags: array 10 tags
- thumbnail_text: max 18 chars, MAIÚSCULAS, hook destacado
- thumbnail_keyword: 1 palavra que ressume (pra contraste visual na thumb)
- scenes: array 5 objetos com:
  - narration: texto narração (1-2 frases, max 25 palavras, pt-BR)
  - visual_query: busca Pexels em inglês (ex: "woman writing journal warm")
  - visual_query_alt: busca alternativa pra cortes dinâmicos (mesmo tema, ângulo diferente)
  - keywords_highlight: array 1-3 palavras DA narração pra destacar em dourado
  - voice: "francisca" (calma, default) | "thalita" (dinâmica, hook/CTA)
  - duration: segundos (total ~50s)

REGRAS:
- Tom: direto, narrador/educativo, voz neutra
- Tema: educação financeira + IA + empreendedorismo + renda passiva
- NUNCA mencionar "Marina", "Marina Veauvy", "minha experiência pessoal", "no meu caso", "comigo aconteceu"
- NUNCA mencionar "Quarta Via", "manifestar", "lei da atração", cripto direto
- Voz é narrador genérico AurumLab Cloud, não pessoa identificada
- Tags NÃO devem incluir "marina", "marinaveauvy", nome próprio`;

  return await generate(prompt, { json: true, maxTokens: 2048 });
}

// ============================================================
// STEP 3: Generate TTS narration (voz parametrizada)
// ============================================================
function resolveVoice(voiceKey) {
  if (voiceKey === 'thalita') return 'pt-BR-ThalitaNeural';
  if (voiceKey === 'francisca') return 'pt-BR-FranciscaNeural';
  return voiceKey || 'pt-BR-FranciscaNeural';
}

function generateTTS(text, outputPath, voiceKey = 'francisca') {
  const voice = resolveVoice(voiceKey);
  const escaped = text.replace(/"/g, '\\"').replace(/\n/g, ' ');
  const cmd = `${PYTHON} -m edge_tts --voice "${voice}" --rate="+5%" --text "${escaped}" --write-media "${outputPath}"`;
  execSync(cmd, { timeout: 30000, stdio: 'pipe' });
}

function getAudioDuration(filePath) {
  try {
    const result = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`, { stdio: 'pipe' });
    return parseFloat(result.toString().trim());
  } catch { return 5; }
}

// ============================================================
// STEP 4: Download B-roll from Pexels — múltiplos clipes pra cortes dinâmicos
// ============================================================
async function downloadBrollClips(queries, outputDir, sceneIdx, count = 2) {
  if (!PEXELS_KEY) throw new Error('PEXELS_API_KEY não configurada');
  const clipsPaths = [];
  const seenIds = new Set();

  for (const query of queries) {
    if (clipsPaths.length >= count) break;
    try {
      const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=8&size=medium&orientation=portrait`, {
        headers: { Authorization: PEXELS_KEY },
      });
      const data = await res.json();
      const videos = (data.videos || []).filter(v => !seenIds.has(v.id));
      for (const video of videos) {
        if (clipsPaths.length >= count) break;
        seenIds.add(video.id);
        const file = video.video_files
          .filter(f => f.width >= 720 && f.height >= f.width)
          .sort((a, b) => Math.abs(b.height - 1920) - Math.abs(a.height - 1920))[0]
          || video.video_files.find(f => f.file_type === 'video/mp4');
        if (!file) continue;
        const dest = path.join(outputDir, `broll_${sceneIdx}_${clipsPaths.length}.mp4`);
        await downloadFile(file.link, dest);
        clipsPaths.push(dest);
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (e) { /* tenta próxima query */ }
  }

  if (!clipsPaths.length) {
    // Fallback genérico
    try {
      const res = await fetch(`https://api.pexels.com/videos/search?query=business+woman+office&per_page=3&size=medium&orientation=portrait`, {
        headers: { Authorization: PEXELS_KEY },
      });
      const data = await res.json();
      const v = data.videos?.[0];
      if (v) {
        const f = v.video_files.find(f => f.width >= 720) || v.video_files[0];
        const dest = path.join(outputDir, `broll_${sceneIdx}_fallback.mp4`);
        await downloadFile(f.link, dest);
        clipsPaths.push(dest);
      }
    } catch {}
  }

  return clipsPaths;
}

// ============================================================
// STEP 4b: Download BGM (background music) royalty-free
// ============================================================
async function downloadBgm(outputPath) {
  const url = BGM_POOL[Math.floor(Math.random() * BGM_POOL.length)];
  try {
    await downloadFile(url, outputPath);
    return outputPath;
  } catch (e) {
    console.log(`    BGM download falhou: ${e.message.slice(0, 80)}`);
    return null;
  }
}

// ============================================================
// STEP 5: Render final video with FFmpeg (Brendan Kane edition)
//
// Melhorias v2 (07/05):
// - Hook overlay top 3s (palavra-chave da cena 1, fontsize 80, cor dourada)
// - Cortes dinâmicos: 2 clipes Pexels por cena, troca a 50% da cena
// - Texto kinetic: drawtext com fade-in palavra por palavra
// - Highlights: keywords da scene em cor dourada
// - Watermark @aurumlabcloud (não mais Marina Veauvy)
// - Music bed: BGM volume 12%, ducking auto sob TTS
// - Fade transitions entre cenas (200ms)
// ============================================================

function escapeDt(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%');
}

function buildSceneFilter({ sceneIdx, narration, keywords, audioDuration, hookText, isFirstScene, clipPaths }) {
  // Splits audioDuration entre N clipes
  const N = clipPaths.length;
  const perClipDur = audioDuration / N;
  const fps = 25;

  // Cada clipe: scale + crop 1080x1920 + zoompan + trim
  const clipFilters = clipPaths.map((_, i) =>
    `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
    `zoompan=z='min(zoom+0.0005,1.12)':d=${Math.ceil(perClipDur * fps)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${fps},` +
    `trim=duration=${perClipDur.toFixed(2)},setpts=PTS-STARTPTS[c${i}]`
  ).join(';');

  // Concat dos clipes
  const concat = clipPaths.map((_, i) => `[c${i}]`).join('') + `concat=n=${N}:v=1:a=0[bg]`;

  // Caption kinetic: palavra por palavra cumulativa, com highlight em keywords
  // Estratégia: tokeniza, monta drawtexts cumulativos
  const words = (narration || '').split(/\s+/).filter(Boolean);
  const slot = audioDuration / Math.max(words.length, 1);
  const kwSet = new Set((keywords || []).map(k => k.toLowerCase().replace(/[.,;!?]/g, '')));

  const wordDrawtexts = [];
  for (let w = 0; w < words.length; w++) {
    const visible = words.slice(0, w + 1).join(' ');
    const startT = w * slot;
    const endT = (w + 1) * slot + 0.3; // 300ms de overlap suave
    // Word color: dourado se for keyword, branco senão
    const lastWord = words[w].toLowerCase().replace(/[.,;!?]/g, '');
    const isKw = kwSet.has(lastWord);
    const color = isKw ? '#FFE082' : 'white';
    wordDrawtexts.push(
      `drawtext=text='${escapeDt(visible)}':fontcolor=${color}:fontsize=58:` +
      `borderw=3:bordercolor=black@0.85:` +
      `box=1:boxcolor=black@0.45:boxborderw=18:` +
      `line_spacing=10:x=(w-text_w)/2:y=h*0.62:` +
      `enable='between(t\\,${startT.toFixed(2)}\\,${endT.toFixed(2)})'`
    );
  }
  // Frase completa fica no fim
  const finalText = words.join(' ');
  wordDrawtexts.push(
    `drawtext=text='${escapeDt(finalText)}':fontcolor=white:fontsize=58:` +
    `borderw=3:bordercolor=black@0.85:` +
    `box=1:boxcolor=black@0.45:boxborderw=18:` +
    `line_spacing=10:x=(w-text_w)/2:y=h*0.62:` +
    `enable='gte(t\\,${(words.length * slot).toFixed(2)})'`
  );

  // Hook overlay top 3s (apenas na primeira cena)
  let hookOverlay = '';
  if (isFirstScene && hookText) {
    hookOverlay =
      `,drawtext=text='${escapeDt(hookText.toUpperCase())}':fontcolor=#FFE082:fontsize=82:` +
      `borderw=4:bordercolor=black@0.95:` +
      `box=1:boxcolor=black@0.65:boxborderw=22:` +
      `line_spacing=14:x=(w-text_w)/2:y=h*0.18:` +
      `enable='between(t\\,0\\,3.0)'`;
  }

  // Watermark @aurumlabcloud — todo vídeo
  const watermark =
    `,drawtext=text='@aurumlabcloud':fontcolor=white@0.55:fontsize=26:` +
    `borderw=1:bordercolor=black@0.7:x=w-text_w-30:y=40`;

  // Compose final
  return `${clipFilters};${concat};[bg]${wordDrawtexts.join(',')}${hookOverlay}${watermark}[v]`;
}

function renderVideo(scenes, outputPath, bgmPath = null) {
  const tempDir = path.join(FACTORY_DIR, 'temp_' + Date.now());
  ensureDir(tempDir);

  const segmentPaths = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const audioPath = scene.audioPath;
    const clipPaths = scene.clipPaths || (scene.videoPath ? [scene.videoPath] : []);
    if (!audioPath || !clipPaths.length) continue;

    const audioDuration = scene.audioDuration;
    const segmentPath = path.join(tempDir, `segment_${i}.mp4`);

    // Build filter_complex
    const filterStr = buildSceneFilter({
      sceneIdx: i,
      narration: scene.narration || '',
      keywords: scene.keywords_highlight || [],
      audioDuration,
      hookText: i === 0 ? (scene.hook_overlay || (scene.narration || '').split(/[.!?]/)[0] || '') : '',
      isFirstScene: i === 0,
      clipPaths,
    });

    // Build inputs (todos os clipes + audio)
    const inputs = clipPaths.map(p => `-stream_loop -1 -i "${p}"`).join(' ') + ` -i "${audioPath}"`;
    const audioMapIdx = clipPaths.length;

    const cmd = `ffmpeg -y ${inputs} -filter_complex "${filterStr}" ` +
      `-map "[v]" -map ${audioMapIdx}:a -c:v libx264 -preset fast -c:a aac -b:a 192k ` +
      `-t ${audioDuration} -shortest -pix_fmt yuv420p "${segmentPath}"`;

    try {
      execSync(cmd, { timeout: 180000, stdio: 'pipe' });
      segmentPaths.push(segmentPath);
    } catch (e) {
      // Fallback v1 — sem kinetic + sem cortes (1 clipe estático)
      console.log(`    Cena ${i}: fallback render simples (${(e.message||'').slice(-150)})`);
      const cmdSimple = `ffmpeg -y -stream_loop -1 -i "${clipPaths[0]}" -i "${audioPath}" ` +
        `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
        `drawtext=text='@aurumlabcloud':fontcolor=white@0.55:fontsize=26:x=w-text_w-30:y=40" ` +
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

  // Concat segments (sem BGM ainda)
  const concatFile = path.join(tempDir, 'concat.txt');
  fs.writeFileSync(concatFile, segmentPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  const intermediatePath = bgmPath ? path.join(tempDir, 'concat_no_bgm.mp4') : outputPath;
  const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c:v libx264 -c:a aac -movflags +faststart "${intermediatePath}"`;
  execSync(concatCmd, { timeout: 120000, stdio: 'pipe' });

  // Mix BGM com ducking (sidechaincompress: BGM abaixa quando TTS toca)
  if (bgmPath && fs.existsSync(bgmPath)) {
    try {
      // Ducking: comprime BGM com sidechain do TTS
      // Volume BGM 12%, ducking ratio 8:1
      const mixCmd = `ffmpeg -y -i "${intermediatePath}" -stream_loop -1 -i "${bgmPath}" ` +
        `-filter_complex "` +
        `[1:a]volume=0.12,aloop=loop=-1:size=2e9[bgm];` +
        `[0:a][bgm]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=200[mixed]` +
        `" -map 0:v -map "[mixed]" -c:v copy -c:a aac -b:a 192k -shortest "${outputPath}"`;
      execSync(mixCmd, { timeout: 120000, stdio: 'pipe' });
    } catch (e) {
      // Fallback sem ducking — só mixa volumes
      console.log(`    BGM mix com ducking falhou, fallback simples: ${(e.message||'').slice(-100)}`);
      try {
        const fallbackMix = `ffmpeg -y -i "${intermediatePath}" -stream_loop -1 -i "${bgmPath}" ` +
          `-filter_complex "[1:a]volume=0.10[bgm];[0:a][bgm]amix=inputs=2:duration=first[mixed]" ` +
          `-map 0:v -map "[mixed]" -c:v copy -c:a aac -b:a 192k -shortest "${outputPath}"`;
        execSync(fallbackMix, { timeout: 120000, stdio: 'pipe' });
      } catch (e2) {
        // Último recurso: copia sem BGM
        fs.copyFileSync(intermediatePath, outputPath);
      }
    }
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
  return outputPath;
}

// ============================================================
// STEP 5b: Gerar thumbnail customizada (1280x720)
// ============================================================
function generateThumbnail(scenes, thumbText, thumbnailPath) {
  // Pega primeiro frame do primeiro clipe como BG, sobrepõe texto grande dourado
  const clipPaths = scenes[0]?.clipPaths || (scenes[0]?.videoPath ? [scenes[0].videoPath] : []);
  if (!clipPaths.length || !thumbText) return null;
  const bgClip = clipPaths[0];
  const t = (thumbText || '').toUpperCase().slice(0, 22);

  try {
    const cmd = `ffmpeg -y -i "${bgClip}" -ss 1.0 -frames:v 1 ` +
      `-vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,` +
      `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.40:t=fill,` +
      `drawtext=text='${escapeDt(t)}':fontcolor=#FFE082:fontsize=110:` +
      `borderw=5:bordercolor=black@0.95:` +
      `box=1:boxcolor=black@0.55:boxborderw=24:` +
      `line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2,` +
      `drawtext=text='@aurumlabcloud':fontcolor=white@0.7:fontsize=32:` +
      `borderw=2:bordercolor=black@0.8:x=w-text_w-40:y=h-60" ` +
      `"${thumbnailPath}"`;
    execSync(cmd, { timeout: 30000, stdio: 'pipe' });
    return thumbnailPath;
  } catch (e) {
    console.log(`    Thumbnail erro: ${(e.message||'').slice(-100)}`);
    return null;
  }
}

// ============================================================
// HELPER: Build optimized YouTube description with affiliate CTA
// ============================================================
function buildDescription(summary, articleUrl) {
  const affiliateLink = 'https://novavidaprospera.com.br/?ref=yt_aurumlab';
  const channel = 'https://www.youtube.com/@aurumlabcloud';

  // Description AurumLab Cloud — sem branding pessoal Marina Veauvy
  return `${summary}

💡 Método completo passo a passo no link:
👉 ${affiliateLink}

━━━━━━━━━━━━━━━━━━━━━━━
🎯 SE INSCREVA NO CANAL
━━━━━━━━━━━━━━━━━━━━━━━

📺 ${channel}

Conteúdo novo sobre estratégias financeiras, automação com IA, renda passiva digital e educação financeira aplicada ao empreendedorismo moderno.

━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Conteúdo educativo. Não é recomendação de investimento. Decisões financeiras são pessoais — estude e consulte profissional qualificado.

#financas #investimentos #empreendedorismo #educacaofinanceira #rendapassiva #automacao`;
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

  // Step 2: Generate TTS for each scene (voz parametrizada)
  console.log('  2/6 Gerando narração (Francisca/Thalita)...');
  for (let i = 0; i < scenes.length; i++) {
    const audioPath = path.join(workDir, `audio_${i}.mp3`);
    const voiceKey = scenes[i].voice || (i === 0 || i === scenes.length - 1 ? 'thalita' : 'francisca');
    generateTTS(scenes[i].narration, audioPath, voiceKey);
    scenes[i].audioPath = audioPath;
    scenes[i].audioDuration = getAudioDuration(audioPath);
  }

  // Step 3: Download múltiplos clipes B-roll por cena (cortes dinâmicos)
  console.log('  3/6 Baixando footage Pexels (2 clipes/cena)...');
  for (let i = 0; i < scenes.length; i++) {
    const queries = [scenes[i].visual_query, scenes[i].visual_query_alt].filter(Boolean);
    try {
      const clips = await downloadBrollClips(queries, workDir, i, 2);
      scenes[i].clipPaths = clips;
      scenes[i].videoPath = clips[0]; // legacy compat
    } catch (err) {
      console.log(`    B-roll cena ${i} fallback...`);
      scenes[i].clipPaths = i > 0 && scenes[i - 1].clipPaths ? [scenes[i - 1].clipPaths[0]] : [];
      scenes[i].videoPath = scenes[i].clipPaths[0] || null;
    }
    await new Promise(r => setTimeout(r, 400));
  }

  // Step 4: Download BGM (música de fundo)
  console.log('  4/6 Baixando BGM royalty-free...');
  const bgmPath = path.join(workDir, 'bgm.mp3');
  const bgmOk = await downloadBgm(bgmPath);

  // Filter scenes with audio + clips
  const validScenes = scenes.filter(s => s.audioPath && s.clipPaths && s.clipPaths.length);
  if (validScenes.length < 2) {
    console.log('  ⚠️ Poucas cenas válidas');
    return null;
  }

  // Adiciona hook overlay text na primeira cena (LLM thumbnail_text)
  if (validScenes[0]) {
    validScenes[0].hook_overlay = script.thumbnail_text || (validScenes[0].narration || '').split(/[.!?]/)[0];
  }

  // Step 5: Render video (Brendan Kane edition)
  console.log('  5/6 Renderizando (hook+kinetic+cortes+BGM)...');
  const outputPath = path.join(FACTORY_DIR, `${slug}.mp4`);
  const rendered = renderVideo(validScenes, outputPath, bgmOk);
  if (!rendered) {
    console.log('  ❌ Render falhou');
    return null;
  }

  // Step 5b: Thumbnail customizada
  const thumbPath = path.join(FACTORY_DIR, `${slug}-thumb.jpg`);
  generateThumbnail(validScenes, script.thumbnail_text, thumbPath);

  const size = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
  console.log(`  6/6 Vídeo pronto! (${size}MB)`);

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
