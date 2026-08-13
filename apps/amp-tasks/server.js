const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const db = require('./db');
const { identity } = require('./identity');

const app = express();
app.use(compression()); // gzip responses (#29) — index.html is ~250KB uncompressed
app.use(cors());
app.use(express.json());
app.use(identity); // resolve req.user from AuthService JWT (hosted) or local fallback

// InternalCloud/ALB health check — must return 200 for ECS to keep the task alive.
// Path is the InternalCloud default (`/monitors/health`); keep it dependency-light so a
// wedged DB doesn't flap the whole service, but still prove the DB is reachable.
app.get('/monitors/health', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.status(200).json({ status: 'ok', db: 'up', ts: new Date().toISOString() });
  } catch (e) {
    res.status(200).json({ status: 'ok', db: 'degraded', error: String(e && e.message) });
  }
});

// Who am I — surfaces the resolved principal so the UI can show the signed-in
// user and multi-user scoping can key off a single source of truth.
app.get('/api/me', (req, res) => res.json(req.user));

// Serve the SPA assets. etag/lastModified stay on (default) so browsers get 304
// revalidation; maxAge:0 keeps edits reflecting immediately (no stale HTML) while
// still saving the full payload on unchanged conditional GETs (#29).
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: true, lastModified: true }));

// --- TASKS ---

app.get('/api/tasks', (req, res) => {
  const { owner, project, status, priority, time_horizon, flag, cycle, half, merchant, area } = req.query;
  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (owner)        { query += ' AND owner = ?'; params.push(owner); }
  if (project)      { query += ' AND project = ?'; params.push(project); }
  if (status)       { query += ' AND status = ?'; params.push(status); }
  if (priority)     { query += ' AND priority = ?'; params.push(priority); }
  if (time_horizon) { query += ' AND time_horizon = ?'; params.push(time_horizon); }
  if (flag)         { query += ' AND flags LIKE ?'; params.push(`%${flag}%`); }
  if (cycle)        { query += ' AND cycle = ?'; params.push(cycle); }
  if (half === 'H1') { query += " AND cycle IN ('Q1A','Q1B','Q2A','Q2B')"; }
  if (half === 'H2') { query += " AND cycle IN ('Q3A','Q3B','Q4A','Q4B')"; }
  if (merchant)     { query += ' AND merchant = ?'; params.push(merchant); }
  if (area)         { query += ' AND project IN (SELECT name FROM projects WHERE area = ?)'; params.push(area); }

  query += " ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 END, updated_at DESC";

  const tasks = db.prepare(query).all(...params);
  res.json(tasks.map(parseTask));
});

app.get('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  res.json(parseTask(task));
});

app.post('/api/tasks', (req, res) => {
  const { title, description, owner, project, department, tags, priority, severity, status, flags, time_horizon, blocked_reason, due_date, links, notes, waiting_on, next_action, stakeholders, amp_runnable, cycle, okr, merchant, task_type, mission, assignee, source } = req.body;

  // P0-1 guard (Principle #1 — surface-palette): tasks at P0 must carry a
  // structured `next_action`; same for items explicitly flagged urgent. Without
  // a recommended move, the row is inbox-shaped, not Track-shaped — bounce it.
  const isUrgentFlag = Array.isArray(flags) && flags.includes('urgent');
  if ((priority === 'P0' || isUrgentFlag) && (!next_action || !String(next_action).trim())) {
    return res.status(422).json({
      error: 'next_action required',
      reason: 'P0 / urgent tasks must carry a recommended action — see surface-palette Principle #1.',
      hint:  'Either supply next_action or downgrade priority/flag.',
    });
  }

  const result = db.prepare(`
    INSERT INTO tasks (title, description, owner, project, department, tags, priority, severity, status, flags, time_horizon, blocked_reason, due_date, links, notes, waiting_on, next_action, stakeholders, amp_runnable, cycle, okr, merchant, task_type, mission, assignee, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title, description || null,
    owner || 'jordan', project || null, department || null,
    JSON.stringify(tags || []), priority || 'P2', severity || 'medium',
    status || 'todo', JSON.stringify(flags || []),
    time_horizon || 'this-week', blocked_reason || null,
    due_date || null, JSON.stringify(links || []), notes || null,
    waiting_on || null, next_action || null,
    JSON.stringify(stakeholders || []), amp_runnable ? 1 : 0,
    cycle || null, okr || null, merchant || null,
    task_type || 'task', mission || null, assignee || null, source || 'manual'
  );
  const newId = result.lastInsertRowid;
  db.prepare(`UPDATE tasks SET short_id = printf('T%08X', id) WHERE id = ? AND short_id IS NULL`).run(newId);
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(newId);
  res.status(201).json(parseTask(task));
});

app.patch('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });

  const fields = ['title','description','owner','project','department','priority','severity','status','time_horizon','blocked_reason','due_date','notes','waiting_on','next_action','amp_runnable','cycle','okr','merchant','task_type','mission','assignee','source'];
  const jsonFields = ['tags','flags','links','stakeholders'];
  const updates = [];
  const params = [];

  fields.forEach(f => {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  });
  jsonFields.forEach(f => {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(JSON.stringify(req.body[f])); }
  });

  if (updates.length === 0) return res.json(parseTask(task));
  params.push(req.params.id);
  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json(parseTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)));
});

app.delete('/api/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- PROJECTS ---

app.get('/api/projects', (req, res) => {
  res.json(db.prepare('SELECT * FROM projects ORDER BY status, name').all());
});

app.post('/api/projects', (req, res) => {
  const { name, description, status, color } = req.body;
  const result = db.prepare('INSERT INTO projects (name, description, status, color) VALUES (?, ?, ?, ?)').run(name, description || null, status || 'active', color || '#6366f1');
  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid));
});

// --- PEOPLE ---

app.get('/api/people', (req, res) => {
  res.json(db.prepare('SELECT * FROM people ORDER BY relationship, name').all());
});

app.post('/api/people', (req, res) => {
  const { name, role, team, area, relationship, notes, slack_handle } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = db.prepare(
    'INSERT INTO people (name, role, team, area, relationship, notes, slack_handle) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, role || null, team || null, area || null, relationship || 'stakeholder', notes || null, slack_handle || null);
  res.status(201).json(db.prepare('SELECT * FROM people WHERE id = ?').get(result.lastInsertRowid));
});

app.patch('/api/people/:id', (req, res) => {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Not found' });
  const fields = ['name', 'role', 'team', 'area', 'relationship', 'notes', 'slack_handle'];
  const updates = [], params = [];
  fields.forEach(f => { if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); } });
  if (updates.length) { params.push(req.params.id); db.prepare(`UPDATE people SET ${updates.join(', ')} WHERE id = ?`).run(...params); }
  res.json(db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id));
});

app.delete('/api/people/:id', (req, res) => {
  db.prepare('DELETE FROM people WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- DELEGATIONS ---

app.get('/api/tasks/:id/delegations', (req, res) => {
  res.json(db.prepare('SELECT * FROM task_delegations WHERE task_id = ? ORDER BY created_at DESC').all(req.params.id));
});

app.post('/api/tasks/:id/delegate', (req, res) => {
  const { from_agent, to_agent, mode, context } = req.body;
  if (!to_agent) return res.status(400).json({ error: 'to_agent required' });
  const result = db.prepare(
    'INSERT INTO task_delegations (task_id, from_agent, to_agent, mode, context) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.id, from_agent || 'jordan', to_agent, mode || 'assign', context || null);
  // Update task assignee
  db.prepare('UPDATE tasks SET assignee = ? WHERE id = ?').run(to_agent, req.params.id);
  res.status(201).json(db.prepare('SELECT * FROM task_delegations WHERE id = ?').get(result.lastInsertRowid));
});

// Authorize Amp to run a task — the "your action → fleet fan-out" seam.
// This is what makes a UI action *do something*: setting amp_runnable + routing
// owner to amp puts the task in the Cycle B candidate set (adjudicate.js reasons
// over the amp_runnable bucket, stages a next-step to fleet_decisions, and escalates
// to #amp-alerts only on a real call). Revoking flips it back. Every grant/revoke
// is logged as a delegation for the trail. Stays within the floor: the fleet stages
// and escalates; it does not autonomously act on shared systems.
app.post('/api/tasks/:id/authorize', (req, res) => {
  const { authorize = true, next_action, context } = req.body || {};
  const on = authorize ? 1 : 0;
  const t = db.prepare('SELECT id, owner FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  db.prepare(`UPDATE tasks SET amp_runnable = ?, owner = ?, next_action = COALESCE(?, next_action),
              updated_at = datetime('now') WHERE id = ?`)
    .run(on, on ? 'amp' : (t.owner === 'amp' ? 'jordan' : t.owner), next_action || null, req.params.id);
  db.prepare('INSERT INTO task_delegations (task_id, from_agent, to_agent, mode, context) VALUES (?,?,?,?,?)')
    .run(req.params.id, 'jordan', 'amp', on ? 'authorize' : 'revoke', context || next_action || null);
  res.json(parseTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)));
});

// --- COMMENTS ---

app.get('/api/tasks/:id/comments', (req, res) => {
  const rows = db.prepare('SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(rows.map(r => ({ ...r, mentions: JSON.parse(r.mentions || '[]') })));
});

app.post('/api/tasks/:id/comments', (req, res) => {
  const { author, body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'body required' });
  const mentions = (body.match(/@[\w-]+/g) || []).map(m => m.slice(1));
  const result = db.prepare(
    'INSERT INTO task_comments (task_id, author, body, mentions) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, author || 'jordan', body.trim(), JSON.stringify(mentions));
  const row = db.prepare('SELECT * FROM task_comments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...row, mentions: JSON.parse(row.mentions || '[]') });
});

app.delete('/api/tasks/:taskId/comments/:commentId', (req, res) => {
  db.prepare('DELETE FROM task_comments WHERE id = ? AND task_id = ?').run(req.params.commentId, req.params.taskId);
  res.json({ ok: true });
});

// --- TASK LINKS ---

app.get('/api/tasks/:id/links', (req, res) => {
  const rows = db.prepare(`
    SELECT tl.*, t.title as linked_title, t.status as linked_status, t.priority as linked_priority
    FROM task_links tl
    JOIN tasks t ON t.id = tl.linked_task_id
    WHERE tl.task_id = ?
    UNION
    SELECT tl.id, tl.linked_task_id as task_id, tl.task_id as linked_task_id,
           CASE tl.link_type
             WHEN 'blocks' THEN 'blocked-by'
             WHEN 'blocked-by' THEN 'blocks'
             WHEN 'parent' THEN 'child'
             WHEN 'child' THEN 'parent'
             ELSE tl.link_type END as link_type,
           tl.created_at,
           t.title as linked_title, t.status as linked_status, t.priority as linked_priority
    FROM task_links tl
    JOIN tasks t ON t.id = tl.task_id
    WHERE tl.linked_task_id = ?
  `).all(req.params.id, req.params.id);
  res.json(rows);
});

app.post('/api/tasks/:id/links', (req, res) => {
  const { linked_task_id, link_type } = req.body;
  if (!linked_task_id) return res.status(400).json({ error: 'linked_task_id required' });
  try {
    const result = db.prepare(
      'INSERT INTO task_links (task_id, linked_task_id, link_type) VALUES (?, ?, ?)'
    ).run(req.params.id, linked_task_id, link_type || 'related');
    res.status(201).json(db.prepare('SELECT * FROM task_links WHERE id = ?').get(result.lastInsertRowid));
  } catch (e) {
    res.status(409).json({ error: 'Link already exists' });
  }
});

app.delete('/api/tasks/:taskId/links/:linkId', (req, res) => {
  db.prepare('DELETE FROM task_links WHERE id = ? AND (task_id = ? OR linked_task_id = ?)').run(req.params.linkId, req.params.taskId, req.params.taskId);
  res.json({ ok: true });
});

// --- ACTIVITY FEED ---
// Unions task updates + comments + delegations + links into a single chronological stream.
// No new table needed — purely derived from existing timestamps.
app.get('/api/activity', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const events = db.prepare(`
    SELECT 'task_update'   as kind, id as task_id, NULL as ref_id,
           updated_at as ts, status as detail, title as task_title,
           owner as actor, priority, jira_key, short_id
    FROM tasks WHERE updated_at IS NOT NULL
    UNION ALL
    SELECT 'comment'       as kind, task_id, c.id as ref_id,
           c.created_at as ts, substr(c.body,1,140) as detail, t.title as task_title,
           c.author as actor, t.priority, t.jira_key, t.short_id
    FROM task_comments c JOIN tasks t ON t.id = c.task_id
    UNION ALL
    SELECT 'delegation'    as kind, task_id, d.id as ref_id,
           d.created_at as ts, (d.from_agent || '→' || d.to_agent || ' (' || d.mode || ')') as detail,
           t.title as task_title, d.from_agent as actor, t.priority, t.jira_key, t.short_id
    FROM task_delegations d JOIN tasks t ON t.id = d.task_id
    UNION ALL
    SELECT 'link'          as kind, task_id, l.id as ref_id,
           l.created_at as ts, ('linked ' || l.link_type || ' ' || lt.title) as detail,
           t.title as task_title, 'jordan' as actor, t.priority, t.jira_key, t.short_id
    FROM task_links l JOIN tasks t ON t.id = l.task_id JOIN tasks lt ON lt.id = l.linked_task_id
    ORDER BY ts DESC
    LIMIT ?
  `).all(limit);
  res.json(events);
});

// --- ADJUDICATION QUEUE ---
// Tasks that need a human (or amp) decision now. Per Jordan's vision:
// "use all the data to adjudicate each task". Criteria are explicit so they're tunable.
app.get('/api/adjudication', (req, res) => {
  const today = new Date().toISOString().slice(0,10);
  // Jira → local status mapping (loose; reasons listed where ambiguous)
  const JIRA_TO_LOCAL = {
    'to do':'todo','open':'todo','new':'todo','accepted':'todo',
    'in progress':'in-progress','in dev':'in-progress','in review':'in-progress','on track':'in-progress',
    'done':'done','closed':'done','resolved':'done','cancelled':'done','rejected':'done',
    'blocked':'blocked','on hold':'blocked','paused':'paused','waiting':'waiting',
  };
  const tasks = db.prepare('SELECT * FROM tasks WHERE status != ?').all('done').map(parseTask);
  const buckets = { jira_drift:[], overdue:[], stale:[], amp_runnable:[], blocked_no_reason:[], stuck_in_progress:[] };
  for (const t of tasks) {
    // jira_drift: jira_status maps to a different local status
    if (t.jira_status) {
      const expected = JIRA_TO_LOCAL[t.jira_status.toLowerCase().trim()];
      if (expected && expected !== t.status) {
        buckets.jira_drift.push({ ...t, _drift: { jira: t.jira_status, local: t.status, expected } });
      }
    }
    // overdue: due_date passed
    if (t.due_date && t.due_date < today) buckets.overdue.push(t);
    // stale: updated_at > 14 days ago
    if (t.updated_at) {
      const days = Math.floor((Date.now() - new Date(t.updated_at).getTime()) / 86400000);
      if (days > 14) buckets.stale.push({ ...t, _days_stale: days });
    }
    // amp_runnable but still todo
    if (t.amp_runnable && t.status === 'todo' && t.owner === 'amp') buckets.amp_runnable.push(t);
    // blocked but no reason given
    if (t.status === 'blocked' && !t.blocked_reason) buckets.blocked_no_reason.push(t);
    // stuck in progress >7d
    if (t.status === 'in-progress' && t.updated_at) {
      const days = Math.floor((Date.now() - new Date(t.updated_at).getTime()) / 86400000);
      if (days > 7) buckets.stuck_in_progress.push({ ...t, _days_in_progress: days });
    }
  }
  res.json({
    counts: Object.fromEntries(Object.entries(buckets).map(([k,v]) => [k, v.length])),
    buckets,
  });
});

// NOTE: the per-area /api/roadmap/:area and /api/areas routes were removed in the
// 2026-07 frontend audit (#30) — superseded by /api/roadmap-tree below and unused
// by any surface. The /api/email/sweep/execute, /api/weekly, /api/reconciliation,
// and /api/schwerpunkt routes were deliberately KEPT (live actuation / unsurfaced
// value / load-bearing domain, respectively).

// Roadmap tree: roadmap → theme → projects (+ task counts).
// Sourced from gdrive H2'26 planning docs 2026-06-25; replaces the stale
// hand-seeded areas. Two top-level roadmaps: Payments (Sam org-level / Jordan
// as Payments PM) and Experience (Jordan co-owns w/ Dana Kim).
app.get('/api/roadmap-tree', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.name, p.roadmap, p.theme, p.priority, p.pcr, p.kr,
           p.eng_weeks, p.target, p.summary, p.source_url, p.status, p.color,
           p.status_synthesis, p.blocker, p.your_move, p.health, p.last_synthesis_at,
           p.synth_confidence, p.synth_verdict, p.synth_note, p.synth_verified_at,
           (SELECT COUNT(*) FROM tasks t WHERE t.project = p.name) as task_count,
           (SELECT COUNT(*) FROM tasks t WHERE t.project = p.name AND t.status NOT IN ('done','migrated')) as open_count,
           (SELECT COUNT(*) FROM project_artifacts a WHERE a.project_id = p.id) as artifact_count,
           (SELECT COUNT(*) FROM decisions d WHERE d.project_id = p.id AND d.resolved_at IS NULL) as open_decisions
    FROM projects p
    WHERE p.roadmap IN ('Payments', 'Experience')
    ORDER BY p.roadmap, p.theme,
             CASE WHEN p.priority LIKE 'P0%' THEN 0 WHEN p.priority LIKE 'P1%' THEN 1 WHEN p.priority LIKE 'P2%' THEN 2 ELSE 3 END,
             p.name
  `).all();
  const tree = {};
  for (const r of rows) {
    if (!tree[r.roadmap]) tree[r.roadmap] = { name: r.roadmap, themes: {} };
    if (!tree[r.roadmap].themes[r.theme]) tree[r.roadmap].themes[r.theme] = { name: r.theme, projects: [] };
    tree[r.roadmap].themes[r.theme].projects.push(r);
  }
  const sum = (xs, f) => xs.reduce((s, x) => s + (f(x) || 0), 0);
  const result = Object.values(tree).map(rm => ({
    name: rm.name,
    themes: Object.values(rm.themes).map(th => ({
      name: th.name,
      projects: th.projects,
      project_count:   th.projects.length,
      task_count:      sum(th.projects, p => p.task_count),
      open_count:      sum(th.projects, p => p.open_count),
      artifact_count:  sum(th.projects, p => p.artifact_count),
      open_decisions:  sum(th.projects, p => p.open_decisions),
    })),
  }));
  for (const rm of result) {
    rm.project_count   = sum(rm.themes, t => t.project_count);
    rm.task_count      = sum(rm.themes, t => t.task_count);
    rm.open_count      = sum(rm.themes, t => t.open_count);
    rm.artifact_count  = sum(rm.themes, t => t.artifact_count);
    rm.open_decisions  = sum(rm.themes, t => t.open_decisions);
  }
  res.json(result);
});

