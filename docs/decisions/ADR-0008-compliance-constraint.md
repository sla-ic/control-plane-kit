# ADR-0008: Acme Compliance is an Input Constraint, Not a Gate

**Status**: Accepted (Jordan confirmed 2026-05-12)
**Date**: 2026-05-12
**Deciders**: Jordan, Nova

## Context

Nova operates with Jordan's Acme credentials, reading payments-org-confidential data (Gmail, Slack DMs, Drive, Atlassian, Glean — the last indexing the entire internal corpus). Jordan's MEMORY.md "Non-Negotiables" already states: "Acme policies. Legal boundaries. These are the floor, not constraints to work around."

The security review proposed asking Acme Legal for review/approval of new third-party processors (specifically Anthropic Cloud Routines, research preview, no published DPA). **Jordan has rejected this framing.** We do not seek exceptions to Acme policy. Compliance is built into the architecture from the start, not negotiated.

## Decision

The following constraints are architectural axioms for Nova v2 and any future version:

### 1. No new third-party data processors
Nova is implemented entirely on Jordan's existing, already-sanctioned tools:
- **Local Claude Code** on Jordan's Mac — already in active use; not a new processor relative to Jordan's baseline.
- **Anthropic-managed MCP connectors** (Slack, Gmail, Calendar, Drive, Atlassian, Glean) — already granted, already routing through Anthropic's API, already accepted as part of Jordan's Claude Code usage.
- **Local filesystem** for hooks, JSONL audit log, state — never leaves Jordan's machine.

This rules out Anthropic Cloud Routines (research preview, separate workspace, separate token grants) and any hosted Agent SDK deployment, until and unless Acme sanctions them through normal channels. We do not initiate that conversation; we wait for it.

### 2. No new data egress
Nova may read from any Acme-sanctioned system Jordan has access to. It may write only to:
- Slack channels Jordan already posts in (`#nova-brief`, `#nova-alerts`, DMs to other Acme-sanctioned users).
- Gmail Drafts (never sent).
- Local files in `/Users/you/Desktop/nova/` and `~/.claude/`.

Anything else — public Slack channels Nova didn't initiate, Confluence pages, Jira tickets, external Drive sharing, calendar invites — requires explicit Jordan action.

### 3. PCI-adjacent data is treated as hard-blocked
Payments-org content may include card numbers, BINs, settlement detail. Regex-based PII detection is best-effort but unreliable. Therefore:
- Auto-drafts of replies to payments-flagged threads are **disabled** by default. Jordan invokes `/nova draft` explicitly.
- Any tool result containing recognized PCI patterns (PAN, CVV format, BIN ranges) triggers `block` on the next `preSlackMessage` or `preDraftCreate` hook — the data does not leave the Routine.
- The JSONL audit log redacts PCI patterns before write.

### 4. No exception process
If a Nova feature would require Acme Legal/Privacy approval, that feature is not built. Period.

### 5. This ADR supersedes any conflicting guidance
Where this ADR conflicts with prior ADRs (e.g., the original ADR-0002 choosing Cloud Routines), this ADR wins. Affected ADRs are superseded explicitly.

## Consequences

### Positive
- No compliance review gate. We ship now.
- Trust model has a clear, defensible boundary.
- Architecture is durable — won't break if Acme policy tightens.

### Negative
- We forfeit Cloud Routines benefits (hermetic execution, native scheduler, better observability primitives) until they're sanctioned (likely never, for personal use).
- Local-substrate failure modes (zombie processes, harness instability) remain. Mitigated by hooks + dead-man's-switch (ADR-0003 amended).

## Supersession

- **ADR-0002 superseded** — substrate decision flips from Cloud Routines back to local Claude Code `mcp__scheduled-tasks`. See ADR-0002 (v2).
- ADR-0003, 0005, 0006 unaffected (hooks/JSONL/connectors all work on local substrate; in fact they work *better* because filesystem access is given).

## References

- MEMORY.md "Non-Negotiables"
- Security review 2026-05-12 (`reviews/2026-05-12-review-security.md`)
- ADR-0002 v2 (substrate revised)
