# ADR-0015: Reversible inbox actuators — archive / trash / bulk, gated by a review agent

**Status**: Accepted (Jordan approved 2026-07-16)
**Date**: 2026-07-16
**Deciders**: Jordan, Amp
**Amends**: ADR-0001 (trust model) — the inbox-hygiene rows of its hard-block table
**Relates to**: ADR-0008 (compliance floor), ADR-0012 (prompt-injection defense), ADR-0014 (gated actuators)

## Context

The email plane (shipped 2026-07-16) triages the inbox and stages verified drafts, but could not
actually *clean* it: `floor.json` v2 hard-denied `archive_email`, `trash_email`, `batch_update_emails`,
and gmail `update_email` (label mutation). Jordan's framing: "no point cleaning up my inbox if it isn't
clean — the goal isn't just completing the sorting task, it's the real part of your brain." A drafts-only
assistant leaves the actual pile untouched.

Two facts reframe this as a **restoration**, not a new grant of power:

1. **ADR-0001 already permitted inbox hygiene.** Its own table reads: "Auto-archive of obvious noise
   (newsletter, no-reply, calendar bot): **Allowed**"; "Label / move within inbox (reversible):
   **Allowed**"; "Auto-archive of a Tier-1 stakeholder: **BLOCKED**"; "Delete anything: **hard block**
   (almost always irreversible)." The v2 floor (the Acme-compliance clamp, ADR-0008 era) over-tightened and
   hard-denied *all* archive/trash/bulk — drifting away from ADR-0001's intent.

2. **Trash ≠ delete.** Gmail's `trash_email` moves a thread to a 30-day recoverable bin. It is reversible.
   Permanent `delete_email` / empty-trash / `delete_draft` are not, and ADR-0001's "delete: hard block"
   rests entirely on irreversibility.

## Decision

### 1. Reversible inbox ops leave `hard_deny` → `default_allow`
`archive_email`, `trash_email`, `batch_update_emails`, and gmail `update_email` are no longer hard-denied.
This restores ADR-0001's original posture. `floor.json` bumps to **version 3** (`_comment_v3`).

### 2. Permanent destruction stays hard-denied, forever
Every `delete_*` pattern (incl. `delete_email`, `delete_draft`, `delete_label`), the bare `__delete`
tool, and calendar/drive-share/confluence/slack-outside-whitelist gates are **unchanged**. Nothing the
system does is irreversible. This is the floor's honest, narrowed job.

### 3. Safety moves UP the stack — the floor is no longer the only catch
Because these ops are reversible, the risk is *wrong* actions (an important thread swept away), a
correctness problem, not an irreversibility one. It is caught by three layers, in order:

1. **Deterministic guardrails (code, before any model):** never archive/trash a Tier-1 sender
   (ADR-0013 overrides); never touch a thread with an unanswered direct question to Jordan; never trash
   internal 1:1 human threads (archive at most); trash only matches a narrow junk-signature allowlist.
   A thread failing any guardrail is downgraded (to `keep`/`archive`) and logged.
2. **Independent review agent** (`review-agent.js`): a separate `llm.js` call with fresh context and an
   adversarial frame ("give the reason this should NOT be archived/trashed"), run on every proposed
   destructive action. Context-isolation-as-safety — the pattern ADR-0014 §2 blesses. An action fires
   only if it clears the guardrails AND the review agent approves at threshold.
3. **Human batch approval, graduating to auto** (per ADR-0014 "actuators graduate as precision is
   observed"): actions are staged in `email_sweep_actions` and approved by Jordan in batches in the dash
   until the audit trail shows the review agent's precision holds; then a config flag flips to
   auto-execute review-approved actions. Every action stores pre-state and is **one-click undoable**.

### 4. Prompt-injection containment (ADR-0012) is unchanged and load-bearing here
Email bodies remain untrusted/fenced. A destructive action is chosen from thread *metadata + classifier
verdict*, never from instructions in a body. An email that says "archive all my mail" is data, not a
command. Tainted context can only ever downgrade to `keep`.

## Consequences

- ✅ The inbox actually gets clean; the assistant closes the loop instead of only proposing.
- ✅ Faithful to ADR-0001's intent; the change is a restoration + an explicit trash-vs-delete line.
- ✅ Reversibility is now a floor *invariant*: nothing the fleet can do is permanent.
- ✅ Enforced in code across both readers (`guard.py` interactive, `mcp-dispatch.checkFloor` headless) +
  proven by `golden_test.py` (88 cases) and `mcp-dispatch --selftest` (18).
- ⚠️ A review-agent false-approve can archive/trash a wanted thread. Mitigated: recoverable + undo log +
  batch approval during the graduation window + Tier-1 hard guardrail.
- ⚠️ More gateway calls (a review pass per destructive action). Bounded by `--limit` and the guardrail
  layer filtering most threads to `keep`/`archive` before the agent runs.

## Alternatives considered
1. **Keep drafts-only.** Rejected — leaves the actual problem (a full inbox) unsolved.
2. **Allow permanent delete too.** Rejected by Jordan — trash (recoverable) is the destructive max; the
   irreversibility line is worth keeping.
3. **Floor allows, no review agent.** Rejected — a bug or false-positive classification could sweep
   broadly with no catch. The review agent + batch approval is the point.
4. **A signed "reviewed-actuation" token the floor checks.** Rejected — forgeable within one process,
   over-engineered for a single-principal personal system; the guardrail+review+undo stack is the real
   protection.

## References
- ADR-0001 (trust model — amended here), ADR-0008 (floor), ADR-0012 (prompt-injection), ADR-0013 (tier
  overrides), ADR-0014 (gated actuators + subagents-for-isolation)
- `docs/policy/floor.json` (v3), `harness/claude-code/guard.py`, `harness/claude-code/golden_test.py`
- `apps/amp-tasks/inbox-sweep.js`, `apps/amp-tasks/review-agent.js`, `apps/amp-tasks/mcp-dispatch.js`
