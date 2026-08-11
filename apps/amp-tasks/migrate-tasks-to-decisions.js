#!/usr/bin/env node
// One-shot migration per surface-palette P0-1 ("demote, not eliminate"):
// Tasks shaped like decisions (Jordan-owned, with a recommended next_action,
// still pending) should be in the `decisions` table as kind='your_move',
// not in the `tasks` inbox-layer.
//
// Strategy:
//   - Scan tasks where owner='jordan' AND next_action IS NOT NULL
//     AND status IN ('todo','in-progress','blocked','waiting').
//   - For each, INSERT a decision row (idempotent: skip if a decision with
//     the same project_id + kind='your_move' + title already exists).
//   - Soft-delete the source task by flipping status to 'migrated' (kept for
//     audit; not deleted because task_comments/task_links FK CASCADE).
//   - Project linkage: if the task's `project` text matches a project name,
//     link via project_id; otherwise leave NULL (orphan decision still surfaces).
//
// Re-running is safe: already-migrated tasks (status='migrated') are skipped,
// and duplicate-title decisions are not re-inserted.

const db = require('./db');

const candidates = db.prepare(`
  SELECT t.id, t.title, t.next_action, t.description, t.project, t.priority, t.status, t.due_date
  FROM tasks t
  WHERE t.owner = 'jordan'
    AND t.next_action IS NOT NULL
    AND TRIM(t.next_action) != ''
    AND t.status IN ('todo', 'in-progress', 'blocked', 'waiting')
`).all();

const findProject  = db.prepare(`SELECT id FROM projects WHERE name = ?`);
const findDecision = db.prepare(`SELECT id FROM decisions WHERE COALESCE(project_id, -1) = COALESCE(?, -1) AND kind = 'your_move' AND title = ?`);
const insertDec    = db.prepare(`
  INSERT INTO decisions (project_id, kind, title, body, due_date, created_at)
  VALUES (?, 'your_move', ?, ?, ?, datetime('now'))
`);
const markMigrated = db.prepare(`UPDATE tasks SET status = 'migrated' WHERE id = ?`);

let migrated = 0, skippedDup = 0, skippedNoChange = 0;

const txn = db.transaction(() => {
  for (const t of candidates) {
    const proj = t.project ? findProject.get(t.project) : null;
    const project_id = proj ? proj.id : null;

    // Decision title = the next_action (action-verb shaped), with the task title
    // as supporting body. This matches Principle #3 (synthesis-first).
    const title = String(t.next_action).trim();
    const body  = [
      t.description ? `Context: ${t.description}` : null,
      `Source task: ${t.title}`,
      `Priority: ${t.priority || 'P2'}`,
    ].filter(Boolean).join('\n');

    if (findDecision.get(project_id, title)) {
      // Decision already exists — still mark the task migrated so we don't
      // re-process next run.
      markMigrated.run(t.id);
      skippedDup++;
      continue;
    }

    insertDec.run(project_id, title, body, t.due_date);
    markMigrated.run(t.id);
    migrated++;
  }
});
txn();

skippedNoChange = candidates.length - migrated - skippedDup;
console.log(`Migration complete.`);
console.log(`  candidates scanned:      ${candidates.length}`);
console.log(`  inserted as decisions:   ${migrated}`);
console.log(`  duplicate decisions:     ${skippedDup}`);
console.log(`  no-op skipped:           ${skippedNoChange}`);

// Quick health report
const openDecisions = db.prepare(`SELECT COUNT(*) n FROM decisions WHERE resolved_at IS NULL`).get().n;
const yourMoveCount = db.prepare(`SELECT COUNT(*) n FROM decisions WHERE resolved_at IS NULL AND kind = 'your_move'`).get().n;
const migratedTasks = db.prepare(`SELECT COUNT(*) n FROM tasks WHERE status = 'migrated'`).get().n;
console.log(`\nState after migration:`);
console.log(`  total open decisions:    ${openDecisions}`);
console.log(`  open your_move:          ${yourMoveCount}`);
console.log(`  tasks soft-deleted:      ${migratedTasks}`);
