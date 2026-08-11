const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Resolve the DB path with this precedence:
//   1. $AMP_TASKS_DB explicit override
//   2. XDG runtime location ($XDG_DATA_HOME/amp-tasks/tasks.db, defaulting
//      to ~/.local/share/amp-tasks/tasks.db) — this is the deployed runtime
//      per docs/continuity.md (moved out of ~/Documents to escape TCC FDA).
//   3. Co-located fallback (apps/amp-tasks/tasks.db) for fresh clones / tests.
function resolveDbPath() {
  if (process.env.AMP_TASKS_DB) return process.env.AMP_TASKS_DB;
  const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const xdgPath = path.join(xdgData, 'amp-tasks', 'tasks.db');
  if (fs.existsSync(xdgPath)) return xdgPath;
  return path.join(__dirname, 'tasks.db');
}

const db = new Database(resolveDbPath());

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    owner TEXT NOT NULL DEFAULT 'jordan',  -- 'jordan', 'amp', 'both'
    project TEXT,
    department TEXT,
    tags TEXT DEFAULT '[]',               -- JSON array of strings
    priority TEXT DEFAULT 'P2',           -- P0, P1, P2, P3
    severity TEXT DEFAULT 'medium',       -- critical, high, medium, low
    status TEXT DEFAULT 'todo',           -- todo, in-progress, blocked, done, paused, waiting
    flags TEXT DEFAULT '[]',              -- JSON array: urgent, needs-decision, waiting-on-processor, waiting-on-legal, etc.
    time_horizon TEXT DEFAULT 'this-week',-- today, this-week, this-month, long-term
    blocked_reason TEXT,
    due_date TEXT,
    links TEXT DEFAULT '[]',              -- JSON array of {label, url, type}
    notes TEXT,
    waiting_on TEXT,                      -- person/team blocking progress
    next_action TEXT,                     -- immediate next concrete step
    stakeholders TEXT DEFAULT '[]',       -- JSON array of person names involved
    amp_runnable INTEGER DEFAULT 0,       -- 1 = Amp can execute autonomously
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    status TEXT DEFAULT 'active',         -- active, backlog, dormant, done
    color TEXT DEFAULT '#6366f1',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT,
    team TEXT,
    area TEXT,                            -- their org area / domain
    relationship TEXT DEFAULT 'stakeholder', -- counterpart, manager, skip-level, peer, stakeholder, xfn, buddy, report
    notes TEXT,
    slack_handle TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TRIGGER IF NOT EXISTS tasks_updated_at
    AFTER UPDATE ON tasks
    BEGIN
      UPDATE tasks SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS task_delegations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'assign',   -- assign, collaborate, review, escalate
    context TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author TEXT NOT NULL DEFAULT 'jordan',
    body TEXT NOT NULL,
    mentions TEXT DEFAULT '[]',            -- JSON array of @mentioned agents/people
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    linked_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    link_type TEXT DEFAULT 'related',      -- related, blocks, blocked-by, parent, child
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(task_id, linked_task_id)
  );
`);

// ── Fleet audit trail (first-class, queryable, durable) ──
// Every Cycle-B (and future fleet-worker) execution is recorded here with full
// provenance. routines.jsonl stays the append-only portable log (conventions §2);
// these tables are the SQL surface the Fleet Console reads. Dual-write is
// intentional: JSONL = harness-neutral audit; DB = queryable management view.
db.exec(`
  CREATE TABLE IF NOT EXISTS fleet_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,           -- matches routines.jsonl run_id
    worker TEXT NOT NULL,                   -- 'amp-adjudicate', future workers…
    host TEXT NOT NULL DEFAULT 'local',     -- 'local' (launchd) | 'cloud-runner' (cloud run)
    model TEXT,
    status TEXT NOT NULL DEFAULT 'running', -- running, ok, partial, degraded, crashed
    considered INTEGER DEFAULT 0,           -- flagged items seen
    reasoned INTEGER DEFAULT 0,             -- items actually reasoned over
    staged INTEGER DEFAULT 0,
    noise INTEGER DEFAULT 0,
    escalated INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT
  );

  CREATE TABLE IF NOT EXISTS fleet_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,                   -- FK-ish to fleet_runs.run_id
    task_id INTEGER,                        -- may be null for non-task decisions
    worker TEXT NOT NULL DEFAULT 'amp-adjudicate',
    bucket TEXT,                            -- which rule flagged it
    verdict TEXT,                           -- 'staged' | 'noise' | 'escalate'
    noise INTEGER DEFAULT 0,
    escalate INTEGER DEFAULT 0,
    read TEXT,                              -- the situation read
    next_step TEXT,
    owner TEXT,                             -- jordan | amp | waiting
    confidence REAL,
    rationale TEXT,
    model TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_fleet_decisions_run ON fleet_decisions(run_id);
  CREATE INDEX IF NOT EXISTS idx_fleet_decisions_task ON fleet_decisions(task_id);
