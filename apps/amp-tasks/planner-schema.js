// Shared, idempotent DDL for the planner_* tables.
//
// These tables back the /api/planner/:org route. They used to be created only by
// import-planners.js at seed time, so a fresh clone that hadn't run the seeder
// 500'd the planner route with "no such table: planner_jira". db.js execs this
// at boot (self-healing base schema, SSOT discipline) and import-planners.js
// execs the same string before seeding — one source of truth, no drift.
module.exports = `
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
`;
