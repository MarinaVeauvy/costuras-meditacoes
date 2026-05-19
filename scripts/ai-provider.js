// Unified AI Provider — Groq (free, estável) → OpenRouter (free) → Gemini → OpenAI → Anthropic
// All scripts use this instead of calling APIs directly

const GROQ_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Tolerant JSON parser — extracts JSON from markdown code blocks ```json ... ```
// Rejeita JSON "vazio" (ex: `{"":""}`, `{}`, `[]`) pra caller cair pro próximo provider.
function parseJsonTolerant(text) {
  if (typeof text !== 'string') return validateNonEmpty(text);
  // Try direct parse first
  try { return validateNonEmpty(JSON.parse(text)); } catch {}
  // Strip markdown code fence ```json or ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    try { return validateNonEmpty(JSON.parse(fenced[1])); } catch {}
  }
  // Extract first {...} or [...] block
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return validateNonEmpty(JSON.parse(objMatch[0])); } catch {}
  }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return validateNonEmpty(JSON.parse(arrMatch[0])); } catch {}
  }
  throw new Error(`JSON parse falhou. Início do texto: ${text.substring(0, 200)}`);
}

// Rejeita `{}`, `[]`, ou objetos com TODAS chaves/valores vazios (ex: `{"":""}`).
// Modelos free às vezes retornam JSON sintaticamente válido mas semanticamente vazio.
function validateNonEmpty(parsed) {
  if (parsed === null || parsed === undefined) {
    throw new Error('JSON resultado é null/undefined');
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) throw new Error('JSON array vazio');
    return parsed;
  }
  if (typeof parsed === 'object') {
    const keys = Object.keys(parsed);
    if (keys.length === 0) throw new Error('JSON object vazio');
    // Detecta `{"":""}` ou variantes — todas as keys ou todos os values são strings vazias
    const allEmpty = keys.every((k) => {
      if (k.trim() === '') return true;
      const v = parsed[k];
      return v === '' || v === null || v === undefined;
    });
    if (allEmpty) throw new Error('JSON object com todas keys/values vazios');
  }
  return parsed;
}

async function generate(prompt, { json = false, maxTokens = 4096 } = {}) {
  // 1. Groq — free tier generoso (14400 req/dia), llama 3.3 70b
  if (GROQ_KEY) {
    try {
      return await generateGroq(prompt, { json, maxTokens });
    } catch (err) {
      console.error(`  ⚠️ Groq falhou: ${err.message}`);
    }
  }

  if (OPENROUTER_KEY) {
    try {
      return await generateOpenRouter(prompt, { json, maxTokens });
    } catch (err) {
      console.error(`  ⚠️ OpenRouter falhou: ${err.message}`);
    }
  }

  if (GEMINI_KEY) {
    try {
      return await generateGemini(prompt, { json, maxTokens });
    } catch (err) {
      console.error(`  ⚠️ Gemini falhou: ${err.message}`);
    }
  }

  if (OPENAI_KEY) {
    try {
      return await generateOpenAI(prompt, { json, maxTokens });
    } catch (err) {
      console.error(`  ⚠️ OpenAI falhou: ${err.message}`);
    }
  }

  // Last resort: Anthropic (paid, very reliable)
  if (ANTHROPIC_KEY) {
    try {
      return await generateAnthropic(prompt, { json, maxTokens });
    } catch (err) {
      console.error(`  ⚠️ Anthropic falhou: ${err.message}`);
    }
  }

  throw new Error('Nenhum AI provider disponível ou todos falharam.');
}

// Groq free models — endpoint compatível OpenAI, free tier 14400 req/dia
// Atualizado 2026: mixtral, gemma2-9b-it e llama-3.1-70b foram decommissioned.
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',  // top quality, 128k context
  'llama-3.1-8b-instant',     // fallback rápido (context 128k mas tokens out menores)
];

async function generateGroq(prompt, { json, maxTokens }) {
  let lastErr;
  for (const model of GROQ_MODELS) {
    try {
      return await callGroq(model, prompt, { json, maxTokens });
    } catch (err) {
      lastErr = err;
      console.error(`    ↪ Groq ${model} falhou: ${err.message.substring(0, 120)}`);
    }
  }
  throw lastErr || new Error('Todos os modelos Groq falharam');
}

async function callGroq(model, prompt, { json, maxTokens }, attempt = 1) {
  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: Math.min(maxTokens, 8000), // Groq max
    temperature: 0.8,
  };
  if (json) body.response_format = { type: 'json_object' };

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (data.error) {
    const msg = data.error.message || JSON.stringify(data.error);
    // Retry com backoff em rate limit — Groq fornece tempo no header / mensagem
    const isRateLimit = res.status === 429 || /rate limit|too many requests|TPM/i.test(msg);
    if (isRateLimit && attempt < 3) {
      const waitMatch = msg.match(/try again in ([\d.]+)s/i);
      const waitSec = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) + 2 : (attempt * 30);
      console.error(`    ↪ Groq ${model} rate limit, aguardando ${waitSec}s (attempt ${attempt}/3)...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
      return callGroq(model, prompt, { json, maxTokens }, attempt + 1);
    }
    throw new Error(msg);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned empty response');

  return json ? parseJsonTolerant(text) : text;
}

// Free models on OpenRouter, tried in order. Lista atualizada 2026-05-10
// Removidos: nvidia/llama-3.1-nemotron-70b:free e mistralai/mistral-7b:free
// (404 "No endpoints found" — descontinuados pelos providers).
// Verificar periodicamente em https://openrouter.ai/models?max_price=0
const OPENROUTER_FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'google/gemma-4-31b-it:free',
  'meta-llama/llama-3.2-3b-instruct:free',
];

async function generateOpenRouter(prompt, { json, maxTokens }) {
  let lastErr;
  for (const model of OPENROUTER_FREE_MODELS) {
    try {
      return await callOpenRouter(model, prompt, { json, maxTokens });
    } catch (err) {
      lastErr = err;
      console.error(`    ↪ ${model} falhou: ${err.message.substring(0, 120)}`);
    }
  }
  throw lastErr || new Error('Todos os modelos OpenRouter falharam');
}

async function callOpenRouter(model, prompt, { json, maxTokens }) {
  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.8,
  };
  if (json) body.response_format = { type: 'json_object' };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://marinaveauvy.com.br',
      'X-Title': 'Marina Veauvy Content Factory',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned empty response');

  return json ? parseJsonTolerant(text) : text;
}

async function generateOpenAI(prompt, { json, maxTokens }) {
  const body = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.8,
  };
  if (json) body.response_format = { type: 'json_object' };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI returned empty response');

  return json ? parseJsonTolerant(text) : text;
}

async function generateGemini(prompt, { json, maxTokens }) {
  const config = {
    temperature: 0.8,
    maxOutputTokens: maxTokens,
    thinkingConfig: { thinkingBudget: 0 },
  };
  if (json) config.responseMimeType = 'application/json';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: config,
      }),
    }
  );

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');

  return json ? parseJsonTolerant(text) : text;
}

async function generateAnthropic(prompt, { json, maxTokens }) {
  const userPrompt = json
    ? `${prompt}\n\nIMPORTANTE: retorne APENAS JSON válido, sem markdown nem explicação.`
    : prompt;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  if (data.type === 'error') throw new Error(JSON.stringify(data));

  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Anthropic returned empty response');

  return json ? parseJsonTolerant(text) : text;
}

module.exports = { generate };