// --- CONTROL CENTER ---

// SLA state for a decision (closed-loop: tiers = time-to-act, Principle #4).
// Given created_at + response_window_hours, classify how urgent acting is.
// Returns null when there's no window (e.g. fyi) or the item is resolved.
function slaState(d) {
  if (d.resolved_at) return { level: 'resolved', remaining_hours: null };
  if (!d.response_window_hours) return null;
  const created = Date.parse(String(d.created_at || '').replace(' ', 'T') + 'Z');
  if (isNaN(created)) return null;
  const dueMs = created + d.response_window_hours * 36e5;
  const remaining = (dueMs - Date.now()) / 36e5;
  const level = remaining <= 0 ? 'breached'
    : remaining <= d.response_window_hours * 0.25 ? 'due_soon'
    : 'ok';
  return { level, remaining_hours: Math.round(remaining * 10) / 10, due_at: new Date(dueMs).toISOString() };
}

app.get('/api/decisions', (req, res) => {
  const { resolved } = req.query;
  const where = resolved === 'true' ? 'd.resolved_at IS NOT NULL' :
                resolved === 'all'  ? '1=1' :
                                       'd.resolved_at IS NULL';
  const rows = db.prepare(`
    SELECT d.*, p.name AS project_name, p.roadmap, p.theme, p.priority, p.pcr,
           p.synth_verdict AS project_verdict, p.synth_confidence AS project_confidence,
           a.kind AS source_kind, a.title AS source_title, a.url AS source_url, a.author AS source_author
    FROM decisions d
    LEFT JOIN projects p ON p.id = d.project_id
    LEFT JOIN project_artifacts a ON a.id = d.source_artifact_id
    WHERE ${where}
    ORDER BY CASE d.kind
               WHEN 'your_move' THEN 0
               WHEN 'escalation' THEN 1
               WHEN 'confirmation' THEN 2
               WHEN 'fyi' THEN 3 ELSE 4 END,
             CASE WHEN p.priority LIKE 'P0%' THEN 0 WHEN p.priority LIKE 'P1%' THEN 1 WHEN p.priority LIKE 'P2%' THEN 2 ELSE 3 END,
             d.created_at DESC
  `).all();
  for (const d of rows) d.sla = slaState(d);
  res.json(rows);
});

// Close-the-loop actions. Each records HOW the decision was closed + by whom,
// so the audit trail shows the loop actually closing (not just disappearing).
// resolution ∈ acknowledged | ratified | rejected | resolved.
const RESOLUTIONS = {
  resolve:     'resolved',
  acknowledge: 'acknowledged',
  ratify:      'ratified',
  reject:      'rejected',
};
for (const [verb, resolution] of Object.entries(RESOLUTIONS)) {
  app.post(`/api/decisions/:id/${verb}`, (req, res) => {
    const by = (req.body && req.body.by) || 'jordan';
    // acknowledge stamps acknowledged_at but leaves the item open (it's a
    // receipt, not a close); the other three close the loop.
    if (verb === 'acknowledge') {
      const r = db.prepare(`UPDATE decisions SET acknowledged_at = datetime('now'), resolved_by = ? WHERE id = ?`).run(by, req.params.id);
      return res.json({ ok: r.changes > 0, resolution: 'acknowledged', closed: false });
    }
    const r = db.prepare(`
      UPDATE decisions SET resolved_at = datetime('now'), resolution = ?, resolved_by = ?
      WHERE id = ? AND resolved_at IS NULL
    `).run(resolution, by, req.params.id);
    res.json({ ok: r.changes > 0, resolution, closed: true });
  });
}

app.post('/api/decisions/:id/reopen', (req, res) => {
  const r = db.prepare(`UPDATE decisions SET resolved_at = NULL, resolution = NULL WHERE id = ?`).run(req.params.id);
  res.json({ ok: r.changes > 0 });
});

app.get('/api/projects/:id/detail', (req, res) => {
  const proj = db.prepare(`
    SELECT p.*,
           (SELECT COUNT(*) FROM project_artifacts a WHERE a.project_id = p.id) as artifact_count
    FROM projects p WHERE p.id = ?
  `).get(req.params.id);
  if (!proj) return res.status(404).json({ error: 'Not found' });

  const artifacts = db.prepare(`
    SELECT id, kind, title, url, snippet, author, ts, created_at
    FROM project_artifacts WHERE project_id = ?
    ORDER BY CASE kind WHEN 'jira' THEN 0 WHEN 'doc' THEN 1 WHEN 'slack' THEN 2 WHEN 'meeting' THEN 3 ELSE 4 END,
             COALESCE(ts, created_at) DESC
  `).all(req.params.id);

  const grouped = { jira: [], doc: [], slack: [], meeting: [], other: [] };
  for (const a of artifacts) (grouped[a.kind] || grouped.other).push(a);

  const decisions = db.prepare(`
    SELECT id, kind, title, body, source_artifact_id, due_date, resolved_at, created_at,
           confidence, verdict, origin, response_window_hours, acknowledged_at, resolved_by, resolution
    FROM decisions WHERE project_id = ?
    ORDER BY resolved_at IS NOT NULL, created_at DESC
  `).all(req.params.id);
  for (const d of decisions) d.sla = slaState(d);

  // Tactical tasks bucketed under the project name (loose match)
  const tasks = db.prepare(`
    SELECT id, short_id, title, status, priority, jira_key, jira_status, owner, updated_at
    FROM tasks WHERE project = ? OR title LIKE ?
    ORDER BY CASE status WHEN 'in-progress' THEN 0 WHEN 'todo' THEN 1 WHEN 'blocked' THEN 2 WHEN 'done' THEN 3 ELSE 4 END,
             updated_at DESC
    LIMIT 50
  `).all(proj.name, `%${proj.name}%`);

  res.json({ project: proj, artifacts: grouped, decisions, tasks });
});

// --- MODE + SCHWERPUNKT (surface-palette P0-6 / Principle #11) ---
// Named dashboard modes with pre-agreed playbooks. Mode flips are audit-
// logged. Crisis mode requires a Schwerpunkt project — the row pinned to
// the top of every surface with a 🎯 ring.

const VALID_MODES = ['deep_work', 'triage', 'crisis', 'ooo', 'meeting_heavy'];

app.get('/api/mode', (req, res) => {
  const row = db.prepare(`SELECT value FROM state WHERE key='mode'`).get();
  const schwerp = db.prepare(`SELECT value FROM state WHERE key='schwerpunkt_project_id'`).get();
  const schwerpunkt = schwerp && schwerp.value ? Number(schwerp.value) : null;
  let schwerpunktProject = null;
  if (schwerpunkt) {
    schwerpunktProject = db.prepare(`SELECT id, name, color, roadmap, theme, priority FROM projects WHERE id = ?`).get(schwerpunkt) || null;
  }
  res.json({
    mode: row?.value || 'triage',
    valid_modes: VALID_MODES,
    schwerpunkt_project_id: schwerpunkt,
    schwerpunkt: schwerpunktProject,
  });
});

