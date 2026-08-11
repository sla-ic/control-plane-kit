#!/usr/bin/env node
// Ingest the four enrichment-agent JSON outputs into task_comments.
// Idempotent: every inserted comment carries a [backfill:<source>:<ts>] marker;
// re-runs skip duplicates.
//
// Inputs (all optional — missing files are skipped with a log message):
//   /tmp/amp-enrich-glean.json   — Jira status refresh + recent-activity summary
//   /tmp/amp-enrich-slack.json   — Slack mentions per task
//   /tmp/amp-enrich-gmail.json   — Gmail mentions per task
//   /tmp/amp-enrich-gemini.json  — Gemini meeting-notes matches per task
//
// Also: if Glean reports a status drift (current != previous), update tasks.jira_status.

const fs = require('fs');
const db = require('./db');

const INPUTS = {
  glean:       '/tmp/amp-enrich-glean.json',
  slack:       '/tmp/amp-enrich-slack.json',
  gmail:       '/tmp/amp-enrich-gmail.json',
  gemini_jsonl:'/tmp/amp-enrich-gemini.jsonl',   // v2 streaming output (avoids large-write hang)
};

function loadJson(path) {
  if (!fs.existsSync(path)) { console.log(`  (skip) ${path} not found`); return null; }
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch (e) { console.log(`  (skip) ${path} unparseable: ${e.message}`); return null; }
}

function loadJsonl(path) {
  if (!fs.existsSync(path)) { console.log(`  (skip) ${path} not found`); return []; }
  const rows = [];
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch (e) { /* skip malformed line */ }
  }
  return rows;
}

function hasBackfill(taskId, marker) {
  const row = db.prepare(
    `SELECT id FROM task_comments WHERE task_id = ? AND body LIKE ?`
  ).get(taskId, `%[${marker}]`);
  return !!row;
}

const insertComment = db.prepare(
  `INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?,?,?,?)`
);

function isoToSqlite(s) {
  if (!s) return new Date().toISOString().replace('T', ' ').replace(/Z$/, '');
  return String(s).replace('T', ' ').replace(/Z$/, '').slice(0, 19);
}

// ── Glean: refresh jira_status + add activity comment ──
function ingestGlean(data) {
  if (!Array.isArray(data)) return { inserted: 0, dups: 0, drifts: 0 };
  let inserted = 0, dups = 0, drifts = 0;
  const updateStatus = db.prepare(`UPDATE tasks SET jira_status = ? WHERE id = ?`);
  for (const r of data) {
    if (!r.task_id) continue;
    if (r.current_status && r.current_status !== r.previous_status) {
      updateStatus.run(r.current_status, r.task_id);
      drifts++;
    }
    if (!r.summary) continue;
    const marker = `glean:${r.jira_key || r.task_id}:${r.fetched_at || 'now'}`;
    if (hasBackfill(r.task_id, marker)) { dups++; continue; }
    const url = r.url ? `\n\n${r.url}` : '';
    const body = `🔄 Jira (Glean refresh)\nStatus: ${r.previous_status || '?'} → ${r.current_status || '?'}\n\n${r.summary}${url}\n\n[${marker}]`;
    insertComment.run(r.task_id, 'glean', body, isoToSqlite(r.fetched_at));
    inserted++;
  }
  return { inserted, dups, drifts };
}

// ── Slack: one comment per mention ──
function ingestSlack(data) {
  if (!Array.isArray(data)) return { inserted: 0, dups: 0 };
  let inserted = 0, dups = 0;
  for (const r of data) {
    if (!r.task_id || !Array.isArray(r.mentions)) continue;
    for (const m of r.mentions) {
      const marker = `slack:${m.ts || m.permalink || m.snippet?.slice(0,40)}`;
      if (hasBackfill(r.task_id, marker)) { dups++; continue; }
      const link = m.permalink ? `\n${m.permalink}` : '';
      const who = m.author ? ` · @${m.author}` : '';
      const chan = m.channel ? `#${m.channel}` : '';
      const body = `💬 Slack ${chan}${who}\n\n${m.snippet || ''}${link}\n\n[${marker}]`;
      insertComment.run(r.task_id, 'slack', body, isoToSqlite(m.ts && /^\d/.test(String(m.ts)) ? new Date(Number(String(m.ts).split('.')[0]) * 1000).toISOString() : m.ts));
      inserted++;
    }
  }
  return { inserted, dups };
}

