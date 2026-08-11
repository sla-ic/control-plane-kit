#!/usr/bin/env node
/*
 * adjudicate.js — Cycle B (the reasoning cycle) of the two-cycle control plane.
 *
 * THE TWO CYCLES
 *   Cycle A (Import) — mechanical, cheap, frequent. sync-jira.js + enrich-*.
 *                      Moves data in. No thinking.
 *   Cycle B (this)   — expensive, sequenced, real cognition. Reads the flagged
 *                      delta, *understands* each item (is this flag real or
 *                      noise?), stages a next step OR escalates. This is the
 *                      "1+1=11" layer — it does NOT replicate dirty data a layer
 *                      deeper; it adjudicates it.
 *
 * SEAM: the two cycles never call each other. They meet at tasks.db +
 * routines.jsonl. That's what lets Cycle B run headless, off-terminal, under
 * launchd, on its own cadence — independent of any interactive session.
 *
 * FLOOR (this slice): read-only against Acme systems; writes ONLY to the
 * local tasks.db (advisory task_comments) + routines.jsonl. No outward
 * actuators. Escalations are STAGED (printed / optionally posted to the
 * whitelisted #amp-alerts with --post) — never sent silently. Collab-first:
 * Amp proposes, Jordan ratifies in the dash.
 *
 * USAGE
 *   node adjudicate.js                 # reason over flagged items, write advisory comments
 *   node adjudicate.js --limit 5       # bound the batch (default 8)
 *   node adjudicate.js --dry-run       # reason + print, write NOTHING
 *   node adjudicate.js --model opus    # heavier reasoning (default sonnet)
 *   node adjudicate.js --post          # also post escalations to #amp-alerts (gated; off by default)
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { claude, parseJSON } = require('./llm');

// ── args ──
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const has = (name) => argv.includes(name);
const LIMIT = parseInt(arg('--limit', '8'), 10);
const MODEL = arg('--model', 'sonnet');
const DRY = has('--dry-run');
const POST = has('--post');
const DASH = process.env.AMP_DASH_URL || 'http://localhost:3737';

// ── routines.jsonl event contract (conventions §2) ──
const LOG = process.env.ROUTINES_LOG
  || path.join(process.env.HOME, '.claude/projects/-Users-you/memory/routines.jsonl');
const RUN_ID = `adj-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const WORKER = 'amp-adjudicate';
const HOST = process.env.AMP_FLEET_HOST || 'local'; // 'local' (launchd) | 'cloud-runner' (cloud run)
function emit(kind, extra = {}) {
  const evt = { ts: new Date().toISOString(), routine: WORKER, run_id: RUN_ID, source: 'amp-cycle-b', kind, ...extra };
  try { fs.appendFileSync(LOG, JSON.stringify(evt) + '\n'); } catch (e) { /* log is best-effort */ }
}

