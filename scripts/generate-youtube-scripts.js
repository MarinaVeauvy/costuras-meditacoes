// YouTube Faceless Video Pipeline
// Transforma artigos do blog em scripts de vídeo narrados por IA
// Output: /youtube/ com script, descrição SEO e tags para cada vídeo
// Próximo passo: usar ElevenLabs/TTS para narração + stock footage para render

const { generate } = require('./ai-provider');
const fs = require('fs');
const path = require('path');

const WP_URL = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts';
const WP_AUTH = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');
const OUTPUT_DIR = path.join(__dirname, '..', 'youtube');
const INDEX_FILE = path.join(OUTPUT_DIR, 'videos-index.json');
const AMAZON_TAG = 'marinaveauv04-20';

const CHANNEL_CONFIG = {
  name: 'Marina Veauvy — Finanças e IA',
  style: 'faceless narration with stock footage, clean graphics, relaxed female Brazilian voice',
  tone: 'prático, acessível, empoderador — como uma amiga que entende de finanças e tecnologia',
  cta_subscribe: 'Se esse vídeo te ajudou, se inscreve no canal e ativa o sininho!',
  cta_like: 'Deixa o like pra eu saber que você gostou!',
  end_screen: 'Veja também o próximo vídeo que aparece na tela — vai te ajudar demais.',
};

async function getArticles(count = 20) {
  const res = await fetch(`${WP_URL}?per_page=${count}&orderby=date&order=desc&_fields=id,title,link,excerpt,slug,content`, {
    headers: { Authorization: `Basic ${WP_AUTH}` },
  });
  return res.json();
}

function getProcessedSlugs() {
  if (fs.existsSync(INDEX_FILE)) {
    return new Set(JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')).map(v => v.slug));
  }
  return new Set();
}

async function generateVideoScript(article) {
  const title = article.title.rendered;
  const excerpt = article.excerpt.rendered.replace(/<[^>]+>/g, '').substring(0, 300);

  const prompt = `Você é roteirista de vídeos para YouTube no nicho de finanças pessoais e IA para mulheres empreendedoras brasileiras.

Crie um roteiro COMPLETO para um vídeo faceless (sem aparecer no vídeo) baseado neste artigo:
TÍTULO: "${title}"
RESUMO: "${excerpt}"

FORMATO DO ROTEIRO:
1. HOOK (primeiros 10 segundos — prender atenção, gerar curiosidade)
2. INTRO (15 segundos — apresentar o tema e o que vai aprender)
3. CONTEÚDO (3-5 seções, cada uma com 30-60 segundos)
4. CTA (10 segundos — like, inscrever, comentar)
5. ENCERRAMENTO (5 segundos)

Duração total: 5-8 minutos de narração.

Retorne JSON com:
- youtube_title: título SEO otimizado para YouTube (max 70 chars, com keyword no início)
- youtube_description: descrição completa (300-500 chars) com keywords, links úteis e CTA
- tags: array de 10-15 tags relevantes em português
- script: array de objetos com { section: "HOOK"|"INTRO"|"CONTENT"|"CTA"|"END", text: "texto da narração", visual_note: "sugestão de imagem/footage para essa parte", duration_seconds: número }
- thumbnail_text: texto curto e impactante para thumbnail (max 30 chars)`;

  return await generate(prompt, { json: true, maxTokens: 4096 });
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const maxVideos = parseInt(process.env.VIDEO_COUNT || '5');
  console.log(`🎬 Gerando até ${maxVideos} scripts de vídeo...\n`);

  const articles = await getArticles(30);
  const processed = getProcessedSlugs();

  // Filtrar artigos que não são calculadoras/simuladores (não funcionam bem como vídeo)
  const candidates = articles.filter(a =>
    !processed.has(a.slug) &&
    !a.slug.includes('salario-') &&
    !a.slug.includes('quanto-rende-') &&
    !a.slug.includes('calculadora-') &&
    !a.slug.includes('simulador-') &&
    !a.title.rendered.includes('mundo')
  );

  const toGenerate = candidates.slice(0, maxVideos);
  console.log(`${candidates.length} artigos elegíveis | ${processed.size} já processados | ${toGenerate.length} a gerar\n`);

  let index = [];
  if (fs.existsSync(INDEX_FILE)) {
    index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  }

  let created = 0;
  for (const article of toGenerate) {
    console.log(`🎬 ${article.title.rendered.substring(0, 50)}...`);
    try {
      const video = await generateVideoScript(article);

      // Salvar script individual
      const scriptPath = path.join(OUTPUT_DIR, `${article.slug}.json`);
      fs.writeFileSync(scriptPath, JSON.stringify({
        article_url: article.link,
        article_title: article.title.rendered,
        ...video,
        channel: CHANNEL_CONFIG,
        generated_at: new Date().toISOString(),
      }, null, 2));

      // Salvar narração como texto puro (para TTS)
      const narrationPath = path.join(OUTPUT_DIR, `${article.slug}-narration.txt`);
      const narration = (video.script || []).map(s => s.text).join('\n\n');
      fs.writeFileSync(narrationPath, narration);

      index.push({
        slug: article.slug,
        title: video.youtube_title || article.title.rendered,
        article_url: article.link,
        thumbnail_text: video.thumbnail_text || '',
        tags: video.tags || [],
        created_at: new Date().toISOString(),
      });

      created++;
      console.log(`  ✅ Script + narração salvos`);
    } catch (err) {
      console.error(`  ❌ Erro: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`\n📊 ${created} scripts de vídeo gerados`);
  console.log(`📁 Total: ${index.length} vídeos em /youtube/`);
  console.log('\nPróximos passos:');
  console.log('1. Gerar narração com ElevenLabs ou Google TTS');
  console.log('2. Combinar com stock footage (Pexels/Pixabay)');
  console.log('3. Render com FFmpeg ou Remotion');
  console.log('4. Upload no YouTube com título e descrição do JSON');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
