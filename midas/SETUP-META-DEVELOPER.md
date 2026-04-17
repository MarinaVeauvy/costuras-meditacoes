# Setup Meta Developer App — Midas Instagram Publisher

Passos pra obter os tokens do Instagram Graph API que o pipeline precisa.

**Tempo estimado:** 30-45 minutos.

## Pré-requisitos

Antes de começar:

- [ ] @pros.peridadedoreino é **conta Business ou Creator** (vá em IG → Configurações → Tipo de conta → Mudar)
- [ ] Criar @orar.prosperar e @liberdade.com.fe (se ainda não criou) — também **Business**
- [ ] Cada conta IG **linkada a uma Facebook Page** (obrigatório pra Graph API)
  - Pode usar a mesma Page pras 3 contas, ou 3 Pages separadas
  - Configurações IG → Conta conectada → Facebook

## 1. Criar Meta Developer Account

1. Acesse https://developers.facebook.com
2. Login com o Facebook pessoal que administra as Pages
3. Aceite termos de desenvolvedor

## 2. Criar App

1. https://developers.facebook.com/apps → **Create App**
2. Tipo: **Business**
3. Nome do app: `Midas Publisher`
4. Email: macmarina@gmail.com
5. Finalizar criação

## 3. Adicionar Produto "Instagram"

1. No painel do app → **Products** → **Add Product**
2. Adicione **Instagram** (o card que fala em "Instagram API with Instagram Login" OU "Instagram Graph API")
3. Escolha **Instagram Graph API** (o correto pra publishing)

## 4. Conectar Páginas e Contas IG

1. Menu lateral: **Instagram > Basic Display** (ou **API Setup**)
2. Clica em **Add or Remove Instagram Accounts**
3. Autorize cada conta IG linkada (3 contas: pros.peridadedoreino, orar.prosperar, liberdade.com.fe)
4. Autorize também as Facebook Pages correspondentes

## 5. Obter Access Tokens (PER-ACCOUNT)

Pra cada uma das 3 contas, você precisa gerar:

### 5.1 Page Access Token (Long-Lived)

1. Vá em https://developers.facebook.com/tools/explorer
2. Selecione seu app "Midas Publisher"
3. Em **User or Page**, selecione **Get Page Access Token**
4. Escolha a Page correspondente (ex: Page do @pros.peridadedoreino)
5. Marque scopes: `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`
6. **Generate Access Token** → autorize

Esse token dura 1-2 horas. Troque por long-lived (60 dias):

```bash
curl -i -X GET "https://graph.facebook.com/v21.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id={APP_ID}&\
client_secret={APP_SECRET}&\
fb_exchange_token={SHORT_LIVED_TOKEN}"
```

Substituir:
- `{APP_ID}` — está na sidebar do app em **Settings > Basic**
- `{APP_SECRET}` — mesma página, clica em "Show"
- `{SHORT_LIVED_TOKEN}` — token que você acabou de gerar

Copie o novo `access_token` retornado — esse é o **long-lived**.

### 5.2 Instagram Business Account ID

Com o long-lived token em mão:

```bash
curl -X GET "https://graph.facebook.com/v21.0/me/accounts?access_token={LONG_LIVED_TOKEN}"
```

Identifica a Page do IG → pega o `id` da Page.

Agora pega o IG Business Account ID:

```bash
curl -X GET "https://graph.facebook.com/v21.0/{PAGE_ID}?fields=instagram_business_account&access_token={LONG_LIVED_TOKEN}"
```

Resposta traz `instagram_business_account.id` — **esse é o `instagram_business_id`** que vai no `accounts.json`.

## 6. Preencher midas/config/accounts.json

Pra cada conta, atualize:

```json
{
  "id": "pros_peridade_do_reino",
  "instagram_business_id": "<ID_OBTIDO_NO_PASSO_5.2>",
  ...
}
```

## 7. Salvar Tokens como GitHub Secrets

No repo `costuras-meditacoes` → Settings → Secrets → Actions:

- `IG_TOKEN_1` — token long-lived da @pros.peridadedoreino
- `IG_TOKEN_2` — token long-lived da @orar.prosperar
- `IG_TOKEN_3` — token long-lived da @liberdade.com.fe

Também localmente no `.env`:

```bash
IG_TOKEN_1=EAAG...
IG_TOKEN_2=EAAG...
IG_TOKEN_3=EAAG...
```

## 8. Renovação de Token (Importante!)

Long-lived tokens duram **60 dias**. Precisa renovar antes de vencer.

Script de renovação automática: TODO (criar `scripts/midas/midas-refresh-tokens.js` que roda 1x/mês via GitHub Action).

## 9. Teste Smoke

Com tudo configurado, teste 1 post em conta de dev:

```bash
# 1. Sobe vídeo pro Cloudinary
node scripts/midas/midas-upload-cloudinary.js --video=corte_00001.mp4
# Output: URL

# 2. Publica
node scripts/midas/midas-publish-ig.js \
  --account=pros_peridade_do_reino \
  --video=corte_00001.mp4 \
  --videoUrl=<URL_CLOUDINARY> \
  --caption="Teste de publicação — ignore"
```

Se der ✅, o pipeline está operacional.

## Troubleshooting

- **"(#10) Application does not have permission..."** → falta autorizar `instagram_content_publish` na geração do token
- **"Invalid parameter"** → URL do vídeo não é pública/acessível. Teste abrindo direto no browser
- **"Media type REELS not supported"** → verifica se a conta é Business (não Personal)
- **Token expirado** → regenera via passo 5.1 + 5.2

## Recursos

- Docs oficiais: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
- Token debugger: https://developers.facebook.com/tools/debug/accesstoken/
