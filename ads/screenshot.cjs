const puppeteer = require('puppeteer');
const path = require('path');

const ADS_DIR = 'C:/Users/marin/Documents/costuras-meditacoes/ads';

const ads = [
  { file: 'F1-feed-dor-identificacao.html', w: 1080, h: 1080 },
  { file: 'F3-feed-autoridade-quote.html', w: 1080, h: 1080 },
  { file: 'RT1-retarget-social-proof.html', w: 1080, h: 1080 },
  { file: 'RT2-retarget-objecao-preco.html', w: 1080, h: 1080 },
  { file: 'RT3-retarget-fomo.html', w: 1080, h: 1080 },
  { file: 'S1-stories-curiosidade.html', w: 1080, h: 1920 },
  { file: 'S2-stories-provocacao.html', w: 1080, h: 1920 },
  { file: 'R1-reels-provocativo.html', w: 1080, h: 1920 },
];

(async () => {
  const browser = await puppeteer.launch({ headless: true });

  for (const ad of ads) {
    const page = await browser.newPage();
    await page.setViewport({ width: ad.w, height: ad.h, deviceScaleFactor: 1 });
    const filePath = 'file:///' + ADS_DIR + '/' + ad.file;
    await page.goto(filePath, { waitUntil: 'networkidle0', timeout: 15000 });
    const png = ad.file.replace('.html', '.png');
    await page.screenshot({ path: ADS_DIR + '/' + png, fullPage: false });
    console.log('OK:', png);
    await page.close();
  }

  // Carrossel - viewport largo para capturar todos os cards
  const cPage = await browser.newPage();
  await cPage.setViewport({ width: 5500, height: 1350, deviceScaleFactor: 1 });
  await cPage.goto('file:///' + ADS_DIR + '/F2-carrossel-3-padroes.html', { waitUntil: 'networkidle0', timeout: 15000 });
  for (let i = 0; i < 5; i++) {
    await cPage.screenshot({
      path: ADS_DIR + '/F2-card-' + (i + 1) + '.png',
      clip: { x: i * 1083, y: 0, width: 1080, height: 1350 }
    });
    console.log('OK: F2-card-' + (i + 1) + '.png');
  }
  await cPage.close();

  await browser.close();
  console.log('All done!');
})();
