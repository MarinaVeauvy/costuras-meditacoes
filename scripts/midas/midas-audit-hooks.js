#!/usr/bin/env node
/**
 * Midas Audit Hooks — relatório CLI de similaridade entre hooks.
 *
 * Varre midas/captions/*.json (não quarentena, não _hooked, não story_),
 * computa similaridade Jaccard entre TODOS os pares de hooks e imprime:
 *   - Top N pares mais similares (candidatos a shadowban por duplicidade)
 *   - Hooks "padrão" (mais reusados em variação)
 *   - Distribuição de scores
 *
 * Uso:
 *   node midas-audit-hooks.js              # default: top 15 pares + dist
 *   node midas-audit-hooks.js --top=30     # top 30 pares
 *   node midas-audit-hooks.js --threshold=0.3  # mostra pares >= 0.3
 */

const fs = require('fs');
const path = require('path');
const { tokenizeForSimilarity, jaccardSimilarity } = require('./midas-caption-utils');

const CAPTIONS_DIR = path.join(__dirname, '..', '..', 'midas', 'captions');

function parseArgs() {
  const args = { top: 15, threshold: 0.3 };
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'top') args.top = parseInt(v, 10);
    else if (k === 'threshold') args.threshold = parseFloat(v);
  }
  return args;
}

function loadAllHooks() {
  if (!fs.existsSync(CAPTIONS_DIR)) return [];
  const files = fs.readdirSync(CAPTIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .filter(f => !f.includes('_hooked'))
    .filter(f => !f.includes('v1-backup') && !f.includes('v2-backup'))
    .filter(f => f.startsWith('corte_'));

  const hooks = [];
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CAPTIONS_DIR, file), 'utf8'));
      for (const accountId of Object.keys(data)) {
        if (accountId.startsWith('_')) continue;
        const c = data[accountId];
        if (c && typeof c.hook === 'string' && c.hook.trim()) {
          hooks.push({
            hook: c.hook,
            account: accountId,
            file,
            format: c.format_used || '?',
          });
        }
      }
    } catch { /* skip */ }
  }
  return hooks;
}

function bar(pct, width = 30) {
  const filled = Math.round(pct * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function main() {
  const { top, threshold } = parseArgs();
  const hooks = loadAllHooks();
  console.log(`📊 Auditoria de similaridade de hooks — ${hooks.length} hooks em ${CAPTIONS_DIR}\n`);

  if (hooks.length < 2) {
    console.log('Poucos hooks pra comparar. Saindo.');
    return;
  }

  // Pré-computa tokens
  const tokens = hooks.map(h => ({ ...h, tokens: tokenizeForSimilarity(h.hook) }));

  // Computa pares
  const pairs = [];
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      const score = jaccardSimilarity(tokens[i].tokens, tokens[j].tokens);
      if (score >= threshold) {
        pairs.push({ a: tokens[i], b: tokens[j], score });
      }
    }
  }
  pairs.sort((x, y) => y.score - x.score);

  // === Top pares ===
  console.log(`🚨 Top ${Math.min(top, pairs.length)} pares mais similares (threshold >= ${threshold}):\n`);
  for (let i = 0; i < Math.min(top, pairs.length); i++) {
    const p = pairs[i];
    const tag = p.score >= 0.45 ? '⚠️ SIMILAR' : '·';
    console.log(`${tag} score=${p.score.toFixed(2)}  ${bar(p.score, 20)}`);
    console.log(`   A: "${p.a.hook}"`);
    console.log(`      [${p.a.account} | ${p.a.format} | ${p.a.file}]`);
    console.log(`   B: "${p.b.hook}"`);
    console.log(`      [${p.b.account} | ${p.b.format} | ${p.b.file}]`);
    console.log('');
  }

  if (pairs.length === 0) {
    console.log(`   Nenhum par >= ${threshold}. Diversidade boa!\n`);
  }

  // === Distribuição de scores ===
  const buckets = { '0.0-0.1': 0, '0.1-0.2': 0, '0.2-0.3': 0, '0.3-0.4': 0, '0.4-0.5': 0, '0.5-0.7': 0, '0.7-1.0': 0 };
  let totalPairs = 0;
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      const score = jaccardSimilarity(tokens[i].tokens, tokens[j].tokens);
      totalPairs++;
      if (score < 0.1) buckets['0.0-0.1']++;
      else if (score < 0.2) buckets['0.1-0.2']++;
      else if (score < 0.3) buckets['0.2-0.3']++;
      else if (score < 0.4) buckets['0.3-0.4']++;
      else if (score < 0.5) buckets['0.4-0.5']++;
      else if (score < 0.7) buckets['0.5-0.7']++;
      else buckets['0.7-1.0']++;
    }
  }
  console.log(`📈 Distribuição de scores (${totalPairs} pares totais):\n`);
  const maxBucket = Math.max(...Object.values(buckets));
  for (const [range, count] of Object.entries(buckets)) {
    const pct = count / maxBucket;
    const marker = (range === '0.4-0.5' || range === '0.5-0.7' || range === '0.7-1.0') ? '⚠️ ' : '   ';
    console.log(`${marker}${range}  ${bar(pct, 30)} ${count}`);
  }

  // === Resumo ===
  console.log(`\n📋 Resumo:`);
  console.log(`   Total hooks: ${hooks.length}`);
  console.log(`   Pares similares (>= 0.45): ${pairs.filter(p => p.score >= 0.45).length}`);
  console.log(`   Pares duvidosos (0.3-0.45): ${pairs.filter(p => p.score >= 0.3 && p.score < 0.45).length}`);
  if (pairs.filter(p => p.score >= 0.45).length > 0) {
    console.log(`\n💡 Ação sugerida: regerar captions com hooks duplicados (excluir caption ofensora + node midas-generate-captions.js --video=corte_XXXXX.mp4).`);
  }
}

if (require.main === module) {
  main();
}