`);

// Migrate: add new columns if they don't exist yet
const newCols = [
  "ALTER TABLE tasks ADD COLUMN waiting_on TEXT",
  "ALTER TABLE tasks ADD COLUMN next_action TEXT",
  "ALTER TABLE tasks ADD COLUMN stakeholders TEXT DEFAULT '[]'",
  "ALTER TABLE tasks ADD COLUMN amp_runnable INTEGER DEFAULT 0",
  "ALTER TABLE tasks ADD COLUMN cycle TEXT",
  "ALTER TABLE tasks ADD COLUMN okr TEXT",
  "ALTER TABLE tasks ADD COLUMN merchant TEXT",
  "ALTER TABLE projects ADD COLUMN area TEXT",
  "ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT 'task'",   // task, bug, feature, research, decision
  "ALTER TABLE tasks ADD COLUMN mission TEXT",
  "ALTER TABLE tasks ADD COLUMN assignee TEXT",
  "ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT 'manual'",    // manual, agent, api
  "ALTER TABLE tasks ADD COLUMN short_id TEXT",
];
for (const sql of newCols) {
  try { db.exec(sql); } catch (e) { /* already exists */ }
}

// Backfill short_ids now that the column is guaranteed to exist (must run AFTER the ALTERs above)
db.prepare(`UPDATE tasks SET short_id = printf('T%08X', id) WHERE short_id IS NULL`).run();

// ── decisions (self-healing base schema) ──
// The decisions table + the rich projects.* synth columns historically lived
// only in the runtime DB (added out-of-band), so a fresh clone silently lost
// them and every downstream ALTER/INSERT no-op'd. Codify them here so the
// schema is reconstructable from version control (SSOT discipline).
db.exec(`
  CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,                   -- your_move | escalation | confirmation | fyi
    title TEXT NOT NULL,
    body TEXT,
    source_artifact_id INTEGER,
    due_date TEXT,
    resolved_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
// Self-heal the rich projects columns (no-ops where they already exist).
const projectSelfHeal = [
  "ALTER TABLE projects ADD COLUMN roadmap TEXT",
  "ALTER TABLE projects ADD COLUMN theme TEXT",
  "ALTER TABLE projects ADD COLUMN priority TEXT",
  "ALTER TABLE projects ADD COLUMN pcr TEXT",
  "ALTER TABLE projects ADD COLUMN kr TEXT",
  "ALTER TABLE projects ADD COLUMN eng_weeks INTEGER",
  "ALTER TABLE projects ADD COLUMN target TEXT",
  "ALTER TABLE projects ADD COLUMN summary TEXT",
  "ALTER TABLE projects ADD COLUMN source_url TEXT",
  "ALTER TABLE projects ADD COLUMN status_synthesis TEXT",
  "ALTER TABLE projects ADD COLUMN blocker TEXT",
  "ALTER TABLE projects ADD COLUMN your_move TEXT",
  "ALTER TABLE projects ADD COLUMN health TEXT",
  "ALTER TABLE projects ADD COLUMN last_synthesis_at TEXT",
];
for (const sql of projectSelfHeal) { try { db.exec(sql); } catch (e) {} }

// ── surface-palette P0-4 (Principle #4 — tiers = time-to-act, not data importance) ──
// Decisions get an SLA per kind. Defaults per the palette:
//   your_move    → 24h / "act or delegate"
//   escalation   →  4h / "acknowledge to source"
//   confirmation → 72h / "ratify or reject"
//   fyi          → null (no SLA; batched read)
const p04DecisionAlters = [
  "ALTER TABLE decisions ADD COLUMN response_window_hours INTEGER",
  "ALTER TABLE decisions ADD COLUMN joint_action TEXT",
];
for (const sql of p04DecisionAlters) {
  try { db.exec(sql); } catch (e) { /* already exists */ }
}
// Backfill defaults — only set when NULL so manual overrides survive re-runs.
const DEFAULTS = {
  your_move:    { hours: 24,  action: 'act or delegate' },
  escalation:   { hours:  4,  action: 'acknowledge to source' },
  confirmation: { hours: 72,  action: 'ratify or reject' },
  fyi:          { hours: null, action: null },
};
const setSla = db.prepare(`
  UPDATE decisions
     SET response_window_hours = COALESCE(response_window_hours, ?),
         joint_action          = COALESCE(joint_action, ?)
   WHERE kind = ?
`);
for (const [kind, d] of Object.entries(DEFAULTS)) {
  setSla.run(d.hours, d.action, kind);
}

