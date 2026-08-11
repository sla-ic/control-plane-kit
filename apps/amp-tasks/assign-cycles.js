// assign-cycles.js
// One-time migration: assign planning cycles (and optionally OKRs) to existing tasks.
// Re-runnable — only touches tasks where cycle IS NULL, so it's safe to run multiple times.
// To reset and re-run: UPDATE tasks SET cycle = NULL, okr = NULL; then node assign-cycles.js

const db = require('./db');

// Cycle calendar FY2026 (Acme 6-week cadence)
// Q1A: Jan 5 – Feb 14  (past)
// Q1B: Feb 23 – Mar 27  ← current
// Q2A: Apr 7  – May 16
// Q2B: May 19 – Jun 27
// Q3A: Jul 7  – Aug 15
// Q3B: Aug 17 – Sep 26
// Q4A: Oct 5  – Nov 14
// Q4B: Nov 16 – Dec 27

const projectCycles = [
  // In-flight / urgent — current cycle Q1B
  { project: 'Debit Hanging Auth', cycle: 'Q1B', okr: null },
  { project: 'Compliance',         cycle: 'Q1B', okr: null },
  { project: 'Onboarding',         cycle: 'Q1B', okr: null },
  { project: 'Infrastructure',     cycle: 'Q1B', okr: null },

  // Near-term deliverables — Q2A
  { project: 'Installments', cycle: 'Q2A', okr: null },  // ship this cycle
  { project: 'Discovery',    cycle: 'Q2A', okr: null },  // weekly syncs, exploration phase

  // Mid-year deadline — Q3A
  { project: 'Benefits Rollout', cycle: 'Q3A', okr: null },  // deadline this cycle

  // Backlog / not started — Q3B
  { project: 'Learning Series', cycle: 'Q3B', okr: null },
];

const update = db.prepare(
  'UPDATE tasks SET cycle = ?, okr = ? WHERE project = ? AND cycle IS NULL'
);

console.log('Assigning cycles to tasks...\n');
let total = 0;

for (const { project, cycle, okr } of projectCycles) {
  const { changes } = update.run(cycle, okr, project);
  if (changes) {
    console.log(`  ${project.padEnd(32)} → ${cycle}${okr ? ` / ${okr}` : ''} (${changes} task${changes > 1 ? 's' : ''})`);
  }
  total += changes;
}

console.log(`\nDone. ${total} task${total !== 1 ? 's' : ''} updated.`);
console.log('\nTip: assign OKRs manually via the UI edit panel, or add them here and re-run.');
