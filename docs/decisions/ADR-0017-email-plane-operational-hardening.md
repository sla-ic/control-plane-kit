# ADR-0017: Email-plane operational hardening — split-cadence always-on, isolation, and loud failure

**Status**: Accepted (Jordan approved the design 2026-07-22: split-cadence + dashboard/#amp-brief; Amp built + iterated)
**Date**: 2026-07-22
**Deciders**: Jordan, Amp
**Amends**: ADR-0014 (cycle-b fleet + actuators) — makes per-worker isolation + step timeouts a substrate requirement
**Relates to**: ADR-0015 (reversible inbox actuators), ADR-0016 (closed-loop learning), ADR-0012 (prompt-injection), ADR-0001 (the floor)
**Supersedes the open items in**: `docs/ops/email-plane-remediation.md`; specced in `docs/ops/email-loop-closure-spec.md`

## Context

The email plane (ADR-0014/0015/0016) was architecturally autonomous but the *loop did not close on
its own* and it was not honestly always-on:

- **Silent death.** A single hung LLM call once wedged the whole serial cycle-b chain for days
  (remediation P0-1). `read_emails` — the *only* headless inbox enumerator (mcpgw exposes no
  `search`/`search_threads`; the gmail-labels native server is unreachable headless) — would return
  `isError` and `email-triage` would `process.exit(1)`, killing every downstream worker.
- **Last mile open.** `label-sync.js` (routes → real Gmail labels) existed but was never scheduled,
  so DB verdicts never reached Gmail. 36 needs-you resolutions sat `proposed`, unseen.
- **No heartbeat.** Sync was 33h stale, two workers silent 27h, 4 `fleet_runs` rows orphaned at
  `running` forever — and *nothing said so*. The outage was invisible.
- **Cadence, not constancy.** cycle-b fires 4×/day under launchd; sleep-coalescing collapsed missed
  slots into bursts. "Always-on" was aspirational.

Jordan's ask (2026-07-22): *tighter always-on, full loop closed*, without getting distracted on
cadence alone. Approved design decisions: **split-cadence** (a cheap fast path + a gated slow path,
to protect the single shared mcpgw token — the congestion-stall taxonomy) and **surface = dashboard
+ #amp-brief digest**.

## Decision

### 1. Split-cadence, mutex-serialized (protects the shared token)
- **Fast loop** (`cycle-fast.sh`, `com.example.amp-fast`, `StartInterval` 900s, `RunAtLoad`): NO-LLM
  last-mile work only — `reap-orphans` → `label-sync` (additive/reversible) → deduped health alarm →
  `last_fast_tick_at` stamp.
- **Slow loop** (`cycle-b.sh`, 4×/day): all token-heavy LLM workers (triage, needs-you, adjudicate,
  gemini, sweep) + the once-a-day full digest + snapshot.
- **One shared mutex** (`state/locks/cycle.lock`, atomic `mkdir`): the two loops never hit the
  gateway concurrently. `run_step` `touch`-refreshes the lock mtime after every step, so the steal
  threshold need only exceed the longest *single* step budget (1200s), not the whole-chain runtime —
  a healthy long slow run cannot have its lock stolen mid-flight; a truly hung cycle is reclaimed
  30m after its last completed step.

### 2. Per-worker isolation + step timeouts are a substrate requirement (amends ADR-0014)
Every worker runs under `run_step`, a shell-native wall-clock watchdog (macOS has no `timeout`):
background → SIGTERM→SIGKILL past budget → always return 0. **No single step can wedge the chain.**
`llm.js` has an independent body-read timeout (defense in depth). This is now mandatory for any
worker added to either cycle, not an optional nicety.

### 3. Graceful degradation, never silent exit
A sync failure no longer kills the worker: it retries (`readInboxWithRetry`, 6× backoff+jitter),
then degrades — emits `gateway_timeout`, runs the `--refresh` salvage pass, records `degraded`, and
does **not** stamp `last_email_sync_at` (so the staleness heartbeat stays truthful). needs-you gets
item-level `withRetry` around its decompose call so one gateway blip doesn't drop the item; a
`FloorViolation` is never retried.

### 4. Failure is loud (heartbeat + on-problem alarm)
- `reap-orphans` marks `running` rows stuck past 120m (>> any step budget) as `crashed`, at the top
  of both loops, so the health rollup reflects reality.
- `surface-digest --alert-only` runs on the **fast** cadence: computes health flags (sync stale,
  worker silent/crashed, fast-loop itself stalled) and posts a **deduped** alarm to #amp-alerts —
  only when the problem-set changes or the same alarm is unacked past `AMP_ALERT_REPEAT_HOURS`. A new
  outage is loud within ~15 min, with no spam.
- The full daily digest (ready drafts + proposed needs-you + proposed sweeps + health) posts once/day
  to #amp-brief, idempotent per `last_digest_date`.

### 5. The always-on boundary (explicit tradeoff)
The fast loop does **not** sync or route new mail — both are LLM/gateway-heavy and stay slow. So
"always-on" means *labels + health feel prompt*, **not** *new inbound mail is triaged within
minutes*. New mail is routed at the next slow run (≤ the 4×/day gap). This is a deliberate anti-melt
choice, not an oversight; a future cheap deterministic enumerate-only fast sync could shrink the
blind window without adding LLM load.

## Invariants preserved
The seam (workers meet only at `tasks.db` + `routines.jsonl`), the dual-point floor (selftest 26/26;
no new floor-denied op — the only egress is the whitelisted Slack post via floor-gated `slackCall`),
prompt-injection containment (labels/digest chosen from metadata + verdict, never body text),
reversibility (`label-sync` add-only; reap sets a recoverable status; permanent `delete_*` still
hard-denied), and send-stays-human-gated (drafts only; no auto-send).

## Consequences
- **Positive:** the loop closes on its own; outages are visible within minutes; the shared token is
  protected; no step can wedge the chain; orphaned runs self-heal.
- **Cost:** new-mail triage latency is bounded by the slow cadence (the boundary in §5). The fast
  loop adds modest bounded gateway load (label-sync `--limit`, no LLM).
- **Follow-ups:** off-machine snapshot automation (Phase 3.1) is **done** — the earlier "needs Full
  Disk Access" claim was wrong. `snapshot-to-git.sh` was rewritten to push from a dedicated bare
  object store at `~/.local/share/amp-tasks/state-git` (NOT TCC-protected), so it never touches
  `~/Documents` and needs no FDA; osxkeychain creds are reachable because both cycles run in the
  `gui/$UID` launchd domain. It runs unattended as a watchdog-wrapped step in `cycle-b`, chaining each
  snapshot onto the fetched `amp-state` parent (fast-forward, audit history preserved). Phase 3.2 is
  closed too: `snapshot-to-git.sh` stamps `last_amp_state_push_at` only after a confirmed push, and
  `surface-digest` health flags `amp-state` staleness > 48h. A deterministic fast-sync (§5) remains a
  candidate if the blind window proves too wide.

## Amendment 2026-07-23 — whole-chain deadline (fast-loop starvation defect)

The mutex steal-safety assumed a failed lock-holder goes *stale* (mtime unrefreshed) and gets stolen
after `LOCK_MAX_AGE_MIN` (30m). Observed defect: a holder that is **alive but pathologically slow**
never goes stale. On 2026-07-23 one `cycle-b` ran **4h47m** — its 17 gateway-bound steps each crawled
under (but within) their per-step budgets against a slow shared token, and `run_step`'s post-step
`touch "$LOCK_DIR"` kept the lock's mtime fresh the whole time. So `cycle-fast`'s stale-steal never
fired, and the 15-min NO-LLM last mile — the entire point of the split cadence — went **dark ~12h**
(`last_fast_tick_at` frozen at 04:07Z; health alert fired correctly at 01:31 then self-suppressed as
"unchanged within 4h"). The per-step watchdog bounds a single *hang*; nothing bounded total *chain*
runtime.

**Fix:** a whole-chain deadline in `cycle-b` (`CHAIN_MAX_MIN`, default **25m**, env-tunable). At the
top of every `run_step`, if elapsed chain time ≥ the cap, the step is skipped (chain yields and its
EXIT trap frees the lock). The cap sits **below** the 30m steal threshold, so `cycle-b` releases the
lock *voluntarily* before `cycle-fast` would ever steal it — the anti-melt "never two gateway hitters
at once" invariant (§2.3) is preserved, and fast starvation is now bounded by `CHAIN_MAX_MIN`, not by
the slow chain's worst case. The chain is idempotent, so skipped tail steps resume next beat;
`label-sync` is step 5 (early), so the last-mile substrate stays fresh — only reporting/backup tail
steps (digest, git-snapshot) can slip a beat on a pathological day. Live stuck run was terminated,
lock cleared, fast tick confirmed recovered (`last_fast_tick_at` 16:03Z).

**Related finding:** the runtime worker code *is* mirrored in SSOT at `apps/amp-tasks/`, but the
runtime→SSOT sync is **manual, not automated** — `snapshot-to-git.sh` pushes only the `tasks.db` dump
to the `amp-state` branch, never the code. So the mirror silently drifts: this session `cycle-b.sh`
had drifted (SSOT copy predated the deadline fix above) and 4 manual tools were never mirrored — all
synced this session. Follow-up: add a code-snapshot step to `snapshot-to-git.sh` (or a pre-commit
sync) so the mirror can't drift unnoticed.
