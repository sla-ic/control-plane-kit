#!/bin/zsh -l
# Launchd entrypoint. Self-locating so it works from any deploy dir.
# Note: do NOT deploy into ~/Documents/ — launchd lacks Full Disk Access
# there and dies with `getcwd: Operation not permitted` before node starts.
# Canonical runtime on Jordan's machine: ~/.local/share/amp-tasks/ (deployed
# via rsync from this dir; the plist at ~/Library/LaunchAgents/com.example.amp-tasks.plist points there).
cd "$(dirname "$0")" || exit 1
exec /opt/homebrew/bin/node server.js
