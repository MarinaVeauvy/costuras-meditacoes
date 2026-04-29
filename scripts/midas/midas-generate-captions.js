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

async function generateCaptions({ videoFile, transcript }) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));

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

  const prompt = `Você é estrategista de conteúdo viral para Instagram Reels brasileiro, audiência feminina cristã.

Contexto: contas novas, 0 followers, precisam SAIR DO ZERO. Tema cripto/investir queimou o algoritmo nos primeiros 6 posts. Pivô estratégico: conteúdo neutro de FAMÍLIA + FÉ + EDUCAÇÃO FINANCEIRA básica.

Contas:
${accountsBrief}

Vídeo (corte): ${videoFile}${transcript ? `\nTranscrição: ${transcript}` : '\n(transcrição indisponível — inferir tema educativo de patrimônio/família/sabedoria financeira)'}

${formatVaultDescription}

ESTRUTURA OBRIGATÓRIA por persona (3 linhas máximo):
1. HOOK (≤ 8 palavras, escolher UM Format Vault, scroll-stop garantido nos 3s primeiros)
2. BODY (1 linha curta, 10-15 palavras, fecha o curiosity gap parcialmente)
3. CTA (1 linha, focado em SAVE — máximo peso algoritmo IG)

REGRAS DURAS (anti-ban + algoritmo):
- TEMA NEUTRO: foque em "patrimônio familiar", "educação financeira", "famílias prósperas", "sabedoria de Provérbios", "propósito"
- NUNCA mencione palavras proibidas: ${forbiddenList}
- Hook = MÁXIMO 8 palavras, sem rodeio
- Body = 1 linha, sem floreio
- CTA = puxa SAVE: "Salve pra ler depois", "Salva pra não esquecer", "Marca aquela amiga que precisa ver"
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
    "format_used": "FV-XXX"
  },
  "orar_prosperar": { ... }
}`;

  const captions = await generate(prompt, { json: true, maxTokens: 1200 });

  const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];

  for (const accountId of Object.keys(captions)) {
    const c = captions[accountId];
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