// ── closed-loop: reason → VERIFY → gated write-back → resolve ──
// The synthesis pass proposes; an independent verify pass confirms/contradicts
// BEFORE anything reaches a surface. Confidence + verdict are carried on both
// the project (its current synthesized state) and each decision (the actionable
// unit), so the UI can show provenance and refuse to surface unverified claims.
const closedLoopAlters = [
  // projects: outcome of the verify stage over the latest synthesis
  "ALTER TABLE projects ADD COLUMN synth_confidence REAL",   // 0..1 (verified)
  "ALTER TABLE projects ADD COLUMN synth_verdict TEXT",      // confirmed | needs_evidence | contradicted
  "ALTER TABLE projects ADD COLUMN synth_verified_at TEXT",
  "ALTER TABLE projects ADD COLUMN synth_note TEXT",         // verifier's one-line rationale
  // decisions: provenance + lifecycle so the loop can actually CLOSE
  "ALTER TABLE decisions ADD COLUMN confidence REAL",        // verified confidence at write-back
  "ALTER TABLE decisions ADD COLUMN verdict TEXT",           // verify verdict that let it through
  "ALTER TABLE decisions ADD COLUMN origin TEXT",            // synthesis | seed | manual
  "ALTER TABLE decisions ADD COLUMN acknowledged_at TEXT",
  "ALTER TABLE decisions ADD COLUMN resolved_by TEXT",       // jordan | amp
  "ALTER TABLE decisions ADD COLUMN resolution TEXT",        // acknowledged | ratified | rejected | resolved
  "ALTER TABLE decisions ADD COLUMN superseded_by INTEGER",  // newer decision that replaced this one
];
for (const sql of closedLoopAlters) { try { db.exec(sql); } catch (e) {} }
// Existing 142 seed decisions predate provenance — tag them so the UI can
// distinguish hand-seeded rows from synthesized+verified ones.
try { db.exec("UPDATE decisions SET origin = 'seed' WHERE origin IS NULL"); } catch (e) {}

// State keys for honest-freshness tracking (the dashboard reads these to show
// how stale each stage's inputs are, and to cap confidence on stale inputs).
// The state table is (re)created idempotently here so these seeds are safe even
// though the canonical state block lives further down.
db.exec(`CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now'))
);`);
const seedStateEarly = db.prepare(`INSERT OR IGNORE INTO state (key, value) VALUES (?, ?)`);
seedStateEarly.run('last_jira_sync_at', '');
seedStateEarly.run('last_cycle_b_at', '');
seedStateEarly.run('last_synthesis_at', '');
seedStateEarly.run('last_verify_at', '');
seedStateEarly.run('last_email_sync_at', '');
seedStateEarly.run('last_email_verify_at', '');

