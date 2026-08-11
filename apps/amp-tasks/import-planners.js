#!/usr/bin/env node
/*
 * import-planners.js — load Jordan's real planning spreadsheets into the control
 * plane as first-class SSOT, and ENRICH them into a connected model:
 *
 *   grid cells  ->  workstream/feature  ->  PROJ ticket  ->  live Jira status
 *                                        ->  theme / OKR  ->  quarter / half
 *
 * Sources (pulled via gsheets MCP into seed/*.json — attended, no live creds here):
 *   Payments : 1Opqc6P4SocKsEx4ZQkeAkSVUVkvQr-Chb78xaZ-jLAM
 *     Team GANTT  -> person x week (free-text)     [payments-gantt.json]
 *     Projects    -> feature planner + Intake/Ideas/Cut-line [payments-projects.json]
 *     Eng Budget  -> capacity model                [payments-capacity.json]
 *     Outtake     -> cross-team deps -> PROJ         [payments-outtake.json]
 *   Experience    : 1r-k2f69yeQ9ZibyBpFkmu4m8IgmVOSnQl7xa-GR1f_E
 *     H1 2026     -> Q1+Q2 grid (symbol chips) + legend [experience-h1.json]
 *     [WIP] H2    -> Q3 grid + carryover legend     [experience-h2.json]
 *     Backlog     -> pickup candidates              [experience-backlog.json]
 *   Enrichment : PROJ live status mirror             [jira-enrich.json]
 *
 * planner_projects is the canonical join entity. Idempotent per (org, period).
 * LOCAL SSOT only — no external writes. Usage: node import-planners.js
 */
const fs = require('fs');
const path = require('path');
const db = require('./db');

const SEED = path.join(__dirname, 'seed');
const rd = f => JSON.parse(fs.readFileSync(path.join(SEED, f), 'utf8'));

// ── schema (idempotent) ──────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS planner_weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org TEXT NOT NULL, period TEXT NOT NULL,
    sort INTEGER NOT NULL, label TEXT NOT NULL, quarter TEXT,
    UNIQUE(org, period, sort)
  );
  CREATE TABLE IF NOT EXISTS planner_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org TEXT NOT NULL, period TEXT NOT NULL,
    sort INTEGER NOT NULL, name TEXT NOT NULL, platform TEXT, role TEXT,
    UNIQUE(org, period, name)
  );
  CREATE TABLE IF NOT EXISTS planner_cells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org TEXT NOT NULL, period TEXT NOT NULL,
    person TEXT NOT NULL, sort INTEGER NOT NULL, text TEXT,
    UNIQUE(org, period, person, sort)
  );
  CREATE TABLE IF NOT EXISTS planner_workstreams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org TEXT NOT NULL, period TEXT NOT NULL, sort INTEGER,
    symbol TEXT, quarter TEXT, ticket TEXT, name TEXT, status TEXT,
    be_effort TEXT, fe_effort TEXT, owners TEXT, notes TEXT, section TEXT
  );
  CREATE TABLE IF NOT EXISTS planner_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org TEXT NOT NULL, period TEXT NOT NULL, sort INTEGER,
    feature TEXT, theme TEXT, okr TEXT, priority TEXT, source TEXT, doc TEXT,
    eng TEXT, week_size TEXT, scope_confidence TEXT, launch TEXT,
    prd_erd TEXT, notes TEXT, impacc TEXT, pcr TEXT, section TEXT
  );
  CREATE TABLE IF NOT EXISTS planner_capacity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org TEXT NOT NULL, period TEXT NOT NULL, sort INTEGER,
    label TEXT, value TEXT, col3 TEXT, col4 TEXT
  );
  CREATE TABLE IF NOT EXISTS planner_jira (
    key TEXT PRIMARY KEY,
    summary TEXT, status TEXT, status_category TEXT, priority TEXT
  );
  CREATE TABLE IF NOT EXISTS planner_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org TEXT NOT NULL, period TEXT NOT NULL, sort INTEGER,
    key TEXT, name TEXT, pcr TEXT, pcr_all TEXT,
    theme TEXT, okr TEXT, priority TEXT, quarter TEXT, half TEXT,
    owners TEXT, sheet_status TEXT, section TEXT,
    span_first INTEGER, span_last INTEGER, span_weeks INTEGER, eng TEXT, notes TEXT,
    best_name TEXT, aliases TEXT, summary TEXT, status_narrative TEXT,
    doc_refs TEXT, confidence REAL, last_enriched TEXT
  );
