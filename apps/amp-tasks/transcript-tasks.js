// transcript-tasks.js — turn raw meeting transcripts into corrected task ledger entries.
//
// ORDER OF OPERATIONS (Jordan's directive, load-bearing):
//   1. PARSE THE RAW TRANSCRIPT FIRST. Derive the real decisions + action items
//      from the actual dialogue — grounded in a direct quote, owner attributed
//      as actually spoken. This is ground truth.
//   2. RECONCILE INTO OUR TASKS. For Jordan/amp-owned items, add what's missing,
//      clarify what's garbled, close what the raw shows already done. Match
//      against the existing `tasks` ledger first so we correct rather than dupe.
//   Gemini's summary is NOT the seed and NOT on trial — it's just the rough first
//   draft of the same list; the raw is how we get the list right.
//
// Raw-less meetings (Gemini summary only) can't be verified from dialogue, so we
// never mint a task from them here — they'd be uncorroborated by construction.
//
// USAGE
//   node transcript-tasks.js                     # preview diff for all raw meetings (no writes)
//   node transcript-tasks.js --source <rel>      # one meeting
//   node transcript-tasks.js --apply             # write adds/updates/closes to tasks
//   node transcript-tasks.js --model opus        # stronger extraction

const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('/Users/you/.local/share/amp-tasks/db');
const { claude, parseJSON } = require('/Users/you/.local/share/amp-tasks/llm');

const HOME = os.homedir();
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const APPLY = has('--apply');
const MODEL = arg('--model', 'sonnet');
const ONE = arg('--source', null);
const PRINCIPAL = 'jordan@example.com';