// ── fleet audit trail (SQL surface; JSONL stays the portable log) ──
function auditRunStart() {
  if (DRY) return;
  try {
    db.prepare(`INSERT INTO fleet_runs (run_id, worker, host, model, status) VALUES (?,?,?,?,'running')`)
      .run(RUN_ID, WORKER, HOST, MODEL);
  } catch (e) { /* audit is best-effort, never blocks reasoning */ }
}
function auditDecision(task, v, usage) {
  if (DRY) return;
  try {
    const verdict = v.noise ? 'noise' : (v.escalate ? 'escalate' : 'staged');
    const dclass = ['objective_auto', 'subjective_principal', 'unclear'].includes(v.decision_class)
      ? v.decision_class : null;
    db.prepare(`INSERT INTO fleet_decisions
      (run_id, task_id, worker, bucket, verdict, noise, escalate, read, next_step, owner, confidence, rationale, model, input_tokens, output_tokens, decision_class, class_confidence, class_rationale)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      RUN_ID, task.id, WORKER, task._bucket, verdict, v.noise ? 1 : 0, v.escalate ? 1 : 0,
      v.read || null, v.next_step || null, v.owner || null,
      typeof v.confidence === 'number' ? v.confidence : null, v.rationale || null,
      usage.model || MODEL, usage.input_tokens || 0, usage.output_tokens || 0,
      dclass, typeof v.class_confidence === 'number' ? v.class_confidence : null, v.class_rationale || null);
  } catch (e) { /* best-effort */ }
}
function auditRunEnd(counts) {
  if (DRY) return;
  try {
    db.prepare(`UPDATE fleet_runs SET status=?, considered=?, reasoned=?, staged=?, noise=?, escalated=?, errors=?, input_tokens=?, output_tokens=?, ended_at=datetime('now') WHERE run_id=?`)
      .run(counts.status, counts.considered, counts.reasoned, counts.staged, counts.noise, counts.escalated, counts.errors, counts.input_tokens, counts.output_tokens, RUN_ID);
  } catch (e) { /* best-effort */ }
}

// ── feeder: the flagged delta (reuse the dash's rule-bucketing) ──
async function fetchFlagged() {
  const res = await fetch(`${DASH}/api/adjudication`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`adjudication feed HTTP ${res.status}`);
  const data = await res.json();
  const buckets = data.buckets || {};
  const seen = new Set();
  const items = [];
  // Priority order: the buckets most likely to hide a real miss come first.
  const order = ['blocked_no_reason', 'jira_drift', 'stuck_in_progress', 'overdue', 'stale', 'amp_runnable'];
  for (const bucket of order) {
    for (const t of buckets[bucket] || []) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      items.push({ ...t, _bucket: bucket });
    }
  }
  return items;
}

// ── idempotency: skip a task already adjudicated at its current updated_at ──
function marker(task) { return `[cycle-b:${task.updated_at}]`; }
function alreadyDone(task) {
  const row = db.prepare(`SELECT id FROM task_comments WHERE task_id = ? AND body LIKE ?`)
    .get(task.id, `%${marker(task)}`);
  return !!row;
}

function recentComments(taskId) {
  return db.prepare(
    `SELECT author, body, created_at FROM task_comments WHERE task_id = ? ORDER BY created_at DESC LIMIT 5`
  ).all(taskId).reverse();
}

// ── the reasoning prompt — where 1+1=11 lives ──
const SYSTEM = `You are Amp, Jordan Rivera's chief-of-staff reasoning layer inside his personal control plane at Acme (Jordan leads Payments Platform + Commerce Experience).

A rule engine has FLAGGED a task as needing attention. Rules are dumb: they fire on dates and status mismatches. Your job is the judgment the rule can't do — decide whether the flag is REAL or NOISE, and if real, what the single most useful next move is.

Think like a sharp CoS, not a status bot:
- Is this flag a genuine miss, or an artifact (e.g. a stale seed date on a long-closed onboarding item, a Jira/local status lag that's already resolved)?
- What's the actual situation and the real risk if ignored?
- What is the ONE concrete next step Jordan (or Amp) should take — specific enough to act on in one move?
- Does this need to ESCALATE to Jordan now, or can it just sit as a staged suggestion?

Return STRICT JSON, no prose outside it:
{
  "noise": true|false,                // true if the flag is a false alarm / artifact
  "read": "one-sentence situation read, concrete and specific",
  "next_step": "the single most useful concrete next action (imperative)",
  "owner": "jordan" | "amp" | "waiting",   // who should take next_step
  "escalate": true|false,             // true only if Jordan should see this now
  "confidence": 0.0-1.0,
  "rationale": "one sentence on why noise/escalate call",
  "decision_class": "objective_auto" | "subjective_principal" | "unclear",
  "class_confidence": 0.0-1.0,
  "class_rationale": "one sentence: why this is the fleet's call vs Jordan's"
}
For decision_class, judge ONLY the nature of the decision, independent of escalate:
- "objective_auto": mechanically decidable from facts/policy — a competent CoS with the
  same data would reach the same answer (e.g. a status-lag artifact, a clearly-stale flag).
- "subjective_principal": needs Jordan's judgment, priorities, relationships, or authority.
- "unclear": genuinely ambiguous which it is.
This is OBSERVABILITY ONLY — it does not change routing; escalate still governs what surfaces.
Be terse. If information is thin, say so in read and lower confidence — do not invent facts.`;

function buildUserMsg(task) {
  const cmts = recentComments(task.id);
  const ctx = cmts.length
    ? cmts.map((c) => `- (${c.created_at}, ${c.author}) ${String(c.body).replace(/\n+/g, ' ').slice(0, 240)}`).join('\n')
    : '(no prior comments)';
  const f = (k, v) => (v === null || v === undefined || v === '' ? null : `${k}: ${v}`);
  const fields = [
    f('title', task.title),
    f('description', task.description),
    f('project', task.project),
    f('department', task.department),
    f('priority', task.priority),
    f('severity', task.severity),
    f('status (local)', task.status),
    f('status (jira)', task.jira_status),
    f('jira_key', task.jira_key),
    f('due_date', task.due_date),
    f('time_horizon', task.time_horizon),
    f('blocked_reason', task.blocked_reason),
    f('waiting_on', task.waiting_on),
    f('current next_action', task.next_action),
    f('owner', task.owner),
    f('created_at', task.created_at),
    f('updated_at', task.updated_at),
  ].filter(Boolean).join('\n');
  return `FLAGGED BY RULE: "${task._bucket}"\n\nTASK #${task.id} (${task.short_id || ''})\n${fields}\n\nRECENT ACTIVITY:\n${ctx}\n\nAdjudicate. Return the JSON.`;
}

function writeComment(task, verdict, usage) {
  const badge = verdict.noise ? '🟡 likely-noise' : (verdict.escalate ? '🔴 escalate' : '🟢 staged');
  const conf = typeof verdict.confidence === 'number' ? ` · conf ${(verdict.confidence * 100).toFixed(0)}%` : '';
  const body = [
    `🧠 Cycle B — adjudication ${badge}${conf}`,
    ``,
    `Read: ${verdict.read}`,
    `Next: ${verdict.next_step}  (${verdict.owner})`,
    `Why: ${verdict.rationale}`,
    ``,
    `[amp-cycle-b] ${marker(task)}`,
  ].join('\n');
  db.prepare(`INSERT INTO task_comments (task_id, author, body) VALUES (?, 'amp-cycle-b', ?)`).run(task.id, body);
}

async function postEscalations(escalations) {
  if (!escalations.length) return;
  // Staged outward action — gated behind --post. #amp-alerts is floor-whitelisted.
  // Uses the mcpgw Slack MCP over HTTP with the token stashed at ~/.config/amp/mcpgw.token.
  const tokenPath = path.join(process.env.HOME, '.config/amp/mcpgw.token');
  if (!fs.existsSync(tokenPath)) { console.log('   (--post set but no mcpgw token; skipping Slack)'); return; }
  const token = fs.readFileSync(tokenPath, 'utf8').trim();
  const CHANNEL = process.env.AMP_ALERTS_CHANNEL || 'C0AMPALERT'; // #amp-alerts
  const lines = escalations.map((e) => `• *#${e.task.id} ${e.task.title}* — ${e.verdict.read}\n   → ${e.verdict.next_step} (${e.verdict.owner})`);
  const text = `[Amp, on behalf of Jordan] Cycle B flagged ${escalations.length} item(s) for your call:\n\n${lines.join('\n\n')}`;
  try {
    const res = await fetch(`https://mcp.mcpgw.com/slack/${token}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'send_message', arguments: { channel: CHANNEL, text } } }),
    });
    console.log(`   posted ${escalations.length} escalation(s) to #amp-alerts (HTTP ${res.status})`);
    emit('escalated', { count: escalations.length, channel: CHANNEL });
  } catch (e) {
    console.log(`   escalation post failed: ${e.message}`);
    emit('degraded', { where: 'slack_post', error: e.message });
  }
}

async function main() {
  emit('routine_start', { limit: LIMIT, model: MODEL, dry: DRY, host: HOST });
  auditRunStart();
  console.log(`\n🧠 Cycle B (adjudicate) — model=${MODEL} host=${HOST} limit=${LIMIT}${DRY ? ' [DRY-RUN]' : ''}\n`);

  let flagged;
  try { flagged = await fetchFlagged(); }
  catch (e) {
    console.error(`Feed unavailable: ${e.message}`);
    emit('degraded', { where: 'feed', error: e.message });
    emit('routine_end', { status: 'degraded' });
    process.exit(1);
  }

  const notDone = flagged.filter((t) => !alreadyDone(t));
  const skipped = flagged.length - notDone.length;
  const todo = notDone.slice(0, LIMIT);
  const deferred = notDone.length - todo.length;
  console.log(`${flagged.length} flagged · ${skipped} already adjudicated (idempotent skip) · ${todo.length} reasoning now${deferred ? ` · ${deferred} deferred past --limit` : ''}\n`);

  const escalations = [];
  let ok = 0, noise = 0, err = 0, inTok = 0, outTok = 0;

  // Sequenced one-at-a-time — respects the congestion-stall taxonomy (no parallel
  // gateway hammering). Each item is a bounded, cheap call.
  for (const task of todo) {
    process.stdout.write(`  #${task.id} ${String(task.title).slice(0, 52).padEnd(52)} [${task._bucket}] … `);
    try {
      const { text, usage } = await claude(
        [{ role: 'user', content: buildUserMsg(task) }],
        { model: MODEL, system: SYSTEM, maxTokens: 500, temperature: 0 }
      );
      const v = parseJSON(text);
      inTok += usage.input_tokens || 0; outTok += usage.output_tokens || 0;
      if (!DRY) { writeComment(task, v, usage); auditDecision(task, v, usage); }
      if (v.escalate) escalations.push({ task, verdict: v });
      if (v.noise) noise++; else ok++;
      const tag = v.noise ? '🟡 noise' : (v.escalate ? '🔴 escalate' : '🟢 staged');
      console.log(`${tag}  ${v.next_step ? '→ ' + String(v.next_step).slice(0, 60) : ''}`);
      emit('adjudicated', { task_id: task.id, bucket: task._bucket, noise: !!v.noise, escalate: !!v.escalate, confidence: v.confidence });
    } catch (e) {
      err++;
      console.log(`✗ ${e.message.slice(0, 80)}`);
      emit('degraded', { where: 'reason', task_id: task.id, error: e.message.slice(0, 200) });
    }
  }

  console.log(`\n— summary — staged:${ok} noise:${noise} escalate:${escalations.length} errors:${err}`);
  if (POST && !DRY) await postEscalations(escalations);
  else if (escalations.length) console.log(`   (${escalations.length} escalation(s) staged — run with --post to send to #amp-alerts)`);

  const status = err ? (ok + noise ? 'partial' : 'degraded') : 'ok';
  auditRunEnd({ status, considered: flagged.length, reasoned: todo.length, staged: ok, noise, escalated: escalations.length, errors: err, input_tokens: inTok, output_tokens: outTok });
  emit('routine_end', { status, staged: ok, noise, escalate: escalations.length, errors: err, input_tokens: inTok, output_tokens: outTok });
  console.log(`   tokens: ${inTok} in / ${outTok} out`);
  console.log('');
}

main().catch((e) => { emit('degraded', { where: 'main', error: e.message }); emit('routine_end', { status: 'crashed' }); console.error(e); process.exit(1); });