`);

// idempotent migration: add enrichment columns to pre-existing DBs
for (const col of ['best_name TEXT', 'aliases TEXT', 'summary TEXT',
  'status_narrative TEXT', 'doc_refs TEXT', 'confidence REAL', 'last_enriched TEXT']) {
  try { db.exec(`ALTER TABLE planner_projects ADD COLUMN ${col}`); } catch (_) { /* already exists */ }
}

const clear = (tbl, org, period) =>
  db.prepare(`DELETE FROM ${tbl} WHERE org=? AND period=?`).run(org, period);

function splitName(raw) {
  const m = String(raw || '').match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { name: m[1].trim(), platform: m[2].trim() };
  return { name: String(raw || '').trim(), platform: null };
}
const clean = v => (v == null ? null : String(v).trim() || null);

// PROJ-000 / PL-1234 refs out of any free text; primary = first.
function extractPcrs(...parts) {
  const s = parts.filter(Boolean).join(' ');
  const m = s.match(/\b(?:PROJ|PL)-\d+\b/g) || [];
  return [...new Set(m)];
}
// quarter string -> half of year
function halfOf(quarter) {
  const q = String(quarter || '').toUpperCase();
  if (/Q3|Q4/.test(q)) return 'H2';
  if (/Q1|Q2|H1/.test(q)) return 'H1';
  return null;
}
const isSymbol = t => typeof t === 'string' && /^\[[^\]]+\]$/.test(t.trim());

// ── grid loader (shared) ──────────────────────────────────────────────────
function loadGrid(org, period, weeks, people) {
  clear('planner_weeks', org, period);
  clear('planner_people', org, period);
  clear('planner_cells', org, period);
  const wIns = db.prepare(`INSERT INTO planner_weeks (org,period,sort,label,quarter) VALUES (?,?,?,?,?)`);
  const pIns = db.prepare(`INSERT INTO planner_people (org,period,sort,name,platform,role) VALUES (?,?,?,?,?,?)`);
  const cIns = db.prepare(`INSERT OR REPLACE INTO planner_cells (org,period,person,sort,text) VALUES (?,?,?,?,?)`);
  const tx = db.transaction(() => {
    for (const w of weeks) wIns.run(org, period, w.sort, w.label, w.quarter || null);
    people.forEach((p, i) => {
      pIns.run(org, period, i, p.name, p.platform || null, p.role || null);
      for (const [sort, text] of Object.entries(p.cells)) {
        if (text != null && String(text).trim()) cIns.run(org, period, p.name, +sort, String(text).trim());
      }
    });
  });
  tx();
  return { weeks: weeks.length, people: people.length };
}

// ── canonical projects writer ─────────────────────────────────────────────
const projIns = db.prepare(`INSERT INTO planner_projects
  (org,period,sort,key,name,pcr,pcr_all,theme,okr,priority,quarter,half,owners,sheet_status,section,span_first,span_last,span_weeks,eng,notes)
  VALUES (@org,@period,@sort,@key,@name,@pcr,@pcr_all,@theme,@okr,@priority,@quarter,@half,@owners,@sheet_status,@section,@span_first,@span_last,@span_weeks,@eng,@notes)`);
function writeProjects(org, period, rows) {
  const tx = db.transaction(() => { for (const r of rows) projIns.run(r); });
  tx();
}

// ── enrichment: Jira status mirror ────────────────────────────────────────
function loadJira() {
  const { tickets } = rd('jira-enrich.json');
  db.exec(`DELETE FROM planner_jira`);
  const ins = db.prepare(`INSERT INTO planner_jira (key,summary,status,status_category,priority) VALUES (?,?,?,?,?)`);
  const tx = db.transaction(() => {
    for (const [key, t] of Object.entries(tickets))
      ins.run(key, t.summary, t.status, t.statusCategory, t.priority);
  });
  tx();
  return { tickets: Object.keys(tickets).length };
}

// ── PAYMENTS: Team GANTT ──────────────────────────────────────────────────
function paymentsGantt() {
  const { org, period, values } = rd('payments-gantt.json');
  const labels = values[0].slice(2);
  const weeks = labels.map((label, i) => ({ sort: i, label, quarter: i < 13 ? 'Q1' : 'Q2' }));
  const people = [];
  for (const row of values.slice(1)) {
    const name = clean(row[0]);
    if (!name) continue;
    const cells = {};
    row.slice(2).forEach((txt, i) => { if (clean(txt)) cells[i] = txt; });
    people.push({ name, platform: null, cells });
  }
  return loadGrid(org, period, weeks, people);
}

// ── PAYMENTS: Projects feature planner + canonical projects ───────────────
function paymentsFeatures() {
  const { org, values } = rd('payments-projects.json');
  const basePeriod = 'H1-2026';
  clear('planner_features', org, 'H1-2026');
  clear('planner_features', org, 'H2-2026');
  const ins = db.prepare(`INSERT INTO planner_features
    (org,period,sort,feature,theme,okr,priority,source,doc,eng,week_size,scope_confidence,launch,prd_erd,notes,impacc,pcr,section)
    VALUES (@org,@period,@sort,@feature,@theme,@okr,@priority,@source,@doc,@eng,@week_size,@scope_confidence,@launch,@prd_erd,@notes,@impacc,@pcr,@section)`);
  // reset projects for both periods (payments)
  clear('planner_projects', org, 'H1-2026');
  clear('planner_projects', org, 'H2-2026');

  let section = 'main', sort = 0, n = 0;
  const projRows = [];
  const tx = db.transaction(() => {
    for (const row of values.slice(1)) {
      const c0 = clean(row[0]);
      if (!c0) continue;
      const marker = c0.toLowerCase();
      if (marker === 'intake')  { section = 'intake'; continue; }
      if (marker === 'ideas')   { section = 'ideas';  continue; }
      if (marker === 'cut line' || marker === 'cutline') { section = 'cutline'; continue; }
      const feature = c0, theme = clean(row[1]), okr = clean(row[2]), priority = clean(row[3]);
      const source = clean(row[4]), doc = clean(row[5]), eng = clean(row[6]);
      const week_size = clean(row[7]), scope_confidence = clean(row[8]), launch = clean(row[9]);
      const prd_erd = clean(row[10]), notes = clean(row[11]), impacc = clean(row[12]), pcrCol = clean(row[13]);
      // features table lives under H1-2026 (the sheet's native period)
      ins.run({ org, period: basePeriod, sort: sort++, feature, theme, okr, priority, source,
        doc, eng, week_size, scope_confidence, launch, prd_erd, notes, impacc, pcr: pcrCol, section });
      n++;
      // canonical project row
      const pcrs = extractPcrs(pcrCol, doc, notes, feature);
      const half = halfOf(launch);
      // main/intake features are placed in the half they launch in; backlog-ish
      // sections (ideas/cutline) are forward pickup candidates -> H2.
      let projPeriod;
      if (section === 'main' || section === 'intake') projPeriod = half === 'H2' ? 'H2-2026' : 'H1-2026';
      else projPeriod = 'H2-2026';
      projRows.push({
        org, period: projPeriod, sort: projRows.length, key: feature, name: feature,
        pcr: pcrs[0] || null, pcr_all: pcrs.join(',') || null,
        theme, okr, priority, quarter: launch || null, half,
        owners: eng || null, sheet_status: null, section,
        span_first: null, span_last: null, span_weeks: week_size ? +week_size || null : null,
        eng: week_size || null, notes: notes || null,
      });
    }
  });
  tx();
  writeProjects(org, 'H1-2026', projRows.filter(r => r.period === 'H1-2026'));
  writeProjects(org, 'H2-2026', projRows.filter(r => r.period === 'H2-2026'));
  return { features: n, projects: projRows.length };
}

// ── PAYMENTS: capacity (mirror into both periods for uniform API) ─────────
function paymentsCapacity() {
  const { org, values } = rd('payments-capacity.json');
  for (const period of ['H1-2026', 'H2-2026']) {
    clear('planner_capacity', org, period);
    const ins = db.prepare(`INSERT INTO planner_capacity (org,period,sort,label,value,col3,col4) VALUES (?,?,?,?,?,?,?)`);
    let sort = 0;
    const tx = db.transaction(() => {
      for (const row of values) {
        const label = clean(row[0]);
        if (!label && row.length === 0) continue;
        ins.run(org, period, sort++, label, clean(row[1]), clean(row[2]), clean(row[3]));
      }
    });
    tx();
  }
  return { capacity: 'mirrored H1+H2' };
}

// ── PAYMENTS: Outtake -> canonical projects (section=outtake, H2) ─────────
function paymentsOuttake() {
  const { org, rows } = rd('payments-outtake.json');
  const period = 'H2-2026';
  const projRows = rows.map((r, i) => {
    const pcrs = extractPcrs(r.ticket);
    return {
      org, period, sort: 10000 + i, key: r.project, name: r.project,
      pcr: pcrs[0] || null, pcr_all: pcrs.join(',') || null,
      theme: 'Cross-team dependency', okr: null, priority: null,
      quarter: null, half: 'H2', owners: (r.teams || []).join(', '),
      sheet_status: null, section: 'outtake',
      span_first: null, span_last: null, span_weeks: null, eng: null,
      notes: `Depends on: ${(r.teams || []).join(', ')}`,
    };
  });
  writeProjects(org, period, projRows);
  return { outtake: projRows.length };
}

// ── PAYMENTS: mint canonical projects from the H1 staffing GANTT ───────────
// Mirrors the experience model (grid symbols ARE projects) so the payments timeline
// connects to the same canonical/roadmap model: every distinct work-item a
// person is assigned to becomes a project row (owners + span + quarter), which
// lets the Gantt bars resolve, show status, and open the macro drawer.
// Appends to H1-2026 AFTER paymentsFeatures() has written the roadmap rows;
// skips any cell text already owned by a roadmap project key (no dupes).
function paymentsGridProjects() {
  const { org, values } = rd('payments-gantt.json');
  const period = 'H1-2026';
  const OFF = /\[?(PTO|OOO|LEAVE|PAT-LEAVE|VACATION|HOLIDAY|RAMP-?UP|4YFU|OOF)\]?/i;
  const existing = new Set(
    db.prepare(`SELECT key FROM planner_projects WHERE org=? AND period=?`).all(org, period).map(r => r.key));
  const items = new Map(); // cellText -> {owners:Set, first, last, count}
  for (const row of values.slice(1)) {
    const name = clean(row[0]);
    if (!name || name === 'Company Schedule') continue;
    row.slice(2).forEach((raw, i) => {
      const t = clean(raw); if (!t) return;
      const key = String(t).trim();
      if (OFF.test(key)) return;
      const cur = items.get(key) || { owners: new Set(), first: i, last: i, count: 0 };
      cur.owners.add(name);
      cur.first = Math.min(cur.first, i); cur.last = Math.max(cur.last, i); cur.count++;
      items.set(key, cur);
    });
  }
  const rows = [];
  let sort = 30000;
  for (const [key, v] of items) {
    if (existing.has(key)) continue;
    const isOncall = /on-?call/i.test(key);
    const pcrs = extractPcrs(key);
    rows.push({
      org, period, sort: sort++, key, name: key,
      pcr: pcrs[0] || null, pcr_all: pcrs.join(',') || null,
      theme: isOncall ? 'On-call / Ops' : 'Execution (staffing)',
      okr: null, priority: null, quarter: v.first < 13 ? 'Q1' : 'Q2', half: 'H1',
      owners: [...v.owners].join(', '), sheet_status: null,
      section: isOncall ? 'ops' : 'staffing',
      span_first: v.first, span_last: v.last, span_weeks: v.count, eng: null, notes: null,
    });
  }
  writeProjects(org, period, rows);
  return { gridProjects: rows.length };
}

// ── legend parser (shared) ────────────────────────────────────────────────
function parseLegend(rows, startSection) {
  const out = [];
  let section = startSection, sort = 0, started = false;
  for (const row of rows) {
    const c0 = clean(row[0]);
    if (!started) { if (c0 === 'Workstream Symbol') started = true; continue; }
    if (!c0) continue;
    if (c0 === '[CUTLINE]') { section = 'below-cutline'; continue; }
    if (c0 === 'In-progress Projects') { section = 'in-progress'; continue; }
    out.push({
      sort: sort++, symbol: c0, quarter: clean(row[1]), ticket: clean(row[2]),
      name: clean(row[3]), status: clean(row[6]), be_effort: clean(row[7]),
      fe_effort: clean(row[8]), owners: clean(row[9]), notes: clean(row[10]), section,
    });
  }
  return out;
}

// ── EXPERIENCE: one period (H1 two-block OR H2 single-block) ───────────────────
function experiencePeriod(file) {
  const data = rd(file);
  const { org, period } = data;
  const half = halfOf(period.includes('H2') ? 'Q3' : 'Q1'); // H1/H2

  const roster = new Map();
  const get = (name, platform) => {
    if (!roster.has(name)) roster.set(name, { name, platform, cells: {} });
    const p = roster.get(name);
    if (!p.platform && platform) p.platform = platform;
    return p;
  };
  const ingestBlock = (rows, base) => {
    for (const row of rows) {
      const raw = clean(row[0]);
      const hasCells = row.slice(1).some(c => clean(c));
      if (raw) {
        const { name, platform } = splitName(raw);
        const p = get(name, platform);
        row.slice(1).forEach((txt, i) => { if (clean(txt)) p.cells[base + i] = txt; });
      } else if (hasCells) {
        const p = get('FS #2', 'FS');
        row.slice(1).forEach((txt, i) => { if (clean(txt)) p.cells[base + i] = txt; });
      }
    }
  };

  let weeks = [], legendRows;
  if (data.top) {
    // H1 shape: q1block (two header rows) + top (Q2 grid + legend)
    const q1quarters = data.q1block[0].slice(1);
    const q1labels = data.q1block[1].slice(1);
    weeks.push(...q1labels.map((label, i) => ({ sort: i, label, quarter: q1quarters[i] || 'Q1' })));
    const q2labels = data.top[0].slice(1);
    weeks.push(...q2labels.map((label, i) => ({ sort: 13 + i, label, quarter: 'Q2' })));
    ingestBlock(data.q1block.slice(2), 0);
    const q2rows = [];
    for (const row of data.top.slice(1)) {
      const c = clean(row[0]);
      if (c === 'In-progress Projects' || c === 'Workstream Symbol') break;
      q2rows.push(row);
    }
    ingestBlock(q2rows, 13);
    legendRows = data.top;
  } else {
    // H2 shape: single block in data.rows, quarter = data.quarter
    const q = data.quarter || 'Q3';
    const labels = data.rows[0].slice(1);
    weeks = labels.map((label, i) => ({ sort: i, label, quarter: q }));
    const prows = [];
    for (const row of data.rows.slice(1)) {
      const c = clean(row[0]);
      if (c === 'In-progress Projects' || c === 'Workstream Symbol') break;
      prows.push(row);
    }
    ingestBlock(prows, 0);
    legendRows = data.rows;
  }

  const people = [...roster.values()];
  const gridRes = loadGrid(org, period, weeks, people);

  // legend -> planner_workstreams
  const legend = parseLegend(legendRows, 'in-progress');
  clear('planner_workstreams', org, period);
  const wIns = db.prepare(`INSERT INTO planner_workstreams
    (org,period,sort,symbol,quarter,ticket,name,status,be_effort,fe_effort,owners,notes,section)
    VALUES (@org,@period,@sort,@symbol,@quarter,@ticket,@name,@status,@be_effort,@fe_effort,@owners,@notes,@section)`);
  db.transaction(() => { for (const w of legend) wIns.run({ org, period, ...w }); })();

  // backlog tab (period-agnostic pickup candidates) -> workstreams section=backlog
  const bl = rd('experience-backlog.json');
  const blLegend = parseLegend(bl.values, 'backlog').map(w => ({ ...w, section: 'backlog' }));
  db.transaction(() => {
    let s = legend.length;
    for (const w of blLegend) wIns.run({ org, period, ...w, sort: s++ });
  })();

  // ── canonical projects: union(legend symbols, grid symbols) ──
  const legendBySym = new Map(legend.map(l => [l.symbol, l]));
  const gridSyms = new Set();
  const spanBySym = new Map(); // symbol -> {first,last,count}
  for (const p of people) {
    for (const [sortStr, txt] of Object.entries(p.cells)) {
      const t = String(txt).trim();
      if (!isSymbol(t)) continue;
      gridSyms.add(t);
      const s = +sortStr;
      const cur = spanBySym.get(t) || { first: s, last: s, count: 0 };
      cur.first = Math.min(cur.first, s); cur.last = Math.max(cur.last, s); cur.count++;
      spanBySym.set(t, cur);
    }
  }
  const allSyms = new Set([...legendBySym.keys(), ...gridSyms]);
  clear('planner_projects', org, period);
  const projRows = [];
  let ps = 0;
  for (const sym of allSyms) {
    if (sym === '[PTO]' || sym === '[CUTLINE]') continue;
    const l = legendBySym.get(sym);
    const span = spanBySym.get(sym);
    const pcrs = extractPcrs(l && l.name, l && l.ticket, l && l.notes);
    projRows.push({
      org, period, sort: ps++, key: sym, name: (l && l.name) || null,
      pcr: pcrs[0] || null, pcr_all: pcrs.join(',') || null,
      theme: (l && l.section) === 'below-cutline' ? 'Below cutline' : null,
      okr: null, priority: null, quarter: (l && l.quarter) || null, half,
      owners: (l && l.owners) || null, sheet_status: (l && l.status) || null,
      section: l ? l.section : 'grid-only',
      span_first: span ? span.first : null, span_last: span ? span.last : null,
      span_weeks: span ? span.count : null, eng: null, notes: (l && l.notes) || null,
    });
  }
  writeProjects(org, period, projRows);

  return { ...gridRes, workstreams: legend.length, backlog: blLegend.length, projects: projRows.length };
}

// ── fleet enrichment merge (cross-source alias alignment) ─────────────────
// seed/projects-enrich.json is produced by the enrich-roadmap Workflow (temp
// agents read decks/Jira/Slack/Confluence, align terms to canonical keys).
// LOCAL SSOT only. Idempotent UPDATE by (org,key) across all periods.
function mergeEnrichment() {
  const f = path.join(SEED, 'projects-enrich.json');
  if (!fs.existsSync(f)) return { merged: 0, note: 'no seed/projects-enrich.json yet' };
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  const projects = data.projects || [];
  const stamp = data.generated_at || new Date().toISOString();
  const upd = db.prepare(`UPDATE planner_projects SET
      best_name=@best_name, aliases=@aliases, status_narrative=@status_narrative,
      doc_refs=@doc_refs, confidence=@confidence, last_enriched=@stamp,
      theme=COALESCE(theme,@theme), okr=COALESCE(okr,@okr), quarter=COALESCE(quarter,@quarter),
      pcr=COALESCE(pcr,@pcr), pcr_all=COALESCE(pcr_all,@pcr_all),
      name=COALESCE(name,@best_name)
    WHERE org=@org AND key=@key`);
  let merged = 0;
  const tx = db.transaction(() => {
    for (const p of projects) {
      const pcrs = p.pcrs || [];
      const r = upd.run({
        org: p.org, key: p.key,
        best_name: p.best_name || null,
        aliases: JSON.stringify(p.aliases || []),
        status_narrative: p.status_narrative || null,
        doc_refs: JSON.stringify(p.doc_refs || []),
        confidence: p.confidence == null ? null : p.confidence,
        stamp,
        theme: p.theme || null, okr: p.okr || null, quarter: p.quarter || null,
        pcr: pcrs[0] || null, pcr_all: pcrs.length ? pcrs.join(',') : null,
      });
      merged += r.changes;
    }
  });
  tx();
  return { merged, records: projects.length, aliases: (data.alias_map || []).length };
}

// ── run ───────────────────────────────────────────────────────────────────
console.log('Loading + enriching planners into control plane (local SSOT)…\n');
console.log('  jira mirror      :', JSON.stringify(loadJira()));
console.log('  payments GANTT   :', JSON.stringify(paymentsGantt()));
console.log('  payments features:', JSON.stringify(paymentsFeatures()));
console.log('  payments capacity:', JSON.stringify(paymentsCapacity()));
console.log('  payments outtake :', JSON.stringify(paymentsOuttake()));
console.log('  payments gridproj:', JSON.stringify(paymentsGridProjects()));
console.log('  experience  H1        :', JSON.stringify(experiencePeriod('experience-h1.json')));
console.log('  experience  H2        :', JSON.stringify(experiencePeriod('experience-h2.json')));
console.log('  fleet enrichment :', JSON.stringify(mergeEnrichment()));
console.log('\nDone. planner_* + planner_projects + planner_jira reseeded in place.');
