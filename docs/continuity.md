# Continuity — where the build stands

> **This is an EXAMPLE continuity log.** In a live control plane this file is the
> single most important piece of working memory: it is where the agent resumes from
> at the start of every session — *not* a harness chat summary. Keep it current;
> convert relative dates to absolute; delete what's done. The entries below are
> illustrative, to show the format. Replace them with your own.

The contract: the agent boots, reads this last (per [BOOT.md](BOOT.md)), and picks up
exactly here. If the harness resets, compacts, or is swapped, this file — in version
control — is what survives.

---

## Now (active)

- **Adopting the control plane.** Cloned the kit, ran `git init`, and started making
  it ours. Rewrote [identity/jordan.md](identity/jordan.md) and
  [identity/register.md](identity/register.md) for our principal.
  **Next:** tune the [floor](policy/floor.json) to our risk posture and re-run the
  golden tests (`python3 harness/claude-code/golden_test.py`).

- **Wiring connectors.** Mapping our tools to readable handles in
  [policy/conventions.md](policy/conventions.md). Reads first; every write stays
  gated until we write the ADR for it.
  **Next:** confirm the connector scope with security (see the seeded task
  "Decide connector scope for the pilot").

## Next (queued)

- Replace the example seed (`apps/amp-tasks/seed-tasks.js`) with real tasks once a
  source is wired.
- Stand up the dashboard (`apps/amp-tasks/run-dash.sh`) and point the team at it.
- Decide whether to run the agent on a schedule (see the example launchd plists,
  `apps/amp-tasks/com.example.*.plist`).

## Recently done

- Booted the agent from the SSOT for the first time — boot order resolved cleanly.
- Guard hook enforcing the floor; all golden tests green.

---

### How to write a good continuity entry

- Lead with the **state**, not the activity ("floor tuned, tests green" > "worked on the floor").
- Always include a concrete **Next:** so the next session has a first move.
- Use **absolute dates** (this file outlives the moment it was written).
- Move finished work to "Recently done", then prune it once it's ancient history.
