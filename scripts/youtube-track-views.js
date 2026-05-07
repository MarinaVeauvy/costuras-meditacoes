#!/usr/bin/env node
/**
 * YouTube Views Tracker — Snapshot semanal
 *
 * Faz scraping de views/duração dos vídeos no uploaded-index.json (factory)
 * e dos shorts midas (published-yt.json), salva snapshot timestamped pra
 * dashboard de métricas.
 *
 * Uso:
 *   node youtube-track-views.js [--include-midas]
 *
 * Output: youtube/views-snapshot.json (sobrescreve)
 *         youtube/views-history.json (append, histórico)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FACTORY_INDEX = path.join(ROOT, 'youtube', 'uploaded-index.json');
const MIDAS_YT = path.join(ROOT, 'midas', 'state', 'published-yt.json');
const SNAPSHOT_PATH = path.join(ROOT, 'youtube', 'views-snapshot.json');
const HISTORY_PATH = path.join(ROOT, 'youtube', 'views-history.json');

function loadJson(p, def = null) {
  if (!fs.existsSync(p)) return def;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function scrapeVideo(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await res.text();
    const views = html.match(/"viewCount":"(\d+)"/);
    const dur = html.match(/"approxDurationMs":"(\d+)"/);
    return {
      views: views ? parseInt(views[1]) : null,
      dur_s: dur ? Math.round(parseInt(dur[1]) / 1000) : null,
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function trackList(items, getVideoId, getMeta, label, throttleMs = 400) {
  const results = [];
  console.error(`📊 Tracking ${items.length} vídeos (${label})...`);
  for (const item of items) {
    const vid = getVideoId(item);
    if (!vid) { results.push({ ...getMeta(item), error: 'no video_id' }); continue; }
    const stats = await scrapeVideo(vid);
    results.push({ ...getMeta(item), video_id: vid, ...stats });
    await new Promise(r => setTimeout(r, throttleMs));
  }
  return results;
}

function summarize(videos, label) {
  const valid = videos.filter(v => typeof v.views === 'number');
  if (!valid.length) return { label, total: 0, avg: 0, median: 0, count: 0, zero_views: 0 };
  const sorted = valid.map(v => v.views).sort((a, b) => a - b);
  const total = sorted.reduce((s, v) => s + v, 0);
  return {
    label,
    count: valid.length,
    total_views: total,
    avg_views: +(total / valid.length).toFixed(1),
    median_views: sorted[Math.floor(sorted.length / 2)],
    zero_views: sorted.filter(v => v === 0).length,
    top5: [...valid].sort((a, b) => b.views - a.views).slice(0, 5).map(v => ({
      title: (v.title || v.video || '').slice(0, 60),
      views: v.views,
      dur_s: v.dur_s,
    })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const includeMidas = args.includes('--include-midas');

  const idx = loadJson(FACTORY_INDEX, []);
  const factoryStats = await trackList(
    idx,
    v => v.video_id,
    v => ({ slug: v.slug, title: v.title, source: v.source || 'unspecified', uploaded_at: v.uploaded_at }),
    'factory'
  );

  let midasStats = [];
  if (includeMidas) {
    const yt = loadJson(MIDAS_YT, { published: [] });
    const midasItems = (yt.published || []).filter(p => p.youtubeVideoId || (p.url && p.url.includes('youtu')));
    midasStats = await trackList(
      midasItems,
      p => p.youtubeVideoId || (p.url && (p.url.match(/[?&]v=([^&]+)/) || p.url.match(/youtu\.be\/([^?&]+)/) || [])[1]),
      p => ({ video: p.video, account: p.account, source: 'midas-shorts', uploaded_at: p.publishedAt }),
      'midas-shorts',
      300
    );
  }

  const snapshot = {
    snapshot_at: new Date().toISOString(),
    summary: {
      factory: summarize(factoryStats, 'factory'),
      midas: includeMidas ? summarize(midasStats, 'midas-shorts') : null,
      combined: summarize([...factoryStats, ...midasStats], 'combined'),
    },
    videos: { factory: factoryStats, midas: includeMidas ? midasStats : [] },
  };

  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
  console.error(`✅ Snapshot salvo: ${SNAPSHOT_PATH}`);

  // Append to history
  const hist = loadJson(HISTORY_PATH, { snapshots: [] });
  hist.snapshots = hist.snapshots || [];
  hist.snapshots.push({
    snapshot_at: snapshot.snapshot_at,
    factory: snapshot.summary.factory,
    midas: snapshot.summary.midas,
    combined: snapshot.summary.combined,
  });
  // Manter só últimos 52 snapshots (1 ano semanal)
  hist.snapshots = hist.snapshots.slice(-52);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(hist, null, 2));
  console.error(`📈 History append: ${hist.snapshots.length} snapshots`);

  // Print resumo
  console.error('\n=== RESUMO ===');
  ['factory', 'midas', 'combined'].forEach(k => {
    const s = snapshot.summary[k];
    if (s && s.count) {
      console.error(`${k.padEnd(10)} | ${s.count} vídeos | ${s.total_views} views | avg ${s.avg_views} | mediana ${s.median_views} | zero ${s.zero_views}`);
    }
  });
}

if (require.main === module) {
  main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
}
