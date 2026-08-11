#!/usr/bin/env node
/**
 * apply-enrichment.js — write feeder-derived IMPORTANCE signals into local SSOT.
 *
 * EXAMPLE DATA. In a live control plane, the rows below come from a feeder read
 * (e.g. a Jira/tracker mine) plus manual judgment. Design of record:
 * docs/research/priority-model.md §5. Replace DATA with rows keyed to your own
 * task IDs; the merge/upsert machine is the reusable part.
 *
 * Writes ONLY input/signal fields (severity, merchant, dep_count, tags,
 * stakeholders, due_date, source_priority) — never priority/status. The
 * canonical importance/urgency/status are then (re)computed by
 * canonical-priority.js from these enriched inputs. Idempotent.
 *
 * Floor: this is a self-enrich WRITE into LOCAL SSOT only. Nothing goes back out.
 */
const db = require('./db');

// Ensure the signal columns exist (these are normally added by canonical-priority.js /
// sync-jira.js; guard here so this script runs standalone on a fresh DB). Idempotent.
for (const sql of [
  "ALTER TABLE tasks ADD COLUMN source_priority TEXT",
  "ALTER TABLE tasks ADD COLUMN dep_count INTEGER DEFAULT 0",
]) { try { db.exec(sql); } catch (e) { /* already exists */ } }

// id, severity, retailer, theme, deps, compliance, reporter, due, source_priority
// (keyed to the example task IDs seeded by seed-tasks.js)
const DATA = [
  [1,'high','Globex','Processor Integration',1,true,'Sam Patel','2026-10-23','P0'],
  [2,'medium','','Loyalty',2,false,'Priya Shah','2026-07-31','P1'],
  [3,'high','Contoso','Offers/Coupons',1,false,'Sam Patel','','P0'],
  [4,'critical','','Benefits',0,true,'Chris Diaz','','P0'],
  [5,'medium','','Checkout',0,false,'Robin Park','','P1'],
  [6,'high','Northwind','Partnerships',2,false,'Priya Shah','2026-12-16','P0'],
  [7,'low','','Tooling',0,false,'','',null],
];

function jparse(s){ try { return JSON.parse(s||'[]'); } catch { return []; } }
function merge(existingJson, ...adds){
  const set = new Set(jparse(existingJson).map(x=>String(x)));
  for (const a of adds) if (a && String(a).trim()) set.add(String(a).trim());
  return JSON.stringify([...set]);
}

const get = db.prepare('SELECT tags, stakeholders, due_date FROM tasks WHERE id=?');
const upd = db.prepare(`UPDATE tasks SET
  severity=?, merchant=COALESCE(NULLIF(?,''), merchant), dep_count=?,
  source_priority=COALESCE(?, source_priority),
  due_date=COALESCE(NULLIF(due_date,''), NULLIF(?,'')),
  tags=?, stakeholders=? WHERE id=?`);

let n=0;
const tx = db.transaction(()=>{
  for (const [id,sev,retailer,theme,deps,comp,reporter,due,srcp] of DATA){
    const row = get.get(id);
    if (!row) { console.log(`  skip #${id} (not found)`); continue; }
    const tags = merge(row.tags, theme, comp ? 'compliance' : null);
    const stake = merge(row.stakeholders, reporter);
    upd.run(sev, retailer, deps, srcp, due, tags, stake, id);
    n++;
  }
});
tx();
console.log(`Enriched ${n}/${DATA.length} tasks with feeder importance signals (severity, retailer, dep_count, tags, stakeholders, due_date, source_priority).`);
