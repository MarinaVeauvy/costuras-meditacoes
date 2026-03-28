// Atualiza o sitemap das Web Stories para indexação no Google
const fs = require('fs');
const path = require('path');

const STORIES_DIR = path.join(__dirname, '..', 'web-stories');
const INDEX_FILE = path.join(STORIES_DIR, 'stories-index.json');
const SITEMAP_FILE = path.join(STORIES_DIR, 'sitemap-stories.xml');

function main() {
  if (!fs.existsSync(INDEX_FILE)) {
    console.log('Nenhuma Web Story encontrada.');
    return;
  }

  const stories = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));

  const urls = stories.map(s => `  <url>
    <loc>${s.story_url}</loc>
    <lastmod>${s.created_at.split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  fs.writeFileSync(SITEMAP_FILE, sitemap);
  console.log(`✅ Sitemap atualizado: ${stories.length} Web Stories`);
}

main();