// ── Gmail: one comment per email ──
function ingestGmail(data) {
  if (!Array.isArray(data)) return { inserted: 0, dups: 0 };
  let inserted = 0, dups = 0;
  for (const r of data) {
    if (!r.task_id || !Array.isArray(r.emails)) continue;
    for (const e of r.emails) {
      const marker = `gmail:${e.thread_id || e.subject?.slice(0,40)}:${e.date || ''}`;
      if (hasBackfill(r.task_id, marker)) { dups++; continue; }
      const subj = e.subject ? `**${e.subject}**\n` : '';
      const from = e.from ? `from ${e.from}\n` : '';
      const body = `📧 Email\n${from}${subj}\n${e.snippet || ''}\n\n[${marker}]`;
      insertComment.run(r.task_id, 'gmail', body, isoToSqlite(e.date));
      inserted++;
    }
  }
  return { inserted, dups };
}

// ── Gemini: one comment per meeting match (JSONL stream) ──
function ingestGemini(matches) {
  if (!Array.isArray(matches)) return { inserted: 0, dups: 0 };
  let inserted = 0, dups = 0;
  for (const m of matches) {
    if (!m.task_id) continue;
    const marker = `gemini:${m.source_url || m.meeting_title?.slice(0,40)}:${m.meeting_date || ''}`;
    if (hasBackfill(m.task_id, marker)) { dups++; continue; }
    const participants = Array.isArray(m.participants) ? m.participants.join(', ') : '';
    const title = m.meeting_title ? `**${m.meeting_title}**\n` : '';
    const who = participants ? `_${participants}_\n` : '';
    const link = m.source_url ? `\n\n${m.source_url}` : '';
    const commit = m.commitment ? `\n\n🎯 Commitment: ${m.commitment}` : '';
    const decision = m.decision ? `\n\n⚖️ Decision: ${m.decision}` : '';
    const body = `🎙️ Gemini meeting\n${title}${who}\n${m.snippet || ''}${commit}${decision}${link}\n\n[${marker}]`;
    insertComment.run(m.task_id, 'gemini', body, isoToSqlite(m.meeting_date));
    inserted++;
  }
  return { inserted, dups };
}

console.log('Ingesting enrichment outputs…\n');

const glean  = loadJson(INPUTS.glean);
const slack  = loadJson(INPUTS.slack);
const gmail  = loadJson(INPUTS.gmail);
const gemini = loadJsonl(INPUTS.gemini_jsonl);

const txn = db.transaction(() => {
  const g = glean  ? ingestGlean(glean)   : { inserted: 0, dups: 0, drifts: 0 };
  const s = slack  ? ingestSlack(slack)   : { inserted: 0, dups: 0 };
  const e = gmail  ? ingestGmail(gmail)   : { inserted: 0, dups: 0 };
  const m = gemini ? ingestGemini(gemini) : { inserted: 0, dups: 0 };
  console.log(`\n— Ingest summary —`);
  console.log(`  Glean:  +${g.inserted}  (${g.dups} dup, ${g.drifts} status drift)`);
  console.log(`  Slack:  +${s.inserted}  (${s.dups} dup)`);
  console.log(`  Gmail:  +${e.inserted}  (${e.dups} dup)`);
  console.log(`  Gemini: +${m.inserted}  (${m.dups} dup)`);
  console.log(`  Total inserted: ${g.inserted + s.inserted + e.inserted + m.inserted}`);
});
txn();

// Tasks covered (have ≥1 enrichment comment now)
const covered = db.prepare(`
  SELECT COUNT(DISTINCT task_id) as n FROM task_comments
  WHERE body LIKE '%[glean:%]' OR body LIKE '%[slack:%]' OR body LIKE '%[gmail:%]' OR body LIKE '%[gemini:%]'
`).get();
const total = db.prepare(`SELECT COUNT(*) as n FROM tasks`).get();
console.log(`\nCoverage: ${covered.n}/${total.n} tasks have ≥1 enrichment comment.`);
