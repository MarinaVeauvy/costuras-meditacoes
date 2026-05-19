/**
 * Midas Caption Utils — validação compartilhada por publishers + quarantine.
 *
 * Define quando uma caption JSON é publicável (schema_version=v2 + sem violações).
 * Publishers DEVEM chamar isPublishableCaption antes de postar.
 */

const fs = require('fs');
const path = require('path');

let _templatesCache = null;
function getTemplates() {
  if (_templatesCache) return _templatesCache;
  const templatesPath = path.join(__dirname, '..', '..', 'midas', 'config', 'captions-templates.json');
  _templatesCache = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
  return _templatesCache;
}

// Handles pessoais que NUNCA podem aparecer em conteúdo publicado.
// Guard hard-coded — não depende do templates.json. Bloqueia anywhere no caption.
const PERSONAL_HANDLES_BLOCKLIST = [
  '@marinaveauvy', '@marinaveuvy',
  'marinaveauvy', 'marinaveuvy',
  'marinaveauvy.com.br',
];

/**
 * Verifica se uma caption específica (de uma conta) é publicável.
 * @param {object} caption - objeto da conta no JSON (ex: captionsJson.pros_peridade_do_reino)
 * @returns {{ ok: boolean, reasons: string[] }}
 */
function isPublishableCaption(caption) {
  const reasons = [];
  if (!caption || typeof caption !== 'object') {
    return { ok: false, reasons: ['caption_missing_or_not_object'] };
  }

  // (0) Guard: handle pessoal NUNCA pode aparecer em nenhum campo da caption.
  // Proteção contra regressão futura (ex: LLM aprender o handle de algum lugar).
  const allText = JSON.stringify(caption).toLowerCase();
  const personalHits = PERSONAL_HANDLES_BLOCKLIST.filter(h => allText.includes(h.toLowerCase()));
  if (personalHits.length) {
    reasons.push(`personal_handle_leaked:${personalHits.join('|')}`);
  }

  // (1) Schema version v2 — gate principal
  if (caption.schema_version !== 'v2') {
    reasons.push('not_schema_v2');
  }

  // (2) Hook / body / cta presentes e não vazios
  for (const field of ['hook', 'body', 'cta']) {
    if (!caption[field] || typeof caption[field] !== 'string' || !caption[field].trim()) {
      reasons.push(`empty_${field}`);
    }
  }

  // (3) full_caption não tem "undefined" literal
  if (typeof caption.full_caption === 'string' && /\bundefined\b/i.test(caption.full_caption)) {
    reasons.push('full_caption_has_undefined');
  }

  // (4) Forbidden words em qualquer caption finalizada
  const templates = getTemplates();
  const forbidden = templates.forbidden_words || [];
  for (const target of ['caption_ig', 'caption_tiktok', 'caption_youtube']) {
    const text = caption[target];
    if (typeof text !== 'string') continue;
    const lower = text.toLowerCase();
    const hits = forbidden.filter(w => lower.includes(w.toLowerCase()));
    if (hits.length) {
      reasons.push(`forbidden_in_${target}:${hits.join('|')}`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Verifica se um arquivo de caption inteiro (multi-conta) tem pelo menos uma conta publicável.
 * Usado pra screening de pool — não decide o que publicar (publisher decide por conta).
 */
function isAnyAccountPublishable(captionsJson) {
  if (!captionsJson || typeof captionsJson !== 'object') return false;
  for (const accountId of Object.keys(captionsJson)) {
    if (accountId.startsWith('_')) continue;
    const { ok } = isPublishableCaption(captionsJson[accountId]);
    if (ok) return true;
  }
  return false;
}

/**
 * Diagnóstico completo de um arquivo de caption — usado pelo quarantine script.
 * @returns {{ filename, criticalIssues: string[], accountResults: {[accountId]: {ok, reasons}} }}
 */
function diagnoseCaptionsFile(filePath) {
  const filename = path.basename(filePath);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return { filename, criticalIssues: [`parse_error:${err.message}`], accountResults: {} };
  }

  const accountResults = {};
  for (const accountId of Object.keys(data)) {
    if (accountId.startsWith('_')) continue;
    accountResults[accountId] = isPublishableCaption(data[accountId]);
  }

  // "Crítico" = arquivo manifestamente quebrado (impacta TODA conta, não só uma).
  // Pra quarentena automática.
  const accountIds = Object.keys(accountResults);
  const criticalIssues = [];
  if (accountIds.length === 0) {
    criticalIssues.push('no_account_data');
  } else {
    // Se TODAS as contas têm hook vazio / undefined → arquivo quebrado.
    const allEmpty = accountIds.every(id => accountResults[id].reasons.some(r => r === 'empty_hook' || r === 'full_caption_has_undefined'));
    if (allEmpty) criticalIssues.push('all_accounts_empty_or_undefined');

    // Forbidden words em qualquer conta → publicação ilegal, vale quarentena.
    const anyForbidden = accountIds.some(id => accountResults[id].reasons.some(r => r.startsWith('forbidden_in_')));
    if (anyForbidden) criticalIssues.push('forbidden_words_detected');
  }

  return { filename, criticalIssues, accountResults };
}

// ─── Theme rotation gate (anti-shadowban Finance category) ────────────────
//
// Meta classifica perfis no bucket "Finance" se 3+ posts seguidos batem em dinheiro.
// Pivô só funciona se alternarmos com fé/família/propósito. Esse gate força isso.

const THEME_HISTORY_PATH = path.join(__dirname, '..', '..', 'midas', 'state', 'theme-history.json');
const MAX_CONSECUTIVE_FINANCEIRO = 3;

function loadThemeHistory() {
  if (!fs.existsSync(THEME_HISTORY_PATH)) return { history: [] };
  try {
    return JSON.parse(fs.readFileSync(THEME_HISTORY_PATH, 'utf8'));
  } catch {
    return { history: [] };
  }
}

function saveThemeHistory(data) {
  fs.mkdirSync(path.dirname(THEME_HISTORY_PATH), { recursive: true });
  fs.writeFileSync(THEME_HISTORY_PATH, JSON.stringify(data, null, 2));
}

/**
 * Verifica se posting um novo theme violaria a regra "max 2 financeiros seguidos".
 * Olha apenas histórico da MESMA conta (cada perfil tem seu algoritmo).
 * @returns {{ ok: boolean, reason?: string, consecutiveFinanceiro: number }}
 */
function checkThemeRotation(accountId, newTheme) {
  const data = loadThemeHistory();
  const accountHistory = data.history
    .filter(h => h.account === accountId)
    .slice(-MAX_CONSECUTIVE_FINANCEIRO);

  let consecutive = 0;
  for (let i = accountHistory.length - 1; i >= 0; i--) {
    if (accountHistory[i].theme === 'financeiro') consecutive++;
    else break;
  }

  if (newTheme === 'financeiro' && consecutive >= MAX_CONSECUTIVE_FINANCEIRO) {
    return {
      ok: false,
      reason: `theme_rotation_violated: ${consecutive} posts financeiros consecutivos em ${accountId} — alternar com fe/familia/proposito`,
      consecutiveFinanceiro: consecutive,
    };
  }
  return { ok: true, consecutiveFinanceiro: consecutive };
}

/**
 * Registra um post publicado no histórico. Publishers chamam após publicar.
 * Aceita objeto rico (recordPublishedPost) ou compat com versão antiga (theme + account + video + platform).
 */
function recordPublishedTheme(input) {
  const data = loadThemeHistory();
  data.history.push({
    account: input.account,
    video: input.video,
    theme: input.theme || 'unknown',
    platform: input.platform || 'unknown',
    // Novos campos opcionais (para tracking de performance por dimensão)
    format_used: input.format_used || null,
    cta_category: input.cta_category || null,
    hook: input.hook || null,
    overlay_cta: input.overlay_cta || null,
    transcript_quote: input.transcript_quote || null,
    ts: new Date().toISOString(),
  });
  // Mantém só últimos 500 (escalado pra cobrir mais histórico após enriquecimento)
  if (data.history.length > 500) {
    data.history = data.history.slice(-500);
  }
  saveThemeHistory(data);
}

// ─── Dedup semântico cross-conta cross-time ───────────────────────────────
//
// Anti-fadiga de hook em escala. Captions atual rotaciona format/CTA por conta,
// mas LLM tende a reusar mesma frase semântica ("Tudo sobre X está errado",
// "O que ninguém conta sobre Y") com palavra diferente — algoritmo Meta detecta
// como duplicado e shadowban.
//
// Estratégia: similaridade lexical (Jaccard sobre tokens+bigramas). Threshold 0.45
// = hook "muito parecido". Sem embeddings (evita dep externa) — cobre os 80% mais
// óbvios. Pra semântica profunda, futura iteração com embeddings.

const SIMILARITY_STOPWORDS = new Set([
  'o','a','os','as','um','uma','de','do','da','dos','das','que','você','voce','se','seu','sua',
  'pra','para','com','em','no','na','nos','nas','por','é','e','ou','não','nao','sim','isso',
  'aqui','tem','têm','está','esta','são','sao','as','foi','vai','ter','tudo','ele','ela','meu','minha'
]);

function normalizeForSimilarity(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeForSimilarity(text) {
  const norm = normalizeForSimilarity(text);
  const words = norm.split(' ').filter(w => w.length > 2 && !SIMILARITY_STOPWORDS.has(w));
  const set = new Set(words);
  // adiciona bigramas (capta colocações fortes tipo "tudo errado", "ninguém conta")
  for (let i = 0; i < words.length - 1; i++) {
    set.add(`${words[i]}_${words[i + 1]}`);
  }
  return set;
}

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Lê últimos N hooks (qualquer conta) do diretório captions/.
 * Ordena por mtime descendente, retorna { hook, account, file } por entry.
 */
function getRecentHooksAcrossAccounts(limit = 30) {
  const captionsDir = path.join(__dirname, '..', '..', 'midas', 'captions');
  if (!fs.existsSync(captionsDir)) return [];

  const files = fs.readdirSync(captionsDir)
    .filter(f => f.endsWith('.json'))
    .filter(f => !f.includes('_hooked'))
    .filter(f => !f.includes('v1-backup') && !f.includes('v2-backup'))
    .filter(f => f.startsWith('corte_'))
    .map(f => ({ file: f, mtime: fs.statSync(path.join(captionsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const recent = [];
  for (const { file } of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(captionsDir, file), 'utf8'));
      for (const accountId of Object.keys(data)) {
        if (accountId.startsWith('_')) continue;
        const c = data[accountId];
        if (c && typeof c.hook === 'string' && c.hook.trim()) {
          recent.push({ hook: c.hook, account: accountId, file });
          if (recent.length >= limit) return recent;
        }
      }
    } catch { /* skip malformed */ }
  }
  return recent;
}

/**
 * Acha hook recente similar ao novo (Jaccard > threshold).
 * @returns {{ similar: boolean, score: number, match?: object }}
 */
function findSimilarHook(newHook, recentHooks = null, threshold = 0.45) {
  const history = recentHooks || getRecentHooksAcrossAccounts(30);
  const newSet = tokenizeForSimilarity(newHook);
  let best = { similar: false, score: 0, match: null };
  for (const entry of history) {
    const score = jaccardSimilarity(newSet, tokenizeForSimilarity(entry.hook));
    if (score > best.score) best = { similar: score >= threshold, score, match: entry };
  }
  return best;
}

module.exports = {
  isPublishableCaption,
  isAnyAccountPublishable,
  diagnoseCaptionsFile,
  getTemplates,
  checkThemeRotation,
  recordPublishedTheme,
  THEME_HISTORY_PATH,
  getRecentHooksAcrossAccounts,
  findSimilarHook,
  tokenizeForSimilarity,
  jaccardSimilarity,
};
