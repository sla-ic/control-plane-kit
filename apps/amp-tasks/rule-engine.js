#!/usr/bin/env node
/*
 * rule-engine.js — the executable side of the email rule bridge (ADR-0015 P1-5/P1-2).
 *
 * This is the pure, side-effect-light core shared by compile-rules.js (which WRITES
 * rules) and inbox-sweep.js (which CONSULTS them). It answers two questions:
 *
 *   matchRule(item, rules)     → which rule (if any) applies to this thread, and
 *                                 what would it do? Respects kind priority (protect
 *                                 wins), match specificity, and precision as tiebreak.
 *   recordPrediction(...)      → log a rule firing (predicted vs. actual) so the
 *                                 precision gate has ground truth to graduate on.
 *   reconcilePrediction(...)   → once the pipeline/human decides, close the loop:
 *                                 mark agree/disagree and roll the rule's stats.
 *   evaluateGraduation(rule)   → the MEASURED gate. shadow→staged→auto only when
 *                                 applied≥N AND precision≥P. Never by fiat.
 *
 * SAFETY ASYMMETRY (the whole point): a 'protect' rule can only downgrade a
 * destructive action to keep — it can over-keep, never over-delete — so it is
 * safe at 'auto' from birth. An 'archive'/'trash' rule removes mail, so it must
 * earn 'auto' through evidence. The gate below enforces exactly that.
 */

const db = require('./db');

// ── graduation thresholds (the precision gate; P1-2's cure) ──
// Deliberately conservative. Tunable via env, but the DEFAULTS must never let a
// destructive rule reach 'auto' on thin evidence.
const GATE = {
  // shadow → staged: enough matches that the pattern is real, precision solid.
  stage: { minApplied: parseInt(process.env.AMP_RULE_STAGE_N || '8', 10),
           minPrecision: parseFloat(process.env.AMP_RULE_STAGE_P || '0.90') },
  // staged → auto: a LOT of matches, near-perfect precision, ZERO recent misses.
  // minHuman is the DE-CIRCULARIZATION gate: staged→auto (unattended fire) requires
  // real HUMAN-ground dispositions (ground_truth IN human|restore), NOT the pipeline's
  // own self-agreement. A rule can pass minApplied/minPrecision on pure pipeline
  // ground_truth='pipeline' evidence — that only earns 'staged' (proposes to a human),
  // never 'auto'. Without human signal, precision is a rule agreeing with the same
  // pipeline that spawned it: circular. See audit SEV-HIGH.
  // minHumanDays is the RATIFICATION gate: human-ground endorsements must be spread
  // across ≥N distinct calendar days, so a single bulk dashboard approve can't flip a
  // rule to unattended-fire the instant human evidence first appears. Sustained
  // endorsement, not one click. Measured, not fiat — same spirit as minHuman.
  auto:  { minApplied: parseInt(process.env.AMP_RULE_AUTO_N || '25', 10),
           minPrecision: parseFloat(process.env.AMP_RULE_AUTO_P || '0.97'),
           minHuman: parseInt(process.env.AMP_RULE_AUTO_HUMAN || '5', 10),
           minHumanPrecision: parseFloat(process.env.AMP_RULE_AUTO_HUMAN_P || '0.97'),
           minHumanDays: parseInt(process.env.AMP_RULE_AUTO_HUMAN_DAYS || '2', 10) },
  // any confirmed miss (a thread the rule would have removed, later RESTORED)
  // immediately disables a destructive rule. Protect rules are never disabled here.
  demoteOnRestore: true,
};

const domainOf = (email) => {
  const m = String(email || '').toLowerCase().match(/@([\w.-]+)$/);
  return m ? m[1] : null;
};

// Compile a rule's matcher once (regex is stored as source). Returns a predicate.
function ruleMatcher(rule) {
  let re = null;
  if (rule.subject_re) { try { re = new RegExp(rule.subject_re, 'i'); } catch (_) { re = null; } }
  const sender = rule.sender ? rule.sender.toLowerCase() : null;
  const domain = rule.domain ? rule.domain.toLowerCase() : null;
  return (item) => {
    const se = (item.sender_email || '').toLowerCase();
    const subj = item.subject || '';
    switch (rule.match_type) {
      case 'sender':            return sender && se === sender;
      case 'domain':            return domain && domainOf(se) === domain;
      case 'subject_re':        return !!(re && re.test(subj));
      case 'sender+subject_re': return !!(sender && se === sender && re && re.test(subj));
      default: return false;
    }
  };
}

// Specificity score — more specific rules win when several match.
function specificity(rule) {
  switch (rule.match_type) {
    case 'sender+subject_re': return 4;
    case 'sender':            return 3;
    case 'subject_re':        return 2;
    case 'domain':            return 1;
    default: return 0;
  }
}

