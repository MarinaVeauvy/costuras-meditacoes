# Setup Cloudflare Worker — substitui APIs Vercel

Este Worker replica os 5 endpoints `/api/*` que rodavam na Vercel (suspensa).
Custo: **$0** (free tier 100k req/dia, 10ms CPU/req).

## Endpoints migrados

| Método | Path | Função |
|--------|------|--------|
| POST | `/api/newsletter/subscribe` | Captura nas LPs de newsletter |
| POST | `/api/newsletter/send` | Envia broadcast (admin, via CLI) |
| GET/DELETE | `/api/newsletter/subscribers` | List/unsub (admin + público) |
| POST | `/api/product/download` | Captura nas LPs de lead magnet |
| POST | `/api/minicurso/subscribe` | Drip 5 dias (Resend scheduled_at) |

## Setup (~10 minutos, 1 vez)

### 1. Criar conta Cloudflare
- Acesse https://dash.cloudflare.com/sign-up
- Email + senha (free, sem cartão)

### 2. Pegar Account ID
- Cloudflare Dashboard → Workers & Pages
- Lateral direita aparece **Account ID** (32 chars hex)
- Copia

### 3. Gerar API Token
- https://dash.cloudflare.com/profile/api-tokens
- **Create Token** → escolhe template **"Edit Cloudflare Workers"**
- Permissions já vêm preenchidas: Account → Workers Scripts → Edit
- Continue → Create Token
- Copia o token (mostra só 1 vez)

### 4. Adicionar secrets no GitHub
Acesse https://github.com/MarinaVeauvy/costuras-meditacoes/settings/secrets/actions

Adicionar 2 secrets:
- `CLOUDFLARE_API_TOKEN` = token do passo 3
- `CLOUDFLARE_ACCOUNT_ID` = account ID do passo 2

### 5. Adicionar secrets do Worker (Resend, Admin)
No próprio Cloudflare Dashboard:
- Workers & Pages → marinaveauvy-api → Settings → Variables and Secrets
- Add: `RESEND_API_KEY` = (mesmo valor que estava na Vercel)
- Add: `ADMIN_KEY` = (mesmo valor — `pa-admin-a3f7c9e1b2d4` por padrão)

OU via CLI local:
```powershell
cd workers/api
npm install
npx wrangler secret put RESEND_API_KEY  # cola o valor quando pedir
npx wrangler secret put ADMIN_KEY
```

### 6. Trigger deploy (primeira vez)

Após push do código, o GitHub Action `deploy-cloudflare-api.yml` roda automaticamente.
OU dispara manual:
```
gh workflow run deploy-cloudflare-api.yml
```

Resultado esperado: Worker disponível em
**`https://marinaveauvy-api.<seu-subdomain>.workers.dev`**

### 7. Apontar APIs antigas (`costuras-meditacoes.vercel.app`) pro Worker

Edite as LPs (`newsletter-impulso-ia.html`, `planilha-auditoria.html`, etc.) trocando:

```js
// Antes
fetch('https://costuras-meditacoes.vercel.app/api/newsletter/subscribe', ...)

// Depois
fetch('https://marinaveauvy-api.<seu-subdomain>.workers.dev/api/newsletter/subscribe', ...)
```

OU configura **custom domain** `api.marinaveauvy.com.br` apontando pro Worker
(Cloudflare Dashboard → Worker → Settings → Domains & Routes → Add Custom Domain)
e usa essa URL nas LPs (mais limpo, sem mudar nada se trocar de provider depois).

## Testes manuais

Após deploy, testa via curl:

```powershell
# Newsletter subscribe
curl -X POST "https://marinaveauvy-api.<sub>.workers.dev/api/newsletter/subscribe" `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"teste@gmail.com\",\"name\":\"Teste\",\"newsletter_id\":\"impulso-ia\"}"

# Product download (vai retornar 302 redirect)
curl -X POST "https://marinaveauvy-api.<sub>.workers.dev/api/product/download" `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"teste@gmail.com\",\"name\":\"Teste\",\"product_id\":\"planilha-auditoria\"}"
```

## Custos esperados

- **Hoje:** $0 — free tier 100k req/dia (atual: ~50 req/dia das LPs)
- **Crescimento 100x:** $0 — ainda dentro do free tier
- **Crescimento 1000x:** ~$5/mês (Workers Paid plan)

## Troubleshooting

**Erro 1003 — Worker not found:** o deploy falhou. Veja `gh run list --workflow=deploy-cloudflare-api.yml`.

**Erro 500 — RESEND_API_KEY missing:** secrets não configurados no Worker. Volte ao passo 5.

**CORS bloqueado:** edita `workers/api/src/cors.js` e adiciona o domínio na lista `ALLOWED_ORIGINS`.
