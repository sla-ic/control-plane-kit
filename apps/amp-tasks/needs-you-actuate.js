#!/usr/bin/env node
/*
 * needs-you-actuate.js — the missing rung on the engine's own automation ladder
 * (0 surface → 1 decomposed → 2 draft-staged → 3 one-click-ready).
 *
 * needs-you-resolver.js stops at tier 1: it decomposes each ⚡Needs You email into
 * ask / decision / next_steps / draft_action and adversarially verifies it — then
 * the row sits at status='proposed' forever. The verified reply never becomes a
 * real Gmail draft, and the AUTOMATABLE next_steps (check Jordan's calendar for a
 * meeting-move, pull thread/doc context) are never executed — the draft ships with
 * [INSERT ...] holes. This stage closes that gap:
 *
 *   For each resolution with verdict='confirmed', status='proposed', a draft_action:
 *     1. Detect unfilled holes ([INSERT...], [PRINCIPAL...], [TODO...]).
 *     2. Do the automatable legwork. Scheduling asks → read Jordan's calendar
 *        (gcalCall list_events, READ-only, floor-gated) and compute REAL free
 *        business-hour slots deterministically (never invented — the verify plane
 *        blocks fabricated availability, so slots must be grounded in real events).
 *     3. One claude() completion pass: fill holes using ONLY the real slots /
 *        already-gathered context. Anything needing Jordan's judgment stays as a
 *        single clearly-marked [NEEDS PRINCIPAL: ...] so the draft is still finishable.
 *     4. Stage the completed reply as a real Gmail draft (create_draft — floor
 *        ALLOWED, reversible, NEVER sends), link it in email_drafts, advance the
 *        resolution to status='ready'.
 *
 * HARD FLOOR: reads + create_draft only. No send/forward/trash/delete. Every MCP
 * call goes through mcp-dispatch.checkFloor. Without --live it computes + prints
 * and writes NOTHING (no draft, no DB mutation).
 *
 * USAGE
 *   node needs-you-actuate.js --dry            # compute + print, mutate nothing
 *   node needs-you-actuate.js --live           # stage real Gmail drafts
 *   node needs-you-actuate.js --live --limit 5
 *   node needs-you-actuate.js --live --id 174  # single resolution by email_item_id
 */
const db = require('./db');
const { claude, parseJSON } = require('./llm');
const { gmailCall, gcalCall, FloorViolation } = require('./mcp-dispatch');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);
const LIVE = has('--live');
const DRY = has('--dry') || !LIVE;              // default-safe: dry unless --live
const LIMIT = parseInt(arg('--limit', '10'), 10);
const MODEL = arg('--model', 'sonnet');
const ITEM_ID = arg('--id', null) != null ? parseInt(arg('--id', '0'), 10) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HOLE_RE = /\[(?:INSERT|PRINCIPAL|TODO|OPTION|CHOOSE|PICK|ADD|FILL|TBD|X{2,})\b[^\]]*\]/i;
const SCHED_RE = /\b(reschedul|re-schedul|move (?:the|our|this|it|that|my)|different time|another time|new time|find (?:a |another )?(?:time|slot)|what times|when (?:are you|works|would)|availab|free (?:to|for|on|at)|propose (?:a |some )?(?:time|slot)|shift the|push (?:the|our|this) (?:meeting|call|invite))\b/i;

// ── deterministic free-slot finder ─────────────────────────────────────────
// July → PDT (UTC-7). Business hours 09:00–17:00 PT, Mon–Fri, next 7 days.
// Only real Busy timed events subtract availability; all-day / workingLocation /
// status='Free' are ignored. Returns up to `want` concrete 60-min slots.
const PT_OFFSET_MS = 7 * 3600 * 1000;
function ptParts(d) { const p = new Date(d.getTime() - PT_OFFSET_MS); return { y: p.getUTCFullYear(), mo: p.getUTCMonth(), da: p.getUTCDate(), h: p.getUTCHours(), dow: p.getUTCDay(), t: d.getTime() }; }
function ptDate(y, mo, da, h, mi = 0) { return new Date(Date.UTC(y, mo, da, h, mi) + PT_OFFSET_MS); }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtSlot(startMs) { const p = ptParts(new Date(startMs)); const h12 = ((p.h + 11) % 12) + 1; const ap = p.h < 12 ? 'am' : 'pm'; const e12 = ((p.h + 1 + 11) % 12) + 1; const eap = (p.h + 1) < 12 ? 'am' : 'pm'; return `${DOW[p.dow]} ${MON[p.mo]} ${p.da}, ${h12}:00${ap}–${e12}:00${eap} PT`; }

