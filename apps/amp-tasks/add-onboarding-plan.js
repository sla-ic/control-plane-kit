// add-onboarding-plan.js
// Seeds the 4-week onboarding plan tasks from the Acme onboarding timeline.
// Started: Mon Mar 9, 2026
// Safe to re-run — skips tasks that already exist by title.

const db = require('./db');

const insert = db.prepare(`
  INSERT INTO tasks (title, description, owner, project, department, tags, priority, severity,
    status, flags, time_horizon, due_date, notes, waiting_on, next_action, stakeholders,
    amp_runnable, cycle, links)
  VALUES (@title, @description, @owner, @project, @department, @tags, @priority, @severity,
    @status, @flags, @time_horizon, @due_date, @notes, @waiting_on, @next_action, @stakeholders,
    @amp_runnable, @cycle, @links)
`);

const L = (v) => JSON.stringify(v);
const existing = new Set(db.prepare('SELECT title FROM tasks').all().map(t => t.title));

const tasks = [
  // ── WEEK 1 (Mar 9–15) — Get situated ──────────────────────────────────────
  {
    title: 'Week 1 · Get set up and explore resources',
    description: 'Laptop, tools, Slack, JIRA, Confluence, codebase access, calendar setup. Explore internal wikis and team docs.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'high', status: 'done',
    time_horizon: 'today', due_date: '2026-03-15',
    tags: L(['onboarding','week1','setup']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: null,
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q1B',
    links: L([]),
  },
  {
    title: 'Week 1 · Start meeting the team',
    description: 'Intro 1:1s with immediate team. Find and review the people list. Get on each person\'s radar early.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'high', status: 'in-progress',
    time_horizon: 'this-week', due_date: '2026-03-15',
    tags: L(['onboarding','week1','relationships']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Schedule remaining intro 1:1s this week',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q1B',
    links: L([]),
  },
  {
    title: 'Week 1 · Meet onboarding buddy Jamie Wong',
    description: 'Intro meeting with assigned onboarding buddy Jamie Wong. Get their perspective on the team, norms, and what to watch for.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'medium', status: 'todo',
    time_horizon: 'this-week', due_date: '2026-03-15',
    tags: L(['onboarding','week1','relationships']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Ping Jamie Wong on Slack to schedule intro',
    stakeholders: L(['Jamie Wong']), amp_runnable: 0, cycle: 'Q1B',
    links: L([]),
  },

  // ── WEEK 2 (Mar 16–22) — Draft PRD & 30/60/90 ────────────────────────────
  {
    title: 'Week 2 · Define 30/60/90 day plan',
    description: 'Draft the 30/60/90 plan. Align with manager on success metrics for first 30, 60, and 90 days. Share for feedback.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'high', status: 'todo',
    time_horizon: 'this-week', due_date: '2026-03-22',
    tags: L(['onboarding','week2','30-60-90']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Start 30/60/90 draft — use Acme PM template if available',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q1B',
    links: L([]),
  },
  {
    title: 'Week 2 · Work on 1st PRD (first pass)',
    description: 'Begin first draft of first PRD. Pick a scoped, achievable problem. Goal is a shippable draft by end of week 3.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'high', status: 'todo',
    time_horizon: 'this-week', due_date: '2026-03-22',
    tags: L(['onboarding','week2','prd']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Pick PRD topic, set up doc, write problem statement',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q1B',
    links: L([]),
  },
  {
    title: 'Week 2 · 1:1s with EM, Engs, and CP PMs',
    description: 'Schedule and conduct 1:1s with Engineering Manager, key engineers, and Core Payments PMs. Understand their priorities and pain points.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'medium', status: 'todo',
    time_horizon: 'this-week', due_date: '2026-03-22',
    tags: L(['onboarding','week2','relationships']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Identify EM + key eng names, send calendar invites',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q1B',
    links: L([]),
  },
  {
    title: 'Week 2 · Ramp up on Payments domain',
    description: 'Deepen understanding of Acme Payments architecture, processor stack (ProcTwo/Paylink/ProcOne), payment flows, and key metrics. Use payments.md as base.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'medium', status: 'todo',
    time_horizon: 'this-week', due_date: '2026-03-22',
    tags: L(['onboarding','week2','domain','payments']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Read payments.md, Confluence Payments space, and ask Amp to surface gaps',
    stakeholders: L([]), amp_runnable: 1, cycle: 'Q1B',
    links: L([]),
  },
  {
    title: 'Week 2 · Ramp up on VOC via ProdOps',
    description: 'Understand Voice of Customer (VOC) process. Connect with ProdOps to learn how merchant/shopper feedback flows into the roadmap.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P2', severity: 'medium', status: 'todo',
    time_horizon: 'this-week', due_date: '2026-03-22',
    tags: L(['onboarding','week2','voc','prodops']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Find ProdOps contact, ask for VOC onboarding or walkthrough',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q1B',
    links: L([]),
  },
  {
    title: 'Week 2 · Attend all relevant rituals',
    description: 'Join recurring team rituals: standups, sprint reviews, Platform SBR, team syncs, ProdOps. Get on all relevant invite lists.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'medium', status: 'todo',
    time_horizon: 'this-week', due_date: '2026-03-22',
    tags: L(['onboarding','week2','rituals']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Audit calendar — identify missing recurring meetings, request invites',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q1B',
    links: L([]),
  },
  {
    title: 'Week 2 · Get context on H1\'26 plan and top priorities',
    description: 'Review H1 2026 plan doc. Understand top priorities across Payments. Know what Q1B is delivering and what Q2A is shaping up to be.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'high', status: 'todo',
    time_horizon: 'this-week', due_date: '2026-03-22',
    tags: L(['onboarding','week2','planning','h1']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Find H1\'26 planning doc on Confluence or from Sam/Alex',
    stakeholders: L(['Sam Patel','Alex Piatski']), amp_runnable: 1, cycle: 'Q1B',
    links: L([]),
  },

  // ── WEEK 3 (Mar 23–29) — Finalize PRD + 30/60/90 ─────────────────────────
  {
    title: 'Week 3 · Review and refine 30/60/90 plan',
    description: 'Polish the 30/60/90 based on week 2 learnings. Align with manager. This should be a working doc, not a one-time artifact.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'high', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-03-29',
    tags: L(['onboarding','week3','30-60-90']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Revisit 30/60/90 draft, incorporate week 2 feedback and context',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q1B',
    links: L([]),
  },
  {
    title: 'Week 3 · Review and finalize 1st PRD',
    description: 'Complete and polish first PRD draft. Run internal review. Ready for CP Working Session.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P0', severity: 'high', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-03-29',
    tags: L(['onboarding','week3','prd']), flags: L(['needs-decision']),
    notes: null, waiting_on: null,
    next_action: 'Complete PRD draft, share for async feedback before CP Working Session',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q1B',
    links: L([]),
  },
  {
    title: 'Week 3 · 1:1s with Platform PMs, RS PM, and key XFN stakeholders',
    description: 'Expand network beyond immediate team. Meet other Platform PMs, the Retail Solutions PM, and cross-functional partners (Finance, Legal, Eng leads).',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'medium', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-03-29',
    tags: L(['onboarding','week3','relationships','xfn']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Identify Platform PM roster and RS PM, schedule 1:1s',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q1B',
    links: L([]),
  },
  {
    title: 'Week 3 · Present 1st PRD at CP Working Session',
    description: 'Present first PRD at the Core Payments Working Session. Get structured feedback. This is the first real public moment.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P0', severity: 'high', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-03-29',
    tags: L(['onboarding','week3','prd','review']), flags: L(['urgent']),
    notes: null, waiting_on: null,
    next_action: 'Confirm CP Working Session date, get on agenda',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q1B',
    links: L([]),
  },
  {
    title: 'Week 3 · Schedule 1st Product Review',
    description: 'Get the first Product Review on the calendar. Coordinate with PM lead and stakeholders for a week 4 or week 5 slot.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'medium', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-03-29',
    tags: L(['onboarding','week3','product-review']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Check with PM lead on Product Review process and get a slot',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q1B',
    links: L([]),
  },

  // ── WEEK 4 (Mar 30–Apr 5) — Hit your stride ──────────────────────────────
  {
    title: 'Week 4 · Prep for 1st Product Review',
    description: 'Full prep for first Product Review. Deck, narrative, data, anticipated Q&A. Aim to present at Platform Huddle and OG Huddle by week 6.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P0', severity: 'high', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-04-05',
    tags: L(['onboarding','week4','product-review']), flags: L(['urgent']),
    notes: 'Goal: be ready for Product Review at Platform Huddle & OG Huddle by Week 6.',
    waiting_on: null,
    next_action: 'Build review deck outline — problem, solution, metrics, ask',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q2A',
    links: L([]),
  },
  {
    title: 'Week 4 · 1st PRD Eng review and scoping',
    description: 'Run the first PRD through engineering review. Get scoping estimates. Validate technical feasibility and surface unknowns.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'high', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-04-05',
    tags: L(['onboarding','week4','prd','eng']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Schedule Eng review session with EM and relevant engineers',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q2A',
    links: L([]),
  },
  {
    title: 'Week 4 · Start work on 2nd PRD',
    description: 'Begin scoping the second PRD. Identify the problem area, gather initial data, draft the problem statement.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P2', severity: 'medium', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-04-05',
    tags: L(['onboarding','week4','prd']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Pick 2nd PRD topic — align with team priorities and area gaps',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q2A',
    links: L([]),
  },
  {
    title: 'Week 4 · Continue broad 1:1 outreach — meet as many people as possible',
    description: 'Keep expanding the network. No forced agenda — just get on people\'s radar and understand their world.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P2', severity: 'low', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-04-05',
    tags: L(['onboarding','week4','relationships']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'List 5+ people not yet met — finance partners, adjacent PMs, DS leads',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q2A',
    links: L([]),
  },
];

let added = 0;
const insertMany = db.transaction((tasks) => {
  for (const t of tasks) {
    if (existing.has(t.title)) { console.log(`  skip: "${t.title}"`); continue; }
    insert.run(t);
    added++;
  }
});

console.log('Adding onboarding plan tasks...\n');
insertMany(tasks);
console.log(`\nDone. ${added} tasks added.`);
