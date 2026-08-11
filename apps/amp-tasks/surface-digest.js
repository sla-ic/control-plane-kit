#!/usr/bin/env node
// surface-digest.js — the loop the human sees.
//
// Rolls up everything sitting in a proposed/ready state that Jordan should know
// about, plus worker-health flags, and posts ONE compact digest to #amp-brief
// (floor-whitelisted) [Amp, on behalf of Jordan]. The dashboard (:3737) stays the
// live surface; this is the push so nothing rots unseen in the DB.
//
// Idempotent per day: writes state.last_digest_date=YYYY-MM-DD after a successful
// post and refuses to post twice the same day unless --force. --dry prints only.
//
//   node surface-digest.js            # post if not already posted today
//   node surface-digest.js --dry      # print the digest, post nothing
//   node surface-digest.js --force    # post even if already posted today
//   node surface-digest.js --post     # explicit opt-in to the outward send
//
// Health inputs (Phase 3.2 heartbeat): per-worker latest fleet_runs status in the
// last 24h + last_email_sync_at staleness. A worker that is degraded/crashed or
// silent, or a sync older than SYNC_STALE_HOURS, becomes a loud line in the digest.

const fs   = require('fs');
const path = require('path');
const db   = require('./db');
const { slackCall, FloorViolation } = require('./mcp-dispatch');

const argv  = process.argv.slice(2);
const has   = (n) => argv.includes(n);
const DRY   = has('--dry');
const FORCE = has('--force');
// --alert-only: compute health flags ONLY and, if any, post a deduped alarm to
// #amp-alerts. This is the FAST-loop's job — it rides the 15-min cadence so a new
// outage (sync stale, worker silent/crashed) becomes loud within minutes instead
// of waiting for the once-a-day full digest. Dedup prevents 15-min spam.
const ALERT_ONLY = has('--alert-only');
// Default posture is to post; --dry overrides. --post kept for symmetry with other
// workers and for explicit cron wiring, but is not required.
const POST  = !DRY;

const CHANNEL = process.env.AMP_BRIEF_CHANNEL || 'C0AMPBRIEF'; // #amp-brief (floor-whitelisted)
const ALERTS_CHANNEL = process.env.AMP_ALERTS_CHANNEL || 'C0AMPALERT'; // #amp-alerts (floor-whitelisted)
const ALERT_REPEAT_HOURS = parseInt(process.env.AMP_ALERT_REPEAT_HOURS, 10) || 4; // re-alarm same problem after N h
const SYNC_STALE_HOURS = parseInt(process.env.AMP_SYNC_STALE_HOURS, 10) || 6;
const FAST_STALE_MIN = parseInt(process.env.AMP_FAST_STALE_MIN, 10) || 45; // fast loop should tick every ~15m
const AMPSTATE_STALE_HOURS = parseInt(process.env.AMP_AMPSTATE_STALE_HOURS, 10) || 48; // off-machine snapshot cadence
const HEARTBEAT_WORKERS = [
  'amp-email-triage',
  'amp-needs-you-resolver',
  'amp-inbox-sweep',
  'amp-adjudicate',
];

// ── routines.jsonl (conventions §2) ──────────────────────────────────────
const LOG = process.env.ROUTINES_LOG
  || path.join(process.env.HOME, '.claude/projects/-Users-you/memory/routines.jsonl');
