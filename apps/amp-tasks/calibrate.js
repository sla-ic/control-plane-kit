#!/usr/bin/env node
/*
 * calibrate.js — the calibration pass ADR-0016 §2 specifies (and §1 point 3 named
 * as the missing consumer: "Grep for calibrat|precision|graduat|accuracy … finds no
 * consumer"). This is that consumer.
 *
 * value-report.js answers "did the fleet deliver value?" at the north-star level.
 * calibrate.js answers the finer question the graduation gate needs: "for each
 * CATEGORY the fleet stages, how often was it RIGHT — measured against Jordan's own
 * first-party dispositions, not the pipeline agreeing with itself?" It computes
 * per-category precision over a trailing window, flags which categories clear the
 * graduation bar, and lists the override cases (§4: "the override cases are the
 * curriculum"). It writes a `calibration` snapshot + prints to the fleet console.
 *
 * Deterministic (model='none'), READ-ONLY against everything except its own
 * `calibration` table, honours --dry. No LLM, no new instrumentation — it only
 * joins the disposition signals other workers already write.
 *
 * IMPORTANT — calibrate MEASURES and PROPOSES; it never MOVES a boundary.
 * `graduation_ready` is a numbers-derived PROPOSAL surfaced for Jordan's one-time
 * ratification (ADR-0016 §3). The only code that actually flips a rule's state is
 * rule-engine.evaluateGraduation, behind its own ratification gate. Nothing here
 * changes behaviour; it changes what Jordan can SEE.
 *
 * Categories (each with genuine first-party ground truth):
 *   rule:<kind>[human|pipeline] — email_rule_predictions ⋈ email_rules. Split by
 *       ground_truth so the circular pipeline-self-agreement (audit SEV-HIGH) is
 *       reported separately from the independent HUMAN track the auto gate requires.
 *   draft    — email_dispositions (plane='draft'): sent = agree, discarded = override.
 *   needs_you— needs_you_resolutions: acted = agree, dismissed/declined = override.
 *   sweep    — email_sweep_actions: executed&standing = agree, rejected/undone = override.
 *
 * Usage: node calibrate.js [--dry] [--window 30] [--examples 5]
 */

const db = require('./db');

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DRY = has('--dry');
const WINDOW = parseInt(arg('--window', '30'), 10);
const EXAMPLES = parseInt(arg('--examples', '5'), 10);
const BAR = parseFloat(process.env.AMP_CALIB_BAR || '0.95');       // ADR-0016 open-Q default
const MIN_SAMPLE = parseInt(process.env.AMP_CALIB_MIN || '20', 10);
const RUN_ID = `calib-${process.pid}-${process.hrtime()[1]}`;
const WORKER = 'amp-calibrate';
const WIN = `datetime('now','-${WINDOW} days')`;

function runStart() { if (DRY) return; try { db.prepare(`INSERT INTO fleet_runs (run_id, worker, host, model, status) VALUES (?,?,?,?,'running')`).run(RUN_ID, WORKER, require('os').hostname(), 'none'); } catch (_) {} }
function runEnd(status, considered, errors) { if (DRY) return; try { db.prepare(`UPDATE fleet_runs SET status=?, considered=?, errors=?, ended_at=datetime('now') WHERE run_id=?`).run(status, considered || 0, errors || 0, RUN_ID); } catch (_) {} }

