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

const path = require('path');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });
require('dotenv').config({ path: path.join(os.homedir(), '.env'), quiet: true });
const fs = require('fs');
const { generate } = require('../ai-provider');
const { transcribeClip } = require('./midas-transcribe');

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
    'prosperidade-do-reino': `Mulher cristã evangélica/católica devota, 28-50 anos, classe C-B. Frequenta igreja, lê Provérbios, escuta louvor. Vocabulário tribal: "irmã", "mulher virtuosa", "Provérbios 31", "filha do Rei", "Senhor", "Ele", "providência", "vinha", "azeite", "graça", "bênção", "alpargatas" (Pv 31). Dor real: quer prosperar mas tem culpa cristã ("dinheiro é pecado?"), insegurança ("será que Deus aprova ganhar bem?"), comparação com outras irmãs que parecem "ter mais fé". Referências bíblicas que ressoam: Provérbios 31:16 (mulher considera campo e compra), Provérbios 13:11 (dinheiro fácil diminui), Deuteronômio 8:18 (Ele te dá poder pra adquirir riqueza). EVITE: tom motivacional vazio, "transforma sua vida", "abundância universal", linguagem New Age. PREFIRA: prova bíblica + sabedoria prática + tom de irmã mais velha falando à mesa.`,
    'mae-empreendedora': `Mãe evangélica 30-45, 2-3 filhos pequenos/adolescentes, casada (marido pode ou não trabalhar), rotina puxada cuidando da casa. Vocabulário tribal: "amada", "mamãe", "guerreira", "lar", "marido", "filhos", "criar com propósito", "Senhor abençoa", "minha sogra disse" (humor relacional), "amém", "glória". Dor real: cansaço (não consegue parar pra estudar), culpa (não está sendo boa mãe + esposa + provedora ao mesmo tempo), comparação ("mães de Instagram que dão conta"), medo do julgamento da igreja se ela "trabalhar demais". Referências bíblicas: Provérbios 31 (mulher que se levanta antes do amanhecer), Lucas 10 (Marta x Maria — equilíbrio fazer/estar), Salmos 127 (filhos são herança). EVITE: jargão de empreendedora urbana ("escalar negócio", "side hustle"), tom de coach. PREFIRA: empatia com cansaço + soluções de 5 min + "eu também sou assim" + autorização ("Deus aprova você prosperar pra sustentar sua família").`,
    'transformacao': `Mulher 25-45 que viveu/vive transição forte: divórcio recente, falência, abandono, depressão pós-parto, saída de relacionamento abusivo, decisão de deixar carreira. Vocabulário tribal: "antes eu", "Deus me tirou de", "atravessei", "testemunho", "depois do fundo do poço", "Ele me restaurou", "novo capítulo", "Jó", "José do Egito", "Ana que orou em silêncio". Dor real: ferida emocional aberta, desconfiança ("já tentei tantas coisas"), pressa por resultado (precisa pagar contas), medo de fracassar de novo, descrença em métodos. Referências bíblicas: José do Egito (de escravo a governador), Jó (perdeu tudo e foi restaurado em dobro), Ana (oração silenciosa atendida), Mulher samaritana (encontro que muda história). EVITE: positividade tóxica, "está tudo no tempo de Deus" como muleta, motivação sem prova. PREFIRA: linguagem de testemunho ("eu sei o que é"), passo concreto agora, "Ele te chamou pra mais", reconhecimento da dor sem minimizar.`,
  };
  return contexts[persona] || 'Mulher cristã brasileira, 28-45, busca fé prática + sabedoria de vida. Linguagem coloquial, calorosa, com referências bíblicas.';
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
    const recent = getRecentCaptionsForAccount(accountId, 6); // pega mais pra filtrar FV depois
    // Filtra só FV-* (formats de cortes) — ignora ST-* (stories) que são pipeline diferente
    const fvOnly = recent.filter(r => r.format && r.format.startsWith('FV-')).slice(0, 3);
    if (fvOnly.length === 0) {
      lines.push(`- ${accountId}: sem histórico de cortes, escolha qualquer format`);
      continue;
    }
    const usedFormats = [...new Set(fvOnly.map(r => r.format))];
    const usedCtaCats = [...new Set(fvOnly.map(r => r.cta_category).filter(Boolean))];
    const allowedFormats = ALL_FORMATS.filter(f => !usedFormats.includes(f));
    const allowedCtaCats = CTA_CATEGORIES.filter(c => !usedCtaCats.includes(c));
    const formatPool = allowedFormats.length ? allowedFormats : ALL_FORMATS.filter(f => f !== usedFormats[0]);
    const ctaPool = allowedCtaCats.length ? allowedCtaCats : CTA_CATEGORIES.filter(c => c !== usedCtaCats[0]);
    lines.push(`- ${accountId}: últimos cortes usaram [${usedFormats.join(', ')}] e CTA cat [${usedCtaCats.join(', ') || 'nenhum'}]. PROIBIDO repetir. ESCOLHA format de [${formatPool.join(', ')}] e cta_category de [${ctaPool.join(', ')}].`);
  }
  return lines.join('\n');
}

