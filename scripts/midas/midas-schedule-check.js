#!/usr/bin/env node
/**
 * Midas Schedule Gatekeeper
 *
 * Decide se deve publicar AGORA com base em:
 * - Dias desde publishing_start_date
 * - Slot atual em UTC (hora/min do momento)
 *
 * Output: JSON com { should_publish, week_label, days_since_start, current_slot }
 * Exit code: 0 = publica, 1 = não publica
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'midas', 'config', 'accounts.json');
const STATE_IG = path.join(__dirname, '..', '..', 'midas', 'state', 'published-instagram.json');

function daysBetween(start, end) {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function matchSlot(nowUtc, slotsUtc, toleranceMin = 180) {
  const hh = nowUtc.getUTCHours();
  const mm = nowUtc.getUTCMinutes();
  const nowMin = hh * 60 + mm;

  for (const slot of slotsUtc) {
    const [sh, sm] = slot.split(':').map(Number);
    const slotMin = sh * 60 + sm;
    if (Math.abs(nowMin - slotMin) <= toleranceMin) {
      return slot;
    }
  }
  return null;
}

function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const startDate = new Date(config.publishing_start_date + 'T00:00:00Z');
  const now = new Date();
  const daysSince = daysBetween(startDate, now) + 1;

  let activeWeek = null;
  for (const [key, w] of Object.entries(config.ramp_up_schedule)) {
    if (daysSince >= w.days[0] && daysSince <= w.days[1]) {
      activeWeek = { key, ...w };
      break;
    }
  }

  if (!activeWeek) {
    console.log(JSON.stringify({ should_publish: false, reason: 'no_active_week', days_since_start: daysSince }));
    process.exit(1);
  }

  const currentSlot = matchSlot(now, activeWeek.slots_utc);

  let publishedToday = 0;
  if (fs.existsSync(STATE_IG)) {
    const todayUtc = now.toISOString().slice(0, 10);
    const ig = JSON.parse(fs.readFileSync(STATE_IG, 'utf8'));
    publishedToday = (ig.published || []).filter(p => (p.publishedAt || '').startsWith(todayUtc)).length;
  }
  const quota = activeWeek.slots_utc.length;
  const quotaReached = publishedToday >= quota;
  const shouldPublish = !!currentSlot && !quotaReached;

  const result = {
    should_publish: shouldPublish,
    week_key: activeWeek.key,
    week_label: activeWeek.label,
    days_since_start: daysSince,
    current_slot: currentSlot,
    available_slots: activeWeek.slots_utc,
    published_today: publishedToday,
    daily_quota: quota,
    quota_reached: quotaReached,
    now_utc: now.toISOString(),
  };

  console.log(JSON.stringify(result));
  process.exit(shouldPublish ? 0 : 1);
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('ERRO:', e.message); process.exit(2); }
}
