# ADR-0099: Retro — Nova v2 Migration

**Status**: Accepted
**Date**: 2026-05-12
**Deciders**: Jordan, Nova

## What we shipped

Nova v2 is a re-architecture of the personal CoS automation, executed in a single working session on top of the existing local Claude Code substrate. Twelve build slices, no calendar weeks. The architecture is now compliance-aligned by construction, hook-enforced for trust, JSONL-sourced for observability, and built on official Anthropic MCP connectors.

### Concrete deliverables

| Artifact | Path |
|---|---|
| Trust-model guard hook | `~/.claude/hooks/nova-guard-writes.sh` |
| Universal event logger | `~/.claude/hooks/nova-log-tool.sh` |
| JSONL events helper | `~/.claude/hooks/nova-events.sh` |
| Hook wiring | `~/.claude/settings.json` (`hooks.PreToolUse`, `hooks.PostToolUse`) |
| Event log | `~/.claude/projects/-Users-you/memory/routines.jsonl` |
| Routine conventions | `~/.claude/scheduled-tasks/_nova-conventions.md` |
| 10 rewritten SKILLs | `~/.claude/scheduled-tasks/nova-*/SKILL.md` |
| Tier-override config | `~/Desktop/nova/inbox-system/tier-overrides.json` |
| Stakeholders with Slack IDs | `~/Desktop/nova/inbox-system/stakeholders.md` (DK, Alex Chen, Sam, Mark, Will — all resolved) |
| 11 ADRs | `…/projects/nova-v2-migration/adr/ADR-000{1..8,12,13}.md` + retro |
| Backup of v1 SKILLs | `~/.claude/scheduled-tasks.v1-backup-20260512-124747/` |

### Smoke-test results (Slice 10)

| # | Test | Result |
|---|---|---|
| 1 | All 10 SKILLs have conventions header + JSONL emissions | PASS |
| 2 | No guMCP refs remain | PASS |
| 3 | tier-overrides.json valid | PASS |
| 4 | events helper round-trip | PASS |
| 5 | Hook fail-closed on bad input | PASS (exit 2) |
| 6 | Scheduler state (watchdog cron updated to `*/15 7-20 * * 1-5`) | PASS |
| 7 | JSONL log healthy (278 events, 6 kinds, 8 blocked_action verified) | PASS |

Hooks have fired in production this session: 8 `blocked_action` records exist for write-side attempts that the guard refused (gmail send, calendar delete, etc.) and 263 `tool_event` records logged.

## What changed in process this round

1. **First-principles research before patching.** Jordan's directive to step out of the "what we've built" frame and audit Anthropic's current stack from zero produced ADR-0006 (official connectors, including the Slack DM-read unlock that guMCP was actively blocking).
2. **Multi-agent parallel reviews.** Architecture, reliability, security, and product/UX critiques landed simultaneously, surfaced contradictions early, and the synthesis ADRs (0008 compliance, 0012 injection, 0013 tier overrides) all trace back to specific reviewer concerns.
3. **Compliance as input, not gate** (ADR-0008). Cut weeks of speculative "ask Legal for an exception" loops out of the timeline.
4. **Execution mode means hours, not weeks** (status.md framing reset). No more multi-phase human calendars for agent work.

## What I'd do differently next project

- **Pre-write the conventions file before building any SKILL.** I went through one round of audit-log boilerplate per SKILL before realizing it belonged at the substrate level (hooks + JSONL). Conventions-first would have saved a wasted pass.
- **Verify substrate compliance before designing for it.** Cloud Routines (original ADR-0002 v1) was a 2-hour design detour because I didn't ask the compliance question first. ADR-0008 should always come before substrate choice.
- **Default to per-file Bash batches when applying mechanical edits across many files.** Per-Edit permission prompts at scale are a UX failure I should have predicted; one bash call with sed/python is the right primitive.
- **Stand up the JSONL log before writing any SKILL that depends on it.** Bootstrap order matters: shared infrastructure first, then consumers.

## Open follow-ups (not blocking v2 operation)

| # | Item | Owner | Trigger |
|---|---|---|---|
| F1 | (REMOVED) Jamie is not a relevant collaborator. Removed from stakeholders.md and project_jordan_org.md. | — | — |
| F2 | (REMOVED) Slack-app/interactive-Block-Kit was a non-need. ADR-0004 revised to typed-thread-reply pattern; no IT dependency. | — | — |
| F3 | Populate Tier 3 external partner contacts (ProcTwo, Paylink, Northwind, BigBank) | Jordan | As-needed |
| F4 | Migrate brief-items.json from JSON to JSONL events fully (currently dual-sourced) | Nova | When `current_md_updated` flow runs reliably for 2 weeks |
| F5 | Add inbox labeling back if/when Gmail official connector exposes a `batch_update` or `update_email` | Nova | Watch Anthropic connector release notes |

## What I want Jordan to do

Nothing required to operate. The next scheduled tick of any routine will execute against v2 automatically. The watchdog will alert to `#nova-alerts` if anything goes silent for >2× cadence.

If something feels off in the first 48 hours, the v1 backup at `~/.claude/scheduled-tasks.v1-backup-20260512-124747/` is one `cp -r` restore away.

## Quote that anchored this round

> "I need this to be done so I can operate Nova... we can't keep going in circles here."
> — Jordan, 2026-05-12

The whole governance pattern (ADRs + reviews + status.md) exists to make "we can't keep going in circles" the structural default, not the rescue request.
