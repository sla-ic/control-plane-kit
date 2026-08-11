#!/usr/bin/env node
// reap-orphans.js — mark stale fleet_runs stuck in 'running' (any worker) as 'crashed'.
//
// WHY: a worker killed mid-run (machine sleep, SIGKILL from the watchdog, a hang
// reaped by run_step) never fires auditRunEnd, so its fleet_runs row is orphaned
// at status='running' forever. Those rows pollute the Fleet Console health rollup
// and mask the true failure rate (remediation P2-3). This runs at the TOP of each
// cycle (fast + slow), before any worker starts, so the console reflects reality.
//
// SAFE: touches only fleet_runs rows that are (a) status='running' AND (b) older
// than the threshold. Never touches an in-flight run from the current cycle
// (threshold >> any single worker's watchdog budget). Idempotent.
//
//   node reap-orphans.js               # default: running > 2h → crashed
//   node reap-orphans.js --minutes 30  # tighter threshold
//   node reap-orphans.js --dry

const db = require('/Users/you/.local/share/amp-tasks/db');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes('--dry');
const MINUTES = parseInt(arg('--minutes', '120'), 10);

const stale = db.prepare(
  `SELECT id, run_id, worker, started_at FROM fleet_runs
   WHERE status='running' AND ended_at IS NULL
     AND started_at <= datetime('now', ?)`
).all(`-${MINUTES} minutes`);

if (!stale.length) { console.log(`reap-orphans: none stale (> ${MINUTES}m)`); process.exit(0); }

console.log(`reap-orphans: ${stale.length} orphan(s) > ${MINUTES}m ${DRY ? '(DRY)' : '→ crashed'}`);
for (const r of stale) console.log(`  ${DRY ? '·' : '✗'} #${r.id} ${r.worker} started ${r.started_at}`);

if (!DRY) {
  const upd = db.prepare(
    `UPDATE fleet_runs SET status='crashed', ended_at=datetime('now')
     WHERE status='running' AND ended_at IS NULL AND started_at <= datetime('now', ?)`
  );
  const info = upd.run(`-${MINUTES} minutes`);
  console.log(`reaped ${info.changes} row(s)`);
}
process.exit(0);
