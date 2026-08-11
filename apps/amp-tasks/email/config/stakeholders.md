# Stakeholders — Tier Map

> **EXAMPLE config.** Source of truth for who matters to the principal and how. Consumed by
> the email plane (`email-triage.js`) to weight priority and tune drafts. Tier assignments are
> load-bearing; `tier-overrides.json` supplies runtime overrides that the weekly auto-rebuild
> never downgrades. Manual edits between the `<!-- MANUAL-START -->` / `<!-- MANUAL-END -->`
> markers are authoritative. Replace the rows below with your real stakeholders.

## Tier 1 — Daily (treat as priority signal)

| Name | Role | Email | Slack ID | Cadence | Notes |
|------|------|-------|----------|---------|-------|
| Morgan Lee | <!-- MANUAL-START -->**Manager** (direct)<!-- MANUAL-END --> | manager@example.com | U0MANAGER01 | 1:1 weekly | <!-- MANUAL-START -->Highest-priority signal — surface at top of Needs You.<!-- MANUAL-END --> |
| Alex Chen | <!-- MANUAL-START -->**Skip-level** (VP)<!-- MANUAL-END --> | exec@example.com | U0EXEC0001 | As-needed | <!-- MANUAL-START -->Skip-level — surface any direct comm immediately.<!-- MANUAL-END --> |
| Sam Patel | <!-- MANUAL-START -->Peer / collaborator<!-- MANUAL-END --> | peer@example.com | U0PEER0001 | Frequent | <!-- MANUAL-START -->Surface promptly.<!-- MANUAL-END --> |
| Chris Diaz | Direct collaborator | collab@example.com | U0COLLAB01 | Frequent | |
| Robin Park | 1:1 partner | partner@example.com | U0PARTNER1 | Bi-weekly 1:1 | |

## Tier 2 — Weekly (surface when stale)

_Manual list — add rows here as recurring collaborators emerge._

## Tier 3 — External / partners (track separately)

| Org | Primary contact | Context |
|-----|-----------------|---------|
| Contoso | _TBD_ | Key external partner |
| ProcOne | _TBD_ | Vendor / processor |
| Northwind | _TBD_ | Partnership |
