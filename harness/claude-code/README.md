# harness/claude-code — the Claude Code binding (shim)

This directory is the **binding** between the portable SSOT (`docs/`) and the Claude Code harness.
Nothing here is policy or identity; it is mechanism. Swap harnesses → write a sibling
`harness/<name>/` with the same two responsibilities, leave `docs/` untouched.

The seam (see [../../docs/harness-map.md](../../docs/harness-map.md)):

```
docs/amp.boot.json ──► shim reads it ──► loads load_order into context ──► installs floor as guard
```

## Contents
- **`guard.py`** — the active write-side enforcement. A thin reader of
  [`../../docs/policy/floor.json`](../../docs/policy/floor.json); produces decisions **identical** to
  the legacy `~/.claude/hooks/nova-guard-writes.sh`. Floor path resolves via `$AMP_FLOOR_JSON` or the
  default `../../docs/policy/floor.json`.
- **`golden_test.py`** — proves `guard.py == legacy` across 47 branch-covering cases. Run after any
  floor edit: `python3 harness/claude-code/golden_test.py` (exit 0 = identical).
- **`sessionstart-boot.sh`** — emits `docs/BOOT.md` as `additionalContext` at session start, so the
  harness loads identity/register/floor/continuity from the repo instead of a divergent cache.

## Deploy (do this LAST, after live work + review)
Two `~/.claude/settings.json` edits, each independently revertible:

1. **Guard swap** — point the PreToolUse matcher at
   `python3 ~/Documents/GitHub/acme/harness/claude-code/guard.py`.
   Revert: restore `~/.claude/hooks/nova-guard-writes.sh` (never deleted).
2. **Boot hook** — register `sessionstart-boot.sh` as a SessionStart hook.
   Revert: remove the hook entry.

Gate both on `golden_test.py` green. The legacy guard stays the live enforcement until step 1.
