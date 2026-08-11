#!/usr/bin/env bash
# sessionstart-boot.sh — Claude Code SessionStart hook.
# Emits docs/BOOT.md as additionalContext so Amp reconstitutes from the SSOT repo
# (identity/register/floor/continuity) rather than a divergent harness cache.
#
# NOT YET WIRED. Register in ~/.claude/settings.json SessionStart only as the final
# reviewed deploy step (see README.md). Revert = remove the hook entry.
#
# Output contract: JSON with hookSpecificOutput.additionalContext (string).

set -euo pipefail

REPO="/Users/you/Documents/GitHub/acme"
BOOT="$REPO/docs/BOOT.md"

if [[ ! -f "$BOOT" ]]; then
  # Fail soft: no boot file → emit nothing, let the session proceed.
  exit 0
fi

# Emit BOOT.md as additionalContext, JSON-escaped via python3 (portable, no jq dep).
python3 - "$BOOT" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    boot = f.read()
ctx = ("SSOT BOOT (Amp). The repo at github.com/your-org/control-plane is your single source of "
       "truth; this harness is swappable. Follow docs/BOOT.md exactly:\n\n" + boot)
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": ctx,
    }
}))
PY
