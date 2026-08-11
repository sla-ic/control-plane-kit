#!/usr/bin/env node
// Rebuild the dashboard's areas/projects from the principal's roadmap docs.
//
// EXAMPLE DATA. The arrays below are illustrative — replace them with your own
// roadmap once you've mined it out of your planning docs (a good job for an agent:
// point it at your H2 decks and have it emit rows in this shape). The *machine*
// (schema migration, upsert, legacy-demotion, reporting) is what's reusable.
//
// Demonstrates a two-roadmap structure:
//   Payments   → themes (KR-aligned)
//   Experience → themes (KR-aligned)
//
// Idempotent. Preserves task history: legacy projects are demoted to status='dormant'
// rather than deleted. Existing tasks keep their `project` text reference.
//
// Schema changes (additive, all guarded):
//   projects.roadmap   — "Payments" | "Experience" | null
//   projects.theme     — sub-area within the roadmap
//   projects.priority  — P0 / P1 / P0-CUTLINE / P1-BTL / etc.
//   projects.pcr       — primary ticket key if any
//   projects.kr        — KR ladder (e.g. "1.1 Activate")
//   projects.eng_weeks — capacity estimate from roadmap doc
//   projects.target    — "2026-H2" / "2027-Q1" / etc.
//   projects.summary   — 1-2 sentence description
//   projects.source_url — link to the roadmap doc this came from

const db = require('./db');

const PAYMENTS_URL = 'https://docs.google.com/presentation/d/EXAMPLE_SLIDES_ID';
const EXPERIENCE_URL = 'https://docs.google.com/presentation/d/EXAMPLE_SLIDES_ID';
const EXPERIENCE_TRACKER_URL = 'https://docs.google.com/spreadsheets/d/EXAMPLE_SHEET_ID';

// ── Migration: add columns ──
const newCols = [
  "ALTER TABLE projects ADD COLUMN roadmap TEXT",
  "ALTER TABLE projects ADD COLUMN theme TEXT",
  "ALTER TABLE projects ADD COLUMN priority TEXT",
  "ALTER TABLE projects ADD COLUMN pcr TEXT",
  "ALTER TABLE projects ADD COLUMN kr TEXT",
  "ALTER TABLE projects ADD COLUMN eng_weeks INTEGER",
  "ALTER TABLE projects ADD COLUMN target TEXT",
  "ALTER TABLE projects ADD COLUMN summary TEXT",
  "ALTER TABLE projects ADD COLUMN source_url TEXT",
];
for (const sql of newCols) {
  try { db.exec(sql); } catch (e) { /* already exists */ }
}

// ── Roadmap data (EXAMPLE — replace with your own) ──
// [name, theme, priority, pcr, kr, engWeeks, target, summary]
const PAYMENTS_PROJECTS = [
  ['Payment Reliability Hardening', 'System Reliability', 'P0', null, '3.4 Reliability', 8, '2026-H2', 'Harden payment flows; improved monitoring to reduce time-to-detect for single-point failures.'],
  ['Multi-Processor Routing', 'Multi-Processor Expansion', 'P0', null, '3.2 Infra Cost', 10, '2026-H2', 'Route traffic across multiple payment processors to cut fees and add failover.'],
  ['Processor SDK Version Pinning', 'System Reliability', 'P0', null, '3.4 Reliability', 3, '2026-H2', 'Pin + upgrade the processor SDK version; stale default is a breaking-change risk.'],
  ['New Retailer Payment Integration', 'Retailer Integrations', 'P0', 'PROJ-000', '2.1 New Retailers', 22, '2026-H2', 'Onboard a new retailer across all tender types (card, debit, gift card) + dispute workflows.'],
  ['Fraud/Auth ML Optimization', 'AI & Productivity', 'P1', null, '3.2 Infra Cost', 4, '2026-H2', 'ML-driven routing at the BIN level to lift auth rates on long-tail cards.'],
  ['Agent Tooling Buffer', 'AI & Productivity', 'P0', null, '4.4 2x Productivity', 4, '2026-H2', 'Dedicated capacity for AI tooling and agentic integration into payment workflows.'],
];

