// Generate Pinterest pin descriptions for each blog article
// Pinterest drives significant organic traffic to blogs
// This creates a pins.json file that can be used with Pinterest API or manual scheduling

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const WP_URL = 'https://wp.marinaveauvy.com.br/wp-json/wp/v2/posts';
const WP_AUTH = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');
const SITE_URL = 'https://wp.marinaveauvy.com.br';
const fs = require('fs');
const path = require('path');

async function getArticles(count = 10) {
  const res = await fetch(`${WP_URL}?per_page=${count}&orderby=date&order=desc&_fields=id,title,link,excerpt`, {
    headers: { Authorization: `Basic ${WP_AUTH}` },
  });
  return res.json();
}

async function generatePinData(article) {
  const title = article.title.rendered;
  const excerpt = article.excerpt.rendered.replace(/<[^>]+>/g, '').substring(0, 200);

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Generate a Pinterest pin for this article. Title: "${title}". Excerpt: "${excerpt}".

Return JSON with:
- pin_title: eye-catching title for Pinterest (max 100 chars, Portuguese pt-BR)
- description: Pinterest-optimized description with keywords and hashtags (max 500 chars, Portuguese pt-BR)
- board: suggested Pinterest board name (Portuguese)
- alt_text: image alt text for accessibility` }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            pin_title: { type: 'string' },
            description: { type: 'string' },
            board: { type: 'string' },
            alt_text: { type: 'string' },
          },
          required: ['pin_title', 'description', 'board', 'alt_text'],
        },
      },
    }),
  });

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;
  return JSON.parse(text);
}

async function main() {
  const count = parseInt(process.env.PIN_COUNT || '10');
  console.log(`Generating Pinterest pins for ${count} articles...`);

  const articles = await getArticles(count);
  const pins = [];

  for (const article of articles) {
    console.log(`📌 ${article.title.rendered.substring(0, 50)}...`);
    try {
      const pinData = await generatePinData(article);
      if (pinData) {
        pins.push({
          article_url: article.link,
          article_title: article.title.rendered,
          ...pinData,
        });
        console.log(`  ✅ "${pinData.pin_title.substring(0, 40)}..."`);
      }
    } catch (err) {
      console.error(`  ❌ ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  // Save pins data
  const outputPath = path.join(__dirname, '..', 'pinterest-pins.json');
  fs.writeFileSync(outputPath, JSON.stringify(pins, null, 2));
  console.log(`\n📊 ${pins.length} pins generated → pinterest-pins.json`);
  console.log('\nTo use:');
  console.log('1. Create Pinterest Business account');
  console.log('2. Use Pinterest API or Tailwind app to schedule pins');
  console.log('3. Each pin links back to the blog article = free traffic');
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
