# ADR-0019: The deploy contract — git provably reflects what is deployed and running

**Status**: Accepted (Jordan's ask 2026-07-27, verbatim: "everytime you end a session git should be corrected… HOW DO I EVEN KNOW WHAT THE FUCK IS WORKING AND DEPLOYED SINCE LITERALLY MY WHOLE GIT IS A MESS")
**Date**: 2026-07-27
**Deciders**: Jordan, Amp
**Builds on**: ADR-0009 (amp-state snapshot branch — DB dumps only, never code)
**Relates to**: `harness/claude-code/amp-git-sync.sh`, `apps/amp-tasks/` (SSOT mirror), `~/.local/share/amp-tasks` (runtime)

## Context

Two copies of the amp-tasks code existed with **no canonical direction between them**:

- **Runtime** — `~/.local/share/amp-tasks`, the tree launchd actually runs.
- **SSOT mirror** — `apps/amp-tasks/`, the tree under version control.

Sync was manual (`cp` after edits) and inconsistent. Code was sometimes edited in the runtime and
copied back late or never; `snapshot-to-git.sh` (ADR-0009) only ever pushed the **DB dump** to the
`amp-state` branch, never the code. The result: the working tree drifted from what was deployed, git
fell silently behind, and "what does git say" stopped answering "what is running." Jordan opened his
branch view, saw divergence he didn't cause, and could not tell what was live. Correctly, he blamed
the absence of a contract — not any one commit.

Two things in the branch view were *not* bugs and must stay: `main` (canonical) and `amp-state`
(intentional isolated DB-snapshot ref, ADR-0009). The dead `feature/surface-palette-p0s` branch was
deleted.

## Decision

**1. SSOT is canonical; the runtime is a deploy target, never hand-edited.**
All code edits happen in `apps/amp-tasks/`. The runtime receives them via a one-directional deploy.
This kills the "which side is truth?" ambiguity that caused the drift.

**2. `amp-git-sync.sh` is the single tool that enforces the contract.** Three modes:
- **default** — detect drift, commit + push any uncommitted SSOT changes, print one honest status
  line (`[branch] clean|DIRTY | ahead:N behind:M | deploy:runtime==SSOT|RUNTIME-DRIFT`).
- `--check` — report only; exit 1 if dirty or drifted. (Use in CI / pre-flight.)
- `--deploy` — copy exactly the git-**tracked** files SSOT → runtime. Respects `.gitignore` by
  construction, so DB dumps, logs, and `state/*-pull.json` runtime state are never clobbered.

**3. Drift detection is content-level and `.gitignore`-aware.** It compares each git-tracked file to
its runtime twin with `cmp` (byte content), **not** mtime — so a copy or `touch` no longer shows as
false drift (the trap that first masked the real `.gitignore` drift). It also flags deployed-but-
untracked code (`*.js`/`*.sh`/`*.py` present in runtime but absent from SSOT) — i.e. code running
that was never committed.

**4. It only ever ADDS commits.** Never deletes, force-pushes, or auto-resolves a *real* runtime↔SSOT
drift. A genuine content conflict is reported loudly for a human to adjudicate which side is truth;
the tool refuses to guess.

**5. Enforced at session end.** Registered as a `SessionEnd` hook in `~/.claude/settings.json`
(30 s timeout for the network push). Every session now ends with git committed, pushed, and a status
line proving deploy parity — satisfying "everytime you end a session git should be corrected."

## Consequences

- **The branch view is now trustworthy.** `main` == working tree == remote == deployed, verifiable in
  one command (`amp-git-sync.sh --check`).
- Runtime state (DB, logs, pull-cache) stays local and gitignored; only code + config are tracked.
- The `amp-state` DB-snapshot branch (ADR-0009) is untouched and remains the correct home for DB
  dumps. This ADR governs **code**; ADR-0009 governs **data**.
- Manual runtime↔SSOT sync (previously noted in memory as the drift disease) is superseded: use
  `--deploy`, never hand-copy.
- If a future harness replaces Claude Code, the `SessionEnd` registration is the swappable seam
  (harness-map §A2); the enforcement logic in `amp-git-sync.sh` is portable.
