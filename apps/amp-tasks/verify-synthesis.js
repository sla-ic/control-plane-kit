#!/usr/bin/env node
// verify-synthesis.js — the VERIFY stage of the control-center closed loop.
//
//   reason (synthesize-projects.js)  →  VERIFY (this file)  →  gated write-back (ingest-synthesis.js)
//
// The reason pass PROPOSES a per-project {status_synthesis, blocker, your_move,
// health, confidence}. This pass independently RE-CHECKS each proposal against
// the SAME underlying evidence — blind to the first pass's chain of thought —
// and refuses to let unsupported claims reach a surface. Two layers:
//
//   1. Deterministic rule gates  — cheap, non-negotiable guards that catch the
//      known false-positive shapes (e.g. "red because zero live Jira tasks",
//      which is almost always a stale-sync artifact, NOT a real blocker).
//   2. An adversarial LLM reviewer — a second model call framed to REFUTE, not
//      agree: does the evidence actually support this status / blocker / move?
//
// Output verdict ∈ {confirmed, needs_evidence, contradicted}. Only `confirmed`
// items with confidence ≥ TAU are allowed to become actionable decision rows
// downstream. Everything else still records its (lowered) synthesis, flagged so
// the dashboard shows "unverified / uncertain" instead of asserting false state.
//
// Guardrails: reads are sensor work; all writes are LOCAL (/tmp + local DB
// state stamp only). Nothing goes back to Jira/Confluence/Slack/Drive.

const fs = require('fs');
const db = require('./db');
const { claude, parseJSON } = require('./llm');

const IN  = '/tmp/synthesis-reasoned.jsonl';
const OUT = '/tmp/synthesis-verified.jsonl';
const MODEL = process.env.AMP_VERIFY_MODEL || 'sonnet';
const CONCURRENCY = 6;
const TAU = parseFloat(process.env.AMP_VERIFY_TAU || '0.6'); // min confidence to surface an action
const STALE_HRS = 24 * 3; // inputs older than this (and no live task movement) → cap confidence

