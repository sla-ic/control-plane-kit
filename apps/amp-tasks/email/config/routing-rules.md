# Inbox Routing Rules — Source of Truth

> **EXAMPLE config.** Read by the email plane (`email-triage.js`). Edit here, not in the routine
> prompts. Only the routing logic, label map, stakeholder-ping tiers, and voice/draft layer are
> consumed at runtime. Replace the label IDs and rules with your own once your mail is connected.

## Gmail label IDs

| Label | ID | Meaning |
|-------|-----|---------|
| ⚡ Needs You | Label_3 | The principal must act |
| 👀 FYI | Label_4 | Informational, archived |
| 📅 Calendar | Label_5 | Meeting invites, archived |
| 📊 Automated | Label_6 | Monitoring/digests, archived |
| 🤝 External | Label_7 | Non-colleague humans, kept in inbox |
| Business Critical | Label_1 | Principal's manual flag — never touch |
| Suspicious ⚑ | Label_2 | Principal's manual flag — never touch |

## Routing logic (apply in order, first match wins)

1. **Manual flags win.** If a thread carries `Business Critical` or `Suspicious ⚑`, leave it
   exactly as-is. Never relabel, archive, or draft on it.
2. **Tier-1 stakeholder** (see `stakeholders.md`) → `⚡ Needs You`, surface at top.
3. **Direct question / explicit ask to the principal** → `⚡ Needs You`.
4. **Calendar invite** → `📅 Calendar`, archive.
5. **Automated digest / monitoring / newsletter** → `📊 Automated`, archive.
6. **External human, no ask** → `🤝 External`, keep in inbox.
7. **Everything else informational** → `👀 FYI`, archive.

## Actuator boundary

Labeling, archiving, and moving are **reversible** and run autonomously (ADR-0015). Sending,
forwarding, and permanent deletion are **outward/irreversible** and stay gated to the principal —
the agent drafts, it does not send. See the [floor](../../../../docs/policy/floor.md).

## Protected senders

Never archive or trash mail from senders on the protect list (e.g. your meeting-notes archiver,
`meeting-notes@example.com`) — downstream automation depends on those staying in place.
