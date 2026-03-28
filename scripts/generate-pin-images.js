// Gera imagens de pin bonitas para Pinterest
// Usa os templates HTML da pasta /pins/ como base
// Adapta título e CTA de cada artigo → screenshot → imagem 1000x1500

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PINS_DIR = path.join(__dirname, '..', 'pins');
const PINS_FILE = path.join(__dirname, '..', 'pinterest-pins.json');
const IMAGES_DIR = path.join(__dirname, '..', 'pinterest-images');
const SITE_URL = 'https://marinaveauvy.github.io/costuras-meditacoes';

// 5 template styles to rotate
const TEMPLATES = [
  'pin-bold-statement-01.html',
  'pin-soft-editorial-01.html',
  'pin-infographic-minimal-01.html',
  'pin-handwritten-accent-01.html',
  'pin-bold-statement-02.html',
];

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

function slugify(text) {
  return text.toLowerCase()
    .replace(/[àáâã]/g, 'a').replace(/[éê]/g, 'e').replace(/[íî]/g, 'i')
    .replace(/[óôõ]/g, 'o').replace(/[úû]/g, 'u').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 60);
}

async function generatePinImage(browser, pin, templateFile, index) {
  const slug = slugify(pin.pin_title);
  const outputPath = path.join(IMAGES_DIR, `${slug}.png`);

  if (fs.existsSync(outputPath)) return outputPath;

  const templatePath = path.join(PINS_DIR, templateFile);
  if (!fs.existsSync(templatePath)) return null;

  let html = fs.readFileSync(templatePath, 'utf8');

  // Replace headline text with pin title
  // Find the headline content between h1 tags or .headline class
  html = html.replace(
    /(<h1[^>]*class="headline"[^>]*>)([\s\S]*?)(<\/h1>)/,
    `$1${pin.pin_title.substring(0, 80)}$3`
  );

  // Also try replacing any existing headline text
  html = html.replace(
    /(<div class="headline">)([\s\S]*?)(<\/div>)/,
    `$1${pin.pin_title.substring(0, 80)}$3`
  );

  // Replace body/subheadline text
  html = html.replace(
    /(<[^>]*class="(?:body|subheadline)"[^>]*>)([\s\S]*?)(<\/(?:p|div)>)/,
    `$1${pin.description.replace(/#\w+/g, '').substring(0, 120).trim()}$3`
  );

  // Replace CTA text
  html = html.replace(
    /(<[^>]*class="cta-(?:pill|text)"[^>]*>)([\s\S]*?)(<\/(?:a|span|div)>)/,
    `$1Ler Artigo Completo →$3`
  );

  // Replace footer URL
  html = html.replace(/marinaveauvy\.com\.br/g, 'wp.marinaveauvy.com.br');

  // Write temp HTML
  const tempPath = path.join(IMAGES_DIR, `temp_${index}.html`);
  fs.writeFileSync(tempPath, html);

  // Screenshot
  const page = await browser.newPage({ viewport: { width: 1000, height: 1500 } });
  await page.goto(`file:///${tempPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: outputPath, clip: { x: 0, y: 0, width: 1000, height: 1500 } });
  await page.close();

  // Cleanup temp
  fs.unlinkSync(tempPath);

  return outputPath;
}

async function main() {
  ensureDir(IMAGES_DIR);

  const pins = JSON.parse(fs.readFileSync(PINS_FILE, 'utf8'));
  const maxImages = parseInt(process.env.IMAGE_COUNT || '91');
  const toGenerate = pins.slice(0, maxImages);

  console.log(`Gerando ${toGenerate.length} imagens de pin...\n`);

  const browser = await chromium.launch({ headless: true });
  let created = 0;

  for (let i = 0; i < toGenerate.length; i++) {
    const pin = toGenerate[i];
    const template = TEMPLATES[i % TEMPLATES.length];

    try {
      const imgPath = await generatePinImage(browser, pin, template, i);
      if (imgPath) {
        created++;
        if (created % 10 === 0) console.log(`  ${created}/${toGenerate.length} imagens...`);
      }
    } catch (err) {
      console.log(`  Erro ${i}: ${err.message.substring(0, 60)}`);
    }
  }

  await browser.close();
  console.log(`\n📊 ${created} imagens geradas em /pinterest-images/`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
