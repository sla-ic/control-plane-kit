# ADR-0005: State Management — Append-Only JSONL Event Log

**Status**: Proposed
**Date**: 2026-05-12
**Deciders**: Jordan, Nova
**Supersedes**: Nova v1 `inbox-system/state/*.json` files (per-routine JSON state)

## Context

Nova v1 passes state between routines via JSON files in `inbox-system/state/`:

- `brief-items.json` — written by morning-brief, read by slack-commands
- `slack-sweep-state.json` — written by slack-sweep, read by commitment-tracker + meeting-prep + stakeholder-rebuild
- `commitments.json`, `snoozed.json`, `meeting-prep-sent.json`, ~10 others

The May 12 audit found:

- The entire `state/` directory is empty. Every consumer is silently no-op'ing on cold-start.
- Files race under concurrent runs (no locking).
- References drift (`tier1_dm_map` is read but never written anywhere).
- Schema evolution is informal — one routine adds a field, another routine that reads the file doesn't know about it.

Cloud Routines (ADR-0002) are hermetic (fresh clone per run) — they CANNOT share in-memory state. They must share state through a persisted artifact. JSON files would still race.

The right primitive: **append-only JSONL event log**. Each Routine appends immutable events. Concurrent Routines never conflict on writes. Readers always see a consistent history.

## Decision

State lives entirely in **`~/.claude/projects/-Users-you/memory/routines.jsonl`** (same file used for observability per ADR-0003 — the two layers share the substrate).

### Event types (non-exhaustive)

| Event | Producer | Consumer use |
|-------|----------|--------------|
| `meeting_briefed` | Pre-Meeting Brief | Self (dedupe), Weekly Audit |
| `inbox_item_surfaced` | Inbox Triage | Slack command handler (look up by item_id) |
| `item_snoozed` | Slack command handler | Inbox Triage (filter on next pass), Morning Brief (skip) |
| `item_acked` | Slack command handler | EOD Brief ("handled today" count), Inbox Triage (skip) |
| `draft_created` | Inbox Triage or slash command | Slack command handler (`tone` operation needs draft_id) |
| `commitment_made` | Commitment Tracker | EOD Brief, Stale Sweep |
| `commitment_completed` | Slack `/nova` command | Commitment Tracker (mark done) |
| `stakeholder_tiers` | Stakeholder Rebuild | All routines (replaces stakeholders.md as runtime source) |
| `slack_channels_jordan_in` | (Hook on Slack channel-list call) | Inbox Triage, Commitment Tracker |
| `routine_start` / `routine_end` | All Routines | Weekly Audit, debugging |
| `tool_call`, `blocked_action` | Hooks (ADR-0003) | Weekly Audit |

### Read pattern

Routines that need "current state" tail the log from the end backward:

```bash
# "What's snoozed right now?"
grep '"event":"item_snoozed"' routines.jsonl | jq 'select(.until > now)' | jq '.item_id'

# "Has this meeting already been briefed?"
grep '"event":"meeting_briefed"' routines.jsonl | jq 'select(.event_id == "abc123")' | head -1
```

In Skills, this is a small helper: `read_recent_events(event_type, predicate, lookback_days)`.

### Write pattern

Append-only. Never edit. Never delete. State changes are new events that supersede prior ones (e.g., `item_unsnoozed` events override prior `item_snoozed`).

### Schema evolution

Every event must include `event` (string) and `ts` (ISO 8601). Other fields are event-specific. Producers can add fields freely; consumers ignore unknown fields. Breaking changes happen by minting a new event type, not mutating the schema.

### Bootstrap

Phase 0 seeds the log with one event:

```json
{"ts":"2026-05-12T...","event":"system_initialized","nova_version":"v2"}
```

Cold-start logic in each Skill: if no relevant prior events exist, mark output as "first run" (skips features that depend on history).

### Rotation

Monthly rotation: at start of each month, the Weekly Audit Routine renames current log to `routines-YYYY-MM.jsonl`. Working set is current month + previous month. Older files moved to `archive/`.

## Consequences

### Positive
- No race conditions (append is atomic in POSIX).
- Time-ordered audit trail comes free.
- Easy debugging: `grep` and `jq` answer almost every question.
- Schema drift handled by additive event types.
- Replayable: if a Routine wants to "what did I do last Tuesday," the data is there.

### Negative
- Larger storage than overwriting JSON files (offset by monthly rotation — ~500KB/month).
- Reads are O(N) without an index. Acceptable at our scale; if log grows past 100MB, add a daily summary file or SQLite indexing.
- "Current state" requires log traversal, not a single JSON read. Helper functions hide this.

## Alternatives considered

1. **SQLite at `state/nova.db`** — Adds a binary state format, harder to inspect with shell tools, requires schema migrations. Rejected for v2; reconsider at v3 if log grows large.
2. **Per-routine JSON files (current model)** — Race conditions, broken chains, no audit trail. Rejected.
3. **External KV store (Redis, DynamoDB)** — Requires infra. Rejected for personal automation.
4. **Anthropic-managed memory (Managed Agents feature)** — Tied to Managed Agents substrate, which we rejected in ADR-0002.

## Migration

- Phase 0: Initialize JSONL with bootstrap event.
- Phases 1-5: New Routines write directly to JSONL. Read-only access to v1 JSON state files for backfill.
- Phase 6: One-off script reads v1 JSON files (snoozed.json, commitments.json) and replays them as JSONL events. v1 files retired.

## References

- ADR-0002 (substrate dictates state model)
- ADR-0003 (observability shares this file)
- PLAN.md §5 Phase 0 bootstrap, Phase 6 migration
