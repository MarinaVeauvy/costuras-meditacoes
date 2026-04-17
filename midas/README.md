# Midas — Elite Flow Affiliate Pipeline

Pipeline de automação pra programa afiliado MAC Bruno Aguiar 2.0 (Ticto).

## Arquitetura

```
C:/Users/marin/midas-cortes/Cortes Prontos/*.mp4  (50 cortes baixados do Drive)
              ↓
        midas-pick-next.js  (seleciona corte + conta via round-robin)
              ↓
        midas-generate-captions.js  (Claude Haiku gera 3 variações)
              ↓
        midas-upload-cloudinary.js  (hospeda vídeo público)
              ↓
        ┌─────────────────────────────────────┐
        │                                     │
   midas-publish-ig.js              midas-publish-yt-shorts.js
   (Instagram Graph API)            (YouTube Data API v3)
   FULL AUTO                        FULL AUTO
        │                                     │
        └──────────── GitHub Actions ────────┘
                      (2x/dia, 13h e 22h UTC)

   midas-publer-batch.js  (semanal, manual)
        ↓
   Você faz upload no Publer web (TikTok)
        ↓
   Publer publica nas 3 contas TikTok nos próximos 10-15 dias
```

## Estrutura do projeto

```
midas/
├── config/
│   ├── accounts.json          # 3 contas + scoped tokens env
│   └── captions-templates.json # Hooks + CTAs + hashtags
├── captions/                   # Captions geradas (cache)
│   └── corte_XXXXX.json
├── state/                      # Estado de publicação
│   ├── published-ig.json
│   ├── published-yt.json
│   └── published-tiktok.json
├── publer-batches/             # Pastas semanais pra upload Publer
│   └── YYYY-MM-DD/
│       ├── publer-import.csv
│       ├── captions.txt
│       └── *.mp4 (15 cortes × 3 contas = 45 arquivos)
├── SETUP-META-DEVELOPER.md     # Guia tokens Graph API
├── SETUP-TIKTOK-API.md         # Guia aplicação API oficial
└── README.md                   # Este arquivo

scripts/midas/
├── midas-pick-next.js          # Round-robin picker
├── midas-generate-captions.js  # Claude Haiku → 3 captions
├── midas-upload-cloudinary.js  # Sobe vídeo pra URL pública
├── midas-publish-ig.js         # Instagram Reels publisher
├── midas-publish-yt-shorts.js  # YouTube Shorts publisher
└── midas-publer-batch.js       # Gera pacote semanal pra Publer

.github/workflows/
└── midas-publish.yml           # Cron 2x/dia (IG + YT)
```

## Setup Inicial

### 1. Pré-requisitos manuais

- [ ] Seguir `SETUP-META-DEVELOPER.md` → obter IG_TOKEN_1/2/3 + instagram_business_id
- [ ] Criar conta Cloudinary free → CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET
- [ ] Aplicar pra YouTube Data API v3 em cada canal → YT_OAUTH_1/2/3 (JSON tokens)
- [ ] Aplicar pra TikTok Content Posting API (paralelo, 2-4 sem) → `SETUP-TIKTOK-API.md`
- [ ] Criar conta Publer Free + conectar as 3 contas TikTok
- [ ] Cortes baixados em `C:/Users/marin/midas-cortes/Cortes Prontos/`

### 2. Variáveis de ambiente

Local (`.env`):
```
ANTHROPIC_API_KEY=sk-ant-...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
IG_TOKEN_1=EAAG...
IG_TOKEN_2=EAAG...
IG_TOKEN_3=EAAG...
YT_OAUTH_1={"token":"...","refresh_token":"..."}
YT_OAUTH_2=...
YT_OAUTH_3=...
MIDAS_CORTES_DIR=C:/Users/marin/midas-cortes/Cortes Prontos
```

GitHub Secrets (mesmo set, prefixo igual).

### 3. Preencher `config/accounts.json`

Atualizar campo `instagram_business_id` de cada conta com o valor obtido no passo 5.2 do SETUP-META.

Depois mudar `"active": true` quando estiver tudo OK.

## Uso

### Publish único (teste local)

```bash
node scripts/midas/midas-pick-next.js --account=pros_peridade_do_reino
# Output: { "video": "corte_00001.mp4", "account": "pros_peridade_do_reino" }

node scripts/midas/midas-generate-captions.js --video=corte_00001.mp4

node scripts/midas/midas-upload-cloudinary.js --video=corte_00001.mp4
# Output: URL

node scripts/midas/midas-publish-ig.js \
  --account=pros_peridade_do_reino \
  --video=corte_00001.mp4 \
  --videoUrl=<URL_CLOUDINARY> \
  --caption="$(jq -r '.pros_peridade_do_reino.caption_ig' midas/captions/corte_00001.json)"
```

### Batch Publer (semanal — TikTok)

```bash
node scripts/midas/midas-publer-batch.js --count=15
# Gera midas/publer-batches/YYYY-MM-DD/
#   - 45 arquivos mp4 (15 cortes × 3 contas)
#   - publer-import.csv
#   - captions.txt

# Depois no Publer web: Library → Bulk Upload → solta os mp4 + cola captions
```

### GitHub Actions (auto)

Roda sozinho 2x/dia. Pra trigger manual:

```bash
gh workflow run midas-publish.yml
# ou com override
gh workflow run midas-publish.yml -f video=corte_00005.mp4 -f account=liberdade_com_fe
```

## Status Operacional

| Componente | Status |
|---|---|
| Cortes baixados | 35/50 (Drive rate-limited os últimos 15) |
| Scripts | ✅ Todos criados |
| Config | ⏳ `instagram_business_id` precisa preencher |
| Tokens IG | ⏳ Seguir SETUP-META-DEVELOPER.md |
| Cloudinary | ⏳ Criar conta + obter credenciais |
| YouTube OAuth | ⏳ 3 contas precisam OAuth flow |
| TikTok API | ⏳ Aplicar pra Content Posting API |
| Publer Free | ⏳ Criar conta + conectar TikToks |
| GitHub Action | ✅ Criada, ativa quando secrets tiverem |

## Próximos passos sugeridos

1. **Esta semana:** Criar contas (orar.prosperar + liberdade.com.fe) + Meta Developer app
2. **Próxima semana:** OAuth flows (IG, YT) + aplicar TikTok API
3. **Semana 3:** Primeiro batch Publer + smoke test IG/YT
4. **Semana 4+:** Operação rodando, monitorar métricas Ticto

## Troubleshooting

Ver seções específicas em:
- `SETUP-META-DEVELOPER.md` (IG Graph API)
- `SETUP-TIKTOK-API.md` (TikTok Content Posting)