app.put('/api/mode', (req, res) => {
  const { mode, reason, schwerpunkt_project_id } = req.body || {};
  if (!mode || !VALID_MODES.includes(mode)) {
    return res.status(400).json({ error: 'mode must be one of ' + VALID_MODES.join(', ') });
  }
  if (mode === 'crisis' && !schwerpunkt_project_id) {
    return res.status(422).json({ error: 'Crisis mode requires a schwerpunkt_project_id.' });
  }
  const prev = db.prepare(`SELECT value FROM state WHERE key='mode'`).get();
  const fromMode = prev?.value || null;
  const upsert = db.prepare(`
    INSERT INTO state (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);
  upsert.run('mode', mode);
  if (schwerpunkt_project_id !== undefined) {
    upsert.run('schwerpunkt_project_id', String(schwerpunkt_project_id || ''));
  } else if (mode !== 'crisis') {
    // Leaving crisis → clear schwerpunkt
    upsert.run('schwerpunkt_project_id', '');
  }
  db.prepare(`
    INSERT INTO mode_log (from_mode, to_mode, reason, schwerpunkt_project_id)
    VALUES (?, ?, ?, ?)
  `).run(fromMode, mode, reason || null, schwerpunkt_project_id || null);
  res.json({ ok: true, from: fromMode, to: mode });
});

app.get('/api/schwerpunkt', (req, res) => {
  const row = db.prepare(`SELECT value FROM state WHERE key='schwerpunkt_project_id'`).get();
  const id = row && row.value ? Number(row.value) : null;
  if (!id) return res.json({ schwerpunkt_project_id: null, schwerpunkt: null });
  const proj = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id);
  res.json({ schwerpunkt_project_id: id, schwerpunkt: proj || null });
});

app.put('/api/schwerpunkt', (req, res) => {
  const { project_id } = req.body || {};
  const upsert = db.prepare(`
    INSERT INTO state (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);
  upsert.run('schwerpunkt_project_id', String(project_id || ''));
  res.json({ ok: true, schwerpunkt_project_id: project_id || null });
});

// --- HANDOFF (surface-palette P0-5 / Principle #8) ---
// Session-start reconstitutes from a structured handoff artifact: what
// changed since the last close, what's active, soft worries the agent has
// noticed but not yet promoted to a decision.

app.get('/api/handoff', (req, res) => {
  const lastClosed = db.prepare(`
    SELECT closed_at FROM sessions
    WHERE closed_at IS NOT NULL
    ORDER BY closed_at DESC LIMIT 1
  `).get();
  // Fallback window: 24h if no prior session
  const since = lastClosed?.closed_at || new Date(Date.now() - 86400000).toISOString().replace('T',' ').slice(0,19);

  const changes = {
    decisions_new: db.prepare(`SELECT COUNT(*) n FROM decisions WHERE created_at > ?`).get(since).n,
    decisions_resolved: db.prepare(`SELECT COUNT(*) n FROM decisions WHERE resolved_at > ?`).get(since).n,
    tasks_updated: db.prepare(`SELECT COUNT(*) n FROM tasks WHERE updated_at > ? AND status NOT IN ('migrated')`).get(since).n,
    tasks_new: db.prepare(`SELECT COUNT(*) n FROM tasks WHERE created_at > ? AND status NOT IN ('migrated')`).get(since).n,
    projects_resynthesized: db.prepare(`SELECT COUNT(*) n FROM projects WHERE last_synthesis_at > ?`).get(since).n,
  };

  const active = {
    your_move: db.prepare(`SELECT COUNT(*) n FROM decisions WHERE resolved_at IS NULL AND kind='your_move'`).get().n,
    escalations: db.prepare(`SELECT COUNT(*) n FROM decisions WHERE resolved_at IS NULL AND kind='escalation'`).get().n,
    confirmations: db.prepare(`SELECT COUNT(*) n FROM decisions WHERE resolved_at IS NULL AND kind='confirmation'`).get().n,
    open_tasks: db.prepare(`SELECT COUNT(*) n FROM tasks WHERE status NOT IN ('done','migrated')`).get().n,
  };

  // SLA breaches — open decisions past their response window. This is what makes
  // the loop's "act in time" edge visible instead of decisions silently ageing.
  const openWithWindow = db.prepare(`
    SELECT created_at, response_window_hours, resolved_at FROM decisions
    WHERE resolved_at IS NULL AND response_window_hours IS NOT NULL
  `).all();
  let breached = 0, due_soon = 0;
  for (const d of openWithWindow) { const s = slaState(d); if (s?.level === 'breached') breached++; else if (s?.level === 'due_soon') due_soon++; }
  active.sla_breached = breached;
  active.sla_due_soon = due_soon;

  // Honest freshness — how stale each pipeline stage's last run is, so the UI
  // can show "reasoned 6d ago over 7d-old inputs" instead of implying live data.
  const stateVal = k => { const r = db.prepare(`SELECT value FROM state WHERE key=?`).get(k); return r && r.value ? r.value : null; };
  const freshness = {
    last_jira_sync_at: stateVal('last_jira_sync_at'),
    last_cycle_b_at: stateVal('last_cycle_b_at'),
    last_synthesis_at: stateVal('last_synthesis_at'),
    last_verify_at: stateVal('last_verify_at'),
  };

  // Existing explicit worries (manually inserted) come first, then synthesize
  // soft worries from active roadmap projects whose last_observed_activity_at
  // is NULL or > 14 days stale. This is the bare-bones silence proxy per P0-5
  // scope; the full silence-detection pass (Principle #9) is its own P1.
  const explicitWorries = db.prepare(`
    SELECT w.id, w.body, w.severity, w.observed_at, w.observed_by_agent,
           p.name AS project_name, p.id AS project_id
    FROM worries w
    LEFT JOIN projects p ON p.id = w.project_id
    WHERE w.resolved_at IS NULL
    ORDER BY w.observed_at DESC
    LIMIT 50
  `).all();

  const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().replace('T',' ').slice(0,19);
  const silentProjects = db.prepare(`
    SELECT id AS project_id, name AS project_name, roadmap, theme, priority,
           last_observed_activity_at
    FROM projects
    WHERE status = 'active'
      AND roadmap IN ('Payments', 'Experience')
      AND (last_observed_activity_at IS NULL OR last_observed_activity_at < ?)
    ORDER BY priority, name
    LIMIT 20
  `).all(cutoff);
  const derivedWorries = silentProjects.map(p => ({
    id: null,
    project_id: p.project_id,
    project_name: p.project_name,
    observed_by_agent: 'amp',
    severity: 'low',
    derived: true,
    body: p.last_observed_activity_at
      ? `Silent ≥14d (last activity: ${p.last_observed_activity_at})`
      : 'No observed activity recorded yet — blind spot or genuinely silent?',
    observed_at: p.last_observed_activity_at || null,
  }));

  res.json({
    since,
    last_session_closed_at: lastClosed?.closed_at || null,
    changes,
    active,
    freshness,
    worries: [...explicitWorries, ...derivedWorries],
  });
});

app.post('/api/sessions/open', (req, res) => {
  const r = db.prepare(`INSERT INTO sessions (opened_at) VALUES (datetime('now'))`).run();
  res.status(201).json({ id: r.lastInsertRowid });
});

app.post('/api/sessions/close', (req, res) => {
  // Snapshot a small set of counts so the next /handoff has a reliable
  // "since this" anchor even if the body fetch path changes.
  const snap = {
    closed_at: new Date().toISOString(),
    decisions_open: db.prepare(`SELECT COUNT(*) n FROM decisions WHERE resolved_at IS NULL`).get().n,
    tasks_open: db.prepare(`SELECT COUNT(*) n FROM tasks WHERE status NOT IN ('done','migrated')`).get().n,
  };
  // Close the most recent open session if any; otherwise create-and-close one.
  const open = db.prepare(`SELECT id FROM sessions WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1`).get();
  if (open) {
    db.prepare(`UPDATE sessions SET closed_at = datetime('now'), snapshot_json = ? WHERE id = ?`).run(JSON.stringify(snap), open.id);
    res.json({ ok: true, id: open.id });
  } else {
    const r = db.prepare(`INSERT INTO sessions (opened_at, closed_at, snapshot_json) VALUES (datetime('now'), datetime('now'), ?)`).run(JSON.stringify(snap));
    res.status(201).json({ ok: true, id: r.lastInsertRowid });
  }
});

// --- TIER DRIFT (surface-palette P0-4 / Principle #4) ---
// Tiers should encode time-to-act, not data importance. When > 20% of open
// items are P0, that's a drift signal — the dashboard alerts so Jordan can
// rationalize down rather than the tiers becoming meaningless.

app.get('/api/tier-drift', (req, res) => {
  const totals = db.prepare(`
    SELECT priority, COUNT(*) as n
    FROM tasks
    WHERE status NOT IN ('done','migrated')
    GROUP BY priority
  `).all();
  const total = totals.reduce((s, r) => s + r.n, 0);
  const p0 = totals.find(r => r.priority === 'P0')?.n || 0;
  const p1 = totals.find(r => r.priority === 'P1')?.n || 0;
  const p0_pct = total > 0 ? Math.round(100 * p0 / total) : 0;
  const p1_pct = total > 0 ? Math.round(100 * p1 / total) : 0;
  res.json({
    total, p0, p1, p0_pct, p1_pct,
    alert: p0_pct > 20,
    target_pct: 20,
    message: p0_pct > 20
      ? `P0 inflation: ${p0_pct}% (target ≤20%) — rationalize.`
      : `P0 share healthy at ${p0_pct}% (target ≤20%).`,
  });
});

// --- VALUE (audit: "no-value-measurement") — the north-star rollup ---
// Serves the latest value_metrics snapshot written by value-report.js: how much
// the fleet handled without Jordan, how much of what it surfaced he acted on, the
// undo rate (honesty gate), and a time-saved proxy. Read-only; returns nulls
// gracefully before the first value-report run has populated the table.
app.get('/api/value', (req, res) => {
  let row = null;
  try {
    row = db.prepare(`SELECT * FROM value_metrics ORDER BY id DESC LIMIT 1`).get();
  } catch (_) { /* table not yet created */ }
  if (!row) {
    return res.json({ available: false, message: 'no value snapshot yet — value-report.js has not run.' });
  }
  let detail = {};
  try { detail = JSON.parse(row.detail || '{}'); } catch (_) {}
  res.json({
    available: true,
    window_days: row.window_days,
    computed_at: row.computed_at,
    auto_handled: row.auto_handled,
    escalated: row.escalated,
    auto_handled_pct: Math.round((row.auto_handled_fraction || 0) * 100),
    escalations_acted: row.escalations_acted,
    escalation_usefulness_pct: Math.round((row.escalation_usefulness || 0) * 100),
    undo_count: row.undo_count,
    undo_rate_pct: +((row.undo_rate || 0) * 100).toFixed(1),
    sec_per_action: row.sec_per_action,
    time_saved_minutes: Math.round((row.time_saved_seconds || 0) / 60),
    detail,
    message: `Over ${row.window_days}d: auto-handled ${row.auto_handled}/${row.auto_handled + row.escalated} ` +
      `(${Math.round((row.auto_handled_fraction || 0) * 100)}%), ` +
      `escalation-usefulness ${Math.round((row.escalation_usefulness || 0) * 100)}%, ` +
      `undo ${+((row.undo_rate || 0) * 100).toFixed(1)}%, time-saved≈${Math.round((row.time_saved_seconds || 0) / 60)}m.`,
  });
});

// ADR-0016 §2 calibration surface: per-category precision vs. Jordan's first-party
// dispositions + the grad-ready PROPOSALS (measurement only; the actual state flip
// lives in rule-engine's ratification gate). Returns the latest snapshot run.
app.get('/api/calibration', (req, res) => {
  let rows = [];
  try {
    const latest = db.prepare(`SELECT MAX(computed_at) c FROM calibration`).get();
    if (latest && latest.c) {
      rows = db.prepare(`SELECT * FROM calibration WHERE computed_at=? ORDER BY category, ground`).all(latest.c);
    }
  } catch (_) { /* table not yet created */ }
  if (!rows.length) {
    return res.json({ available: false, message: 'no calibration snapshot yet — calibrate.js has not run.' });
  }
  const categories = rows.map((r) => {
    let detail = {}; try { detail = JSON.parse(r.detail || '{}'); } catch (_) {}
    return {
      category: r.category, ground: r.ground, sample: r.sample, agree: r.agree,
      override: r.override_n, precision_pct: r.precision == null ? null : Math.round(r.precision * 100),
      graduation_ready: !!r.graduation_ready, overrides: detail.overrides || [],
    };
  });
  const gradReady = categories.filter((c) => c.graduation_ready).map((c) => `${c.category}[${c.ground}]`);
  res.json({
    available: true,
    window_days: rows[0].window_days,
    computed_at: rows[0].computed_at,
    bar_pct: Math.round((rows[0].bar || 0) * 100),
    min_sample: rows[0].min_sample,
    categories,
    graduation_ready: gradReady,
    message: `Over ${rows[0].window_days}d @ bar ${Math.round((rows[0].bar || 0) * 100)}%/n≥${rows[0].min_sample}: ` +
      (gradReady.length ? `grad-ready: ${gradReady.join(', ')}.` : 'no category clears the bar yet.'),
  });
});

// --- RECONCILIATION (priority-model.md §4 — the harmony signal) ---
// Reconciles real-state priority (importance) against task-driven activity
// (urgency × macro_status). When they agree the board is quiet; only the
// divergence surfaces: STARVED (high importance, not moving — Q2 crushed) and
// THRASH (low importance, high activity — false fire). Reads committed canonical
// columns; run canonical-priority.js --commit to (re)populate them.

app.get('/api/reconciliation', (req, res) => {
  const rows = db.prepare(`
    SELECT id, short_id, title, priority AS legacy_priority, source_priority,
           importance, importance_score, importance_source, urgency, macro_status,
           dep_count, jira_key, updated_at
    FROM tasks WHERE status NOT IN ('done','migrated')
  `).all();
  const now = Date.now(), DAY = 86400000;
  const impHigh = c => c === 'P0' || c === 'P1';
  const impLow  = c => c === 'P3' || c === 'P4';
  const activity = t => {
    const days = t.updated_at ? Math.floor((now - new Date(t.updated_at).getTime()) / DAY) : 999;
    const moving = (t.macro_status === 'active' || t.macro_status === 'in-review') && days <= 14;
    const due = t.urgency === 'now' || t.urgency === 'this-week';
    if (moving || due) return 'high';
    if (t.macro_status === 'not-started' || days > 14 || t.urgency === 'none' || t.urgency === 'later') return 'low';
    return 'mid';
  };
  const starved = [], thrash = []; let harmony = 0, unscored = 0;
  const dist = {};
  for (const t of rows) {
    if (!t.importance) { unscored++; continue; }
    dist[t.importance] = (dist[t.importance] || 0) + 1;
    const act = activity(t);
    const diverges = t.source_priority && t.importance && t.source_priority.replace(/\s.*/, '') !== t.importance;
    const row = { ...t, _activity: act, _diverges: diverges };
    if (impHigh(t.importance) && act === 'low') starved.push(row);
    else if (impLow(t.importance) && act === 'high') thrash.push(row);
    else harmony++;
  }
  const total = rows.length - unscored;
  starved.sort((a,b) => (b.importance_score||0) - (a.importance_score||0));
  thrash.sort((a,b) => (a.importance_score||0) - (b.importance_score||0));
  res.json({
    total, unscored, harmony,
    harmony_pct: total ? Math.round(100 * harmony / total) : 0,
    importance_dist: dist,
    starved, thrash,
    counts: { starved: starved.length, thrash: thrash.length },
  });
});

// --- IMPORTANCE DRIFT (priority-model.md §4 / surface-palette P0-4) ---
// Generalizes tier-drift onto the canonical importance axis with per-rung
// reserve caps from priority_scale. Flags rungs exceeding their reserve %.

app.get('/api/importance-drift', (req, res) => {
  let scale = [];
  try { scale = db.prepare(`SELECT code, label, reserve_pct FROM priority_scale ORDER BY rank`).all(); } catch {}
  const totals = db.prepare(`
    SELECT importance AS code, COUNT(*) n FROM tasks
    WHERE status NOT IN ('done','migrated') AND importance IS NOT NULL
    GROUP BY importance
  `).all();
  const total = totals.reduce((s, r) => s + r.n, 0);
  const byCode = Object.fromEntries(totals.map(r => [r.code, r.n]));
  const rungs = scale.map(s => {
    const n = byCode[s.code] || 0;
    const pct = total ? Math.round(100 * n / total) : 0;
    const over = s.reserve_pct != null && pct > s.reserve_pct;
    return { ...s, n, pct, over };
  });
  const drifted = rungs.filter(r => r.over);
  res.json({
    total, rungs, alert: drifted.length > 0,
    message: drifted.length
      ? `Importance drift: ${drifted.map(r => `${r.code} at ${r.pct}% (reserve ${r.reserve_pct}%)`).join(', ')} — rationalize.`
      : `Importance distribution healthy across all rungs.`,
  });
});

// --- WEEKLY OPERATING REVIEW ---
// A meeting-driven lens, distinct from the quarterly roadmap. Structure is
// synthesized from the REAL team rituals (docs/research/meeting-views/*):
//   • Payments CP+AP "L10" weekly — action-items/decisions-first, owner-tagged,
//     blockers pulse, in-flight by theme, capacity-aware, weekly decision log.
//   • Experience sprint/weekly — 2-wk sprint, work under epics, platform-split
//     siblings (iOS/Android/Web), board columns, health-sync rituals.
//   • External weekly-view patterns — "are we OK?" → decisions/actions from last
//     week → blockers → flow health (WIP/age/carryover) → in-flight by state.
// Everything is computed from the canonical three-axis model + feeder signals.
// lens = payments | experience  (default payments)
app.get('/api/weekly', (req, res) => {
  const lens = (req.query.lens || 'payments').toLowerCase() === 'experience' ? 'experience' : 'payments';
  const now = Date.now();
  const DAY = 86400000;
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const in7Str = new Date(now + 7 * DAY).toISOString().slice(0, 10);
  // SQLite datetime('now') is UTC without a tz marker; new Date() would parse it
  // as local time and skew recent rows negative. Normalize to UTC, clamp at 0.
  const ageDays = ts => (ts ? Math.max(0, Math.floor((now - new Date(String(ts).replace(' ', 'T') + 'Z').getTime()) / DAY)) : null);

  const WIP_LIMIT = lens === 'experience' ? 10 : 14; // soft, heuristic — flags overload

  const all = db.prepare('SELECT * FROM tasks').all().map(parseTask);
  // Lens filter: match on project/area/tags. Payments vs Commerce-Experience.
  const inLens = t => {
    const hay = `${t.project || ''} ${(t.tags || []).join(' ')} ${t.department || ''}`.toLowerCase();
    if (lens === 'experience') return /comm|experience|experience|loyalty hub|webview|coupons page|storefront|sfp/.test(hay);
    return true; // payments lens = the whole payments-platform control plane
  };
  const active = all.filter(t =>
    !['done', 'migrated'].includes(t.status) && t.macro_status !== 'dropped' && t.macro_status !== 'shipped' && inLens(t));

  const impRank = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
  const impOf = t => t.importance || t.priority || 'P2';
  const ownerOf = t => {
    if (t.assignee && !['jordan', 'amp', 'both'].includes(t.assignee)) return t.assignee;
    const s = (t.stakeholders || []).find(Boolean);
    return s || t.assignee || 'jordan';
  };
  const platformOf = t => {
    const m = (t.title || '').match(/^\s*\[?(iOS|Android|Web|Desktop|BE|FE)\b/i);
    return m ? m[1].replace(/^ios$/i, 'iOS').replace(/^be$/i, 'BE').replace(/^fe$/i, 'FE') : null;
  };
  const jiraUrl = t => (t.links || []).find(l => l.type === 'jira')?.url || null;
  const isBlocked = t => t.macro_status === 'blocked' || t.status === 'blocked';
  const isAtRisk = t => (t.flags || []).includes('at-risk');
  const isMoving = t => ['active', 'in-review'].includes(t.macro_status) || t.status === 'in-progress';

  const card = t => ({
    id: t.id, title: t.title, owner: ownerOf(t),
    importance: impOf(t), urgency: t.urgency || null,
    macro_status: t.macro_status || t.status,
    source_priority: t.source_priority || null,
    diverges: t.source_priority && t.importance && t.source_priority !== t.importance,
    age: ageDays(t.updated_at), due_date: t.due_date || null,
    blocked_reason: t.blocked_reason || null, waiting_on: t.waiting_on || null,
    next_action: t.next_action || null,
    theme: (t.tags || [])[0] || null, project: t.project || null,
    platform: platformOf(t), jira: jiraUrl(t),
    amp_runnable: !!t.amp_runnable,
    at_risk: isAtRisk(t),
  });
  const bySeverity = (a, b) => (impRank[a.importance] ?? 5) - (impRank[b.importance] ?? 5) || (b.age || 0) - (a.age || 0);

  // ── Pulse: "are we OK?" ──
  const blocked = active.filter(isBlocked);
  const atRisk = active.filter(t => isAtRisk(t) && !isBlocked(t));
  const dueThisWeek = active.filter(t => t.due_date && t.due_date >= todayStr && t.due_date <= in7Str);
  const wip = active.filter(isMoving);
  const aging = wip.filter(t => (ageDays(t.updated_at) || 0) > 14);
  const carryover = active.filter(t => t.due_date && t.due_date < todayStr);
  const shipped = all.filter(t =>
    (t.macro_status === 'shipped' || t.status === 'done') && (ageDays(t.updated_at) ?? 999) <= 7 && inLens(t));

  const redPulse = blocked.some(t => ['P0', 'P1'].includes(impOf(t))) || carryover.some(t => ['P0', 'P1'].includes(impOf(t)));
  const amberPulse = atRisk.length > 0 || aging.length > 0 || wip.length > WIP_LIMIT;
  const pulse = {
    status: redPulse ? 'red' : amberPulse ? 'amber' : 'green',
    active: active.length, blocked: blocked.length, at_risk: atRisk.length,
    due_this_week: dueThisWeek.length, shipped_this_week: shipped.length,
    wip: wip.length, wip_limit: WIP_LIMIT, over_wip: Math.max(0, wip.length - WIP_LIMIT),
    aging: aging.length, carryover: carryover.length,
  };

  // ── Decisions needing a call (real decision store, open, action-first) ──
  let decisions = [];
  try {
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='decisions'").get()) {
      decisions = db.prepare(`
        SELECT d.*, p.name AS project, p.priority AS project_priority
        FROM decisions d LEFT JOIN projects p ON p.id = d.project_id
        WHERE d.resolved_at IS NULL
        ORDER BY CASE d.kind WHEN 'your_move' THEN 0 WHEN 'escalation' THEN 1 WHEN 'confirmation' THEN 2 ELSE 3 END,
                 d.created_at DESC LIMIT 25`).all().map(d => ({
        id: d.id, kind: d.kind,
        title: d.title || d.statement || d.summary || d.question || d.body || '(decision)',
        project: d.project || null, priority: d.project_priority || null,
        age: ageDays(d.created_at),
      }));
      if (lens === 'experience') decisions = decisions.filter(d => /comm|experience|loyalty|coupon|sfp|storefront/i.test(`${d.project} ${d.title}`));
    }
  } catch (e) { decisions = []; }

  // ── In-flight, grouped: payments → by theme; experience → by epic/project ──
  const inflight = active.filter(t => !isBlocked(t)); // blockers get their own panel
  const groupKey = t => lens === 'experience'
    ? (t.project || 'Unassigned epic')
    : ((t.tags || [])[0] || t.project || 'Untagged');
  const groupMap = {};
  for (const t of inflight) {
    const k = groupKey(t);
    (groupMap[k] = groupMap[k] || []).push(card(t));
  }
  const groups = Object.entries(groupMap).map(([name, items]) => {
    items.sort(bySeverity);
    // experience: fold platform siblings (same base title) into one feature row
    return {
      name, count: items.length,
      top_importance: items.reduce((m, i) => Math.min(m, impRank[i.importance] ?? 5), 5),
      has_blocked: false,
      items,
    };
  }).sort((a, b) => a.top_importance - b.top_importance || b.count - a.count);

  // ── Authorized work: what Jordan handed to Amp + what the fleet did with it ──
  const hasFleet = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='fleet_decisions'").get();
  const latestDecision = id => hasFleet
    ? db.prepare(`SELECT read, next_step, owner, confidence, escalate, noise, created_at
                  FROM fleet_decisions WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`).get(id)
    : null;
  const authorized = all.filter(t => t.amp_runnable && !['done', 'migrated'].includes(t.status) && inLens(t))
    .map(t => ({ ...card(t), staged: latestDecision(t.id) || null }))
    .sort(bySeverity);

  // ── Ritual context ──
  const weekMonday = (() => {
    const d = new Date(now); const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
    return new Date(now - day * DAY).toISOString().slice(0, 10);
  })();
  const ritual = lens === 'experience'
    ? { meeting: 'Experience — Weekly Sync', cadence: '2-week sprint · weekly sync',
        note: 'Sprint planning & team sync alternate Mondays; AI Show & Tell Fridays. Work rolls up to epics; platform siblings (iOS/Android/Web) group as one feature.' }
    : { meeting: 'CP+AP Weekly Product Team Meeting (L10)', cadence: 'Weekly · Tue',
        note: 'Action-items close-out → decisions/recommendations → AI shareout → weekly decision log → walk-ons. Every item owner-tagged.' };

  res.json({
    lens, week_of: weekMonday, ritual, pulse,
    decisions,
    blockers: blocked.sort(bySeverity).map(card),
    at_risk: atRisk.sort(bySeverity).map(card),
    shipped: shipped.sort((a, b) => (ageDays(a.updated_at) || 0) - (ageDays(b.updated_at) || 0)).map(card),
    groups,
    flow: {
      wip: wip.length, wip_limit: WIP_LIMIT,
      aging: aging.sort((a, b) => (ageDays(b.updated_at) || 0) - (ageDays(a.updated_at) || 0)).map(card),
      carryover: carryover.sort(bySeverity).map(card),
      due: dueThisWeek.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).map(card),
    },
    authorized,
  });
});