const RUN_ID = `digest-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const WORKER = 'amp-surface-digest';
const HOST   = process.env.AMP_FLEET_HOST || 'local';
function emit(kind, extra = {}) {
  const evt = { ts: new Date().toISOString(), routine: WORKER, run_id: RUN_ID, source: 'amp-digest', kind, ...extra };
  try { fs.appendFileSync(LOG, JSON.stringify(evt) + '\n'); } catch (_) {}
}

const today = () => new Date().toISOString().slice(0, 10);
const getState = (k) => { try { return db.prepare(`SELECT value FROM state WHERE key=?`).get(k)?.value || null; } catch (_) { return null; } };
const setState = (k, v) => { try { db.prepare(`INSERT INTO state (key,value,updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`).run(k, v); } catch (_) {} };

// ── rollups ───────────────────────────────────────────────────────────────
function rollup() {
  const one = (sql, ...p) => { try { return db.prepare(sql).get(...p)?.n || 0; } catch (_) { return 0; } };

  const readyDrafts   = one(`SELECT COUNT(*) n FROM email_drafts WHERE status='ready'`);
  const blockedDrafts = one(`SELECT COUNT(*) n FROM email_drafts WHERE status='blocked'`);
  const proposedNeeds = one(`SELECT COUNT(*) n FROM needs_you_resolutions WHERE status='proposed'`);
  const stagedNeeds   = one(`SELECT COUNT(*) n FROM needs_you_resolutions WHERE status='proposed' AND automation_tier>=2`);
  const proposedSweep = one(`SELECT COUNT(*) n FROM email_sweep_actions WHERE status='proposed'`);

  // Top few ready drafts to name, so the digest is actionable not just numeric.
  let topDrafts = [];
  try {
    topDrafts = db.prepare(`
      SELECT d.id, d.thread_id, COALESCE(i.subject,'(no subject)') subject, COALESCE(i.sender,'?') sender
      FROM email_drafts d LEFT JOIN email_items i ON i.id=d.email_item_id
      WHERE d.status='ready' ORDER BY d.created_at DESC LIMIT 5`).all();
  } catch (_) {}

  let topNeeds = [];
  try {
    topNeeds = db.prepare(`
      SELECT r.email_item_id id, COALESCE(i.subject,'(no subject)') subject, r.ask, r.automation_tier tier
      FROM needs_you_resolutions r LEFT JOIN email_items i ON i.id=r.email_item_id
      WHERE r.status='proposed' ORDER BY r.automation_tier DESC, r.created_at DESC LIMIT 5`).all();
  } catch (_) {}

  // North-star value snapshot (audit: "no-value-measurement"), written by
  // value-report.js earlier in the same cycle. Null-safe: absent before first run.
  let value = null;
  try { value = db.prepare(`SELECT * FROM value_metrics ORDER BY id DESC LIMIT 1`).get() || null; } catch (_) {}

  // Calibration snapshot (ADR-0016 §2), written by calibrate.js earlier this cycle.
  // The grad-ready set is a PROPOSAL surface, not a state change. Null-safe.
  let calib = [];
  try {
    const latest = db.prepare(`SELECT MAX(computed_at) c FROM calibration`).get();
    if (latest && latest.c) calib = db.prepare(`SELECT * FROM calibration WHERE computed_at=? ORDER BY category, ground`).all(latest.c);
  } catch (_) {}

  return { readyDrafts, blockedDrafts, proposedNeeds, stagedNeeds, proposedSweep, topDrafts, topNeeds, value, calib };
}

// ── health / heartbeat (Phase 3.2) ─────────────────────────────────────────
function health() {
  const flags = [];

  // Sync staleness.
  const lastSync = getState('last_email_sync_at');
  if (!lastSync) {
    flags.push(`⚠️ email sync has *never* recorded a success`);
  } else {
    let ageH = null;
    try {
      const row = db.prepare(`SELECT (julianday('now') - julianday(?)) * 24 AS h`).get(lastSync);
      ageH = row?.h;
    } catch (_) {}
    if (ageH != null && ageH > SYNC_STALE_HOURS) {
      flags.push(`⚠️ email sync stale — last success ${ageH.toFixed(1)}h ago (>${SYNC_STALE_HOURS}h)`);
    }
  }

  // Fast-loop liveness: the fast loop stamps last_fast_tick_at every tick. If it
  // goes stale, the always-on path itself is down (a dead watchdog is worse than
  // a down worker — nothing else would notice).
  const lastFast = getState('last_fast_tick_at');
  if (!lastFast) {
    flags.push(`⚠️ fast loop has never ticked (com.example.amp-fast not loaded?)`);
  } else {
    let ageM = null;
    try {
      const row = db.prepare(`SELECT (julianday('now') - julianday(?)) * 24 * 60 AS m`).get(lastFast);
      ageM = row?.m;
    } catch (_) {}
    if (ageM != null && ageM > FAST_STALE_MIN) {
      flags.push(`🔴 fast loop stalled — last tick ${(ageM / 60).toFixed(1)}h ago (>${FAST_STALE_MIN}m)`);
    }
  }

  // Per-worker latest run in last 24h.
  for (const w of HEARTBEAT_WORKERS) {
    let last;
    try {
      last = db.prepare(`
        SELECT status, started_at, ended_at,
               (julianday('now') - julianday(started_at)) * 24 AS age_h
        FROM fleet_runs WHERE worker=? ORDER BY started_at DESC LIMIT 1`).get(w);
    } catch (_) { last = null; }

    if (!last) { flags.push(`⚠️ ${w}: no runs on record`); continue; }
    if (last.age_h != null && last.age_h > 24) {
      flags.push(`⚠️ ${w}: silent ${last.age_h.toFixed(0)}h (last run ${last.started_at})`);
    } else if (last.status === 'crashed' || last.status === 'degraded') {
      flags.push(`🔴 ${w}: last run ${last.status}`);
    } else if (last.status === 'running' && last.age_h != null && last.age_h > 2) {
      flags.push(`🟠 ${w}: stuck 'running' ${last.age_h.toFixed(1)}h (orphan?)`);
    }
  }

  // Off-machine durability (Phase 3.2): amp-state push heartbeat. Stamped only
  // after a confirmed push by snapshot-to-git.sh, so this stays truthful if the
  // push silently starts failing (network/auth/creds). Not flagged as never-run
  // on a fresh box until the first cycle-b has had a chance to push.
  const lastAmpState = getState('last_amp_state_push_at');
  if (lastAmpState) {
    let ageH = null;
    try {
      const row = db.prepare(`SELECT (julianday('now') - julianday(?)) * 24 AS h`).get(lastAmpState);
      ageH = row?.h;
    } catch (_) {}
    if (ageH != null && ageH > AMPSTATE_STALE_HOURS) {
      flags.push(`⚠️ off-machine snapshot stale — amp-state last pushed ${ageH.toFixed(1)}h ago (>${AMPSTATE_STALE_HOURS}h)`);
    }
  }

  return flags;
}

function buildText(r, flags) {
  const L = [];
  L.push(`[Amp, on behalf of Jordan] 📬 Email plane digest — ${today()}`);
  L.push('');

  const backlog = [];
  if (r.readyDrafts)   backlog.push(`✅ *${r.readyDrafts}* draft(s) ready to send`);
  if (r.proposedNeeds) backlog.push(`⚡ *${r.proposedNeeds}* Needs-You resolution(s) proposed${r.stagedNeeds ? ` (${r.stagedNeeds} draft-staged)` : ''}`);
  if (r.proposedSweep) backlog.push(`🧹 *${r.proposedSweep}* sweep action(s) awaiting approval`);
  if (r.blockedDrafts) backlog.push(`⛔ ${r.blockedDrafts} draft(s) blocked (missing evidence — by design)`);

  if (backlog.length) { L.push('*Awaiting your call:*'); backlog.forEach((b) => L.push(`• ${b}`)); }
  else L.push('*Awaiting your call:* nothing — inbox loop is clear. 🎉');

  if (r.topDrafts.length) {
    L.push('');
    L.push('*Ready drafts:*');
    r.topDrafts.forEach((d) => L.push(`• _${String(d.subject).slice(0, 70)}_ → ${String(d.sender).slice(0, 40)}`));
  }
  if (r.topNeeds.length) {
    L.push('');
    L.push('*Top Needs-You:*');
    r.topNeeds.forEach((n) => L.push(`• [t${n.tier}] _${String(n.subject).slice(0, 60)}_ — ${String(n.ask || '').slice(0, 80)}`));
  }

  if (r.value) {
    const v = r.value;
    const mins = Math.round((v.time_saved_seconds || 0) / 60);
    L.push('');
    L.push(`*Value (${v.window_days}d):*`);
    L.push(`• handled without you: *${v.auto_handled}/${v.auto_handled + v.escalated}* (${Math.round((v.auto_handled_fraction || 0) * 100)}%) · escalation-usefulness ${Math.round((v.escalation_usefulness || 0) * 100)}% · undo ${(+(v.undo_rate || 0) * 100).toFixed(1)}% · time-saved≈${mins}m`);
  }

  if (r.calib && r.calib.length) {
    const c0 = r.calib[0];
    const gradReady = r.calib.filter((c) => c.graduation_ready).map((c) => `${c.category}[${c.ground}]`);
    L.push('');
    L.push(`*Calibration (${c0.window_days}d, bar ${Math.round((c0.bar || 0) * 100)}%/n≥${c0.min_sample}):*`);
    r.calib.forEach((c) => {
      const p = c.precision == null ? '—' : `${Math.round(c.precision * 100)}%`;
      const flag = c.graduation_ready ? ' ✓' : '';
      L.push(`• ${c.category}[${c.ground}]: ${p} (${c.agree}/${c.sample})${flag}`);
    });
    if (gradReady.length) L.push(`• _grad-ready (awaiting your ratify): ${gradReady.join(', ')}_`);
  }

  if (flags.length) {
    L.push('');
    L.push('*Health:*');
    flags.forEach((f) => L.push(`• ${f}`));
  } else {
    L.push('');
    L.push('*Health:* all workers green, sync fresh. ✅');
  }

  L.push('');
  L.push('_Dashboard: http://localhost:3737 · reply here or act in Gmail._');
  return L.join('\n');
}

// ── alert-only: deduped health alarm to #amp-alerts (fast-loop cadence) ─────
async function runAlertOnly() {
  const flags = health();
  if (!flags.length) {
    console.log('health: all green — no alert');
    emit('routine_end', { status: 'ok', alert: 'none' });
    return;
  }

  // Dedup on the CONDITION IDENTITY, not the drifting magnitudes: strip ages
  // ("33.2h ago", "silent 28h", "45m"), timestamps, and bare numbers so a
  // persisting problem keeps a stable sig (suppressed for ALERT_REPEAT_HOURS)
  // while a genuinely new/cleared condition changes it and re-alerts.
  const normFlag = (f) => f
    .replace(/\d{4}-\d{2}-\d{2}[ T][\d:]+/g, '')      // timestamps
    .replace(/\d+(\.\d+)?\s*(h|m|min)\b/gi, '')        // durations/ages
    .replace(/\d+(\.\d+)?/g, '')                        // any remaining numbers
    .replace(/\s+/g, ' ').trim();
  const sig = flags.map(normFlag).sort().join(' | ');
  const lastSig = getState('last_alert_sig');
  const lastAt  = getState('last_alert_at');
  let staleAlarm = true;
  if (lastAt) {
    try {
      const row = db.prepare(`SELECT (julianday('now') - julianday(?)) * 24 AS h`).get(lastAt);
      staleAlarm = (row?.h ?? 99) >= ALERT_REPEAT_HOURS;
    } catch (_) {}
  }
  // Post only when the problem-set CHANGED or the same alarm has gone unacked
  // past ALERT_REPEAT_HOURS. Otherwise stay quiet (no 15-min spam).
  if (sig === lastSig && !staleAlarm && !FORCE) {
    console.log(`health: ${flags.length} flag(s), unchanged & within ${ALERT_REPEAT_HOURS}h — suppressing repeat`);
    emit('routine_end', { status: 'ok', alert: 'suppressed', flags: flags.length });
    return;
  }

  const text = `[Amp, on behalf of Jordan] 🚨 Email plane health alert — ${today()}\n\n${flags.map((f) => `• ${f}`).join('\n')}\n\n_Dashboard: http://localhost:3737_`;
  console.log(text);
  if (DRY) { emit('routine_end', { status: 'ok', dry: true, flags: flags.length }); return; }

  try {
    // mcpgw's slack send_message requires `channel` (not `channel_id`); the
    // floor validates either candidate field against the whitelist.
    const res = await slackCall('send_message', { channel: ALERTS_CHANNEL, text }, (g) => { if (!g.allow) console.log(`   floor: ${g.reason}`); });
    if (res && res.isError) throw new Error(String(res.text || 'slack isError').slice(0, 200));
    setState('last_alert_sig', sig);
    setState('last_alert_at', new Date().toISOString());
    console.log(`   🚨 posted health alert to #amp-alerts (${ALERTS_CHANNEL})`);
    emit('routine_end', { status: 'ok', alert: 'posted', flags: flags.length });
  } catch (e) {
    if (e instanceof FloorViolation) console.error(`   floor denied the alert: ${e.message}`);
    else console.error(`   alert post failed: ${e.message}`);
    emit('degraded', { where: 'slack_alert', error: String(e.message).slice(0, 200) });
    emit('routine_end', { status: 'degraded' });
    process.exitCode = 1;
  }
}

