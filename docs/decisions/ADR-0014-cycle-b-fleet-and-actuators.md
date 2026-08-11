# ADR-0014: The Cycle-B fleet — scheduled autonomy, specialist subagents, and gated actuators

**Status**: Accepted (2026-07-01)
**Date**: 2026-07-01
**Deciders**: Jordan, Amp
**Relates to**: ADR-0005 (JSONL event log), ADR-0008 (compliance floor), ADR-0009 (host + git-backed state)
**Evolves**: ADR-0007 (no subagents in v2) — its v3 trigger criteria are now met; see below.

## Context

The control plane's two cycles are built and floor-clean:
- **Cycle A (import)** — mechanical, cheap: `sync-jira.js`, `enrich-*`. Moves data
  in. No thinking.
- **Cycle B (reason)** — `adjudicate.js`: reads the flagged delta, adjudicates each
  item (real signal vs. noise), stages a next step or escalates. Writes to
  `fleet_runs` / `fleet_decisions` (the audit trail) and `routines.jsonl`.

As of ADR-0009, Cycle B now runs **off-terminal under launchd** (`com.example.amp-cycle-b`,
4×/day) via `cycle-b.sh`, reasoning through the Acme llm-gateway (`llm.js`) and posting
real escalations to the floor-whitelisted **#amp-alerts**. State is durable and
host-independent (`amp-state` git ref).

This ADR records where that goes: from a single scheduled reasoner to a **fleet** —
specialist subagents, more source cycles, and a small set of **gated actuators**
(Slack, email drafts) so the system doesn't just think, it closes loops.

## Decision

### 1. Scheduled autonomy is the substrate (landed)
Cycle B runs on a cadence with no human in the loop, escalating only real items to
#amp-alerts, attributed `[Amp, on behalf of Jordan]`. Everything else is staged for
Jordan to ratify in the dash. This is the "Amp proposes, Jordan ratifies" contract.

### 2. Specialist subagents — ADR-0007's v3 trigger is now met
ADR-0007 correctly deferred subagents in v2 (episodic, sequential, sub-2s steps).
Two of its named v3 triggers now hold:
- *"a new capability genuinely needs independent reasoning isolated from the
  orchestrator's state"* — Cycle B adjudicates heterogeneous buckets (Jira delta,
  onboarding milestones, roadmap drift, comms triage) that each want their own
  system prompt and context, not one blended window.
- Context-window pressure as buckets grow.

**Model**: one orchestrator (the scheduled Cycle B run) fans out to **specialist
adjudicators per bucket** — each a bounded `llm.js` call with a bucket-specific
system prompt and only that bucket's rows in context. They return structured
verdicts; the orchestrator merges, dedupes, and decides what escalates. Subagents
here = context isolation + independent error recovery, NOT a new process model.
They stay inside the existing headless-gateway seam.

### 3. Gated actuators — think → close the loop
The fleet earns trust by *doing*, within hard floor limits (ADR-0008):

| Actuator | Allowed | Hard limit |
|---|---|---|
| **Slack** | post escalations/digests to channels Jordan owns (#amp-alerts today) | recipient-subset rule; attributed; only on real escalations |
| **Email** | **draft only** (`create_draft`) | Gmail *send* is hard-blocked (ADR-0001). Never auto-send. |
| **Jira / systems** | read + local advisory writes | no outward mutation without ratification |
| **PCI / payments** | — | hard-blocked before any outward write |

Actuators are opt-in per capability and default to the safest mode (draft/stage).
Enabling an outward actuator is a deliberate, logged decision — never silent
send-to-the-world.

### 4. Everything is auditable
Every fleet run and decision is already persisted (`fleet_runs`, `fleet_decisions`)
plus the JSONL event log (ADR-0005). Actuator firings emit events
(`escalated`, `degraded`, …). The audit trail is first-class, durable (git-backed),
and queryable — the substrate for "bring my team on board one by one" later
(the `identity.js` per-principal seam already exists, dormant).

## Consequences

- ✅ The system runs and reasons without Jordan's terminal; loops close via gated,
  attributed actuators.
- ✅ Subagent complexity is introduced only where it buys context isolation, per
  ADR-0007's own criteria — not pre-emptively.
- ✅ Floor-safe by construction: drafts-not-sends, whitelisted channels,
  ratify-before-mutate, PCI-blocked.
- ⚠️ Cost grows with fan-out (more gateway calls). Bounded by `--limit` and
  per-bucket batching; token usage is already tracked per run.
- ⚠️ Trust is earned incrementally: actuators graduate from stage → draft → post
  as their precision is observed in the audit trail.

## Rollout (sequenced)
1. **Landed**: scheduled Cycle B + #amp-alerts escalation + git-backed audit.
2. **Next**: per-bucket specialist adjudicators (context isolation) behind the
   existing orchestrator.
3. **Then**: email-draft actuator (Cycle B stages a draft reply for threads it
   flags; Jordan sends).
4. **Then**: Cycle A on a schedule where sources are headless-reachable; richer
   Slack digests.
5. **Later (gated by need)**: multi-user via the InternalCloud flip (ADR-0009) + `identity.js`.

## References
- `apps/amp-tasks/adjudicate.js`, `llm.js`, `cycle-b.sh`
- ADR-0007 (subagent deferral + v3 triggers), ADR-0008 (floor), ADR-0009 (host)
- ADR-0005 (JSONL event contract)
