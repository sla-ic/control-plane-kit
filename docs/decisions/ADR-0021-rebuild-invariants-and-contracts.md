# ADR-0021: The rebuild contract — invariants & API/data contracts that must survive an amp-tasks rewrite

**Status**: Proposed (Amp drafted 2026-08-11; awaiting Jordan — this ADR *gates* an irreversible action and is not itself approval to take it)
**Date**: 2026-08-11
**Deciders**: Jordan, Amp
**Builds on**: ADR-0019 (SSOT canonical / deploy contract), ADR-0009 (state snapshots)
**Relates to**: ADR-0001 (trust model), ADR-0008 (compliance floor), ADR-0012 (prompt-injection defense), ADR-0015 (reversible actuators + review agent), ADR-0016 (closed-loop learning / earned graduation)

> **Adopting this kit?** This ADR is written as Jordan's, but it's a **reusable play** — the
> highest-leverage thing you can do before rewriting the app layer. See the companion
> [ADR-0021 adoption notes](ADR-0021-adoption-notes.md) for how to run it on your own control plane.

## Context

The decision on the table: **delete `apps/amp-tasks/` and rebuild it clean, keeping the brain
(`docs/`).** The rationale is sound in principle — this control plane's whole point is that the
expensive layer (identity, floor, decisions, orchestration) lives in version-controlled docs, so the
app *should* be disposable. But "should be" is a hypothesis, and a naive delete tests it with the
live system.

A brain-completeness audit answered the hypothesis empirically: **a large fraction of load-bearing
behavior is code-only** — not captured in any ADR, spec, or memory file. It splits into four buckets:

1. **Already captured** (survives a delete): floor policy (it *is* `floor.json` + a golden-test
   oracle), the canonical-priority rubric (`canonical-priority.js` + the system spec), scheduling
   cadences/mutex, deploy contract, jira transport shape, the label-sync route→label map, clustering
   cascade, `llm.js` gateway config.
2. **Recoverable from an artifact** (not prose, not lost): the schema DDL → `db.js`
   (`CREATE TABLE`/`CREATE TRIGGER`); the seed graph → `seed-tasks.js`.
3. **Must extract before delete** (this ADR): directional safety invariants and empirical API/data
   contracts that a rebuild would silently get backwards or re-learn painfully.
4. **Discard, don't preserve** (scar tissue): substrate-specific workarounds that should die with the
   rewrite.

The key reason bucket 3 is dangerous: **these invariants live *above* the floor.** The floor gates
actuators at the tool boundary (`guard.py` / `mcp-dispatch.checkFloor`). The invariants below are
application-level *reasoning* rules — a fail-safe default, a `Math.min` that can only de-escalate, a
graduation gate that refuses circular evidence. The floor structurally cannot catch a rebuild that
inverts one of them. A rewrite that keeps the floor green and gets these backwards would look correct
and quietly over-destroy mail or auto-graduate a circular rule.

Every anchor below was verified against source. Anchors are given at file + symbol level (not line
number) on purpose — line numbers drift; the contract shouldn't.

## Decision

### 1. This ADR is the pre-delete gate

`apps/amp-tasks/` **may not be deleted or rebuilt from scratch** until every invariant in §2–§4 is
(a) recorded here, and (b) carried into the rebuild as a **pinning test**, not prose. Prose drifts;
this kit's own history (`check-doc-counts.sh` exists because a hand-copied count drifted from the
golden tests) is the proof. An invariant without a test is not preserved.

### 2. Class A — Directional safety invariants (inverting the *direction* is unsafe)

