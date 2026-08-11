#!/usr/bin/env bash
# Deterministic deploy tail for a planner refresh. Run AFTER the planner-refresh
# workflow has written seed/_enrich_{payments,experience}.json (deep re-alignment),
# OR standalone to re-import the current seed + Jira mirror and redeploy.
# LOCAL only: reads sheets/seed, writes the local DB, restarts the local service.
set -euo pipefail
cd "$(dirname "$0")"

echo "== build vocab (canonical keys from current DB) =="
node build-vocab.js || echo "  (vocab build skipped — DB not ready)"

echo "== merge fleet enrichment =="
if [ -f seed/_enrich_payments.json ] && [ -f seed/_enrich_experience.json ]; then
  node merge-enrich.js
else
  echo "  (no per-org enrichment present — keeping existing seed/projects-enrich.json)"
fi

echo "== import (reseed planner_* + merge enrichment into local DB) =="
node import-planners.js | tail -8

echo "== deploy code to XDG runtime + restart =="
rsync -a --delete --exclude='tasks.db*' --exclude='node_modules' ./ "$HOME/.local/share/amp-tasks/"
launchctl kickstart -k "gui/$(id -u)/com.example.amp-tasks"
echo "planner refresh deployed @ $(date -u +%Y-%m-%dT%H:%M:%SZ)"
