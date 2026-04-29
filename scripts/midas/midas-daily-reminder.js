#!/usr/bin/env node
/**
 * Midas — Lembrete diário pra Marina (5min/conta protocolo Brendan Kane)
 *
 * Envia email via Resend com checklist exato do Daily 5-Minute Protocol.
 * Inclui status atual (posts publicados, followers, próximos slots).
 *
 * Uso: node midas-daily-reminder.js
 *
 * Requer: RESEND_API_KEY, MARINA_EMAIL (default macmarina@gmail.com)
 */

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');

const ACCOUNTS_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const STATE_IG = path.join(__dirname, '..', '..', 'midas', 'state', 'published-instagram.json');
const STATE_YT = path.join(__dirname, '..', '..', 'midas', 'state', 'published-yt.json');

const MARINA_EMAIL = process.env.MARINA_EMAIL || 'macmarina@gmail.com';
const FROM_EMAIL = 'Midas Bot <contato@marinaveauvy.com.br>';

function loadJson(p, def = null) {
  if (!fs.existsSync(p)) return def;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function countToday(stateData) {
  if (!stateData?.published) return 0;
  const today = new Date().toISOString().slice(0, 10);
  return stateData.published.filter(p => (p.publishedAt || '').slice(0, 10) === today).length;
}

function countByAccount(stateData) {
  const out = {};
  if (!stateData?.published) return out;
  for (const p of stateData.published) {
    out[p.account] = (out[p.account] || 0) + 1;
  }
  return out;
}

function buildHtml(ctx) {
  const { date, accounts, postsToday, igCounts, ytCounts, dayOfWeek } = ctx;

  const accountBlocks = accounts.map(acc => {
    const ig = igCounts[acc.id] || 0;
    const yt = ytCounts[acc.id] || 0;
    return `
      <div style="background:#f8f5ee;border-left:4px solid #d4a574;padding:18px 22px;margin:16px 0;border-radius:8px;">
        <h3 style="margin:0 0 12px 0;color:#3a2d1e;font-family:Georgia,serif;font-size:18px;">
          ${acc.id === 'pros_peridade_do_reino' ? '✝️ @pros.peridadedoreino' : '🙏 @orarprosperar'}
          <span style="font-weight:normal;font-size:13px;color:#8b6f3f;">
            (${ig} IG · ${yt} YT publicados até hoje)
          </span>
        </h3>
        <ol style="margin:0;padding-left:22px;color:#3a2d1e;line-height:1.7;font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;">
          <li><strong>30s scroll no feed</strong> — abre o app, scroll natural</li>
          <li><strong>Curte 5-7 posts</strong> de fé/família/maternidade (não cripto)</li>
          <li><strong>1 Story</strong> — print versículo YouVersion, café, livro aberto, ou repost de Reel próprio</li>
          <li><strong>2 comentários reais</strong> em posts de outras criadoras (5+ palavras, não emoji)</li>
          <li><strong>Responde 1-2 DMs</strong> mesmo que seja "Obrigada 🤍"</li>
        </ol>
      </div>
    `;
  }).join('');

  const isSunday = dayOfWeek === 0;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Midas — 10 min hoje</title>
</head>
<body style="margin:0;padding:0;background:#fefdfb;font-family:'Helvetica Neue',Arial,sans-serif;color:#3a2d1e;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">

    <h1 style="font-family:Georgia,serif;color:#3a2d1e;margin:0 0 8px 0;font-size:26px;">
      ${isSunday ? '🌿 Domingo — descansa hoje' : 'Bom dia, Marina'}
    </h1>
    <p style="color:#8b6f3f;margin:0 0 24px 0;font-size:14px;">
      ${date} · ${postsToday} ${postsToday === 1 ? 'post publicado' : 'posts publicados'} hoje pelo pipeline
    </p>

    ${isSunday
      ? `<div style="background:#fff;padding:28px;border-radius:10px;border:1px solid #e8dcc4;">
           <p style="margin:0;line-height:1.7;color:#3a2d1e;font-size:16px;">
             Domingo é dia de descansar — e isso <strong>melhora</strong> o algoritmo
             (variabilidade humana). Não abre o app pra trabalhar hoje.
             Volta na segunda. 🤍
           </p>
         </div>`
      : `
        <div style="background:#fff;padding:24px;border-radius:10px;border:1px solid #e8dcc4;margin-bottom:24px;">
          <p style="margin:0 0 12px 0;font-size:16px;line-height:1.6;">
            <strong>Total hoje: 10 min</strong> (5 min × 2 contas).
            Faz no celular. Nunca no desktop.
          </p>
          <p style="margin:0;font-size:14px;color:#8b6f3f;line-height:1.6;">
            Por que: contas zeradas só saem do 0 com sinal humano diário.
            Pipeline já roda sozinho — você só precisa "humanizar" a conta.
          </p>
        </div>

        ${accountBlocks}

        <div style="background:#fff;padding:18px 22px;border-radius:8px;border:1px solid #e8dcc4;margin-top:20px;">
          <p style="margin:0;font-size:13px;color:#8b6f3f;line-height:1.7;">
            <strong>Regras de ouro:</strong><br>
            • Sempre <strong>celular</strong>, nunca desktop (algoritmo lê)<br>
            • Comentários com <strong>5+ palavras</strong> (emoji solto não conta)<br>
            • Stories podem ser <strong>repost de outros</strong> — não precisa criar<br>
            • Pula <strong>perfis cripto</strong> — fica nas mães cristãs e família
          </p>
        </div>
      `
    }

    <p style="margin:32px 0 0 0;text-align:center;font-size:12px;color:#a8957a;">
      Lembrete automático Midas · Cancelar: responda este email com "PARA"
    </p>
  </div>
</body>
</html>`;
}

async function sendEmail({ html, subject }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY ausente');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [MARINA_EMAIL],
      subject,
      html,
    }),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(`Resend erro ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const accounts = loadJson(ACCOUNTS_PATH).accounts.filter(a => a.active);
  const ig = loadJson(STATE_IG, { published: [] });
  const yt = loadJson(STATE_YT, { published: [] });

  const igCounts = countByAccount(ig);
  const ytCounts = countByAccount(yt);
  const postsToday = countToday(ig) + countToday(yt);

  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=domingo
  const date = now.toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const html = buildHtml({ date, accounts, postsToday, igCounts, ytCounts, dayOfWeek });

  const subject = dayOfWeek === 0
    ? '🌿 Domingo — descansa hoje'
    : `🤍 Midas — 10 min hoje (${postsToday} ${postsToday === 1 ? 'post' : 'posts'} já publicados)`;

  console.error(`📧 Enviando lembrete pra ${MARINA_EMAIL}...`);
  const result = await sendEmail({ html, subject });
  console.error(`✅ Email id=${result.id}`);
}

if (require.main === module) {
  main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
}
