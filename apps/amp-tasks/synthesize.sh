#!/bin/zsh -l
# synthesize.sh — scheduled REASONING enrichment of the control-center projects.
#
# Runs OFF-TERMINAL under launchd (com.example.amp-synthesize), on a daily cadence,
# with no interactive session. Same "off-laptop autonomy" seam as cycle-b.sh:
# it reasons over each project's already-ingested evidence (PRD/ERD artifacts +
# live Jira tasks + deck record) via the Acme llm-gateway (llm.js, ADR-0008) and
# writes fresh {status_synthesis, blocker, your_move, health} straight back into
# the SAME projects table the timeline/drawers read — no second store, nothing
# to reconcile. This is the self-updating loop for the connection layer.
#
# PATH DISCIPLINE: everything runs under ~/.local/share (launchd has NO Full
# Disk Access to ~/Documents — see run-dash.sh / cycle-b.sh). node_modules and
# the XDG tasks.db already live here because run-dash.sh serves from here.
set -e
cd "$(dirname "$0")" || exit 1
NODE=/opt/homebrew/bin/node

echo "=== $(date '+%Y-%m-%d %H:%M:%S') synthesize start ==="

# Step 1: REASON a fresh synthesis per Payments/Experience project → /tmp/synthesis-reasoned.jsonl
# (overwrites in place each run; bounded-concurrency gateway calls, temperature 0).
$NODE synthesize-projects.js || echo "synthesize-projects exited $?"

# Step 2: VERIFY each proposal independently (adversarial LLM reviewer + rule
# gates) → /tmp/synthesis-verified.jsonl. Consumes + deletes the reasoned file so
# nothing unverified can leak downstream. This is the anti-false-info stage.
$NODE verify-synthesis.js || echo "verify-synthesis exited $?"

# Step 3: GATED WRITE-BACK into the projects table + live decisions rows
# (only verdict=confirmed & confidence≥τ surface as actions; stale moves retired).
$NODE ingest-synthesis.js || echo "ingest-synthesis exited $?"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') synthesize done ==="
