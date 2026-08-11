# ADR-0006: Connectors — Official Anthropic MCP, Deprecate guMCP

**Status**: Proposed
**Date**: 2026-05-12
**Deciders**: Jordan, Nova
**Supersedes**: Implicit Nova v1 choice (every SKILL.md hardcoded `mcp__*-guMCP-server__*`)

## Context

Nova v1 uses guMCP-prefixed MCP servers for Gmail, Slack, Calendar, Drive. These are third-party (guMCP project) implementations. Official Anthropic-curated connectors for all four services have been granted to Jordan's workspace this entire time but were never used.

The discovery that prompted this ADR: hours of v1 patching today rescoped routines around a missing `im:history` scope on the guMCP Slack server. The official Anthropic Slack connector **does support DM reads** (`slack_read_channel` with user_id as channel_id, confirmed via tool schema). Half of that rescoping work was solving a problem that doesn't exist with the right connector.

Beyond DM access:

- Official connectors have stronger uptime/maintenance commitments than third-party.
- Tool schemas are clearer (e.g., official `slack_search_public_and_private` documents date filters, sort options, content_types explicitly).
- Less bus-factor risk on a single GitHub project.

## Decision

Nova v2 uses **official Anthropic MCP connectors exclusively** for first-party integrations:

| Service | Connector ID prefix | Notes |
|---------|---------------------|-------|
| Slack | `mcp__slack-search__slack_*` | DM reads supported |
| Gmail | `mcp__gmail-labels__*` | search_threads, get_thread, list_labels, create_draft |
| Google Calendar | `mcp__gcal__*` | list_events, create_event, etc. |
| Google Drive | `mcp__gdrive__*` | read_file_content, search_files |
| Atlassian (Jira + Confluence) | `mcp__atlassian__*` | searchJiraIssuesUsingJql, getJiraIssue |
| Glean | `mcp__search-index__*` | search, read_document |

guMCP servers are no longer referenced in any v2 Skill or Routine. Phase 6 cutover archives v1 SKILL.md files; future maintenance ignores them.

### Capability unlocks vs v1

- **Slack DM reads** — first-class signal in stakeholder rebuild (DM frequency beats Gmail+calendar for tier inference), in commitment tracker (verbal commitments often live in DMs), in 1:1 prep (DM history with the partner since last 1:1 is the highest-value context I had stripped out).
- **Slack search across all conversation types** — `slack_search_public_and_private` with `channel_types=im,mpim` enables DM @mention surfacing in slack-sweep.
- **Gmail search via `search_threads`** with full Gmail query syntax (operators, labels, dates) — cleaner than v1's `read_emails` wrapper.

### Capabilities lost vs v1 (verify in Phase 0)

guMCP's Gmail exposed more verbs (archive, batch_update, send_email, get_attachment, etc.). Official Anthropic Gmail exposes: search_threads, get_thread, list_labels, list_drafts, create_draft, create/update/delete_label. **Missing:** archive (use label removal as workaround), batch_update (call individual updates), send_email (blocked by Trust Model anyway per ADR-0001 — drafts only).

Phase 0 includes a capability smoke-test: enumerate every Skill's tool dependencies, verify each against official connector schemas, document workarounds for any gaps in an ADR-0006 addendum.

## Consequences

### Positive
- DM signal unlocked across stakeholder rebuild, commitment tracking, 1:1 prep.
- Better-supported tooling, less bus-factor risk.
- Cleaner schemas, better introspection.

### Negative
- Some verb gaps to work around (archive → label removal; batch ops → loop).
- Re-validating every connector dependency adds Phase 0 work.

## Alternatives considered

1. **Mix: official for Slack (DM unlock), guMCP for Gmail (more verbs)** — Adds inconsistency; some Skills would call both. Rejected unless Phase 0 smoke-test reveals a hard blocker.
2. **Stay on guMCP** — Forfeits the DM signal that's central to a CoS system. Rejected.

## References

- ADR-0001 (trust model — official connectors enforce same boundaries)
- PLAN.md §5 Phase 0 capability smoke-test, §8 risk: rate limit differences
