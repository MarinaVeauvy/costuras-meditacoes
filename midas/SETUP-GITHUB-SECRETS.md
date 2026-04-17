# Setup GitHub Secrets — Midas Publisher

Secrets obrigatórias pro workflow `midas-publish.yml` rodar em produção.

## Como adicionar

1. Vai no repo: https://github.com/MarinaVeauvy/costuras-meditacoes
2. **Settings** (aba topo) → **Secrets and variables** → **Actions**
3. Botão **"New repository secret"**
4. Nome + valor → **Add secret**

## Lista de Secrets a configurar

### 🔐 Obrigatórias agora (conta 1)

| Secret | Origem do valor |
|---|---|
| `ANTHROPIC_API_KEY` | Arquivo `.env` local — campo `ANTHROPIC_API_KEY` |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | Cloudinary dashboard |
| `IG_TOKEN_1` | Arquivo `.env` local — campo `IG_TOKEN_1` |
| `META_APP_ID` | Meta Dev dashboard (https://developers.facebook.com/apps) |
| `META_APP_SECRET` | Meta Dev dashboard → Settings → Basic |

**Valores exatos:** copia do arquivo `.env` local (não commitado — veja `.env.example` pra referência de estrutura).

### 🔐 Próximas etapas (quando ativar)

| Secret | Quando adicionar |
|---|---|
| `IG_TOKEN_2` | Após criar @orar.prosperar |
| `IG_TOKEN_3` | Após criar @liberdade.com.fe |
| `YT_OAUTH_1` | Após OAuth YouTube @ProsperidadedoReino-m8e |
| `YT_OAUTH_2` / `YT_OAUTH_3` | Quando criar canais YT das outras contas |

## Variables (não secrets — podem ser públicas)

| Variable | Uso |
|---|---|
| `KILL_SWITCH_MIDAS` | Vazio = rodando. Se preencher qualquer valor = desativa tudo |
| `MIDAS_DISABLED_ACCOUNTS` | Lista separada por vírgula de contas desativadas (ex: `liberdade_com_fe`) |

**Onde configurar Variables:** mesma página dos secrets, aba **"Variables"**.

## Verificar que funcionou

Depois de adicionar as 7 secrets obrigatórias, trigger manual:

```
Repo → Actions → Midas Auto-Publish → Run workflow → Dry run: true
```

Deve mostrar ✅ em todos os steps (exceto YouTube que vai skipar sem OAuth).

## Troubleshooting

- **"Context access might be invalid"** → secret com nome errado ou não adicionada
- **"Invalid token"** → token expirou (IG dura 60 dias — renovar via `midas-refresh-tokens.js`)
- **"Could not connect to Cloudinary"** → credenciais erradas
- **Workflow não dispara no cron** → verificar que o repo não tá inativo >60 dias (GitHub pausa cron de repos inativos)
