#!/usr/bin/env node
/*
 * rule-report.js — the accountability surface for the email rule bridge.
 *
 * Shows every compiled rule with its provenance and LIVE precision, and — for
 * shadow/staged rules — exactly how far each is from graduating under the measured
 * gate (rule-engine GATE). This is what replaces "graduate by env flag" (P1-2):
 * a rule advances because the numbers here say it earned it, in plain view.
 *
 * Usage:  node rule-report.js            # full table
 *         node rule-report.js --preds N  # also dump the N most recent predictions
 */

const db = require('./db');
const { GATE } = require('./rule-engine');

const nPreds = (() => { const i = process.argv.indexOf('--preds'); return i !== -1 ? parseInt(process.argv[i + 1] || '20', 10) : 0; })();

function pct(x) { return x == null ? '  —  ' : `${(x * 100).toFixed(0)}%`.padStart(5); }
function nextStep(r) {
  if (r.kind === 'protect') return 'safe@auto (never removes mail)';
  if (r.state === 'disabled') return 'DISABLED (restore-confirmed miss)';
  if (r.state === 'auto') return 'auto (short-circuits)';
  const applied = (r.agreed || 0) + (r.disagreed || 0);
  const gate = r.state === 'shadow' ? GATE.stage : GATE.auto;
  const need = [];
  if (applied < gate.minApplied) need.push(`+${gate.minApplied - applied} applications`);
  if (r.precision == null) need.push('no live data yet');
  else if (r.precision < gate.minPrecision) need.push(`precision ${pct(r.precision).trim()}<${(gate.minPrecision*100).toFixed(0)}%`);
  const to = r.state === 'shadow' ? 'staged' : 'auto';
  return need.length ? `${r.state}→${to}: needs ${need.join(', ')}` : `READY to graduate → ${to}`;
}

const rules = db.prepare(`SELECT * FROM email_rules ORDER BY
  CASE kind WHEN 'protect' THEN 0 ELSE 1 END,
  CASE state WHEN 'auto' THEN 0 WHEN 'staged' THEN 1 WHEN 'shadow' THEN 2 ELSE 3 END,
  applied DESC`).all();

console.log(`\n📋 email rule bridge — ${rules.length} rule(s)`);
console.log(`   gate: shadow→staged @ applied≥${GATE.stage.minApplied} & precision≥${(GATE.stage.minPrecision*100).toFixed(0)}%  |  staged→auto @ applied≥${GATE.auto.minApplied} & precision≥${(GATE.auto.minPrecision*100).toFixed(0)}%\n`);

const rows = rules.map((r) => {
  let prov = {}; try { prov = JSON.parse(r.provenance || '{}'); } catch (_) {}
  const matcher = r.match_type === 'domain' ? `@${r.domain}`
    : r.match_type === 'sender' ? r.sender
    : r.match_type === 'subject_re' ? `/${r.subject_re}/`
    : `${r.sender} + /${r.subject_re}/`;
  return {
    id: r.id, kind: r.kind, state: r.state,
    match: matcher.length > 44 ? matcher.slice(0, 41) + '…' : matcher,
    applied: r.applied, agree: r.agreed, dis: r.disagreed, prec: pct(r.precision).trim(),
    origin: prov.origin || '', status: nextStep(r),
  };
});
console.table(rows);

// provenance detail for protect rules (the adjudication trace — P1-5 proof)
console.log('provenance (protect rules trace to the adjudications that created them):');
for (const r of rules.filter((x) => x.kind === 'protect')) {
  let p = {}; try { p = JSON.parse(r.provenance || '{}'); } catch (_) {}
  console.log(`  • ${r.id}: ${(p.adjudications || []).join(', ') || '(none)'} — ${p.note || ''}`);
}

if (nPreds) {
  console.log(`\nlast ${nPreds} predictions:`);
  const preds = db.prepare(`SELECT rule_id, predicted, actual, outcome, ground_truth, subject, created_at
    FROM email_rule_predictions ORDER BY id DESC LIMIT ?`).all(nPreds);
  console.table(preds.map((p) => ({ ...p, subject: (p.subject || '').slice(0, 40) })));
}
console.log('');
