# ADR-0013: Tier Overrides for Specific Stakeholders

**Status**: Accepted
**Date**: 2026-05-12
**Deciders**: Jordan, Nova
**Driven by**: Product/UX review (2026-05-12) — "Tier inference from DM frequency is wrong for execs whose every comm matters."

## Context

The weekly `nova-stakeholder-rebuild` Routine infers tiers from communication frequency: ≥5 interactions/week → Tier 1; 2–4 → Tier 2; <2 → not tracked. This is right on average but wrong for specific cases:

- **DK** (Morgan Lee) is Jordan's direct manager. Comm frequency may dip in any given week (heads-down week, OOO, async style), but every ping from DK is Tier 1 regardless.
- **Alex Chen** is the skip-level. He pings rarely; every ping is critical.
- **External partners** (ProcTwo contact, key Paylink contact) may ping infrequently but warrant Tier 1 routing when they do.

Inference-only tiering misses these.

## Decision

A tier-override config sits at `/Users/you/Desktop/nova/inbox-system/tier-overrides.json`. It is the highest-priority signal — the weekly rebuild must not downgrade anyone listed there.

### Format

```json
{
  "version": 1,
  "overrides": [
    {
      "identifier": "manager@example.com",
      "slack_id": "U0MANAGER01",
      "tier": 1,
      "reason": "Direct manager. Tier 1 regardless of frequency.",
      "added_by": "jordan",
      "added_iso": "2026-05-12"
    },
    {
      "identifier": "exec@example.com",
      "slack_id": "U0EXEC0001",
      "tier": 1,
      "reason": "Skip-level SVP. Tier 1 regardless of frequency.",
      "added_by": "jordan",
      "added_iso": "2026-05-12"
    }
  ]
}
```

`identifier` is the canonical key (email by default). `slack_id` enables Slack-side matching. Either may be missing if not applicable; at least one must be present.

### Apply rules

1. **nova-stakeholder-rebuild** loads `tier-overrides.json` BEFORE writing the rebuilt `stakeholders.md`. Anyone in overrides is force-placed in their declared tier; their `Notes` cell is set to the override `reason`, wrapped in `MANUAL-START / MANUAL-END` markers so future rebuilds preserve it.

2. **nova-slack-sweep** treats overrides as a static allowlist for "Tier 1 always-ping", in addition to the dynamic list from `stakeholders.md`.

3. **nova-inbox-triage** treats any email `from:` an override-Tier-1 identifier as automatic `⚡ Needs You`, regardless of subject heuristics.

4. **nova-morning-brief** + **nova-eod-brief** sort/highlight override-Tier-1 items first.

### Mutation

Tier overrides are edited only by Jordan (or by Nova with explicit Jordan approval recorded as a `tier_override_changed` JSONL event). The weekly rebuild is read-only against this file.

## Consequences

### Positive
- DK and John can never silently drop out of Tier 1 during a quiet week.
- Architecture matches product/UX reviewer's stated concern.
- Auditable: every override has reason + added_by + added_iso.

### Negative
- One more file to maintain. Mitigation: small (single-digit entries expected).
- If Jordan forgets a key relationship, the override file won't add them; falls back to frequency. Acceptable — overrides are for the exceptions, not the bulk.

## Initial state (Slice 8 seed)

DK and Alex Chen. Slack IDs are from Slice 7 (see `stakeholders.md` row entries).

## References
- `/Users/you/Desktop/nova/inbox-system/stakeholders.md`
- `/Users/you/Desktop/nova/projects/nova-v2-migration/reviews/2026-05-12-review-product-ux.md`
- `~/.claude/projects/-Users-you/memory/project_jordan_org.md`
