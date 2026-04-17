# Midas — Estado Atual + Guia Próximos Passos

> Documento de continuidade — criado 17/04/2026
> Pra retomar a operação e configurar as contas 2 e 3

---

## 🎯 O QUE JÁ ESTÁ FEITO

### Conta 1: @pros.peridadedoreino — 100% OPERACIONAL

| Item | Status | Detalhe |
|---|---|---|
| Instagram Business | ✅ | @pros.peridadedoreino |
| Fanpage Facebook | ✅ | "Vida Nova Próspera" (ID 1094940133701143) |
| IG → Fanpage linkada | ✅ | IG Business ID: 17841441741304118 |
| Meta Developer app | ✅ | "Midas Publisher" (App ID 970508815473066) |
| Token IG long-lived | ✅ | Salvo em `.env` como `IG_TOKEN_1` |
| Cloudinary Free | ✅ | Cloud `dixxvm1yt` — 36 cortes hospedados |
| Anthropic Claude Haiku | ✅ | Reusada do projeto transcricoes |
| YouTube @ProsperidadedoReino-m8e | ✅ | OAuth token salvo |
| TikTok @pros.peridadedoreino | ✅ | Conectado no Publer Free |
| GitHub Secrets (8) | ✅ | Todas configuradas |
| Pipeline scripts | ✅ | 10 scripts em `scripts/midas/` |
| GitHub Actions workflow | ✅ | `.github/workflows/midas-publish.yml` |
| Primeira publicação IG | ✅ | https://www.instagram.com/reel/DXPNCHNFSUi/ |
| Disclaimer fixado IG | ✅ | https://www.instagram.com/p/DXPNynsEUEM/ |
| Publer Free (10 posts agendados) | ✅ | TikTok cobrindo 18-27/04 |

### Produto e infraestrutura compartilhada

| Item | Valor |
|---|---|
| Produto afiliado | MAC Bruno Aguiar 2.0 (R$297) |
| Plataforma | Ticto |
| Link afiliado | https://payment.ticto.app/OA1B58ADA?pid=AFCAA6C80D |
| Affiliate PID | AFCAA6C80D |
| Comissão | R$237,60/venda (80%) |
| Domínio bridge | vidanovaprospera.com.br (comprado via Hostinger) |
| LP | Pendente — Thiago Montibeller montando (enviar domínio) |
| Elite Flow | Assinada R$597/mês |

### Automação programada

```
Ramp up GitHub Actions:
  Semana 1 (17-23/04): 1 post/dia às 10h BRT
  Semana 2 (24-30/04): 2 posts/dia (07h30 + 19h30)
  Semana 3-4 (01-16/05): 3 posts/dia
  Mês 2+: 4 posts/dia
```

Canais automáticos hoje: **Instagram Reels + YouTube Shorts**
Canal semi-manual: **TikTok via Publer Free** (refill fila a cada 3 dias)

---

## 🔑 CREDENCIAIS — Referência rápida

**Arquivo:** `C:\Users\marin\Documents\costuras-meditacoes\.env` (nunca commitar)

| Variável | Origem |
|---|---|
| `CLOUDINARY_CLOUD_NAME` / `API_KEY` / `API_SECRET` | cloudinary.com dashboard |
| `ANTHROPIC_API_KEY` | reusada de transcricoes/.env |
| `META_APP_ID` / `META_APP_SECRET` | developers.facebook.com/apps/970508815473066 |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | produto Instagram dentro do app Midas Publisher |
| `IG_TOKEN_1` | Page token long-lived via Graph Explorer |
| `YT_OAUTH_1` | JSON em `midas/state/yt-token-pros_peridade_do_reino.json` |

**GitHub Secrets configuradas:**
https://github.com/MarinaVeauvy/costuras-meditacoes/settings/secrets/actions

8 secrets: ANTHROPIC_API_KEY, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, META_APP_ID, META_APP_SECRET, IG_TOKEN_1, YT_OAUTH_1

---

## 📋 PRÓXIMOS PASSOS — Configurar contas 2 e 3

### Conta 2: @orar.prosperar
**Persona:** Mãe empreendedora + praticidade
**Público:** Mães 30-45 cansadas do 9-5

