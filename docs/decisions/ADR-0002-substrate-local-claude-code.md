# ADR-0002 (v2): Substrate — Local Claude Code Scheduled Tasks

**Status**: Accepted (supersedes ADR-0002 v1 which chose Cloud Routines)
**Date**: 2026-05-12
**Deciders**: Jordan, Nova
**Supersedes**: ADR-0002 v1 (Cloud Routines)
**Driven by**: ADR-0008 (Acme compliance constraint)

## Context

ADR-0002 v1 chose Anthropic Cloud Routines as the substrate. ADR-0008 makes Acme compliance a non-negotiable input constraint. Cloud Routines is research preview with no Acme-sanctioned DPA for the relevant data flows (payments-org credentials, Glean internal-corpus reads). Therefore Cloud Routines is out.

Nova v1 runs on Jordan's local Claude Code via `mcp__scheduled-tasks`. This substrate is already in use, introduces no new data processor, and is the only compliance-aligned option for now. v2 stays here.

The v1 substrate has real failure modes (silent no-ops, zombie processes, harness instability, no hermetic execution). Those are mitigated through other ADRs (hooks, dead-man's-switch, JSONL audit, write-side dedup) — not by changing substrate.

## Decision

Nova v2 runs on **local Claude Code `mcp__scheduled-tasks`**, the same substrate as v1.

Eight scheduled tasks (same as v1's count; some renamed/consolidated):

1. `nova-meeting-prep` — `*/5 6-19 * * 1-5` (every 5 min, work hours)
2. `nova-morning-brief` — `0 8 * * 1-5`
3. `nova-eod-brief` — `0 18 * * 1-5`
4. `nova-inbox-triage` — `15 * * * *` (hourly)
5. `nova-slack-commands` — `*/3 6-22 * * 1-5` (every 3 min, work hours)
6. `nova-slack-sweep` — `*/30 7-19 * * 1-5`
7. `nova-commitment-tracker` — `0 9,11,13,15,17,19 * * 1-5`
8. `nova-stale-sweep` — `0 9 * * 1`
9. `nova-stakeholder-rebuild` — `0 9 * * 0` (weekly Sunday)
10. `nova-watchdog` — `*/15 7-20 * * 1-5` (dead-man's switch, per ADR-0003 v2)

State: JSONL event log at `~/.claude/projects/-Users-you/memory/routines.jsonl` (per ADR-0005). Local filesystem, accessible to all tasks.

Hooks: `~/.claude/hooks/*.sh` per ADR-0003 v2, executed by Claude Code locally on tool calls. Trust model (ADR-0001) is enforceable here because hooks actually fire.

## Consequences

### Positive
- Compliance-aligned by construction (ADR-0008).
- Hooks and filesystem state work as designed — no substrate-capability gap.
- Already-familiar substrate; no new learning curve, no new failure modes to discover.
- Free (no per-run cost).

### Negative
- Substrate has known reliability issues (silent no-ops, zombie processes). All mitigations live in other ADRs:
  - Silent no-ops → hooks fire deterministically (ADR-0003), dead-man's-switch detects (ADR-0003 v2)
  - Zombie processes → budget caps in every SKILL.md (already in place)
  - Harness instability → watchdog detects, escalation alert to #nova-alerts
- No hermetic execution — state can leak between runs in pathological cases. Mitigation: JSONL log is the canonical state; in-process state is ephemeral.
- Local-only — if Jordan's Mac is offline (travel, lid closed), Routines don't run. Acceptable for a personal CoS.

## Implementation notes

- Cost claim removed (was wrong even for Cloud Routines; for local substrate, it's $0).
- Pre-Meeting cadence stays at `*/5` (every 5 min) because re-runs are cheap (~1 tool call) when idempotency check exits early.
- `mcp__scheduled-tasks__update_scheduled_task` is the API for reconfiguring (already in use today).

## References

- ADR-0008 (compliance constraint)
- ADR-0003 v2 (observability — hooks now actually fire here)
- ADR-0005 (state — JSONL now actually accessible)
- ADR-0006 (official Anthropic connectors — same connectors, same compliance posture as today)