// ── EMAIL PLANE ────────────────────────────────────────────────────────────
// Email is a first-class plane in the control-center OS — same source→ingest→
// DB→API→UI→action→verify loop as the projects/decisions dash, NOT a pile of
// Desktop JSON blobs keyed by Gmail id (the regressed state we're replacing).
// Four durable entities, all reconstructable from version control:
//
//   email_items       (EmailItem)    — a triaged inbox unit, one row per thread
//   email_commitments (Commitment)   — extracted "I will do X by Y" promises
//   email_drafts      (DraftRecord)  — proposed replies + their verify verdict
//   email_events      (RoutineEvent) — append-only audit of what the plane did
//
// Natural key everywhere is the Gmail thread_id / msg_id so ingest is idempotent
// and the historical blobs migrate cleanly. Reads are sensor work (allowed);
// nothing here sends/trashes/forwards — drafts only, per the actuator floor.
db.exec(`
  CREATE TABLE IF NOT EXISTS email_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id   TEXT UNIQUE NOT NULL,          -- Gmail thread id (natural key)
    msg_id      TEXT,                          -- latest message id in thread
    subject     TEXT,
    sender      TEXT,                          -- display name
    sender_email TEXT,
    snippet     TEXT,                          -- short preview / summary
    route       TEXT,                          -- needs_you | fyi | calendar | automated | external | inbox
    gmail_label TEXT,                          -- Label_3.. applied by triage
    tier        INTEGER,                       -- stakeholder tier 1..3 (from tier-overrides/stakeholders)
    has_question INTEGER DEFAULT 0,            -- direct ask to Jordan?
    status      TEXT DEFAULT 'open',           -- open | acked | snoozed | done | archived
    snooze_until TEXT,                         -- ISO resurface date when snoozed
    priority    TEXT,                          -- high | normal | low (surfacing weight)
    received_at TEXT,                          -- ISO of latest message
    ingested_at TEXT DEFAULT (datetime('now')),
    acted_at    TEXT,                          -- when Jordan/amp resolved it
    acted_by    TEXT,                          -- jordan | amp
    -- closed-loop provenance (mirrors projects.synth_*)
    synth_summary TEXT,                        -- one-line "why this matters / what's the ask"
    confidence  REAL,                          -- verified confidence of the triage/summary
    verdict     TEXT,                          -- confirmed | needs_evidence | contradicted
    verified_at TEXT,
    note        TEXT                           -- verifier rationale
  );

  CREATE TABLE IF NOT EXISTS email_commitments (
    id          TEXT PRIMARY KEY,              -- stable slug (e.g. northwind-capture-confirm-20260512)
    text        TEXT NOT NULL,
    source      TEXT,                          -- gemini | email | manual
    source_link TEXT,
    recipient   TEXT,
    tier        INTEGER,
    due_iso     TEXT,
    status      TEXT DEFAULT 'open',           -- open | done | missed | dropped
    email_item_id INTEGER REFERENCES email_items(id) ON DELETE SET NULL,
    extracted_at TEXT,
    resolved_at TEXT,
    resolution  TEXT
  );

  CREATE TABLE IF NOT EXISTS email_drafts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email_item_id INTEGER REFERENCES email_items(id) ON DELETE CASCADE,
    thread_id   TEXT,                          -- redundant natural key for migration
    gmail_draft_id TEXT,                       -- id of the draft saved in Gmail (if any)
    body        TEXT,
    tone        TEXT,                          -- direct | warm | push back | default
    status      TEXT DEFAULT 'proposed',       -- proposed | blocked | ready | approved | sent | discarded
    blocked_reason TEXT,                       -- why triage couldn't auto-draft
    -- closed-loop: a draft is not "ready" until an independent reviewer confirms
    -- it matches voice + invents no claims (anti-false-info, same as dash verify)
    confidence  REAL,
    verdict     TEXT,                          -- confirmed | needs_evidence | contradicted
    verified_at TEXT,
    note        TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT DEFAULT (datetime('now')),
    routine     TEXT,                          -- triage | draft | verify | ack | snooze | done | sync
    action      TEXT,
    thread_id   TEXT,
    detail      TEXT
  );

  -- ── inbox sweep (ADR-0015) ──────────────────────────────────────────────
  -- One row per PROPOSED reversible action (archive/trash/label). Nothing here
  -- has fired until status='executed'. pre_state captures what to restore for a
  -- one-click UNDO (label set + INBOX membership before the action). The review
  -- agent's verdict + the deterministic guardrail outcome both live on the row,
  -- so every destructive action is fully accountable after the fact.
  CREATE TABLE IF NOT EXISTS email_sweep_actions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id     TEXT,
    msg_id        TEXT,
    subject       TEXT,
    sender        TEXT,
    sender_email  TEXT,
    action        TEXT,                          -- keep | archive | trash | label
    label         TEXT,                          -- target label when action='label'
    reason        TEXT,                          -- classifier's one-line rationale
    tier          INTEGER,                       -- sender tier (guardrail input)
    guardrail     TEXT DEFAULT 'pass',           -- pass | downgraded:<why> | blocked:<why>
    review_verdict TEXT,                         -- approve | reject | (null if not destructive)
    review_conf   REAL,
    review_note   TEXT,
    status        TEXT DEFAULT 'proposed',       -- proposed | approved | executed | undone | rejected | skipped
    batch_key     TEXT,                          -- groups proposals for batch approval (action+reason bucket)
    pre_state     TEXT,                          -- JSON: labels/INBOX membership before execute (for undo)
    executed_at   TEXT,
    undone_at     TEXT,
    run_id        TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_email_items_status ON email_items(status);
  CREATE INDEX IF NOT EXISTS idx_email_items_route  ON email_items(route);
  CREATE INDEX IF NOT EXISTS idx_email_drafts_item  ON email_drafts(email_item_id);
  -- one physical Gmail draft may back at most one ACTIVE row; terminal rows
  -- (sent/discarded/blocked) are history and may repeat. Prevents the dup-row
  -- churn that had 9 cycle runs each inserting a fresh row per draft.
  CREATE UNIQUE INDEX IF NOT EXISTS ux_email_drafts_active_gdraft ON email_drafts(gmail_draft_id)
    WHERE gmail_draft_id IS NOT NULL AND status IN ('ready','proposed','approved');
  -- Fast lookup for refreshStaleDrafts()'s idempotency guard: skip a draft already
  -- logged 'discarded' so the undeletable Gmail draft isn't re-classified + re-logged
  -- every cycle (the "132 discarded" churn artifact).
  CREATE INDEX IF NOT EXISTS idx_email_drafts_gdraft_status ON email_drafts(gmail_draft_id, status);
  -- ADR-0016 learning loop: observed human dispositions of staged artifacts.
  CREATE TABLE IF NOT EXISTS email_dispositions (
    id INTEGER PRIMARY KEY,
    email_item_id INTEGER,
    thread_id TEXT,
    plane TEXT,                 -- draft | sweep | needs_you
    action TEXT,                -- sent | discarded | restored | kept
    detail TEXT,
    observed_at TEXT DEFAULT (datetime('now')),
    UNIQUE(thread_id, plane, action)
  );
  CREATE INDEX IF NOT EXISTS idx_email_disp_item ON email_dispositions(email_item_id);
  CREATE INDEX IF NOT EXISTS idx_email_commit_status ON email_commitments(status);
  CREATE INDEX IF NOT EXISTS idx_email_sweep_status ON email_sweep_actions(status);
  CREATE INDEX IF NOT EXISTS idx_email_sweep_batch  ON email_sweep_actions(batch_key);

  -- ── Gemini meeting transcripts (transcript-first ground truth) ───────────
  -- Jordan's Gemini meeting emails only carry a summary + next-steps; the VALUABLE
  -- artifact is the RAW TRANSCRIPT (timestamped, speaker-by-speaker) living in the
  -- linked "Notes by Gemini" Google Doc. A Google Apps Script archiver logs every
  -- meeting → doc URL into a Google Sheet (the SPINE / queue). enrich-gemini.js
  -- --capture pulls each doc's full text to disk (transcript_path) as first-party
  -- ground truth (enriched=0); --enrich then runs an LLM pass over the raw file to
  -- extract tldr/decisions/commitments/next-steps and match to a task (enriched=1).
  -- The raw file on disk is the source of truth; DB holds the index + distillation.
  CREATE TABLE IF NOT EXISTS meeting_transcripts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id          TEXT UNIQUE NOT NULL,        -- google doc id (from the doc URL) — natural key
    doc_url         TEXT,                        -- full "Notes by Gemini" doc URL
    meeting_title   TEXT,
    meeting_date    TEXT,                        -- best-effort ISO/date from Sheet col A or title
    participants    TEXT,                        -- best-effort, comma-separated or JSON
    transcript_path TEXT,                        -- path to the raw .txt on disk (ground truth)
    char_count      INTEGER,                     -- size of the raw doc text
    summary         TEXT,                        -- captured (Gemini section) or LLM tldr
    next_steps      TEXT,                        -- captured section or LLM-extracted (json/text)
    commitments     TEXT,                        -- JSON array [{who,what,due?}] from --enrich
    task_id         INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    enriched        INTEGER DEFAULT 0,           -- 0=raw captured only, 1=LLM-enriched
    source          TEXT DEFAULT 'gemini',
    captured_at     TEXT,                        -- when the raw text was pulled to disk
    enriched_at     TEXT                         -- when the LLM pass last ran
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_transcripts_doc  ON meeting_transcripts(doc_id);
  CREATE INDEX IF NOT EXISTS idx_meeting_transcripts_date ON meeting_transcripts(meeting_date);
  CREATE INDEX IF NOT EXISTS idx_meeting_transcripts_task ON meeting_transcripts(task_id);
`);

