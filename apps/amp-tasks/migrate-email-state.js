#!/usr/bin/env node
// migrate-email-state.js — one-time (idempotent) port of Nova's dormant email
// state blobs into the email plane of the control-center DB.
//
//   ~/Desktop/nova/inbox-system/state/*.json  →  email_items / email_commitments
//
// What migrates as LIVE rows (durable, still meaningful):
//   • commitments.json  → email_commitments   (the real promises: Northwind, etc.)
//   • brief-items.json  → email_items          (the queue that was actually surfaced)
//
// What migrates as AUDIT ONLY (email_events) — ephemeral triage bookkeeping the
// live sensor pull regenerates, not worth resurrecting as stale stub rows:
//   • auto-drafted.json   (thread → gmail draft id)
//   • draft-blocked.json  (thread → why triage couldn't draft)
//
// Idempotent: commitments upsert by their stable id; brief items upsert by
// thread_id; audit events are de-duped by (routine, thread_id, detail-hash) via
// a marker in state. Safe to re-run.
//
// Reads only from the Desktop blobs; writes only to the local DB. No Gmail/
// network access — this is pure local data movement.

const fs   = require('fs');
const path = require('path');
const db   = require('./db');

const STATE_DIR = process.env.NOVA_STATE_DIR ||
  path.join(process.env.HOME, 'Desktop/nova/inbox-system/state');

function loadJSON(name) {
  const p = path.join(STATE_DIR, name);
  if (!fs.existsSync(p)) { console.warn(`  (skip) ${name} not found`); return null; }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.warn(`  (skip) ${name} parse error: ${e.message}`); return null; }
}

let cCommit = 0, cItem = 0, cEvent = 0;

// ── 1. Commitments ─────────────────────────────────────────────────────────
const upsertCommit = db.prepare(`
  INSERT INTO email_commitments (id, text, source, source_link, recipient, tier, due_iso, status, extracted_at)
  VALUES (@id, @text, @source, @source_link, @recipient, @tier, @due_iso, @status, @extracted_at)
  ON CONFLICT(id) DO UPDATE SET
    text=excluded.text, source=excluded.source, source_link=excluded.source_link,
    recipient=excluded.recipient, tier=excluded.tier, due_iso=excluded.due_iso,
    status=excluded.status, extracted_at=excluded.extracted_at
`);
const commitData = loadJSON('commitments.json');
if (commitData && Array.isArray(commitData.commitments)) {
  const txn = db.transaction(() => {
    for (const c of commitData.commitments) {
      if (!c.id) continue;
      upsertCommit.run({
        id: c.id,
        text: c.text || '',
        source: c.source || null,
        source_link: c.source_link || null,
        recipient: c.recipient || null,
        tier: c.tier != null ? parseInt(c.tier, 10) || null : null,
        due_iso: c.due_iso || null,
        status: c.status || 'open',
        extracted_at: c.extracted_at || commitData.last_run_iso || null,
      });
      cCommit++;
    }
  });
  txn();
}

// ── 2. Brief items (the surfaced queue) → email_items ───────────────────────
const upsertItem = db.prepare(`
  INSERT INTO email_items (thread_id, msg_id, subject, sender, route, status, received_at, ingested_at, note)
  VALUES (@thread_id, @msg_id, @subject, @sender, @route, @status, @received_at, datetime('now'), @note)
  ON CONFLICT(thread_id) DO UPDATE SET
    subject=COALESCE(excluded.subject, email_items.subject),
    sender=COALESCE(excluded.sender, email_items.sender),
    note=COALESCE(excluded.note, email_items.note)
`);
const briefData = loadJSON('brief-items.json');
if (briefData && typeof briefData === 'object') {
  const txn = db.transaction(() => {
    for (const [key, v] of Object.entries(briefData)) {
      if (!v || typeof v !== 'object') continue;
      const thread_id = v.thread_id || v.email_id;
      if (!thread_id) continue;
      upsertItem.run({
        thread_id,
        msg_id: v.email_id || thread_id,
        subject: v.subject || null,
        sender: v.sender || null,
        route: 'needs_you',                 // brief items were surfaced ⇒ needs-you class
        status: 'open',
        received_at: v.posted_at || null,
        note: v.note || null,
      });
      cItem++;
    }
  });
  txn();
}

// ── 3. Audit-only: auto-drafted + draft-blocked → email_events ──────────────
const logEvent = db.prepare(`
  INSERT INTO email_events (ts, routine, action, thread_id, detail)
  VALUES (datetime('now'), ?, ?, ?, ?)
`);
// Guard so re-runs don't duplicate the historical import.
const alreadyImported = db.prepare(
  `SELECT COUNT(*) n FROM email_events WHERE routine='migrate' AND action=?`
);
function importAudit(name, routine, mkDetail) {
  const data = loadJSON(name);
  if (!data || typeof data !== 'object') return;
  if (alreadyImported.get(name).n > 0) { console.warn(`  (skip) ${name} already imported`); return; }
  const txn = db.transaction(() => {
    for (const [tid, val] of Object.entries(data)) {
      logEvent.run('migrate', name, tid, mkDetail(val));
      cEvent++;
    }
  });
  txn();
}
importAudit('auto-drafted.json', 'draft', v => `historical auto-draft gmail_draft_id=${v}`);
importAudit('draft-blocked.json', 'draft', v => `historical draft-blocked: ${v}`);

// ── freshness stamp + report ────────────────────────────────────────────────
db.prepare("UPDATE state SET value=datetime('now'), updated_at=datetime('now') WHERE key='last_email_sync_at'").run();

console.log(`Migrated: ${cCommit} commitments, ${cItem} email items, ${cEvent} audit events.`);
const openC = db.prepare("SELECT status, COUNT(*) n FROM email_commitments GROUP BY status").all();
console.log('Commitments by status:', JSON.stringify(openC));
const items = db.prepare("SELECT COUNT(*) n FROM email_items").get();
console.log('Total email_items:', items.n);
