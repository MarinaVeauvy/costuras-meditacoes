#!/usr/bin/env node
/**
 * Midas Caption Generator v2 — Format Vault edition
 *
 * Reescrito 29/04/2026 pós-diagnóstico Brendan Kane:
 * - Tema NEUTRO (família/fé/educação financeira) — não cripto direto
 * - Hooks ≤ 8 palavras das Format Vault categories (FV-001/005/007)
 * - 3 linhas máximo por caption (hook + body 1 linha + CTA)
 * - CTA save-focused (peso máximo no IG algoritmo)
 * - Hashtags neutras
 *
 * Uso:
 *   node midas-generate-captions.js --video=corte_00001.mp4 [--transcript="..."]
 *
 * Output:
 *   midas/captions/corte_00001.json
 *   {
 *     pros_peridade_do_reino: { hook, body, cta, hashtags_*, caption_* },
 *     orar_prosperar: { ... }
 *   }
 */

const fs = require('fs');
const path = require('path');
const { generate } = require('../ai-provider');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const TEMPLATES_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'captions-templates.json');
const CAPTIONS_DIR = path.join(__dirname, '..', '..', 'midas', 'captions');

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [k, v] = arg.replace(/^--/, '').split('=');
    args[k] = v || true;
  }
  return args;
}

function personaContext(persona) {
  const contexts = {
    'prosperidade-do-reino': 'Mulher cristã, 28-50, busca conteúdo de fé + sabedoria prática + organização de vida e família. Ouve sobre Provérbios, prosperidade bíblica, propósito.',
    'mae-empreendedora': 'Mãe de família 30-45, evangélica, busca conteúdo prático que cabe na rotina puxada. Ouve sobre família, educação financeira simples, organizar a casa, criar filhos com propósito.',
    'transformacao': 'Mulher 25-45 em transição de vida, busca testemunho real de transformação. Ouve sobre superação, fé prática, mudanças de mentalidade.',
  };
  return contexts[persona] || 'Conteúdo neutro fé/família/educação';
}

const ALL_FORMATS = ['FV-001', 'FV-005', 'FV-006', 'FV-007'];
const CTA_CATEGORIES = ['save', 'comment', 'share', 'bio'];

function getRecentCaptionsForAccount(accountId, limit = 3) {
  if (!fs.existsSync(CAPTIONS_DIR)) return [];
  const files = fs.readdirSync(CAPTIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ f, mtime: fs.statSync(path.join(CAPTIONS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit * 2);

  const recent = [];
  for (const { f } of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CAPTIONS_DIR, f), 'utf8'));
      const c = data[accountId];
      if (c && c.format_used) {
        recent.push({ file: f, format: c.format_used, hook: c.hook, cta_category: c.cta_category });
        if (recent.length >= limit) break;
      }
    } catch { /* ignore malformed */ }
  }
  return recent;
}

function buildRotationConstraints(activeAccountIds) {
  const lines = [];
  for (const accountId of activeAccountIds) {
    const recent = getRecentCaptionsForAccount(accountId, 3);
    if (recent.length === 0) {
      lines.push(`- ${accountId}: sem histórico, escolha qualquer format`);
      continue;
    }
    const usedFormats = [...new Set(recent.map(r => r.format))];
    const usedCtaCats = [...new Set(recent.map(r => r.cta_category).filter(Boolean))];
    const allowedFormats = ALL_FORMATS.filter(f => !usedFormats.includes(f));
    const allowedCtaCats = CTA_CATEGORIES.filter(c => !usedCtaCats.includes(c));
    const formatPool = allowedFormats.length ? allowedFormats : ALL_FORMATS.filter(f => f !== usedFormats[0]);
    const ctaPool = allowedCtaCats.length ? allowedCtaCats : CTA_CATEGORIES.filter(c => c !== usedCtaCats[0]);
    lines.push(`- ${accountId}: últimos hooks usaram [${usedFormats.join(', ')}] e CTA cat [${usedCtaCats.join(', ') || 'nenhum'}]. PROIBIDO repetir. ESCOLHA format de [${formatPool.join(', ')}] e cta_category de [${ctaPool.join(', ')}].`);
  }
  return lines.join('\n');
}

