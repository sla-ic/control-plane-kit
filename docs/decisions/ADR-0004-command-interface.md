# ADR-0004: Command Interface — Per-Message Thread Replies (Typed Commands)

**Status**: Accepted (rev. 2026-05-12 — supersedes the prior Proposed "Slack Workflows + interactive Block Kit" framing)
**Date**: 2026-05-12
**Deciders**: Jordan, Nova

## Context

Nova surfaces items to Jordan in `#nova-brief` and needs a way for Jordan to act on each item (draft a reply, snooze, ack, apply a current.md update, etc.) without leaving Slack.

The earlier draft of this ADR proposed **interactive Block Kit** — buttons with `block_id` routing — driven by a registered Slack app whose request URL receives click events. That design required Acme IT to approve a personal Slack app for the workspace. Jordan has correctly pushed back: we are not asking IT for anything. The architecture must work with the access Nova already has via the official Anthropic Slack connector.

## Decision

Command interface is **per-message-per-item, typed thread replies**.

### How it works

1. **nova-morning-brief** (and nova-eod-brief, nova-inbox-triage on high-priority arrivals) posts each surfaced item as a **separate Slack message** to `#nova-brief`. One item = one parent `ts`.
2. Each message body ends with a one-line command hint: `Reply: draft · snooze 3d · ack · more · tone <x>` (and for current.md proposals: `apply · edit <text>`).
3. **nova-slack-commands** polls `#nova-brief` every 3 min during work hours. For each parent message Nova posted, it reads thread replies from Jordan, parses the first whitespace-delimited token as the command, executes the action, and posts a confirmation in the thread.
4. State binding: parent `ts` → item metadata, stored in `brief-items.json` AND emitted as `inbox_item_surfaced` JSONL events (dual-sourced per Slice 6).
5. Idempotency: each processed reply `ts` is recorded in `slack-commands-processed.json`; a fallback consults `nova-events.sh recent --kind draft_created` to avoid double-action if the file is missing.

### Why this is the right shape

- **Zero IT dependency.** Reads, sends, and Block Kit *formatting* (bold/sections/links/code blocks) all work via the official connector with the access Jordan already has.
- **One message per item maps cleanly to thread-as-action-scope.** Any reply Jordan types is unambiguously about that item — no `block_id` lookup needed.
- **Already implemented end-to-end** in v1 and verified to work in production. The "fix" requested in Slice 6 was the routing decision (per-message vs per-block), not a re-implementation.
- **Typed commands are fast.** "draft" is fewer keystrokes than navigating to a clickable button on mobile, and Jordan already lives in Slack.

### Available commands (current set)

| Command | Effect |
|---|---|
| `draft` | Generate a Gmail draft reply for the email associated with this item. |
| `snooze <Nd|Nh|Nw>` | Hide from briefs until N days/hours/weeks from now. |
| `ack` | Dismiss this item — no further surfacing. |
| `more` | Fetch additional context (full email body, related thread, related Jira, recent shared Slack history with sender). |
| `tone <descriptor>` | Re-draft the currently staged draft with a different tone (e.g., `tone warmer`, `tone tighter`). |
| `apply` | Accept a proposed `current.md` update from nova-eod-brief. |
| `edit <text>` | Revise a proposed current.md update with Jordan's inline text. |

Commands evolve. Adding one is: a parser branch in nova-slack-commands SKILL.md + a hint line in the SKILL that posts the item.

## Consequences

### Positive
- Compliance-aligned (ADR-0008): no new app registration, no IT touchpoint, no third-party processor.
- Works today. Already in production for `draft / snooze / ack / more / tone`.
- Extensible: new commands are pure SKILL.md edits — no infrastructure change.
- Audit trail: every action is a JSONL event (`draft_created`, `item_snoozed`, `item_acked`, `current_md_updated`).

### Negative
- Slightly more typing than tapping a button. Acceptable — Jordan types fast and the words are short.
- A typo in a command (`drft`) is parsed as unknown; Nova posts `⚠️ unknown command "drft" — did you mean draft?` and moves on. Mitigation: fuzzy-match common typos in the SKILL.
- Bots posting in `#nova-brief` could be misread as Nova messages if Nova's `ts` matching is sloppy. Mitigation: nova-slack-commands matches only against parents whose `user` is Jordan's bot identity AND whose `ts` is recorded in `brief-items.json`.

## What this ADR does NOT close off

If at some future point Jordan wants clickable buttons enough to justify a Slack-app registration through normal Acme IT channels (not as an exception), interactive Block Kit can layer on top of this design without breaking it — the `block_id` becomes an additional routing key alongside the parent `ts`. Until and unless Jordan asks for that, we don't pursue it. No follow-up task, no waiting.

## References

- ADR-0008 (compliance — no new processors, no exception process)
- Slice 6 of `status.md` (routing decision codified)
- `~/.claude/scheduled-tasks/nova-slack-commands/SKILL.md` (the actual implementation)
- `~/.claude/scheduled-tasks/nova-morning-brief/SKILL.md`, `nova-eod-brief/SKILL.md` (the post-side)
