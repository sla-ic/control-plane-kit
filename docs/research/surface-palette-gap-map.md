# Surface palette → current build gap-map

Palette: 12 principles + 7 negative-space commitments. Build: `apps/amp-tasks/public/index.html` (3,134-line SPA) + `apps/amp-tasks/server.js` (Express 5, 481 lines) + `apps/amp-tasks/db.js` (SQLite schema). DB has 72 projects, 99 decisions (21 open / 78 historical, 31 your_move + 15 escalation + 17 confirmation + 36 fyi), 144 open tasks (45 P0, 60 P1).

This is what the palette demands minus what the build delivers.

## Principle gap entries

### 1. The rise is a decision, not an event

**Palette demands:** The queue's primitive is a stable, named Project Track carrying current decision-class + recommended move + provenance; raw signal never floats free.

**Build today:** Two parallel primitives. The `decisions` table (`db.js` line 145 / `server.js:377-398`) gets it right — every row has `kind ∈ {your_move, escalation, confirmation, fyi}`, a `title`, a `body`, and a `project_id` provenance link; the Control Center renders them in `loadControlCenter()` (`index.html:1760-1857`) grouped by kind with a `🎯 YOUR MOVE` section first. The `tasks` table is the violator: 144 free-floating rows that arrive via `POST /api/tasks` (`server.js:42-63`) with no required decision-class, no recommended action (the `next_action` column at `db.js:25` is nullable and unused on most rows), and a 25-column metadata grab-bag (severity, tags, flags, OKRs, merchant, mission…) that is exactly the "data importance" framing the palette refuses. Both primitives are equally prominent in the sidebar (`index.html:1019-1029`).

**Gap:** partial — decisions are Track-shaped; tasks are inbox-shaped, and both are presented as queue rows.

**Fix sketch:** Demote tasks below decisions in the surface hierarchy. `index.html:1019-1029` ("My Queue" sidebar block) currently sits above Roadmaps; move it below and rename to "Tactical Backlog" so it reads as an evidence layer, not a queue. Make Control Center the only landing surface (already the default at `index.html:1469-1476` — keep). Add a server-side guard at `server.js:42` that rejects task POSTs lacking `next_action` when `priority='P0'` or `flag=urgent`. Non-trivial: properly enforcing this requires also converting the ~31 open `your_move` decisions into the dominant view-mode and folding the "All Tasks / Amp's Queue / Jordan's Queue" nav into a single demoted entry.

**Priority:** P0

---

### 2. Quiet by default; silence is the success condition

**Palette demands:** Steady-state shows an empty queue + a single peripheral health color; every surfacing rule has an owner, a rationale, and a budgeted interruption rate.

**Build today:** Inverted. The sidebar shows seven persistent count badges (`#count-today`, `#count-p0`, `#count-blocked`, `#count-adjudication`, `#count-decisions`, `#count-amp`, `#count-jordan`, `#count-people`, `#count-activity`, `#count-all` — `index.html:990-1029`), a Context Strip persistently displaying `🔴 N P0 / 🚫 N blocked` regardless of state (`index.html:1606-1610`), and a Control Center that always renders even when nothing needs a move. There is no "healthy = empty" path: every count is shown raw, every section header is always present, and the `your_move` count is structurally identical to `fyi`-count (`index.html:1841-1843`). No surfacing rule has an owner field; no rule has a written rationale; no per-channel interruption budget is tracked anywhere in the DB schema.

**Gap:** inverted — the build's steady-state is maximum surface; the palette's is empty.

**Fix sketch:** Three changes. (a) `index.html:1606-1610`: only render the P0/blocked chips when count > 0; when zero, render a single `<span class="ctx-quiet">all clear</span>`. (b) `index.html:1837-1856`: when `byKind.your_move.length === 0 && byKind.escalation.length === 0`, hide the entire decisions block and show only the one-line health summary. (c) New table `surfacing_rules (id, channel, owner, rationale, budget_per_day, created_at, last_reviewed_at)` in `db.js`; new `GET /api/interruption-budget` route in `server.js` aggregating decisions-created-per-day-per-kind against budget; new chrome element top-right showing `Today: 4/12 interruptions (33%)`. Non-trivial: the rule-owner schema + the audit ingest path is ~80 lines.

