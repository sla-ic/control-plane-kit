#!/usr/bin/env node
/*
 * value-report.js — the missing north-star sensor (audit: "no-value-measurement").
 *
 * The system measured its own machinery (fleet_runs, fleet_decisions, sweep counts)
 * but never whether it delivered VALUE to Jordan: how much it handled without him,
 * whether the things it surfaced were worth surfacing, and a defensible time-saved
 * proxy. This worker computes three metrics over a trailing window and snapshots
 * them to value_metrics. It is deterministic (model='none'), READ-ONLY except for
 * its own snapshot row, and honours --dry. No new instrumentation, no behaviour
 * change, no gated action — it only reads tables other workers already populate.
 *
 * The three metrics (all deliberately conservative — undo_rate is the honesty gate
 * that stops time-saved from overclaiming):
 *   1. AUTO-HANDLED FRACTION — of everything the fleet touched, the share it took
 *      to a terminal state WITHOUT Jordan (executed sweeps not undone) vs the share
 *      it escalated to him (fleet escalations + needs_you surfaces).
 *   2. ESCALATION USEFULNESS — of what it surfaced, how much Jordan actually acted on
 *      (needs_you 'acted' + observed draft sends). Low today (dispositions are tiny);
 *      that is the honest reading, not a bug.
 *   3. TIME-SAVED PROXY — auto_handled × seconds-per-action (default 45s, override
 *      AMP_VALUE_SEC_PER_ACTION). A proxy, labelled as one; discounted by undo_rate.
 *
 * Usage: node value-report.js [--dry] [--window 7]
 */

const db = require('./db');

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DRY = has('--dry');
const WINDOW = parseInt(arg('--window', '7'), 10);
const SEC_PER_ACTION = parseInt(process.env.AMP_VALUE_SEC_PER_ACTION || '45', 10);
const RUN_ID = `value-${process.pid}-${process.hrtime()[1]}`;
const WORKER = 'amp-value-report';

function runStart() { if (DRY) return; try { db.prepare(`INSERT INTO fleet_runs (run_id, worker, host, model, status) VALUES (?,?,?,?,'running')`).run(RUN_ID, WORKER, require('os').hostname(), 'none'); } catch (_) {} }
function runEnd(status, considered, errors) { if (DRY) return; try { db.prepare(`UPDATE fleet_runs SET status=?, considered=?, errors=?, ended_at=datetime('now') WHERE run_id=?`).run(status, considered || 0, errors || 0, RUN_ID); } catch (_) {} }

function ensureSchema() {
  db.prepare(`CREATE TABLE IF NOT EXISTS value_metrics (
    id INTEGER PRIMARY KEY,
    window_days INTEGER,
    computed_at TEXT DEFAULT (datetime('now')),
    auto_handled INTEGER,
    escalated INTEGER,
    auto_handled_fraction REAL,
    escalations_acted INTEGER,
    escalation_usefulness REAL,
    undo_count INTEGER,
    undo_rate REAL,
    sec_per_action INTEGER,
    time_saved_seconds INTEGER,
    detail TEXT
  )`).run();
}

const one = (sql, ...p) => { try { return db.prepare(sql).get(...p) || {}; } catch (_) { return {}; } };
const WIN = `datetime('now','-${WINDOW} days')`;

function compute() {
  // 1. auto-handled: executed sweeps in window still standing (not undone) — the
  //    mechanical routing the fleet did without Jordan.
  const autoHandled = one(`SELECT COUNT(*) n FROM email_sweep_actions
    WHERE status='executed' AND executed_at >= ${WIN} AND undone_at IS NULL`).n || 0;
  const undoCount = one(`SELECT COUNT(*) n FROM email_sweep_actions
    WHERE status IN ('executed','undone') AND executed_at >= ${WIN} AND undone_at IS NOT NULL`).n || 0;

  // 2. escalated to Jordan = fleet adjudications flagged escalate + every needs_you
  //    surface (a needs_you row IS a surfaced ask by construction).
  const fleetEsc = one(`SELECT COUNT(*) n FROM fleet_decisions
    WHERE escalate=1 AND created_at >= ${WIN}`).n || 0;
  const nyrTotal = one(`SELECT COUNT(*) n FROM needs_you_resolutions
    WHERE created_at >= ${WIN}`).n || 0;
  const escalated = fleetEsc + nyrTotal;

  // 3. escalation usefulness: of what was surfaced, what Jordan actually acted on.
  const nyrActed = one(`SELECT COUNT(*) n FROM needs_you_resolutions
    WHERE status='acted' AND created_at >= ${WIN}`).n || 0;
  const draftsSent = one(`SELECT COUNT(*) n FROM email_dispositions
    WHERE action='sent' AND observed_at >= ${WIN}`).n || 0;
  const escalationsActed = nyrActed + draftsSent;

  const totalTouched = autoHandled + escalated;
  const autoFraction = totalTouched ? autoHandled / totalTouched : 0;
  const usefulness = escalated ? escalationsActed / escalated : 0;
  const undoRate = (autoHandled + undoCount) ? undoCount / (autoHandled + undoCount) : 0;
  const timeSaved = autoHandled * SEC_PER_ACTION;

  return {
    window_days: WINDOW,
    auto_handled: autoHandled,
    escalated,
    auto_handled_fraction: +autoFraction.toFixed(4),
    escalations_acted: escalationsActed,
    escalation_usefulness: +usefulness.toFixed(4),
    undo_count: undoCount,
    undo_rate: +undoRate.toFixed(4),
    sec_per_action: SEC_PER_ACTION,
    time_saved_seconds: timeSaved,
    detail: JSON.stringify({ fleet_escalations: fleetEsc, needs_you_surfaces: nyrTotal, nyr_acted: nyrActed, drafts_sent: draftsSent }),
  };
}

function persist(m) {
  if (DRY) return;
  db.prepare(`INSERT INTO value_metrics
    (window_days, auto_handled, escalated, auto_handled_fraction, escalations_acted,
     escalation_usefulness, undo_count, undo_rate, sec_per_action, time_saved_seconds, detail)
    VALUES (@window_days,@auto_handled,@escalated,@auto_handled_fraction,@escalations_acted,
     @escalation_usefulness,@undo_count,@undo_rate,@sec_per_action,@time_saved_seconds,@detail)`).run(m);
}

(() => {
  ensureSchema();
  runStart();
  try {
    const m = compute();
    persist(m);
    const mins = Math.round(m.time_saved_seconds / 60);
    console.log(`value-report ${DRY ? '(DRY) ' : ''}[${WINDOW}d]: ` +
      `auto-handled ${m.auto_handled}/${m.auto_handled + m.escalated} (${(m.auto_handled_fraction * 100).toFixed(0)}%), ` +
      `escalation-usefulness ${(m.escalation_usefulness * 100).toFixed(0)}% (${m.escalations_acted}/${m.escalated}), ` +
      `undo-rate ${(m.undo_rate * 100).toFixed(1)}%, time-saved≈${mins}m @ ${m.sec_per_action}s/action`);
    runEnd('ok', m.auto_handled + m.escalated, 0);
  } catch (e) {
    console.error('value-report FAILED:', e.message);
    runEnd('crashed', 0, 1);
    process.exit(1);
  }
})();
