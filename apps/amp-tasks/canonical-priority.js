#!/usr/bin/env node
/**
 * canonical-priority.js — bring the canonical priority/status model online.
 *
 * Design of record: docs/research/priority-model.md
 * Three orthogonal axes (amp-owned, "reality"), platforms demoted to feeders:
 *   1. IMPORTANCE  (real-state priority, the P-scale)   -> tasks.importance
 *   2. URGENCY     (time-to-act)                         -> tasks.urgency
 *   3. STATUS      (workflow, macro)                     -> tasks.macro_status
 * Task-driven priority = urgency x status. Real-state priority = importance.
 * Harmony = reconcile the two; only the divergence (STARVED / THRASH) surfaces.
 *
 * NON-DESTRUCTIVE: existing `priority`/`status` columns are left intact so the
 * live board keeps working. The canonical layer comes online alongside. Native
 * platform values are preserved as provenance (`source_priority`, `jira_status`).
 *
 * Idempotent: safe to re-run. Pass --commit to write; default is dry-run report.
 */
const db = require('./db');

const COMMIT = process.argv.includes('--commit');
const EXECS = ['alex chen', 'chen', 'mgr'];               // skip-level / manager
const IMPORTANT_TAGS = /compliance|legal|risk|revenue|pci|security|audit|regulat/i;

// ---------------------------------------------------------------------------
// 1. Schema — additive columns + reference tables (scales as data, editable)
// ---------------------------------------------------------------------------
function migrate() {
  const cols = db.prepare(`PRAGMA table_info(tasks)`).all().map(c => c.name);
  const add = (name, ddl) => { if (!cols.includes(name)) db.exec(`ALTER TABLE tasks ADD COLUMN ${ddl}`); };
  add('source_priority',   `source_priority TEXT`);              // native platform priority (provenance)
  add('importance',        `importance TEXT`);                   // canonical real-state P-scale
  add('urgency',           `urgency TEXT`);                      // canonical time-to-act
  add('macro_status',      `macro_status TEXT`);                 // canonical workflow status
  add('importance_source', `importance_source TEXT DEFAULT 'computed'`); // computed | adjudicated
  add('importance_score',  `importance_score INTEGER`);          // transparent rubric score 0-100
  add('dep_count',         `dep_count INTEGER DEFAULT 0`);        // dependency fan-out (blast radius)

  db.exec(`
    CREATE TABLE IF NOT EXISTS priority_scale (
      rank INTEGER PRIMARY KEY,            -- 0 = most important
      code TEXT NOT NULL UNIQUE,           -- P0..Pn (extensible)
      label TEXT NOT NULL,                 -- real-state meaning
      joint_action TEXT,                   -- what it means to DO (surface-palette §4)
      response_window TEXT,                -- SLA phrasing
      reserve_pct INTEGER,                 -- distribution cap: max % of active at this rung
      color TEXT
    );
    CREATE TABLE IF NOT EXISTS status_model (
      rank INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,           -- macro status
      label TEXT NOT NULL,
      is_open INTEGER NOT NULL DEFAULT 1,  -- counts as active work
      color TEXT
    );
    CREATE TABLE IF NOT EXISTS source_priority_map (
      source TEXT NOT NULL,                -- jira, linear, manual, ...
      native TEXT NOT NULL,                -- native value
      canonical_code TEXT NOT NULL,        -- -> priority_scale.code (as a DEFAULT hint only)
      PRIMARY KEY (source, native)
    );
    CREATE TABLE IF NOT EXISTS source_status_map (
      source TEXT NOT NULL,
      native TEXT NOT NULL,
      canonical_code TEXT NOT NULL,        -- -> status_model.code
      PRIMARY KEY (source, native)
    );
  `);
}

