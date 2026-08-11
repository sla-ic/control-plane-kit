# ADR-0003: Observability — Synchronous Hooks + JSONL Audit Log

**Status**: Proposed
**Date**: 2026-05-12
**Deciders**: Jordan, Nova
**Supersedes**: The per-skill audit-log pattern installed earlier 2026-05-12 in meeting-prep/slack-commands/commitment-tracker/stakeholder-rebuild — supersedes that approach entirely.

## Context

Nova v1 had no observability. Silent failures were undetectable except by Jordan noticing a missing brief. Earlier today I patched in per-skill audit logs in 4 of 10 routines — this was correct in spirit but wrong in implementation. Per-skill logs:

- Require editing every SKILL.md to add identical boilerplate.
- Drift between routines (inevitable as schemas evolve).
- Only catch logic-path failures, not tool-call failures (silent connector errors invisible).
- Are still subject to model decisions ("I forgot to write the end entry").

Synchronous **hooks** in `settings.json` solve this at the substrate level. Hooks fire deterministically on every tool call, regardless of the model's prompt or behavior. They are the right primitive.

## Decision

Two-layer observability:

### Layer 1: Synchronous hooks (`settings.json`)

Five hooks installed in Phase 0:

| Hook | Action | Behavior |
|------|--------|----------|
| `preToolUse` | All tool calls | Logs `{routine_id, tool, args_summary, timestamp}` to JSONL |
| `postToolUse` | All tool calls | Logs `{routine_id, tool, result_summary, duration_ms, success, timestamp}` |
| `preSlackMessage` | Slack send | Validates payload (PII scan, channel whitelist), blocks on violation |
| `preEmailSend` | Gmail send | BLOCKS unconditionally (per ADR-0001 Trust Model) |
| `preCalendarWrite` | Calendar mutate | BLOCKS unconditionally (per ADR-0001) |
| `preDelete` | Any delete | BLOCKS unconditionally (per ADR-0001) |

Hook scripts live in `~/.claude/hooks/*.sh`. Bash scripts read JSON payload on stdin, emit decision JSON on stdout, exit 0 (allow) or 2 (block).

### Layer 2: JSONL audit log

Single append-only file: `~/.claude/projects/-Users-you/memory/routines.jsonl`

Schema (every line is a valid JSON object):

```json
{"ts": "2026-05-12T15:00:00Z", "routine": "morning_brief", "event": "routine_start"}
{"ts": "2026-05-12T15:00:01Z", "routine": "morning_brief", "event": "tool_call", "tool": "list_events", "ok": true, "ms": 412}
{"ts": "2026-05-12T15:00:14Z", "routine": "morning_brief", "event": "blocked_action", "tool": "send_email", "reason": "preEmailSend hook"}
{"ts": "2026-05-12T15:00:30Z", "routine": "morning_brief", "event": "slack_send", "channel": "#nova-brief", "message_ts": "1715424135.000123"}
{"ts": "2026-05-12T15:00:31Z", "routine": "morning_brief", "event": "routine_end", "status": "success", "duration_s": 31, "tool_calls": 12}
```

Required events: `routine_start`, `routine_end`. All other events are optional but encouraged.

Rotation: monthly, manual one-off (`routines-YYYY-MM.jsonl`). Retain 90 days in working set; older archived to encrypted backup.

### Layer 3: Weekly CoS Audit Routine

A meta-Routine (`0 10 * * 1`) parses `routines.jsonl` for the last 7 days, computes failure rate, lists most recent failures and blocked actions, and posts a summary to `#nova-alerts` if failure rate >5% or any blocked-action attempts occurred.

This is how the system gets loud when broken without being noisy when fine.

## Consequences

### Positive
- Substrate-level: works for every Routine without per-SKILL.md edits.
- Deterministic: hooks fire regardless of prompt-following quality.
- Auditable: every tool call and every blocked attempt logged.
- Separates "system status" (audit log) from "user output" (Slack briefs).

### Negative
- Hook scripts are an additional artifact to maintain. Mitigation: keep them small, well-tested, in version control.
- Synchronous hooks add small latency to every tool call (typically <50ms). Acceptable.
- JSONL grows ~50 events/Routine × ~30 runs/day = ~1500 events/day. ~500KB/month. Bounded; monthly rotation handles it.

## Alternatives considered

1. **Per-skill audit logs** (initial approach) — Already discussed in Context. Rejected.
2. **External tracing service (Datadog, Honeycomb)** — Overkill for personal automation. Requires server + secrets. Rejected.
3. **HTTP webhook hooks instead of bash** — Possible but adds external dependency and latency. Bash hooks are local, fast, sufficient.
4. **Skip Layer 3 weekly audit, rely on manual log inspection** — Requires Jordan to remember to check. Defeats "loud when broken." Rejected.

## Open questions

- Anthropic may ship richer hook primitives in coming months. If `preToolUse` gains structured-output support beyond JSON, revisit hook script complexity.

## References

- https://code.claude.com/docs/en/hooks
- ADR-0001 (trust model — hooks enforce it)
- ADR-0005 (state — JSONL is also the state mechanism)
- PLAN.md §5 Phase 0 hook gate
