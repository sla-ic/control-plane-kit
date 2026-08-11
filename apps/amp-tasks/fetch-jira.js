#!/usr/bin/env node
/*
 * fetch-jira.js — the AUTONOMOUS half of the Jira spine (audit: "frozen-feeders").
 *
 * sync-jira.js was the loader for an ATTENDED pattern: a human called the Jira MCP
 * tool, saved the JSON, then ran the loader. That left the task board frozen the
 * moment nobody was at the keyboard — the exact laptop-tie the audit flagged. Now
 * that Jira is connected as a runtime MCP (mcpgw `jira` server, read:jira-work),
 * this worker closes the loop: it pulls Jordan's open issues over the SAME
 * floor-gated transport every other worker uses (mcp-dispatch.jiraCall), writes the
 * pull JSON in the shape sync-jira.js already ingests, and invokes the loader — all
 * unattended, on the cycle-b beat.
 *
 * READ-ONLY: uses execute_jql / list_sites only. Every jira mutating verb is
 * hard-denied by the floor (jira create_/update_/delete_/transition_/comment_/
 * add_/remove_ patterns) — proven in mcp-dispatch.js --selftest. If a future edit
 * ever tries a write via jiraCall, the floor blocks it before egress.
 *
 * Usage: node fetch-jira.js [--dry] [--no-sync] [--limit 200] [--jql "<JQL>"]
 *   --dry      fetch + write the pull file, do NOT run the loader or stamp fleet_runs
 *   --no-sync  fetch + write the pull file, skip the sync-jira.js invocation
 *   env AMP_JIRA_JQL overrides the default JQL; AMP_JIRA_LIMIT the cap.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { jiraCall, FloorViolation } = require('./mcp-dispatch');
const db = require('./db');

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DRY = has('--dry');
const NO_SYNC = has('--no-sync');
const LIMIT = parseInt(arg('--limit', process.env.AMP_JIRA_LIMIT || '200'), 10);
// Default: Jordan's own not-done work, freshest first. Overridable for a wider pull
// (e.g. add `OR reporter = currentUser()`) without touching code.
const JQL = arg('--jql', process.env.AMP_JIRA_JQL ||
  'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC');
// Only the fields sync-jira.js reads — keeps the payload small (Jira issues carry
// ~200 custom fields otherwise) and the pull deterministic.
const FIELDS = ['summary', 'status', 'priority', 'project', 'duedate', 'issuelinks', 'labels', 'issuetype', 'reporter', 'assignee'];
const PAGE = 100; // execute_jql page size
const OUT = path.join(__dirname, 'state', 'jira-pull.json');

const RUN_ID = `fetch-jira-${process.pid}-${process.hrtime()[1]}`;
const WORKER = 'amp-fetch-jira';
function runStart() { if (DRY) return; try { db.prepare(`INSERT INTO fleet_runs (run_id, worker, host, model, status) VALUES (?,?,?,?,'running')`).run(RUN_ID, WORKER, require('os').hostname(), 'none'); } catch (_) {} }
function runEnd(status, considered, errors) { if (DRY) return; try { db.prepare(`UPDATE fleet_runs SET status=?, considered=?, errors=?, ended_at=datetime('now') WHERE run_id=?`).run(status, considered || 0, errors || 0, RUN_ID); } catch (_) {} }

async function siteBaseUrl() {
  // execute_jql issues carry only `self` (the REST API url), but sync-jira.js
  // writes a human `webUrl` (…/browse/KEY). Derive the browse base from list_sites.
  try {
    const r = await jiraCall('list_sites', {});
    const site = r.json && (Array.isArray(r.json.items) ? r.json.items.find(s => s.is_current) || r.json.items[0] : r.json);
    if (site && site.url) return String(site.url).replace(/\/+$/, '');
  } catch (_) { /* fall through to null base */ }
  return null;
}

async function pull() {
  const issues = [];
  let startAt = 0;
  let total = Infinity;
  while (issues.length < Math.min(total, LIMIT)) {
    const maxResults = Math.min(PAGE, LIMIT - issues.length);
    const r = await jiraCall('execute_jql', { jql: JQL, fields: FIELDS, max_results: maxResults, start_at: startAt });
    const wrap = r.json || {};
    const batch = Array.isArray(wrap.issues) ? wrap.issues : [];
    total = Number.isFinite(wrap.total) ? wrap.total : batch.length;
    if (!batch.length) break;
    issues.push(...batch);
    startAt += batch.length;
    if (batch.length < maxResults) break; // last page
  }
  return { issues, total };
}

(async () => {
  runStart();
  try {
    const base = await siteBaseUrl();
    const { issues, total } = await pull();
    // Shape → sync-jira.js's `{nodes:[...]}`, adding webUrl each loader expects.
    const nodes = issues.map((it) => ({
      ...it,
      webUrl: base && it.key ? `${base}/browse/${it.key}` : (it.self || null),
    }));
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ nodes, total, fetched_jql: JQL }, null, 2));
    console.log(`fetch-jira ${DRY ? '(DRY) ' : ''}pulled ${nodes.length}/${total} issue(s) → ${OUT}`);

    if (DRY || NO_SYNC) {
      console.log(`fetch-jira: ${DRY ? 'dry' : 'no-sync'} — loader not invoked.`);
      runEnd('ok', nodes.length, 0);
      return;
    }
    // Hand off to the existing idempotent loader (upsert on jira_key).
    const out = execFileSync(process.execPath, [path.join(__dirname, 'sync-jira.js'), OUT], { encoding: 'utf8' });
    process.stdout.write(out);
    runEnd('ok', nodes.length, 0);
  } catch (e) {
    if (e instanceof FloorViolation) console.error(`fetch-jira FLOOR-BLOCKED: ${e.message} (${e.tool})`);
    else console.error('fetch-jira FAILED:', e.message);
    runEnd('crashed', 0, 1);
    process.exit(1);
  }
})();
