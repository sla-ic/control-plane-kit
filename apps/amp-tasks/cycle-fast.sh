#!/bin/zsh -l
# cycle-fast.sh — the FAST, cheap, always-on path of the split-cadence email loop
# (ADR-0016). Runs under launchd (com.example.amp-fast) on a short StartInterval
# (~900s) with RunAtLoad, so sleep windows don't drop a whole day of ticks.
#
# DESIGN: the full pipeline (drafts, needs-you, adjudicate, sweep) is token-heavy
# and stays in the SLOW loop (cycle-b.sh, 4×/day). The fast loop does the cheap
# last-mile work that must feel prompt, PLUS one gated exception:
#   1. reap-orphans      — clear stale 'running' fleet_runs so health is truthful
#   1b. catch-up sync    — GATED: only runs email-triage if the last clean sync is
#                          older than AMP_SYNC_CATCHUP_MIN (default 5h). This makes
#                          mail freshness depend on the fast loop (RunAtLoad + 15m,
#                          reliable) instead of cycle-b's launchd calendar (which a
#                          sleeping laptop coalesces). In the common case it's a
#                          single sqlite read + skip, so the fast path stays cheap.
#   2. label-sync        — push already-computed email_items.route → real Gmail
#                          labels (additive/reversible, idempotent, no LLM)
#   3. health-alarm      — deduped on-problem alert (rides the 15-min cadence)
# The daily #amp-brief digest + off-machine snapshot lives in the slow loop; the
# dashboard (:3737) is the live surface between ticks.
#
# MUTEX: fast and slow share ONE lock (state/locks/cycle.lock) so they never both
# hit the gateway in the same window (spec 2.3). If the slow loop is running, the
# fast tick skips this round rather than contend for the shared token.
#
# PATH DISCIPLINE: everything under ~/.local/share (launchd has no FDA to ~/Documents).
#
# NB: deliberately NO `set -e`. run_step swallows worker failures (returns 0) and
# the prelude guards its own criticals explicitly; a stray non-zero in the lock/
# floor prelude must NOT silently abort a whole tick (that is the prior-outage
# failure class).
cd "$(dirname "$0")" || exit 1
NODE=/opt/homebrew/bin/node

# ── shared mutex (atomic mkdir; steal only if truly stale) ──────────────────
# The lock's mtime is refreshed (touch) after every step by run_step, so a
# healthy long-running holder keeps it fresh. The steal threshold must therefore
# exceed the longest single step budget (cycle-b's 1200s=20m workers), NOT the
# whole-chain runtime — else a fast tick could steal the lock mid-slow-run and
# both would hit the gateway at once (defeats the anti-melt mutex, spec §2.3).
LOCK_DIR="state/locks/cycle.lock"
LOCK_MAX_AGE_MIN="${AMP_LOCK_MAX_AGE_MIN:-30}"
mkdir -p state/locks
if [ -d "$LOCK_DIR" ] && [ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +"$LOCK_MAX_AGE_MIN" 2>/dev/null)" ]; then
  echo "cycle-fast: stealing stale lock (no touch in > ${LOCK_MAX_AGE_MIN}m)"; rmdir "$LOCK_DIR" 2>/dev/null || true
fi
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "cycle-fast: another cycle holds the lock — skipping this tick"; exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# ── per-step wall-clock watchdog (same contract as cycle-b) ─────────────────
run_step () {
  local secs=$1 label=$2; shift 2
  echo "── $label (≤${secs}s) ──"
  "$@" &
  local pid=$!
  ( waited=0
    while kill -0 "$pid" 2>/dev/null; do
      sleep 3; waited=$((waited+3))
      if [ "$waited" -ge "$secs" ]; then
        echo "⏱  $label exceeded ${secs}s — terminating"
        kill -TERM "$pid" 2>/dev/null; sleep 5; kill -KILL "$pid" 2>/dev/null
        break
      fi
    done ) &
  local wd=$!
  local rc=0
  wait "$pid" || rc=$?
  kill "$wd" 2>/dev/null
  [ "$rc" -ne 0 ] && echo "⚠  $label exited $rc"
  touch "$LOCK_DIR" 2>/dev/null || true   # lock liveness heartbeat (steal-safety)
  return 0
}

