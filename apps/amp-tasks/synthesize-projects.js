#!/usr/bin/env node
// synthesize-projects.js — REASONING-BASED enrichment of the control-center
// `projects` table (the entity that feeds the timeline drawers + connection layer).
//
// Root-level design (no second store, nothing to reconcile):
//   sources ──already-ingested──▶ projects + project_artifacts (PRD/ERD snippets)
//                                 + tasks (live Jira, sprint cycle) + decisions
//        │
//        ├─ this script gathers each project's evidence and asks Claude (via the
//        │  headless gateway seam in llm.js — same path Claude Code uses, ADR-0008)
//        │  to REASON a fresh {status_synthesis, blocker, your_move, health} —
//        │  not a mechanical scrape.
//        │
//        └─▶ emits /tmp/synthesis-reasoned.jsonl in the exact schema ingest-synthesis.js
//            already consumes, so the write-back path stays SINGLE and idempotent.
//
// Run:  node synthesize-projects.js && node ingest-synthesis.js && bash refresh-planners.sh
// (refresh-planners.sh is the deterministic deploy tail; see REFRESH.md.)
//
// Guardrails: reads are sensor work; all writes are LOCAL (repo /tmp + local DB).
// Nothing is written back to Jira/Confluence/Slack/Drive. No PII in output.

const fs = require('fs');
const db = require('./db');
const { claude, parseJSON } = require('./llm');

