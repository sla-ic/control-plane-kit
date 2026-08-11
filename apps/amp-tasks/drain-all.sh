#!/bin/zsh -l
# drain-all.sh — walk EVERY inbox category to steady state, executing inline.
# Serial by category (the connector serializes reads); each category loops in waves
# until empty via inbox-sweep.js --drain. Full-auto: archive/trash/label land live.
cd "$(dirname "$0")" || exit 1
export AMP_SWEEP_AUTO=1
NODE=/opt/homebrew/bin/node
[ -f floor.json ] || cp "$HOME/Documents/GitHub/acme/docs/policy/floor.json" floor.json 2>/dev/null || true

for CAT in \
  "in:inbox category:primary" \
  "in:inbox category:updates" \
  "in:inbox category:forums" \
  "in:inbox category:promotions" \
  "in:inbox category:social" \
  "in:inbox"
do
  echo ""
  echo "############################################################"
  echo "### DRAIN: $CAT   $(date '+%H:%M:%S')"
  echo "############################################################"
  $NODE inbox-sweep.js --drain --query "$CAT" --limit 12 --max-waves 80 || echo "drain[$CAT] exited $?"
done

echo ""
echo "=== drain-all DONE $(date '+%Y-%m-%d %H:%M:%S') ==="