// Load active (non-disabled) rules once.
function loadRules() {
  return db.prepare(`SELECT * FROM email_rules WHERE state != 'disabled'`).all()
    .map((r) => ({ ...r, _match: ruleMatcher(r) }));
}

/*
 * matchRule — the decision. Given a thread item and the loaded rules, return the
 * governing rule + the action it dictates, or null if nothing matches.
 *
 * Priority, in order:
 *   1. PROTECT always wins. If ANY protect rule matches, the thread is kept — a
 *      protect rule can never be overruled by an archive rule (safe direction).
 *   2. Among destructive rules (archive/trash/label), the most SPECIFIC wins;
 *      precision then higher `state` (auto>staged>shadow) break ties.
 * Returns { rule, action, label, effect } where effect is:
 *   'protect' | 'auto' | 'staged' | 'shadow'  — how the caller should treat it.
 */
function matchRule(item, rules) {
  const matched = rules.filter((r) => r._match(item));
  if (!matched.length) return null;

  const protects = matched.filter((r) => r.kind === 'protect');
  if (protects.length) {
    const r = protects.sort((a, b) => specificity(b) - specificity(a))[0];
    return { rule: r, action: 'keep', label: null, effect: 'protect' };
  }

  const stateRank = { auto: 3, staged: 2, shadow: 1 };
  const r = matched.sort((a, b) =>
    specificity(b) - specificity(a) ||
    (stateRank[b.state] || 0) - (stateRank[a.state] || 0) ||
    (b.precision || 0) - (a.precision || 0)
  )[0];

  return { rule: r, action: r.kind, label: r.label || null, effect: r.state };
}

// ── prediction ledger ──
function recordPrediction({ rule, item, predicted, run_id }) {
  const info = db.prepare(`INSERT INTO email_rule_predictions
    (rule_id, thread_id, sender_email, subject, predicted, run_id)
    VALUES (?,?,?,?,?,?)`).run(rule.id, item.thread_id, item.sender_email, item.subject, predicted, run_id || null);
  db.prepare(`UPDATE email_rules SET applied = applied + 1, last_matched_at = datetime('now') WHERE id=?`).run(rule.id);
  return info.lastInsertRowid;
}

// Close a prediction against ground truth (the pipeline's or a human's decision).
// A 'protect' rule predicts keep; it "agrees" whenever the final action was keep.
function reconcilePrediction(predId, actual, ground = 'pipeline') {
  const p = db.prepare(`SELECT * FROM email_rule_predictions WHERE id=?`).get(predId);
  if (!p || p.outcome !== 'pending') return;
  const outcome = p.predicted === actual ? 'agree' : 'disagree';
  db.prepare(`UPDATE email_rule_predictions SET actual=?, outcome=?, ground_truth=?, resolved_at=datetime('now') WHERE id=?`)
    .run(actual, outcome, ground, predId);
  rollStats(p.rule_id);
  return outcome;
}

// Reconcile every still-pending prediction on a thread against a single observed
// outcome. Used by the dashboard's approve/reject/undo routes — each is a HUMAN
// decision on a rule's destructive proposal, the independent signal the staged→auto
// gate requires (ground_truth='human'|'restore'). Protect-rule predictions are
// reconciled at record time (pipeline), so anything still pending on a thread is a
// destructive prediction — safe to close against the human's call. reconcilePrediction
// is a no-op on an already-resolved row, so this is idempotent and can't double-count
// against disposition-capture's own restore sensing. Returns the count reconciled.
function reconcileThreadPredictions(threadId, actual, ground = 'human') {
  if (!threadId) return 0;
  const preds = db.prepare(`SELECT id FROM email_rule_predictions WHERE thread_id=? AND outcome='pending'`).all(threadId);
  let n = 0;
  for (const p of preds) { try { if (reconcilePrediction(p.id, actual, ground) != null) n++; } catch (_) {} }
  return n;
}

// Force a thread's predictions to a RESTORE miss — the strongest safety signal.
// A normal reconcile is a no-op once a prediction is resolved, so an undo that lands
// AFTER an approve/apply already closed the prediction as 'agree' would otherwise
// never demote the offending rule. A restore means the destructive action was wrong;
// it must ALWAYS win. This overrides any prior outcome to disagree/restore and rolls
// stats, so evaluateGraduation's demoteOnRestore fires. Returns the count overridden.
function reconcileThreadRestore(threadId) {
  if (!threadId) return 0;
  const preds = db.prepare(`SELECT DISTINCT rule_id FROM email_rule_predictions WHERE thread_id=?`).all(threadId);
  const upd = db.prepare(`UPDATE email_rule_predictions
    SET actual='keep', outcome='disagree', ground_truth='restore', resolved_at=datetime('now')
    WHERE thread_id=? AND (outcome='pending' OR (outcome='agree' AND predicted != 'keep'))`).run(threadId);
  for (const { rule_id } of preds) rollStats(rule_id);
  return upd.changes;
}

