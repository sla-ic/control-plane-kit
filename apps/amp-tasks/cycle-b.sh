#!/bin/zsh -l
# cycle-b.sh — scheduled Cycle B: value-first generative plane + reversible
# hygiene + durable local snapshot. Runs OFF-TERMINAL under launchd
# (com.example.amp-cycle-b) on a cadence, with no interactive session.
#
# TWO HARD LESSONS baked in (2026-07-17 incident, remediation P0-1/P0-3):
#
#  1. WATCHDOG. A single hung LLM call used to wedge the whole serial chain
#     (adjudicate item #134), silently dropping every downstream worker for
#     days. `|| echo` catches a non-zero EXIT but NOT a HANG. So every worker
#     now runs under run_step, a shell-native wall-clock reaper (macOS ships no
#     `timeout`/`gtimeout`). llm.js also has a real body-read timeout now, but
#     this is defense-in-depth: nothing in the chain can block forever.
#
#  2. VALUE-FIRST ORDER. The human-facing generative outputs (drafts,
#     needs-you) now run BEFORE the hang-prone reasoning step, so even if a
#     later worker stalls and gets reaped, the valuable half already landed.
#     Old order ran adjudicate 2nd and drafts 7th — exactly backwards.
#
# PATH DISCIPLINE: everything lives under ~/.local/share (launchd has NO Full
# Disk Access to ~/Documents). Off-machine git durability is a separate,
# interactive-session job: snapshot-to-git.sh.
# NB: deliberately NO `set -e` — run_step swallows worker failures (returns 0)
# and the prelude guards its own criticals; a stray non-zero must not silently
# abort the whole cycle (prior multi-day-outage failure class).
cd "$(dirname "$0")" || exit 1
NODE=/opt/homebrew/bin/node
LIMIT="${AMP_CYCLE_LIMIT:-8}"

# ── shared mutex with cycle-fast (spec 2.3) ─────────────────────────────────
# One lock so the fast + slow loops never both hammer the shared gateway token
# in the same window. run_step touch-refreshes the lock's mtime after every step,
# so the steal threshold need only exceed the longest SINGLE step budget (1200s),
# not the whole-chain runtime — a healthy long run keeps its lock fresh and can't
# be stolen mid-flight; a truly hung cycle (watchdog dead too) is reclaimed 30m
# after its last completed step.
LOCK_DIR="state/locks/cycle.lock"
LOCK_MAX_AGE_MIN="${AMP_LOCK_MAX_AGE_MIN:-30}"
mkdir -p state/locks
if [ -d "$LOCK_DIR" ] && [ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +"$LOCK_MAX_AGE_MIN" 2>/dev/null)" ]; then
  echo "cycle-b: stealing stale lock (no touch in > ${LOCK_MAX_AGE_MIN}m)"; rmdir "$LOCK_DIR" 2>/dev/null || true
fi
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "cycle-b: another cycle holds the lock — deferring this run"; exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

# ── whole-chain deadline (fast-loop anti-starvation) ────────────────────────
# The per-step watchdog bounds any single HANG, but 17 gateway-bound steps each
# running slow-but-under-budget (shared-token latency) can hold the lock for
# hours — and because run_step touch-refreshes the lock's mtime, the fast loop's
# stale-steal (LOCK_MAX_AGE_MIN) NEVER fires against a live-but-slow holder. That
# starves the 15-min NO-LLM last mile (ADR-0017's whole point; observed 2026-07-23:
# one cycle-b held the lock 4h47m, fast dark ~12h). Fix: a total runtime cap set
# BELOW the steal threshold — cycle-b yields the lock voluntarily before fast
# would ever steal it, so the anti-melt "never two gateway hitters" invariant
# holds AND fast can't be starved > CHAIN_MAX_MIN. The chain is idempotent;
# skipped tail steps resume next beat. label-sync is step 5 (early), so the
# last-mile substrate stays fresh; only reporting/backup tail steps slip.
CHAIN_START=$SECONDS
CHAIN_MAX_MIN="${AMP_CHAIN_MAX_MIN:-25}"