**Priority:** P0

---

### 3. Synthesis-first, evidence-on-pull

**Palette demands:** Every tile is judgment-first — one line naming the recommended action; evidence chain is collapsed and pulled on demand; items without a structured ask are bounced.

**Build today:** Decisions get this half-right: the title is the synthesis (`decisions.title` shown bold at `index.html:1780`), the body is the evidence (`index.html:1781`), and there's a source link. But the body is rendered inline (not collapsed), and the title field in the DB is frequently *not* an action — many rows in `decisions` (id 96-99 sampled) carry titles like "Casey Morgan 5/27: Marketplace sync paused…" which are *event labels*, not recommended actions. Tasks fail entirely: `renderTaskCard()` at `index.html:2045-2103` leads with `t.title` (raw description) and a metadata badge paylink — no recommended-action surface, no synthesis line. The `next_action` column exists (`db.js:25`) but is not rendered on the card; it only shows up inside the detail panel.

**Gap:** partial — decisions are synthesis-bodied but evidence is not collapsed, and many titles are not action-class; tasks have zero synthesis surface.

**Fix sketch:** Two changes. (a) `index.html:1776-1790` decisionRow: collapse `decision-snip` behind a `▶ evidence` toggle by default; hoist a derived "action verb" (parse from title — "approve", "decline", "draft", "confirm") into a leading `<span class="decision-verb">`. (b) `index.html:2080-2102` renderTaskCard: when `t.next_action` is non-null, render it as the primary line and demote `t.title` to a subtitle; when null and `t.priority IN ('P0','P1')`, render a `⚠ no recommended action` badge instead of letting the row pass clean. (c) Update `ingest-synthesis.js:43-51`: enforce that `decision.title` matches `/^(approve|decline|draft|send|confirm|ratify|reject|ship|close|escalate|hold)/i` for `kind='your_move'` rows; reject and log otherwise.

**Priority:** P0

---

### 4. Tiers are time-to-act, not data importance

**Palette demands:** Tiers encode response-window SLA + joint action per rung; >20% in top tier auto-flags drift.

**Build today:** Backwards. The four classes (`P0`/`P1`/`P2`/`P3` at `db.js:15`) are written as "Blocking / This week / Soon / Backlog" in the modal at `index.html:1280-1284` — a time *bucket*, but with no joint action and no SLA enforcement. Worse, the live DB has **45 P0 and 60 P1 out of 131 open** = 80% in the top two tiers, which the palette names as the drift-trigger condition; nothing in the build flags this. The `decisions.kind` ladder (your_move/escalation/confirmation/fyi at `server.js:391-394`) is closer to palette-correct (action-shaped) but lacks SLAs — `decisions` has no `due_date` enforcement, no time-to-resolve target per kind, no overdue computation.

**Gap:** inverted on tasks (severity tiers, no SLA, no inflation audit); partial on decisions (action-shaped kinds, no SLAs).

**Fix sketch:** (a) Add `response_window_hours` and `joint_action` columns to `decisions` via `db.js` ALTER block; populate defaults: `your_move=24h/"act or delegate"`, `escalation=4h/"acknowledge to source"`, `confirmation=72h/"ratify or reject"`, `fyi=null`. (b) New route `GET /api/tier-drift` in `server.js` returning `{ p0_pct, p1_pct, alert: p0_pct > 20 }`. (c) `index.html` Control Center hero: when drift fires, prepend a `<div class="cc-drift-banner">P0 inflation: 31% (target ≤20%) — rationalize</div>`. Non-trivial only in that it requires deciding the SLA per kind and writing the joint-action vocabulary — the code is ~30 lines.

**Priority:** P0

---

### 5. The standing contract is written when calm

**Palette demands:** Each project carries a versioned written contract — intent, doctrine, tripwires — that the agent reads against; tripwire-firing surfaces as a first-class event.

**Build today:** Absent. The `projects` table (`db.js:32-39` + migrations to line 105) has `description`, `summary`, `status_synthesis`, `blocker`, `your_move`, `health` — all narrative status fields, not pre-committed contract fields. No `intent`, no `tripwires`, no `doctrine`, no `escalation_thresholds`. The agent layer has nothing structured to read against; synthesis (`ingest-synthesis.js`) writes one-shot status text, not contract-evaluated state. The 72-project DB has zero rows with anything resembling a tripwire definition.

