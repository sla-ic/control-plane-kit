# ADR-0016: Closed-loop learning — disposition capture, calibration, and earned graduation

**Status**: Proposed (Amp drafted 2026-07-20; awaiting Jordan)
**Date**: 2026-07-20
**Deciders**: Jordan, Amp
**Relates to**: ADR-0014 (fleet + gated actuators), ADR-0015 (reversible inbox actuators),
ADR-0001 (trust model / the floor), ADR-0008 (compliance egress)

## Context

Jordan's stated north star (2026-07-20): *"nearly everything that's possibly auto-adjudicated should
be — with only real things coming to me. We all have access to the same systems; the only difference
is making the final decisions. Where objective, this should be capably done by the fleet, and ideally
continue to recursively learn and expand as it grows alongside me."*

The fleet today can reason, stage, and (for reversible inbox hygiene) act. What it **cannot** do is
know whether it was *right*, or widen its own scope on evidence. The boundary between
"objective → auto" and "needs Jordan" is real but **static**: it is the floor's hard-denies plus
hardcoded confidence thresholds, sender tier, and the verify verdict. Nothing moves it.

Grounded findings (verified by reading source 2026-07-20):

1. **Predictions are recorded.** `fleet_decisions` (adjudicate + needs-you dual-write),
   `needs_you_resolutions`, `email_drafts`, `email_sweep_actions` each store the fleet's verdict +
   confidence.
2. **Dispositions are recorded.** Jordan's actions are captured across ~5 tables:
   `decisions.resolved_by/resolution/acknowledged_at`, `email_items.acted_by='jordan'`,
   `needs_you_resolutions.status`, `email_sweep_actions.status` (rejected/undone/executed),
   `email_sweep_actions.review_verdict`.
3. **The two are never joined.** `fleet_decisions` is read only for *display* (fleet console stats +
   joins in server.js). No code correlates a prediction to its disposition. Grep for
   `calibrat|precision|graduat|accuracy|override|disposition|feedback` finds no consumer.
4. **Graduation is a hand-flip.** `AMP_SWEEP_AUTO=1` (env var) flips propose→execute. The code comment
   says "once the review agent's precision holds, the flag flips" — but nothing *measures* that it holds.

So the raw material for recursive learning exists; the loop is **open**. This ADR closes it.

## Decision

### 1. A single disposition signal (the join that doesn't exist yet)
Add a `dispositions` table (or view) keyed prediction→verdict:
`(source_kind, source_id, worker, predicted_verdict, predicted_confidence, principal_verdict, agree|override, observed_at)`.
It is populated from the disposition columns already written by the dashboard resolve/act/reject/undo
routes — no new UI, no new instrumentation. `agree/override` is derived (e.g. fleet said `noise` and
Jordan acted on it = override; fleet staged `archive` and Jordan rejected = override).

### 2. A calibration pass (new deterministic worker, in cycle-b)
`calibrate.js` — runs on the Cycle-B cadence, reads `dispositions`, computes **per-bucket /
per-category precision** and lists the override cases. Writes results to a `calibration` table + the
fleet console. No LLM required for the metrics; overrides may later feed few-shot examples back into
the reasoners' prompts (see §4). Read-only against everything except its own output table.

### 3. Earned graduation replaces the manual flag
A category graduates stage→act **only** when its measured precision (from §2) clears a bar over a
minimum sample. Graduation is auto-*proposed* from the numbers; Jordan ratifies once (a
`graduation` decision row); then it runs unattended. `AMP_SWEEP_AUTO`-style env flags are retired in
favor of per-category graduation state in the DB. **No category graduates without evidence.**

### 4. "Objective" is defined by measurement, not by a guessed list
Which categories are safe to auto-actuate is drawn *from* §2's data, not enumerated up front. This is
the honest reading of Jordan's "where objective": objective == measured-high-precision. The override
cases are the curriculum — the system expands into exactly the space its own errors have stopped
appearing in.

### 5. The floor is unchanged by this ADR
Permanent-destruction hard-denies (ADR-0015 §2) and outward-egress gates (ADR-0008) stand. Graduation
can only move a category from *stage* to *act* **within** what the floor already allows (reversible
ops). Widening the floor itself remains a separate, explicit ADR. Learning moves the *behavioral*
boundary inside the floor; it never moves the floor.

## Consequences

- **Positive:** the fleet can justify its own scope; "recursively learn and expand" becomes a
  mechanism, not an aspiration; the escalation boundary tightens automatically as precision proves out,
  so over time "only real things come to Jordan" is earned rather than asserted.
- **Cost:** a new table, one deterministic worker in cycle-b, and a fleet-console surface. Small,
  because the labels already exist.
- **Risk:** a miscalibrated bar could graduate a category too early. Mitigated by (a) minimum sample
  size, (b) Jordan's one-time ratification per graduation, (c) full reversibility of everything a
  graduated category can do (floor unchanged), (d) undo log already present for sweep actions.

## Open questions (for Jordan)

1. Precision bar + minimum sample per graduation (start conservative, e.g. ≥0.95 over ≥20 dispositions?).
2. Whether override cases feed back as prompt few-shots in v1, or stay metrics-only until the loop is proven.
3. Coverage: expanding the reasoner's feed beyond the flagged delta (6 buckets, `--limit 8`) to the full
   surface is prerequisite to "nearly everything" — tracked separately as the Cycle-A/feeder gap
   (docs/ops/amp-system-spec.md §7.1), but this ADR assumes it lands.