async function generateCaptions({ videoFile, transcript }) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));

  const activeAccountIds = config.accounts.filter(a => a.active).map(a => a.id);
  const accountsBrief = config.accounts
    .filter(a => a.active)
    .map(a => `- ${a.id}: ${personaContext(a.persona)}`)
    .join('\n');

  const forbiddenList = templates.forbidden_words.join(', ');
  const formatVaultDescription = `
FORMAT VAULT (Brendan Kane) — escolha UM por hook:
- FV-001 Counter-Intuitive: "Tudo que te ensinaram sobre X está errado."
- FV-005 Secret Reveal: "O que ninguém conta sobre Y."
- FV-007 Data Drop: "97% das pessoas erram nisso."
- FV-006 Pattern Interrupt: "Pare. Você precisa ver isso."`;

  const rotationConstraints = buildRotationConstraints(activeAccountIds);

  const prompt = `Você é estrategista de conteúdo viral para Instagram Reels brasileiro, audiência feminina cristã.

Contexto: contas novas, 0 followers, precisam SAIR DO ZERO. Tema cripto/investir queimou o algoritmo nos primeiros 6 posts. Pivô estratégico: conteúdo neutro de FAMÍLIA + FÉ + EDUCAÇÃO FINANCEIRA básica.

Contas:
${accountsBrief}

Vídeo (corte): ${videoFile}${transcript ? `\nTranscrição: ${transcript}` : '\n(transcrição indisponível — inferir tema educativo de patrimônio/família/sabedoria financeira)'}

${formatVaultDescription}

ROTAÇÃO OBRIGATÓRIA (anti-fadiga de hook):
${rotationConstraints}

CTA CATEGORIES — escolha UMA por persona (rotacionar conforme histórico acima):
- save: "Salve pra ler depois 🤍", "Salva pra não esquecer 🤍"
- comment: "Comenta AMÉM se concorda 🙏", "Comenta SIM e te mando o resto", "Comenta 1 se quer saber mais"
- share: "Marca aquela amiga que precisa ver isso 💛", "Compartilha com quem precisa ouvir"
- bio: "Conteúdo completo no link da bio", "Bio → link → eu te explico tudo"

ESTRUTURA OBRIGATÓRIA por persona (3 linhas máximo):
1. HOOK (≤ 8 palavras, escolher UM Format Vault SEGUINDO ROTAÇÃO ACIMA, scroll-stop garantido nos 3s primeiros)
2. BODY (1 linha curta, 10-15 palavras, OBRIGATÓRIO incluir 1 número específico OU 1 verbo de ação concreto — não use frases vazias tipo "transforma sua vida" ou "muda tudo")
3. CTA (1 linha, escolher categoria SEGUINDO ROTAÇÃO ACIMA)

REGRAS DURAS (anti-ban + algoritmo):
- TEMA NEUTRO: foque em "patrimônio familiar", "educação financeira", "famílias prósperas", "sabedoria de Provérbios", "propósito"
- NUNCA mencione palavras proibidas: ${forbiddenList}
- Hook = MÁXIMO 8 palavras, sem rodeio
- Body = 1 linha COM ESPECIFICIDADE (número, % , passo numerado, citação direta) — proibido genérico
- Português BR coloquial, sem corporativo
- Linguagem feminina, calorosa, direta
- 1 emoji máximo por caption (no final do CTA)
- Cada persona tem TOM próprio (não copia-cola)

Retorne JSON válido APENAS, sem markdown:
{
  "pros_peridade_do_reino": {
    "hook": "...",
    "body": "...",
    "cta": "...",
    "format_used": "FV-XXX",
    "cta_category": "save|comment|share|bio"
  },
  "orar_prosperar": { ... }
}`;

  const captions = await generate(prompt, { json: true, maxTokens: 1200 });

  // VALIDAÇÃO crítica — sem hook/body/cta, abortar antes de propagar undefined
  for (const accountId of activeAccountIds) {
    const c = captions[accountId];
    if (!c || typeof c !== 'object') {
      throw new Error(`Caption gerada não tem campo "${accountId}" — JSON malformado: ${JSON.stringify(captions).slice(0, 300)}`);
    }
    const missing = ['hook', 'body', 'cta'].filter(k => !c[k] || typeof c[k] !== 'string' || !c[k].trim());
    if (missing.length) {
      throw new Error(`Caption [${accountId}] sem campos obrigatórios: ${missing.join(', ')}. Recebido: ${JSON.stringify(c).slice(0, 200)}`);
    }
  }

  // VALIDAÇÃO de rotação — se LLM repetir format do post anterior, log warning + fallback
  for (const accountId of activeAccountIds) {
    const c = captions[accountId];
    const recent = getRecentCaptionsForAccount(accountId, 1);
    if (recent.length && c.format_used && c.format_used === recent[0].format) {
      console.warn(`⚠️  [${accountId}] LLM ignorou rotação: ${c.format_used} igual ao post anterior. Hook="${c.hook}"`);
      c.warnings = (c.warnings || []).concat([`format_repeat:${c.format_used}`]);
    }
    if (!c.cta_category) {
      console.warn(`⚠️  [${accountId}] cta_category ausente — LLM não retornou.`);
    }
  }

  const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];

  for (const accountId of Object.keys(captions)) {
    const c = captions[accountId];
    if (!c || !c.hook) continue; // skip se não passou validação acima (defensivo)
    c.full_caption = `${c.hook}\n\n${c.body}\n\n${c.cta}`;

    c.hashtags_instagram = pickRandom(templates.hashtags_instagram);
    c.hashtags_tiktok = pickRandom(templates.hashtags_tiktok);
    c.hashtags_youtube = pickRandom(templates.hashtags_youtube);

    c.caption_ig = `${c.full_caption}\n\n${c.hashtags_instagram}`;
    c.caption_tiktok = `${c.full_caption}\n\n${c.hashtags_tiktok}`;
    c.caption_youtube = `${c.hook} ${c.hashtags_youtube}`;

    // Validação anti-ban
    const forbidden = templates.forbidden_words || [];
    const fullText = c.caption_ig.toLowerCase();
    const violations = forbidden.filter(w => fullText.includes(w.toLowerCase()));
    if (violations.length) {
      console.warn(`⚠️  [${accountId}] Gatilho detectado: ${violations.join(', ')}.`);
      c.warnings = violations;
    }
  }

  return captions;
}

async function main() {
  const args = parseArgs();
  if (!args.video) {
    console.error('Uso: node midas-generate-captions.js --video=corte_00001.mp4 [--transcript="..."]');
    process.exit(1);
  }

  if (!process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    throw new Error('Nenhum AI provider configurado');
  }

  console.log(`Gerando captions Format Vault pra ${args.video}...`);
  const captions = await generateCaptions({
    videoFile: args.video,
    transcript: args.transcript || null,
  });

  fs.mkdirSync(CAPTIONS_DIR, { recursive: true });
  const outPath = path.join(CAPTIONS_DIR, `${path.basename(args.video, '.mp4')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(captions, null, 2));
  console.log(`✅ Captions salvas em ${outPath}`);

  for (const accountId of Object.keys(captions)) {
    const c = captions[accountId];
    console.log(`\n--- ${accountId} (${c.format_used || 'unknown'}) ---\n${c.full_caption}`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('ERRO:', err.message);
    process.exit(1);
  });
}

module.exports = { generateCaptions };
