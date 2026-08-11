// Self-test for the rule bridge — runs against a THROWAWAY DB so the live gate
// is untouched. Proves: matcher routing, protect-wins priority, shadow→staged
// graduation on agreement, and restore-demotion to disabled.
const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = path.join(os.tmpdir(), `rules-test-${process.pid}.db`);
process.env.AMP_TASKS_DB = tmp;
process.env.AMP_RULE_STAGE_N = '4';      // small thresholds for a fast test
process.env.AMP_RULE_STAGE_P = '0.90';

const db = require('../db');
const eng = require('../rule-engine');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}`); } };

// seed rules by hand (mirror the compiler output shape)
const ins = db.prepare(`INSERT INTO email_rules (id,kind,match_type,sender,domain,subject_re,reason,provenance,state) VALUES (?,?,?,?,?,?,?,?,?)`);
ins.run('protect-ExpenseCo','protect','domain',null,'ExpenseCo.com','(pending|reject)','','{}','auto');
ins.run('archive-dtdg','archive','sender','no-reply@dtdg.co',null,null,'','{}','shadow');

const RULES = eng.loadRules();

// 1. matcher routing
console.log('matcher:');
ok(eng.matchRule({sender_email:'no-reply@dtdg.co',subject:'alert',thread_id:'t1'}, RULES).effect === 'shadow', 'datadog → shadow archive rule');
ok(eng.matchRule({sender_email:'concierge@expenseco.example.com',subject:'Report pending submission',thread_id:'t2'}, RULES).effect === 'protect', 'ExpenseCo → protect');
ok(eng.matchRule({sender_email:'peer@example.com',subject:'sync?',thread_id:'t3'}, RULES) === null, 'human colleague → no rule');

// 2. protect-wins priority: add an archive rule that ALSO matches ExpenseCo domain
ins.run('archive-ExpenseCo-dom','archive','domain',null,'ExpenseCo.com',null,'','{}','auto');
const R2 = eng.loadRules();
ok(eng.matchRule({sender_email:'concierge@expenseco.example.com',subject:'Report pending',thread_id:'t4'}, R2).effect === 'protect', 'protect beats a competing auto archive rule');

// 3. shadow→staged graduation on 4 agreements (stage N=4, P=0.90)
console.log('graduation:');
for (let i = 0; i < 4; i++) {
  const pid = eng.recordPrediction({ rule: { id: 'archive-dtdg' }, item: { thread_id: `g${i}`, sender_email: 'no-reply@dtdg.co', subject: 'x' }, predicted: 'archive', run_id: 'test' });
  eng.reconcilePrediction(pid, 'archive', 'pipeline'); // pipeline agreed
}
let r = db.prepare(`SELECT * FROM email_rules WHERE id='archive-dtdg'`).get();
ok(r.state === 'staged', `4 agreements → graduated shadow→staged (state=${r.state}, prec=${r.precision})`);

// 4. restore-demotion: one confirmed restore disables the rule
console.log('demotion:');
const pid = eng.recordPrediction({ rule: { id: 'archive-dtdg' }, item: { thread_id: 'r1', sender_email: 'no-reply@dtdg.co', subject: 'x' }, predicted: 'archive', run_id: 'test' });
eng.reconcilePrediction(pid, 'keep', 'restore'); // a human restored it → disagreement, ground=restore
r = db.prepare(`SELECT * FROM email_rules WHERE id='archive-dtdg'`).get();
ok(r.state === 'disabled', `restore-confirmed miss → disabled (state=${r.state})`);
ok(!eng.loadRules().find((x) => x.id === 'archive-dtdg'), 'disabled rule no longer loaded for matching');

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
try { fs.unlinkSync(tmp); } catch (_) {}
process.exit(fail ? 1 : 0);
