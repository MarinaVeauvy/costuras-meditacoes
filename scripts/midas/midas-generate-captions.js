#!/usr/bin/env node
/**
 * Midas Caption Generator
 *
 * Usa Claude Haiku pra gerar 3 captions variadas (uma por conta/persona)
 * mantendo estrutura Hook + Valor + CTA da metodologia Elite Flow.
 *
 * Uso:
 *   node midas-generate-captions.js --video=corte_00001.mp4 [--transcript="..."]
 *
 * Output:
 *   midas/captions/corte_00001.json
 *   {
 *     pros_peridade_do_reino: { hook, body, cta, hashtags_ig, hashtags_tt, hashtags_yt },
 *     orar_prosperar: { ... },
 *     liberdade_com_fe: { ... }
 *   }
 */

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

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
    'prosperidade-do-reino': 'Fé cristã + mercado cripto. Linguagem inspiracional mas educativa, referência a estudo responsável de investimentos. Audiência: mulheres evangélicas 28-50 curiosas sobre mercado financeiro.',
    'mae-empreendedora': 'Mãe de família aprendendo sobre cripto. Linguagem direta e acessível, sem jargão. Audiência: mães 30-45 começando a estudar investimentos.',
    'transformacao': 'Jornada pessoal de estudo do mercado cripto. Testemunho de aprendizado (não de lucro). Audiência: mulheres 25-45 buscando entender alternativas financeiras.',
  };
  return contexts[persona] || 'Educação cripto genérica';
}

async function generateCaptions({ videoFile, transcript }) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const accountsBrief = config.accounts
    .filter(a => a.active || a.persona !== 'PENDING')
    .map(a => `- ${a.id} (@${a.instagram_handle}): ${personaContext(a.persona)}`)
    .join('\n');

  const forbiddenList = templates.forbidden_words.join(', ');

  const prompt = `Você é estrategista de conteúdo educativo sobre MERCADO CRIPTO para público feminino brasileiro.

O conteúdo será publicado em 3 contas com personas distintas:

${accountsBrief}

Contexto do corte${transcript ? ` (transcrição):\n${transcript}` : ` (arquivo: ${videoFile}, transcrição indisponível — inferir tema educação cripto/fundamentos de blockchain/lições de investimento)`}

Estrutura obrigatória por caption (Código Viral):
1. HOOK (1 linha, 3s de leitura, intrigante/contra-intuitivo/curiosidade)
2. VALOR (2-4 linhas, ensina/intriga algo sobre aprender o mercado cripto)
3. CTA (1 linha curta direcionando pro link na bio)

REGRAS CRÍTICAS (anti-ban das plataformas):
- Português BR coloquial, sem vocabulário corporativo
- Cada persona usa linguagem DIFERENTE (não copia-cola)
- NUNCA mencione "Bruno Aguiar", "MAC", "afiliado"
- NUNCA prometa retorno financeiro específico (valores, percentuais, prazo)
- NUNCA use palavras proibidas: ${forbiddenList}
- Use framing EDUCATIVO: "aprender", "estudar", "entender", "conhecer"
- Posicione como informação, não como promessa
- Emojis com moderação (1-3 por caption)
- Evite gatilhos de urgência explícitos ("última chance", "sai do ar hoje")

Retorne JSON válido no formato:
{
  "pros_peridade_do_reino": { "hook": "...", "body": "...", "cta": "..." },
  "orar_prosperar": { "hook": "...", "body": "...", "cta": "..." },
  "liberdade_com_fe": { "hook": "...", "body": "...", "cta": "..." }
}

Retorne APENAS o JSON, sem markdown nem explicação.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Claude não retornou JSON válido:\n${text}`);

  const captions = JSON.parse(jsonMatch[0]);

  const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];

  for (const accountId of Object.keys(captions)) {
    const c = captions[accountId];
    c.full_caption = `${c.hook}\n\n${c.body}\n\n${c.cta}`;

    // Rotação randomizada de hashtags entre variações (anti-detecção de bot farm)
    c.hashtags_instagram = pickRandom(templates.hashtags_instagram);
    c.hashtags_tiktok = pickRandom(templates.hashtags_tiktok);
    c.hashtags_youtube = pickRandom(templates.hashtags_youtube);

    c.caption_ig = `${c.full_caption}\n\n${c.hashtags_instagram}`;
    c.caption_tiktok = `${c.full_caption}\n\n${c.hashtags_tiktok}`;
    c.caption_youtube = `${c.hook} ${c.hashtags_youtube}`;

    // Validação anti-ban: checa palavras proibidas
    const forbidden = templates.forbidden_words || [];
    const fullText = c.caption_ig.toLowerCase();
    const violations = forbidden.filter(w => fullText.includes(w.toLowerCase()));
    if (violations.length) {
      console.warn(`⚠️  [${accountId}] Possível gatilho detectado: ${violations.join(', ')}. Considere regenerar.`);
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

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY ausente');
  }

  console.log(`Gerando captions pra ${args.video}...`);
  const captions = await generateCaptions({
    videoFile: args.video,
    transcript: args.transcript || null,
  });

  fs.mkdirSync(CAPTIONS_DIR, { recursive: true });
  const outPath = path.join(CAPTIONS_DIR, `${path.basename(args.video, '.mp4')}.json`);
  fs.writeFileSync(outPath, JSON.stringify(captions, null, 2));
  console.log(`✅ Captions salvas em ${outPath}`);

  for (const accountId of Object.keys(captions)) {
    console.log(`\n--- ${accountId} ---\n${captions[accountId].full_caption}`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('ERRO:', err.message);
    process.exit(1);
  });
}

module.exports = { generateCaptions };
