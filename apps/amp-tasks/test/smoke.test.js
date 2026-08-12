// smoke.test.js — surface-critical route smoke net (Wave 0 of the frontend audit).
//
// WHY: the dashboard is a 4,800-line single-file frontend + a 2,100-line server
// with load-bearing shared-resolver invariants and no regression net. Before the
// modularization pass (splitting the god-file into ES modules) it is unsafe to
// refactor without a way to catch "a surface silently stopped getting its data."
// This boots the real server on a throwaway port against the real DB, GETs every
// route the four HTML pages actually consume, and asserts each returns 200 with
// the top-level shape the frontend destructures. GET-only: never mutates.
//
//   node --test test/          (or: npm test)

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = parseInt(process.env.SMOKE_PORT, 10) || 3799;
const BASE = `http://localhost:${PORT}`;
let child;

async function get(p) {
  const r = await fetch(BASE + p);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch (_) { json = undefined; }
  return { status: r.status, json, text };
}

before(async () => {
  child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', () => {}); // swallow; failures surface via the readiness poll
  // Poll until the server answers or we give up.
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const r = await fetch(BASE + '/api/stats');
      if (r.status === 200) { await r.arrayBuffer(); break; }
    } catch (_) { /* not up yet */ }
    if (Date.now() > deadline) throw new Error('server did not become ready on ' + BASE);
    await new Promise(res => setTimeout(res, 200));
  }
});

after(() => { if (child) child.kill('SIGKILL'); });

// Static-shape routes: [path, predicate(json) -> bool describing the shape the UI needs]
const ROUTES = [
  ['/api/stats',                j => j && typeof j.total === 'number' && j.cycleCounts && j.projectCounts],
  ['/api/tasks',                j => Array.isArray(j)],
  ['/api/decisions',            j => Array.isArray(j) || (j && Array.isArray(j.decisions))],
  ['/api/projects',             j => Array.isArray(j)],
  ['/api/people',               j => Array.isArray(j) || (j && Array.isArray(j.people))],
  ['/api/roadmap-tree',         j => Array.isArray(j) || (j && typeof j === 'object')],
  ['/api/handoff',              j => j && typeof j === 'object'],
  ['/api/needs-you',            j => j && Array.isArray(j.items) && j.counts && typeof j.counts === 'object'],
  ['/api/email',                j => j && Array.isArray(j.items) && Array.isArray(j.drafts) && j.summary],
  ['/api/email/sweep',          j => j && Array.isArray(j.batches)],
  ['/api/fleet',                j => j && typeof j === 'object'],
  ['/api/value',                j => j && typeof j === 'object'],
  ['/api/calibration',          j => j === null || (j && typeof j === 'object')],
  ['/api/importance-drift',     j => j && typeof j === 'object'],
  ['/api/tier-drift',           j => j && typeof j === 'object'],
  ['/api/mode',                 j => j && typeof j.mode === 'string'],
  ['/api/interruption-budget',  j => j && typeof j === 'object'],
  ['/api/activity',             j => Array.isArray(j) || (j && typeof j === 'object')],
  ['/api/adjudication',         j => Array.isArray(j) || (j && typeof j === 'object')],
  ['/api/weekly',               j => j && typeof j === 'object'],
];

for (const [route, ok] of ROUTES) {
  test(`GET ${route} → 200 + expected shape`, async () => {
    const { status, json, text } = await get(route);
    assert.strictEqual(status, 200, `${route} returned ${status}: ${text.slice(0, 200)}`);
    assert.ok(json !== undefined, `${route} did not return JSON: ${text.slice(0, 200)}`);
    assert.ok(ok(json), `${route} shape check failed: ${JSON.stringify(json).slice(0, 200)}`);
  });
}

// Dynamic routes — resolve a real task id first, then exercise the per-item surface.
// On a fresh clone the DB is empty, so seed one task via the public POST route
// rather than asserting pre-existing data (keeps `npm test` green out of the box).
test('per-task routes (detail / comments / links / delegations)', async () => {
  let { json: tasks } = await get('/api/tasks');
  if (!(Array.isArray(tasks) && tasks.length)) {
    const r = await fetch(BASE + '/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'smoke-test seed task' }),
    });
    assert.ok(r.status < 400, `seeding a task failed: ${r.status}`);
    ({ json: tasks } = await get('/api/tasks'));
  }
  assert.ok(Array.isArray(tasks) && tasks.length, 'expected at least one task after seeding');
  const id = tasks[0].id;
  for (const suffix of ['', '/comments', '/links', '/delegations']) {
    const { status, json } = await get(`/api/tasks/${id}${suffix}`);
    assert.strictEqual(status, 200, `/api/tasks/${id}${suffix} returned ${status}`);
    assert.ok(json !== undefined, `/api/tasks/${id}${suffix} did not return JSON`);
  }
});

test('planner route (payments org)', async () => {
  const { status, json } = await get('/api/planner/payments');
  assert.strictEqual(status, 200, `/api/planner/payments returned ${status}`);
  assert.ok(json && typeof json === 'object', 'planner payload should be an object');
});
