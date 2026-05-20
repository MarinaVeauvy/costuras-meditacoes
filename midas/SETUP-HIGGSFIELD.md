# Setup Higgsfield — hooks visuais cinematográficos

## Estratégia: hook 3s antes do corte Bruno

Cada reel ganha **3 segundos cinematográficos** de abertura (motion graphics
+ tema cristão/prosperidade) antes do corte original do Bruno Aguiar. Resolve
o problema de scroll-stop dos primeiros segundos sem perder o áudio
autoritário do MAC.

```
[3s hook AI cinematográfico] → [corte Bruno original 30-60s] = post final
```

## Pré-requisitos

1. **Conta Higgsfield + plano com créditos**
   - Cria em <https://higgsfield.ai>
   - Plano recomendado: **Plus $34/mês** = 1000 créditos/mês ≈ 114 vídeos
     Kling 3.0 OU ~250 vídeos curtos Cinema Studio 3s.
   - Cobre 2 posts/dia × 3 contas × 30 dias = 180 vídeos/mês com folga.

2. **CLI já instalado localmente** (feito — `higgsfield --version`)

3. **Autenticar (uma vez):**
   ```bash
   higgsfield auth login
   ```
   Abre o browser → faz login → cola token de volta no terminal.
   Token fica salvo em `~/.config/higgsfield/`.

4. **Verificar créditos:**
   ```bash
   higgsfield account
   ```

## Bug Windows (já resolvido)

O `npm install -g @higgsfield/cli` falhou em Windows por causa do `tar`
do Git Bash que interpreta paths `C:\...` como hostname. Workaround:

```bash
npm install -g --ignore-scripts @higgsfield/cli
cd ~/AppData/Roaming/npm/node_modules/@higgsfield/cli
# rodar install.js com tar nativo do Windows
node install.js  # vai falhar
/c/Windows/System32/tar.exe -xzf vendor/hf_*.tar.gz -C vendor/ hf.exe
```

No CI (GitHub Actions / Ubuntu) o problema não acontece.

## Como o pipeline usa

1. Script `midas-higgsfield-hook.js` lê caption JSON do corte → pega `hook` + `theme_category`
2. Constrói prompt cinematográfico (templates por theme abaixo)
3. Chama `higgsfield generate create cinema_studio_3_5 --prompt "..." --duration 3`
4. Espera com `higgsfield generate wait <job_id>`
5. Baixa o mp4 de 3s
6. ffmpeg concatena: hook 3s + corte original → `corte_NNNNN_with_intro.mp4`
7. Pipeline overlay-hook + upload-post seguem normal

## Templates de prompt por theme

- **financeiro:** "Cinematic 3s shot of golden coins falling into open hands, soft warm lighting, religious altar in background, hopeful atmosphere. Text overlay: '{hook}'. 4K vertical 9:16."
- **fe:** "Cinematic 3s shot of sun rays through cathedral window, peaceful golden glow, open Bible on wooden table. Text overlay: '{hook}'. 4K vertical 9:16."
- **familia:** "Cinematic 3s shot of mother and daughter holding hands in warm kitchen, golden hour light, home atmosphere. Text overlay: '{hook}'. 4K vertical 9:16."
- **proposito:** "Cinematic 3s shot of woman walking toward sunrise on mountain trail, determined, golden light, hopeful. Text overlay: '{hook}'. 4K vertical 9:16."

## Comandos úteis

```bash
# Listar modelos vídeo disponíveis
higgsfield model list --video

# Estimar custo de uma geração (sem gastar crédito)
higgsfield generate cost cinema_studio_3_5 --prompt "test"

# Ver job em andamento
higgsfield generate get <job_id>

# Listar últimas gerações
higgsfield generate list --limit 10

# Histórico de gastos
higgsfield account
```

## Dry-run no Midas (sem gastar créditos)

```bash
node scripts/midas/midas-higgsfield-hook.js --video=corte_00001.mp4 --dry-run
```

Imprime o prompt que seria enviado, sem chamar API. Útil pra ajustar
templates antes de gastar créditos.

## Custo real

Plano Plus = 1000 créditos/mês. Cinema Studio 3s ≈ 4 créditos.
180 vídeos × 4 = 720 créditos/mês. Sobra ~280 pra experimentação
manual ou outros tipos de post (story_post, versículo background).
