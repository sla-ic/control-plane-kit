// Build the PII-free canonical alignment vocabulary the enrichment fleet reads.
// Dedups planner_projects to one canonical entry per (org,key); adds the loose
// alias candidates already present in the sheets (experience workstream legend,
// payments features) + the live Jira mirror. Output: seed/vocab.json.
// Read-only against the runtime DB. Run before a fleet refresh.
const path = require('path'), os = require('os'), fs = require('fs');
const Database = require('better-sqlite3');
const dbPath = process.env.AMP_TASKS_DB
  || path.join(os.homedir(), '.local/share/amp-tasks/tasks.db');
const db = new Database(dbPath, { readonly: true });

function canon(org) {
  const rows = db.prepare(
    `SELECT key,name,pcr_all,theme,okr,quarter,half,section FROM planner_projects
      WHERE org=? ORDER BY period DESC, sort`).all(org);
  const seen = new Map();
  for (const r of rows) {
    const k = r.key;
    if (!seen.has(k)) seen.set(k, { key: k, name: r.name || null, pcr: r.pcr_all || null,
      theme: r.theme || null, okr: r.okr || null, quarter: r.quarter || null,
      halves: new Set(), sections: new Set() });
    const e = seen.get(k);
    if (!e.name && r.name) e.name = r.name;
    if (!e.pcr && r.pcr_all) e.pcr = r.pcr_all;
    if (!e.theme && r.theme) e.theme = r.theme;
    if (!e.okr && r.okr) e.okr = r.okr;
    if (!e.quarter && r.quarter) e.quarter = r.quarter;
    if (r.half) e.halves.add(r.half);
    if (r.section) e.sections.add(r.section);
  }
  return [...seen.values()].map(e => ({ ...e, halves: [...e.halves], sections: [...e.sections] }));
}
const ws = db.prepare(`SELECT DISTINCT symbol,name,ticket,notes FROM planner_workstreams WHERE org='experience' AND name IS NOT NULL`).all();
const feats = db.prepare(`SELECT DISTINCT feature,theme,pcr FROM planner_features WHERE org='payments'`).all();
const jira = db.prepare(`SELECT key,summary,status,status_category,priority FROM planner_jira`).all();

const out = {
  note: 'Canonical planner vocabulary for cross-source alias alignment. Align terms from decks/Jira/Slack to these keys.',
  payments: canon('payments'),
  experience: canon('experience'),
  experience_legend: ws,
  payments_features: feats,
  jira,
};
const dest = path.join(__dirname, 'seed', 'vocab.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 1));
console.log('vocab:', out.payments.length, 'payments,', out.experience.length, 'experience,', jira.length, 'jira →', dest);