// ── Needs-You Resolutions ──────────────────────────────────────────────────
// Deep-workflow decomposition for email_items with route='needs_you'.
// Each row is the full reasoning pass for one email item: classified type,
// cross-system context gathered (email thread + meeting transcripts + jira/doc
// as relevant), decomposed ask/decision/next_steps, proposed reversible draft
// action, and an independent verify verdict. draft_action is STAGED text only —
// no actuation happens here. automation_tier follows the surface-palette ladder:
//   0 = surface only  1 = decomposed  2 = draft-staged  3 = one-click-ready
db.exec(`
  CREATE TABLE IF NOT EXISTS needs_you_resolutions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email_item_id   INTEGER UNIQUE REFERENCES email_items(id) ON DELETE CASCADE,
    source_kind     TEXT,           -- 'email' | 'commitment' | 'task'
    source_ref      TEXT,           -- thread_id / commitment id / task id
    item_type       TEXT,           -- 'jira_mention'|'doc_signoff'|'external_reply'|'exec_escalation'|'meeting_followup'|'other'
    ask             TEXT,           -- one line: what is being asked OF Jordan
    decision        TEXT,           -- what Jordan must decide/do
    next_steps      TEXT,           -- JSON array of {step,effort:'S|M|L',can_automate:bool,rationale}
    draft_action    TEXT,           -- proposed REVERSIBLE staged action; NEVER executed here
    context         TEXT,           -- JSON array of {system,ref,url,excerpt}
    automation_tier INTEGER,        -- 0 surface, 1 decomposed, 2 draft-staged, 3 one-click-ready
    confidence      REAL,
    verdict         TEXT,           -- confirmed|needs_evidence|contradicted (from verify pass)
    status          TEXT DEFAULT 'proposed',  -- proposed|ready|acted|dismissed
    created_at      TEXT DEFAULT (datetime('now')),
    verified_at     TEXT,
    note            TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_nyr_status    ON needs_you_resolutions(status);
  CREATE INDEX IF NOT EXISTS idx_nyr_item_type ON needs_you_resolutions(item_type);
`);

