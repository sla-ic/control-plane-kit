# ADR-0018: Email↔project clustering — the connective tissue between the inbox and the roadmap

**Status**: Accepted (Jordan's ask 2026-07-22: "everything is eventually connected to its own cluster or project… start connecting them… build where it adds, reuse where makes sense"; Amp built)
**Date**: 2026-07-22
**Deciders**: Jordan, Amp
**Builds on**: ADR-0014 (cycle-b fleet), ADR-0015 (reversible actuators), ADR-0016 (closed-loop learning), ADR-0017 (split-cadence always-on)
**Relates to**: the `projects` synthesis substrate (`synthesize-projects.js` / `ingest-synthesis.js`) and the planner substrate (`import-planners.js`)

## Context

The email plane and the project/cluster substrate had grown up side by side and **never touched**:

- `email_items` (239 open) carried route/tier/priority/synthesis — but had **zero linkage** to any
  project or cluster. No column, no join table, nothing.
- `projects` (72 real clusters — Northwind Installments, BenefitCo Benefits, Multi-Processor, Contoso PROJs, …) carried the
  synthesis fields that matter for action: `your_move`, `blocker`, `status_synthesis`, `health`.
- `planner_projects` (262) carried the richest *matching* signal: `pcr` / `pcr_all` keys and JSON
  `aliases`.

The consequence: a `needs_you` email could be surfaced, resolved, drafted — but never placed next to
the live blocker of the project it advances. "Jordan decides" items had no cluster context. The
roadmap and the inbox were two disconnected planes. Jordan's directive was to build the bridge and use
it to advance work, reusing the existing substrate rather than inventing a parallel one.

## Decision

**1. The link lives ON `email_items`, not in a new cluster table.**
Add `project_id` (FK → `projects.id`), `project_confidence`, `project_source`, `project_linked_at`.
A message belongs to at most one *primary* cluster; the rare multi-project spillover can become a
join table later without migrating this. We do **not** invent a new "cluster" entity — `projects` is
already the cluster, with the synthesis fields that make a link actionable.

**2. Strongest-signal-first matching, deterministic before LLM** (`cluster-link.js`):
   1. **pcr** (conf 0.95) — a Jira/PROJ key in subject/snippet equal to a project's `pcr`, or a
      planner row's `pcr`/`pcr_all` mapped to its project by normalized name.
   2. **alias** (conf ≤0.92) — a multi-word project alias/name phrase (from `projects.name` +
      `planner_projects.aliases`) appearing verbatim. Single generic tokens are stoplisted
      (`onboarding`, `payments`, `integration`, …) — they were low-precision (matched unrelated PROJs).
   3. **domain** (conf 0.7) — external sender domain → partner project (northwind→Installments, contoso→PROJ,
      benefitco→BenefitCo Benefits, paylink/proctwo/procone→the processor cluster), derived by finding the project
      whose name contains the partner token.
   4. **llm** (conf ≤0.75) — bounded single-call fallback for still-unmatched **actionable** items
      (`needs_you`/`inbox`/unclassified only), choosing from a compact candidate list, prompted to
      prefer `null` over a weak guess.

**2b. PROJ-issue resolution via the local Jira mirror.** A bare `PROJ-XXXX` key that the
`projects`/`planner` `pcr` fields don't cover was landing on the generic per-Jira-project bucket
(`projects` id "PROJ", auto-created by `sync-jira.js`'s `ensureProject`). Fix: before matching,
`resolvePcrClusters()` scans open mail for unplaced PROJ keys and resolves each against the local
`tasks` Jira mirror (`sync-jira.js`) — ground truth for what the issue *is*. It links to an existing
cluster if the PROJ title phrase-matches one, else **ensures a specific per-PROJ cluster**
(`PROJ-XXXX — <title>`, idempotent by `pcr` key) so the email connects to a named unit of work, not a
catch-all. A PROJ issue is its own cluster; `synthesize-projects` can enrich it later. When a key is
absent from the mirror (mirror stale/partial), it is **ingested live** from Jira (company search /
Jira MCP) into `tasks` following `sync-jira`'s row shape, then resolved. PURE-LOCAL except the live
ingest, which is a serial read.

**3. Reuse, do not duplicate.** `norm()` is the exact function from `synthesize-projects.js:31` /
`build-vocab.js`; the PROJ extractor mirrors `needs-you-resolver.js`; the target table is the existing
`projects`; the alias source is the existing `planner_projects`. No new matching vocabulary was
minted.

**4. No fan-out over the shared token** (upholds ADR-0016 / the no-concurrent-mcpgw rule). The
deterministic passes (1–3) are **pure-local** — `email_items` already hold subject/snippet/sender, so
they touch no gateway at all. The LLM fallback uses `llm.claude` (Anthropic-direct), **not** the
shared mcpgw token, and runs **serially**, one item at a time.

## Consequences

- Every open email now resolves to its cluster where the signal exists; `needs-you-resolver` and the
  surface layer can join `email_items → projects` to show an item next to its project's live
  `your_move`/`blocker`. The inbox and the roadmap are one graph.
- Confidence + source are recorded on every link, so a wrong cluster is auditable and `--relink`
  re-evaluates from scratch (clears stale links before re-matching — a null match must *remove* a bad
  link, not leave it).
- **Boundary:** this assigns a *primary* cluster only. Multi-project mail lands on its strongest
  signal; a join table is the documented next step if spillover matters.
- **Runs where:** `cluster-link.js` is deterministic-cheap and belongs on the slow loop after triage
  (so newly-classified items get clustered each beat); the LLM fallback stays opt-in (`--llm`) to
  keep the default beat free.

## Lesson carried forward

Single-token generic project names are false-positive machines (an unrelated PROJ matched
"onboarding"). High-precision clustering requires multi-word phrases or distinctive keys —
verified against real links before persisting, per the ground-truth-before-claiming discipline.
