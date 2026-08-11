#!/usr/bin/env node
/*
 * sync-jira.js — read-only Jira -> control-plane loader (the "spine").
 *
 * Pattern (attended): Claude calls the Jira MCP search tool (read:jira-work),
 * saves the JSON result to a file, then runs this loader to upsert into tasks.db.
 * No external writes; idempotent on jira_key; re-running reconciles in place.
 * Descriptions are intentionally NOT stored (stays clear of the bulk-data/PI line);
 * Jira stays source of truth -- we mirror metadata for the control surface.
 *
 * Usage: node sync-jira.js <path-to-jira-pull.json>
 */
const path = require('path');
const fs = require('fs');
const db = require('./db');

const pullPath = process.argv[2];
if (!pullPath || !fs.existsSync(pullPath)) {
  console.error('ERROR: pass a valid path to the Jira pull JSON. Got:', pullPath);
  process.exit(1);
}

// Reversible schema additions (idempotent).
try { db.exec("ALTER TABLE tasks ADD COLUMN jira_key TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE tasks ADD COLUMN jira_status TEXT"); } catch (e) {}
// Canonical-model feeder columns (also created by canonical-priority.js migrate();
// declared here too so a sync can run before the first canonical pass).
try { db.exec("ALTER TABLE tasks ADD COLUMN source_priority TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE tasks ADD COLUMN dep_count INTEGER DEFAULT 0"); } catch (e) {}
// Per-row Jira-content freshness, DISTINCT from updated_at (which canonical-priority.js
// bumps every cycle via the tasks_updated_at trigger — so updated_at is a false freshness
// signal for Jira staleness). jira_synced_at only moves when this loader actually runs.
try { db.exec("ALTER TABLE tasks ADD COLUMN jira_synced_at TEXT"); } catch (e) {}
// Unique index on jira_key. Non-partial: SQLite treats NULLs as distinct, so the
// existing manual (jira_key IS NULL) tasks don't collide; ON CONFLICT(jira_key)
// needs a plain (non-partial) index as its arbiter. DROP first to heal any earlier
// partial index from a prior run.
try { db.exec("DROP INDEX IF EXISTS idx_tasks_jira_key"); } catch (e) {}
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_jira_key ON tasks(jira_key)"); } catch (e) {}

