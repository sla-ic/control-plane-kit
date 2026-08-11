# ADR-0002: Substrate — Cloud Routines

**Status**: Proposed
**Date**: 2026-05-12
**Deciders**: Jordan, Nova
**Supersedes**: None (Nova v1 used `mcp__scheduled-tasks` implicitly; no prior ADR)

## Context

Nova v1 runs as 10 scheduled tasks via Claude Code's `mcp__scheduled-tasks` MCP server. Failure modes observed in v1:

- Silent no-ops (task completes, `lastRunAt` updates, nothing posted, no audit trail)
- Hung ticks blocking subsequent firings (one task takes 8 min, skips 3 ticks at 15-min cadence)
- Zombie Bash processes accumulating (21 phantom tasks in UI requiring Cmd+Q to clear)
- No hermetic execution — session state can leak between runs
- No formal observability primitive

Anthropic shipped **Cloud Routines** specifically for this workload: cron-scheduled, MCP-integrated, hermetic (fresh clone per run), with native hooks and audit support.

## Decision

All scheduled Nova work moves to **Cloud Routines**. `mcp__scheduled-tasks` is deprecated for Nova v2 and disabled at Phase 6 cutover.

Six Routines (each its own prompt + schedule, sharing reusable Skills):

1. Morning Brief (`0 8 * * 1-5`)
2. Pre-Meeting Brief (`*/5 6-19 * * 1-5`)
3. EOD Brief (`0 18 * * 1-5`)
4. Inbox Triage (`15 * * * 1-5`)
5. Commitment Tracker (`0 9,11,13,15,17,19 * * 1-5`)
6. Weekly CoS Audit (`0 10 * * 1`) + Stakeholder Rebuild (`0 9 * * 0`) + Stale Sweep (`0 9 * * 1`)

Workspace: separate Cloud Routines workspace (not shared with Jordan's main Claude Code workspace) — isolation, predictable environment.

Connectors granted at workspace level: Slack, Gmail, Calendar, Drive, Atlassian, Glean (per ADR-0006).

## Consequences

### Positive
- Hermetic execution: each run starts clean, no state bleed.
- Native hooks (ADR-0003) work without custom infrastructure.
- No more "did it run?" — Routines panel shows status; JSONL log shows detail.
- ~$30/yr total cost (6 Routines × typical cadence × ~$0.013/10-min run).
- Anthropic infrastructure handles retries, scheduling drift, exponential backoff.

### Negative
- Cloud Routines is research preview — no formal SLA, behavior could change.
- One-time provisioning cost (workspace setup, connector grants, hook installation).
- Debugging is "fetch the audit log, grep" — no live tail of a running Routine.
- Cron in local time (good) but jitter is non-configurable (research preview).

## Alternatives considered

1. **Stay on `mcp__scheduled-tasks`** — Familiar, but every silent failure mode observed in v1 is structurally invited by the substrate. Rejected.
2. **Claude Agent SDK (Python/TS process on a server)** — Maximum flexibility but requires infrastructure (server, process supervision, secrets management) Jordan does not want to operate. Rejected.
3. **Managed Agents** — Designed for long-running stateful tasks (30+ min with refinement loops). Nova is episodic: fetch → synthesize → post → done. Overbuilt. Rejected.
4. **Mix: Cloud Routines for time-sensitive, Agent SDK for stateful** — No part of Nova is genuinely stateful (state lives in JSONL per ADR-0005). Adds substrate complexity without benefit. Rejected.

## Migration

- Phase 0: Provision Routines workspace, grant connectors, smoke-test with hello-world Routine.
- Phase 1–5: Author each Routine, run in shadow mode alongside v1.
- Phase 6: Disable v1 scheduled tasks one at a time.

## References

- https://code.claude.com/docs/en/routines
- https://code.claude.com/docs/en/scheduled-tasks (deprecated for Nova v2)
- PLAN.md §5 Phases
