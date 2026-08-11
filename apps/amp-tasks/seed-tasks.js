// seed-tasks.js — populates a fresh task DB with EXAMPLE rows so the dashboard,
// priority model, and enrichment pipeline have something to render on first run.
//
// This is illustrative data, not real work. Replace it with your own once you've
// wired up your sources (Jira/Slack/email/transcripts). Every field maps to a
// column in the `tasks` table (see db.js). `owner: 'amp'` = the agent's queue;
// `owner: 'jordan'` = the principal's queue. `amp_runnable: 1` marks a task the
// agent can drive autonomously (reversible + internal); 0 needs the principal.
const db = require('./db');

const insert = db.prepare(`
  INSERT INTO tasks (title, description, owner, project, department, tags, priority, severity, status, flags, time_horizon, blocked_reason, links, notes, waiting_on, next_action, stakeholders, amp_runnable, merchant)
  VALUES (@title, @description, @owner, @project, @department, @tags, @priority, @severity, @status, @flags, @time_horizon, @blocked_reason, @links, @notes, @waiting_on, @next_action, @stakeholders, @amp_runnable, @merchant)
`);

const L = (items) => JSON.stringify(items); // links/tags/flags/stakeholders helper

const tasks = [
  // ── THE AGENT'S QUEUE (amp_runnable) ────────────────────────────────────
  {
    title: 'Stand up the control plane from the SSOT repo',
    owner: 'amp', project: 'Bootstrap', department: 'Infrastructure',
    priority: 'P0', severity: 'high', status: 'in-progress', time_horizon: 'this-week',
    tags: L(['bootstrap']), flags: L([]), blocked_reason: null,
    links: L([{ label: 'BOOT.md', url: 'docs/BOOT.md', type: 'file' }]), notes: null,
    waiting_on: null, next_action: 'Load boot order: identity → register → floor → decisions → continuity → conventions',
    stakeholders: L([]), amp_runnable: 1,
    description: 'Reconstitute the agent from version control. The harness is swappable; the repo is the source of truth.'
  },
  {
    title: 'Draft the weekly status roll-up',
    owner: 'amp', project: 'Comms', department: 'Operations',
    priority: 'P1', severity: 'medium', status: 'todo', time_horizon: 'this-week',
    tags: L(['comms','recurring']), flags: L([]), blocked_reason: null,
    links: L([]), notes: 'Draft only — sending is an outward actuator, gated to the principal.',
    waiting_on: null, next_action: 'Summarize the week from the task DB into a draft; leave it for review',
    stakeholders: L([]), amp_runnable: 1,
    description: null
  },
  {
    title: 'Enrich open tasks from connected sources',
    owner: 'amp', project: 'Enrichment', department: 'Infrastructure',
    priority: 'P2', severity: 'low', status: 'done', time_horizon: 'this-week',
    tags: L(['enrichment']), flags: L([]), blocked_reason: null,
    links: L([]), notes: 'Complete — pulled comments from the connector map into task threads.',
    waiting_on: null, next_action: null,
    stakeholders: L([]), amp_runnable: 1,
    description: null
  },

  // ── THE PRINCIPAL'S QUEUE ────────────────────────────────────────────────
  {
    title: 'Approve the new outward-actuator gate',
    owner: 'jordan', project: 'Governance', department: 'Infrastructure',
    priority: 'P0', severity: 'high', status: 'todo', time_horizon: 'today',
    tags: L(['floor','decision']), flags: L(['needs-principal']), blocked_reason: null,
    links: L([{ label: 'ADR directory', url: 'docs/decisions/', type: 'file' }]), notes: null,
    waiting_on: null, next_action: 'Review the proposed floor rule + golden tests, then approve or amend',
    stakeholders: L([]), amp_runnable: 0,
    description: 'Adding any outward actuator (send/post/purchase) requires an ADR + explicit sign-off. This is the human-in-the-loop gate.'
  },
  {
    title: 'Onboarding: set up accounts and access',
    owner: 'jordan', project: 'Onboarding', department: 'Operations',
    priority: 'P1', severity: 'medium', status: 'in-progress', time_horizon: 'this-week',
    tags: L(['onboarding']), flags: L([]), blocked_reason: null,
    links: L([]), notes: null,
    waiting_on: 'IT provisioning', next_action: 'Complete SSO enrollment and connector authorization',
    stakeholders: L([]), amp_runnable: 0,
    description: 'Example of a human-owned onboarding task the agent can track but not action.'
  },
  {
    title: 'Decide connector scope for the pilot',
    owner: 'jordan', project: 'Integration', department: 'Infrastructure',
    priority: 'P1', severity: 'medium', status: 'blocked', time_horizon: 'this-week',
    tags: L(['integration','decision']), flags: L([]),
    blocked_reason: 'Waiting on security review of the connector list',
    links: L([]), notes: null,
    waiting_on: 'Security review', next_action: 'Confirm which MCP connectors are in scope for read vs write',
    stakeholders: L(['Security']), amp_runnable: 0,
    description: 'Illustrates a blocked task with a blocked_reason and a waiting_on owner.'
  },
  {
    title: 'Review the priority model weights',
    owner: 'jordan', project: 'Prioritization', department: 'Operations',
    priority: 'P2', severity: 'low', status: 'todo', time_horizon: 'long-term',
    tags: L(['prioritization']), flags: L([]), blocked_reason: null,
    links: L([{ label: 'priority-model.md', url: 'docs/research/priority-model.md', type: 'file' }]), notes: null,
    waiting_on: null, next_action: 'Tune the signals that surface tasks in "Needs You"',
    stakeholders: L([]), amp_runnable: 0,
    description: null
  },
];

const insertMany = db.transaction((rows) => {
  for (const t of rows) insert.run({ merchant: null, ...t });
});

// Idempotent: only seed when the table is empty, so re-running doesn't duplicate.
const existing = db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n;
if (existing > 0) {
  console.log(`Skipped seeding — ${existing} task(s) already present.`);
} else {
  insertMany(tasks);
  console.log(`Seeded ${tasks.length} example tasks.`);
}
