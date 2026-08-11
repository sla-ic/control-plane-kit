#!/usr/bin/env node
/*
 * disposition-capture.js — the LEARNING loop's ground-truth sensor (ADR-0016).
 *
 * The engine stages reversible artifacts (Gmail drafts, proposed sweeps) and then
 * has to find out what Jordan ACTUALLY did with them — otherwise the rule-graduation
 * gate only ever sees the pipeline agreeing with itself (circular; audit SEV-HIGH).
 * This worker is that sensor. It is READ-ONLY against Gmail (get_thread + list_drafts,
 * both floor-allowed) and writes only local disposition rows + reconciliations.
 *
 * SIGNALS captured (all first-party, observed — never inferred from an LLM):
 *   1. Staged draft SENT      — a ready email_drafts row whose gmail_draft_id has
 *                               left list_drafts AND the thread now carries a SENT
 *                               message from Jordan. Strong positive: the surfaced
 *                               item was genuinely actionable.
 *   2. Staged draft DISCARDED — gmail_draft_id gone from list_drafts, no new SENT.
 *                               Jordan threw the draft away.
 *   3. Thread RESTORED        — a thread the pipeline moved out of inbox (gmail_label
 *                               stamped) that is back in INBOX now. Jordan overrode a
 *                               removal → demotes the offending destructive rule.
 *
 * Each signal writes an email_dispositions row, stamps email_items.acted_by, and —
 * where a rule predicted an action on that thread — calls reconcilePrediction with
 * ground_truth='human' (sent/discarded) or 'restore' (restored). That HUMAN ground
 * is exactly what rule-engine's staged→auto gate now requires.
 *
 * Default-SAFE: read-only always; the only writes are local DB. No --live needed
 * (there is no egress), but honours --dry to compute-and-print without persisting.
 * SERIALIZED single process — no fan-out over the shared mcpgw token.
 */

const db = require('./db');
const { gmailCall } = require('./mcp-dispatch');
const { reconcilePrediction } = require('./rule-engine');

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DRY = has('--dry');
const NATIVE_ONLY = has('--native-only'); // skip draft/restore passes; run closure only
const LIMIT = parseInt(arg('--limit', '40'), 10);
// Native-closure scan can span the whole open surfacing backlog (serial get_thread,
// no LLM). Bounded, but generous enough to clear the current backlog in one pass.
const NATIVE_LIMIT = parseInt(arg('--native-limit', process.env.AMP_NATIVE_LIMIT || '200'), 10);
const RUN_ID = `disp-${process.pid}-${process.hrtime()[1]}`;
const MODEL = 'none';

function runStart() { if (DRY) return; try { db.prepare(`INSERT INTO fleet_runs (run_id, worker, host, model, status) VALUES (?,?,?,?,'running')`).run(RUN_ID, 'amp-disposition-capture', require('os').hostname(), MODEL); } catch (_) {} }
function runEnd(status, considered, errors) { try { db.prepare(`UPDATE fleet_runs SET status=?, considered=?, errors=?, ended_at=datetime('now') WHERE run_id=?`).run(status, considered || 0, errors || 0, RUN_ID); } catch (_) {} }

function ensureSchema() {
  db.prepare(`CREATE TABLE IF NOT EXISTS email_dispositions (
    id INTEGER PRIMARY KEY,
    email_item_id INTEGER,
    thread_id TEXT,
    plane TEXT,                 -- draft | sweep | needs_you
    action TEXT,                -- sent | discarded | restored | kept
    detail TEXT,
    observed_at TEXT DEFAULT (datetime('now')),
    UNIQUE(thread_id, plane, action)
  )`).run();
}

function recordDisposition(itemId, threadId, plane, action, detail) {
  if (DRY) return true;
  try {
    const info = db.prepare(`INSERT OR IGNORE INTO email_dispositions
      (email_item_id, thread_id, plane, action, detail) VALUES (?,?,?,?,?)`)
      .run(itemId || null, threadId, plane, action, detail || null);
    return info.changes > 0; // false = already recorded (idempotent no-op)
  } catch (_) { return false; }
}

function stampActedBy(itemId, who) {
  if (DRY || !itemId) return;
  try { db.prepare(`UPDATE email_items SET acted_by=?, acted_at=datetime('now') WHERE id=?`).run(who, itemId); } catch (_) {}
}

// Reconcile any rule predictions on a thread against a real human outcome.
// engaged=true  → Jordan acted on the mail (sent a reply): destructive predictions
//                 were WRONG (mail mattered) → disagree; protect predictions right.
// engaged=false + restored → Jordan pulled it back into inbox → ground 'restore'.
function reconcileThread(threadId, { engaged, restored }) {
  const preds = db.prepare(`SELECT p.*, r.kind FROM email_rule_predictions p
    JOIN email_rules r ON r.id = p.rule_id
    WHERE p.thread_id=? AND p.outcome='pending'`).all(threadId);
  let n = 0;
  for (const p of preds) {
    const ground = restored ? 'restore' : 'human';
    // The human's actual disposition of the thread, in the rule's own vocabulary.
    // Engaged/restored means the thread stayed (was NOT removed) → actual='keep'.
    // A protect rule predicted 'keep' → agree; an archive/trash rule predicted its
    // kind → disagree. reconcilePrediction derives agree/disagree from predicted===actual.
    const actual = (engaged || restored) ? 'keep' : (p.predicted);
    if (DRY) { n++; continue; }
    try { if (reconcilePrediction(p.id, actual, ground) != null) n++; } catch (_) {}
  }
  return n;
}