const TX_HDR_RE = /^#+\s+.*transcript/i;
const clip = (s, n) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// A meeting-tasks provenance table so re-runs are idempotent (dedupe by quote hash).
db.exec(`CREATE TABLE IF NOT EXISTS transcript_task_link (
  quote_hash TEXT PRIMARY KEY,
  source     TEXT,
  title      TEXT,
  mdate      TEXT,
  task_id    INTEGER,
  disposition TEXT,          -- added | clarified | closed | noted | skipped
  raw_quote  TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);

function rawOf(text) {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => TX_HDR_RE.test(l));
  if (i >= 0) return lines.slice(i + 1).join('\n');
  // no header: treat as raw if it's speaker-dense
  const spk = lines.filter((l) => /^(?:\*\*)?[A-Z][A-Za-z.'-]+ [A-Z][A-Za-z.'-]+/.test(l)).length;
  return spk >= 5 ? text : '';
}
function windows(text, size = 14000, overlap = 600) {
  const out = [];
  for (let i = 0; i < text.length; i += (size - overlap)) out.push(text.slice(i, i + size));
  return out.length ? out : [text];
}
function hash(s) { let h = 0; const t = (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); for (let i = 0; i < t.length; i++) { h = (h * 31 + t.charCodeAt(i)) | 0; } return 'q' + (h >>> 0).toString(36); }

// ── Stage 1: derive real action items from RAW dialogue ─────────────────────────
const EXTRACT_SYS = `You extract ACTION ITEMS and DECISIONS from a raw meeting transcript segment for Jordan Rivera (a product manager at Acme; PRINCIPAL = ${PRINCIPAL}).

Rules:
- Use ONLY what is actually said in this transcript text. Do not infer, do not import outside knowledge, do not smooth over ambiguity.
- Every item MUST carry a short direct quote (verbatim substring) that grounds it, with the speaker name.
- owner = the person actually tasked in the dialogue (name as spoken; use "Jordan" for Jordan Rivera, "amp" only if it's clearly automatable prep/analysis Jordan delegates).
- status = "committed" (someone agreed to do it), "done" (already completed per dialogue), or "proposed" (floated, not owned).
- Only include DECISIONS that were actually reached (not merely discussed). Mark contested/deferred ones as decided=false.
- Skip pleasantries, scheduling logistics, and vague aspirations.

Return STRICT JSON only:
{"actions":[{"owner":"","task":"","status":"committed|done|proposed","due":"","quote":"","speaker":""}],
 "decisions":[{"decision":"","decided":true,"quote":"","speaker":""}]}`;

async function extractRaw(raw, title) {
  const wins = windows(raw);
  const all = { actions: [], decisions: [] };
  for (let i = 0; i < wins.length; i++) {
    const user = `MEETING: ${title}\nSEGMENT ${i + 1}/${wins.length}\n\n${wins[i]}`;
    let v;
    try { const { text } = await claude([{ role: 'user', content: user }], { model: MODEL, system: EXTRACT_SYS, maxTokens: 4000 }); v = parseJSON(text); }
    catch (e) { console.error(`   ! extract seg ${i + 1} failed: ${clip(e.message, 80)}`); continue; }
    if (v && Array.isArray(v.actions)) all.actions.push(...v.actions);
    if (v && Array.isArray(v.decisions)) all.decisions.push(...v.decisions);
  }
  return all;
}

// ── Stage 2: reconcile against existing tasks (correct, don't dupe) ─────────────
function candidateTasks(taskText) {
  const words = taskText.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length > 4);
  const seen = new Map();
  for (const w of words.slice(0, 8)) {
    for (const r of db.prepare("SELECT id,title,owner,status,next_action,source FROM tasks WHERE lower(title) LIKE ? OR lower(next_action) LIKE ? LIMIT 5").all('%' + w + '%', '%' + w + '%')) {
      seen.set(r.id, r);
    }
  }
  return [...seen.values()].slice(0, 8);
}

const RECON_SYS = `You reconcile a raw-transcript-derived action item against Jordan Rivera's existing task ledger. The transcript item is GROUND TRUTH (it's what was actually said). Decide how the ledger should change.

Return STRICT JSON:
{"disposition":"add|clarify|close|skip",
 "task_id": <id to update/close, or null>,
 "title":"", "owner":"jordan|amp|<name>", "next_action":"", "status":"todo|in-progress|done", "due_date":"YYYY-MM-DD or empty",
 "reason":"one line"}

- add: genuinely new, Jordan/amp owns it, not already tracked.
- clarify: an existing task matches but its wording/owner/next_action/due is wrong or vaguer than the transcript — update it.
- close: an existing task the transcript shows is already done/decided — mark done.
- skip: not Jordan/amp's to own, too vague, a pure logistics/FYI item, or already accurately tracked.`;

async function reconcile(item, title, mdate) {
  const cands = candidateTasks(item.task);
  const candText = cands.length ? cands.map((c) => `#${c.id} [${c.status}] owner=${c.owner} "${clip(c.title, 80)}" next=${clip(c.next_action, 60)} (src ${c.source})`).join('\n') : '(no existing task matched)';
  const user = `TRANSCRIPT ITEM (from "${title}" ${mdate || ''}):
owner-as-spoken: ${item.owner}
task: ${item.task}
status-in-meeting: ${item.status}   stated-due: ${item.due || '(none)'}
grounding quote — ${item.speaker}: "${clip(item.quote, 240)}"

EXISTING CANDIDATE TASKS:
${candText}

Reconcile. Only add/clarify/close when Jordan or amp genuinely owns this. Return JSON.`;
  const { text } = await claude([{ role: 'user', content: user }], { model: MODEL, system: RECON_SYS, maxTokens: 400 });
  return parseJSON(text) || { disposition: 'skip', reason: 'unparseable' };
}

// ── apply ───────────────────────────────────────────────────────────────────--
const insTask = db.prepare(`INSERT INTO tasks (title, owner, status, next_action, due_date, source, notes, created_at, updated_at)
  VALUES (?,?,?,?,?,?,?,datetime('now'),datetime('now'))`);
const updTask = db.prepare(`UPDATE tasks SET owner=COALESCE(NULLIF(?,''),owner), next_action=COALESCE(NULLIF(?,''),next_action), status=COALESCE(NULLIF(?,''),status), due_date=COALESCE(NULLIF(?,''),due_date), notes=TRIM(COALESCE(notes,'')||' | '||?), updated_at=datetime('now') WHERE id=?`);
const closeTask = db.prepare(`UPDATE tasks SET status='done', notes=TRIM(COALESCE(notes,'')||' | '||?), updated_at=datetime('now') WHERE id=?`);
const linkIns = db.prepare(`INSERT OR IGNORE INTO transcript_task_link (quote_hash, source, title, mdate, task_id, disposition, raw_quote) VALUES (?,?,?,?,?,?,?)`);

function alreadyLinked(quote) { const r = db.prepare('SELECT disposition, task_id FROM transcript_task_link WHERE quote_hash=?').get(hash(quote)); return r; }

// ── main ────────────────────────────────────────────────────────────────────--
(async () => {
  const srcs = ONE
    ? db.prepare('SELECT source,title,mdate,has_raw FROM transcript_source WHERE source=?').all(ONE)
    // Exclude the multi-meeting mega-dump ("Meeting transcripts"): its items span many
    // meetings with no clean single-meeting attribution, so minting tasks from it would
    // inject mis-owned noise. It stays INDEXED for search/corroboration, just not a task source.
    : db.prepare("SELECT source,title,mdate,has_raw FROM transcript_source WHERE has_raw=1 AND title NOT LIKE '%Meeting transcripts%' ORDER BY mdate DESC").all();
  console.log(`transcript-tasks: ${srcs.length} raw meeting(s) | model=${MODEL} | ${APPLY ? 'APPLY' : 'PREVIEW (no writes)'}\n`);

  const roots = { 'transcripts': path.join(HOME, '.local/share/amp-tasks/transcripts'), 'transcripts_old': null };
  const resolveFull = (rel) => {
    const cands = [path.join(HOME, '.local/share/amp-tasks', rel), path.join(HOME, 'Documents/Claude/Projects', rel)];
    return cands.find((p) => fs.existsSync(p));
  };

  const diff = { add: [], clarify: [], close: [], skip: 0, decisions: [] };
  for (const s of srcs) {
    const full = resolveFull(s.source);
    if (!full) { console.error(`  ! cannot resolve ${s.source}`); continue; }
    const raw = rawOf(fs.readFileSync(full, 'utf8'));
    if (raw.replace(/\s+/g, '').length < 300) { console.log(`  · ${s.title}: no raw, skip`); continue; }
    console.log(`▶ ${s.title} (${s.mdate || 'no-date'})`);
    const { actions, decisions } = await extractRaw(raw, s.title);
    console.log(`   raw-derived: ${actions.length} action(s), ${decisions.length} decision(s)`);

    for (const d of decisions.filter((x) => x.decided)) diff.decisions.push({ meeting: s.title, ...d });

    for (const a of actions) {
      if (!a.task || !a.quote) continue;
      const linked = alreadyLinked(a.quote);
      if (linked) { continue; } // idempotent
      const r = await reconcile(a, s.title, s.mdate);
      const disp = r.disposition || 'skip';
      if (disp === 'skip') { diff.skip++; if (APPLY) linkIns.run(hash(a.quote), s.source, s.title, s.mdate, null, 'skipped', clip(a.quote, 200)); continue; }

      if (disp === 'add') {
        const note = `from meeting "${s.title}" ${s.mdate || ''} — ${a.speaker}: "${clip(a.quote, 140)}"`;
        let id = null;
        if (APPLY) { id = insTask.run(clip(r.title || a.task, 200), r.owner || 'jordan', r.status || 'todo', clip(r.next_action, 300), r.due_date || null, 'transcript:' + (s.mdate || '') + ' ' + clip(s.title, 40), note).lastInsertRowid; linkIns.run(hash(a.quote), s.source, s.title, s.mdate, id, 'added', clip(a.quote, 200)); }
        diff.add.push({ meeting: s.title, title: r.title || a.task, owner: r.owner, due: r.due_date, reason: r.reason });
      } else if (disp === 'clarify' && r.task_id) {
        const note = `clarified from "${s.title}" ${s.mdate || ''}: ${clip(r.reason, 120)}`;
        if (APPLY) { updTask.run(r.owner || '', clip(r.next_action, 300), r.status || '', r.due_date || '', note, r.task_id); linkIns.run(hash(a.quote), s.source, s.title, s.mdate, r.task_id, 'clarified', clip(a.quote, 200)); }
        diff.clarify.push({ meeting: s.title, task_id: r.task_id, title: r.title || a.task, reason: r.reason });
      } else if (disp === 'close' && r.task_id) {
        const note = `closed per "${s.title}" ${s.mdate || ''}: ${clip(r.reason, 120)}`;
        if (APPLY) { closeTask.run(note, r.task_id); linkIns.run(hash(a.quote), s.source, s.title, s.mdate, r.task_id, 'closed', clip(a.quote, 200)); }
        diff.close.push({ meeting: s.title, task_id: r.task_id, reason: r.reason });
      }
    }
  }

  // ── report ──
  console.log(`\n${'='.repeat(60)}\nRECONCILIATION ${APPLY ? '(APPLIED)' : '(PREVIEW)'}\n${'='.repeat(60)}`);
  console.log(`\nADD (${diff.add.length}):`);
  for (const a of diff.add) console.log(`  + [${a.owner}] ${clip(a.title, 80)}${a.due ? ' (due ' + a.due + ')' : ''}\n      ${clip(a.reason, 90)}  — ${a.meeting}`);
  console.log(`\nCLARIFY (${diff.clarify.length}):`);
  for (const c of diff.clarify) console.log(`  ~ #${c.task_id} ${clip(c.title, 70)}\n      ${clip(c.reason, 90)}  — ${c.meeting}`);
  console.log(`\nCLOSE (${diff.close.length}):`);
  for (const c of diff.close) console.log(`  ✓ #${c.task_id}  ${clip(c.reason, 90)}  — ${c.meeting}`);
  console.log(`\nSKIP: ${diff.skip}`);
  console.log(`\nDECISIONS reached (raw-verified, ${diff.decisions.length}):`);
  for (const d of diff.decisions) console.log(`  • ${clip(d.decision, 100)}\n      ${d.speaker}: "${clip(d.quote, 80)}"  — ${d.meeting}`);
  if (!APPLY) console.log(`\n(preview only — re-run with --apply to write)`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