| # | Invariant | Anchor | How it's pinned |
|---|-----------|--------|-----------------|
| A1 | Review agent **fails toward KEEP**: on any parse/gateway error it returns `approve:false`; the happy path uses a strict `v.approve === true` gate (a truthy-but-not-`true` value does NOT approve). | `review-agent.js` (parse-error catch; `approve === true` gate) | `review-agent --selftest` |
| A2 | An **untrusted body can only argue for KEEP**, never flip to approve. **This is PROMPT+fencing-enforced, not code-enforced** — the hard code guarantee is only A1's defaults. The body is fenced as untrusted; the destructive decision is taken from metadata + classifier verdict (ADR-0012), never body instructions. | `review-agent.js` (header contract; fenced prompt) | injection case in `--selftest` (must be carried) |
| A3 | Verification can only **LOWER** the automation tier: `finalTier = Math.min(proposed, tier_override)`. Verifier error forces `tier_override:1` (ceiling down), never passthrough. | `needs-you-resolver.js` `store()` (`finalTier`); `verify()` error path | new test needed |
| A4 | A `FloorViolation` is **never retried** (policy denial ≠ transient fault); the retry wrapper rethrows it before recording/sleeping. | `needs-you-resolver.js` (retry wrapper: `if (e instanceof FloorViolation) throw e`) | new test needed |
| A5 | The resolver engine is **read-only** — it stages `draft_action` as text and calls only read tools; no send/forward/trash/delete anywhere. | `needs-you-resolver.js` (module header + tool calls) | new test / grep-gate |
| A6 | Rule graduation thresholds (defaults): shadow→staged `minApplied 8` & `minPrecision 0.90`; staged→auto `minApplied 25`, `minPrecision 0.97`, **plus human ground** `minHuman 5`, `minHumanPrecision 0.97`, `minHumanDays 2`. (Env-overridable; the defaults are the contract.) | `rule-engine.js` `GATE` | `audit/test-rules.js` |
| A7 | **De-circularization**: precision on pure pipeline self-agreement (`ground_truth='pipeline'`) can reach `staged` but **never `auto`**; auto requires `ground_truth IN ('human','restore')` across ≥2 distinct calendar days. | `rule-engine.js` (human-ground gate) | `audit/test-rules.js` |
| A8 | **Protect/destructive asymmetry**: a `protect` rule returns keep-only, is born at state `auto`, is exempt from the graduation gate, and is **never disabled** by a restore. Destructive rules must earn auto. | `rule-engine.js`; `compile-rules.js` (protect born `auto`) | `audit/test-rules.js` |
| A9 | `matchRule` priority order: **protect wins**, then most **specific**, then state rank (`auto:3>staged:2>shadow:1`), then precision. | `rule-engine.js` `matchRule` | `audit/test-rules.js` |
| A10 | **Restore is the strongest signal**: a confirmed restore overrides an already-closed `agree` on a destructive prediction to a `restore` miss; **demote is evaluated before promote** in the same pass (a fresh restore can't climb to auto); a restore both disables the rule AND lands in the human-precision denominator. | `rule-engine.js` (`reconcileThreadRestore`; demote-before-promote) | `audit/test-rules.js` |
| A11 | `mcp-dispatch.checkFloor` is **fail-closed** (missing/unparseable floor denies everything) and mirrors `guard.py` eval order (`hard_deny → slack_send → default_allow`); the **slack-send branch never falls through** to default_allow — an unknown channel is DENIED, not allowed. | `mcp-dispatch.js` `checkFloor`; `guard.py` | `mcp-dispatch --selftest`, `golden_test.py` |
| A12 | Reversible-vs-irreversible actuator boundary (ADR-0015): `create_draft`/`update_draft` and reversible mail moves are allowed by `default_allow`; `send_email`/`forward_email`/`delete_*` are caught by `hard_deny` before any egress. Lumping mail-mutation tools together in either direction breaks the staging model or the floor. | `mcp-dispatch.js` (`default_allow`; `hard_deny`) | `mcp-dispatch --selftest`, `golden_test.py` |

### 3. Class B — Empirical API / transport contracts (external truths, language-independent)

These are true **while the substrate is the `mcpgw` MCP gateway + Gmail/Slack**. If the rebuild
changes the connector layer (e.g. the ADR-0009 hosted flip), a contract here moves to §4 (discard) —
but that must be a *conscious* call, logged, not an accident.

- **B1** `get_thread` payload is a JSON string nested in the gateway envelope; `mcp-dispatch` also
  parses it, so read the parsed `messages` with the raw text as fallback. — `inbox-sweep.js`, `mcp-dispatch.js` (`parseMcpResponse`)
- **B2** `parseMcpResponse` handles JSON *and* SSE (payload = **last** `data:` line); list results
  arrive as **N concatenated per-content-block objects** parsed individually, not one joined parse. — `mcp-dispatch.js` `parseMcpResponse`
- **B3** Gmail modify needs **Label IDs, not names** — a name silently no-ops. Translate via
  `list_labels`; a name matching `/^[A-Z_]+$/` is treated as already-an-ID. — `inbox-sweep.js` (`labelNameToId`)
- **B4** Gmail mutators are **per-message** (`email_id`), not thread-level; archive = removing the
  `INBOX` label; expand a thread to message ids and loop. — `inbox-sweep.js`, `label-sync.js`
- **B5** `list_drafts` is **non-deterministic / non-subset**; detect draft presence **per-thread via
  `get_thread`** (a DRAFT-labelled message), never via `list_drafts`. — `disposition-capture.js`
- **B6** `create_draft` returns the id polymorphically: `draft_id || id || text`. — `email-triage.js`
- **B7** The gateway slack-send arg is **`channel`, not `channel_id`** (channel_id silently fails at
  the API, though the floor accepts either candidate field — the two layers disagree). — `surface-digest.js`, `adjudicate.js`
- **B8** Slack **search** uses a separate direct Web-API **user token**; the gateway bot token lacks
  `search:read` (permanent `missing_scope`). Result count is silently capped. — `mcp-dispatch.js` (search branch)
- **B9** `read_emails` is the **only** gmail ingestion path (the gateway exposes no gmail search);
  wrap in retry+backoff (`AMP_SYNC_TRIES`, default 6). — `email-triage.js`
- **B10** The principal's identity is a **multi-address** literal (`jordan@example.com |
  jordan.rivera@example.com`), distinct from the gateway user; SENT-detection depends on it. — `disposition-capture.js` (`PRINCIPAL`)
- **B11** `get_thread` message date field is **polymorphic** (`date | received_at | internalDate {ms
  vs s} | Date | receivedAt`); "who spoke last" breaks on a single-field assumption. — `disposition-capture.js` (`msgEpoch`)
- **B12** **Account-specific magic IDs** must be re-provisioned, never invented: the Gmail route
  labels (`Label_3..Label_7` → ⚡Needs You / 👀FYI / 📅Calendar / 📊Automated / 🤝External) and the
  Slack channels (`AMP_BRIEF_CHANNEL`, `AMP_ALERTS_CHANNEL`, default `C0AMPBRIEF`/`C0AMPALERT`) are
  env-configured placeholders that must also be present in the floor whitelist. — `label-sync.js` (`ROUTE_LABEL`), `surface-digest.js`

### 4. Class C — Data-contract & schema invariants

- **C1** The `tasks_updated_at` trigger bumps `updated_at` on **every** update → `updated_at` is a
  **false freshness signal**; `jira_synced_at` is the only trustworthy Jira-staleness signal, and it
  is **ALTER-added by `sync-jira.js` at runtime, NOT in the `db.js` DDL** (absent on a fresh
  `db.js`-only DB). — `db.js` (trigger), `sync-jira.js` (`ALTER TABLE ... jira_synced_at`)
- **C2** Jira re-sync **preserves local enrichment**: severity via `COALESCE` (never downgrades),
  stakeholders kept unless empty, and `priority` is owned by `canonical-priority.js`, never Jira. A
  "overwrite all columns from Jira" rebuild erases manual work. — `sync-jira.js`
- **C3** The active-draft partial unique index applies **only over active statuses**
  (`ready/proposed/approved`); terminal rows may repeat. Draft-dedup leans on it at write time. — `db.js`, `needs-you-actuate.js`
- **C4** `email_dispositions` idempotency = UNIQUE constraint + `INSERT OR IGNORE`; drop the
  constraint and the discarded-churn class of bug returns. — `disposition-capture.js`
- **C5** `verify-synthesis.js` **consumes its input** (unlinks the reasoned JSONL); it gates
  `move_surfaceable` on `verdict==='confirmed' && confidence >= TAU` where `confidence` is the min of
  the gate cap, the LLM confidence, and the reason confidence; the actual DB write-back is
  `ingest-synthesis.js`, not this file. — `verify-synthesis.js`
- **C6** `state`-key timestamps are inconsistent: some upsert (`ON CONFLICT`), some use a plain
  `UPDATE ... WHERE key=?` — a **latent bug** where, on a fresh DB, the row is absent and the
  timestamp silently never records. Rebuild contract: seed state keys or always upsert. — `verify-synthesis.js` vs `sync-jira.js`
- **C7** `label-sync` selection: filter on **`route` not `verdict`** (a verdict gate drops fresh
  mail); `gmail_label IS NULL` **advances the window**; terminal sentinels (`(left-inbox)` /
  `(decluttered)`) must not start with `Label_`; the main pass is **additive-only**, a separate
  declutter pass removes labels gated on `status='resolved' AND acted_by='jordan:sent'`. — `label-sync.js`
- **C8** Native-closure detection **excludes DRAFT messages** (a stale draft must not mask a real
  SENT); resolved only if the newest non-DRAFT message is the principal's SENT; the transition is
  race-guarded (`... WHERE status='open'`). — `disposition-capture.js`
- **C9** `needs-you-actuate` selection contract: `verdict='confirmed' AND status='proposed' AND
  length(draft_action) > 20`, ordered `automation_tier DESC, confidence DESC`; tier 3 = one-click,
  2 = needs-principal. Downstream ranking/UI relies on these tier semantics. — `needs-you-actuate.js`

### 5. Class D — Discard list (scar tissue: fix or shed, do NOT port)

- **D1** `PT_OFFSET_MS = 7*3600*1000` — a hardcoded summer PT offset; a **latent DST bug** (wrong by
  1h in standard time). The rebuild must compute the real offset. — `needs-you-actuate.js`
- **D2** The dashboard **duplicates** the cycle calendar + jira→local map across `server.js` /
  `public/shared.js` / `assign-cycles.js`, and applies the SQLite-UTC fix **inconsistently**. Rebuild:
  single source of truth, uniform UTC.
- **D3** Host-specific launchd / working-directory / runtime-path workarounds are substrate-specific;
  re-derive for the target runtime.
- **D4** `snapshot-to-git.sh` state-branch plumbing — a durability hack for a laptop; revisit under
  the ADR-0009 hosted flip.
- **D5** LLM **prompt text** (extract / reconcile / review system prompts) — re-tune on rebuild. Keep
  the I/O contract and the selftest cases, not the wording.
- **D6** Divergent `readInboxWithRetry` implementations across workers (different try counts / backoff
  shapes) — unify.

### 6. Schema-of-record

Before any delete, treat `db.js` as the **documented schema-of-record** (its `CREATE TABLE`/`CREATE
TRIGGER` block is the canonical DDL), and record the columns that exist only via runtime `ALTER`
(notably `jira_synced_at`, C1) so a `db.js`-only rebuild doesn't ship a schema missing them. If you
keep a SQL dump as the source of truth instead, track it in git rather than leaving it in the
gitignored runtime state dir.

### 7. Preservation mechanism — carry the oracle, not the prose

Each invariant ships into the rebuild with a test, mirroring how the floor is pinned. Existing oracles
to carry forward and extend: `golden_test.py` (floor), `mcp-dispatch --selftest` (headless floor +
allow/deny), `review-agent --selftest` (A1, A2 incl. an injection case), `audit/test-rules.js`
(A6–A10). Net-new tests are required for A3, A4, A5 and the Class C schema/data invariants, which
currently have no oracle.

## Consequences

- ✅ Turns "the app is disposable" from a hope into a checklist: when §2–§4 are pinned by tests and §6
  is done, a delete is safe rather than a gamble.
- ✅ Separates the two rebuild motives cleanly — Class A/B/C are *requirements* to keep; Class D is
  exactly the scar tissue a rebuild exists to shed. That's the affirmative case for rebuilding rather
  than refactoring.
- ✅ Makes the "invariants live above the floor" gap explicit and closes it with the same
  safety-as-tests discipline the floor already uses.
- ✅ Captures live latent bugs surfaced during the audit (C6 state-timestamp, D1 DST offset, D2 UTC
  inconsistency) so the rewrite fixes them by design instead of re-inheriting them.
- ⚠️ Real cost before any delete: net-new tests for A3–A5 + Class C, plus the §6 schema doc. Bounded
  (days), but not free.
- ⚠️ Class B is substrate-conditional. If the connector layer changes, each B item must be
  re-adjudicated keep-vs-discard; skipping that turns "we shed a scar" into "we dropped a requirement."
- ⚠️ This inventory is a point-in-time snapshot. Further edits to `apps/amp-tasks/` before the rebuild
  can add new bucket-3 knowledge; re-run the audit close to the cutover.

## Alternatives considered

1. **Delete now, re-derive from git history.** Rejected — history holds the scars without the
   reasoning; you'd re-learn every silent-failure quirk the hard way.
2. **Document all files.** Rejected — buckets 1/2/4 don't need it; it burns the window on knowledge
   that's already captured, recoverable, or meant to be discarded.
3. **Encode the invariants as prose in this ADR only.** Rejected — prose drifts; §1/§7 require tests.
   This kit's own `check-doc-counts.sh` exists precisely because a prose count drifted from reality.
4. **Don't rebuild; refactor in place.** The honest fallback if velocity isn't the real driver — it
   avoids the extraction cost entirely. Choose the rebuild only if the goal is shedding Class D at
   scale; otherwise refactor.

## References
- Companion: [ADR-0021 adoption notes](ADR-0021-adoption-notes.md) — how to run this play on your own control plane.
- ADR-0001 (trust model), ADR-0008 (compliance floor), ADR-0012 (prompt-injection), ADR-0015 (reversible
  actuators + review agent), ADR-0016 (earned graduation), ADR-0019 (SSOT canonical / deploy contract), ADR-0009 (state snapshots).
- Code anchors: `apps/amp-tasks/{review-agent,needs-you-resolver,needs-you-actuate,rule-engine,compile-rules,mcp-dispatch,inbox-sweep,label-sync,disposition-capture,email-triage,surface-digest,adjudicate,verify-synthesis,sync-jira,db}.js`; `harness/claude-code/guard.py`.