// --- INTERRUPTION BUDGET (surface-palette P0-2 / Principle #2) ---
// Returns today's "things surfaced" count vs the sum of per-channel budgets.
// A surface event = a decision created today, scoped by kind→rule channel.

app.get('/api/interruption-budget', (req, res) => {
  const rules = db.prepare(`SELECT channel, owner, rationale, budget_per_day FROM surfacing_rules`).all();
  const totalBudget = rules.reduce((s, r) => s + (r.budget_per_day || 0), 0);

  // Decisions created today (local) per kind
  const perKind = db.prepare(`
    SELECT kind, COUNT(*) as n
    FROM decisions
    WHERE date(created_at) = date('now', 'localtime')
    GROUP BY kind
  `).all();
  const surfaced = perKind.reduce((s, r) => s + r.n, 0);
  const byKind = Object.fromEntries(perKind.map(r => [r.kind, r.n]));

  // Per-rule rollup (rule.channel = "decision.<kind>")
  const perRule = rules.map(r => {
    const kind = r.channel.replace(/^decision\./, '');
    const used = byKind[kind] || 0;
    return { ...r, used_today: used, over_budget: used > r.budget_per_day };
  });

  res.json({
    surfaced_today: surfaced,
    budget: totalBudget,
    pct: totalBudget > 0 ? Math.round(100 * surfaced / totalBudget) : 0,
    by_kind: byKind,
    rules: perRule,
  });
});

// --- STATS ---

app.get('/api/stats', (req, res) => {
  const total      = db.prepare("SELECT COUNT(*) as n FROM tasks WHERE status NOT IN ('done','migrated')").get().n;
  const p0         = db.prepare("SELECT COUNT(*) as n FROM tasks WHERE priority = 'P0' AND status NOT IN ('done','migrated')").get().n;
  const blocked    = db.prepare("SELECT COUNT(*) as n FROM tasks WHERE status = 'blocked'").get().n;
  const ampTodos   = db.prepare("SELECT COUNT(*) as n FROM tasks WHERE owner = 'amp' AND status NOT IN ('done','migrated')").get().n;
  const principalTodos = db.prepare("SELECT COUNT(*) as n FROM tasks WHERE owner = 'jordan' AND status NOT IN ('done','migrated')").get().n;
  const today      = db.prepare("SELECT COUNT(*) as n FROM tasks WHERE time_horizon = 'today' AND status NOT IN ('done','migrated')").get().n;
  const thisWeek   = db.prepare("SELECT COUNT(*) as n FROM tasks WHERE time_horizon = 'this-week' AND status NOT IN ('done','migrated')").get().n;
  const projectCounts = db.prepare("SELECT project, COUNT(*) as n FROM tasks WHERE status NOT IN ('done','migrated') AND project IS NOT NULL GROUP BY project").all()
    .reduce((acc, r) => { acc[r.project] = r.n; return acc; }, {});
  const cycleCounts = db.prepare("SELECT cycle, COUNT(*) as n FROM tasks WHERE status NOT IN ('done','migrated') AND cycle IS NOT NULL GROUP BY cycle").all()
    .reduce((acc, r) => { acc[r.cycle] = r.n; return acc; }, {});
  const merchantCounts = db.prepare("SELECT merchant, COUNT(*) as n FROM tasks WHERE status NOT IN ('done','migrated') AND merchant IS NOT NULL GROUP BY merchant").all()
    .reduce((acc, r) => { acc[r.merchant] = r.n; return acc; }, {});
  const areaCounts = db.prepare("SELECT p.area, COUNT(*) as n FROM tasks t JOIN projects p ON t.project = p.name WHERE t.status NOT IN ('done','migrated') AND p.area IS NOT NULL GROUP BY p.area").all()
    .reduce((acc, r) => { acc[r.area] = r.n; return acc; }, {});
  res.json({ total, p0, blocked, ampTodos, principalTodos, today, thisWeek, projectCounts, cycleCounts, merchantCounts, areaCounts });
});

