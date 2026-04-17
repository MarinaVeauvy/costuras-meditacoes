# Aplicação TikTok Content Posting API — Midas

Processo pra aplicar pra API oficial do TikTok que permite publicar vídeos via código.

**Tempo de aprovação:** 2-4 semanas (varia). Taxa de aprovação baixa pra casos afiliado — por isso aplicamos em paralelo, sem bloquear a operação.

## 1. Criar TikTok for Developers Account

1. Acesse https://developers.tiktok.com
2. Login com uma das contas TikTok (pode ser a principal @pros.peridadedoreino)
3. Completa perfil de desenvolvedor (nome, email, empresa — pode usar "Marina Veauvy")

## 2. Criar App

1. Painel → **Manage Apps** → **Create App**
2. Tipo: **Web/Desktop**
3. Nome: `Midas Publisher`
4. Descrição: "Social media automation tool for content scheduling across our brand accounts. Publishes short-form educational videos about online entrepreneurship."
5. Website: https://midasfrequencies.com (quando estiver no ar)
6. Categoria: Business Tools / Marketing

## 3. Adicionar Produtos

No app criado, em **Products**:

1. **Login Kit** — obrigatório
2. **Content Posting API** — o principal

Pra Content Posting API, vai abrir formulário de **Use Case Review**:

## 4. Preencher Use Case Review

Descrição do use case (copiar e adaptar):

```
Midas Publisher é uma ferramenta de agendamento e automação de conteúdo 
educacional para empreendedoras digitais. Publicamos vídeos curtos (Shorts/Reels) 
em até 3 contas de marca administradas pela mesma equipe, focadas em educação 
financeira e empreendedorismo online.

O conteúdo é criado por nossa equipe editorial e cortado a partir de aulas e 
entrevistas autorizadas. Todos os vídeos respeitam as diretrizes da comunidade 
TikTok e visam informar e engajar audiência orgânica sem spam.

Volume previsto: 2-3 publicações por conta por dia, totalizando 6-9 vídeos/dia 
distribuídos entre nossas 3 contas oficiais.

A API será usada exclusivamente para:
- Upload de vídeo pré-gravado
- Inserção de caption pré-aprovada
- Agendamento de horário ideal de publicação
```

Perguntas comuns:

- **Do you have TikTok accounts already running?** Sim — @pros.peridadedoreino (+ outras após criação)
- **How many accounts?** 3
- **Post volume per day?** 6-9 total (2-3 por conta)
- **Will you use this for ads or promotion?** Somente conteúdo orgânico

## 5. Aguardar Review

- TikTok envia email com status
- Aprovação: libera Content Posting API com scopes completos
- Rejeição: pode reaplicar com mais contexto, ou cair no plano B (Publer manual)

**Durante a espera, a operação já roda** via Publer Free (scheduling semi-manual).

## 6. Quando Aprovar

1. Gera OAuth refresh token pra cada conta TikTok:
   - Login Kit flow OAuth → consentimento → callback com code
   - Troca code por access_token + refresh_token
2. Salva refresh_tokens como GitHub Secrets:
   - `TT_REFRESH_1`, `TT_REFRESH_2`, `TT_REFRESH_3`
3. Atualiza `midas/config/accounts.json` com `tiktok_handle` preenchidos
4. Cria `scripts/midas/midas-publish-tiktok.js` usando a API

Nessa altura, a operação vira 100% automática e o Publer Free pode ser desligado.

## 7. Plano B (Se negarem)

**Opções:**
- **Repurpose.io Content Creator** ($25/mo) — app aprovado pela TikTok deles, zero setup
- **Publer Professional** ($12/mo) — tem API pra publishing, mas cobertura menor
- **Continuar Publer Free + refill quinzenal** (~15 min/semana)

Decidir com dados da operação (se está vendendo, $25/mo é trivial).

## Recursos

- Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
- Login Kit: https://developers.tiktok.com/doc/login-kit-web
- Status do app: painel do TikTok Developer