// ── surface-palette P0-2 (Principle #2 — silence-by-default) ──
// Each rule that can surface something on the dashboard carries an owner, a
// written rationale, and a per-day budget. The aggregator (/api/interruption-
// budget) compares actual surface events against the sum of budgets.
db.exec(`
  CREATE TABLE IF NOT EXISTS surfacing_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL UNIQUE,
    owner TEXT NOT NULL DEFAULT 'jordan',
    rationale TEXT,
    budget_per_day INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    last_reviewed_at TEXT
  );
`);
// Seed default rules if empty (idempotent — only inserts when row absent).
const seedRule = db.prepare(`
  INSERT OR IGNORE INTO surfacing_rules (channel, owner, rationale, budget_per_day)
  VALUES (?, ?, ?, ?)
`);
seedRule.run('decision.your_move',    'amp', 'Actionable items requiring Jordan to act/delegate within 24h.', 4);
seedRule.run('decision.escalation',   'amp', 'External or cross-team escalation needing Jordan to acknowledge within 4h.', 2);
seedRule.run('decision.confirmation', 'amp', 'Items where Jordan must ratify or reject a proposed move within 72h.', 3);
seedRule.run('decision.fyi',          'amp', 'Background context for situational awareness; should be batched, not interruptive.', 3);

// ── surface-palette P0-5 (Principle #8 — handoff as artifact) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opened_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT,
    snapshot_json TEXT
  );

  CREATE TABLE IF NOT EXISTS worries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    observed_by_agent TEXT NOT NULL DEFAULT 'amp',
    body TEXT NOT NULL,
    severity TEXT DEFAULT 'low',  -- low | medium | high
    observed_at TEXT NOT NULL DEFAULT (datetime('now')),
    escalated_at TEXT,
    resolved_at TEXT
  );