### Conta 3: @liberdade.com.fe
**Persona:** Transformação + testemunho cru
**Público:** Mulheres 25-45 em transição financeira

### ⚠️ Setup técnico (replicar pra cada conta)

**Pré-requisito:** Criar Gmails separados pra cada conta:
- `orar.prosperar.midas@gmail.com` (ou similar)
- `liberdade.com.fe.midas@gmail.com` (ou similar)

Email de recuperação: macmarina@gmail.com

### Passo 1 — Criar contas sociais (15 min cada)

Pro perfil `@orar.prosperar` (exemplo — repetir pra liberdade.com.fe):

1. **Instagram:**
   - Criar conta `@orar.prosperar`
   - Converter pra **Business** (Configurações → Tipo de conta → Profissional)
   - Definir categoria: Consultor financeiro ou Educação
   - Bio e foto: ver `midas/config/bios.md` (copiar seção correspondente)

2. **Facebook Fanpage:**
   - Criar page com nome temático (NÃO usar nome do Bruno)
   - Sugestão: **"Orar e Prosperar"** ou **"Prosperar com Fé"**
   - Categoria: Consultant / Digital Creator
   - Bio: "Mães aprendendo sobre mercado cripto e educação financeira"

3. **Linkar IG → Fanpage:**
   - https://business.facebook.com/ → Business Settings → Instagram Accounts → Add
   - Ou: Facebook Page → Settings → Linked Accounts → Instagram → Connect
   - Login com `@orar.prosperar`

4. **YouTube:**
   - Já vem com o Gmail (canal default)
   - Configurar handle: `@OrarProsperar` ou similar
   - Bio e foto iguais ao Instagram
   - Categoria do canal: Education ou How to & Style

5. **TikTok:**
   - Criar `@orar.prosperar`
   - Bio + foto iguais ao Instagram
   - Link: `https://payment.ticto.app/OA1B58ADA?pid=AFCAA6C80D`

### Passo 2 — Meta Developer (Instagram Graph API)

Pro app **Midas Publisher** já existe — **não criar outro**. Só adicionar a nova Page/IG:

1. https://business.facebook.com → Business Settings
2. **Instagram Accounts** → Add → autoriza @orar.prosperar
3. **Pages** → Add → autoriza a Fanpage nova
4. Vincula ambos (IG com Page nova)

5. **Regerar token no Graph API Explorer:**
   - https://developers.facebook.com/tools/explorer/
   - Meta App: **Midas Publisher**
   - User Token
   - Permissions: pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic, instagram_content_publish
   - Generate Token → autorizar selecionando **AS 2 PAGES** (Vida Nova Próspera + a nova)
   - Copia o novo token

6. **Rodar script pra pegar o Page Token + IG Business ID da conta nova:**

```bash
cd C:/Users/marin/Documents/costuras-meditacoes
node -r dotenv/config -e "
const TOKEN = 'COLA_TOKEN_NOVO_AQUI';
const APP_ID = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;
const GRAPH = 'https://graph.facebook.com/v21.0';

async function run() {
  let r = await fetch(\`\${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=\${APP_ID}&client_secret=\${APP_SECRET}&fb_exchange_token=\${TOKEN}\`).then(r => r.json());
  const LONG = r.access_token;
  r = await fetch(\`\${GRAPH}/me/accounts?access_token=\${LONG}\`).then(r => r.json());
  for (const page of r.data) {
    const ig = await fetch(\`\${GRAPH}/\${page.id}?fields=instagram_business_account{id,username}&access_token=\${page.access_token}\`).then(r => r.json());
    console.log('Page:', page.name, '| ID:', page.id);
    if (ig.instagram_business_account) {
      console.log('  IG:', ig.instagram_business_account.username, '| IG_ID:', ig.instagram_business_account.id);
      console.log('  PAGE_TOKEN:', page.access_token);
    }
  }
}
run();
"
```

7. **Atualizar `midas/config/accounts.json`:**
   - Preencher `instagram_business_id` e `facebook_page_id` da conta nova
   - Mudar `"active": false` → `"active": true`