// Starter vocabulary (Jordan owns final; changing a rung is a data edit).
function seedScales() {
  const P = db.prepare(`INSERT OR IGNORE INTO priority_scale
    (rank,code,label,joint_action,response_window,reserve_pct,color) VALUES (?,?,?,?,?,?,?)`);
  [
    [0,'P0','Existential / drop-everything','Stop other work; this is the thing','now',5,'#ef4444'],
    [1,'P1','Strategically critical','Defend time for it this week','this week',15,'#f97316'],
    [2,'P2','Core roadmap','Steady execution; keep it moving','this cycle',60,'#eab308'],
    [3,'P3','Worthwhile, not load-bearing','Do when it clears; fine to wait','this half',100,'#3b82f6'],
    [4,'P4','Backlog / someday','Park; revisit at planning','unscheduled',100,'#6b7280'],
  ].forEach(r => P.run(...r));

  const S = db.prepare(`INSERT OR IGNORE INTO status_model (rank,code,label,is_open,color) VALUES (?,?,?,?,?)`);
  [
    [0,'not-started','Not started',1,'#6b7280'],
    [1,'active','Active',1,'#22c55e'],
    [2,'blocked','Blocked',1,'#ef4444'],
    [3,'waiting-external','Waiting (external)',1,'#eab308'],
    [4,'in-review','In review',1,'#3b82f6'],
    [5,'shipped','Shipped',0,'#16a34a'],
    [6,'dropped','Dropped',0,'#4b5563'],
  ].forEach(r => S.run(...r));

  const SP = db.prepare(`INSERT OR IGNORE INTO source_priority_map (source,native,canonical_code) VALUES (?,?,?)`);
  [['jira','P0','P1'],['jira','P1','P2'],['jira','P2','P2'],['jira','P3','P3'],
   ['jira','Highest','P1'],['jira','High','P2'],['jira','Medium','P2'],['jira','Low','P3']]
    .forEach(r => SP.run(...r));

  const SS = db.prepare(`INSERT OR IGNORE INTO source_status_map (source,native,canonical_code) VALUES (?,?,?)`);
  [['jira','New','not-started'],['jira','Accepted','not-started'],['jira','To Do','not-started'],
   ['jira','On Track','active'],['jira','In Progress','active'],['jira','In Review','in-review'],
   ['jira','At Risk','blocked'],['jira','Blocked','blocked'],['jira','Delivered','shipped'],
   ['jira','Done','shipped'],['jira','Closed','shipped'],['jira','Cancelled','dropped']]
    .forEach(r => SS.run(...r));
}

// ---------------------------------------------------------------------------
// 2. Adjudication engine — compute canonical axes from signals (WSJF-style)
// ---------------------------------------------------------------------------
const SEV_BASE = { critical: 40, high: 30, medium: 15, low: 5 };

function j(s) { try { return JSON.parse(s || '[]'); } catch { return []; } }

function scoreImportance(t) {
  let s = SEV_BASE[(t.severity || 'medium').toLowerCase()] ?? 15;   // objective impact = base
  const why = [`severity:${t.severity || 'medium'}(+${SEV_BASE[(t.severity||'medium').toLowerCase()] ?? 15})`];
  if (t.okr && String(t.okr).trim()) { s += 25; why.push('okr(+25)'); }
  const stake = j(t.stakeholders).map(x => String(x).toLowerCase());
  if (stake.some(p => EXECS.some(e => p.includes(e)))) { s += 20; why.push('exec(+20)'); }
  const tagstr = (j(t.tags).join(' ') + ' ' + (t.tags || '')).toLowerCase();
  if (IMPORTANT_TAGS.test(tagstr) || IMPORTANT_TAGS.test((t.title||'')+' '+(t.description||''))) { s += 15; why.push('risk/compliance(+15)'); }
  if (t.merchant && String(t.merchant).trim()) { s += 8; why.push('retailer(+8)'); }
  if (t.dep_count && t.dep_count > 0) { const d = Math.min(t.dep_count * 2, 16); s += d; why.push(`deps:${t.dep_count}(+${d})`); }
  return { score: Math.min(100, s), why };
}
function scoreToCode(score) {
  if (score >= 70) return 'P0';
  if (score >= 50) return 'P1';
  if (score >= 28) return 'P2';
  if (score >= 12) return 'P3';
  return 'P4';
}

const DAY = 86400000;
function computeUrgency(t, now) {
  const health = j(t.flags);
  if (t.due_date) {
    const days = Math.floor((new Date(t.due_date).getTime() - now) / DAY);
    if (days <= 3) return 'now';
    if (days <= 10) return 'this-week';
    if (days <= 45) return 'this-cycle';
    return 'later';
  }
  if (health.includes('at-risk')) return 'this-week';
  if (t.time_horizon === 'today') return 'now';
  if (t.time_horizon === 'this-week') return 'this-week';
  if (t.time_horizon === 'this-month') return 'this-cycle';
  if (t.time_horizon === 'long-term') return 'later';
  return 'none';
}

