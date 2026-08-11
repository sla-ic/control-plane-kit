// add-onboarding-milestones.js
// Seeds higher-level monthly onboarding milestones from the "Higher Level Timeline" slide.
// Month 1 = ends Apr 8 | Month 2 = ends May 8 | Month 3 = ends Jun 8 | Month 4+ = long-term
// Start date: Mon Mar 9, 2026

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
  // ── MONTH 1 (due Apr 8) ───────────────────────────────────────────────────
  // Theme: Build rapport, review resources, get set up, take initiative to learn
  {
    title: 'Month 1 milestone · Complete 1st PRD with internal review',
    description: 'Deliver first full PRD through internal review. Must go through CP Working Session. Quality over speed — this sets the bar for your PM craft.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P0', severity: 'high', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-04-08',
    tags: L(['onboarding','month1','milestone','prd']), flags: L(['urgent']),
    notes: null, waiting_on: null,
    next_action: 'Finalize PRD draft and schedule CP Working Session slot',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q2A',
    links: L([]),
  },
  {
    title: 'Month 1 milestone · Partner w/ EM to define Q2A plan',
    description: 'Work with Engineering Manager to shape the Q2A execution plan. Understand what the team is committing to, where you can take ownership, and how your PRD work fits.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'high', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-04-08',
    tags: L(['onboarding','month1','milestone','planning','q2a']), flags: L([]),
    notes: 'Q2A starts Apr 7. Get ahead of this — have the conversation in late March.',
    waiting_on: null,
    next_action: 'Schedule planning alignment session with EM before Apr 7',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q2A',
    links: L([]),
  },

  // ── MONTH 2 (due May 8) ───────────────────────────────────────────────────
  // Theme: Take the lead on problem-solving, communication, collaboration. Gain tool proficiency.
  {
    title: 'Month 2 milestone · Complete 2nd PRD with internal review',
    description: 'Second PRD, reviewed internally. By month 2 you should be operating with more independence — this PRD should feel less scaffolded than the first.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'high', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-05-08',
    tags: L(['onboarding','month2','milestone','prd']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: 'Start scoping 2nd PRD topic after 1st PRD is through review',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q2A',
    links: L([]),
  },
  {
    title: 'Month 2 milestone · Complete 1st Product Review',
    description: 'First Product Review — present at Platform Huddle and OG Huddle. This is the big public moment for month 2. Prep thoroughly.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P0', severity: 'high', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-05-08',
    tags: L(['onboarding','month2','milestone','product-review']), flags: L(['urgent']),
    notes: 'Target: Platform Huddle + OG Huddle by week 6 per the 4-week plan.',
    waiting_on: null,
    next_action: 'Lock down Product Review date and get on Platform Huddle + OG Huddle agendas',
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q2A',
    links: L([]),
  },

  // ── MONTH 3 (due Jun 8) ───────────────────────────────────────────────────
  // Theme: Operate with autonomy, escalate when needed, make confident recommendations
  {
    title: 'Month 3 milestone · Complete 3rd PRD',
    description: 'Third PRD. By now the process should feel natural. This one should push toward something more strategically interesting — not just executional.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'medium', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-06-08',
    tags: L(['onboarding','month3','milestone','prd']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: null,
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q2B',
    links: L([]),
  },
  {
    title: 'Month 3 milestone · Complete 2nd Product Review',
    description: 'Second Product Review. Should feel more autonomous than the first — less hand-holding, more confidence at the table.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'medium', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-06-08',
    tags: L(['onboarding','month3','milestone','product-review']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: null,
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q2B',
    links: L([]),
  },
  {
    title: 'Month 3 milestone · Complete a design sprint',
    description: 'Run or participate in a full design sprint. Demonstrates cross-functional collaboration and product craft beyond PRD writing.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P2', severity: 'medium', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-06-08',
    tags: L(['onboarding','month3','milestone','design-sprint']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: null,
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q2B',
    links: L([]),
  },
  {
    title: 'Month 3 milestone · Partner w/ EM to define Q2B plan',
    description: 'Same as Q2A planning but now you should own more of the narrative. Shape the Q2B execution plan, not just react to it.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'medium', status: 'todo',
    time_horizon: 'this-month', due_date: '2026-06-08',
    tags: L(['onboarding','month3','milestone','planning','q2b']), flags: L([]),
    notes: 'Q2B starts May 19. Get ahead — have this conversation in early May.',
    waiting_on: null,
    next_action: null,
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q2B',
    links: L([]),
  },

  // ── MONTH 4+ (long-term, ephemeral) ──────────────────────────────────────
  // Theme: Define strategy, own execution independently, shape H2'26
  {
    title: 'Month 4+ · Complete and present on a strategy topic',
    description: 'Identify a strategic question worth the team\'s attention. Develop a point of view, present it, and get alignment. This is the shift from executor to strategist.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P2', severity: 'medium', status: 'todo',
    time_horizon: 'long-term', due_date: null,
    tags: L(['onboarding','month4','milestone','strategy']), flags: L([]),
    notes: null, waiting_on: null,
    next_action: null,
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q3A',
    links: L([]),
  },
  {
    title: 'Month 4+ · Run & define H2\'26 plan',
    description: 'Own the H2\'26 planning process for your area. Starts ~May\'26. Synthesize team priorities, align with OKRs, define what Q3A and Q3B look like.',
    owner: 'jordan', project: 'Onboarding', department: 'Payments',
    priority: 'P1', severity: 'high', status: 'todo',
    time_horizon: 'long-term', due_date: '2026-05-30',
    tags: L(['onboarding','month4','milestone','planning','h2','strategy']), flags: L([]),
    notes: 'Starts ~May\'26 per the timeline. Earlier than other month 4+ items — put it on the radar in Q2A.',
    waiting_on: null,
    next_action: null,
    stakeholders: L([]), amp_runnable: 0, cycle: 'Q2B',
    links: L([]),
  },
];

let added = 0;
const insertMany = db.transaction((tasks) => {
  for (const t of tasks) {
    if (existing.has(t.title)) { console.log(`  skip: "${t.title}"`); continue; }
    insert.run(t);
    added++;
    console.log(`  + ${t.title}`);
  }
});

console.log('Adding monthly onboarding milestones...\n');
insertMany(tasks);
console.log(`\nDone. ${added} milestones added.`);
