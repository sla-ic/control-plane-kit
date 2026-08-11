#!/bin/zsh -l
# strip-residue.sh — SECOND deterministic bulk pass. After the big category + primary-noise
# drains, ~100 automated NOTIFICATION-class threads still sit in primary that the first pass
# didn't target: Confluence share/mention notifications, Jira *bot* automation (NOT human
# "mentioned you"), recurring internal-meeting series, calendar housekeeping, HR lifecycle,
# and misc app notifications. All reversible (archive = remove INBOX, stays in All Mail).
# Deliberately KEEPS: person-named JIRA mentions, ALL partner/human threads, gemini-notes.
cd "$(dirname "$0")" || exit 1
for Q in \
  'in:inbox from:confluence' \
  'in:inbox from:"Automation for Jira"' \
  'in:inbox from:ironclad' \
  'in:inbox from:benefits' \
  'in:inbox from:"Acme People Team"' \
  'in:inbox from:"Acme Onboarding"' \
  'in:inbox subject:"Action Requested" from:automation' \
  'in:inbox subject:"Inquiry Received" from:automation' \
  'in:inbox subject:"Automatic reply"' \
  'in:inbox subject:"Proposed new time"' \
  'in:inbox subject:"Appointment booked"' \
  'in:inbox subject:"Updated video conference"' \
  'in:inbox subject:"Weekly Platform Experiment Review"' \
  'in:inbox subject:"Sign the Card"' \
  'in:inbox subject:"Please sign by"'
do
  echo ""
  echo "==================== $Q  $(date '+%H:%M:%S') ===================="
  node bulk-archive.js --query "$Q" --limit 15 --max-waves 60 || echo "bulk-archive exited $?"
done
echo ""
echo "=== strip-residue DONE $(date '+%Y-%m-%d %H:%M:%S') ==="
