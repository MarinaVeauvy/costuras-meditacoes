#!/usr/bin/env node
/**
 * Midas Quarantine Legacy — varre midas/captions/ e move arquivos com problemas
 * críticos pra midas/captions/quarantine/.
 *
 * "Crítico" = arquivo que NÃO PODE ser publicado nem reaproveitado:
 *  - hook vazio em todas as contas (gerado quebrado)
 *  - "undefined" literal no full_caption
 *  - forbidden_words (cripto, bitcoin, blockchain etc.) em caption_ig/tiktok/youtube
 *
 * Arquivos sem schema_version=v2 NÃO são quarentenados — só ficam bloqueados pelo
 * publisher gate (isPublishableCaption). Isso evita perder histórico desnecessariamente.
 *
 * Uso:
 *   node midas-quarantine-legacy.js              # dry-run, só relata
 *   node midas-quarantine-legacy.js --apply      # move arquivos pra quarantine/
 */

const fs = require('fs');
const path = require('path');
const { diagnoseCaptionsFile, isPublishableCaption } = require('./midas-caption-utils');

const CAPTIONS_DIR = path.join(__dirname, '..', '..', 'midas', 'captions');
const QUARANTINE_DIR = path.join(CAPTIONS_DIR, 'quarantine');

function parseArgs() {
  const out = { apply: false };
  for (const a of process.argv.slice(2)) {
    if (a === '--apply') out.apply = true;
  }
  return out;
}

function listCaptionFiles() {
  return fs.readdirSync(CAPTIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .filter(f => !f.includes('_hooked'))
    .filter(f => !f.includes('v1-backup'))
    .filter(f => !f.startsWith('story_')); // stories têm schema próprio
}

function moveToQuarantine(filename) {
  fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
  const src = path.join(CAPTIONS_DIR, filename);
  const dst = path.join(QUARANTINE_DIR, filename);
  fs.renameSync(src, dst);
}

function main() {
  const { apply } = parseArgs();
  const files = listCaptionFiles();
  console.log(`📁 Escaneando ${files.length} caption files em ${CAPTIONS_DIR}\n`);

  const toQuarantine = [];
  const v2Clean = [];
  const v1Blockable = []; // não-v2 mas sem violação crítica — fica em loco, gate bloqueia

  for (const f of files) {
    const filePath = path.join(CAPTIONS_DIR, f);
    const diag = diagnoseCaptionsFile(filePath);
    if (diag.criticalIssues.length > 0) {
      toQuarantine.push(diag);
    } else {
      const allV2 = Object.values(diag.accountResults).every(r => r.ok);
      if (allV2) v2Clean.push(diag.filename);
      else v1Blockable.push(diag);
    }
  }

  console.log('═══ RELATÓRIO ═══\n');
  console.log(`✅ Publicável (schema_v2, sem violações): ${v2Clean.length}`);
  if (v2Clean.length) console.log('   ' + v2Clean.slice(0, 10).join(', ') + (v2Clean.length > 10 ? ` ... (+${v2Clean.length - 10})` : ''));
  console.log('');

  console.log(`🟡 Não-v2 mas sem violação crítica (bloqueado pelo publisher gate, fica em loco): ${v1Blockable.length}`);
  for (const d of v1Blockable.slice(0, 20)) {
    const reasons = Object.entries(d.accountResults)
      .map(([id, r]) => `${id}=[${r.reasons.join('|') || 'ok'}]`)
      .join('  ');
    console.log(`   ${d.filename}  ${reasons}`);
  }
  console.log('');

  console.log(`🚨 QUARENTENA (crítico — será movido): ${toQuarantine.length}`);
  for (const d of toQuarantine) {
    console.log(`   ${d.filename}  critical=[${d.criticalIssues.join('|')}]`);
    for (const [id, r] of Object.entries(d.accountResults)) {
      if (r.reasons.length) console.log(`      ${id}: ${r.reasons.join(' | ')}`);
    }
  }
  console.log('');

  if (toQuarantine.length === 0) {
    console.log('Nenhum arquivo crítico encontrado. Nada a fazer.');
    return;
  }

  if (!apply) {
    console.log(`💡 Dry-run. Re-execute com --apply pra mover ${toQuarantine.length} arquivos pra:\n   ${QUARANTINE_DIR}`);
    return;
  }

  fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
  for (const d of toQuarantine) {
    moveToQuarantine(d.filename);
    console.log(`  ↳ ${d.filename} → quarantine/`);
  }
  // Log de auditoria
  const logPath = path.join(QUARANTINE_DIR, '_audit.log');
  const stamp = new Date().toISOString();
  const auditLine = toQuarantine.map(d => `${stamp}\t${d.filename}\t${d.criticalIssues.join(',')}`).join('\n') + '\n';
  fs.appendFileSync(logPath, auditLine, 'utf8');
  console.log(`\n📋 Audit log: ${logPath}`);
}

if (require.main === module) {
  main();
}