`);
// Projects gets a last_observed_activity_at for the silence detection
// half of Principle #9. Full silence pass is a separate P1 — for P0-5 we
// just surface projects whose value is NULL/stale into worries.
try { db.exec("ALTER TABLE projects ADD COLUMN last_observed_activity_at TEXT"); } catch (e) {}

// ── decision-class axis (amp-system-spec §8A#1) ──
// The one structurally-missing field: does a decision belong to the fleet
// (objective, mechanically decidable) or to Jordan (subjective, his call)?
// PURE MODELING/OBSERVABILITY — decoupled from the existing escalate/verdict
// routing. NOTHING here wires objective_auto → act; graduation-to-act (§8A#3)
// is a separate, floor-gated, Jordan-ratified step. Additive columns only;
// existing rows get NULL ('unclassified').
const decisionClassAlters = [
  "ALTER TABLE fleet_decisions ADD COLUMN decision_class TEXT",            // objective_auto | subjective_principal | unclear
  "ALTER TABLE fleet_decisions ADD COLUMN class_confidence REAL",         // 0..1, reasoner's confidence in the classification
  "ALTER TABLE fleet_decisions ADD COLUMN class_rationale TEXT",          // one line: why this class
  "ALTER TABLE needs_you_resolutions ADD COLUMN decision_class TEXT",
  "ALTER TABLE needs_you_resolutions ADD COLUMN class_confidence REAL",
  "ALTER TABLE needs_you_resolutions ADD COLUMN class_rationale TEXT",
];
for (const sql of decisionClassAlters) { try { db.exec(sql); } catch (e) {} }

// ── surface-palette P0-6 (Principle #11 — modes are declared and visible) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mode_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_mode TEXT,
    to_mode TEXT NOT NULL,
    reason TEXT,
    schwerpunkt_project_id INTEGER,
    flipped_at TEXT DEFAULT (datetime('now'))
  );
`);
const seedState = db.prepare(`INSERT OR IGNORE INTO state (key, value) VALUES (?, ?)`);
seedState.run('mode', 'triage');
seedState.run('schwerpunkt_project_id', '');

// Seed projects (EXAMPLE — replace with your own)
const seedProjects = db.prepare(`INSERT OR IGNORE INTO projects (name, description, status, color) VALUES (?, ?, ?, ?)`);
const projects = [
  ['Debit Hanging Auth', 'Hanging auth / double-hold issue for a retailer\'s debit customers', 'active', '#ef4444'],
  ['Installments', 'Installments PRD — single-use auth, target ship this quarter', 'active', '#f59e0b'],
  ['Benefits Rollout', 'Contract vs. roadmap conflict — deadline this quarter', 'active', '#f97316'],
  ['Compliance', 'PROJ-000 — share of benefits spend at risk', 'active', '#dc2626'],
  ['Discovery', 'New-area onboarding — weekly syncs started', 'active', '#8b5cf6'],
  ['Learning Series', 'Later phase — not started', 'backlog', '#6366f1'],
  ['Onboarding', 'Employee onboarding tasks', 'active', '#10b981'],
  ['Infrastructure', 'Agent/principal tooling and memory systems', 'active', '#06b6d4'],
];
projects.forEach(p => seedProjects.run(...p));

// Set area on projects
const areaMap = {
  'Debit Hanging Auth': 'Core Payments',
  'Installments':       'Alt Payments',
  'Benefits Rollout':   'Alt Payments',
  'Compliance':         'Alt Payments',
  'Discovery':          'Alt Payments',
};
const setArea = db.prepare('UPDATE projects SET area = ? WHERE name = ? AND (area IS NULL OR area != ?)');
for (const [name, area] of Object.entries(areaMap)) {
  setArea.run(area, name, area);
}

// Seed people directory (EXAMPLE — replace with your own; only insert if name not already present)
const seedPerson = db.prepare(`INSERT INTO people (name, role, team, area, relationship, notes, slack_handle) VALUES (?, ?, ?, ?, ?, ?, ?)`);
const people = [
  // name, role, team, area, relationship, notes, slack_handle
  ['Sam Patel', 'Engineering Manager',   'Payments Platform', 'Core Payments', 'counterpart', 'Engineering counterpart. Weekly sync to surface blockers, align on execution, and drive decisions. Appears frequently across tasks — treat the weekly 1:1 as the primary escalation and alignment channel.', null],
  ['Alex Chen',    'VP / Director',          'Platform',          null,            'skip-level',  "Boss's boss. Runs a business review every 6 weeks (one per planning cycle). Key audience for product reviews.", null],
  ['Jamie Wong',     null,                     null,                null,            'buddy',       'Assigned onboarding buddy. Go-to for navigating team norms, unwritten rules, and early questions.', null],
  ['Taylor Cruz',  'Account Executive',      'Processor Vendor',  'Core Payments', 'stakeholder', 'Vendor account exec. Key external contact for the debit hanging-auth investigation and any processor escalations.', null],
  ['Ravi Nair',      'Engineer',               'Payments Platform', 'Core Payments', 'xfn',         'Confirmed a pre-auth flag already live. Useful technical contact on debit auth work.', null],
  ['Robin Park',    'Data Analyst',           'Payments Platform', null,            'xfn',         'Owns the analytics spreadsheet with the debit breakdown. Go-to for payments data.', null],
  ['Shawn Turner',   'Senior PM (departing)',  'Payments Platform', 'Alt Payments',  'peer',        'Departing soon. Handover owner for several PRDs — prioritize knowledge-transfer sessions.', null],
];
const checkPerson = db.prepare('SELECT id FROM people WHERE name = ?');
people.forEach(p => { if (!checkPerson.get(p[0])) seedPerson.run(...p); });

