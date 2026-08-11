#!/bin/zsh
# amp-git-sync.sh — make git provably reflect what is actually deployed & running.
#
# The disease this cures: the RUNTIME (~/.local/share/amp-tasks, what launchd runs)
# and the SSOT mirror (apps/amp-tasks/) had no canonical direction, so code drifted
# between them and git silently fell behind the deployment. After that, "what does
# git say" no longer answered "what is running."
#
# The cure — a fixed contract, enforced here:
#   SSOT (apps/amp-tasks/) is CANONICAL. The runtime is a DEPLOY TARGET, never
#   hand-edited. Edits happen in SSOT; `deploy` (below) pushes SSOT -> runtime.
#
# This script, run at every session end (SessionEnd hook) and on demand:
#   1. DETECTS runtime <-> SSOT drift and reports it LOUDLY (never silently syncs
#      a direction — a drift here means the contract was broken and a human must
#      decide which side is truth).
#   2. COMMITS + PUSHES any uncommitted SSOT changes, so git == working tree always.
#   3. Prints a single honest status line: branch, ahead/behind origin, deploy match.
#
# It only ever ADDS commits. It never deletes files, force-pushes, or auto-resolves
# drift. Safe to run repeatedly and unattended.
#
# Usage:
#   amp-git-sync.sh            # detect + commit + push + report (default)
#   amp-git-sync.sh --check    # report only, no commit (exit 1 if dirty/drifted)
#   amp-git-sync.sh --deploy   # push SSOT -> runtime (the canonical deploy direction)

set -uo pipefail
SSOT="/Users/you/Documents/GitHub/acme"
RT="$HOME/.local/share/amp-tasks"
APP="$SSOT/apps/amp-tasks"
MODE="${1:-}"

cd "$SSOT" || { echo "amp-git-sync: cannot cd $SSOT" >&2; exit 2; }

# --- --deploy: SSOT -> runtime (the ONE sanctioned sync direction) ---------------
# Deploys exactly the git-tracked files (respects .gitignore by construction), so
# DB dumps / logs / *-pull.json runtime state are never clobbered.
if [[ "$MODE" == "--deploy" ]]; then
  [[ -d "$RT" ]] || { echo "amp-git-sync: runtime $RT missing" >&2; exit 2; }
  n=0
  while IFS= read -r f; do
    rel="${f#apps/amp-tasks/}"; dst="$RT/$rel"
    mkdir -p "$(dirname "$dst")"; cp -p "$f" "$dst"; n=$((n+1))
  done < <(git ls-files apps/amp-tasks)
  echo "amp-git-sync: deployed $n tracked files SSOT -> runtime"
  exit 0
fi

# --- 1. Detect runtime <-> SSOT drift (report only; never auto-resolve) -----------
# Precise, .gitignore-respecting: compare each git-TRACKED SSOT file to its runtime
# twin by CONTENT (cmp, not mtime), and flag deployed code files that were never
# committed (untracked runtime .js/.sh reachable in SSOT's tree).
DRIFT=""
if [[ -d "$RT" ]]; then
  while IFS= read -r f; do
    rel="${f#apps/amp-tasks/}"; rtf="$RT/$rel"
    if [[ ! -e "$rtf" ]]; then DRIFT+="  committed-but-NOT-deployed: $rel"$'\n'
    elif ! cmp -s "$f" "$rtf"; then DRIFT+="  CONTENT-DIFFERS (ssot vs runtime): $rel"$'\n'
    fi
  done < <(git ls-files apps/amp-tasks)
  # reverse: runtime code files (.js/.sh/.py) not tracked in SSOT = deployed, uncommitted
  while IFS= read -r rtf; do
    rel="${rtf#$RT/}"
    case "$rel" in node_modules/*|state/*|*.log|*.db*) continue;; esac
    [[ -f "$APP/$rel" ]] || DRIFT+="  DEPLOYED-but-UNTRACKED (add to SSOT): $rel"$'\n'
  done < <(find "$RT" -maxdepth 2 \( -name '*.js' -o -name '*.sh' -o -name '*.py' \) -type f 2>/dev/null)
fi
if [[ -n "$DRIFT" ]]; then
  echo "⚠️  amp-git-sync: RUNTIME <-> SSOT DRIFT — the deploy contract was broken." >&2
  echo "    (runtime = $RT ; ssot = $APP)  Decide which side is truth, don't guess:" >&2
  printf '%s' "$DRIFT" >&2
  echo "    Reconcile: 'amp-git-sync.sh --deploy' if SSOT wins; else copy runtime->SSOT" >&2
  echo "    for the listed files + commit. Then re-run --check." >&2
fi

# --- 2. Commit + push any uncommitted SSOT changes -------------------------------
if [[ "$MODE" == "--check" ]]; then
  if [[ -n "$(git status --porcelain)" || -n "$DRIFT" ]]; then
    git status --short
    exit 1
  fi
  echo "amp-git-sync: clean — git == working tree, runtime == SSOT."
  exit 0
fi

if [[ -n "$(git status --porcelain)" ]]; then
  # Capture the file list BEFORE staging so the commit body says what changed —
  # a generic safety-net commit must still be legible ("how do I know what's what").
  CHANGED="$(git status --short)"
  git add -A
  git commit -q -F - <<EOF
chore(auto): session-end sync — $(printf '%s' "$CHANGED" | grep -c . ) file(s) reconciled

Auto-committed by amp-git-sync (SessionEnd) so git reflects working state.
A session ended with these uncommitted — review/squash if unrelated:

$CHANGED

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
  echo "amp-git-sync: committed uncommitted changes."
  if git remote get-url origin >/dev/null 2>&1; then
    git push -q origin HEAD 2>&1 | tail -1 || echo "amp-git-sync: push failed (commit is local; push manually)" >&2
  fi
fi

# --- 3. Honest one-line status ---------------------------------------------------
BR="$(git rev-parse --abbrev-ref HEAD)"
git fetch -q origin "$BR" 2>/dev/null || true
AHEAD="$(git rev-list --count "origin/$BR..$BR" 2>/dev/null || echo '?')"
BEHIND="$(git rev-list --count "$BR..origin/$BR" 2>/dev/null || echo '?')"
CLEAN="$([[ -z "$(git status --porcelain)" ]] && echo 'clean' || echo 'DIRTY')"
DEPLOY="$([[ -z "$DRIFT" ]] && echo 'runtime==SSOT' || echo 'RUNTIME-DRIFT')"
echo "amp-git-sync: [$BR] $CLEAN | ahead:$AHEAD behind:$BEHIND | deploy:$DEPLOY"