// --- FLEET (agent-fleet audit trail + management surface) ---
app.get('/api/fleet', (req, res) => {
  const runLimit = Math.min(parseInt(req.query.runs, 10) || 25, 200);
  const decLimit = Math.min(parseInt(req.query.decisions, 10) || 100, 500);
  const hasRuns = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fleet_runs'").get();
  if (!hasRuns) return res.json({ runs: [], decisions: [], workers: [], summary: {} });

  const runs = db.prepare(`SELECT * FROM fleet_runs ORDER BY started_at DESC LIMIT ?`).all(runLimit);
  const decisions = db.prepare(`
    SELECT d.*, t.title AS task_title, t.short_id, t.status AS task_status
    FROM fleet_decisions d LEFT JOIN tasks t ON t.id = d.task_id
    ORDER BY d.created_at DESC LIMIT ?`).all(decLimit);

  // Per-worker health rollup
  const workers = db.prepare(`
    SELECT worker,
           COUNT(*) AS runs,
           MAX(started_at) AS last_run,
           SUM(escalated) AS escalations,
           SUM(staged) AS staged,
           SUM(noise) AS noise,
           SUM(errors) AS errors,
           SUM(input_tokens + output_tokens) AS tokens
    FROM fleet_runs GROUP BY worker ORDER BY last_run DESC`).all();

  const summary = {
    total_runs: db.prepare(`SELECT COUNT(*) n FROM fleet_runs`).get().n,
    total_decisions: db.prepare(`SELECT COUNT(*) n FROM fleet_decisions`).get().n,
    open_escalations: db.prepare(`SELECT COUNT(*) n FROM fleet_decisions WHERE escalate=1`).get().n,
    last_run: runs[0] ? runs[0].started_at : null,
    tokens: db.prepare(`SELECT COALESCE(SUM(input_tokens+output_tokens),0) n FROM fleet_runs`).get().n,
  };
  res.json({ runs, decisions, workers, summary });
});

// ── Planner (Jordan's real Monday-meeting spreadsheets, replicated as SSOT) ──
// GET /api/planner/:org?period=  (org = payments | experience; period = H1-2026 | H2-2026)
// Returns a CONNECTED planning model, not a spreadsheet transcription:
//   - person x week grid + derived Gantt BARS (contiguous runs, spanning)
//   - canonical projects joined to live Jira status (grid cell -> workstream
//     -> PROJ -> status/category/priority) and theme/OKR/quarter
//   - roadmap rollup (quarter x theme x delivery status)
//   - backlog (pickup candidates / ideas / below-cut / cross-team outtake)
//   - capacity (payments: eng-week budget model; experience: computed grid utilization)
// Default period is the current half (H2-2026). Seeded by import-planners.js.
const PLANNER_PERIODS = ['H1-2026', 'H2-2026'];
const PLANNER_DEFAULT = 'H2-2026';

function jiraMap() {
  const rows = db.prepare(`SELECT key,summary,status,status_category,priority FROM planner_jira`).all();
  const m = {};
  for (const r of rows) m[r.key] = r;
  return m;
}

// off-work markers — a grid cell matching this is leave/ramp, never a project
const PLANNER_OFF = /\[?(PTO|OOO|LEAVE|PAT-LEAVE|VACATION|HOLIDAY|RAMP-?UP|4YFU)\]?/i;

// ONE shared resolver so every surface (Gantt bars, roadmap chips, projects,
// backlog) maps a raw grid-cell / symbol / alias to the SAME canonical project
// record. This is the join that was silently failing: experience grid cells are bare
// symbols ("CONTOSO") while canonical keys are bracketed ("[CONTOSO]"), and
// payments cells are abbreviated free-text. Resolution order:
//   exact key → bracketed → normalized bare → alias/name → prefix (truncated).
function buildResolver(projAll) {
  const norm = s => String(s || '').toLowerCase().replace(/[\[\]]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const exact = {}, bare = {}, alias = {};
  for (const p of projAll) {
    exact[p.key] = p;
    const nb = norm(p.key); if (nb && !bare[nb]) bare[nb] = p;
    const nn = norm(p.best_name || p.name); if (nn && !alias[nn]) alias[nn] = p;
    for (const a of (p.aliases || [])) { const na = norm(a); if (na && !alias[na]) alias[na] = p; }
  }
  const prefixHit = (n, table) => {
    if (n.length < 6) return null;
    let best = null;
    for (const k of Object.keys(table)) {
      if (k.length < 5) continue;
      if (k.startsWith(n) || n.startsWith(k)) {
        const d = Math.abs(k.length - n.length);
        if (!best || d < best.d) best = { p: table[k], d };
      }
    }
    return best ? best.p : null;
  };
  return function resolve(raw) {
    if (raw == null) return null;
    const key = String(raw).trim();
    if (PLANNER_OFF.test(key)) return null;
    if (exact[key]) return exact[key];
    const brk = '[' + key.replace(/[\[\]]/g, '') + ']';
    if (exact[brk]) return exact[brk];
    const n = norm(key);
    if (!n) return null;
    if (bare[n]) return bare[n];
    if (alias[n]) return alias[n];
    return prefixHit(n, bare) || prefixHit(n, alias);
  };
}

// contiguous-run bars: collapse consecutive same-text cells per person into
// spans, then resolve each span to its canonical project + full enrichment so
// the bar renders the real name, a live-status dot, and opens the macro drawer.
function deriveBars(people, weeks, grid, resolve) {
  const bars = [];
  const sorts = weeks.map(w => w.sort).sort((a, b) => a - b);
  for (const p of people) {
    const row = grid[p.name] || {};
    let i = 0;
    while (i < sorts.length) {
      const txt = row[sorts[i]];
      if (!txt) { i++; continue; }
      let j = i;
      while (j + 1 < sorts.length && row[sorts[j + 1]] === txt && sorts[j + 1] === sorts[j] + 1) j++;
      const key = txt.trim();
      const off = PLANNER_OFF.test(key);
      const proj = off ? null : resolve(key);
      bars.push({
        person: p.name, platform: p.platform || null, text: key, key,
        start: sorts[i], end: sorts[j], len: sorts[j] - sorts[i] + 1,
        off, resolved: !!proj,
        canonKey: proj ? proj.key : null,
        name: proj ? (proj.best_name || proj.name) : null,
        best_name: proj ? proj.best_name : null,
        theme: proj ? proj.theme : null,
        quarter: proj ? (proj.quarter || proj.half) : null,
        owners: proj ? proj.owners : null,
        pcr: proj ? proj.pcr : null,
        jira: proj ? proj.jira : null,
        status_narrative: proj ? proj.status_narrative : null,
        confidence: proj ? proj.confidence : null,
        section: proj ? proj.section : null,
      });
      i = j + 1;
    }
  }
  return bars;
}

// roadmap rollup: quarter x theme, counting delivery status from jira category
function rollupRoadmap(projects) {
  const catOf = p => {
    const c = p.jira && p.jira.status_category;
    if (c === 'done') return 'done';
    if (c === 'indeterminate') return 'inprogress';
    if (c === 'new') return 'todo';
    return 'none';
  };
  const themes = {}, quarters = new Set();
  for (const p of projects) {
    const q = p.quarter || p.half || 'Unscheduled';
    const t = p.theme || 'Uncategorized';
    quarters.add(q);
    themes[t] = themes[t] || {};
    themes[t][q] = themes[t][q] || { total: 0, done: 0, inprogress: 0, todo: 0, none: 0, keys: [] };
    const cell = themes[t][q];
    cell.total++; cell[catOf(p)]++; cell.keys.push(p.key);
  }
  const qOrder = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'Unscheduled'];
  const qList = [...quarters].sort((a, b) => {
    const ia = qOrder.findIndex(x => a.startsWith(x)); const ib = qOrder.findIndex(x => b.startsWith(x));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return { quarters: qList, themes };
}

function attachJira(rows, jira) {
  return rows.map(r => ({ ...r, jira: r.pcr && jira[r.pcr] ? jira[r.pcr] : null }));
}

// computed capacity from the person x week grid — used identically for BOTH orgs
// so the Capacity tab renders the same everywhere (payments also gets a budget
// panel appended as supplementary data).
function computeCapacity(people, weeks, grid) {
  const OFF = /\[?(PTO|OOO|LEAVE|PAT-LEAVE|VACATION|HOLIDAY|RAMP-?UP|4YFU)\]?/i;
  const isEng = p => {
    if (!p || p.name === 'Company Schedule') return false;
    const tag = String(p.platform || p.role || '').toUpperCase();
    return !['PM', 'EM', 'TPM', 'DESIGN'].includes(tag);
  };
  const engs = people.filter(isEng);
  const totalWeeks = weeks.length;
  const perPerson = engs.map(p => {
    const row = grid[p.name] || {};
    let filled = 0, pto = 0;
    for (const w of weeks) {
      const t = row[w.sort];
      if (!t) continue;
      if (OFF.test(t)) pto++; else filled++;
    }
    const avail = totalWeeks - pto;
    return { name: p.name, platform: p.platform || p.role || '—', filled, pto, avail, total: totalWeeks,
      util: avail ? Math.round((filled / avail) * 100) : 0 };
  });
  const byPlat = {};
  for (const pp of perPerson) {
    const g = byPlat[pp.platform] = byPlat[pp.platform] || { platform: pp.platform, engs: 0, filled: 0, avail: 0 };
    g.engs++; g.filled += pp.filled; g.avail += pp.avail;
  }
  const platforms = Object.values(byPlat).map(g => ({ ...g, util: g.avail ? Math.round((g.filled / g.avail) * 100) : 0 }));
  const totFilled = perPerson.reduce((s, p) => s + p.filled, 0);
  const totAvail  = perPerson.reduce((s, p) => s + p.avail, 0);
  return { kind: 'computed', engineers: engs.length, weeks: totalWeeks,
    totalFilled: totFilled, totalAvail: totAvail,
    util: totAvail ? Math.round((totFilled / totAvail) * 100) : 0, perPerson, platforms };
}

// ── FULL-YEAR unified timeline — NESTED WEEK MODEL ─────────────────────────
// Both orgs render on ONE identical 48-week axis for 2026, nested exactly as
// Jordan specified:  Year → H1/H2 → Q1..Q4 → Sprint cycle A/B (6 weeks each) → week.
//   48 weeks = 4 quarters × 2 sprints × 6 weeks.
// WEEK0 anchors on Mon Jan 5 2026 (the year's first full ISO week).
// We SYNTHESIZE the whole year:
//   1. staffing bars from BOTH period grids, mapped week-label → global week (gw);
//   2. every roadmap/PROJ project NOT already staffed is PLACED by its
//      quarter/half/sprint onto its owner's lane (or a Roadmap lane) so the
//      back-half fills from the rest of the dashboard instead of going blank.
const TOTAL_WEEKS = 48;
const WEEK_MS = 7 * 86400000;
// Quarters are CALENDAR-ALIGNED: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec.
// Each quarter is rendered as 12 weeks (2 six-week sprints) anchored on the first
// Monday of that calendar quarter. A calendar quarter is ~13 weeks; the final
// stub week folds into week 12 so the grid stays a clean 4×12. This keeps "today"
// honest — e.g. early July reads as Q3 · Sprint A · week 1, not Q3 week 2.
const QSTART_MS = [                              // first Monday of each 2026 quarter
  Date.UTC(2026, 0, 5),   // Q1 → Mon Jan 5
  Date.UTC(2026, 3, 6),   // Q2 → Mon Apr 6
  Date.UTC(2026, 6, 6),   // Q3 → Mon Jul 6
  Date.UTC(2026, 9, 5),   // Q4 → Mon Oct 5
];
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_IDX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
// gwMeta(gw) → full nested coordinates for a global week 0..47
function gwMeta(gw) {
  const g = Math.max(0, Math.min(TOTAL_WEEKS - 1, gw));
  const quarter = Math.floor(g / 12);           // 0..3
  const wq = g % 12;                             // week-in-quarter 0..11
  const sprint = Math.floor(wq / 6);            // 0=A, 1=B
  const wis = (wq % 6) + 1;                     // week-in-sprint 1..6
  const half = quarter < 2 ? 0 : 1;            // 0=H1, 1=H2
  const d = new Date(QSTART_MS[quarter] + wq * WEEK_MS);
  const mo = d.getUTCMonth();
  return {
    gw: g, half, halfLabel: 'H' + (half + 1),
    quarter, quarterLabel: 'Q' + (quarter + 1),
    sprint, sprintLabel: sprint === 0 ? 'A' : 'B',
    sprintKey: 'Q' + (quarter + 1) + (sprint === 0 ? 'A' : 'B'),
    wis, month: mo, monthLabel: MONTH_ABBR[mo],
    label: MONTH_ABBR[mo] + ' ' + d.getUTCDate(),
    date: d.toISOString().slice(0, 10),
  };
}
function yearWeeks() { const a = []; for (let g = 0; g < TOTAL_WEEKS; g++) a.push(gwMeta(g)); return a; }
// dateToGw — a UTC-ms timestamp → global week, using calendar quarter buckets
function dateToGw(ms) {
  const d = new Date(ms);
  if (d.getUTCFullYear() < 2026) return 0;
  if (d.getUTCFullYear() > 2026) return TOTAL_WEEKS - 1;
  const q = Math.floor(d.getUTCMonth() / 3);    // calendar quarter 0..3
  let wiq = Math.floor((ms - QSTART_MS[q]) / WEEK_MS);
  wiq = Math.max(0, Math.min(11, wiq));
  return q * 12 + wiq;
}
// labelToGw — parse a raw week label ("1/5/2026", "07-06", "July 6") → global week
function labelToGw(lbl) {
  if (lbl == null) return null;
  const s = String(lbl).trim();
  let mo = null, day = null;
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})/);          // 1/5/2026 or 07-06
  if (m) { mo = parseInt(m[1], 10) - 1; day = parseInt(m[2], 10); }
  else {
    m = s.match(/([A-Za-z]{3,})\.?\s*(\d{1,2})?/);        // "July 6" / "July"
    if (m) { const k = m[1].slice(0, 3).toLowerCase(); if (k in MONTH_IDX) { mo = MONTH_IDX[k]; day = m[2] ? parseInt(m[2], 10) : 1; } }
  }
  if (mo == null || mo < 0 || mo > 11) return null;
  return dateToGw(Date.UTC(2026, mo, day || 1));
}
// quarterToGwRange — a quarter/half/sprint token → [gwStart, gwEnd] inclusive
function quarterToGwRange(q) {
  if (!q) return null;
  const s = String(q).toUpperCase().replace(/\s+/g, '');
  let m = s.match(/Q([1-4])([AB])/);                       // Q2A / Q3B  (6-week sprint)
  if (m) { const base = (+m[1] - 1) * 12; return m[2] === 'A' ? [base, base + 5] : [base + 6, base + 11]; }
  m = s.match(/Q([1-4])/);                                 // Q1..Q4  (full quarter)
  if (m) { const base = (+m[1] - 1) * 12; return [base, base + 11]; }
  m = s.match(/H([12])/);                                  // H1 / H2
  if (m) return m[1] === '1' ? [0, 23] : [24, 47];
  return null;
}
// greedy interval-packing in week-space: overlapping bars stack onto sub-tracks.
function packLane(bars) {
  const sorted = bars.slice().sort((a, b) => a.gwStart - b.gwStart || a.gwEnd - b.gwEnd);
  const trackEnd = [];
  for (const b of sorted) {
    let t = 0;
    while (t < trackEnd.length && trackEnd[t] >= b.gwStart) t++;
    b.track = t;
    trackEnd[t] = b.gwEnd;
  }
  return { bars: sorted, tracks: Math.max(1, trackEnd.length) };
}
function buildFullYear(org, resolve, resolverRows, conns) {
  const rowsByPerson = {};
  const order = [];
  const ensure = (name, plat) => {
    let r = rowsByPerson[name];
    if (!r) { r = rowsByPerson[name] = { person: name, platform: plat || null, bars: [] }; order.push(name); }
    if (plat && !r.platform) r.platform = plat;
    return r;
  };
  const connOf = (key) => (conns && key ? conns.byKey[key] : null) || null;
  const staffed = {};   // canonKey -> true once it appears in a staffing lane
  for (const per of PLANNER_PERIODS) {
    const weeks = db.prepare(`SELECT sort,label,quarter FROM planner_weeks WHERE org=? AND period=? ORDER BY sort`).all(org, per);
    if (!weeks.length) continue;
    const people = db.prepare(`SELECT sort,name,platform,role FROM planner_people WHERE org=? AND period=? ORDER BY sort`).all(org, per);
    const cells = db.prepare(`SELECT person,sort,text FROM planner_cells WHERE org=? AND period=?`).all(org, per);
    const grid = {};
    for (const p of people) grid[p.name] = {};
    for (const c of cells) { (grid[c.person] = grid[c.person] || {})[c.sort] = c.text; }
    const gwBySort = {};
    for (const w of weeks) {
      let gw = labelToGw(w.label);
      if (gw == null && w.quarter) { const r = quarterToGwRange(w.quarter); if (r) gw = r[0]; }
      gwBySort[w.sort] = gw;
    }
    for (const p of people) ensure(p.name, p.platform || p.role);   // preserve staffing order
    const bars = deriveBars(people, weeks, grid, resolve);
    for (const b of bars) {
      let g1 = gwBySort[b.start], g2 = gwBySort[b.end];
      if (g1 == null) g1 = g2;
      if (g2 == null) g2 = g1;
      if (g1 == null) continue;
      const r = ensure(b.person, b.platform);
      r.bars.push({ ...b, gwStart: Math.min(g1, g2), gwEnd: Math.max(g1, g2), roadmapFill: false, conn: connOf(b.canonKey) });
      if (b.canonKey) staffed[b.canonKey] = true;
    }
  }
  // FILL the rest of the year from the roadmap/PROJ layer
  const backlogSecs = new Set(['ideas', 'cutline', 'outtake', 'backlog', 'below-cutline']);
  const ROADMAP_LANE = '◇ Roadmap (unstaffed)';
  const personNames = order.slice();
  for (const p of resolverRows) {
    if (staffed[p.key]) continue;
    if (p.section && backlogSecs.has(p.section)) continue;
    if (PLANNER_OFF.test(p.key)) continue;
    const rng = quarterToGwRange(p.quarter || p.half);
    if (!rng) continue;
    let target = null;
    const owners = String(p.owners || '').split(/[,/;]|\band\b/i).map(s => s.trim()).filter(Boolean);
    for (const o of owners) {
      const ol = o.toLowerCase();
      const hit = personNames.find(n => n !== ROADMAP_LANE && (n.toLowerCase().includes(ol) || ol.includes(n.toLowerCase())));
      if (hit) { target = hit; break; }
    }
    const r = ensure(target || ROADMAP_LANE, target ? rowsByPerson[target].platform : 'ROADMAP');
    r.bars.push({
      person: r.person, platform: r.platform, text: p.best_name || p.name || p.key, key: p.key, canonKey: p.key,
      off: false, resolved: true, roadmapFill: true,
      name: p.best_name || p.name, best_name: p.best_name, theme: p.theme,
      quarter: p.quarter || p.half, owners: p.owners, pcr: p.pcr, jira: p.jira,
      status_narrative: p.status_narrative, confidence: p.confidence, section: p.section,
      gwStart: rng[0], gwEnd: rng[1], conn: connOf(p.key),
    });
    staffed[p.key] = true;
  }
  const rows = order.map(n => rowsByPerson[n]).filter(r => r.bars.length);
  rows.sort((a, b) => (a.person === ROADMAP_LANE ? 1 : 0) - (b.person === ROADMAP_LANE ? 1 : 0));
  for (const r of rows) { const pk = packLane(r.bars); r.bars = pk.bars; r.tracks = pk.tracks; }
  return { weeks: yearWeeks(), totalWeeks: TOTAL_WEEKS, rows };
}