const OUT = '/tmp/synthesis-reasoned.jsonl';
const ROADMAPS = ['Payments', 'Experience'];
const CONCURRENCY = 6;
const MODEL = process.env.AMP_SYNTH_MODEL || 'sonnet';
const norm = s => String(s || '').toLowerCase().replace(/[\[\]]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ── gather evidence per project ────────────────────────────────────────────
const LIMIT = parseInt(process.env.AMP_SYNTH_LIMIT || '0', 10) || 0; // 0 = all (test knob)
let projects = db.prepare(
  `SELECT id,name,pcr,theme,area,roadmap,priority,kr,target,eng_weeks,summary,
          status_synthesis,blocker,your_move,health,source_url,last_synthesis_at
     FROM projects WHERE roadmap IN (${ROADMAPS.map(() => '?').join(',')}) ORDER BY id`
).all(...ROADMAPS);
if (LIMIT > 0) projects = projects.slice(0, LIMIT);

const artStmt  = db.prepare(`SELECT kind,title,snippet,url FROM project_artifacts WHERE project_id=? ORDER BY ts DESC LIMIT 12`);
const decStmt  = db.prepare(`SELECT kind,title,due_date FROM decisions WHERE project_id=? AND resolved_at IS NULL`);
const allTasks = db.prepare(`SELECT project,jira_key,jira_status,status,cycle,assignee,title FROM tasks`).all();
// planner canonical record (deck-derived) matched by normalized name
const plannerRows = db.prepare(`SELECT best_name,name,key,theme,okr,quarter,half,owners,notes,summary,status_narrative,span_weeks,pcr FROM planner_projects`).all();
const plannerByNorm = {};
for (const p of plannerRows) { const n = norm(p.best_name || p.name || p.key); if (n && !plannerByNorm[n]) plannerByNorm[n] = p; }

function evidenceFor(p) {
  const nm = norm(p.name);
  const arts = artStmt.all(p.id).map(a => ({ kind: a.kind, title: a.title, snippet: (a.snippet || '').slice(0, 400) }));
  const tasks = allTasks.filter(t =>
    (t.project && norm(t.project) === nm) ||
    (p.pcr && t.jira_key && t.jira_key.toUpperCase() === p.pcr.toUpperCase())
  ).map(t => ({ title: t.title || t.project, jira: t.jira_key, jira_status: t.jira_status, status: t.status, cycle: t.cycle, owner: t.assignee }));
  const decs = decStmt.all(p.id).map(d => ({ kind: d.kind, title: d.title, due: d.due_date }));
  const planner = plannerByNorm[nm] || null;
  return {
    project: { name: p.name, pcr: p.pcr, theme: p.theme, area: p.area, roadmap: p.roadmap,
      priority: p.priority, kr: p.kr, target: p.target, eng_weeks: p.eng_weeks, summary: p.summary },
    // NOT evidence — this is the prior read, for continuity only. The SYSTEM prompt
    // instructs the model to diff against new evidence and NOT restate this.
    prior_synthesis: { as_of: p.last_synthesis_at || null, status_synthesis: p.status_synthesis,
      blocker: p.blocker, your_move: p.your_move, health: p.health },
    prd_erd_artifacts: arts,
    live_tasks: tasks,
    open_decisions: decs,
    deck_record: planner && {
      theme: planner.theme, okr: planner.okr, quarter: planner.quarter || planner.half,
      owners: planner.owners, span_weeks: planner.span_weeks,
      notes: (planner.notes || '').slice(0, 300), summary: (planner.summary || '').slice(0, 300),
      status_narrative: (planner.status_narrative || '').slice(0, 400),
    },
  };
}

const SYSTEM = `You are Amp, Jordan Rivera's executive control-center synthesizer for Acme Payments & Experience.
You are given ONE project's evidence: PRD/ERD artifact snippets, live Jira tasks (with sprint cycle), open decisions, the deck record — AND prior_synthesis (your OWN output from last cycle, with as_of date).
REASON about the true CURRENT state from the evidence. Rules — follow exactly:
  - GROUND every claim in the evidence. Name what moved (a Jira status, an artifact, a decision). Recency wins: newer signal outranks older.
  - prior_synthesis is CONTEXT, NOT evidence. Do NOT restate or re-affirm it. If nothing in the artifacts/live_tasks/open_decisions is newer than prior_synthesis.as_of, then there is NO new signal: say so plainly, set health to "unknown" or "yellow" (never a confident red/green off stale input), and lower confidence.
  - ANTI-REPETITION (critical): if your_move would be essentially the same ask as prior_synthesis.your_move AND no new evidence shows the prior ask was acted on, do NOT re-issue it. Set your_move to null and state in status_synthesis that the prior ask is still unactioned/stuck.
Register: terse, verdict-first, no hedging, no filler, no continuity disclaimers.
Return ONLY a JSON object, no prose, with keys:
  "status_synthesis": 1-3 sentences on what is really happening NOW, anchored to the most recent evidence. If evidence is thin/stale, say the state is uncertain.
  "health": exactly one of "green" | "yellow" | "red" | "unknown". green=on track, yellow=at risk/watch, red=blocked/off-track, unknown=insufficient signal.
  "blocker": the single most important blocker as a short phrase, or null if none.
  "your_move": the single most important NEW action PRINCIPAL must take, action-verb first (Approve/Decline/Draft/Confirm/Review/Escalate/Ratify/Ship/Hold/Delegate/Schedule/...), or null (null if nothing new is on them OR the prior ask is merely being repeated).
  "confidence": a number 0..1 for how well-grounded this is in NEW evidence (not in prior_synthesis).`;

async function synth(p) {
  const ev = evidenceFor(p);
  const user = `PROJECT EVIDENCE:\n${JSON.stringify(ev, null, 1)}`;
  const { text } = await claude([{ role: 'user', content: user }], { model: MODEL, system: SYSTEM, maxTokens: 600, temperature: 0 });
  const j = parseJSON(text);
  // This is only the PROPOSED health. verify-synthesis.js is the authority on the
  // final verdict: its deterministic gate forces red→unknown when a red has no live
  // movement / no tasks / no artifact-evidenced blocker, and its independent LLM
  // re-check can correct the rest. So we don't clamp here — the SYSTEM prompt already
  // tells the model to use unknown/lower confidence on stale input.
  const health = ['green', 'yellow', 'red', 'unknown'].includes(j.health) ? j.health : 'unknown';
  return {
    type: 'synthesis', project_id: p.id,
    status_synthesis: (j.status_synthesis || '').trim() || null,
    blocker: (j.blocker || null) && String(j.blocker).trim() || null,
    your_move: (j.your_move || null) && String(j.your_move).trim() || null,
    health,
    _confidence: typeof j.confidence === 'number' ? j.confidence : null,
    _name: p.name,
  };
}

// ── bounded-concurrency pool over all projects ─────────────────────────────
(async () => {
  const out = [];
  let i = 0, ok = 0, fail = 0;
  async function worker() {
    while (i < projects.length) {
      const p = projects[i++];
      try {
        const r = await synth(p);
        out.push(r);
        ok++;
        process.stdout.write(`  ✓ [${r.health}] ${r._name}${r._confidence != null ? ` (${Math.round(r._confidence * 100)}%)` : ''}\n`);
      } catch (e) {
        fail++;
        process.stdout.write(`  ✗ ${p.name}: ${String(e.message || e).slice(0, 80)}\n`);
      }
    }
  }
  console.log(`Reasoning over ${projects.length} control-center projects (model=${MODEL}, concurrency=${CONCURRENCY})…`);
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  // Carry confidence THROUGH — the verify stage + UI provenance depend on it.
  // (Previously dropped here; that blinded the whole closed loop.)
  const lines = out.map(r => JSON.stringify({
    type: r.type, project_id: r.project_id, status_synthesis: r.status_synthesis,
    blocker: r.blocker, your_move: r.your_move, health: r.health,
    confidence: r._confidence,
  }));
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  // Stamp reason-stage freshness so the dashboard can show honest staleness.
  try { db.prepare(`UPDATE state SET value=datetime('now'), updated_at=datetime('now') WHERE key='last_synthesis_at'`).run(); } catch (e) {}
  const byHealth = out.reduce((m, r) => (m[r.health] = (m[r.health] || 0) + 1, m), {});
  console.log(`\nWrote ${out.length} synthesis records → ${OUT}  (ok=${ok} fail=${fail})`);
  console.log('Health distribution:', JSON.stringify(byHealth));
  console.log('Next: node ingest-synthesis.js && bash refresh-planners.sh');
})();