async function main() {
  emit('routine_start', { dry: DRY, force: FORCE, alert_only: ALERT_ONLY, host: HOST });
  console.log(`\n📬 Surface digest — ${today()}${DRY ? ' [DRY]' : ''}${FORCE ? ' [FORCE]' : ''}${ALERT_ONLY ? ' [ALERT-ONLY]' : ''}\n`);

  if (ALERT_ONLY) return runAlertOnly();

  const already = getState('last_digest_date');
  if (already === today() && !FORCE && !DRY) {
    console.log(`Already posted today (${already}); skipping (idempotent). Use --force to override.`);
    emit('routine_end', { status: 'ok', skipped: 'already_posted_today' });
    return;
  }

  const r = rollup();
  const flags = health();
  const text = buildText(r, flags);

  console.log(text);
  console.log('');

  if (DRY) { emit('routine_end', { status: 'ok', dry: true }); return; }
  if (!POST) { console.log('(--dry not set but POST disabled; nothing sent)'); emit('routine_end', { status: 'ok' }); return; }

  try {
    // mcpgw's slack send_message requires `channel` (not `channel_id`); the
    // floor validates either candidate field against the whitelist.
    const res = await slackCall('send_message', { channel: CHANNEL, text }, (g) => {
      if (!g.allow) console.log(`   floor: ${g.reason}`);
    });
    if (res && res.isError) throw new Error(String(res.text || 'slack isError').slice(0, 200));
    setState('last_digest_date', today());
    console.log(`   ✅ posted to #amp-brief (${CHANNEL})`);
    emit('routine_end', { status: 'ok', ready_drafts: r.readyDrafts, proposed_needs: r.proposedNeeds, proposed_sweep: r.proposedSweep, flags: flags.length });
  } catch (e) {
    if (e instanceof FloorViolation) console.error(`   floor denied the post: ${e.message}`);
    else console.error(`   post failed: ${e.message}`);
    emit('degraded', { where: 'slack_post', error: String(e.message).slice(0, 200) });
    emit('routine_end', { status: 'degraded' });
    process.exitCode = 1;
  }
}

main().catch((e) => { emit('degraded', { where: 'main', error: e.message }); emit('routine_end', { status: 'crashed' }); console.error(e); process.exit(1); });