// Jordan's sender identities (a SENT message from one of these = he replied).
const PRINCIPAL = /jordan@example\.com|jordan\.rivera@example\.com/i;
const labelsOf = (m) => (m.labelIds || m.labels || m.label_ids || []).map((x) => String(x).toUpperCase());

// Millisecond epoch for a gmail message (RFC-2822 Date header or unix internalDate).
function msgEpoch(m) {
  const raw = m.date || m.received_at || m.internalDate || m.Date || m.receivedAt;
  if (raw == null) return null;
  if (/^\d+$/.test(String(raw))) { const n = Number(raw); return n < 1e12 ? n * 1000 : n; }
  const ms = Date.parse(String(raw));
  return Number.isNaN(ms) ? null : ms;
}

// NB: mcpgw list_drafts is non-deterministic (returns a different partial set
// each call — 21 then 41, not even a subset). Draft presence is therefore read
// per-thread from get_thread, which IS stable: our staged draft shows up as a
// message labelled DRAFT from Jordan. That message vanishing is the disposition.
async function captureDrafts() {
  const rows = db.prepare(`SELECT d.id, d.email_item_id, d.thread_id, d.gmail_draft_id
    FROM email_drafts d
    WHERE d.status='ready' AND d.gmail_draft_id IS NOT NULL
    ORDER BY d.id DESC LIMIT ?`).all(LIMIT);
  let sent = 0, discarded = 0, pending = 0, unread = 0;
  for (const r of rows) {
    let msgs = null;
    try {
      const t = await gmailCall('get_thread', { thread_id: r.thread_id });
      msgs = (t.json && t.json.messages) || t.items || [];
    } catch (_) { unread++; continue; } // couldn't read thread → leave untouched, retry next run

    const hasDraft = msgs.some((m) => labelsOf(m).includes('DRAFT') && PRINCIPAL.test(m.from || m.sender || ''));
    if (hasDraft) { pending++; continue; } // draft still staged, Jordan hasn't acted

    const principalSent = msgs.some((m) => labelsOf(m).includes('SENT') && PRINCIPAL.test(m.from || m.sender || ''));
    const engaged = principalSent;
    const action = engaged ? 'sent' : 'discarded';
    const detail = `${engaged ? 'SENT by Jordan' : 'draft gone, no SENT'}; msgs=${msgs.length}`;
    const fresh = recordDisposition(r.email_item_id, r.thread_id, 'draft', action, detail);
    if (!DRY) {
      stampActedBy(r.email_item_id, engaged ? 'jordan:sent' : 'jordan:discarded');
      db.prepare(`UPDATE email_drafts SET status=?, note=COALESCE(note,'')||? WHERE id=?`)
        .run(engaged ? 'sent' : 'discarded', ` [disp:${action}]`, r.id);
      db.prepare(`UPDATE needs_you_resolutions SET status=? WHERE email_item_id=? AND status IN ('ready','proposed')`)
        .run(engaged ? 'acted' : 'declined', r.email_item_id);
      // Only a SEND is strong enough to reconcile rule predictions (the mail
      // demonstrably mattered). A discard is about the draft, not the routing.
      if (engaged) reconcileThread(r.thread_id, { engaged: true, restored: false });
    }
    if (fresh) { if (engaged) sent++; else discarded++; }
    else pending++; // already captured on a prior run
  }
  return { sent, discarded, pending, unread, scanned: rows.length };
}

// Restore detection: a thread the pipeline ACTUALLY removed (an executed
// archive/trash sweep action, not merely a shadow/staged prediction and not an
// additive label) that is BACK in INBOX now. Only an executed removal can be
// "restored" — labeling a thread that stays in inbox is not a removal, so keying
// off gmail_label would fabricate restores (audit: shadow rules never touch mail).
async function captureRestores() {
  const rows = db.prepare(`
    SELECT a.id AS action_id, a.thread_id, i.id AS email_item_id
    FROM email_sweep_actions a
    LEFT JOIN email_items i ON i.thread_id = a.thread_id
    WHERE a.action IN ('archive','trash') AND a.status='executed' AND a.undone_at IS NULL
    ORDER BY a.executed_at DESC LIMIT ?`).all(LIMIT);
  let restored = 0, checked = 0;
  for (const r of rows) {
    checked++;
    let inInbox = false;
    try {
      const t = await gmailCall('get_thread', { thread_id: r.thread_id });
      const msgs = (t.json && t.json.messages) || t.items || [];
      inInbox = msgs.some((m) => labelsOf(m).includes('INBOX'));
    } catch (_) { continue; }
    if (!inInbox) continue; // still out of inbox → our removal stands, no override
    const fresh = recordDisposition(r.email_item_id, r.thread_id, 'sweep', 'restored', `executed action ${r.action_id} back in INBOX`);
    if (!DRY) {
      db.prepare(`UPDATE email_sweep_actions SET status='undone', undone_at=datetime('now') WHERE id=?`).run(r.action_id);
      stampActedBy(r.email_item_id, 'jordan:restored');
      reconcileThread(r.thread_id, { engaged: false, restored: true });
    }
    if (fresh) restored++;
  }
  return { restored, checked };
}