// Recompute a rule's agreed/disagreed/precision from its resolved predictions,
// then apply the graduation gate.
function rollStats(ruleId) {
  const row = db.prepare(`
    SELECT SUM(outcome='agree') agreed, SUM(outcome='disagree') disagreed, COUNT(*) resolved
    FROM email_rule_predictions WHERE rule_id=? AND outcome != 'pending'`).get(ruleId);
  const agreed = row.agreed || 0, disagreed = row.disagreed || 0;
  const denom = agreed + disagreed;
  const precision = denom ? agreed / denom : null;
  db.prepare(`UPDATE email_rules SET agreed=?, disagreed=?, precision=? WHERE id=?`)
    .run(agreed, disagreed, precision, ruleId);
  evaluateGraduation(db.prepare(`SELECT * FROM email_rules WHERE id=?`).get(ruleId));
}

/*
 * evaluateGraduation — the MEASURED state machine (replaces AMP_SWEEP_AUTO fiat).
 * Protect rules are exempt (already safe at auto). Destructive rules climb only on
 * evidence, and a confirmed restore (disagreement flagged ground_truth='restore')
 * knocks them straight back to disabled.
 */
function evaluateGraduation(rule) {
  if (!rule || rule.kind === 'protect') return rule ? rule.state : null;

  // hard demote: any restore-confirmed miss disables a destructive rule.
  if (GATE.demoteOnRestore) {
    const misses = db.prepare(`SELECT COUNT(*) n FROM email_rule_predictions
      WHERE rule_id=? AND outcome='disagree' AND ground_truth='restore'`).get(rule.id).n;
    if (misses > 0 && rule.state !== 'disabled') {
      setState(rule.id, 'disabled', `restore-confirmed miss (${misses})`);
      return 'disabled';
    }
  }

  const p = rule.precision, applied = rule.agreed + rule.disagreed;
  let target = rule.state;
  // shadow → staged: pipeline self-agreement is ENOUGH here — 'staged' only ever
  // PROPOSES a destructive action for dashboard approval, so a wrong staged rule
  // costs a human click, never lost mail.
  if (rule.state === 'shadow' && applied >= GATE.stage.minApplied && p != null && p >= GATE.stage.minPrecision) target = 'staged';
  // staged → auto: this rule would fire UNATTENDED, so pipeline self-agreement is
  // disqualified. Require (a) enough total volume that the pattern is real, and
  // (b) an independent HUMAN-ground track record (Jordan actually let matches go /
  // never restored them), measured only over ground_truth IN ('human','restore').
  if (rule.state === 'staged' || target === 'staged') {
    const h = db.prepare(`
      SELECT SUM(outcome='agree') agreed, SUM(outcome='disagree') disagreed,
             COUNT(DISTINCT date(resolved_at)) days
      FROM email_rule_predictions
      WHERE rule_id=? AND outcome != 'pending' AND ground_truth IN ('human','restore')`).get(rule.id);
    const hAgreed = h.agreed || 0, hDis = h.disagreed || 0, hN = hAgreed + hDis;
    const hP = hN ? hAgreed / hN : null;
    const hDays = h.days || 0;
    if (applied >= GATE.auto.minApplied && p != null && p >= GATE.auto.minPrecision &&
        hN >= GATE.auto.minHuman && hP != null && hP >= GATE.auto.minHumanPrecision &&
        hDays >= GATE.auto.minHumanDays) {
      target = 'auto';
    }
  }
  if (target !== rule.state) {
    const why = target === 'auto'
      ? `gate: applied=${applied} precision=${(p * 100).toFixed(0)}% + human-verified (ratified across days)`
      : `gate: applied=${applied} precision=${(p * 100).toFixed(0)}%`;
    setState(rule.id, target, why);
  }
  return target;
}

function setState(ruleId, state, why) {
  db.prepare(`UPDATE email_rules SET state=? WHERE id=?`).run(state, ruleId);
  db.prepare(`INSERT INTO email_events (routine, action, thread_id, detail) VALUES ('rule','state_change',NULL,?)`)
    .run(JSON.stringify({ rule_id: ruleId, state, why }));
}

module.exports = {
  GATE, domainOf, ruleMatcher, specificity, loadRules,
  matchRule, recordPrediction, reconcilePrediction, reconcileThreadPredictions,
  reconcileThreadRestore, rollStats, evaluateGraduation, setState,
};
