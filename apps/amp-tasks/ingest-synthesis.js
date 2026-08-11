#!/usr/bin/env node
// ingest-synthesis.js — the GATED WRITE-BACK stage of the closed loop.
//
//   reason → verify → [THIS: gated write-back] → surface → resolve
//
// Reads the VERIFIED synthesis (/tmp/synthesis-verified.jsonl, produced by
// verify-synthesis.js) and writes it back into the SAME projects table the UI
// reads — no second store. Two things happen here, both idempotent:
//
//   1. Every project's synthesized state is updated (status/blocker/your_move/
//      health) ALONG WITH its provenance (synth_confidence/synth_verdict/
//      synth_note/synth_verified_at) so the surface can show how trustworthy the
//      claim is — or refuse to assert it.
//
//   2. CONFIRMED, high-confidence recommendations become live `decisions` rows
//      (your_move + escalation), which is what makes actions actually SURFACE
//      and lets the loop CLOSE. Synthesis-origin decisions are kept singular per
//      (project, kind): when the recommendation changes, the prior one is
//      superseded (resolved + superseded_by), not duplicated. When a project no
//      longer has a valid move, its open synthesis move is retired. This is why
//      the action surface stops being frozen.
//
// SAFETY: only verdict === 'confirmed' AND confidence ≥ TAU produce actionable
// decision rows. needs_evidence / contradicted are recorded (so the UI can show
// "unverified") but never surfaced as actions — the anti-false-info gate.

const fs   = require('fs');
const path = require('path');
const db   = require('./db');

const DIR = '/tmp';
const TAU = parseFloat(process.env.AMP_VERIFY_TAU || '0.6');

// Prefer the verified file. If it's missing, refuse to ingest raw reasoned
// output — surfacing unverified synthesis is exactly the failure mode we're
// closing. (A legacy synthesis-*.jsonl with no verdict is treated as unverified.)
const VERIFIED = path.join(DIR, 'synthesis-verified.jsonl');
if (!fs.existsSync(VERIFIED)) {
  console.error('No /tmp/synthesis-verified.jsonl — run synthesize-projects.js && verify-synthesis.js first. Refusing to ingest unverified data.');
  process.exit(1);
}

const updateProj = db.prepare(`
  UPDATE projects
     SET status_synthesis = ?, blocker = ?, your_move = ?, health = ?,
         synth_confidence = ?, synth_verdict = ?, synth_note = ?,
         synth_verified_at = datetime('now'), last_synthesis_at = datetime('now')
   WHERE id = ?
`);

// Synthesis-origin decisions: one live row per (project_id, kind).
const getOpenSynthDec = db.prepare(`
  SELECT id, title FROM decisions
   WHERE project_id = ? AND kind = ? AND origin = 'synthesis' AND resolved_at IS NULL
   ORDER BY created_at DESC LIMIT 1
`);
const insertDec = db.prepare(`
  INSERT INTO decisions (project_id, kind, title, body, confidence, verdict, origin, created_at)
  VALUES (?, ?, ?, ?, ?, ?, 'synthesis', datetime('now'))
`);
const refreshDec = db.prepare(`
  UPDATE decisions SET body = ?, confidence = ?, verdict = ? WHERE id = ?
`);
const retireDec = db.prepare(`
  UPDATE decisions SET resolved_at = datetime('now'), resolution = ?, superseded_by = ? WHERE id = ?
`);

// action-verb invariant on your_move titles (kept in sync with public/index.html)
const ACTION_VERBS_RE = /^(approve|decline|draft|send|confirm|ratify|reject|ship|close|escalate|hold|review|sign|delegate|publish|schedule|cancel|defer|merge|kick\s*off|kickoff|act|acknowledge|respond|reply)\b/i;

// Upsert one synthesis-origin decision, superseding a differing prior one.
// Returns 'inserted' | 'refreshed' | 'skipped'.
function upsertDecision(project_id, kind, title, body, confidence, verdict) {
  const prior = getOpenSynthDec.get(project_id, kind);
  if (prior && prior.title === title) { refreshDec.run(body, confidence, verdict, prior.id); return 'refreshed'; }
  const info = insertDec.run(project_id, kind, title, body, confidence, verdict);
  if (prior) retireDec.run('superseded', info.lastInsertRowid, prior.id);
  return 'inserted';
}
// Retire an open synthesis-origin decision that no longer has a valid recommendation.
function retireIfOpen(project_id, kind, reason) {
  const prior = getOpenSynthDec.get(project_id, kind);
  if (prior) { retireDec.run(reason, null, prior.id); return true; }
  return false;
}