function busyRanges(events) {
  const out = [];
  for (const e of events || []) {
    const st = e.start, en = e.end;
    if (!st || !en) continue;
    if (String(e.status).toLowerCase() === 'free') continue;      // free/OOO working-location
    if (e.eventType && e.eventType !== 'default') continue;       // workingLocation/focusTime markers
    if (!/\d\d:\d\d/.test(String(st))) continue;                  // all-day (date only) → not a busy block
    const s = new Date(String(st).replace(' ', 'T')); const en2 = new Date(String(en).replace(' ', 'T'));
    if (isNaN(s) || isNaN(en2)) continue;
    out.push([s.getTime(), en2.getTime()]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}
function freeSlots(events, want = 3) {
  const busy = busyRanges(events);
  const now = new Date();
  const slots = [];
  for (let day = 1; day <= 7 && slots.length < want; day++) {
    const probe = ptParts(new Date(now.getTime() + day * 86400000));
    if (probe.dow === 0 || probe.dow === 6) continue;             // weekends
    for (let h = 9; h <= 16 && slots.length < want; h++) {
      const s = ptDate(probe.y, probe.mo, probe.da, h).getTime();
      const e = s + 3600000;
      if (s < now.getTime()) continue;
      const clash = busy.some(([bs, be]) => s < be && e > bs);
      if (!clash) slots.push(s);
    }
  }
  return slots.map(fmtSlot);
}

// ── completion pass ────────────────────────────────────────────────────────
const COMPLETE_SYSTEM = `You are Amp, Jordan Rivera's email actuation layer. You are given a DRAFT reply Jordan's triage engine already wrote and verified, plus REAL grounded facts (free calendar slots and/or thread context). Your ONLY job: fill the [INSERT.../PRINCIPAL.../TODO...] holes using ONLY the provided real facts.

RULES:
- NEVER invent facts, availability, opinions, commitments, or numbers. Use only what is provided.
- If a hole asks for Jordan's judgment/opinion you cannot ground in the provided facts, leave EXACTLY one marker: [NEEDS PRINCIPAL: <what he must decide>]. Do not guess.
- If free slots are provided and the draft needs times, insert 2–3 of them verbatim.
- Keep Jordan's voice and structure. Do not add new asks. Keep it tight.
- Return STRICT JSON: {"body": "<completed reply>", "filled": true|false, "needs_principal": "<null or the one thing still needed>"}`;

function buildCompleteMsg(r, slots, ctxExcerpt) {
  return `ASK OF PRINCIPAL: ${r.ask || '(n/a)'}
DECISION: ${r.decision || '(n/a)'}

DRAFT (fill its holes):
"""
${r.draft_action}
"""

REAL FREE SLOTS (Jordan's actual calendar, grounded — use these for any time holes):
${slots.length ? slots.map((s) => '- ' + s).join('\n') : '(none fetched / not a scheduling ask)'}

THREAD/DOC CONTEXT (already gathered, grounded):
${ctxExcerpt || '(none)'}

Fill the holes per the rules. Return the JSON.`;
}

// ── audit ──────────────────────────────────────────────────────────────────
const RUN_ID = `nya-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}-${process.pid}`;
function runStart() { try { db.prepare(`INSERT INTO fleet_runs (run_id, worker, host, model, status) VALUES (?,?,?,?,'running')`).run(RUN_ID, 'amp-needs-you-actuate', require('os').hostname(), MODEL); } catch (_) {} }
function runEnd(c) { try { db.prepare(`UPDATE fleet_runs SET status=?, considered=?, staged=?, errors=?, ended_at=datetime('now') WHERE run_id=?`).run(c.status, c.considered, c.staged, c.errors, RUN_ID); } catch (_) {} }

function loadRows() {
  const base = `SELECT r.*, i.thread_id AS t_thread, i.subject AS t_subject, i.sender AS t_sender, i.sender_email AS t_from
                FROM needs_you_resolutions r JOIN email_items i ON i.id = r.email_item_id
                WHERE r.verdict='confirmed' AND r.status='proposed'
                  AND r.draft_action IS NOT NULL AND length(r.draft_action) > 20`;
  if (ITEM_ID != null) return db.prepare(base + ' AND r.email_item_id = ?').all(ITEM_ID);
  return db.prepare(base + ' ORDER BY r.automation_tier DESC, r.confidence DESC LIMIT ?').all(LIMIT);
}

function ctxExcerpt(r) {
  try { const c = JSON.parse(r.context || '[]'); return c.slice(0, 4).map((x) => `[${x.system}${x.ref ? ' ' + x.ref : ''}] ${String(x.excerpt || '').slice(0, 220)}`).join('\n'); } catch (_) { return ''; }
}

async function stageDraft(r, body) {
  const subject = r.t_subject && /^re:/i.test(r.t_subject) ? r.t_subject : `Re: ${r.t_subject || ''}`;
  // Reuse the existing Gmail draft if this item already has one (avoid dup drafts
  // on the thread — update_draft is floor-allowed too). Else create a fresh one.
  const prior = db.prepare(`SELECT gmail_draft_id FROM email_drafts WHERE email_item_id=? AND gmail_draft_id IS NOT NULL ORDER BY rowid DESC LIMIT 1`).get(r.email_item_id);
  if (prior && prior.gmail_draft_id) {
    await gmailCall('update_draft', { draft_id: prior.gmail_draft_id, to: r.t_from || '', subject, body });
    return prior.gmail_draft_id;
  }
  const resp = await gmailCall('create_draft', { thread_id: r.t_thread, to: r.t_from || '', subject, body });
  return (resp.json && (resp.json.draft_id || resp.json.id)) || (resp.text && String(resp.text).trim()) || null;
}
function persist(r, body, gmailDraftId, needsPrincipal) {
  const existing = db.prepare(`SELECT rowid FROM email_drafts WHERE email_item_id=? ORDER BY rowid DESC LIMIT 1`).get(r.email_item_id);
  if (existing) {
    db.prepare(`UPDATE email_drafts SET gmail_draft_id=?, body=?, status='ready', verdict='confirmed', note=? WHERE rowid=?`)
      .run(gmailDraftId, body, needsPrincipal ? `needs_principal: ${needsPrincipal}` : 'actuated', existing.rowid);
  } else {
    db.prepare(`INSERT INTO email_drafts (email_item_id, thread_id, gmail_draft_id, body, status, verdict, note) VALUES (?,?,?,?,'ready','confirmed',?)`)
      .run(r.email_item_id, r.t_thread, gmailDraftId, body, needsPrincipal ? `needs_principal: ${needsPrincipal}` : 'actuated');
  }
  db.prepare(`UPDATE needs_you_resolutions SET status='ready', automation_tier=?, note=? WHERE email_item_id=?`)
    .run(needsPrincipal ? 2 : 3, needsPrincipal ? `staged; needs Jordan: ${needsPrincipal}` : 'staged one-click-ready', r.email_item_id);
}

async function main() {
  const rows = loadRows();
  console.log(`needs-you-actuate: ${rows.length} verified resolution(s) | ${DRY ? 'DRY (no writes)' : 'LIVE (staging Gmail drafts)'}\n`);
  if (!DRY) runStart();
  let staged = 0, errors = 0, skipped = 0;
  for (const r of rows) {
    const holes = HOLE_RE.test(r.draft_action);
    const scheduling = SCHED_RE.test(`${r.ask} ${r.decision} ${r.draft_action}`);
    let slots = [];
    try {
      if (scheduling) {
        const now = new Date();
        const tmin = `${now.toISOString().slice(0, 10)} 00:00`;
        const tmax = `${new Date(now.getTime() + 8 * 86400000).toISOString().slice(0, 10)} 00:00`;
        const cal = await gcalCall('list_events', { time_min: tmin, time_max: tmax });
        const evs = (cal.json && (cal.json.events || cal.json.items)) || [];
        slots = freeSlots(evs, 3);
        await sleep(200);
      }
      let body = r.draft_action, needsPrincipal = null, filled = !holes;
      if (holes || scheduling) {
        const { text } = await claude([{ role: 'user', content: buildCompleteMsg(r, slots, ctxExcerpt(r)) }], { model: MODEL, system: COMPLETE_SYSTEM, maxTokens: 900, temperature: 0 });
        const out = parseJSON(text) || {};
        if (out.body) body = out.body;
        needsPrincipal = out.needs_principal && String(out.needs_principal).toLowerCase() !== 'null' ? String(out.needs_principal) : null;
        filled = out.filled !== false && !needsPrincipal;
      }
      const tag = needsPrincipal ? `⚠ needs-jordan` : (filled ? `✓ one-click` : `• staged`);
      console.log(`${tag}  [${r.item_type}] ${String(r.t_subject).slice(0, 46)}`);
      if (scheduling) console.log(`     slots: ${slots.length ? slots.join(' | ') : '(none free found)'}`);
      if (needsPrincipal) console.log(`     needs Jordan: ${needsPrincipal}`);
      if (DRY) { console.log(`     draft> ${body.replace(/\s+/g, ' ').slice(0, 160)}…\n`); staged++; continue; }
      const gmailDraftId = await stageDraft(r, body);
      persist(r, body, gmailDraftId, needsPrincipal);
      console.log(`     staged Gmail draft ${gmailDraftId}\n`);
      staged++;
      await sleep(250);
    } catch (e) {
      if (e instanceof FloorViolation) { console.error('  FLOOR — stopping.'); break; }
      errors++; console.error(`  ✗ ${String(r.t_subject).slice(0, 40)}: ${(e.message || '').slice(0, 80)}\n`);
    }
  }
  console.log(`\nstaged=${staged} skipped=${skipped} errors=${errors}`);
  if (!DRY) runEnd({ status: errors && !staged ? 'degraded' : (errors ? 'partial' : 'ok'), considered: rows.length, staged, errors });
  process.exit(0);
}
main().catch((e) => { console.error('FATAL', e.message); if (!DRY) runEnd({ status: 'crashed', considered: 0, staged: 0, errors: 1 }); process.exit(1); });
