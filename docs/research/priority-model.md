# Priority & Status — the canonical model (design of record)

Captured 2026-07-02 from Jordan, then researched + grounded. This is the **canonical priority/status
model** for the amp control plane. It supersedes the ad-hoc `priority`/`severity`/`time_horizon`
fields as they exist today. It is the concrete realization of the `vision-enrichment.md` principle —
*"external tools' primitives are feeders INTO our SSOT; the SSOT owns the canonical model"* — and it
executes the `surface-palette.md` §4 principle *"tiers are time-to-act, not data importance."*

---

## 1. The problem, in Jordan's words

> "having our P scale … thats first class here … p0-p-whatever … same for statuses. all platforms
> have their own statuses … and then we have a true macro one for self, thats like reality."
>
> "separate task-driven prio that need status updates versus real state prio … right now theres a
> mismatch but if correct both these data sets should be [in] harmony."

Two demands:
1. **First-class, amp-owned P-scale and status** — a *macro* layer that is Jordan's reality, not any
   platform's. Extensible (P0..Pn), not bound to Jira's P0–P3. Platforms are feeders.
2. **A named split** between "task-driven priority (needs status updates)" and "real-state priority,"
   which today are conflated into one field — and a **harmony** target: when adjudicated correctly,
   the two datasets agree; when they diverge, that divergence *is* the signal.

## 2. The evidence (live DB, 2026-07-02, 76 active tasks)

The conflation is measurable, not theoretical:

| Symptom | Data | Meaning |
|---|---|---|
| `priority` inflation | **P0 = 43%** (33/76) | 2× the surface-palette drift threshold (20%). Jira P0 copied in as if it were reality. |
| `severity` is dead | **96% `medium`** (default) | The one axis meant to carry *objective impact* was never filled — so importance has no home. |
| `time_horizon` is dead | **92% `this-week`** (default) | The *urgency* axis collapsed to a default — so urgency has no home either. |
| `flags` impersonates the feed | `in-review`/`on-track`/`at-risk` copied verbatim from `jira_status` | The platform's workflow state is masquerading as Jordan's flags. |
| `jira_status` conflates two things | `New`/`In Review`/`Delivered` (workflow) **mixed with** `On Track`/`At Risk` (health) | Even the *feeder* muddles state and health. We must not inherit that muddle. |

