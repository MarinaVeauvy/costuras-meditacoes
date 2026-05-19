# Setup Gemini API (fallback grátis)

## Por quê

Hoje o pipeline Midas depende 100% da Groq pra gerar captions. Se a Groq cair
ou hit rate limit pesado, o caption-generator quebra e o workflow falha.
Gemini é grátis (1500 req/dia) e roda em infraestrutura separada (Google) —
fallback ideal.

## Passo a passo

### 1. Criar API key

1. Abre <https://aistudio.google.com/app/apikey>
2. Login com a conta Google que vai usar (recomendo `aurumlab.cloud@gmail.com` ou `macmarina@gmail.com`)
3. Clica em **"Create API key"** → **"Create API key in new project"**
4. Copia a key (formato `AIza...`)

### 2. Adicionar ao `.env` local

Edita `C:\Users\marin\Documents\costuras-meditacoes\.env` e adiciona uma linha:

```
GEMINI_API_KEY=AIza...sua_key_aqui
```

### 3. Adicionar ao GitHub Actions (workflow)

1. Abre <https://github.com/MarinaVeauvy/costuras-meditacoes/settings/secrets/actions>
2. Clica **"New repository secret"**
3. Name: `GEMINI_API_KEY`
4. Value: cola a key
5. Clica **"Add secret"**

> O workflow `.github/workflows/midas-publish.yml` já injeta `GEMINI_API_KEY`
> no env do step "Generate captions" — não precisa editar YAML.

### 4. Testar

```bash
cd scripts/midas
node midas-generate-captions.js --video=corte_00001.mp4
```

No output, se você ver `Usando Gemini...` apareceu antes da Groq, significa
que Groq estava em rate limit e Gemini assumiu. Se nunca aparecer, é
porque Groq nunca quebrou — Gemini fica em standby (custo zero).

## Ordem de fallback ativa (após esse setup)

```
1. Groq (free, llama 3.3 70b) ← preferido
2. Gemini (free, gemini-1.5-flash) ← novo fallback
3. OpenRouter (free, modelos rotativos)
4. OpenAI (pago)
5. Anthropic (pago)
```

## Limites Gemini free tier

| Modelo | RPM | RPD | Contexto |
|---|---|---|---|
| gemini-1.5-flash | 15 | 1500 | 1M tokens |
| gemini-1.5-pro | 2 | 50 | 2M tokens |

Pipeline Midas usa `gemini-1.5-flash` por padrão (em `ai-provider.js`).
1500 req/dia cobre **muito mais** que o necessário (2 posts/dia x 3 contas
= 6 chamadas/dia).