8. **Adicionar no `.env` local + GitHub Secrets:**
   ```
   IG_TOKEN_2=<page_token_da_@orar.prosperar>
   ```
   ```bash
   gh secret set IG_TOKEN_2 --body "..."
   ```

### Passo 3 — YouTube OAuth (conta 2)

No computador, **deslogar de todas contas Google** e logar só com o Gmail da conta nova:

```bash
cd C:/Users/marin/Documents/costuras-meditacoes
"C:/Users/marin/AppData/Local/Programs/Python/Python312/python.exe" -c "
import json
from urllib.parse import urlencode
with open('youtube/oauth-client.json') as f:
    client = json.load(f)['installed']
params = {
    'response_type': 'code',
    'client_id': client['client_id'],
    'redirect_uri': 'http://localhost:8095/',
    'scope': 'https://www.googleapis.com/auth/youtube.upload',
    'access_type': 'offline',
    'prompt': 'consent',
}
print('https://accounts.google.com/o/oauth2/auth?' + urlencode(params))
"
```

Abre a URL, autoriza, copia a URL de callback que contém `code=...`. Depois troca por token:

```bash
cd C:/Users/marin/Documents/costuras-meditacoes
"C:/Users/marin/AppData/Local/Programs/Python/Python312/python.exe" -c "
import json, requests
with open('youtube/oauth-client.json') as f:
    client = json.load(f)['installed']
code = 'COLA_CODE_AQUI'
resp = requests.post('https://oauth2.googleapis.com/token', data={
    'code': code, 'client_id': client['client_id'], 'client_secret': client['client_secret'],
    'redirect_uri': 'http://localhost:8095/', 'grant_type': 'authorization_code',
}).json()
token = {
    'token': resp['access_token'],
    'refresh_token': resp['refresh_token'],
    'token_uri': 'https://oauth2.googleapis.com/token',
    'client_id': client['client_id'], 'client_secret': client['client_secret'],
    'scopes': ['https://www.googleapis.com/auth/youtube.upload'],
}
import os
os.makedirs('midas/state', exist_ok=True)
with open('midas/state/yt-token-orar_prosperar.json', 'w') as f:
    json.dump(token, f, indent=2)
print('OK token salvo')
"
```

Depois adicionar como secret:
```bash
YT_JSON=$(cat midas/state/yt-token-orar_prosperar.json | python -c "import json,sys;print(json.dumps(json.load(sys.stdin)))")
gh secret set YT_OAUTH_2 --body "$YT_JSON"
```

### Passo 4 — Bio e disclaimer

1. Copia bio do `midas/config/bios.md` (seção `@orar.prosperar`)
2. Gera disclaimer personalizado modificando `scripts/midas/generate-disclaimer-post.py`:
   - Troca `@pros.peridadedoreino` → `@orar.prosperar`
   - Roda: `python scripts/midas/generate-disclaimer-post.py`
3. Sobe foto pro Cloudinary + posta + fixa no Instagram

### Passo 5 — Conectar TikTok no Publer

- Publer Free permite 3 social accounts
- Conecta TikTok @orar.prosperar
- Gera batch via: `node scripts/midas/midas-publer-batch.js --count=15`
- Batch vai pra `midas/publer-batches/YYYY-MM-DD/` (usa arquivos `orar_prosperar_*.mp4`)

### Passo 6 — Publicar disclaimer + primeiro Reel manualmente

Use o mesmo comando inline que usamos pra @pros.peridadedoreino, trocando o TOKEN e IG_ID:

**Primeira publicação Reel:**

```bash
cd C:/Users/marin/Documents/costuras-meditacoes
CAPTION=$(node -e "const c=require('./midas/captions/corte_00016.json');console.log(c.orar_prosperar.caption_ig);")
node -r dotenv/config scripts/midas/midas-publish-ig.js \
  --account=orar_prosperar \
  --video=corte_00016.mp4 \
  --videoUrl="https://res.cloudinary.com/dixxvm1yt/video/upload/midas/corte_00016.mp4" \
  --caption="$CAPTION"
```

---

## 📢 AÇÕES COM THIAGO (Elite Flow)

Quando receber acesso à plataforma Elite Flow, checa:

1. **Regras Tráfego Pago** → lista oficial de critérios do domínio
2. **Biblioteca de 18k criativos** → baixar pra ampliar pool
3. **Links Úteis** → fornecedores de Fanpages/BMs se precisar comprar

**Mensagem pronta pra Thiago:**
```
Thiago, tudo bem?
Meu domínio registrado é: vidanovaprospera.com.br
Link MAC afiliado: https://payment.ticto.app/OA1B58ADA?pid=AFCAA6C80D
Pode montar a LP pra mim? Obrigada!
```

---

## 🧰 TROUBLESHOOTING

### Token IG expirou (60 dias)
Roda: `node scripts/midas/midas-refresh-tokens.js`
Se não renovar, regera no Graph API Explorer.

### Workflow não está rodando
Verifica em: https://github.com/MarinaVeauvy/costuras-meditacoes/actions
Se aparecer "paused by low activity" → dispara manualmente 1x pra reativar.

### Publicação IG falha
Causas comuns:
- Token expirado → renovar
- Vídeo muito longo (>90s) ou muito curto (<3s)
- Conta IG convertida de volta pra Personal → precisa voltar pra Business

### Publer Free diz "limit reached"
Free tier = 10 posts agendados. Espera publicar alguns ou deleta os mais distantes no tempo.

### YouTube OAuth expirado
Refresh token não expira, mas se parar de funcionar:
- Roda auth flow de novo (Passo 3 acima)

### Cron GitHub Actions pausado
GitHub pausa repos inativos >60 dias. Pra manter ativo:
- Faz 1 commit/mês
- OU ativa novamente em Settings → Actions

---

## 📊 COMO MONITORAR

### Ver publicações já feitas
```bash
cat midas/state/published-ig.json
cat midas/state/published-yt.json
```

### Logs do GitHub Actions
https://github.com/MarinaVeauvy/costuras-meditacoes/actions/workflows/midas-publish.yml

### Métricas TikTok / IG / YT
- TikTok: app ou Publer dashboard
- IG: Business Insights (na app)
- YT: studio.youtube.com → Analytics

### Conversões Ticto
- Painel Ticto → Relatórios → Vendas
- Busca por PID `AFCAA6C80D`

---

## 💰 CUSTOS ATUAIS

| Item | Valor |
|---|---|
| Elite Flow | R$597/mês |
| Domínio .com.br | ~R$40/ano (Hostinger) |
| Cloudinary Free | R$0 |
| Anthropic Claude Haiku | ~$5-10/mês (vai crescer com volume) |
| GitHub Actions | R$0 (Free tier) |
| Publer Free | R$0 |
| **Total recorrente** | **~R$627/mês** (R$597 + Anthropic) |

---

## 📁 ARQUIVOS CHAVE

| Arquivo | Pra que serve |
|---|---|
| `midas/config/accounts.json` | 3 contas + credenciais env vars |
| `midas/config/bios.md` | Bios prontas pra copy/paste |
| `midas/config/captions-templates.json` | Hooks + CTAs + hashtags |
| `midas/config/cortes-manifest.json` | 36 cortes hospedados Cloudinary |
| `midas/mentoria/resumo-regras.md` | Regras Elite Flow consolidadas |
| `midas/SETUP-META-DEVELOPER.md` | Guia detalhado setup Meta app |
| `midas/SETUP-TIKTOK-API.md` | Como aplicar TikTok API oficial |
| `midas/HANDS-OFF-GUIDE.md` | Operação automática explicada |
| `.env` | Credenciais locais (NÃO commitar) |
| `.github/workflows/midas-publish.yml` | Cron automático |

---

## ⏭️ ORDEM RECOMENDADA PRA CONTINUAR

Quando voltar:
1. **Verificar publicações** automáticas dos últimos dias (IG + YT estão saindo?)
2. **Ver Ticto** se teve click/venda
3. **Refill Publer** (adicionar mais 5-10 posts TikTok)
4. **Se LP do Thiago chegou:** atualizar bio IG pro domínio bridge
5. **Começar conta 2** (@orar.prosperar) — seguir passos acima
6. **Começar conta 3** (@liberdade.com.fe) — mesma coisa
7. **Aplicar TikTok API oficial** em paralelo (grátis, demora 2-4 sem)