// ── EMAIL RULE BRIDGE (ADR-0015 follow-on; fixes P1-5 + P1-2) ──────────────
// The "extreme to extreme" swing — slow per-thread LLM adjudication vs. blind
// bulk pattern-thrashing — exists because human/agent adjudications never
// COMPILED into executed matcher rules (P1-5), and bulk auto-fired by fiat
// instead of a measured precision gate (P1-2). These two tables are the bridge:
//
//   email_rules            — an EXECUTABLE matcher (sender/domain/subject) → action,
//                            each carrying PROVENANCE (which adjudications produced
//                            it) and PRECISION STATS (applied/agreed/disagreed).
//   email_rule_predictions — every time a rule matches, one row: what the rule
//                            predicted vs. what the full pipeline (or a human)
//                            actually decided. This is the ground-truth ledger the
//                            precision gate reads to graduate a rule.
//
// STATE LADDER (graduation is MEASURED, never by env flag):
//   shadow → rule matches are recorded + compared, but change NOTHING. The LLM
//            pipeline still runs; the rule is only being measured.
//   staged → rule writes a 'proposed' sweep row (needs approval), skipping the LLM.
//   auto   → rule short-circuits straight to its action (fast path, floor-gated,
//            pre_state still captured for undo). Only archive/trash/label rules
//            ever need to reach 'auto'.
//   disabled → demoted (a confirmed miss / restore contradicted it).
//
// ASYMMETRY (this IS "don't mess up my inbox", encoded): a 'protect' rule can
// only ever DOWNGRADE a destructive action to keep — it can over-KEEP but never
// over-delete — so it is safe at 'auto' immediately. An 'archive'/'trash' rule
// can remove mail, so it must EARN 'auto' through applied≥N AND precision≥P.
db.exec(`
  CREATE TABLE IF NOT EXISTS email_rules (
    id           TEXT PRIMARY KEY,            -- stable slug
    kind         TEXT NOT NULL,               -- protect | archive | trash | label
    label        TEXT,                        -- target label when kind='label'
    match_type   TEXT NOT NULL,               -- sender | domain | subject_re | sender+subject_re
    sender       TEXT,                        -- exact sender_email (lowercased) or null
    domain       TEXT,                        -- sender domain (lowercased) or null
    subject_re   TEXT,                        -- JS regex source (case-insensitive) or null
    reason       TEXT,                        -- human-readable why this rule exists
    provenance   TEXT,                        -- JSON {origin, adjudications:[...], created_by, seeded_precision}
    state        TEXT NOT NULL DEFAULT 'shadow', -- shadow | staged | auto | disabled
    applied      INTEGER DEFAULT 0,           -- times matched + recorded
    agreed       INTEGER DEFAULT 0,           -- prediction == ground truth
    disagreed    INTEGER DEFAULT 0,           -- prediction != ground truth (incl. confirmed restores)
    precision    REAL,                        -- agreed/(agreed+disagreed); null until measured
    last_matched_at TEXT,
    created_by   TEXT DEFAULT 'compiler',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_rule_predictions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id       TEXT NOT NULL,              -- FK-ish to email_rules.id
    thread_id     TEXT,
    sender_email  TEXT,
    subject       TEXT,
    predicted     TEXT,                       -- action the rule predicted
    actual        TEXT,                       -- what the pipeline/human decided (null = pending)
    outcome       TEXT DEFAULT 'pending',     -- agree | disagree | pending
    ground_truth  TEXT,                       -- pipeline | human | restore
    run_id        TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    resolved_at   TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_email_rules_state ON email_rules(state);
  CREATE INDEX IF NOT EXISTS idx_email_rules_sender ON email_rules(sender);
  CREATE INDEX IF NOT EXISTS idx_email_rules_domain ON email_rules(domain);
  CREATE INDEX IF NOT EXISTS idx_erp_rule ON email_rule_predictions(rule_id);
  CREATE INDEX IF NOT EXISTS idx_erp_outcome ON email_rule_predictions(outcome);

  CREATE TRIGGER IF NOT EXISTS email_rules_updated_at
    AFTER UPDATE ON email_rules
    BEGIN
      UPDATE email_rules SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
`);

module.exports = db;