function mapStatus(name, category) {
  const n = (name || '').toLowerCase();
  if (/(done|closed|resolved|complete|shipped|cancel|won't)/.test(n)) return 'done';
  if (/(in review|review|in progress|progress|develop|implement|building)/.test(n)) return 'in-progress';
  if (/(on track|at risk)/.test(n)) return 'in-progress';
  if (/(block|impediment|on hold|stuck)/.test(n)) return 'blocked';
  if (/(new|accepted|backlog|triage|to ?do|open|selected)/.test(n)) return 'todo';
  const c = (category || '').toLowerCase();
  if (c === 'done') return 'done';
  if (c === 'in progress' || c === 'indeterminate') return 'in-progress';
  return 'todo';
}
function mapPriority(p) {
  const n = (p || '').toUpperCase();
  if (/P0|HIGHEST|CRITICAL|BLOCKER/.test(n)) return 'P0';
  if (/P1|HIGH|MAJOR/.test(n)) return 'P1';
  if (/P2|MEDIUM|NORMAL/.test(n)) return 'P2';
  if (/P3|LOW|LOWEST|MINOR|TRIVIAL/.test(n)) return 'P3';
  return 'P2';
}
function mapFlags(name) {
  const n = (name || '').toLowerCase();
  const flags = [];
  if (n.includes('at risk')) flags.push('at-risk');
  if (n.includes('on track')) flags.push('on-track');
  if (n.includes('review')) flags.push('in-review');
  return flags;
}
function bracketTag(summary) {
  const m = (summary || '').match(/^\s*\[([^\]]+)\]/);
  return m ? [m[1].trim()] : [];
}
// --- feeder signals for the canonical three-axis model (priority-model.md §5) ---
// Stakeholders: reporter + assignee real names. Feeds exec-detection in
// canonical-priority.js scoreImportance (skip-level/manager presence raises importance).
function deriveStakeholders(f) {
  const names = [f.reporter, f.assignee]
    .map(p => p && (p.displayName || p.name))
    .filter(Boolean).map(s => String(s).trim());
  return [...new Set(names)];
}
// Dependency fan-out = blast radius. Feeds the deps term of importance.
function deriveDepCount(f) {
  const links = f.issuelinks || f.issueLinks || [];
  return Array.isArray(links) ? links.length : 0;
}
// Severity = OBJECTIVE impact, deliberately NOT derived from Jira's priority
// field — that keeps importance independent of Jira's opinion, so the two can
// diverge (the whole point: Jira is a feeder, not the canonical scale). We only
// upgrade severity on strong impact signals from issuetype/labels; otherwise
// return null and leave the existing/default severity untouched.
function deriveSeverity(f) {
  const type = ((f.issuetype && f.issuetype.name) || '').toLowerCase();
  const labels = (f.labels || []).map(l => String(l).toLowerCase()).join(' ');
  const hay = `${type} ${labels}`;
  if (/incident|outage|sev-?1|sev1|p0-incident|data-loss|security-critical/.test(hay)) return 'critical';
  if (/sev-?2|sev2|bug.*prod|production|security|compliance|pci|regulat|escal/.test(hay)) return 'high';
  return null; // no strong signal — don't clobber existing severity
}

const raw = JSON.parse(fs.readFileSync(pullPath, 'utf8'));
const nodes = (raw.issues && raw.issues.nodes) || raw.nodes || [];
if (!nodes.length) { console.log('No issues in pull. Nothing to do.'); process.exit(0); }

const ensureProject = db.prepare(
  "INSERT OR IGNORE INTO projects (name, description, status, color) VALUES (?, ?, 'active', '#0ea5e9')"
);
const findByKey = db.prepare("SELECT id FROM tasks WHERE jira_key = ?");
const upsert = db.prepare(`
  INSERT INTO tasks (jira_key, jira_status, short_id, title, status, priority, source_priority,
                     severity, dep_count, stakeholders, task_type,
                     project, owner, assignee, source, due_date, links, tags, flags, notes,
                     jira_synced_at)
  VALUES (@jira_key, @jira_status, @short_id, @title, @status, @priority, @source_priority,
          @severity, @dep_count, @stakeholders, @task_type,
          @project, 'jordan', 'jordan', 'jira', @due_date, @links, @tags, @flags, @notes,
          datetime('now'))
  ON CONFLICT(jira_key) DO UPDATE SET
    jira_status=excluded.jira_status, title=excluded.title, status=excluded.status,
    priority=excluded.priority, jira_synced_at=datetime('now'),
    -- Provenance: always refresh Jira's native priority (a feeder signal, never
    -- the canonical importance — canonical-priority.js owns that).
    source_priority=excluded.source_priority,
    -- Blast radius: always refresh from live issue links.
    dep_count=excluded.dep_count,
    -- Severity: only upgrade on a strong objective-impact signal; never clobber
    -- an existing/manually-set value back down (excluded.severity is NULL when
    -- no signal, so COALESCE keeps what's there).
    severity=COALESCE(excluded.severity, tasks.severity),
    -- Stakeholders: seed from reporter/assignee only when empty; preserve any
    -- manually-enriched stakeholder list.
    stakeholders=CASE WHEN tasks.stakeholders IS NULL OR tasks.stakeholders IN ('','[]')
                      THEN excluded.stakeholders ELSE tasks.stakeholders END,
    task_type=excluded.task_type, project=excluded.project,
    due_date=excluded.due_date, links=excluded.links, tags=excluded.tags,
    flags=excluded.flags, source='jira', updated_at=datetime('now')
`);

let inserted = 0, updated = 0;
const tx = db.transaction((items) => {
  for (const it of items) {
    const f = it.fields || {};
    const projKey = f.project ? (f.project.key || f.project.name) : null;
    if (projKey) ensureProject.run(projKey, (f.project && f.project.name) || projKey);
    const statusName = f.status && f.status.name;
    const catName = f.status && f.status.statusCategory && f.status.statusCategory.name;
    const row = {
      jira_key: it.key,
      jira_status: statusName || null,
      short_id: it.key,
      title: f.summary || it.key,
      status: mapStatus(statusName, catName),
      priority: mapPriority(f.priority && f.priority.name),
      source_priority: mapPriority(f.priority && f.priority.name),  // native Jira scale (provenance)
      severity: deriveSeverity(f),                                  // null unless strong impact signal
      dep_count: deriveDepCount(f),
      stakeholders: JSON.stringify(deriveStakeholders(f)),
      task_type: 'task',
      project: projKey,
      due_date: f.duedate || null,
      links: JSON.stringify([{ label: it.key, url: it.webUrl, type: 'jira' }]),
      tags: JSON.stringify(bracketTag(f.summary)),
      flags: JSON.stringify(mapFlags(statusName)),
      notes: 'Synced from Jira (read-only). Jira is source of truth.'
    };
    const existing = findByKey.get(it.key);
    upsert.run(row);
    if (existing) updated++; else inserted++;
  }
});
tx(nodes);

// Stamp the sync-liveness signal so it stops lying. Mirrors email-triage.js's
// last_email_sync_at write; the key was seeded blank in db.js and never updated by
// any code, so the dashboard read it as perpetually stale even when a sync ran.
db.prepare(
  "INSERT INTO state (key,value,updated_at) VALUES ('last_jira_sync_at',datetime('now'),datetime('now')) " +
  "ON CONFLICT(key) DO UPDATE SET value=datetime('now'), updated_at=datetime('now')"
).run();

const all = (sql) => db.prepare(sql).all();
const total = db.prepare("SELECT COUNT(*) n FROM tasks WHERE source='jira'").get().n;
console.log(`\nJira sync complete: ${inserted} inserted, ${updated} updated. Total jira-sourced: ${total}.`);
console.log('By native status:', all("SELECT jira_status s, COUNT(*) n FROM tasks WHERE source='jira' GROUP BY s ORDER BY n DESC").map(r=>`${r.s}=${r.n}`).join(', '));
console.log('By priority:', all("SELECT priority p, COUNT(*) n FROM tasks WHERE source='jira' GROUP BY p ORDER BY n DESC").map(r=>`${r.p}=${r.n}`).join(', '));
console.log('By project:', all("SELECT project p, COUNT(*) n FROM tasks WHERE source='jira' GROUP BY p ORDER BY n DESC").map(r=>`${r.p}=${r.n}`).join(', '));
console.log('Mapped status:', all("SELECT status s, COUNT(*) n FROM tasks WHERE source='jira' GROUP BY s ORDER BY n DESC").map(r=>`${r.s}=${r.n}`).join(', '));
