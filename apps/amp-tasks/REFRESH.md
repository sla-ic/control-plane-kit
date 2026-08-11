# Planner self-update — how the surfaces stay current

The Payments & Experience planner surfaces render from `planner_projects` (the canonical
join entity) enriched with a macro-roadmap layer: best name, aliases, theme/OKR/
quarter, live Jira status, a status narrative, and doc links. This is what pre-loads
in the drawer when you click a project.

## The pipeline

```
sources ──scouts──▶ seed/_enrich_{payments,experience}.json ──merge──▶ seed/projects-enrich.json ──import──▶ local DB ──deploy──▶ runtime
 decks (Desktop/Downloads/Drive)        (per-org, MERGED not replaced)      (build-vocab + merge-enrich)   (import-planners.js)   (rsync + kickstart)
 jira  (live status, ≤4-key batches)
 slack (planning channels)
 docs  (Confluence ERD / Drive PRD)
```

- **`build-vocab.js`** → `seed/vocab.json`: dedups `planner_projects` to canonical
  keys per org + the sheet-legend / feature / Jira alias candidates. Read-only.
- **`planner-refresh` workflow** (`~/.claude/workflows/planner-refresh.js`): 4 read-only
  source scouts → 2 per-org synth agents. Synth **merges into** prior enrichment —
  it never blanks a populated field, so a thin run can't regress the rich data.
- **`merge-enrich.js`** → `seed/projects-enrich.json`: injects `org`, concatenates.
- **`import-planners.js`**: reseeds `planner_*` and merges enrichment by `(org,key)`.
- **`refresh-planners.sh`**: the deterministic tail (build-vocab → merge → import →
  rsync deploy → `launchctl kickstart`). Run standalone to redeploy the current seed.

## What is and isn't automatic (honest model)

- **Scheduled** (`planner-refresh` task, Mondays 07:12 local): runs the whole pipeline.
  It only fires while this app is open; if closed at fire time it runs on next launch.
- **Not magic-live.** The surface does not stream from meetings/Slack in real time.
  It re-aligns on the weekly tick (or on demand). Between ticks the drawer shows the
  last synthesized state.
- **Headless caveat.** Interactively-authenticated MCPs (Slack/Jira/Drive/Confluence
  via mcpgw) may be **absent** in a background/cron run. When a source is missing the
  scout returns empty and synth preserves prior data — the surface stays consistent but
  that source contributes nothing that week. For a deep re-alignment, run the workflow
  **interactively** (MCPs authenticated): invoke Workflow `planner-refresh`, then
  `bash refresh-planners.sh`.

## Manual refresh

```bash
cd apps/amp-tasks
# deep (re-reads all sources): run the workflow interactively, then:
bash refresh-planners.sh
# light (redeploy current seed only):
bash refresh-planners.sh
```

## Guardrails

Enrichment reads are sensor work (allowed). All writes are LOCAL: repo `seed/` + the
local DB at `~/.local/share/amp-tasks/tasks.db`. Nothing is ever written back to shared
Jira/Confluence/Slack/email/Drive. No PII (emails, user IDs, person names as data) in
any seed file.