async function generateCaptions({ videoFile, transcript }) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));

  // Hard fail: sem transcript, NÃO inferimos tema. Transcrevemos com Whisper.
  // Se Whisper falhar, propaga o erro — não cair em "inferir tema educativo".
  if (!transcript || (typeof transcript === 'string' && !transcript.trim())) {
    const t = await transcribeClip(videoFile);
    transcript = t.text;
    console.log(`🎙️  Transcript resolvido para ${videoFile} (${t.fromCache ? 'cache' : 'whisper'}, ${transcript.length} chars)`);
  }

  const activeAccountIds = config.accounts.filter(a => a.active).map(a => a.id);
  const accountsBrief = config.accounts
    .filter(a => a.active)
    .map(a => `- ${a.id}: ${personaContext(a.persona)}`)
    .join('\n');

  const forbiddenList = templates.forbidden_words.join(', ');
  const formatVaultDescription = `
FORMAT VAULT (Brendan Kane) — escolha UM por hook. As descrições abaixo são ESTRUTURAS, não frases prontas. NÃO copie os exemplos genéricos abaixo — eles são apenas pra você entender o padrão. SEU HOOK PRECISA SER ORIGINAL, baseado no transcript específico desse corte.

- FV-001 Counter-Intuitive: derruba uma crença popular sobre o tema do corte. Estrutura: "[crença popular] está errado" / "[expectativa comum] não é como parece". NÃO copie "Tudo que te ensinaram sobre X" — invente sua própria contra-intuição baseada no que o vídeo realmente fala.
- FV-005 Secret Reveal: anuncia algo escondido/raro sobre o tema. Estrutura: "[insight raro] que [grupo] esconde" / "O detalhe que ninguém [verbo de descoberta]". NÃO copie "O que ninguém conta sobre Y" — formule sua própria revelação ancorada no transcript.
- FV-006 Pattern Interrupt: quebra atenção com afirmação inesperada/visual. Estrutura: "[afirmação curta que para o scroll]". NÃO copie "Pare. Você precisa ver isso." — é o exemplo mais batido do mundo. Crie pattern interrupt ligado ao tema do corte.
- FV-007 Data Drop: cita estatística que choca. ⚠️ SÓ ESCOLHA SE A TRANSCRIÇÃO CONTÉM UM NÚMERO ESPECÍFICO. Inventar estatística é proibido (anti-CVM). Se transcript não tem número, escolha FV-001, FV-005 ou FV-006.

REGRA DURA: 2 cortes diferentes do mesmo canal NUNCA podem ter o mesmo hook. Mesmo que o format seja igual, a redação do hook tem que ser ORIGINAL pra cada corte.`;

  const rotationConstraints = buildRotationConstraints(activeAccountIds);

  // Dedup semântico global: lista os últimos 30 hooks (qualquer conta) pro LLM evitar.
  const { getRecentHooksAcrossAccounts, findSimilarHook } = require('./midas-caption-utils');
  const recentHooks = getRecentHooksAcrossAccounts(30);
  const recentHooksBlock = recentHooks.length
    ? `\n\nHOOKS RECENTES PROIBIDOS (não repita nem use variação semântica próxima — Meta detecta como duplicado e shadowban):\n${recentHooks.slice(0, 10).map((h, i) => `${i + 1}. "${h.hook}"`).join('\n')}`
    : '';

  const prompt = `Você é estrategista de conteúdo viral para Instagram Reels brasileiro, audiência feminina cristã.

Contexto: contas novas, 0 followers, precisam SAIR DO ZERO. Tema cripto/investir queimou o algoritmo nos primeiros 6 posts. Pivô estratégico: conteúdo neutro de FAMÍLIA + FÉ + EDUCAÇÃO FINANCEIRA básica.

Contas:
${accountsBrief}

Vídeo (corte): ${videoFile}
Transcrição literal do corte (use isso como matéria-prima, NÃO invente conteúdo):
"""
${transcript}
"""

${formatVaultDescription}

ROTAÇÃO OBRIGATÓRIA (anti-fadiga de hook):
${rotationConstraints}${recentHooksBlock}

CTA CATEGORIES — escolha UMA por persona (rotacionar conforme histórico acima):
- save: "Salve pra ler depois 🤍", "Salva pra não esquecer 🤍"
- comment: "Comenta AMÉM se concorda 🙏", "Comenta SIM e te mando o resto", "Comenta 1 se quer saber mais"
- share: "Marca aquela amiga que precisa ver isso 💛", "Compartilha com quem precisa ouvir"
- bio: "Conteúdo completo no link da bio", "Bio → link → eu te explico tudo"

ESTRUTURA OBRIGATÓRIA por persona (3 linhas máximo):
1. HOOK (≤ 8 palavras, escolher UM Format Vault SEGUINDO ROTAÇÃO ACIMA, scroll-stop garantido nos 3s primeiros)
2. BODY (até 18 palavras, PARÁFRASE de uma frase-conceito da transcrição acima — escolha UMA frase forte do que a pessoa fala no vídeo e reescreva em linguagem da persona. PROIBIDO inventar dados que não estão na transcrição.)
3. CTA (1 linha, escolher categoria SEGUINDO ROTAÇÃO ACIMA)

REGRA DE ARGUMENTO FECHADO (hook ↔ body):
Hook abre uma promessa/curiosidade. Body ENTREGA a essência da promessa usando algo que de fato é dito no vídeo. Sem o body, o hook fica oco. Sem o hook, o body fica solto. Os dois precisam fechar como pergunta-resposta ou problema-resolução.

REGRA DE FONTE (anti-hallucination):
- Se a transcrição NÃO contém um número específico, body NÃO pode usar número específico ("30%", "5 passos", "3 contas", "10x" são proibidos a menos que apareçam literalmente acima).
- Se a transcrição contém um número, você PODE citá-lo no body.
- body_source DEVE ser "transcript_paraphrase" — não invente.
- transcript_quote DEVE ser a frase literal (≤25 palavras) que você parafraseou no body. Copia direto da transcrição.

EXEMPLOS BONS (siga este padrão):

✅ Exemplo 1 — argumento fechado, body ancorado em fala literal
  Transcrição contém: "Eu preparei um plano prático para você fazer 50 reais virar mil reais todo santo dia"
  hook: "Existe um plano que ninguém te ensinou"  ← FV-005 Secret Reveal
  body: "Ele transforma o pouco que você tem hoje em fluxo diário de provisão"  ← paráfrase, sem citar valores diretos (compliance)
  transcript_quote: "preparei um plano prático para você fazer 50 reais virar mil reais"
  body_source: "transcript_paraphrase"

✅ Exemplo 2 — hook abre / body fecha com prova do vídeo
  Transcrição contém: "Se você é íntegra e quer construir fortuna da forma que Deus aprova"
  hook: "Prosperidade tem regra que o mundo esconde"  ← FV-001 Counter-Intuitive
  body: "Construir fortuna do jeito que Deus aprova exige integridade — não atalho"
  transcript_quote: "construir fortuna da forma que Deus aprova"
  body_source: "transcript_paraphrase"

EXEMPLOS RUINS (NÃO faça):

❌ Hook genérico + body inventado
  hook: "Tudo sobre patrimônio está errado"
  body: "Aprenda a gerenciar 30% do seu orçamento"
  Por quê é ruim: hook não conecta com body, "30%" não está na transcrição, nada disso o vídeo fala.

❌ Hook e body que poderiam servir pra qualquer vídeo
  hook: "Pare e veja o segredo"
  body: "Crie um fundo de 10% para a educação dos filhos"
  Por quê é ruim: nem o "10%" nem "fundo de educação" foram ditos no vídeo. É hallucination.

❌ Body abstrato sem ligação com fala real
  hook: "O que ninguém conta sobre prosperidade"
  body: "A sabedoria bíblica transforma o orçamento familiar em bênção"
  Por quê é ruim: poesia vazia. Não cita NADA do que a pessoa de fato falou no vídeo.

ATENÇÃO — NÃO COPIE OS EXEMPLOS:
Os exemplos acima são apenas para você entender o PADRÃO (estrutura hook+body+quote). Eles foram escritos com base num corte ESPECÍFICO. Seu corte ATUAL é diferente — escreva conteúdo ORIGINAL baseado na transcrição literal entre """ no início do prompt. Repetir frase por frase dos exemplos é falha grave.

LEXICON CRISTÃO BR (obrigatório usar):
Captions sem vocabulário tribal cristão soam como "AI corporativo" e o público detecta em 2 segundos. Use OBRIGATORIAMENTE pelo menos 1 termo do lexicon abaixo em cada caption (hook OU body OU cta):

- Termos de comunidade: "irmã", "amada", "mamãe", "guerreira", "filha do Rei", "mulher virtuosa", "filhas de Sara"
- Conceitos de fé: "Senhor", "Ele" (referindo a Deus), "providência", "graça", "bênção", "amém", "Deus aprova", "Ele te chamou", "Ele cuida", "azeite", "vinha", "alpargatas" (Pv 31)
- Referências bíblicas curtas: "Provérbios 31:16", "Provérbios 13:11", "Lucas 16:10", "Salmos 127", "Deuteronômio 8:18", "Mateus 25", "José do Egito", "Ana que orou", "Mulher samaritana"
- Conceitos família: "lar", "marido", "filhos", "criar com propósito", "rotina puxada", "mesa da família"
- Conceitos transformação: "atravessei", "antes eu", "Ele me restaurou", "fundo do poço", "novo capítulo"

PROIBIDO (linguagem New Age que afasta o público cristão):
"universo", "energia", "vibração", "manifestar", "lei da atração", "frequência", "abundância cósmica/universal"

CASAMENTO PERSONA ↔ LEXICON:
- pros_peridade_do_reino → preferir referências bíblicas + "irmã" + "filha do Rei" + "Provérbios"
- orar_prosperar → preferir "mamãe" + "amada" + conceitos família + Salmos 127 + Lucas 10
- liberdade_com_fe → preferir conceitos transformação + "atravessei" + José do Egito / Ana / Jó

REGRAS DURAS (anti-ban + algoritmo):
- TEMA NEUTRO: foque em fé, família, propósito, sabedoria de Provérbios. Se transcrição menciona valores específicos em reais, NÃO repita no body — parafraseie como "pouco que você tem" / "primeiro dinheiro" / "começo".
- NUNCA mencione palavras proibidas: ${forbiddenList}
- Hook = MÁXIMO 8 palavras, sem rodeio
- Português BR coloquial, sem corporativo
- Linguagem feminina, calorosa, direta
- 1 emoji máximo por caption (no final do CTA)
- Cada persona tem TOM próprio — escolha frase do transcript que ressoa com a persona (Pros: prosperidade/Provérbios; Orar: família/maternidade; Liberdade: transformação/saída-da-falta)

OVERLAY CTA (CTA que aparece NO VÍDEO, não na caption — é o DRIVER DE CONVERSÃO):
80% dos viewers nunca expandem a legenda. Esse overlay no último frame é onde a venda acontece — TEM QUE DIRECIONAR PRO LINK DA BIO.
Gere overlay_cta em 3-6 palavras que CHAMA pra bio. Varie entre estas estruturas (não copie literal, adapte):
- "→ Link na bio"
- "Tô explicando na bio"
- "Bio → link → te explico"
- "Vai no link da bio"
- "Link na bio agora"
- "Bio: te conto tudo"
- "Te explico no link da bio"
overlay_cta DEVE ser SEMPRE direcionado à bio (algoritmo penaliza menos quando texto está sobreposto vs na caption). Caption CTA cuida do algoritmo (save/comment/share). Overlay_cta cuida da conversão.

CLASSIFICAÇÃO DE TEMA (para rotação anti-Finance category Meta):
Avalie o corte e classifique em UM de:
- "fe" — corte fala sobre Deus, oração, providência divina, fé, sem ângulo monetário
- "familia" — corte fala sobre filhos, casamento, maternidade, lar, sem ângulo monetário
- "financeiro" — corte fala sobre dinheiro, orçamento, patrimônio, prosperidade material, trabalho, empreender
- "proposito" — corte fala sobre vocação, missão, transformação pessoal (sem foco em dinheiro)
Esse campo é USADO para evitar 3+ posts financeiros seguidos (anti-shadowban). Classifique honestamente, não force "fe" se o corte realmente é financeiro.

Retorne JSON válido APENAS, sem markdown:
{
  "pros_peridade_do_reino": {
    "hook": "...",
    "body": "...",
    "cta": "...",
    "overlay_cta": "3-6 palavras pro overlay no vídeo, sem emoji",
    "format_used": "FV-XXX",
    "cta_category": "save|comment|share|bio",
    "theme_category": "fe|familia|financeiro|proposito",
    "transcript_quote": "frase literal da transcrição que você parafraseou",
    "body_source": "transcript_paraphrase"
  },
  "orar_prosperar": { ... }
}`;

  const captions = await generate(prompt, { json: true, maxTokens: 1500 });

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

  // VALIDAÇÃO anti-hallucination — body precisa estar ancorado na transcrição
  const transcriptNormalized = transcript.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const transcriptNumbers = (transcript.match(/\b\d+([\.,]\d+)?%?\b/g) || []).map(n => n.replace(',', '.'));
  for (const accountId of activeAccountIds) {
    const c = captions[accountId];
    c.warnings = c.warnings || [];

    // (a) hook+body não podem citar números que não estão no transcript
    const hookBodyText = `${c.hook} ${c.body}`;
    const hookBodyNumbers = (hookBodyText.match(/\b\d+([\.,]\d+)?%?\b/g) || []).map(n => n.replace(',', '.'));
    const inventedNumbers = hookBodyNumbers.filter(n => !transcriptNumbers.includes(n));
    if (inventedNumbers.length) {
      console.warn(`⚠️  [${accountId}] hook/body cita números inventados: ${inventedNumbers.join(', ')} — não estão no transcript. Hook="${c.hook}" Body="${c.body}"`);
      c.warnings.push(`invented_numbers:${inventedNumbers.join(',')}`);
    }

    // (a.2) Downgrade FV-007 → FV-005 se hook+body não tem número (anti-Data-Drop-without-data)
    // LLM às vezes escolhe FV-007 e gera hook sem estatística — força consistência format ↔ conteúdo.
    if (c.format_used === 'FV-007' && hookBodyNumbers.length === 0) {
      console.warn(`⚠️  [${accountId}] FV-007 sem número — downgrade automático para FV-005. Hook="${c.hook}"`);
      c.format_used = 'FV-005';
      c.warnings.push('fv007_downgraded_to_fv005');
    }

    // (b) transcript_quote precisa de fato existir no transcript (fuzzy substring match)
    if (c.transcript_quote && typeof c.transcript_quote === 'string') {
      const quoteNorm = c.transcript_quote.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      // checa overlap de 3+ palavras consecutivas
      const quoteWords = quoteNorm.split(' ').filter(w => w.length > 2);
      let foundOverlap = false;
      for (let i = 0; i <= quoteWords.length - 3; i++) {
        const trigram = quoteWords.slice(i, i + 3).join(' ');
        if (transcriptNormalized.includes(trigram)) { foundOverlap = true; break; }
      }
      if (!foundOverlap && quoteWords.length >= 3) {
        console.warn(`⚠️  [${accountId}] transcript_quote não bate com transcrição. Quote="${c.transcript_quote}"`);
        c.warnings.push('quote_not_in_transcript');
      }
    } else {
      c.warnings.push('missing_transcript_quote');
    }

    // (c) body precisa compartilhar 2+ palavras significativas com transcript (anti-disconnect)
    const stopwords = new Set(['o','a','os','as','um','uma','de','do','da','dos','das','que','você','voce','se','seu','sua','pra','para','com','em','no','na','nos','nas','por','seu','sua','é','e','ou']);
    const bodyWords = c.body.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 3 && !stopwords.has(w));
    const overlap = bodyWords.filter(w => transcriptNormalized.includes(w));
    if (overlap.length < 2 && bodyWords.length >= 4) {
      console.warn(`⚠️  [${accountId}] body desconectado do transcript (overlap=${overlap.length}). Body="${c.body}"`);
      c.warnings.push('body_disconnected_from_transcript');
    }

    // (d) presença de pelo menos 1 termo tribal cristão (anti-"AI corporativo")
    const tribalTerms = [
      'irmã','irmãs','amada','amadas','mamãe','mães','guerreira','filha do rei','mulher virtuosa','filhas de sara',
      'senhor','ele','providência','graça','bênção','amém','deus','azeite','vinha','alpargatas',
      'provérbios','salmos','lucas','mateus','deuteronômio','josé do egito','ana que orou','mulher samaritana',
      'lar','marido','filhos','rotina','atravessei','restaurou','fundo do poço','novo capítulo',
      'sabedoria bíblica','sabedoria do alto','discernimento','do senhor','meu pai','jesus','testemunho','fé prática'
    ];
    const captionText = `${c.hook} ${c.body} ${c.cta}`.toLowerCase();
    const tribalHits = tribalTerms.filter(t => captionText.includes(t));
    if (tribalHits.length === 0) {
      console.warn(`⚠️  [${accountId}] caption sem nenhum termo tribal cristão. Caption="${c.hook} | ${c.body} | ${c.cta}"`);
      c.warnings.push('missing_tribal_lexicon');
    }

    // (e) detecção de linguagem New Age (afasta público cristão)
    const newAgeTerms = ['universo','energia','vibração','manifestar','lei da atração','frequência cósmica','abundância universal'];
    const newAgeHits = newAgeTerms.filter(t => captionText.includes(t));
    if (newAgeHits.length) {
      console.warn(`⚠️  [${accountId}] linguagem New Age detectada: ${newAgeHits.join(', ')}. Caption="${captionText}"`);
      c.warnings.push(`new_age_lexicon:${newAgeHits.join('|')}`);
    }

    // (f) similaridade semântica vs hooks recentes (Jaccard threshold 0.45)
    const sim = findSimilarHook(c.hook, recentHooks, 0.45);
    if (sim.similar) {
      console.warn(`⚠️  [${accountId}] hook similar a recente (score=${sim.score.toFixed(2)}). Novo="${c.hook}" | Match="${sim.match.hook}" (${sim.match.account})`);
      c.warnings.push(`hook_similar_recent:${sim.score.toFixed(2)}`);
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

  // Disclaimer obrigatório por post — proteção CVM/Procon (Resolução CVM 175).
  // Inserido ANTES das hashtags em IG/TikTok, ANTES das hashtags em YouTube description.
  const DISCLAIMER = '📌 Conteúdo educativo. Não é recomendação financeira.';

  // Fallback overlay_cta — SEMPRE direciona pra bio (conversão > algoritmo no overlay).
  // Rotaciona entre variações pra evitar overlay idêntico em todos os cortes.
  const OVERLAY_BIO_VARIATIONS = [
    '→ Link na bio',
    'Tô explicando na bio',
    'Bio → link → te explico',
    'Vai no link da bio',
    'Link na bio agora',
    'Bio: te conto tudo',
    'Te explico no link da bio',
  ];
  const OVERLAY_FALLBACK = (idx = 0) => OVERLAY_BIO_VARIATIONS[idx % OVERLAY_BIO_VARIATIONS.length];

  for (const accountId of Object.keys(captions)) {
    const c = captions[accountId];
    if (!c || !c.hook) continue; // skip se não passou validação acima (defensivo)

    // Sanitiza prefixos "FV-NNN ...:" que LLM às vezes copia do prompt pra dentro do hook
    const fvPrefix = /^\s*FV-\d{3}[^:]*:\s*/i;
    if (fvPrefix.test(c.hook)) c.hook = c.hook.replace(fvPrefix, '').trim();
    if (fvPrefix.test(c.body)) c.body = c.body.replace(fvPrefix, '').trim();

    c.schema_version = 'v2';
    c.body_source = c.body_source || 'transcript_paraphrase';
    c.theme_category = c.theme_category || 'financeiro';
    if (!c.overlay_cta || typeof c.overlay_cta !== 'string' || !c.overlay_cta.trim()) {
      // Fallback: rotaciona entre variações "link na bio". Seed pelo hash do hook pra ser estável.
      const seed = (c.hook || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
      c.overlay_cta = OVERLAY_FALLBACK(seed);
    } else {
      c.overlay_cta = c.overlay_cta.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
      // Sanity check: se LLM ignorou e gerou overlay sem menção a bio/link, força fallback
      const mentionsBio = /\b(bio|link|arrasta|swipe|descrição|descricao)\b/i.test(c.overlay_cta);
      if (!mentionsBio) {
        const seed = (c.hook || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
        console.warn(`⚠️  [${accountId}] overlay_cta sem menção a bio/link — substituindo. Era="${c.overlay_cta}"`);
        c.overlay_cta = OVERLAY_FALLBACK(seed);
      }
    }
    c.full_caption = `${c.hook}\n\n${c.body}\n\n${c.cta}`;

    c.hashtags_instagram = pickRandom(templates.hashtags_instagram);
    c.hashtags_tiktok = pickRandom(templates.hashtags_tiktok);
    c.hashtags_youtube = pickRandom(templates.hashtags_youtube);

    c.caption_ig = `${c.full_caption}\n\n${DISCLAIMER}\n\n${c.hashtags_instagram}`;
    c.caption_tiktok = `${c.full_caption}\n\n${DISCLAIMER}\n\n${c.hashtags_tiktok}`;
    c.caption_youtube = `${c.hook}\n\n${DISCLAIMER} ${c.hashtags_youtube}`;

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
