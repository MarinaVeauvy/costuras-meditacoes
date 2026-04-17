# Midas — Operação Hands-Off

Guia pra deixar o pipeline rodando 100% sozinho depois do setup inicial.

## Fluxo operacional (depois de tudo configurado)

```
Toda segunda-feira 08:17 BRT
   ↓
Factory baixa 3 vídeos novos do canal do Bruno
   ↓
Whisper transcreve + Claude identifica 5 momentos virais por vídeo
   ↓
ffmpeg corta 15 clips novos → midas-cortes/
   ↓
─────────────────────────────────────────────
Diariamente 4x (08:17, 12:43, 16:29, 20:51 BRT)
   ↓
Pipeline pega próximo corte + próxima conta (round-robin)
   ↓
Gera captions (Claude) → Upload Cloudinary → Publica IG + YT
   ↓
4 posts/dia × 2 plataformas × 3 contas = 24 posts/dia
───────────────────────────────────────────────
Semanal (você)
   ↓
Gera batch Publer → faz bulk upload web (TikTok) — 15 min
```

## Setup inicial (única intervenção manual — ~2-3h)

### Passo 1: Criar contas sociais (30 min)
- [ ] @orar.prosperar (Instagram Business)
- [ ] @liberdade.com.fe (Instagram Business)
- [ ] Canal YouTube pra cada conta (3 canais)
- [ ] TikTok pra cada conta (3 contas)

### Passo 2: Infra técnica (60 min)
- [ ] Cloudinary Free → CLOUDINARY_* secrets
- [ ] Seguir `SETUP-META-DEVELOPER.md` → IG_TOKEN_1/2/3 + `instagram_business_id`
- [ ] OAuth YouTube pros 3 canais → YT_OAUTH_1/2/3
- [ ] Aplicar TikTok Content Posting API (aprovação 2-4 sem)
- [ ] Conta Publer Free + conectar 3 TikToks

### Passo 3: Configuração do repo (15 min)
- [ ] Preencher `midas/config/accounts.json` com `instagram_business_id` reais
- [ ] Marcar `"active": true` nas 3 contas
- [ ] Registrar todas as secrets no GitHub Actions:
  - ANTHROPIC_API_KEY
  - CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
  - IG_TOKEN_1, IG_TOKEN_2, IG_TOKEN_3
  - YT_OAUTH_1, YT_OAUTH_2, YT_OAUTH_3
  - META_APP_ID, META_APP_SECRET

### Passo 4: Smoke test (15 min)
- [ ] Trigger manual: `gh workflow run midas-publish.yml -f dry_run=true`
- [ ] Verifica logs — captions geradas sem palavras proibidas?
- [ ] Trigger real: `gh workflow run midas-publish.yml`
- [ ] Confere se posts apareceram nas 3 plataformas

### Passo 5: Publer (15 min)
- [ ] Rodar localmente: `node scripts/midas/midas-publer-batch.js --count=15`
- [ ] Upload 45 mp4 no Publer web → bulk scheduler
- [ ] Cola captions do `captions.txt`
- [ ] Repete a cada 2-3 semanas

## Operação recorrente

### Automático (zero trabalho seu)
- ✅ Publicação IG + YT 4x/dia
- ✅ Geração de cortes novos semanal (segundas)
- ✅ Renovação de tokens IG (crontab mensal — criar workflow adicional se quiser)

### Manual (semanal ~15 min)
- ⏳ Gerar novo batch Publer + upload no web

### Manual (esporádico)
- ⏳ Responder DMs/comentários nas contas (recomendado pra não parecer bot)
- ⏳ Refresh de tokens IG (vencem a cada 60 dias)
- ⏳ Monitorar Ticto pra ver conversões

## Kill switches

### Desativar TUDO (emergência)
No repo GitHub → Settings → Variables → Actions:
```
KILL_SWITCH_MIDAS=1
```
Proximas execuções abortam imediatamente. Desativa sem deletar nada.

### Desativar uma conta específica
```
MIDAS_DISABLED_ACCOUNTS=liberdade_com_fe,orar_prosperar
```
(Lista separada por vírgula)

### Pausar posts sem desativar
Mudar `active: false` no `accounts.json` e commitar.

## Monitoramento mínimo

### Dashboard rápido (sugestão)
Criar endpoint simples em `api/midas/stats.js` no Vercel que lê:
- `midas/state/published-ig.json`
- `midas/state/published-yt.json`
- Count por conta nos últimos 7/30 dias
- Taxa de falha de publicação

(Não crítico — posso implementar depois se você quiser)

### Sinais de alerta
Investigar se:
- Workflow falha >50% em uma conta (possível ban)
- Publicação IG retornar "Invalid token" (renovar)
- Nenhum corte novo sendo gerado (quota API? canal privado?)
- Conversão Ticto cai a zero (problema no link?)

## Custos operacionais

| Item | Custo/mês |
|---|---|
| Anthropic Claude Haiku (captions + momentos) | ~$5-10 (~300 chamadas/mês) |
| Cloudinary Free | $0 (até 25GB) |
| GitHub Actions | $0 (Free tier — pode furar se >2000min) |
| Publer Free | $0 |
| **Total** | **~$5-10/mês** |

Se GitHub Actions estourar quota, migra workflows pra Vercel Cron (também grátis).

## Escalabilidade futura

**Quando fizer sentido investir:**

- **+Repurpose.io ($25/mo):** quando TikTok manual começar a virar gargalo E a operação estiver vendendo
- **+Postiz self-host:** quando passar de 10 contas
- **+TikTok API oficial (se aprovada):** zera trabalho manual Publer
- **+Cloudflare R2 ($0.015/GB):** se Cloudinary não bastar

## Reset completo (raro)

Se quiser zerar tudo:
```bash
rm -rf midas/state/
rm -rf midas/captions/
rm -rf midas/publer-batches/
# cortes NÃO são deletados — são recurso reutilizável
```

Comita e a operação volta do zero com as mesmas contas/tokens.
