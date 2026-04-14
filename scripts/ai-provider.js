// Unified AI Provider — Gemini (primary) with OpenAI fallback
// All scripts use this instead of calling APIs directly

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function generate(prompt, { json = false, maxTokens = 4096 } = {}) {
  // Try Gemini first (gemini-2.0-flash — free tier, fast)
  if (GEMINI_KEY) {
    try {
      return await generateGemini(prompt, { json, maxTokens });
    } catch (err) {
      console.error(`  ⚠️ Gemini falhou: ${err.message}`);
    }
  }

  // Fallback to OpenAI
  if (OPENAI_KEY) {
    try {
      return await generateOpenAI(prompt, { json, maxTokens });
    } catch (err) {
      console.error(`  ⚠️ OpenAI falhou: ${err.message}`);
    }
  }

  throw new Error('Nenhum AI provider disponível. Configure GEMINI_API_KEY ou OPENAI_API_KEY.');
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

  return json ? JSON.parse(text) : text;
}

async function generateGemini(prompt, { json, maxTokens }) {
  const config = {
    temperature: 0.8,
    maxOutputTokens: maxTokens,
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

  return json ? JSON.parse(text) : text;
}

module.exports = { generate };