const norm = s => String(s || '').toLowerCase().replace(/[\[\]]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// verdict severity ordering — lower index = better
const VERDICTS = ['confirmed', 'needs_evidence', 'contradicted'];
const worst = (a, b) => VERDICTS[Math.max(VERDICTS.indexOf(a), VERDICTS.indexOf(b))] || 'needs_evidence';

// ── evidence re-gather (independent of synthesize-projects.js on purpose) ────
const projStmt = db.prepare(`SELECT id,name,pcr,theme,area,roadmap,priority,kr,target,eng_weeks,summary FROM projects WHERE id=?`);
const artStmt  = db.prepare(`SELECT kind,title,snippet,url,ts FROM project_artifacts WHERE project_id=? ORDER BY ts DESC LIMIT 12`);
const allTasks = db.prepare(`SELECT project,jira_key,jira_status,status,cycle,assignee,title FROM tasks`).all();
const plannerRows = (() => { try { return db.prepare(`SELECT best_name,name,key,theme,okr,quarter,half,owners,notes,summary,status_narrative,span_weeks,pcr FROM planner_projects`).all(); } catch { return []; } })();
const plannerByNorm = {};
for (const p of plannerRows) { const n = norm(p.best_name || p.name || p.key); if (n && !plannerByNorm[n]) plannerByNorm[n] = p; }

// active-ish jira statuses signal real movement (vs. an empty/stale sync)
const ACTIVE_JIRA = /(in progress|in review|code review|qa|doing|started|dev|open|to do|selected)/i;
const CLOSED_JIRA = /(done|closed|resolved|shipped|complete|cancel)/i;

function hoursSince(ts) {
  if (!ts) return Infinity;
  const t = Date.parse(String(ts).replace(' ', 'T'));
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / 36e5;
}

function evidenceFor(pid) {
  const p = projStmt.get(pid);
  if (!p) return null;
  const nm = norm(p.name);
  const arts = artStmt.all(pid);
  const tasks = allTasks.filter(t =>
    (t.project && norm(t.project) === nm) ||
    (p.pcr && t.jira_key && t.jira_key.toUpperCase() === p.pcr.toUpperCase())
  );
  const planner = plannerByNorm[nm] || null;
  const freshestArtHrs = arts.length ? Math.min(...arts.map(a => hoursSince(a.ts))) : Infinity;
  const liveMovement = tasks.some(t => t.jira_status && ACTIVE_JIRA.test(t.jira_status));
  return { p, nm, arts, tasks, planner, freshestArtHrs, liveMovement };
}

// ── deterministic rule gates ────────────────────────────────────────────────
// Returns {verdict, confCap, healthOverride, notes[]} — the non-LLM guardrail.
function ruleGate(rec, ev) {
  const notes = [];
  let verdict = 'confirmed';
  let confCap = 1.0;
  let healthOverride = null;

  const hasArts = ev.arts.length > 0;
  const hasTasks = ev.tasks.length > 0;
  const hasDeck = !!ev.planner;
  const evidenceCount = (hasArts ? 1 : 0) + (hasTasks ? 1 : 0) + (hasDeck ? 1 : 0);

  // Gate A — thin evidence can never be "confirmed".
  if (evidenceCount === 0) {
    verdict = worst(verdict, 'needs_evidence');
    confCap = Math.min(confCap, 0.35);
    notes.push('no artifacts, live tasks, or deck record');
  } else if (evidenceCount === 1 && !hasTasks) {
    confCap = Math.min(confCap, 0.6);
    notes.push('single thin evidence source');
  }

  // Gate B — the stale-sync trap: red/blocked asserted while there are simply
  // zero live tasks and nothing in the artifacts naming a blocker. This is the
  // exact false-positive class the audit caught (project flagged red off an
  // un-synced Jira board). Demote instead of asserting a blocker.
  const blockerText = norm(rec.blocker);
  const artMentionsBlocker = ev.arts.some(a =>
    /(block|risk|slip|delay|stall|depend|waiting|blocked|at risk|behind)/i.test(`${a.title} ${a.snippet}`));
  if ((rec.health === 'red' || blockerText) && !ev.liveMovement && !hasTasks && !artMentionsBlocker) {
    verdict = worst(verdict, 'needs_evidence');
    confCap = Math.min(confCap, 0.3);
    healthOverride = 'unknown';
    notes.push('red/blocked claim unsupported: zero live tasks + no blocker evidence (likely stale sync)');
  }

  // Gate C — stale inputs: nothing fresh and no active Jira movement → the
  // synthesis is a re-assertion of old state; cap confidence, flag it.
  if (ev.freshestArtHrs > STALE_HRS && !ev.liveMovement) {
    confCap = Math.min(confCap, 0.5);
    notes.push(`stale inputs (freshest artifact ${isFinite(ev.freshestArtHrs) ? Math.round(ev.freshestArtHrs / 24) + 'd' : 'none'}, no active Jira)`);
  }

  // Gate D — green while everything is closed/absent is suspect (done, not green).
  const allClosed = hasTasks && ev.tasks.every(t => t.jira_status && CLOSED_JIRA.test(t.jira_status));
  if (rec.health === 'green' && allClosed) {
    confCap = Math.min(confCap, 0.7);
    notes.push('all tasks closed — verify "green" vs "done/dormant"');
  }

  return { verdict, confCap, healthOverride, notes };
}

// ── adversarial LLM reviewer ────────────────────────────────────────────────
const SYSTEM = `You are Amp's VERIFICATION reviewer. A first pass proposed a project's status. Your job is to REFUTE, not agree: check every claim against the evidence and assume it is wrong until the evidence proves it.
You are given the project evidence (PRD/ERD artifact snippets, live Jira tasks with status, deck record) and the PROPOSED synthesis (status_synthesis, blocker, your_move, health, confidence).
Decide, grounded ONLY in the evidence:
  - Is the status_synthesis actually supported? Is the blocker real and evidenced? Is your_move the right, evidenced action? Is the health rating justified?
Return ONLY a JSON object, no prose:
  "verdict": one of "confirmed" | "needs_evidence" | "contradicted".
      confirmed = evidence clearly supports the synthesis.
      needs_evidence = plausible but under-evidenced / inputs too thin or stale to assert.
      contradicted = the evidence points the other way (e.g. claims blocked but tasks are progressing, or claims green but work is stalled).
  "confidence": number 0..1 — how well the (possibly corrected) picture is grounded in evidence.
  "health": the CORRECT health given the evidence: "green"|"yellow"|"red"|"unknown" (may differ from the proposal).
  "keep_your_move": boolean — true only if your_move is a correct, evidenced action Jordan should actually take now.
  "note": one terse sentence naming the single biggest reason for your verdict.`;

async function verifyOne(rec) {
  const ev = evidenceFor(rec.project_id);
  if (!ev) {
    return { ...rec, verdict: 'needs_evidence', confidence: 0, health: rec.health || 'unknown',
      your_move: null, note: 'project row not found for re-check', _name: `#${rec.project_id}` };
  }
  const gate = ruleGate(rec, ev);

  // Build the evidence payload the reviewer sees (compact, snippet-bounded).
  const payload = {
    project: { name: ev.p.name, pcr: ev.p.pcr, theme: ev.p.theme, area: ev.p.area,
      roadmap: ev.p.roadmap, kr: ev.p.kr, target: ev.p.target, eng_weeks: ev.p.eng_weeks, summary: ev.p.summary },
    prd_erd_artifacts: ev.arts.map(a => ({ kind: a.kind, title: a.title, snippet: (a.snippet || '').slice(0, 400), age_days: isFinite(hoursSince(a.ts)) ? Math.round(hoursSince(a.ts) / 24) : null })),
    live_tasks: ev.tasks.map(t => ({ title: t.title || t.project, jira: t.jira_key, jira_status: t.jira_status, cycle: t.cycle, owner: t.assignee })),
    deck_record: ev.planner && { theme: ev.planner.theme, okr: ev.planner.okr,
      quarter: ev.planner.quarter || ev.planner.half, owners: ev.planner.owners,
      status_narrative: (ev.planner.status_narrative || '').slice(0, 400) },
    proposed_synthesis: { status_synthesis: rec.status_synthesis, blocker: rec.blocker,
      your_move: rec.your_move, health: rec.health, confidence: rec.confidence },
  };

  let llm = {};
  try {
    const { text } = await claude([{ role: 'user', content: `EVIDENCE + PROPOSAL:\n${JSON.stringify(payload, null, 1)}` }],
      { model: MODEL, system: SYSTEM, maxTokens: 500, temperature: 0 });
    llm = parseJSON(text) || {};
  } catch (e) {
    // LLM failure → don't fabricate confirmation; fall back to rule gate only.
    llm = { verdict: 'needs_evidence', confidence: 0.3, health: rec.health || 'unknown',
      keep_your_move: false, note: `verifier LLM error: ${String(e.message || e).slice(0, 60)}` };
  }

  const llmVerdict = VERDICTS.includes(llm.verdict) ? llm.verdict : 'needs_evidence';
  const finalVerdict = worst(gate.verdict, llmVerdict);
  const llmConf = typeof llm.confidence === 'number' ? llm.confidence : 0.3;
  const reasonConf = typeof rec.confidence === 'number' ? rec.confidence : 1;
  const finalConf = Math.max(0, Math.min(gate.confCap, llmConf, reasonConf));
  const health = gate.healthOverride
    || (['green', 'yellow', 'red', 'unknown'].includes(llm.health) ? llm.health : (rec.health || 'unknown'));

  const surviveMove = !!llm.keep_your_move && finalVerdict === 'confirmed' && finalConf >= TAU;

  const notes = [];
  if (llm.note) notes.push(String(llm.note).trim());
  if (gate.notes.length) notes.push('gates: ' + gate.notes.join('; '));

  return {
    type: 'synthesis',
    project_id: rec.project_id,
    status_synthesis: rec.status_synthesis || null,
    blocker: rec.blocker || null,
    // Candidate move is ALWAYS preserved for the informational surface (tile
    // shows it with a confidence/verdict badge). move_surfaceable gates whether
    // it becomes an actionable decision row — display ≠ assertion.
    your_move: rec.your_move || null,
    move_surfaceable: surviveMove,
    health,
    confidence: Math.round(finalConf * 100) / 100,
    verdict: finalVerdict,
    note: notes.join(' | ').slice(0, 300) || null,
    _name: ev.p.name,
    _hadMove: !!rec.your_move,
    _keptMove: surviveMove,
  };
}

// ── run ─────────────────────────────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(IN)) { console.error(`No input at ${IN} — run synthesize-projects.js first.`); process.exit(1); }
  const records = fs.readFileSync(IN, 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(r => r && r.type === 'synthesis' && r.project_id);

  console.log(`Verifying ${records.length} proposed syntheses (model=${MODEL}, τ=${TAU}, concurrency=${CONCURRENCY})…`);
  const out = [];
  let i = 0;
  async function worker() {
    while (i < records.length) {
      const rec = records[i++];
      try {
        const v = await verifyOne(rec);
        out.push(v);
        const moveFlag = v._hadMove ? (v._keptMove ? 'move✓' : 'move✗dropped') : '—';
        process.stdout.write(`  [${v.verdict}] ${v._name} (${Math.round(v.confidence * 100)}%) ${moveFlag}\n`);
      } catch (e) {
        process.stdout.write(`  ✗ #${rec.project_id}: ${String(e.message || e).slice(0, 80)}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const lines = out.map(r => JSON.stringify({
    type: r.type, project_id: r.project_id, status_synthesis: r.status_synthesis,
    blocker: r.blocker, your_move: r.your_move, move_surfaceable: r.move_surfaceable,
    health: r.health, confidence: r.confidence, verdict: r.verdict, note: r.note,
  }));
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  // Remove the pre-verify file so ingest can't accidentally read unverified data.
  try { fs.unlinkSync(IN); } catch (e) {}
  try { db.prepare(`UPDATE state SET value=datetime('now'), updated_at=datetime('now') WHERE key='last_verify_at'`).run(); } catch (e) {}

  const byVerdict = out.reduce((m, r) => (m[r.verdict] = (m[r.verdict] || 0) + 1, m), {});
  const movesKept = out.filter(r => r._keptMove).length;
  const movesDropped = out.filter(r => r._hadMove && !r._keptMove).length;
  console.log(`\nWrote ${out.length} verified records → ${OUT}`);
  console.log('Verdicts:', JSON.stringify(byVerdict));
  console.log(`Actions: ${movesKept} your_move kept, ${movesDropped} dropped (unverified/low-confidence).`);
  console.log('Next: node ingest-synthesis.js');
})();