function computeMacroStatus(t) {
  // Prefer feeder mapping when present, else map local status.
  if (t.source === 'jira' && t.jira_status) {
    const m = db.prepare(`SELECT canonical_code FROM source_status_map WHERE source='jira' AND native=?`).get(t.jira_status);
    if (m) return m.canonical_code;
  }
  const local = { 'todo':'not-started','in-progress':'active','blocked':'blocked',
    'waiting':'waiting-external','paused':'waiting-external','done':'shipped','migrated':'dropped' };
  return local[t.status] || 'not-started';
}

// ---------------------------------------------------------------------------
// 3. Reconciliation — the harmony signal (STARVED / THRASH)
// ---------------------------------------------------------------------------
function activityLevel(t, macroStatus, urgency, now) {
  const days = t.updated_at ? Math.floor((now - new Date(t.updated_at).getTime()) / DAY) : 999;
  const moving = (macroStatus === 'active' || macroStatus === 'in-review') && days <= 14;
  const due = urgency === 'now' || urgency === 'this-week';
  if (moving || due) return 'high';
  const parked = macroStatus === 'not-started' || days > 14 || urgency === 'none' || urgency === 'later';
  return parked ? 'low' : 'mid';
}

function run() {
  migrate();
  seedScales();
  const now = Date.now();
  const tasks = db.prepare(`SELECT * FROM tasks WHERE status NOT IN ('done','migrated')`).all();

  const upd = db.prepare(`UPDATE tasks SET source_priority=COALESCE(source_priority,?),
    importance=?, importance_score=?, urgency=?, macro_status=?,
    importance_source=COALESCE(NULLIF(importance_source,''),'computed') WHERE id=?`);

  const dist = {}; const starved = []; const thrash = []; let harmony = 0;
  const tx = db.transaction(() => {
    for (const t of tasks) {
      const { score, why } = scoreImportance(t);
      const imp = scoreToCode(score);
      const urg = computeUrgency(t, now);
      const ms  = computeMacroStatus(t);
      const nativePrio = t.source === 'jira' ? (t.source_priority || t.priority) : (t.source_priority || null);
      if (COMMIT) upd.run(nativePrio, imp, score, urg, ms, t.id);

      dist[imp] = (dist[imp] || 0) + 1;
      const act = activityLevel(t, ms, urg, now);
      const impHigh = imp === 'P0' || imp === 'P1';
      const impLow  = imp === 'P3' || imp === 'P4';
      if (impHigh && act === 'low')  starved.push({ id:t.id, title:t.title, imp, urg, ms, score, why });
      else if (impLow && act === 'high') thrash.push({ id:t.id, title:t.title, imp, urg, ms, score, why });
      else harmony++;
    }
  });
  tx();

  // ----- report -----
  const total = tasks.length;
  const pct = n => total ? Math.round(100 * n / total) : 0;
  console.log(`\n=== CANONICAL PRIORITY ADJUDICATION ${COMMIT ? '(COMMITTED)' : '(DRY RUN — pass --commit to write)'} ===`);
  console.log(`Active tasks scored: ${total}\n`);
  console.log('IMPORTANCE distribution (real-state P-scale):');
  ['P0','P1','P2','P3','P4'].forEach(c => {
    const n = dist[c] || 0; const cap = db.prepare('SELECT reserve_pct FROM priority_scale WHERE code=?').get(c)?.reserve_pct;
    const flag = (c==='P0'||c==='P1') && pct(n) > cap ? `  ⚠️ over reserve (${cap}%)` : '';
    console.log(`  ${c}: ${String(n).padStart(3)}  (${pct(n)}%)${flag}`);
  });
  console.log(`\nHARMONY: ${harmony}/${total} (${pct(harmony)}%) tasks where real-state ↔ task-activity agree`);
  console.log(`\n⚠️  STARVED — high importance, not moving (Q2 crushed): ${starved.length}`);
  starved.sort((a,b)=>b.score-a.score).slice(0,12).forEach(x =>
    console.log(`   [${x.imp}/${x.ms}/${x.urg}] #${x.id} ${x.title.slice(0,64)}  {${x.why.join(',')}}`));
  console.log(`\n⚠️  THRASH — low importance, high activity (false fire): ${thrash.length}`);
  thrash.sort((a,b)=>a.score-b.score).slice(0,12).forEach(x =>
    console.log(`   [${x.imp}/${x.ms}/${x.urg}] #${x.id} ${x.title.slice(0,64)}  {${x.why.join(',')}}`));
  console.log('');
}

run();