// ── CROSS-DIMENSION CONNECTION LAYER ───────────────────────────────────────
// The roadmap is the plane where every control-center dimension converges on
// the SAME project. Join is by NORMALIZED NAME (PROJ does not match across the
// planner_projects and control-center `projects` tables — 0 overlap observed).
function connNorm(s) { return String(s || '').toLowerCase().replace(/[\[\]]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
// significant-token set for fuzzy twin-matching (drops generic/stopword tokens)
const CONN_STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'in', 'on', 'for', 'to', 'with', 'by',
  'pcr', 'v1', 'v2', 'v3', 'm1', 'm2', 'm3', 'm4', 'payments', 'payment', 'experience', 'others', 'other',
  'new', 'users', 'ux', 'revamp', 'iteration', 'iterations', 'support', 'side', 'selling']);
// ctrl names too generic to fuzzy-match on their own
const CONN_GENERIC = new Set(['pcr', 'onboarding', 'infrastructure', 'pars', 'payment', 'payments']);
function connTokens(s) { return connNorm(s).split(' ').filter(t => t && !CONN_STOP.has(t)); }
function buildConnections(resolverRows) {
  // control-center projects
  let ctrlRows = [];
  try {
    ctrlRows = db.prepare(`SELECT id,name,pcr,theme,area,health,eng_weeks,kr,target,status_synthesis,blocker,your_move,last_observed_activity_at FROM projects`).all();
  } catch (e) { ctrlRows = []; }
  const ctrlByNorm = {}, ctrlByPcr = {};
  const ctrlTok = [];   // [{c, toks:Set}] for fuzzy token-subset matching
  for (const c of ctrlRows) {
    ctrlByNorm[connNorm(c.name)] = c;
    if (c.pcr) ctrlByPcr[String(c.pcr).toUpperCase()] = c;
    const nm = connNorm(c.name);
    if (CONN_GENERIC.has(nm)) continue;
    const toks = connTokens(c.name);
    if (toks.length >= 2) ctrlTok.push({ c, toks: new Set(toks) });
  }
  // find a control-center twin whose significant tokens are all present in the
  // planner project's (possibly compound) name — the longest such match wins.
  function fuzzyCtrl(name) {
    const pt = new Set(connTokens(name));
    if (!pt.size) return null;
    let best = null, bestLen = 0;
    for (const { c, toks } of ctrlTok) {
      let all = true;
      for (const t of toks) { if (!pt.has(t)) { all = false; break; } }
      if (all && toks.size > bestLen) { best = c; bestLen = toks.size; }
    }
    return best;
  }
  // tasks (jira_key = PROJ, cycle = Q1B/Q2A sprint notation)
  let taskRows = [];
  try { taskRows = db.prepare(`SELECT id,project,jira_key,jira_status,cycle,assignee,status,title FROM tasks`).all(); }
  catch (e) { try { taskRows = db.prepare(`SELECT id,project,jira_key,jira_status,cycle,assignee,status FROM tasks`).all(); } catch (e2) { taskRows = []; } }
  const tasksByProjNorm = {}, tasksByPcr = {};
  for (const t of taskRows) {
    const n = connNorm(t.project); if (n) (tasksByProjNorm[n] = tasksByProjNorm[n] || []).push(t);
    if (t.jira_key) (tasksByPcr[String(t.jira_key).toUpperCase()] = tasksByPcr[String(t.jira_key).toUpperCase()] || []).push(t);
  }
  // decisions + artifacts keyed by control-center project id
  let decByPid = {}, artByPid = {};
  try {
    for (const d of db.prepare(`SELECT id,project_id,kind,title,due_date,resolved_at FROM decisions`).all())
      (decByPid[d.project_id] = decByPid[d.project_id] || []).push(d);
  } catch (e) {}
  try {
    for (const a of db.prepare(`SELECT project_id,kind,title,url,ts FROM project_artifacts`).all())
      (artByPid[a.project_id] = artByPid[a.project_id] || []).push(a);
  } catch (e) {}

  const openStatus = /(todo|backlog|open|in progress|in-progress|doing|review|blocked)/i;
  const byKey = {};
  for (const p of resolverRows) {
    const dispName = p.best_name || p.name || p.key;
    const nm = connNorm(dispName);
    const pcr = p.pcr ? String(p.pcr).toUpperCase() : null;
    let matchBy = null;
    let ctrl = ctrlByNorm[nm] || null; if (ctrl) matchBy = 'name';
    if (!ctrl && pcr && ctrlByPcr[pcr]) { ctrl = ctrlByPcr[pcr]; matchBy = 'pcr'; }
    if (!ctrl) { const fz = fuzzyCtrl(dispName); if (fz) { ctrl = fz; matchBy = 'fuzzy'; } }
    let tks = (nm && tasksByProjNorm[nm]) || [];
    if (!tks.length && pcr && tasksByPcr[pcr]) tks = tasksByPcr[pcr];
    const openTasks = tks.filter(t => openStatus.test(String(t.status || t.jira_status || ''))).length;
    const dec = ctrl ? (decByPid[ctrl.id] || []) : [];
    const openDec = dec.filter(d => !d.resolved_at);
    const yourMove = openDec.filter(d => d.kind === 'your_move');
    const escalations = openDec.filter(d => d.kind === 'escalation');
    const arts = ctrl ? (artByPid[ctrl.id] || []) : [];
    const health = ctrl ? (ctrl.health || null) : null;
    byKey[p.key] = {
      key: p.key,
      ctrl: ctrl ? {
        id: ctrl.id, health: ctrl.health, eng_weeks: ctrl.eng_weeks, kr: ctrl.kr, target: ctrl.target,
        status_synthesis: ctrl.status_synthesis, blocker: ctrl.blocker, your_move: ctrl.your_move,
        theme: ctrl.theme, area: ctrl.area, last_activity: ctrl.last_observed_activity_at,
      } : null,
      tasks: tks.map(t => ({ id: t.id, title: t.title || t.project, status: t.status || t.jira_status, cycle: t.cycle, pcr: t.jira_key, owner: t.assignee })),
      taskCount: tks.length, openTasks,
      decisions: openDec.map(d => ({ kind: d.kind, title: d.title, due: d.due_date })),
      yourMove: yourMove.length, escalations: escalations.length,
      artifactCount: arts.length,
      health,
      matchBy,
      connected: !!(ctrl || tks.length),
    };
  }
  return { byKey };
}

