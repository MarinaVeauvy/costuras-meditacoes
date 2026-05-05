// Unified AI Provider — OpenRouter (free) → Gemini → OpenAI → Anthropic (paid fallback)
// All scripts use this instead of calling APIs directly

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Tolerant JSON parser — extracts JSON from markdown code blocks ```json ... ```
function parseJsonTolerant(text) {
  if (typeof text !== 'string') return text;
  // Try direct parse first
  try { return JSON.parse(text); } catch {}
  // Strip markdown code fence ```json or ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  // Extract first {...} or [...] block
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch {}
  }
  throw new Error(`JSON parse falhou. Início do texto: ${text.substring(0, 200)}`);
}

async function generate(prompt, { json = false, maxTokens = 4096 } = {}) {
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

// Free models on OpenRouter, tried in order. Each has independent rate limits,
// so rotating across them lets us generate multiple items per minute.
const OPENROUTER_FREE_MODELS = [
  'google/gemma-4-31b-it:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free',
  'z-ai/glm-4.5-air:free',
  'google/gemma-3-12b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
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
