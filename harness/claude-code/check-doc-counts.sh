#!/bin/sh
# check-doc-counts.sh — fail if the policy doc's stated golden-test case count has
# drifted from the actual count golden_test.py computes. This exact drift recurred
# (floor.md said "70 cases" while the test ran 88), so make it a hard gate instead
# of a recurring hand-copy error.
#
# Usage: sh harness/claude-code/check-doc-counts.sh   (exit 0 = in sync, 1 = drift)
set -e
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
N="$(python3 "$REPO/harness/claude-code/golden_test.py" --count)"
FLOOR="$REPO/docs/policy/floor.md"

if ! grep -q "\*\*$N cases\*\*" "$FLOOR"; then
  echo "DOC-COUNT DRIFT: golden_test.py reports $N cases, but docs/policy/floor.md does not say '**$N cases**'." >&2
  echo "Fix floor.md to match, then re-commit." >&2
  exit 1
fi
echo "doc-count OK: floor.md matches golden_test.py ($N cases)"