**Gap:** missing — no contract surface at all.

**Fix sketch:** Non-trivial. Add `project_contracts (project_id, intent TEXT, doctrine TEXT, tripwires TEXT_JSON, version INT, written_at, reviewed_at)` table in `db.js`; tripwires_json is `[{condition, severity, action}]`. New routes `GET /api/projects/:id/contract` + `PUT /api/projects/:id/contract` in `server.js`. New Control Center section above decisions listing "🔥 Tripwires fired this session" — sourced from a new tripwire-evaluation pass run alongside `ingest-synthesis.js`. New Project Detail tab at `index.html:1918-1971` "📜 Contract" showing the three pillars. Roughly 150 lines + the operator workflow to author contracts for the 62 active projects.

**Priority:** P1 (P0 in spirit but the contract authoring is the gating real-world work, not the code)

---

### 6. Two-stage commit: standby, then GO

**Palette demands:** Consequential acts split across two beats with mandatory acknowledgment; commit-verbs are a reserved vocabulary.

**Build today:** Single-beat everywhere. `POST /api/decisions/:id/resolve` (`server.js:400-403`) is one click → done; the UI at `index.html:1789` is a bare `✓` button with no confirmation. `POST /api/tasks` (`server.js:42-63`) creates immediately; status changes are one-click selects (`index.html:1287-1296`). Delegation has a context box (`index.html:2640-2647`) but submits immediately without ack. Nothing in the system distinguishes "armed" from "committed". No reserved verb vocabulary — the "✓ Mark resolved" tooltip mixes with narrative copy ("synthesized 2h ago", "drafted") throughout the surface.

**Gap:** missing — every commit is single-beat.

**Fix sketch:** Add a `pending_commits (id, action_type, payload_json, armed_by, armed_at, committed_at, expires_at)` table to `db.js`. Wrap consequential routes (`/api/decisions/:id/resolve`, `/api/tasks/:id` PATCH when status→done, `/api/tasks/:id/delegate`) in an arm-then-commit flow: first call writes pending row, returns `{commit_id, summary}`; second call with `commit_id` executes. UI: `index.html:1789` decision-resolve becomes a two-stage button — first click renders a confirm strip "✓ Resolve · undo" with 5s auto-revert, second click commits. Reserve verbs `approve | resolve | delegate | close | archive | send` in a constant `COMMIT_VERBS` and lint that they never appear in body/snippet/title fields. Non-trivial: ~70 lines + careful UX on every commit path.

**Priority:** P1

---

### 7. Ownership is singular, escalation is automatic

**Palette demands:** Every item has one named owner + timeout-to-escalate; SLA-miss auto-promotes visually.

**Build today:** Half-implemented. Tasks have `owner` (jordan/amp/both — note "both" violates singular) at `db.js:11` and `assignee` (free-text) at `db.js:102`; decisions have *no* owner field at all (`db.js:144-156`) — they're implicitly Jordan. No timeout-to-escalate column anywhere. The adjudication queue (`server.js:251-291`) flags `stuck_in_progress >7d` and `stale >14d` but these are post-hoc detection buckets, not pre-set per-item SLAs, and there's no automatic visual promotion — the user has to navigate to the Adjudicate view to see them. `owner='both'` (`db.js:11`, `server.js:43`) is the named cardinal sin: items belonging to "both" reach neither.

**Gap:** partial — task owner exists but `both` is allowed; decisions have no owner; no per-item SLA; no auto-promotion.

**Fix sketch:** (a) `db.js:11`: remove `'both'` from the owner doc and migration; update existing rows to `'jordan'`. (b) Add `owner TEXT NOT NULL DEFAULT 'jordan'` and `escalate_after_hours INT` to `decisions` via ALTER in `db.js`. (c) `server.js:377-398` decisions route: ORDER additionally by `escalate_after_hours - hours_since_created` ASC so SLA-breaching items float. (d) `index.html:1776-1790`: when `(now - created_at) > escalate_after_hours`, add `.decision-row-escalated` class with red left border + "⏰ overdue Nh" badge. ~50 lines.

**Priority:** P1

---

### 8. The handoff is the artifact