# ── per-step wall-clock watchdog ────────────────────────────────────────────
# run_step <secs> <label> <cmd...> : run cmd in the background; if it outlives
# <secs>, SIGTERM then SIGKILL it and move on. Never aborts the chain (returns
# 0 like the old `|| echo`), but a HANG can no longer starve later workers.
run_step () {
  local secs=$1 label=$2; shift 2
  local elapsed_min=$(( (SECONDS - CHAIN_START) / 60 ))
  if [ "$elapsed_min" -ge "$CHAIN_MAX_MIN" ]; then
    echo "⏭  chain over ${CHAIN_MAX_MIN}m (${elapsed_min}m) — yielding lock, skipping $label (resumes next beat)"
    return 0
  fi
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

# per-step budgets (env-tunable). Each LLM call is bounded at AMP_LLM_TIMEOUT_MS
# (llm.js, default 90s); these bound the whole worker across its --limit items.
TO_PRIORITY="${AMP_TO_PRIORITY:-300}"
TO_SELFTEST="${AMP_TO_SELFTEST:-120}"
TO_TRIAGE="${AMP_TO_TRIAGE:-1200}"
TO_NEEDSYOU="${AMP_TO_NEEDSYOU:-1200}"
TO_ADJUDICATE="${AMP_TO_ADJUDICATE:-900}"
TO_GEMINI="${AMP_TO_GEMINI:-600}"
TO_SWEEP="${AMP_TO_SWEEP:-1200}"
TO_SNAPSHOT="${AMP_TO_SNAPSHOT:-300}"
TO_REAP="${AMP_TO_REAP:-60}"
TO_LABEL="${AMP_TO_LABEL:-300}"
TO_DIGEST="${AMP_TO_DIGEST:-180}"
TO_GITSNAP="${AMP_TO_GITSNAP:-180}"
TO_DISP="${AMP_TO_DISP:-900}"  # native-closure scan adds serial get_thread reads
TO_CLUSTER="${AMP_TO_CLUSTER:-180}"
TO_VALUE="${AMP_TO_VALUE:-120}"
TO_CALIB="${AMP_TO_CALIB:-120}"
TO_JIRA="${AMP_TO_JIRA:-120}"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') Cycle B start (limit=$LIMIT) ==="

# Step 0: reap orphaned 'running' fleet_runs (crashed/killed workers that never
# fired auditRunEnd) so the health rollup + digest reflect reality.
run_step "$TO_REAP" reap-orphans $NODE reap-orphans.js

# Step 1: stage the floor gate + prove it FIRST — every MCP-touching worker below
# (fetch-jira, email-triage, needs-you, sweep) resolves the gate from this cwd copy,
# so it must be present and passing before any of them run. Self-healing: refresh
# the copy from the canonical source EVERY cycle (was `[ -f ] ||`, which pinned a
# stale gate forever once seeded — so floor.json edits never reached the runtime).
# Guarded so a missing/unreadable source can't wipe a known-good existing copy.
if [ -r "${AMP_FLOOR_SRC:-$HOME/Documents/GitHub/acme/docs/policy/floor.json}" ]; then
  cp "${AMP_FLOOR_SRC:-$HOME/Documents/GitHub/acme/docs/policy/floor.json}" floor.json 2>/dev/null || true
fi
run_step "$TO_SELFTEST" floor-selftest $NODE mcp-dispatch.js --selftest

# Step 1b: JIRA SPINE (audit: frozen-feeders) — autonomous read-only pull of
# Jordan's open issues over the floor-gated jira MCP, upserted into tasks via the
# existing idempotent loader. Runs BEFORE canonical-priority so the P-model
# re-derives on fresh Jira every cycle. read:jira-work only; every jira write verb
# is hard-denied (proven in the selftest above).
run_step "$TO_JIRA" fetch-jira $NODE fetch-jira.js --limit "${AMP_JIRA_LIMIT:-200}"

# Step 2: recompute the canonical three-axis priority model (deterministic,
# idempotent). Self-healing: the P-scale re-derives from live signals every
# cycle instead of drifting behind a one-shot backfill.
run_step "$TO_PRIORITY" canonical-priority $NODE canonical-priority.js --commit

# ── VALUE-FIRST: the human-facing generative outputs run before reasoning ──

# Step 3: email plane — sync, triage (noise filter), stage verified Gmail
# drafts, refresh the stale-draft backlog. Only outward writes are floor-gated
# create_draft/update_draft; send/forward/trash are hard-denied. --live enables
# draft creation.
run_step "$TO_TRIAGE" email-triage $NODE email-triage.js --limit "${AMP_EMAIL_LIMIT:-20}" --refresh --live

# Step 3b: push the freshly-computed routes to real Gmail labels (additive/
# reversible, idempotent, no LLM). The fast loop also does this between slow
# runs; running it here means labels land immediately after a route, not on the
# next fast tick.
run_step "$TO_LABEL" label-sync $NODE label-sync.js --all --limit "${AMP_LABEL_LIMIT:-30}"

# Step 3c: CLUSTER-LINK (ADR-0018) — connect each open email_item to its project/
# cluster (projects.id) so the resolver + surface can join a message to its live
# your_move/blocker. Deterministic passes only on the beat (pcr/alias/domain) —
# PURE-LOCAL, no gateway, cheap. The LLM fallback (--llm) stays opt-in / off-beat.
run_step "$TO_CLUSTER" cluster-link $NODE cluster-link.js --limit "${AMP_CLUSTER_LIMIT:-500}"

# Step 4: needs-you resolver — for every route='needs_you' item, gather
# cross-system context, decompose into cited next-steps, independently verify,
# and STAGE a reversible draft_action. READ-ONLY + DB-only; no egress.
# Surfaced at /needs-you.html for one-click resolution.
run_step "$TO_NEEDSYOU" needs-you-resolver $NODE needs-you-resolver.js --limit "${AMP_NEEDSYOU_LIMIT:-20}"

# Step 4b: ACTUATE — climb the resolver's own ladder (tier 1 decomposed → tier 3
# one-click-ready). For each verified resolution, execute the automatable read-only
# legwork (real free slots from Jordan's calendar for scheduling asks, gathered
# thread/doc context) to FILL the draft's [INSERT...] holes, then stage the
# completed reply as a real Gmail draft (create_draft/update_draft — floor-ALLOWED,
# reversible, NEVER sends). Holes needing Jordan's judgment stay as one clearly
# marked [NEEDS PRINCIPAL: ...] and are surfaced, not fabricated. This is the stage
# that makes "what to do with non-archived mail" real: the reply is teed up, Jordan
# reviews + sends. Without this, the resolver's expensive reasoning dead-ended.
run_step "$TO_NEEDSYOU" needs-you-actuate $NODE needs-you-actuate.js --live --limit "${AMP_ACTUATE_LIMIT:-10}"

# Step 4c: DISPOSITION CAPTURE (ADR-0016 learning loop) — read-only sensor for
# what Jordan ACTUALLY did with staged artifacts: a staged draft he sent (thread
# now carries a SENT from Jordan) / discarded (draft-labeled message gone), or an
# executed archive he pulled back to INBOX (restore). Writes email_dispositions +
# stamps email_items.acted_by, and feeds HUMAN ground_truth into the rule ledger
# via reconcilePrediction. This is the ONLY source of the human-verified evidence
# the staged→auto gate now requires — without it, rule precision is the pipeline
# grading its own homework. No egress (get_thread/list only); runs before sweep so
# a restore demotes the offending rule in the SAME cycle it graduates.
run_step "$TO_DISP" disposition-capture $NODE disposition-capture.js --limit "${AMP_DISP_LIMIT:-60}" --native-limit "${AMP_NATIVE_LIMIT:-100}"

# Step 4c-bis: DECLUTTER last mile — disposition-capture's native-closure pass just
# flipped any thread where Jordan had the last word to status='resolved'
# (acted_by='jordan:sent'). label-sync is additive-only and never removes a label,
# so those threads would keep their ⚡Needs You / 🤝External flag in Gmail and
# linger in Jordan's view. This pass removes exactly the label WE applied, gated by
# that first-party SENT evidence. Reversible: if the thread reopens (someone
# replies → new msg_id), the additive label-sync step above re-flags it. Fixes the
# "solving blind" gap — a solved thread (e.g. the billing escalation) no longer
# re-surfaces as needing Jordan. No archive; label-only.
run_step "$TO_LABEL" label-declutter $NODE label-sync.js --declutter-only

# Step 4d: VALUE REPORT (audit: "no-value-measurement") — the north-star sensor.
# Deterministic (model='none'), READ-ONLY except its own value_metrics snapshot.
# Rolls up, over a trailing window, the share the fleet handled without Jordan
# (auto-handled), the share Jordan acted on of what it surfaced (escalation
# usefulness), the undo rate (honesty gate), and a time-saved proxy. Runs after
# disposition-capture so the drafts-sent/restore evidence it reads is current,
# and before surface-digest so the digest can quote the latest numbers.
run_step "$TO_VALUE" value-report $NODE value-report.js --window "${AMP_VALUE_WINDOW:-7}"

# Step 4e: CALIBRATION PASS (ADR-0016 §2) — the consumer §1 named as missing.
# Deterministic (model='none'), READ-ONLY except its own calibration snapshot.
# Per-category precision measured against Jordan's first-party dispositions
# (rule predictions split human/pipeline, draft sends, needs-you resolutions,
# sweep outcomes), flags grad-ready PROPOSALS, and captures the override
# curriculum. Measures & proposes only — the rule state flip stays in
# rule-engine's ratification gate. Runs after disposition-capture so the
# ground truth is current, before surface-digest so the digest can quote it.
run_step "$TO_CALIB" calibrate $NODE calibrate.js --window "${AMP_CALIB_WINDOW:-30}"

# ── then reasoning + enrichment (formerly first; now behind the value plane) ──

# Step 5: reason + stage + escalate over the flagged delta. --post fires only on
# real escalations, only to #amp-alerts, always attributed "[Amp, on behalf of
# Jordan]". This is the historically hang-prone worker — now bounded two ways
# (llm.js body-read timeout + this watchdog) and demoted below the value plane.
run_step "$TO_ADJUDICATE" adjudicate $NODE adjudicate.js --limit "$LIMIT" --post

# Step 6: Gemini meeting transcripts — capture raw (LLM-free) + enrich a few.
run_step "$TO_GEMINI" gemini-capture $NODE enrich-gemini.js --capture
run_step "$TO_GEMINI" gemini-enrich  $NODE enrich-gemini.js --enrich --recent --limit "${AMP_GEMINI_ENRICH:-5}"

# Step 7: inbox sweep (ADR-0015) — classify threads, run deterministic
# guardrails + the independent review agent, and STAGE reversible cleanup into
# email_sweep_actions. EARNED-AUTO (ADR-0016): the propose pass self-approves
# ONLY protect keeps (skipped) and archive/trash rows whose rule graduated to
# state='auto' by MEASURED precision. LLM-classified destructive actions ALWAYS
# stage as 'proposed' for dashboard approval — never auto-fire by env fiat. The
# --execute pass therefore clears only the earned queue; it is safe to run
# unconditionally. Permanent delete stays hard-denied by the floor.
run_step "$TO_SWEEP" inbox-sweep         $NODE inbox-sweep.js --limit "${AMP_SWEEP_LIMIT:-15}"
run_step "$TO_SWEEP" inbox-sweep-execute $NODE inbox-sweep.js --execute

# Step 8: surface digest — roll up ready drafts + proposed needs-you + proposed
# sweeps + worker-health/sync-stale flags and post ONE digest to #amp-brief
# (floor-whitelisted). Idempotent per day: posts on the first cycle of the day,
# no-ops the rest. The dashboard (:3737) is the live surface between digests.
run_step "$TO_DIGEST" surface-digest $NODE surface-digest.js

# Durable LOCAL snapshot: portable SQL dump (diffable) + rotated dated .db.
DB="${XDG_DATA_HOME:-$HOME/.local/share}/amp-tasks/tasks.db"
if [ -f "$DB" ]; then
  mkdir -p state
  run_step "$TO_SNAPSHOT" snapshot /bin/sh -c '/usr/bin/sqlite3 "'"$DB"'" .dump > state/tasks.sql.tmp && mv state/tasks.sql.tmp state/tasks.sql'
  cp "$DB" "state/tasks.db.$(date +%Y%m%d)" 2>/dev/null || true
  ls -1t state/tasks.db.* 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true
  echo "snapshot: state/tasks.sql refreshed"
fi

# Durable OFF-MACHINE snapshot: push tasks.sql dump (incl. email_* tables) to the
# private amp-state ref. Launchd-safe — uses the TCC-free object store at
# ~/.local/share/amp-tasks/state-git (never touches ~/Documents), osxkeychain
# creds reachable in the gui/$UID domain. Watchdog-wrapped; a network/auth blip
# can't wedge the cycle (run_step always returns 0). Local dump above already
# succeeded, so a failed push only delays off-machine durability to the next run.
run_step "$TO_GITSNAP" git-snapshot "$HOME/.local/share/amp-tasks/snapshot-to-git.sh"

# Liveness stamp: cycle-b completed. surface-digest + the dashboard read this to
# flag a stalled slow loop; it was seeded blank in db.js and never written, so it
# read as perpetually stale since 2026-07-03 despite the cycle running. (Fast loop
# already stamps last_fast_tick_at the same way.)
[ -f "$DB" ] && /usr/bin/sqlite3 "$DB" "INSERT INTO state (key,value,updated_at) VALUES ('last_cycle_b_at',datetime('now'),datetime('now')) ON CONFLICT(key) DO UPDATE SET value=datetime('now'), updated_at=datetime('now');" 2>/dev/null || true

echo "=== $(date '+%Y-%m-%d %H:%M:%S') Cycle B done ==="
