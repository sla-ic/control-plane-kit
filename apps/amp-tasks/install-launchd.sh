#!/bin/sh
# install-launchd.sh — reproducibly install the Amp control-plane launchd fleet
# from the SSOT-tracked plists. Makes the runtime rebuildable on a fresh Mac
# (or after a wipe) without hand-copying: the plists in this dir are the source
# of truth, ~/Library/LaunchAgents/ is a deployment target.
#
# The fleet:
#   com.example.amp-tasks      — the always-on tasks API + server (port 3737)
#   com.example.amp-fast       — 15-min NO-LLM last-mile (cycle-fast.sh)
#   com.example.amp-cycle-b    — slow LLM adjudication at 07/12/17/21 (cycle-b.sh)
#   com.example.amp-synthesize — synthesis pass
#   com.example.amp-awake      — caffeinate -s; holds sleep off on AC so lid-close
#                            doesn't halt the loops (ADR-0009 Tier-1 addendum)
#
# Usage: sh install-launchd.sh          (install/refresh all)
#        sh install-launchd.sh --uninstall   (bootout all)
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/LaunchAgents"
DOMAIN="gui/$(id -u)"
JOBS="com.example.amp-tasks com.example.amp-fast com.example.amp-cycle-b com.example.amp-synthesize com.example.amp-awake"

mkdir -p "$DEST" "$HOME/Library/Logs/amp-tasks"

if [ "$1" = "--uninstall" ]; then
  for j in $JOBS; do
    launchctl bootout "$DOMAIN/$j" 2>/dev/null || true
    echo "booted out $j"
  done
  exit 0
fi

for j in $JOBS; do
  if [ ! -f "$SRC/$j.plist" ]; then
    echo "WARN: $j.plist not found in $SRC — skipping" >&2
    continue
  fi
  cp "$SRC/$j.plist" "$DEST/$j.plist"
  # bootout first so a changed plist is actually reloaded (bootstrap on an
  # already-loaded label is a no-op).
  launchctl bootout "$DOMAIN/$j" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$DEST/$j.plist" 2>/dev/null || launchctl load "$DEST/$j.plist"
  echo "installed + loaded $j"
done

echo "---"
launchctl list | grep -E 'com\.sla\.amp' || echo "WARN: no amp jobs loaded"
