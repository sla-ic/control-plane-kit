# ADR-0001: Trust Model

**Status**: Accepted (Jordan confirmed 2026-05-12)
**Date**: 2026-05-12
**Deciders**: Jordan, Nova
**Supersedes**: None

## Context

Nova operates with Jordan's credentials across Gmail, Slack, Calendar, Drive, Atlassian. Jordan operates in a high-stakes, high-trust role — irreversible actions taken in his name have outsized consequences (wrong email to a partner, accidentally archived board comm, RSVP-declined to a critical meeting). The trust model must be explicit and enforced in code, not policy docs.

A trust model encoded as natural-language guidance in SKILL.md files is unenforceable. Hooks in `settings.json` are enforceable.

## Decision

The trust model is enforced via synchronous hooks (see ADR-0003) and codified as:

### Hard blocks (hooks reject these unconditionally; require new approved Routine or interactive session to bypass)

| Action | Hook | Rationale |
|--------|------|-----------|
| Send email (any recipient) | `preEmailSend` | Irreversible, reputationally costly |
| Create / modify / delete calendar event | `preCalendarWrite` | Affects Jordan's time + others' time |
| Send / decline / tentatively-accept RSVP | `preCalendarRsvp` | Same as above |
| Delete anything (email, calendar, file) | `preDelete` | Almost always irreversible |
| Modify file/folder permissions in Drive | `preDrivePermissions` | Security boundary |
| Post to public Slack channel outside whitelist (`#nova-brief`, `#nova-alerts`, `#nova-brief-staging`) | `preSlackMessage` | Limits public-facing accidental posts |

### Soft warnings (hooks log + flag, do not block)

| Action | Behavior |
|--------|----------|
| Send Slack DM to a non-Tier-1 person | Log; allowed (Nova is Jordan's CoS, DMs are part of the job) |
| Draft contains PII patterns (SSN, credit card numbers, customer IDs) | Mask in audit log, allow draft to proceed |
| Draft to 10+ recipients | Log as `large_recipient_draft`, allow |
| Auto-archive of inbox item from a Tier 1 stakeholder | BLOCKED (treat as hard block — promote to hard) |
| Auto-archive of obvious noise (newsletter, no-reply, calendar bot) | Allowed |
| Label / move within inbox (reversible Gmail operations) | Allowed |

### Permitted autonomous actions

1. **Read anything** Jordan has granted access to (Gmail, Slack incl DMs, Calendar, Drive, Glean, Atlassian).
2. **Create drafts** (Gmail Drafts, never sent). Each draft posts a preview link to `#nova-brief` with an approve button.
3. **Apply Gmail labels** (reversible).
4. **Archive non-Tier-1 automated noise** per inbox triage rules.
5. **Post to Slack whitelist channels** + Jordan's DM.
6. **Update local files** in `/Users/you/Desktop/nova/` workspace.
7. **Write JSONL audit log** entries.

### Attribution

Every Slack post and Drive comment authored by Nova appends `[Amp, on behalf of Jordan]`. Already in user memory; reaffirmed here.

## Consequences

### Positive
- Irreversible actions are gated by code, not vigilance.
- Audit log records every blocked attempt — useful signal if Nova is "trying" to do the wrong thing.
- Easy to reason about: "Nova cannot send. Nova cannot delete. Nova cannot change my calendar."

### Negative
- Jordan must approve every email send. Drafting + posting preview adds friction vs. fully autonomous send.
- A real emergency where Nova would benefit from sending a quick "running 5 min late" email — still blocked. Jordan sends it.
- Hook misconfiguration could falsely block legitimate Routine operations. Mitigation: Phase 0 gate tests hooks explicitly.

## Alternatives considered

1. **Trust-by-prompt-policy** — Document the rules in SKILL.md and rely on the model to follow them. Rejected: prompt injection, model variance, no enforcement, unauditable.
2. **Per-action allowlist with override token** — Jordan issues a one-time token to permit a specific send. Rejected: friction too high for everyday use.
3. **Tiered trust by recipient/channel** — More permissive for internal Acme, locked down externally. Rejected for v2 (complexity); revisit if needed.

## References

- PLAN.md §2 Goals, §8 Risks
- ADR-0003: Observability (defines hook mechanism)
- MEMORY.md "Attribution Rule"
