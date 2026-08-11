#!/bin/zsh -l
# snapshot-to-git.sh — OFF-MACHINE durability for the control-plane state.
#
# WHY: the host debate (laptop vs Acme cloud) dissolves once durable state is
# host-independent. This pushes a portable dump of the live tasks.db to the
# PRIVATE control-plane origin on a dedicated ref — so the audit trail survives
# laptop loss, host swaps, and (if we ever move) a fresh box just restores from
# git. Matches the SSOT model ("keep data in GitHub").
#
# REF: snapshots live at `refs/snapshots/amp-state`, NOT a branch. A branch
# (refs/heads/*) shows up in GitHub's branch view and, being an orphan snapshot
# chain, is reported as perpetually "N behind / M ahead" of main — meaningless
# noise that grows forever and makes the branch view unreadable. A ref outside
# refs/heads/* carries identical durability but never appears as a branch and is
# never compared to main. Retrieve with:
#   git fetch origin 'refs/snapshots/amp-state:refs/snapshots/amp-state'
# (Migrated off refs/heads/amp-state 2026-07-27 — see ADR-0009 addendum / ADR-0019.)
#
# LAUNCHD-SAFE (rewritten 2026-07-22): earlier this needed Full Disk Access
# because it pushed from the repo git-dir under ~/Documents (TCC-protected).
# It no longer touches ~/Documents. It uses a DEDICATED bare object store at
# ~/.local/share/amp-tasks/state-git (NOT TCC-protected) and pure git plumbing
# (hash-object/mktree/commit-tree), chaining each snapshot onto the fetched
# amp-state parent for a clean fast-forward + preserved audit history. Creds are
# osxkeychain, reachable because both cycles run in the gui/$UID launchd domain.
# So this can run unattended from cycle-b AND manually from a session.
set -e
SG="${AMP_STATE_GIT:-$HOME/.local/share/amp-tasks/state-git}"
DB="${AMP_TASKS_DB:-${XDG_DATA_HOME:-$HOME/.local/share}/amp-tasks/tasks.db}"
REMOTE="${AMP_STATE_REMOTE:-https://github.com/your-org/control-plane.git}"
export GIT_DIR="$SG"

[ -f "$DB" ] || { echo "snapshot-to-git: no DB at $DB"; exit 1; }

# First-run bootstrap of the TCC-free object store.
if [ ! -d "$SG" ]; then
  git init -q --bare "$SG"
  git remote add origin "$REMOTE"
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REMOTE"

# Chain onto the existing remote history (fast-forward, audit trail preserved).
SNAP_REF="refs/snapshots/amp-state"
git fetch -q origin "$SNAP_REF" || true
PARENT=$(git rev-parse -q --verify FETCH_HEAD || true)

DUMP=$(/usr/bin/sqlite3 "$DB" .dump)
BLOB=$(printf %s "$DUMP" | git hash-object -w --stdin)
TREE=$(printf '100644 blob %s\ttasks.sql\n' "$BLOB" | git mktree)
MSG="amp-state snapshot $(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ -n "$PARENT" ]; then
  COMMIT=$(printf %s "$MSG" | git commit-tree "$TREE" -p "$PARENT")
else
  COMMIT=$(printf %s "$MSG" | git commit-tree "$TREE")
fi
git update-ref "$SNAP_REF" "$COMMIT"
git push -q origin "$SNAP_REF:$SNAP_REF"
# Truthful heartbeat: stamp ONLY after a confirmed push, so the digest's
# amp-state-staleness flag (Phase 3.2) stays honest if durability silently stops.
/usr/bin/sqlite3 "$DB" "INSERT INTO state(key,value) VALUES('last_amp_state_push_at', datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value;" 2>/dev/null || true
echo "snapshot-to-git: pushed $COMMIT to origin/$SNAP_REF ($MSG)"