app.get('/api/planner/:org', (req, res) => {
  const org = req.params.org === 'experience' ? 'experience' : 'payments';
  let period = String(req.query.period || PLANNER_DEFAULT);
  if (!PLANNER_PERIODS.includes(period)) period = PLANNER_DEFAULT;

  // payments has one rolling GANTT (seeded under H1-2026); experience has real per-half grids
  const gridPeriod = org === 'payments' ? 'H1-2026' : period;
  const gridNote = (org === 'payments' && period === 'H2-2026')
    ? 'Payments has one rolling staffing GANTT (Jan–Jul); no separate H2 grid exists. Projects/roadmap/backlog below reflect H2 (Q3/Q4).'
    : null;

  const jira = jiraMap();

  const weeks  = db.prepare(`SELECT sort,label,quarter FROM planner_weeks  WHERE org=? AND period=? ORDER BY sort`).all(org, gridPeriod);
  const people = db.prepare(`SELECT sort,name,platform,role FROM planner_people WHERE org=? AND period=? ORDER BY sort`).all(org, gridPeriod);
  const cells  = db.prepare(`SELECT person,sort,text FROM planner_cells WHERE org=? AND period=?`).all(org, gridPeriod);

  const grid = {};
  for (const p of people) grid[p.name] = {};
  for (const c of cells) { (grid[c.person] = grid[c.person] || {})[c.sort] = c.text; }

  const PROJ_COLS = `sort,key,name,pcr,pcr_all,theme,okr,priority,quarter,half,owners,sheet_status,section,span_first,span_last,span_weeks,eng,notes,
            best_name,aliases,summary,status_narrative,doc_refs,confidence,last_enriched`;
  const mapProj = p => ({ ...p,
    aliases: p.aliases ? JSON.parse(p.aliases) : [],
    doc_refs: p.doc_refs ? JSON.parse(p.doc_refs) : [] });

  // canonical projects for this period, joined to live jira
  const projAll = attachJira(db.prepare(
    `SELECT ${PROJ_COLS} FROM planner_projects WHERE org=? AND period=? ORDER BY sort`
  ).all(org, period), jira).map(mapProj);

  // resolver spans ALL periods: the payments Gantt is the H1 staffing grid even
  // when viewing H2, so bars must resolve against H1 projects too. One resolver
  // → bars, roadmap chips, projects all map to the SAME canonical records.
  const resolverRows = attachJira(db.prepare(
    `SELECT ${PROJ_COLS} FROM planner_projects WHERE org=? ORDER BY period, sort`
  ).all(org), jira).map(mapProj);

  const backlogSections = new Set(['ideas', 'cutline', 'outtake', 'backlog', 'below-cutline']);
  const projects = projAll.filter(p => !backlogSections.has(p.section));
  const backlog  = projAll.filter(p =>  backlogSections.has(p.section));

  const projByKey = {};
  for (const p of projAll) projByKey[p.key] = p;
  const resolve = buildResolver(resolverRows);

  const bars = deriveBars(people, weeks, grid, resolve);
  const roadmap = rollupRoadmap(projects);

  // distinct canonical projects behind the bars — lets the client open the
  // macro drawer for a bar whose project lives in the grid period (H1) while
  // the roadmap/projects tabs show the requested period (H2).
  const barSeen = new Set();
  const barProjects = [];
  for (const b of bars) {
    if (b.canonKey && !barSeen.has(b.canonKey)) {
      barSeen.add(b.canonKey);
      const bp = resolverRows.find(r => r.key === b.canonKey);
      if (bp) barProjects.push(bp);
    }
  }

  // ── Experience backlog also lives in planner_workstreams (section=backlog/
  // below-cutline); normalize those into the same project shape so the Backlog
  // tab renders identically for both orgs. ──
  if (org === 'experience') {
    const wl = db.prepare(
      `SELECT sort,symbol,quarter,ticket,name,status,owners,notes,section
         FROM planner_workstreams WHERE org=? AND period=? AND section IN ('backlog','below-cutline') ORDER BY sort`
    ).all(org, period);
    for (const w of wl) {
      const pcr = (w.ticket && /\b(?:PROJ|PL)-\d+\b/.test(w.ticket)) ? w.ticket.match(/\b(?:PROJ|PL)-\d+\b/)[0] : null;
      backlog.push({
        sort: 20000 + w.sort, key: w.symbol || w.name, name: w.name || null,
        pcr, pcr_all: pcr, theme: w.section === 'below-cutline' ? 'Below cutline' : 'Backlog',
        okr: null, priority: null, quarter: w.quarter || null, half: null,
        owners: w.owners || null, sheet_status: w.status || null, section: w.section,
        span_first: null, span_last: null, span_weeks: null, eng: null, notes: w.notes || null,
        jira: pcr && jira[pcr] ? jira[pcr] : null, aliases: [], doc_refs: [],
        best_name: null, summary: null, status_narrative: null, confidence: null, last_enriched: null,
      });
    }
  }

  // cross-dimension connection layer: control-center health/synthesis, live
  // tasks (with sprint cycle), open decisions, artifacts — joined by name to
  // the SAME canonical projects the roadmap plots. This is the "connection
  // across all these dimensions on the same plane" for the control center.
  const connections = buildConnections(resolverRows);
  const attachConn = p => { p.conn = connections.byKey[p.key] || null; return p; };
  projects.forEach(attachConn);
  barProjects.forEach(attachConn);

  const out = {
    org, period, periods: PLANNER_PERIODS,
    cellKind: org === 'experience' ? 'symbol' : 'freetext',
    gridPeriod, gridNote,
    weeks, people, grid, bars,
    fullYear: buildFullYear(org, resolve, resolverRows, connections),
    connections: connections.byKey,
    projects, backlog, roadmap, barProjects,
    // identical shape for both orgs: computed grid-utilization capacity
    capacity: computeCapacity(people, weeks, grid),
  };

  // supplementary, org-specific data (not its own tab — feeds richer panels)
  if (org === 'experience') {
    out.workstreams = db.prepare(
      `SELECT sort,symbol,quarter,ticket,name,status,be_effort,fe_effort,owners,notes,section
         FROM planner_workstreams WHERE org=? AND period=? ORDER BY sort`
    ).all(org, period);
  } else {
    out.features = db.prepare(
      `SELECT sort,feature,theme,okr,priority,source,doc,eng,week_size,scope_confidence,launch,prd_erd,notes,impacc,pcr,section
         FROM planner_features WHERE org=? AND period=? ORDER BY sort`
    ).all(org, 'H1-2026');
    out.capacityBudget = {
      kind: 'budget',
      rows: db.prepare(`SELECT sort,label,value,col3,col4 FROM planner_capacity WHERE org=? AND period=? ORDER BY sort`).all(org, 'H1-2026'),
    };
  }
  res.json(out);
});

function parseTask(t) {
  return {
    ...t,
    tags: JSON.parse(t.tags || '[]'),
    flags: JSON.parse(t.flags || '[]'),
    links: JSON.parse(t.links || '[]'),
    stakeholders: JSON.parse(t.stakeholders || '[]'),
    task_type: t.task_type || 'task',
    source: t.source || 'manual',
  };
}

// ── EMAIL PLANE ────────────────────────────────────────────────────────────
// Read + review surface for the email-triage routine. The routine writes the
// email_* tables (triage/draft/verify); these routes render them and record
// Jordan's send-decision. NB: "approve" NEVER sends — send_email is hard-denied
// by the floor. Approve records the decision; Jordan sends from Gmail directly.
const hasEmailTables = () => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='email_items'").get();

app.get('/api/email', (req, res) => {
  if (!hasEmailTables()) return res.json({ items: [], drafts: [], commitments: [], summary: {} });
  const items = db.prepare(`
    SELECT i.*,
           (SELECT COUNT(*) FROM email_commitments c WHERE c.email_item_id = i.id AND c.status='open') AS open_commitments,
           (SELECT COUNT(*) FROM email_drafts d WHERE d.email_item_id = i.id) AS draft_count
    FROM email_items i
    WHERE i.status IN ('open','snoozed','acked')
    ORDER BY CASE i.route WHEN 'needs_you' THEN 0 WHEN 'external' THEN 1 WHEN 'inbox' THEN 2 ELSE 3 END,
             CASE i.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
             i.received_at DESC`).all();
  const drafts = db.prepare(`
    SELECT d.*, i.subject, i.sender, i.sender_email, i.route
    FROM email_drafts d LEFT JOIN email_items i ON i.id = d.email_item_id
    WHERE d.status IN ('proposed','ready','blocked','approved')
    ORDER BY CASE d.status WHEN 'ready' THEN 0 WHEN 'proposed' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, d.created_at DESC`).all();
  const commitments = db.prepare(`SELECT * FROM email_commitments WHERE status='open' ORDER BY (due_iso IS NULL), due_iso ASC LIMIT 50`).all();
  const summary = {
    open_items: items.length,
    needs_you: items.filter((i) => i.route === 'needs_you').length,
    ready_drafts: drafts.filter((d) => d.status === 'ready').length,
    blocked_drafts: drafts.filter((d) => d.status === 'blocked').length,
    open_commitments: commitments.length,
  };
  res.json({ items, drafts, commitments, summary });
});

// NOTE: standalone GET /api/email/drafts removed in the 2026-07 audit (#30) —
// the /api/email bundle above already returns `drafts`, and nothing consumed it.

// Draft actions. approve = record Jordan's send-decision (does NOT send).
const DRAFT_VERBS = { approve: 'approved', discard: 'discarded' };
for (const [verb, newStatus] of Object.entries(DRAFT_VERBS)) {
  app.post(`/api/email/drafts/:id/${verb}`, (req, res) => {
    if (!hasEmailTables()) return res.status(404).json({ error: 'no email tables' });
    const r = db.prepare(`UPDATE email_drafts SET status=? WHERE id=?`).run(newStatus, req.params.id);
    try { db.prepare(`INSERT INTO email_events (routine, action, detail) VALUES ('draft', ?, ?)`).run(verb, `draft #${req.params.id} by ${(req.body && req.body.by) || 'jordan'}`); } catch (_) {}
    res.json({ ok: r.changes > 0, status: newStatus });
  });
}
app.post('/api/email/drafts/:id/snooze', (req, res) => {
  if (!hasEmailTables()) return res.status(404).json({ error: 'no email tables' });
  const r = db.prepare(`UPDATE email_drafts SET status='proposed' WHERE id=?`).run(req.params.id);
  res.json({ ok: r.changes > 0 });
});

// Item actions: ack | snooze | done.
app.post('/api/email/items/:id/:verb', (req, res) => {
  if (!hasEmailTables()) return res.status(404).json({ error: 'no email tables' });
  const map = { ack: 'acked', snooze: 'snoozed', done: 'done' };
  const status = map[req.params.verb];
  if (!status) return res.status(400).json({ error: 'bad verb' });
  const snooze_until = req.params.verb === 'snooze' ? ((req.body && req.body.until) || null) : null;
  const r = db.prepare(`UPDATE email_items SET status=?, snooze_until=?, acted_at=datetime('now'), acted_by='jordan' WHERE id=?`).run(status, snooze_until, req.params.id);
  try { db.prepare(`INSERT INTO email_events (routine, action, thread_id, detail) VALUES (?,?,?,?)`).run(req.params.verb, status, null, `item #${req.params.id}`); } catch (_) {}
  res.json({ ok: r.changes > 0, status });
});

// ── needs-you resolutions ────────────────────────────────────────────────────
// READ surface for needs_you_resolutions (written by needs-you-resolver.js).
// Status-only verbs — NOTHING is sent or posted externally.
const hasResolutionsTable = () => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='needs_you_resolutions'").get();

app.get('/api/needs-you', (req, res) => {
  if (!hasEmailTables()) return res.json({ items: [], counts: {} });
  // Pull all needs_you email_items, left-joining their resolution row if one exists.
  const hasResT = hasResolutionsTable();
  const joinClause = hasResT
    ? 'LEFT JOIN needs_you_resolutions r ON r.email_item_id = i.id'
    : '';
  const resColumns = hasResT
    ? `r.id AS res_id, r.source_kind, r.source_ref, r.item_type,
       r.ask, r.decision, r.next_steps, r.context, r.draft_action,
       r.automation_tier, r.confidence, r.verdict,
       r.status AS res_status, r.created_at AS res_created_at, r.verified_at, r.note,`
    : `NULL AS res_id, NULL AS source_kind, NULL AS source_ref, NULL AS item_type,
       NULL AS ask, NULL AS decision, NULL AS next_steps, NULL AS context, NULL AS draft_action,
       NULL AS automation_tier, NULL AS confidence, NULL AS verdict,
       NULL AS res_status, NULL AS res_created_at, NULL AS verified_at, NULL AS note,`;
  const rows = db.prepare(`
    SELECT
      i.id AS item_id, i.thread_id, i.subject, i.sender, i.sender_email,
      i.tier, i.synth_summary, i.received_at, i.status AS item_status,
      i.snooze_until,
      ${resColumns}
      i.id AS _id_dup
    FROM email_items i
    ${joinClause}
    WHERE i.route = 'needs_you'
      AND i.status IN ('open','snoozed','acked')
    ORDER BY
      CASE i.tier WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
      i.received_at DESC`).all();

  // Parse JSON columns server-side
  const items = rows.map(r => ({
    ...r,
    next_steps: (() => { try { return JSON.parse(r.next_steps || '[]'); } catch (_) { return []; } })(),
    context:    (() => { try { return JSON.parse(r.context || '[]'); } catch (_) { return []; } })(),
    resolved:   r.res_id != null,
  }));

  const counts = {
    total:       items.length,
    resolved:    items.filter(i => i.resolved).length,
    unresolved:  items.filter(i => !i.resolved).length,
    acted:       items.filter(i => i.res_status === 'acted').length,
    dismissed:   items.filter(i => i.res_status === 'dismissed').length,
    ready:       items.filter(i => i.res_status === 'ready').length,
    can_automate: items.filter(i => i.automation_tier >= 2).length,
  };
  res.json({ items, counts });
});

