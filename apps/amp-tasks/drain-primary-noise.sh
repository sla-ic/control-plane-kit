#!/bin/zsh -l
# drain-primary-noise.sh — fast, deterministic bulk archive of the automated noise
# that Gmail mis-filed into PRIMARY: calendar system mail, JIRA notifications (except
# direct mentions), AccessCo access-expiry, OOO auto-replies. Reversible (archive
# only). Leaves real human threads for the judgment/label pass. meeting-notes sender protected.
cd "$(dirname "$0")" || exit 1
for Q in \
  'in:inbox subject:invitation' \
  'in:inbox subject:"canceled event"' \
  'in:inbox subject:accepted' \
  'in:inbox subject:declined' \
  'in:inbox from:jira@acme.atlassian.net -subject:"mentioned you"' \
  'in:inbox from:no-reply@accessco.com' \
  'in:inbox subject:OOO' \
  'in:inbox subject:"out of office"'
do
  echo ""
  echo "==================== $Q  $(date '+%H:%M:%S') ===================="
  node bulk-archive.js --query "$Q" --limit 15 --max-waves 120 || echo "bulk-archive exited $?"
done
echo ""
echo "=== drain-primary-noise DONE $(date '+%Y-%m-%d %H:%M:%S') ==="