**Palette demands:** Session-start reconstitutes from a structured handoff artifact (what changed, what's active, anomalies, worries list); session-end generates the same for next time.

**Build today:** Missing. There is no session concept. `init()` at `index.html:1464-1477` loads projects/stats/people, then opens Control Center — same view every time, with no "since last visit" delta, no "what changed", no agent worries list. The closest analogue is the Activity feed (`server.js:220-246`) which is a chronological stream — but it's *unfiltered* (latest 80 events), not a curated "since you last looked" digest, and it doesn't carry soft anomalies that haven't been escalated yet. No session-end artifact is generated. The `decisions` table is the closest thing to a worries list (fyi rows) but it's not framed that way and not bounded to recent items.

**Gap:** missing — no session boundary, no handoff artifact.

**Fix sketch:** Non-trivial. (a) New table `sessions (id, opened_at, closed_at)` in `db.js`. (b) New table `worries (id, project_id, observed_by_agent, body, severity, observed_at, escalated_at)` — soft anomalies the agent layer suspects but isn't yet ready to push as a decision. (c) New route `GET /api/handoff` returning `{since: last_session_close, changes: {projects, decisions, tasks}, active: {your_move_count, escalations}, worries: [...]}`. (d) Replace Control Center landing at `index.html:1469` with a Handoff view that renders the above; Control Center becomes a tab on it. (e) Wire session-close on `beforeunload` to POST `/api/sessions/close` which snapshots state. ~180 lines + a worry-detection pass in `ingest-synthesis.js`.

**Priority:** P0

---

### 9. Silence is a measured quantity

**Palette demands:** Every project carries a learned baseline cadence; *absence* of expected activity rises as a tile; each project has a blind-spot map.

**Build today:** Missing. No baseline cadence is computed or stored. The `projects` schema has `last_synthesis_at` (when the agent last synthesized) but no `last_observed_activity_at`, no `expected_cadence_days`, no `silence_baseline`. The Control Center surfaces *what's present* (open decisions, project status tiles) — never *what's absent*. There is no "this project went silent" tile anywhere. No blind-spot map: the build cannot distinguish "silent because DMs are dark and we can't see them" from "silent because the work stopped." Currently 13 projects show `health='unknown'` (sampled) — they're silently silent.

**Gap:** missing — silence is invisible.

**Fix sketch:** Non-trivial. (a) Add `expected_cadence_days INT`, `last_observed_activity_at TEXT`, `blind_spots TEXT_JSON` to `projects` via `db.js`. (b) New scheduled pass `ingest-silence.js` that computes per-project activity from `project_artifacts.ts` and updates `last_observed_activity_at` + flags `silent` when `now - last > 2*expected_cadence`. (c) New `kind='silence'` in `decisions` so silence surfaces in the existing Control Center flow. (d) `index.html:1844`: when silence decisions exist, render a `🌑 SILENT (N)` section header. The cadence learning itself can be a simple median-gap-between-artifacts heuristic to start. ~120 lines.

**Priority:** P1

---

### 10. Asymmetric autonomy: trusted to brake, gated to accelerate

**Palette demands:** Agent layer fires brakes (auto-decline, auto-archive, auto-route) autonomously; outbound/commitments require explicit confirmation; a HOLD command pauses all autonomy.

**Build today:** Missing both directions. `amp_runnable` (`db.js:95`) is a single boolean per task — no distinction between brake actions and acceleration actions. No agent-action log table — when an agent does something, it appears as a `task_comments` row with `author='glean'|'slack'|'gmail'|'gemini'` (`enrich-ingest.js`) but there's no separate audit surface, no reversibility, no "this was an autonomous action" annotation. No HOLD command anywhere in the UI or API. The delegation table tracks human-to-agent (`task_delegations`) but not agent-initiated actions on Jordan's surface.

**Gap:** missing — autonomy is undifferentiated, unaudited, and unpausable.

**Fix sketch:** Non-trivial. (a) New table `agent_actions (id, agent, action_type, action_class, target_kind, target_id, payload_json, executed_at, reversed_at)` where `action_class ∈ {brake, accelerate}`. (b) Agents writing to the dash must POST to `/api/agent-actions` rather than direct-mutating; route enforces that `accelerate` actions require `?confirmed_by=jordan&token=...`. (c) New global HOLD endpoint `POST /api/hold` + `GET /api/hold-status`; ingest scripts check status and short-circuit when held. (d) `index.html` chrome top-right: persistent `⏸ HOLD ALL` button that flips the flag. (e) Audit view listing recent agent_actions with reverse-button. ~200 lines + retrofit of every ingest script.

**Priority:** P1

---

### 11. Modes are declared and visible

**Palette demands:** Named dashboard modes (deep work / triage / crisis / OOO / meeting-heavy) each with a pre-agreed playbook; active mode always visible in chrome; mode flips are deliberate and logged; crisis mode declares a Schwerpunkt.

**Build today:** Missing. No mode register anywhere — `grep mode` in `index.html` returns delegation `mode` (assign/collaborate/review/escalate) and calendar `calViewMode` (month/week), neither of which is a dashboard operating mode. No way to flip into crisis. No Schwerpunkt — the H2'26 planning view has no "this project wins all ties this week" marker. Every signal carries the same weight every session.

**Gap:** missing — no mode register, no Schwerpunkt.

**Fix sketch:** (a) Add `state (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)` table in `db.js`; seed with `mode='triage'`, `schwerpunkt_project_id=NULL`. (b) New routes `GET/PUT /api/mode` and `GET/PUT /api/schwerpunkt`. (c) `index.html` topbar (`index.html:1082-1091`): add a mode selector pill `🎚 Triage ▾` with dropdown {Deep Work, Triage, Crisis, OOO, Meeting-Heavy}; current mode controls which decision kinds rise (Deep Work → only escalations; Crisis → only Schwerpunkt-tagged items). (d) When mode=Crisis, prompt for Schwerpunkt selection; pin that project to top of Control Center with a 🎯 ring. (e) Mode flips write to a `mode_log` table. ~100 lines.

**Priority:** P0

---

### 12. The surface is itself an audited artifact

**Palette demands:** Every surfacing rule has owner + rationale + review date; dashboard exposes its own interruption rate per channel per day; Jordan's dispositions become training signal that tunes future surfacing.

**Build today:** Missing. There are no surfacing rules as data — the rules are hardcoded into `server.js` (the decisions ORDER BY at `:389-396`, the adjudication buckets at `:251-291`). No rule has an owner field, a rationale, a review date. The dashboard exposes zero metrics about itself — there is no "interruption rate" anywhere. Jordan's dispositions on decisions (`/api/decisions/:id/resolve`) update `resolved_at` but do not feed back into any tuning loop — the 78 already-resolved decisions are dead weight, not training signal. No `disposition` column distinguishing "acted-on" from "spiked" from "deferred."

**Gap:** missing — the surface is unaudited and self-blind.

**Fix sketch:** (a) Add `disposition TEXT` to `decisions` (`acted | spiked | deferred | wrong_call`); rename `/api/decisions/:id/resolve` to accept `{disposition}` body. (b) New `surfacing_rules` table (overlaps with Principle #2 fix). (c) New `GET /api/audit/interruption-rate` returning per-channel-per-day counts of decisions surfaced × disposition split. (d) New view `📊 Audit` in sidebar `index.html:1018-1029` rendering: total rules, oldest unreviewed rule, interruption rate vs budget, false-positive rate (spiked disposition / total). (e) Persist `last_reviewed_at` on rules; flag rules unreviewed > 90 days. ~150 lines + the operator habit of choosing a disposition.

**Priority:** P1

---

## What palette refuses vs. what build does

- **"No infinite scroll, no unbounded feed."** — Build VIOLATES. `GET /api/activity` (`server.js:220-246`) is bounded only by client `?limit=` defaulting to 50 capped at 200; `GET /api/decisions` (`server.js:377-398`) has no LIMIT at all and returns all open decisions every render. Activity view (`index.html:1620-1642`) renders `rows.length` with no per-session cap. **Fix:** `server.js:382-396`: hard-cap decisions at `LIMIT 12` per kind; when capped, return a `more_count` so the UI can render a single "+N triaged out" line per the Red-Box-closes principle.

- **"No notification badges without a decision attached."** — Build VIOLATES. The sidebar carries 10 raw count badges (`index.html:1579-1604`) — `count-all`, `count-today`, `count-p0`, etc. — none of which resolve to a specific decision. **Fix:** `index.html:990-1029`: remove all `<span class="nav-count">` raw counters; replace with state-color dots only (green=quiet, amber=has decisions, red=has escalations), and let click-through reveal the specific tiles.

- **"No FYI notifications outside the digest."** — Build VIOLATES. The Control Center renders 36 `fyi` decisions inline alongside `your_move` and `escalation` (`index.html:1850`). **Fix:** `index.html:1846-1854`: drop `kindSection('fyi', byKind.fyi)` from the live Control Center; route fyi rows to a new `/api/digest/morning` + `/api/digest/eod` aggregation rendered only on the Handoff view (see Principle #8 fix).

- **"No severity score the human must translate into an action."** — Build VIOLATES. Tasks carry both `priority` (P0-P3) and `severity` (critical/high/medium/low — `db.js:16`); neither comes with a joint action. The detail-panel modal exposes both as raw selects (`index.html:1278-1284` + `:1362-1368`) — Jordan must translate the combo into "what do I do." **Fix:** `db.js:16`: drop `severity` column (or fold into priority). `index.html:1278-1284`: rename P0/P1/P2/P3 options to carry the joint action ("P0 — Drop everything", "P1 — Resolve this week", etc.) and enforce via `next_action` required at P0.

- **"No status row that is also an actionable item."** — Build VIOLATES. The decisions list has `fyi` (status) and `your_move` (actionable) rows visually adjacent (`index.html:1846-1851`), styled identically except for kind-badge color — same row class, same click behavior. **Fix:** Same as the FYI-digest fix above (move fyi off the live surface entirely). Additionally `index.html:178-202`: give `your_move` rows a distinct `.decision-row-active` class with thicker border + commit button; `fyi` rows get `.decision-row-status` with no button at all.

- **"No command-as-status."** — Build complies. The `tasks_updated_at` trigger (`db.js:53-57`) and `decisions.resolved_at` writes record actual state; ingest comments are explicitly labeled with the source agent (`enrich-ingest.js:72,91,110,132`). No place where "agent drafted X" reads as "X was sent."

- **"No silent autonomy."** — Build PARTIALLY VIOLATES. Ingest scripts (`ingest-synthesis.js`, `ingest-discovery.js`, `enrich-ingest.js`) mutate the DB directly without a per-action audit log; agent actions appear as comments but are not separately attributable, reviewable, or reversible. There is no continuous "agent's current mode / current goal / next intended action" surface. **Fix:** Same as Principle #10 — the `agent_actions` audit table covers this commitment too.

## Punch list (P0 only, implementation order)

1. **`index.html:1019-1029` + `server.js:42`** — Demote "My Queue" (free-floating tasks) below Roadmaps in sidebar; make Control Center the only landing surface; reject task POSTs with `priority='P0'` and no `next_action`. Establishes decisions as the queue primitive. (Principle #1)
2. **`index.html:1606-1610` + `index.html:1837-1856` + new `surfacing_rules` table** — Hide count chips and decision sections when zero; show "all clear" steady-state; add interruption-budget rule schema + audit metric. Establishes silence-by-default. (Principle #2)
3. **`index.html:1776-1790` + `index.html:2080-2102` + `ingest-synthesis.js:43-51`** — Collapse decision-evidence behind a toggle; require `next_action` on P0/P1 task cards (show "no recommended action" badge when missing); enforce action-verb prefix on `your_move` decision titles. Establishes synthesis-first. (Principle #3)
4. **`db.js` ALTER + `server.js:377-398` + `index.html:1841-1843`** — Add `response_window_hours` + `joint_action` to decisions; add `/api/tier-drift` route; render P0-inflation banner when >20%. Establishes tiers-as-time-to-act. (Principle #4)
5. **New `sessions` + `worries` tables + `GET /api/handoff` + `index.html:1469`** — Replace landing with a Handoff view ("since last visit" delta, active your_moves, worries list, escalations); session-close snapshot on `beforeunload`. Establishes the handoff artifact. (Principle #8)
6. **New `state` table + topbar mode pill + Schwerpunkt** — Add mode register (Deep Work / Triage / Crisis / OOO / Meeting-Heavy); each mode reshapes which decision kinds surface; Crisis mode requires a Schwerpunkt project pinned to top. Establishes declared modes. (Principle #11)
