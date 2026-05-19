#!/usr/bin/env node
/**
 * Midas Update Overlay CTA — sobrescreve apenas o campo overlay_cta nos captions
 * existentes pra direcionar à bio (conversão), sem regerar a caption inteira.
 *
 * Decisão estratégica (Marina): caption mantém save/comment/share (algoritmo).
 * overlay_cta passa a SEMPRE direcionar pra bio.
 *
 * Uso:
 *   node midas-update-overlay-cta.js              # dry-run
 *   node midas-update-overlay-cta.js --apply      # sobrescreve
 */

const fs = require('fs');
const path = require('path');

const CAPTIONS_DIR = path.join(__dirname, '..', '..', 'midas', 'captions');

const OVERLAY_BIO_VARIATIONS = [
  '→ Link na bio',
  'Tô explicando na bio',
  'Bio → link → te explico',
  'Vai no link da bio',
  'Link na bio agora',
  'Bio: te conto tudo',
  'Te explico no link da bio',
];

function rotate(idx) {
  return OVERLAY_BIO_VARIATIONS[idx % OVERLAY_BIO_VARIATIONS.length];
}

function parseArgs() {
  return { apply: process.argv.includes('--apply') };
}

function main() {
  const { apply } = parseArgs();
  const files = fs.readdirSync(CAPTIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .filter(f => !f.includes('_hooked'))
    .filter(f => !f.includes('v1-backup'))
    .filter(f => f.startsWith('corte_'));

  console.log(`📁 Escaneando ${files.length} captions em ${CAPTIONS_DIR}`);
  console.log(`Modo: ${apply ? 'APPLY (sobrescreve)' : 'DRY-RUN'}\n`);

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let rotationIdx = 0;

  for (const file of files) {
    const filePath = path.join(CAPTIONS_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.warn(`⏭️  ${file}: parse error, skip`);
      skipped++;
      continue;
    }

    const changes = [];
    for (const accountId of Object.keys(data)) {
      if (accountId.startsWith('_')) continue;
      const c = data[accountId];
      if (!c || typeof c !== 'object') continue;

      const current = c.overlay_cta || '(ausente)';
      const mentionsBio = /\b(bio|link|arrasta|swipe|descrição|descricao)\b/i.test(current);

      if (mentionsBio) {
        // Já direciona pra bio, mantém
        continue;
      }

      const newOverlay = rotate(rotationIdx++);
      changes.push({ accountId, old: current, new: newOverlay });
      if (apply) c.overlay_cta = newOverlay;
    }

    if (changes.length === 0) {
      unchanged++;
      continue;
    }

    console.log(`📝 ${file}`);
    for (const ch of changes) {
      console.log(`   ${ch.accountId}: "${ch.old}" → "${ch.new}"`);
    }

    if (apply) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      updated++;
    }
  }

  console.log('');
  console.log(`✅ Updated: ${updated}`);
  console.log(`✓  Já direcionando à bio: ${unchanged}`);
  console.log(`⏭️  Skipped (erro): ${skipped}`);
  if (!apply) console.log(`\n💡 Dry-run. Re-execute com --apply pra sobrescrever.`);
}

if (require.main === module) main();
