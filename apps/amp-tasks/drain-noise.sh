#!/bin/zsh -l
# drain-noise.sh — bulk-archive every NOISE category to steady state. Fast path:
# IDs + batch archive, no bodies, no LLM. Reversible. Leaves category:primary alone
# (humans → judgment pass). meeting-notes sender protected inside bulk-archive.js.
cd "$(dirname "$0")" || exit 1
for CAT in \
  "in:inbox category:updates" \
  "in:inbox category:forums" \
  "in:inbox category:promotions" \
  "in:inbox category:social"
do
  echo ""
  echo "==================== $CAT  $(date '+%H:%M:%S') ===================="
  node bulk-archive.js --query "$CAT" --limit 15 --max-waves 200 || echo "bulk-archive[$CAT] exited $?"
done
echo ""
echo "=== drain-noise DONE $(date '+%Y-%m-%d %H:%M:%S') ==="