Root cause: **one `priority` field is being asked to mean three different things at once** — how much
it matters, how soon it's due, and where it sits in the pipeline. It can't, so it defaults to the
loudest input (the platform's inflated ticket priority).

## 3. External grounding — the split is textbook

Three independent traditions converge on the same decomposition:

- **Severity vs Priority** (incident/ITSM). Severity = *how bad, objectively* ("impact"); priority =
  *when to act* (absorbs business context). They diverge in **both** directions, so mature shops keep
  them as **separate fields**. The documented anti-pattern: *inflating one under exec pressure* — "a
  manager asking every five minutes" makes a low-impact item *feel* top priority. That is precisely
  the PROJ-P0 degeneracy. Keep the objective axis clean; let the contextual axis flex.
  ([incident.io](https://incident.io/blog/differences-between-severity-and-priority),
  [Atlassian](https://www.atlassian.com/incident-management/kpis/severity-levels),
  [FireHydrant](https://firehydrant.com/blog/incident-severity-and-priority-101/))

- **Eisenhower** (urgency × importance). Urgency ≠ importance, and **both are orthogonal to workflow
  status** (backlog → in-progress → done). Three axes. The "mere-urgency effect": humans
  over-attend to time-sensitive work over important work even when the important work pays more —
  which is why *importance must be an explicit, reviewable field*, not implied by a moving ticket.
  ([Asana](https://asana.com/resources/eisenhower-matrix),
  [Todoist](https://www.todoist.com/productivity-methods/eisenhower-matrix),
  [ProductPlan](https://www.productplan.com/glossary/eisenhower-matrix))

- **WSJF / RICE** (computed priority). Priority is not declared, it's **computed** from inputs
  (Business Value + Time-Criticality + Risk/Opportunity ÷ Job Size = cost of delay per effort), with
  a hard **distribution constraint**: *"no more than ~10% may score max — reserve the top for
  genuinely exceptional."* And: *"when only owners score their own epics, every epic magically
  becomes high-priority"* — single-source scoring inflates. This is our adjudication engine and our
  anti-inflation guard in one.
  ([Scaled Agile](https://framework.scaledagile.com/wsjf),
  [ProductPlan](https://www.productplan.com/glossary/weighted-shortest-job-first),
  [Centercode RICE vs WSJF](https://www.centercode.com/blog/rice-vs-wsjf-prioritization-framework))

## 4. The model — three orthogonal axes, two derived priorities, one harmony signal

```
              feeders (per-platform, preserved as provenance)
   Jira P0–P3 · Jira status · (Linear · cal · Slack · email …)
                          │  adjudicated in
                          ▼
   ┌─────────────────────────────────────────────────────────┐
   │  CANONICAL, amp-owned (Jordan's reality — first class)     │
   │                                                          │
   │   IMPORTANCE ⟂ URGENCY ⟂ STATUS   (three orthogonal axes) │
   │      │            │         │                             │
   │      │            └────┬────┘                             │
   │      │                 ▼                                  │
   │  real-state         task-driven priority                 │
   │  priority          (urgency × status =                   │
   │  (the P-scale)      "what's due & moving,                 │
   │                      needs a status update")             │
   │      └───────── reconcile ─────────┘                      │
   │                    ▼                                      │
   │             HARMONY / MISMATCH  (the surfaced signal)     │
   └─────────────────────────────────────────────────────────┘
```

### Axis 1 — IMPORTANCE = real-state priority = the P-scale (first-class, amp-owned)
*"How much does this matter to my reality?"* Intrinsic, objective, slow-moving. **Does not care
whether a ticket exists or is moving.** This is Jordan's "true macro one for self, that's like
reality." It is the **P-scale**, and it is extensible — P0..Pn, defined as data, not hardcoded.

Disciplined by construction (WSJF distribution cap): the top rung is *reserved*. If >20% of active
work sits in the top importance rung, that is drift and the board says so (existing `/api/tier-drift`
generalizes to this axis).

Each rung carries a **joint action + response window** (surface-palette §4 — a tier is an action
class, not a feeling). Starter definition (Jordan owns the final vocabulary; stored in `priority_scale`):

| Rung | Real-state meaning | Reserved for |
|---|---|---|
| **P0** | Existential / drop-everything | true fires only — target ≤5% of active |
| **P1** | Strategically critical | the few things that define the quarter |
| **P2** | Core roadmap | the steady majority |
| **P3** | Worthwhile, not load-bearing | improves things, not on the critical path |
| **P4+** | Backlog / someday | extensible tail |

### Axis 2 — URGENCY = time-to-act (the live half of task-driven priority)
*"When must I act?"* Time-decaying. Driven by due dates, cost-of-delay, blocker aging, exec-ping
recency. Repurposes the dead `time_horizon` into a real, action-keyed axis:
`now · this-week · this-cycle · later · none`.

### Axis 3 — STATUS = workflow state (the pipeline half of task-driven priority)
*"Where is this in the pipeline?"* Procedural. The **macro** status is amp-owned and platform-
independent; each platform's native status is a **feeder** mapped into it:
`not-started · active · blocked · waiting-external · in-review · shipped · dropped`.

Critically, **status carries no health** — On Track / At Risk is a *health* attribute of a project,
not a status of a task. We refuse to inherit Jira's status/health muddle.

### The two datasets, precisely
- **Real-state priority** = `importance` (axis 1).
- **Task-driven priority** = a function of `urgency` × `status` (axes 2 & 3) — "what's due and moving
  and therefore needs a status update." This is what platforms natively give you: a ticket in a state.

### Harmony — the derived signal (the whole point)
Reconcile real-state importance against task-driven activity. When they **agree**, the board is
quiet. When they **diverge**, surface it — and *only* that:

| Importance | Task activity (urgency × status) | Verdict | Surface |
|---|---|---|---|
| High | High (due & moving) | **In flight** — harmony | quiet |
| Low | Low (not due, not moving) | **Correctly parked** — harmony | quiet |
| **High** | **Low** (stale / not-started / no due date) | **STARVED** — the thing that matters isn't moving (Eisenhower Q2 crushed) | ⚠️ surface |
| **Low** | **High** (fire-drill on a P3) | **THRASH** — false urgency on low value (the PROJ-P0 pattern) | ⚠️ surface |

"If correct, both datasets are in harmony." Correct adjudication *is* the collapse of these mismatches.
This generalizes the existing `jira_drift` bucket (`server.js:295`) from status-only to the full
importance×activity reconciliation.

## 5. Feeders → canonical: where else priority is adjudicated

The platform's ticket priority is **one weak input**, not the answer. Amp adjudicates canonical
importance & urgency from signals it already holds or can sense (WSJF-style, transparent rubric):

**Importance inputs** (→ axis 1):
- OKR/KR linkage (`okr`) — tied to a committed key result ⇒ higher importance.
- Exec stakeholder (`stakeholders` contains Alex Chen / DK) — skip-level attention ⇒ higher.
- Blast radius (`merchant` count, dependency fan-out via `task_links`).
- Compliance/revenue tags.
- **Objective severity** — folded in here as an input, no longer a separate surfaced axis.

**Urgency inputs** (→ axis 2):
- `due_date` proximity; project health `at-risk`; blocker aging; exec-ping recency (Slack/email
  sensor); SLA windows from `surfacing_rules`.

**Status truth** (→ axis 3):
- Real movement (`updated_at` staleness) vs *claimed* `jira_status`. "Accepted, untouched 30d" is
  not active — it's starved. The gap between claimed and actual status feeds the harmony detector.

Every feeder value is preserved verbatim as **provenance** (`source_priority`, `jira_status`), so the
canonical is always auditable back to its inputs and the platform stays a faithful mirror.

## 6. Schema (make it first-class, minimize sprawl)

Reuse existing columns by *redefinition* rather than adding parallel ones:

- `priority` → **redefined as canonical IMPORTANCE** (real-state P-scale, amp-owned, disciplined).
- `time_horizon` → **renamed/redefined as `urgency`** (action-keyed time-to-act). Migrate values.
- `status` → cleaned to the macro value set; `jira_status` stays as feeder.
- `severity` → **demoted from a surfaced axis to an adjudication input** for importance (kept as raw
  signal, not shown as a competing field). Resolves surface-palette gap-map item.
- **NEW `source_priority TEXT`** — native platform priority string (e.g. Jira "P0"), provenance.
- **NEW `importance_source TEXT`** (`computed | adjudicated`) — did amp derive it, or did Jordan
  ratify/override it (Cycle-B human adjudication on top of machine proposal).

New reference tables (scales as data, so they're editable, not hardcoded):
- `priority_scale(rank, code, label, joint_action, response_window, color)` — the P-scale.
- `status_model(rank, code, label, is_open, color)` — the macro statuses.
- `source_priority_map(source, native, canonical_code)` / `source_status_map(source, native,
  canonical_code)` — how each platform's native values adjudicate in.

## 7. Surface

- Generalize `/api/tier-drift` → importance-inflation banner on axis 1.
- New `/api/reconciliation` (or extend `/api/analysis`) returning the **starved** and **thrash**
  buckets — the harmony signal. This is the landing insight, not a task list.
- Detail panel: `importance` and `urgency` become distinct action-keyed selects; `severity` drops off
  the surface (lives as an input). Status uses the macro value set.

## 8. Migration plan (no blind fills)

1. Land schema (columns + reference tables + maps). Backfill `source_priority` from current Jira
   `priority` before redefining `priority`.
2. Seed `priority_scale` / `status_model` with the starter vocabulary (§4); Jordan redlines.
3. Run the adjudication engine to **compute** canonical importance/urgency for all 148 tasks from the
   §5 signals — transparent rubric, `importance_source='computed'`. Not a hand-wave; a derivation.
4. Surface the harmony buckets. Jordan adjudicates the mismatches; overrides flip rows to
   `importance_source='adjudicated'`. That human pass *is* the "clean up = adjudicate with all data"
   step from `vision-enrichment.md`.

---

## Open decision (Jordan owns)
The **exact vocabulary** of the two canonical scales — the P-scale rungs (how many, named how) and
the macro status set — is Jordan's reality to author. §4 is a grounded starter, not a lock. Everything
downstream (schema, engine, surface) is built to render whatever vocabulary the reference tables hold,
so changing a rung is a data edit, not a rebuild.
