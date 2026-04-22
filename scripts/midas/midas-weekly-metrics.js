#!/usr/bin/env node
/**
 * Midas — Relatório Semanal de Métricas
 *
 * Puxa dados do Upload-Post Analytics API + histórico de publicações,
 * formata em markdown, salva em midas/reports/weekly-YYYY-MM-DD.md.
 *
 * Métricas por conta (Instagram + YouTube):
 *   - Followers / subscribers
 *   - Reach / impressions (total + últimos 7 dias)
 *   - Engagement (likes + comments + shares + saves)
 *   - Views totais
 *   - Posts publicados semana atual
 *
 * Uso:
 *   UPLOAD_POST_API_KEY=xxx node scripts/midas/midas-weekly-metrics.js
 *
 * GitHub Actions: roda toda segunda 12:00 UTC (9h BRT).
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.upload-post.com/api';
const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const REPORTS_DIR = path.join(__dirname, '..', '..', 'midas', 'reports');

function last7DaysSum(timeseries) {
  if (!Array.isArray(timeseries)) return 0;
  const last7 = timeseries.slice(-7);
  return last7.reduce((sum, d) => sum + (d.value || 0), 0);
}

async function fetchAnalytics(apiKey, profileUsername, platforms = ['instagram', 'youtube']) {
  const qs = platforms.map(p => `platforms=${p}`).join('&');
  const url = `${API_BASE}/analytics/${profileUsername}?${qs}`;
  const r = await fetch(url, { headers: { Authorization: `Apikey ${apiKey}` } });
  if (!r.ok) {
    return { error: `${r.status} ${await r.text()}` };
  }
  return await r.json();
}

async function fetchHistory(apiKey, profileUsername) {
  const r = await fetch(`${API_BASE}/uploadposts/history?profile_username=${profileUsername}&limit=50`, {
    headers: { Authorization: `Apikey ${apiKey}` },
  });
  if (!r.ok) return { history: [] };
  return await r.json();
}

function formatMetric(v) {
  if (typeof v !== 'number') return '-';
  if (v === 0) return '0';
  if (v > 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v > 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

function formatRow(account, platform, data) {
  const d = data[platform] || {};
  const reach7 = last7DaysSum(d.reach_timeseries);
  const views7 = last7DaysSum(d.views_timeseries);
  return {
    account,
    platform,
    followers: formatMetric(d.followers),
    reach_total: formatMetric(d.reach),
    reach_7d: formatMetric(reach7),
    views_total: formatMetric(d.views),
    views_7d: formatMetric(views7),
    impressions: formatMetric(d.impressions),
    likes: formatMetric(d.likes),
    comments: formatMetric(d.comments),
    shares: formatMetric(d.shares),
    saves: formatMetric(d.saves),
    profile_views: formatMetric(d.profileViews),
    raw: d,
  };
}

function countPostsLast7Days(history) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return (history.history || []).filter(p => {
    const d = new Date(p.upload_timestamp);
    return d >= sevenDaysAgo && p.success;
  }).length;
}

async function main() {
  const apiKey = process.env.UPLOAD_POST_API_KEY;
  if (!apiKey) throw new Error('UPLOAD_POST_API_KEY ausente');

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const activeAccounts = config.accounts.filter(a => a.active && a.upload_post_username);

  const rows = [];
  const posts7d = {};

  for (const account of activeAccounts) {
    const platforms = account.upload_post_platforms || ['instagram', 'youtube'];
    const data = await fetchAnalytics(apiKey, account.upload_post_username, platforms);
    if (data.error) {
      console.error(`❌ ${account.id}: ${data.error}`);
      continue;
    }

    const history = await fetchHistory(apiKey, account.upload_post_username);
    posts7d[account.id] = countPostsLast7Days(history);

    for (const platform of platforms) {
      rows.push(formatRow(account.id, platform, data));
    }
  }

  const reportDate = new Date().toISOString().slice(0, 10);
  const reportWeek = `Semana ${new Date().toISOString().slice(0, 10)}`;

  let md = `# Relatório Semanal Midas — ${reportDate}\n\n`;
  md += `**Período:** últimos 7 dias (relatório gerado em ${new Date().toISOString()})\n\n`;
  md += `## 📊 Métricas por conta/plataforma\n\n`;
  md += `| Conta | Plataforma | Followers | Reach 7d | Views 7d | Likes | Comments | Shares | Saves | Profile views |\n`;
  md += `|-------|------------|-----------|----------|----------|-------|----------|--------|-------|---------------|\n`;
  for (const r of rows) {
    md += `| ${r.account} | ${r.platform} | ${r.followers} | ${r.reach_7d} | ${r.views_7d} | ${r.likes} | ${r.comments} | ${r.shares} | ${r.saves} | ${r.profile_views} |\n`;
  }

  md += `\n## 📤 Posts publicados (últimos 7 dias)\n\n`;
  for (const [account, count] of Object.entries(posts7d)) {
    md += `- **${account}:** ${count} posts\n`;
  }

  md += `\n## 🎯 Totais agregados\n\n`;
  const totalReach = rows.reduce((s, r) => s + (r.raw.reach || 0), 0);
  const totalViews = rows.reduce((s, r) => s + (r.raw.views || 0), 0);
  const totalLikes = rows.reduce((s, r) => s + (r.raw.likes || 0), 0);
  const totalComments = rows.reduce((s, r) => s + (r.raw.comments || 0), 0);
  const totalFollowers = rows.reduce((s, r) => s + (r.raw.followers || 0), 0);
  md += `- **Followers totais:** ${formatMetric(totalFollowers)}\n`;
  md += `- **Reach total (lifetime):** ${formatMetric(totalReach)}\n`;
  md += `- **Views totais (lifetime):** ${formatMetric(totalViews)}\n`;
  md += `- **Engagement total:** ${formatMetric(totalLikes + totalComments)} interações\n`;

  md += `\n## 🚦 Gatilhos de decisão\n\n`;
  if (totalFollowers >= 50) {
    md += `- ✅ **50+ followers totais** — pode subir fase ramp-up\n`;
  } else {
    md += `- ⏳ Aguardando 50+ followers totais (atual: ${formatMetric(totalFollowers)})\n`;
  }
  if (totalViews >= 500) {
    md += `- ✅ **500+ views** — tração orgânica começando\n`;
  } else {
    md += `- ⏳ Aguardando 500+ views (atual: ${formatMetric(totalViews)})\n`;
  }
  if ((totalLikes + totalComments) > 0) {
    md += `- ✅ Engagement positivo detectado\n`;
  } else {
    md += `- ⏳ Aguardando primeiro engagement (like/comment)\n`;
  }

  md += `\n## 🔗 Links das contas\n\n`;
  for (const a of activeAccounts) {
    md += `- **${a.id}:**\n`;
    md += `  - Instagram: https://instagram.com/${a.instagram_handle}\n`;
    if (a.youtube_channel_handle) md += `  - YouTube: https://youtube.com/${a.youtube_channel_handle}\n`;
    md += `  - Upload-Post profile: \`${a.upload_post_username}\`\n`;
  }

  md += `\n---\n*Relatório gerado automaticamente pelo midas-weekly-metrics.js*\n`;

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const outPath = path.join(REPORTS_DIR, `weekly-${reportDate}.md`);
  fs.writeFileSync(outPath, md);
  console.log(`✅ Relatório salvo: ${outPath}\n`);
  console.log(md);
}

main().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
