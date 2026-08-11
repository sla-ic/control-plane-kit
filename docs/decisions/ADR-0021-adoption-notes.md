# ADR-0021 adoption notes — running the "rebuild contract" on your own control plane

Companion to [ADR-0021](ADR-0021-rebuild-invariants-and-contracts.md). The ADR is written as the
principal's decision record; this file speaks to **you, the adopter** (or your agent), about *why*
this pattern matters and *how* to run it. Read it when you're tempted to throw away and rewrite the
app layer of a control plane you've made your own.

## The one-paragraph version

The promise of a control plane is that the expensive layer — identity, the floor, decisions,
orchestration — lives in `docs/`, so the app under `apps/` is disposable and can be rewritten freely.
That promise is a **hypothesis**, not a fact. Before you act on it by deleting the app, *test it*:
can the app's spec be written from the brain alone? Usually the honest answer is "mostly, but not
entirely" — some load-bearing behavior only exists in the code. ADR-0021 is the record of finding
that residue and writing it into the brain **as tests**, so the delete becomes safe.

## Why you can't skip this (the load-bearing insight)

The dangerous knowledge isn't the obvious stuff — schema, priorities, cadences — that's already in
`docs/` or trivially recoverable from `db.js`. The dangerous knowledge is a small set of **directional
safety invariants** that live *above the floor*:

- "the review agent fails toward **keep**, never approve"
- "verification can only **lower** an automation tier, never raise it"
- "a rule can't graduate to unattended firing on its own **circular** evidence"

The floor (`floor.json` + `guard.py`) gates *actuators at the tool boundary*. These invariants are
*application reasoning* — the floor cannot see them. A rewrite that keeps every golden test green can
still invert one of these and look correct while quietly over-destroying data. That's why prose isn't
enough and why §7 of the ADR insists each invariant ship **with a pinning test**.

## The play, step by step

1. **Run a brain-completeness audit.** Point a few read-only agents at `apps/` with an open brief:
   *"list every behavior that is load-bearing but exists only in code — not in any ADR, spec, or
   memory file."* Don't seed them with hypotheses; let them find the residue.
2. **Sort every finding into four buckets:**
   - **① Already captured** — it's in `docs/` or is literally the artifact (the floor *is*
     `floor.json`). Survives a delete. Do nothing.
   - **② Recoverable from an artifact** — the schema is in `db.js`, the seed graph in `seed-tasks.js`.
     Not lost, not prose. Do nothing but note where it lives.
   - **③ Must extract before delete** — directional safety invariants + empirical API/data contracts.
     **This is the only bucket that is real pre-delete work.**
   - **④ Discard, don't preserve** — substrate scar tissue (hardcoded offsets, host-specific
     workarounds, duplicated calendars). The rewrite exists to shed these. Naming them is how you make
     sure you *don't* faithfully re-port a bug.
3. **Write bucket ③ into an ADR** (this one), split into: **Class A** directional safety invariants,
   **Class B** external API/transport contracts, **Class C** schema/data contracts.
4. **Adversarially verify every anchor against source** before you trust it. In the reference run this
   caught real errors in a first-pass audit — an invariant stated with the `min` on the wrong
   variable, a column claimed to be in the DDL that was actually added by a runtime `ALTER`, and a
   "code-enforced" property that was really only prompt-enforced. An unverified invariant is worse
   than none: it gives false confidence.
5. **Carry each invariant into the rebuild as a test, not a sentence.** Map them onto the oracles the
   kit already ships (`golden_test.py`, `mcp-dispatch --selftest`, `review-agent --selftest`,
   `audit/test-rules.js`) and write net-new tests for the ones with no oracle. *Then* the delete is
   safe.
6. **Only now decide rebuild vs. refactor.** See below.

## Honest caveats (don't adopt this blindly)

- **Class B is substrate-conditional.** The API/transport contracts (envelope shapes, label-ID vs
  name, `channel` vs `channel_id`, token scopes) are true *for this gateway + Gmail/Slack*. If your
  rebuild changes the connector layer, each Class B item flips from "keep" to "re-adjudicate" — that
  has to be a conscious call, not an accident, or you'll drop a requirement thinking you shed a scar.
- **The real fork is rebuild vs. refactor.** The audit's honest finding is that bucket ④ (the scar
  tissue) is the *only* affirmative reason to rewrite from scratch rather than refactor in place. If
  shedding that scar tissue at scale is genuinely the goal, rebuild. If the actual driver is velocity,
  refactoring skips the entire extraction cost. Don't let "rebuild" be the default because it feels
  clean — ADR-0021 Alternative #4 is there on purpose.
- **The inventory is point-in-time.** Every edit to the app before cutover can add new bucket-③
  knowledge. Re-run the audit close to the delete, not months before it.
- **This ADR gates an irreversible action.** It does not authorize the delete; it defines what has to
  be true first. The delete still needs the principal's explicit go *and* every invariant pinned.

## What "done" looks like

- ADR-0021 lists every Class A/B/C invariant with a source anchor.
- Each invariant has a test that fails if a rewrite inverts it.
- `db.js` (or a git-tracked SQL dump) is the documented schema-of-record, including runtime-`ALTER`ed
  columns.
- Bucket ④ is written down as an explicit *don't-port* list.
- The principal has ratified the delete.

Only when all five hold is "the app is disposable" a fact instead of a hope.
