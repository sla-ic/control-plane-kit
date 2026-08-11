# ADR-0007: Multi-Agent Decomposition — One Orchestrator Per Routine, Zero Subagents in v2

**Status**: Proposed
**Date**: 2026-05-12
**Deciders**: Jordan, Nova
**Supersedes**: None (Nova v1 had no formal multi-agent structure)

## Context

Anthropic has published meaningful work on multi-agent orchestration (orchestrator/specialist, agent-as-tool, parallel sub-agents). The temptation is to architect Nova v2 as a multi-agent system from day one.

The honest read: Nova's workloads are episodic and sequential. The morning brief is: fetch calendar → fetch email → surface stale threads → infer tiers → render Block Kit → post. None of those steps benefits from parallelism (each takes <2s) or independent error recovery (if email fetch fails, the calendar section still ships — handled by graceful-degradation in the Skill itself, not by an isolated agent).

Subagents add value when:
1. Parallelism saves meaningful wall-clock time (>5s).
2. Context isolation prevents pollution (one subagent reads sensitive payment data, another doesn't need to see it).
3. Independent error recovery is required (one subagent's failure shouldn't abort the parent).

None apply to v2 Nova today. Adding subagents pre-emptively buys complexity now for benefits we may never need.

## Decision

Nova v2 architecture:

- **One Routine per cadence** (Morning Brief, Pre-Meeting Brief, EOD, etc.) — these are the orchestrators.
- **Reusable Skills** for capabilities used by multiple Routines (`/fetch-calendar`, `/fetch-email`, `/surface-stale-threads`, `/infer-tiers`, `/render-block-kit`, `/draft-reply`).
- **Zero subagents** in v2.

Skills are not subagents — they are prompts/instructions invoked inline by the orchestrator Routine, sharing the same context window. They factor logic, not concurrency.

### When to introduce subagents (v3 trigger criteria)

We introduce subagents only when one of these is observably true:

1. A single Routine exceeds 60s end-to-end and the bottleneck is sequential I/O that could parallelize.
2. A Routine's context window pressure (> 70% of budget) is hurting output quality.
3. A new capability (e.g., deep research on a topic) genuinely needs independent reasoning isolated from the orchestrator's state.

Until then, complexity stays bounded.

## Consequences

### Positive
- Easier to reason about. One prompt per Routine, plus called Skills.
- Easier to debug. One JSONL event stream per Routine.
- Lower token cost (no inter-agent message overhead).
- Faster iteration in Phases 1-5.

### Negative
- If a Routine grows to 30+ tool calls (unlikely but possible), it'll feel monolithic before we split it.
- Researchers / Anthropic engineers reviewing this might push back on "no multi-agent." That's fine — the right answer is "not yet."

## Alternatives considered

1. **Orchestrator + 3 specialist subagents per Routine** (calendar specialist, email specialist, formatting specialist) — Adds wall-clock latency from inter-agent handoff. Token overhead. No measurable benefit at our scale. Rejected.
2. **One global Nova agent that handles everything** — Loses cron scheduling, hermetic execution. Rejected (covered by ADR-0002).
3. **Subagents only for the "deep" Routines** (Weekly Audit, Stakeholder Rebuild) — Plausible. Weekly Audit could benefit from a "log analyzer" specialist. Deferred to v3 unless Phase 6 reveals the audit Routine is too large for one orchestrator.

## References

- https://www.anthropic.com/engineering/multi-agent-research-system
- ADR-0002 (substrate — Routines are the orchestrators)
- PLAN.md §3 Non-goals