TO_REAP="${AMP_TO_REAP:-60}"
TO_LABEL="${AMP_TO_LABEL:-300}"
TO_ALERT="${AMP_TO_ALERT:-120}"
TO_SYNC="${AMP_TO_SYNC:-600}"
TO_ENUM="${AMP_TO_ENUM:-180}"
TO_ACTUATE="${AMP_TO_ACTUATE:-600}"
# Self-heal threshold: if the last CLEAN sync is older than this, the fast loop
# catches up itself. Set BELOW the 6h staleness alarm so freshness self-heals
# before it ever alarms — and so cycle-b's launchd-calendar reliability (which a
# sleeping laptop coalesces) stops being load-bearing for mail freshness.
SYNC_CATCHUP_MIN="${AMP_SYNC_CATCHUP_MIN:-300}"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') cycle-fast start ==="

# Floor must be present — label-sync does floor-gated Gmail label I/O.
[ -f floor.json ] || cp "${AMP_FLOOR_SRC:-$HOME/Documents/GitHub/acme/docs/policy/floor.json}" floor.json 2>/dev/null || true

# 1. Reap orphaned 'running' rows so the health rollup is truthful.
run_step "$TO_REAP" reap-orphans $NODE reap-orphans.js

# 1b. TRIAGE new mail EVERY tick. This is the core cadence fix (2026-07-23): inbox
#     adjudication no longer waits for cycle-b's 4×/day calendar — it happens on the
#     short fast interval, so mail is routed within minutes of arriving during the
#     workday, not "twice while Jordan's asleep." email-triage classifies new arrivals
#     AND folds in any route-IS-NULL backlog; a quiet inbox is one read_emails + skip,
#     so the common case stays cheap. Holds the shared mutex we already own → never
#     contends with a slow run. cycle-b now only owns the heavy DAILY work (digest,
#     off-machine snapshot, needs-you draft generation, cross-system audit).
run_step "$TO_SYNC" triage $NODE email-triage.js --limit "${AMP_FAST_TRIAGE_LIMIT:-25}"

# 1c. ACTUATE the routing decision — archive everything triage just deemed noise
#     (calendar/automated/fyi) out of the inbox. Deterministic, NO LLM, no per-run
#     cap: the route IS the adjudication (ADR: route-driven actuation, 2026-07-23).
#     Reversible (archive only); needs_you/external/inbox stay for Jordan. This is
#     what makes the loop actually CLOSE every tick instead of labeling-and-leaving.
run_step "$TO_ACTUATE" route-actuate $NODE inbox-sweep.js --from-routes

# 2. Push computed routes to real Gmail labels for the KEEPERS (needs_you/external
#    /inbox stay in-inbox but labeled). Additive/reversible, idempotent, NO LLM.
run_step "$TO_LABEL" label-sync $NODE label-sync.js --all --limit "${AMP_LABEL_LIMIT:-25}"

# 3. On-problem health alarm. Rides the 15-min cadence so a NEW outage (sync
#    stale, worker silent/crashed, fast loop itself stalled) is loud within
#    minutes, not once/day. Deduped: only posts when the problem-set changes or
#    the same alarm has gone unacked past AMP_ALERT_REPEAT_HOURS. No spam.
run_step "$TO_ALERT" health-alert $NODE surface-digest.js --alert-only

# Fast-loop liveness stamp — health() flags this if it goes stale (dead watchdog
# detection). Written last so it only advances on a tick that actually completed.
DB="${XDG_DATA_HOME:-$HOME/.local/share}/amp-tasks/tasks.db"
[ -f "$DB" ] && /usr/bin/sqlite3 "$DB" "INSERT INTO state (key,value,updated_at) VALUES ('last_fast_tick_at',datetime('now'),datetime('now')) ON CONFLICT(key) DO UPDATE SET value=datetime('now'), updated_at=datetime('now');" 2>/dev/null || true

echo "=== $(date '+%Y-%m-%d %H:%M:%S') cycle-fast done ==="