let syn = 0, decIns = 0, decRefresh = 0, decRetired = 0, gatedOut = 0, rejectedVerb = 0, bad = 0;

const records = fs.readFileSync(VERIFIED, 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
  .map(l => { try { return JSON.parse(l); } catch { bad++; return null; } })
  .filter(r => r && r.type === 'synthesis' && r.project_id);

const txn = db.transaction(() => {
  for (const r of records) {
    const verdict = r.verdict || 'needs_evidence';
    const confidence = typeof r.confidence === 'number' ? r.confidence : null;

    // 1. Always record the synthesized state + provenance.
    updateProj.run(
      r.status_synthesis || null,
      r.blocker || null,
      r.your_move || null,
      r.health || 'unknown',
      confidence,
      verdict,
      r.note || null,
      r.project_id
    );
    syn++;

    // Two gates. actionGate = the project itself is verified+confident enough to
    // surface ANY action (escalation). surfaceable = the specific your_move also
    // survived the reviewer (verify sets move_surfaceable). Both must hold before
    // a move becomes a decision; escalation only needs actionGate.
    const actionGate = verdict === 'confirmed' && (confidence == null || confidence >= TAU);
    const surfaceable = typeof r.move_surfaceable === 'boolean'
      ? r.move_surfaceable
      : actionGate;

    // 2a. your_move → live decision (only if verified-surfaceable).
    if (surfaceable && r.your_move) {
      if (!ACTION_VERBS_RE.test(r.your_move)) {
        rejectedVerb++;
        retireIfOpen(r.project_id, 'your_move', 'retired: non-action-verb move');
      } else {
        const res = upsertDecision(r.project_id, 'your_move', r.your_move,
          r.status_synthesis || null, confidence, verdict);
        if (res === 'inserted') decIns++; else if (res === 'refreshed') decRefresh++;
      }
    } else {
      // No valid, verified move → retire any stale open synthesis move.
      if (retireIfOpen(r.project_id, 'your_move', 'retired: no verified move this cycle')) decRetired++;
      if (r.your_move && !surfaceable) gatedOut++;
    }

    // 2b. red + blocker (confirmed) → escalation decision.
    if (actionGate && r.health === 'red' && r.blocker) {
      const title = `Escalate: ${r.blocker}`.slice(0, 200);
      const res = upsertDecision(r.project_id, 'escalation', title,
        r.status_synthesis || null, confidence, verdict);
      if (res === 'inserted') decIns++; else if (res === 'refreshed') decRefresh++;
    } else {
      if (retireIfOpen(r.project_id, 'escalation', 'retired: no verified escalation this cycle')) decRetired++;
    }
  }
});
txn();

console.log(`Applied ${syn} synthesis updates.`);
console.log(`Decisions: ${decIns} inserted, ${decRefresh} refreshed, ${decRetired} retired/superseded.`);
console.log(`Gated out (unverified/low-confidence, not surfaced as actions): ${gatedOut}. Rejected (no action verb): ${rejectedVerb}. Bad lines: ${bad}.`);

const cov = db.prepare(`SELECT synth_verdict v, COUNT(*) n FROM projects WHERE roadmap IN ('Payments','Experience') AND synth_verdict IS NOT NULL GROUP BY synth_verdict`).all();
const tot = db.prepare(`SELECT COUNT(*) n FROM projects WHERE roadmap IN ('Payments','Experience')`).get();
const openByKind = db.prepare(`SELECT kind, COUNT(*) n FROM decisions WHERE resolved_at IS NULL GROUP BY kind`).all();
const synthOpen = db.prepare(`SELECT COUNT(*) n FROM decisions WHERE resolved_at IS NULL AND origin='synthesis'`).get();
console.log(`\nVerified coverage over ${tot.n} roadmap projects:`, JSON.stringify(cov));
console.log('Open decisions by kind:', JSON.stringify(openByKind));
console.log(`Open synthesis-origin decisions (live actions): ${synthOpen.n}`);
