#!/usr/bin/env node
// Backfill task_comments by mining routines.jsonl.
// Targets two event kinds with real content:
//   - commitment_made              (gemini → meeting commitments)
//   - current_md_update_proposed   (nova → "current state" proposed diffs)
// Matches an event to a task only when the event text contains the task's
// jira_key OR enough overlap with significant title words. Idempotent: skips
// if an identical (task_id, source_ts) comment already exists.

const fs = require('fs');
const path = require('path');
const db = require('./db');

const LOG = process.env.ROUTINES_LOG ||
  path.join(process.env.HOME, '.claude/projects/-Users-you/memory/routines.jsonl');

const STOPWORDS = new Set([
  'the','a','an','of','to','in','on','for','with','and','or','but','at','by',
  'from','as','is','are','was','were','be','been','being','have','has','had',
  'this','that','these','those','it','its','their','his','her','our','your',
  'amp','jordan','task','tasks','build','setup','create','update','add','use',
  'nova','via','per','vs','etc','via','new','old',
]);

function tokens(s) {
  return (s||'')
    .toLowerCase()
    .replace(/[^a-z0-9\s+-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function loadTasks() {
  const rows = db.prepare('SELECT id, short_id, jira_key, title, merchant FROM tasks').all();
  return rows.map(t => ({
    ...t,
    titleTokens: tokens(t.title),
    merchantToken: t.merchant ? t.merchant.toLowerCase() : null,
  }));
}

function matchTask(text, tasks) {
  const lc = text.toLowerCase();
  const matches = [];
  for (const t of tasks) {
    // Strongest: jira_key appears verbatim
    if (t.jira_key && lc.includes(t.jira_key.toLowerCase())) {
      matches.push({ task: t, why: `jira_key ${t.jira_key}`, strength: 10 });
      continue;
    }
    // Merchant match (RetailerX, Contoso, Globex, etc.)
    if (t.merchantToken && lc.includes(t.merchantToken)) {
      // Plus any title-token overlap to avoid false positives
      const overlap = t.titleTokens.filter(w => lc.includes(w)).length;
      if (overlap >= 1) matches.push({ task: t, why: `merchant+title overlap`, strength: 5 + overlap });
      continue;
    }
    // Title-token overlap (need at least 2 significant tokens to count)
    const hit = t.titleTokens.filter(w => lc.includes(w));
    if (hit.length >= 2) {
      matches.push({ task: t, why: `title:${hit.slice(0,3).join(',')}`, strength: hit.length });
    }
  }
  matches.sort((a,b) => b.strength - a.strength);
  return matches.slice(0, 3); // top 3 to avoid spamming many tasks per event
}

function alreadyHasComment(taskId, sourceTs) {
  // Idempotency: check if a backfill comment with this source_ts already exists.
  // We stash source_ts at the end of the body as a marker.
  const row = db.prepare(
    `SELECT id FROM task_comments WHERE task_id = ? AND body LIKE ?`
  ).get(taskId, `%[backfill:${sourceTs}]`);
  return !!row;
}

function insertComment(taskId, author, body, createdAt) {
  db.prepare(
    `INSERT INTO task_comments (task_id, author, body, created_at) VALUES (?,?,?,?)`
  ).run(taskId, author, body, createdAt);
}

function main() {
  if (!fs.existsSync(LOG)) {
    console.error(`No log at ${LOG}`);
    process.exit(1);
  }
  const tasks = loadTasks();
  console.log(`Loaded ${tasks.length} tasks. Streaming ${LOG}…`);

  const lines = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean);
  let scanned = 0, matched = 0, inserted = 0, skippedDup = 0;

  for (const line of lines) {
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }
    if (!evt.ts) continue;

    let body = null, author = 'amp', kindLabel = null;
    if (evt.kind === 'commitment_made' && evt.detail) {
      body = evt.detail.trim();
      author = evt.source === 'gemini' ? 'gemini' : 'amp';
      kindLabel = '📌 commitment';
    } else if (evt.kind === 'current_md_update_proposed' && (evt.diff_summary || evt.proposed_diff)) {
      body = (evt.diff_summary || '').trim();
      // Trim proposed_diff to a useful preview
      if (evt.proposed_diff) {
        const preview = evt.proposed_diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).slice(0, 6).join('\n');
        if (preview) body = (body ? body + '\n\n' : '') + preview;
      }
      author = 'amp';
      kindLabel = '📝 state-update';
    } else {
      continue;
    }
    scanned++;
    if (!body || body.length < 12) continue;

    const matches = matchTask(body, tasks);
    if (!matches.length) continue;
    matched++;

    for (const m of matches) {
      if (alreadyHasComment(m.task.id, evt.ts)) { skippedDup++; continue; }
      const tagged =
        `${kindLabel} (matched: ${m.why})\n\n${body}\n\n[backfill:${evt.ts}]`;
      // Use the event timestamp as created_at so the comment lands chronologically.
      const created = evt.ts.replace('T', ' ').replace(/Z$/, '');
      insertComment(m.task.id, author, tagged, created);
      inserted++;
    }
  }

  console.log(`\n— Done —`);
  console.log(`  scanned events:    ${scanned}`);
  console.log(`  matched events:    ${matched}`);
  console.log(`  inserted comments: ${inserted}`);
  console.log(`  skipped duplicates: ${skippedDup}`);
}

if (require.main === module) main();
