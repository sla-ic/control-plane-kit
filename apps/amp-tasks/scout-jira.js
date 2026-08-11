#!/usr/bin/env node
/*
 * scout-jira.js — deterministic LIVE-Jira scout for the planner-refresh workflow.
 *
 * The workflow's LLM "jira scout" used to ToolSearch the Claude-Code tool registry
 * for MCP tools named getJiraIssue / searchJiraIssuesUsingJql — names that do NOT
 * exist in this harness. It always missed, hit its "if unavailable return []"
 * escape hatch, and the synth got zero live status. But Jira IS connected: the
 * mcpgw `jira` server (mcp__jira-guMCP-server__, same shared token as
 * confluence/slack), reached through the backend's floor-gated mcp-dispatch.jiraCall
 * with execute_jql — exactly how fetch-jira.js already pulls the task spine.
 *
 * This scout pulls LIVE status+summary for EVERY PROJ/PL key referenced across the
 * planner vocab (not just Jordan's assigned issues), in key-scoped JQL batches with
 * a minimal field set, and writes findings the synth agents read:
 *   { generated_at, count, by_org:{payments,experience,unknown}, findings:[
 *       { key, name, status, status_category, org, confidence } ] }
 *
 * READ-ONLY: execute_jql only — every mutating verb is hard-denied by the floor.
 *
 * Usage: node scout-jira.js [--batch 25] [--out state/jira-scout.json] [--quiet]
 */
const fs = require('fs');
const path = require('path');
const { jiraCall, FloorViolation } = require('./mcp-dispatch');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const QUIET = argv.includes('--quiet');
const BATCH = Math.max(1, parseInt(arg('--batch', '25'), 10));
const OUT = path.resolve(__dirname, arg('--out', 'state/jira-scout.json'));
const FIELDS = ['summary', 'status'];
const ID_RE = /^[A-Z][A-Z0-9]+-\d+$/;

function log(...a) { if (!QUIET) console.error(...a); }

// Collect every distinct issue id referenced in vocab, and remember which org(s)
// each id is associated with so we can label findings without an LLM.
function collectIds() {
  const vocab = require('./seed/vocab.json');
  const orgOf = new Map(); // id -> Set(org)
  const note = (id, org) => {
    if (!ID_RE.test(id)) return;
    if (!orgOf.has(id)) orgOf.set(id, new Set());
    if (org) orgOf.get(id).add(org);
  };
  // vocab.jira[] — mirrored PROJ/PL ids (strings or {key,org})
  for (const j of (vocab.jira || [])) {
    if (typeof j === 'string') note(j, null);
    else if (j && j.key) note(j.key, j.org || null);
  }
  // .pcr fields carried on payments[]/experience[] canonical entries
  for (const org of ['payments', 'experience']) {
    for (const e of (vocab[org] || [])) {
      if (!e || !e.pcr) continue;
      String(e.pcr).split(/[\s,;/]+/).forEach((id) => note(id, org));
    }
  }
  return orgOf;
}

function orgLabel(set) {
  if (!set || set.size === 0) return 'unknown';
  if (set.size === 1) return [...set][0];
  return 'payments'; // referenced by both — payments is the platform owner
}

async function fetchBatch(ids) {
  const jql = `key in (${ids.join(',')})`;
  const r = await jiraCall('execute_jql', { jql, fields: FIELDS, max_results: ids.length });
  const wrap = r.json || {};
  return Array.isArray(wrap.issues) ? wrap.issues : [];
}

(async () => {
  const orgOf = collectIds();
  const ids = [...orgOf.keys()];
  log(`scout-jira: ${ids.length} distinct id(s) from vocab; batching by ${BATCH}`);
  if (!ids.length) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({ count: 0, by_org: {}, findings: [], note: 'no ids in vocab' }, null, 2));
    console.log(JSON.stringify({ count: 0, findings: [], note: 'no ids in vocab' }));
    return;
  }

  const findings = [];
  let errors = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    try {
      const issues = await fetchBatch(chunk);
      for (const it of issues) {
        const f = it.fields || {};
        findings.push({
          key: it.key,
          name: (f.summary || '').trim(),
          status: (f.status && f.status.name) || null,
          status_category: (f.status && f.status.statusCategory && f.status.statusCategory.name) || null,
          org: orgLabel(orgOf.get(it.key)),
          confidence: 0.95,
        });
      }
      log(`  batch ${i / BATCH + 1}: ${chunk.length} asked -> ${issues.length} returned`);
    } catch (e) {
      errors++;
      if (e instanceof FloorViolation) log(`  batch ${i / BATCH + 1} FLOOR-BLOCKED: ${e.message}`);
      else log(`  batch ${i / BATCH + 1} error: ${e.message}`);
    }
  }

  const by_org = {};
  for (const f of findings) by_org[f.org] = (by_org[f.org] || 0) + 1;
  const payload = {
    generated_at: new Date().toISOString(),
    asked: ids.length,
    count: findings.length,
    errors,
    by_org,
    findings,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
  log(`scout-jira: wrote ${findings.length}/${ids.length} live finding(s) -> ${OUT} (by_org ${JSON.stringify(by_org)}, errors ${errors})`);
  // stdout: compact machine result for the workflow agent to parse
  console.log(JSON.stringify({ count: findings.length, asked: ids.length, by_org, out: OUT }));
})().catch((e) => { console.error('scout-jira FAILED:', e.message); process.exit(1); });