function ensureSchema() {
  db.prepare(`CREATE TABLE IF NOT EXISTS calibration (
    id INTEGER PRIMARY KEY,
    window_days INTEGER,
    computed_at TEXT DEFAULT (datetime('now')),
    category TEXT,             -- rule:archive | draft | needs_you | sweep | ...
    ground TEXT,              -- human | pipeline | observed
    sample INTEGER,           -- resolved dispositions in window
    agree INTEGER,
    override_n INTEGER,
    precision REAL,           -- agree / (agree + override), null if no sample
    graduation_ready INTEGER, -- 1 = precision>=bar AND sample>=min_sample (a PROPOSAL, not a flip)
    bar REAL,
    min_sample INTEGER,
    detail TEXT               -- JSON: override example subjects/threads (the curriculum)
  )`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_calibration_run ON calibration(computed_at)`).run();
}

const all = (sql, ...p) => { try { return db.prepare(sql).all(...p); } catch (_) { return []; } };
const prec = (a, o) => (a + o) ? +(a / (a + o)).toFixed(4) : null;
const ready = (p, n) => (p != null && p >= BAR && n >= MIN_SAMPLE) ? 1 : 0;

// ── plane 1: sweep rules, split by ground_truth (human is the de-circularized track) ──
function calibrateRules() {
  const rows = all(`
    SELECT r.kind AS kind,
           CASE WHEN p.ground_truth='restore' THEN 'human' ELSE p.ground_truth END AS ground,
           SUM(p.outcome='agree')    AS agree,
           SUM(p.outcome='disagree') AS override_n
    FROM email_rule_predictions p JOIN email_rules r ON r.id = p.rule_id
    WHERE p.outcome != 'pending' AND p.resolved_at >= ${WIN}
      AND p.ground_truth IN ('pipeline','human','restore')
    GROUP BY r.kind, ground`);
  return rows.map((row) => {
    const agree = row.agree || 0, override_n = row.override_n || 0, sample = agree + override_n;
    // override curriculum: the specific threads a rule of this kind got wrong.
    const ex = all(`SELECT p.subject, p.thread_id FROM email_rule_predictions p
      JOIN email_rules r ON r.id = p.rule_id
      WHERE r.kind=? AND p.outcome='disagree' AND p.resolved_at >= ${WIN}
      ORDER BY p.resolved_at DESC LIMIT ?`, row.kind, EXAMPLES);
    return {
      category: `rule:${row.kind}`, ground: row.ground, sample, agree, override_n,
      precision: prec(agree, override_n), detail: { overrides: ex },
    };
  });
}

// ── plane 2: staged drafts → observed send/discard ──
function calibrateDrafts() {
  const r = all(`SELECT action, COUNT(*) n FROM email_dispositions
    WHERE plane='draft' AND observed_at >= ${WIN} GROUP BY action`)
    .reduce((m, x) => (m[x.action] = x.n, m), {});
  const agree = r.sent || 0, override_n = r.discarded || 0;
  const ex = all(`SELECT thread_id, detail FROM email_dispositions
    WHERE plane='draft' AND action='discarded' AND observed_at >= ${WIN}
    ORDER BY observed_at DESC LIMIT ?`, EXAMPLES);
  return [{ category: 'draft', ground: 'observed', sample: agree + override_n, agree, override_n,
            precision: prec(agree, override_n), detail: { overrides: ex } }];
}

// ── plane 3: needs-you resolutions → acted vs dismissed ──
function calibrateNeedsYou() {
  const r = all(`SELECT status, COUNT(*) n FROM needs_you_resolutions
    WHERE created_at >= ${WIN} GROUP BY status`).reduce((m, x) => (m[x.status] = x.n, m), {});
  const agree = r.acted || 0, override_n = (r.dismissed || 0) + (r.declined || 0);
  const ex = all(`SELECT source_ref AS thread_id, ask AS detail FROM needs_you_resolutions
    WHERE status IN ('dismissed','declined') AND created_at >= ${WIN}
    ORDER BY created_at DESC LIMIT ?`, EXAMPLES);
  return [{ category: 'needs_you', ground: 'observed', sample: agree + override_n, agree, override_n,
            precision: prec(agree, override_n), detail: { overrides: ex } }];
}

// ── plane 4: sweep proposals → executed&standing vs rejected/undone ──
function calibrateSweep() {
  const r = all(`SELECT status, COUNT(*) n FROM email_sweep_actions
    WHERE created_at >= ${WIN} GROUP BY status`).reduce((m, x) => (m[x.status] = x.n, m), {});
  const agree = r.executed || 0;                      // executed rows still 'executed' = standing
  const override_n = (r.rejected || 0) + (r.undone || 0);
  const ex = all(`SELECT thread_id, subject AS detail FROM email_sweep_actions
    WHERE status IN ('rejected','undone') AND created_at >= ${WIN}
    ORDER BY created_at DESC LIMIT ?`, EXAMPLES);
  return [{ category: 'sweep', ground: 'observed', sample: agree + override_n, agree, override_n,
            precision: prec(agree, override_n), detail: { overrides: ex } }];
}

function persist(rows) {
  if (DRY) return;
  const ins = db.prepare(`INSERT INTO calibration
    (window_days, category, ground, sample, agree, override_n, precision, graduation_ready, bar, min_sample, detail)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const tx = db.transaction((rs) => {
    for (const r of rs) ins.run(WINDOW, r.category, r.ground, r.sample, r.agree, r.override_n,
      r.precision, ready(r.precision, r.sample), BAR, MIN_SAMPLE, JSON.stringify(r.detail || {}));
  });
  tx(rows);
}

(() => {
  ensureSchema();
  runStart();
  try {
    const rows = [...calibrateRules(), ...calibrateDrafts(), ...calibrateNeedsYou(), ...calibrateSweep()]
      .filter((r) => r.sample > 0); // don't snapshot empty categories — noise
    persist(rows);
    const lines = rows.map((r) => {
      const p = r.precision == null ? '—' : `${(r.precision * 100).toFixed(0)}%`;
      const flag = ready(r.precision, r.sample) ? ' ✓grad-ready' : '';
      return `  ${r.category}[${r.ground}]: ${p} (${r.agree}/${r.sample})${flag}`;
    });
    console.log(`calibrate ${DRY ? '(DRY) ' : ''}[${WINDOW}d, bar ${(BAR * 100).toFixed(0)}%/n≥${MIN_SAMPLE}]:` +
      (lines.length ? '\n' + lines.join('\n') : ' no resolved dispositions yet'));
    runEnd('ok', rows.reduce((s, r) => s + r.sample, 0), 0);
  } catch (e) {
    console.error('calibrate FAILED:', e.message);
    runEnd('crashed', 0, 1);
    process.exit(1);
  }
})();