// Native closure: an OPEN surfacing item whose thread's newest NON-DRAFT message
// is a SENT reply from Jordan. He already had the last word in Gmail directly (no
// amp draft involved) → the ball is in others' court → the item does NOT need him
// now. This is the signal the needs-you-resolver was blind to: it decomposed and
// re-surfaced threads Jordan had already handled (e.g. the resolved billing
// escalation). Deterministic, no LLM. Fully reversible: if anyone replies after
// Jordan, sync assigns a new msg_id and upsertItem reopens the item; and
// captureRestores() catches any thread Jordan pulls back into inbox.
//
// A DRAFT message is unsent (invisible to other parties) so it is excluded when
// deciding who spoke last — a stale amp-staged draft must not mask Jordan's SENT.
async function captureNativeClosures() {
  const rows = db.prepare(`
    SELECT id AS email_item_id, thread_id, subject
    FROM email_items
    WHERE route IN ('needs_you','inbox','external') AND status='open'
    ORDER BY received_at DESC LIMIT ?`).all(NATIVE_LIMIT);
  let closed = 0, awaiting = 0, unread = 0, scanned = 0;
  for (const r of rows) {
    scanned++;
    if (scanned % 20 === 0) console.error(`  … native ${scanned}/${rows.length} (closed=${closed} still-Jordan=${awaiting} unread=${unread})`);
    let msgs = null;
    try {
      const t = await gmailCall('get_thread', { thread_id: r.thread_id });
      msgs = (t.json && t.json.messages) || t.items || [];
    } catch (_) { unread++; continue; } // couldn't read → leave untouched, retry next run
    if (!msgs.length) { unread++; continue; }

    // Newest NON-DRAFT message decides who had the last word.
    const convo = msgs
      .map((m) => ({ m, ep: msgEpoch(m), labels: labelsOf(m) }))
      .filter((x) => !x.labels.includes('DRAFT'))
      .sort((a, b) => (a.ep || 0) - (b.ep || 0));
    if (!convo.length) { awaiting++; continue; }

    const last = convo[convo.length - 1];
    const principalLast = last.labels.includes('SENT') && PRINCIPAL.test(last.m.from || last.m.sender || '');
    if (!principalLast) { awaiting++; continue; } // someone else spoke last → still Jordan's move

    const detail = `Jordan SENT last (${last.m.date || last.m.received_at || ''}); msgs=${msgs.length}`;
    const fresh = recordDisposition(r.email_item_id, r.thread_id, 'native', 'sent', detail);
    if (!DRY) {
      stampActedBy(r.email_item_id, 'jordan:sent');
      db.prepare(`UPDATE email_items SET status='resolved' WHERE id=? AND status='open'`).run(r.email_item_id);
      db.prepare(`UPDATE needs_you_resolutions SET status='acted' WHERE email_item_id=? AND status IN ('ready','proposed')`)
        .run(r.email_item_id);
      reconcileThread(r.thread_id, { engaged: true, restored: false });
    }
    if (fresh) closed++;
  }
  return { closed, awaiting, unread, scanned };
}

(async () => {
  ensureSchema();
  runStart();
  try {
    const EMPTY_D = { sent: 0, discarded: 0, pending: 0, unread: 0, scanned: 0 };
    const EMPTY_S = { restored: 0, checked: 0 };
    const d = NATIVE_ONLY ? EMPTY_D : await captureDrafts();
    const s = NATIVE_ONLY ? EMPTY_S : await captureRestores();
    const n = await captureNativeClosures();
    const summary = `drafts: ${d.sent} sent, ${d.discarded} discarded, ${d.pending} pending/seen (of ${d.scanned}); restores: ${s.restored} new (of ${s.checked} checked); native-closures: ${n.closed} closed, ${n.awaiting} still-Jordan, ${n.unread} unread (of ${n.scanned})`;
    console.log(`disposition-capture: ${DRY ? 'DRY — ' : ''}${summary}`);
    if (!DRY) runEnd('ok', d.scanned + s.checked + n.scanned, 0);
  } catch (e) {
    console.error('disposition-capture FAILED:', e.message);
    if (!DRY) runEnd('crashed', 0, 1);
    process.exit(1);
  }
})();