const EXPERIENCE_PROJECTS = [
  ['Payment Method Config Layer', 'Payment Infrastructure', 'P0', null, '2.4 Platform', 6, '2026-H2', 'Per-retailer payment-method config layer; onboard retailers via config, no eng deploy.'],
  ['Checkout Redesign', 'Checkout UX', 'P0', 'PROJ-000', '1.1 Activate', 16, '2026-H2', 'Unified card-input form + in-app card scanner for new users.'],
  ['Loyalty Hub Enhancements', 'Loyalty UX Platform', 'P0', null, '1.2 Engagement', 2, '2026-H2', 'Loyalty hub UI with self-serve tooling; retailer-specific config without eng.'],
  ['Points Ledger Enhancements', 'Loyalty UX Platform', 'P0', null, '1.2 Engagement', 6, '2026-H2', 'Multi-banner points ledger, natively supported.'],
  ['Installments at Checkout', 'Partnerships', 'P0-CUTLINE', 'PROJ-000', '1.1 Activate', 6, '2026-H2', 'Partner installments option at checkout; contract in progress, pending BD signal.'],
  ['Agentic E2E Verification', 'AI Foundation', 'P0', null, '4.4 2x Productivity', 12, '2026-H2', 'Agentic testing framework automating UX E2E across surfaces. 40% manual-QA cycle-time reduction target.'],
];

// ── Roadmap colors ──
const THEME_COLORS = {
  'System Reliability':       '#ef4444',
  'Multi-Processor Expansion':'#f97316',
  'Retailer Integrations':    '#f59e0b',
  'AI & Productivity':        '#a855f7',
  'Payment Infrastructure':   '#06b6d4',
  'AI Foundation':            '#8b5cf6',
  'Loyalty UX Platform':      '#ec4899',
  'Checkout UX':              '#f43f5e',
  'Partnerships':             '#0ea5e9',
};

// ── Upsert ──
const upsertProject = db.prepare(`
  INSERT INTO projects (name, description, status, color, area, roadmap, theme, priority, pcr, kr, eng_weeks, target, summary, source_url)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(name) DO UPDATE SET
    status     = excluded.status,
    color      = excluded.color,
    area       = excluded.area,
    roadmap    = excluded.roadmap,
    theme      = excluded.theme,
    priority   = excluded.priority,
    pcr        = excluded.pcr,
    kr         = excluded.kr,
    eng_weeks  = excluded.eng_weeks,
    target     = excluded.target,
    summary    = excluded.summary,
    source_url = excluded.source_url
`);

function upsert(roadmap, sourceUrl, rows) {
  let n = 0;
  for (const [name, theme, priority, pcr, kr, engWeeks, target, summary] of rows) {
    const color = THEME_COLORS[theme] || '#6366f1';
    const status = (priority || '').includes('BTL') || (priority || '').includes('CUTLINE') ? 'backlog' : 'active';
    upsertProject.run(name, summary, status, color, roadmap, roadmap, theme, priority, pcr, kr, engWeeks, target, summary, sourceUrl);
    n++;
  }
  return n;
}

console.log('Adding columns (idempotent)…');
const paymentsN = upsert('Payments', PAYMENTS_URL, PAYMENTS_PROJECTS);
console.log(`  Payments: ${paymentsN} projects upserted`);
const experienceN = upsert('Experience', EXPERIENCE_URL, EXPERIENCE_PROJECTS);
console.log(`  Experience: ${experienceN} projects upserted`);

// ── Demote legacy seeded projects that aren't in the new roadmap ──
// Mark dormant — preserves task history but falls off the active view.
const LEGACY_TO_DEMOTE = [
  'Example Legacy Project A',
  'Example Legacy Project B',
];
const demote = db.prepare(`UPDATE projects SET status = 'dormant' WHERE name = ? AND status != 'dormant'`);
let demoted = 0;
for (const name of LEGACY_TO_DEMOTE) {
  const r = demote.run(name);
  if (r.changes) demoted++;
}
console.log(`  Demoted legacy projects: ${demoted}`);

// ── Map old `area` field on remaining active projects ──
// These stay active but get marked as non-roadmap so they don't pollute Payments/Experience.
db.exec(`UPDATE projects SET roadmap = 'Operational' WHERE roadmap IS NULL AND status = 'active'`);

// ── Report ──
const summary = db.prepare(`
  SELECT roadmap, status, COUNT(*) as n
  FROM projects
  GROUP BY roadmap, status
  ORDER BY roadmap, status
`).all();
console.log('\n— Project mix after rebuild —');
for (const r of summary) console.log(`  ${r.roadmap || '(none)'} / ${r.status}: ${r.n}`);

const byTheme = db.prepare(`
  SELECT roadmap, theme, COUNT(*) as n
  FROM projects
  WHERE roadmap IN ('Payments', 'Experience')
  GROUP BY roadmap, theme
  ORDER BY roadmap, theme
`).all();
console.log('\n— Projects per theme —');
for (const r of byTheme) console.log(`  ${r.roadmap} › ${r.theme}: ${r.n}`);
