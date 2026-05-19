#!/usr/bin/env node
/**
 * Midas Audit Transcripts — detecta cortes contaminados via análise de transcript.
 *
 * Heurísticas pra suspeita:
 *  - score_pt: ratio de palavras stopwords PT vs total. <0.3 = não é português.
 *  - bruno_keywords: presença de "Bruno", "Aguiar", "investimento", "prosperar",
 *    "patrimônio", "milhão", "Deus", "família", etc. Score 0-10.
 *  - non_latin_chars: presença de caracteres não-latinos (cirílico, árabe, etc).
 *  - transcript_length: <50 chars = sem fala = suspeito (vídeo só visual).
 *
 * Output: lista ordenada por suspeita, com motivo. NÃO move nada — só sugere.
 */

const fs = require('fs');
const path = require('path');

const TRANSCRIPTS_DIR = path.join(__dirname, '..', '..', 'midas', 'transcripts');

const PT_STOPWORDS = new Set([
  'o','a','os','as','um','uma','de','do','da','dos','das','que','você','voce','se',
  'seu','sua','pra','para','com','em','no','na','nos','nas','por','é','e','ou',
  'não','nao','sim','isso','aqui','tem','têm','está','esta','são','sao','foi',
  'vai','ter','tudo','ele','ela','meu','minha','eu','me','muito','mais','mas',
  'já','ja','quando','como','onde','porque','então','entao','vamos','vou','aí',
  'pessoa','gente','sobre','também','tambem','até','ate','depois','antes','agora',
  'fazer','fez','dar','ver','sei','sabe','quer','pode','vai','dizer','disse'
]);

const BRUNO_KEYWORDS = [
  'bruno','aguiar','investimento','investir','prosperar','prosperidade',
  'patrimônio','patrimonio','milhão','milhao','milhões','milhoes','deus','jesus',
  'família','familia','dinheiro','reais','renda','método','metodo','riqueza',
  'fé','fe','cristão','cristao','provérbios','proverbios','bíblia','biblia',
  'mercado','liberdade','financeira','milionário','milionario','jornada',
  'transformação','transformacao','propósito','proposito','bênção','bencao'
];

const NON_LATIN_REGEX = /[Ѐ-ӿ؀-ۿऀ-ॿ一-鿿぀-ゟ゠-ヿ]/;

// Caracteres turcos específicos: ş, ğ, ı, ö, ü, ç, etc. (alguns são compartilhados com PT)
const TURKISH_SPECIFIC = /[ışğ]/; // ı (dotless i), ş, ğ não existem em PT

function analyzeTranscript(text) {
  const lower = text.toLowerCase();
  const words = lower.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 0);
  const totalWords = words.length;

  if (totalWords === 0) {
    return { suspicious: true, reasons: ['empty_transcript'], score_pt: 0, bruno_score: 0 };
  }

  const stopwordHits = words.filter(w => PT_STOPWORDS.has(w)).length;
  const score_pt = stopwordHits / totalWords;
  const brunoHits = BRUNO_KEYWORDS.filter(kw => lower.includes(kw));
  const bruno_score = brunoHits.length;

  const reasons = [];
  if (score_pt < 0.15) reasons.push(`low_pt_ratio:${score_pt.toFixed(2)}`);
  if (bruno_score === 0) reasons.push('no_bruno_keywords');
  if (text.length < 50) reasons.push(`short_transcript:${text.length}chars`);
  if (NON_LATIN_REGEX.test(text)) reasons.push('non_latin_chars_detected');
  if (TURKISH_SPECIFIC.test(text)) reasons.push('turkish_chars_detected');

  return {
    suspicious: reasons.length > 0,
    reasons,
    score_pt,
    bruno_score,
    bruno_hits: brunoHits.slice(0, 5),
    word_count: totalWords,
    text_length: text.length,
    sample: text.slice(0, 150).replace(/\s+/g, ' '),
  };
}

function main() {
  const files = fs.readdirSync(TRANSCRIPTS_DIR)
    .filter(f => f.endsWith('.transcript.json'))
    .sort();

  console.log(`📁 Analisando ${files.length} transcripts em ${TRANSCRIPTS_DIR}\n`);

  const results = files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(TRANSCRIPTS_DIR, f), 'utf8'));
    const analysis = analyzeTranscript(data.text || '');
    return { file: f, ...analysis };
  });

  // Ordena: suspeitos primeiro, depois por bruno_score asc + score_pt asc
  results.sort((a, b) => {
    if (a.suspicious !== b.suspicious) return a.suspicious ? -1 : 1;
    if (a.bruno_score !== b.bruno_score) return a.bruno_score - b.bruno_score;
    return a.score_pt - b.score_pt;
  });

  const suspicious = results.filter(r => r.suspicious);
  const clean = results.filter(r => !r.suspicious);

  console.log(`🚨 SUSPEITOS (${suspicious.length}):\n`);
  for (const r of suspicious) {
    console.log(`  ${r.file}`);
    console.log(`     reasons: ${r.reasons.join(' | ')}`);
    console.log(`     pt_ratio=${r.score_pt.toFixed(2)} bruno_keywords=${r.bruno_score} (${r.bruno_hits.join(',') || 'none'}) chars=${r.text_length}`);
    console.log(`     sample: "${r.sample}..."`);
    console.log('');
  }

  console.log(`\n✅ LIMPOS (${clean.length}):`);
  for (const r of clean) {
    console.log(`  ${r.file}  pt=${r.score_pt.toFixed(2)} bruno=${r.bruno_score} (${r.bruno_hits.join(',')})`);
  }
}

if (require.main === module) main();