// POST /api/needs-you/:id/:verb — status-only; no egress.
// :id = needs_you_resolutions.id; verb ∈ {ack, dismiss, snooze, act}
const NY_VERBS = { ack: 'ready', dismiss: 'dismissed', act: 'acted' };
for (const [verb, newStatus] of Object.entries(NY_VERBS)) {
  app.post(`/api/needs-you/:id/${verb}`, (req, res) => {
    if (!hasResolutionsTable()) return res.status(404).json({ error: 'no resolutions table' });
    const r = db.prepare(`UPDATE needs_you_resolutions SET status=? WHERE id=?`).run(newStatus, req.params.id);
    if (verb === 'act') {
      // Mark linked email_item done — status-only, no send.
      try {
        const row = db.prepare(`SELECT email_item_id FROM needs_you_resolutions WHERE id=?`).get(req.params.id);
        if (row) db.prepare(`UPDATE email_items SET status='done', acted_at=datetime('now'), acted_by='jordan' WHERE id=?`).run(row.email_item_id);
      } catch (_) {}
    }
    try { db.prepare(`INSERT INTO email_events (routine, action, detail) VALUES ('needs_you',?,?)`).run(verb, `resolution #${req.params.id}`); } catch (_) {}
    res.json({ ok: r.changes > 0, status: newStatus });
  });
}
app.post('/api/needs-you/:id/snooze', (req, res) => {
  if (!hasResolutionsTable()) return res.status(404).json({ error: 'no resolutions table' });
  const row = db.prepare(`SELECT email_item_id FROM needs_you_resolutions WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const until = (req.body && req.body.until) || null;
  db.prepare(`UPDATE email_items SET status='snoozed', snooze_until=? WHERE id=?`).run(until, row.email_item_id);
  try { db.prepare(`INSERT INTO email_events (routine, action, detail) VALUES ('needs_you','snooze',?)`).run(`item #${row.email_item_id} until ${until}`); } catch (_) {}
  res.json({ ok: true, status: 'snoozed', until });
});

// ── inbox sweep (ADR-0015) ───────────────────────────────────────────────────
const hasSweepTable = () => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='email_sweep_actions'").get();

// GET /api/email/sweep — pending proposals grouped into approvable batches +
// the recent executed/undone log. This is the review surface for destructive ops.
app.get('/api/email/sweep', (req, res) => {
  if (!hasSweepTable()) return res.json({ batches: [], executed: [], summary: {} });
  const pending = db.prepare(`
    SELECT * FROM email_sweep_actions
    WHERE status IN ('proposed','approved') AND action != 'keep'
    ORDER BY CASE action WHEN 'trash' THEN 0 WHEN 'archive' THEN 1 ELSE 2 END, id`).all();
  // group into batches by batch_key for one-click bulk approval
  const byKey = new Map();
  for (const r of pending) {
    if (!byKey.has(r.batch_key)) byKey.set(r.batch_key, { batch_key: r.batch_key, action: r.action, items: [] });
    byKey.get(r.batch_key).items.push(r);
  }
  const batches = [...byKey.values()];
  const executed = db.prepare(`
    SELECT * FROM email_sweep_actions
    WHERE status IN ('executed','undone') ORDER BY COALESCE(executed_at, created_at) DESC LIMIT 100`).all();
  // Attention: threads the sweep deliberately KEPT because the review agent judged
  // a real human is waiting on Jordan (review_verdict='reject' on a keep). These are
  // signal, not clutter — surfaced read-only so they aren't lost among the noise.
  const attention = db.prepare(`
    SELECT id, thread_id, subject, sender, sender_email, review_note, created_at
    FROM email_sweep_actions
    WHERE action='keep' AND review_verdict='reject'
    ORDER BY id DESC LIMIT 25`).all();
  const summary = {
    pending: pending.length,
    proposed: pending.filter((r) => r.status === 'proposed').length,
    approved: pending.filter((r) => r.status === 'approved').length,
    attention: attention.length,
    executed: db.prepare("SELECT COUNT(*) n FROM email_sweep_actions WHERE status='executed'").get().n,
    undone: db.prepare("SELECT COUNT(*) n FROM email_sweep_actions WHERE status='undone'").get().n,
  };
  res.json({ batches, attention, executed, summary });
});

const SWEEP_VERBS = { approve: 'approved', reject: 'rejected' };

// Expand a thread to the message ids that need actioning. mcpgw mutators are
// per-MESSAGE (single `email_id`), so to clear a whole conversation we act on
// every message. Falls back to the stored msg_id if the thread read fails, so a
// transient get_thread miss still actions at least the synced message.
async function threadMessageIds(gmailCall, r, wantInboxOnly) {
  try {
    const resp = await gmailCall('get_thread', { thread_id: r.thread_id });
    // mcpgw shape: raw.result.content[0].text is a JSON string carrying .messages.
    // (The old code read resp.json.messages, which never existed — it silently fell
    // back to the single-message id, so multi-message threads and the wantInboxOnly
    // filter both quietly no-op'd.)
    let msgs = [];
    const text = resp && resp.raw && resp.raw.result && resp.raw.result.content
      && resp.raw.result.content[0] && resp.raw.result.content[0].text;
    if (text) { try { const p = JSON.parse(text); if (Array.isArray(p.messages)) msgs = p.messages; } catch (_) {} }
    if (!msgs.length && resp && resp.json && Array.isArray(resp.json.messages)) msgs = resp.json.messages;
    let ids = msgs
      .filter((m) => !wantInboxOnly || (Array.isArray(m.labelIds) && m.labelIds.includes('INBOX')))
      .map((m) => m.id)
      .filter(Boolean);
    if (!ids.length) ids = msgs.map((m) => m.id).filter(Boolean);
    if (ids.length) return ids;
  } catch (_) { /* fall through to single-message fallback */ }
  return [r.msg_id || r.thread_id].filter(Boolean);
}

// Perform one row's Gmail action (floor-gated, reversible) across the whole
// thread. Shared by /execute, /apply, and the batch apply path.
async function execOneSweep(gmailCall, r) {
  if (r.action === 'archive') {
    // archive = remove INBOX; if the rule also carries a target label (📅/📊/👀),
    // apply it in the SAME call so archived mail stays findable under its label
    // (the old code only archived and silently dropped r.label).
    for (const id of await threadMessageIds(gmailCall, r, true)) {
      if (r.label) await gmailCall('update_email', { email_id: id, add_labels: [r.label], remove_labels: ['INBOX'] });
      else await gmailCall('archive_email', { email_id: id });
    }
  } else if (r.action === 'trash') {
    for (const id of await threadMessageIds(gmailCall, r, false)) await gmailCall('trash_email', { email_id: id });
  } else if (r.action === 'label') {
    for (const id of await threadMessageIds(gmailCall, r, false)) await gmailCall('update_email', { email_id: id, add_labels: [r.label] });
  } else return false;
  db.prepare(`UPDATE email_sweep_actions SET status='executed', executed_at=datetime('now') WHERE id=?`).run(r.id);
  try { db.prepare(`INSERT INTO email_events (routine, action, thread_id, detail) VALUES ('sweep','executed',?,?)`).run(r.thread_id, `#${r.id} ${r.action}`); } catch (_) {}
  return true;
}
function loadDispatch(res) {
  try { return require('./mcp-dispatch'); }
  catch (e) { res.status(500).json({ error: 'dispatch unavailable: ' + e.message }); return null; }
}

// Feed a HUMAN decision on a sweep proposal into the rule ledger (ADR-0016 learning
// loop). Every dashboard gesture is independent human ground truth — the signal the
// staged→auto graduation gate REQUIRES (ground_truth IN 'human'|'restore'); without
// it the only human evidence was disposition-capture's after-the-fact restore sensing,
// so a rule Jordan actively approved/rejected on the dashboard learned nothing.
//   apply/approve → 'agree' (endorsed the destructive action), ground='human'
//   reject        → 'keep'  (declined it → disagree),          ground='human'
//   undo          → force RESTORE (always demotes), ground='restore'
// Best-effort: never let a ledger hiccup break the user-facing action.
function reconcileSweepHuman(threadId, actual, ground) {
  try { return require('./rule-engine').reconcileThreadPredictions(threadId, actual, ground); }
  catch (_) { return 0; }
}
function reconcileSweepRestore(threadId) {
  try { return require('./rule-engine').reconcileThreadRestore(threadId); }
  catch (_) { return 0; }
}

// Batch APPLY by batch_key — the primary review gesture. Approve + EXECUTE in one
// click: the proposals actually leave the inbox now (floor-gated archive/trash),
// then show up in the undo log. This is what "Approve all" means to Jordan; the
// safety is that every action is reversible (ADR-0015). Registered BEFORE the
// `/:id/:verb` routes so `/batch/...` can't match `:id='batch'`.
app.post('/api/email/sweep/batch/apply', async (req, res) => {
  if (!hasSweepTable()) return res.status(404).json({ error: 'no sweep table' });
  const key = req.body && req.body.batch_key;
  if (!key) return res.status(400).json({ error: 'batch_key required' });
  const disp = loadDispatch(res); if (!disp) return;
  const rows = db.prepare(`SELECT * FROM email_sweep_actions WHERE batch_key=? AND status IN ('proposed','approved') AND action IN ('archive','trash','label') ORDER BY id`).all(key);
  let done = 0, failed = 0; const errors = [];
  for (const r of rows) {
    try { if (await execOneSweep(disp.gmailCall, r)) { done++; reconcileSweepHuman(r.thread_id, r.action, 'human'); } }
    catch (e) { failed++; errors.push({ id: r.id, error: String(e.message).slice(0, 160) }); }
  }
  res.json({ ok: true, executed: done, failed, errors });
});

// Batch REJECT by batch_key — drop the proposals, nothing outward.
app.post('/api/email/sweep/batch/reject', (req, res) => {
  if (!hasSweepTable()) return res.status(404).json({ error: 'no sweep table' });
  const key = req.body && req.body.batch_key;
  if (!key) return res.status(400).json({ error: 'batch_key required' });
  // Capture thread_ids BEFORE the status flip so we can feed the human 'keep' decision
  // into the rule ledger (the rows won't match the reject predicate afterward).
  const affected = db.prepare(`SELECT thread_id FROM email_sweep_actions WHERE batch_key=? AND status IN ('proposed','approved')`).all(key);
  const r = db.prepare(`UPDATE email_sweep_actions SET status='rejected' WHERE batch_key=? AND status IN ('proposed','approved')`).run(key);
  for (const a of affected) reconcileSweepHuman(a.thread_id, 'keep', 'human');
  try { db.prepare(`INSERT INTO email_events (routine, action, detail) VALUES ('sweep','batch_reject',?)`).run(`${r.changes} in ${key}`); } catch (_) {}
  res.json({ ok: true, changed: r.changes, status: 'rejected' });
});

// Legacy status-only batch approve/reject (used by auto-mode tooling / API clients
// that stage without executing). Kept for compatibility.
app.post('/api/email/sweep/batch/:verb', (req, res) => {
  if (!hasSweepTable()) return res.status(404).json({ error: 'no sweep table' });
  const newStatus = SWEEP_VERBS[req.params.verb];
  if (!newStatus) return res.status(400).json({ error: 'bad verb' });
  const key = req.body && req.body.batch_key;
  if (!key) return res.status(400).json({ error: 'batch_key required' });
  const affected = db.prepare(`SELECT thread_id, action FROM email_sweep_actions WHERE batch_key=? AND status='proposed'`).all(key);
  const r = db.prepare(`UPDATE email_sweep_actions SET status=? WHERE batch_key=? AND status='proposed'`).run(newStatus, key);
  // approve → human agreed to each action; reject → human wants keep.
  for (const a of affected) reconcileSweepHuman(a.thread_id, req.params.verb === 'reject' ? 'keep' : a.action, 'human');
  try { db.prepare(`INSERT INTO email_events (routine, action, detail) VALUES ('sweep', ?, ?)`).run(`batch_${req.params.verb}`, `${r.changes} in ${key}`); } catch (_) {}
  res.json({ ok: true, changed: r.changes, status: newStatus });
});

// Single-row APPLY — approve + execute one proposal immediately (the per-row ✓).
app.post('/api/email/sweep/:id/apply', async (req, res) => {
  if (!hasSweepTable()) return res.status(404).json({ error: 'no sweep table' });
  const row = db.prepare(`SELECT * FROM email_sweep_actions WHERE id=? AND status IN ('proposed','approved')`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found or already actioned' });
  const disp = loadDispatch(res); if (!disp) return;
  try {
    const ok = await execOneSweep(disp.gmailCall, row);
    if (ok) reconcileSweepHuman(row.thread_id, row.action, 'human');
    res.json({ ok, status: ok ? 'executed' : 'skipped' });
  }
  catch (e) { res.status(500).json({ error: 'apply failed: ' + String(e.message).slice(0, 200) }); }
});

// Single-action verbs: approve | reject flip status only (no Gmail action). approve
// stages for a later /execute or auto-run; reject drops the proposal.
for (const [verb, newStatus] of Object.entries(SWEEP_VERBS)) {
  app.post(`/api/email/sweep/:id/${verb}`, (req, res) => {
    if (!hasSweepTable()) return res.status(404).json({ error: 'no sweep table' });
    const row = db.prepare(`SELECT thread_id, action FROM email_sweep_actions WHERE id=? AND status IN ('proposed','approved')`).get(req.params.id);
    const r = db.prepare(`UPDATE email_sweep_actions SET status=? WHERE id=? AND status IN ('proposed','approved')`).run(newStatus, req.params.id);
    if (r.changes > 0 && row) reconcileSweepHuman(row.thread_id, verb === 'reject' ? 'keep' : row.action, 'human');
    try { db.prepare(`INSERT INTO email_events (routine, action, detail) VALUES ('sweep', ?, ?)`).run(verb, `action #${req.params.id} by ${(req.body && req.body.by) || 'jordan'}`); } catch (_) {}
    res.json({ ok: r.changes > 0, status: newStatus });
  });
}

// Execute all already-approved actions (floor-gated). For the auto/staged path.
app.post('/api/email/sweep/execute', async (req, res) => {
  if (!hasSweepTable()) return res.status(404).json({ error: 'no sweep table' });
  const disp = loadDispatch(res); if (!disp) return;
  const rows = db.prepare(`SELECT * FROM email_sweep_actions WHERE status='approved' AND action IN ('archive','trash','label') ORDER BY id`).all();
  let done = 0, failed = 0; const errors = [];
  for (const r of rows) {
    try { if (await execOneSweep(disp.gmailCall, r)) done++; }
    catch (e) { failed++; errors.push({ id: r.id, error: String(e.message).slice(0, 160) }); }
  }
  res.json({ ok: true, executed: done, failed, errors });
});

// Undo — reverse an executed action in Gmail (restore INBOX / untrash) and mark
// undone. Reversibility is the ADR-0015 invariant; this is where it's cashed in.
app.post('/api/email/sweep/:id/undo', async (req, res) => {
  if (!hasSweepTable()) return res.status(404).json({ error: 'no sweep table' });
  const row = db.prepare(`SELECT * FROM email_sweep_actions WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  // proposed/approved but not yet executed → just cancel it (a 'keep' decision).
  if (row.status !== 'executed') {
    const r = db.prepare(`UPDATE email_sweep_actions SET status='rejected' WHERE id=?`).run(row.id);
    reconcileSweepHuman(row.thread_id, 'keep', 'human');
    return res.json({ ok: r.changes > 0, status: 'rejected', note: 'was not executed; cancelled' });
  }
  let gmailCall;
  try { ({ gmailCall } = require('./mcp-dispatch')); }
  catch (e) { return res.status(500).json({ error: 'dispatch unavailable: ' + e.message }); }
  try {
    // Reverse precisely BY ACTION. archive removed only INBOX; trash moved to
    // TRASH (INBOX stripped) — custom user labels survive both in Gmail, so
    // re-adding INBOX (and lifting TRASH) fully reverses them. A label action
    // only ADDED row.label and never left the inbox, so its undo is to REMOVE
    // that label — the old code added INBOX for every action, wrongly re-inboxing
    // a label undo instead of undoing the label. update_email is the reversible
    // mutator (floor-ALLOWED under ADR-0015).
    let add = [], remove = [];
    if (row.action === 'label') {
      if (row.label) remove = [row.label];
    } else if (row.action === 'trash') {
      add = ['INBOX']; remove = ['TRASH'];
    } else { // archive
      add = ['INBOX'];
      // if the archive also applied a label, strip it — but only if it wasn't
      // already present before the action (pre_state), so a pre-existing label
      // the user set survives the undo.
      if (row.label) {
        let pre = null; try { pre = JSON.parse(row.pre_state || 'null'); } catch (_) {}
        const hadLabel = pre && Array.isArray(pre.labels) && pre.labels.includes(row.label);
        if (!hadLabel) remove = [row.label];
      }
    }
    const ids = await threadMessageIds(gmailCall, row, false);
    for (const id of ids) await gmailCall('update_email', { email_id: id, add_labels: add, remove_labels: remove });
    db.prepare(`UPDATE email_sweep_actions SET status='undone', undone_at=datetime('now') WHERE id=?`).run(row.id);
    reconcileSweepRestore(row.thread_id);
    try { db.prepare(`INSERT INTO email_events (routine, action, thread_id, detail) VALUES ('sweep','undone',?,?)`).run(row.thread_id, `#${row.id} ${row.action}`); } catch (_) {}
    res.json({ ok: true, status: 'undone' });
  } catch (e) { res.status(500).json({ error: 'undo failed: ' + String(e.message).slice(0, 200) }); }
});

const PORT = parseInt(process.env.PORT, 10) || 3737;
app.listen(PORT, () => console.log(`Amp Tasks running at http://localhost:${PORT}`));
