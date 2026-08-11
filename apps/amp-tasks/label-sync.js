// label-sync.js — the missing last mile: push DB verdicts to the real Gmail inbox.
//
// WHY: cross-system-audit writes a verdict + route + intended label to the DB,
// but its inline label application was unreliable (14/50 escalates never got
// ⚡Needs You). Result: the triage lived in SQLite where Jordan can't see it — the
// job "looked stuck." This stage reconciles ACTUAL Gmail label state (ground
// truth from get_thread) against the adjudicated route and applies what's missing.
//
// SAFETY: additive + reversible only (add_labels). It NEVER archives and NEVER
// removes a label here — closure/archive is a separate, evidence-gated step.
// Floor is enforced by mcp-dispatch on every call. Sequential + paced (no melt).
//
// USAGE
//   node label-sync.js --verdict xa:escalate         # sync one bucket
//   node label-sync.js --all                         # every open/acked adjudicated row
//   node label-sync.js --verdict xa:escalate --dry   # show what would change
//   node label-sync.js --limit 60

const db = require('/Users/you/.local/share/amp-tasks/db');
const { gmailCall, FloorViolation } = require('/Users/you/.local/share/amp-tasks/mcp-dispatch');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const DRY = has('--dry');
const ALL = has('--all');
const VERDICT = arg('--verdict', null);
const LIMIT = parseInt(arg('--limit', '250'), 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Hard client-side deadline per call: a thread that churns in retry can outlast
// mcp-dispatch's own AbortControllers and stall the whole sweep. Race it and skip.
const withTimeout = (p, ms, tag) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`client-timeout ${tag}`)), ms)),
]);

// escalate ⇒ needs-you regardless of stored route; otherwise map by route.
const ROUTE_LABEL = { needs_you: 'Label_3', fyi: 'Label_4', calendar: 'Label_5', automated: 'Label_6', external: 'Label_7', inbox: null };
const LABEL_NAME = { Label_3: '⚡Needs You', Label_4: '👀FYI', Label_5: '📅Calendar', Label_6: '📊Automated', Label_7: '🤝External' };

function wantLabelFor(row) {
  if (row.verdict === 'xa:escalate') return 'Label_3';
  if (row.verdict === 'xa:closed_verified') return null;  // closure/archive handled elsewhere
  return ROUTE_LABEL[row.route] || null;
}

function threadLabelIds(resp) {
  const t = resp.json || {};
  const msgs = t.messages || t.thread || t.emails || resp.items || [];
  const arr = Array.isArray(msgs) ? msgs : [];
  const ids = new Set();
  for (const m of arr) for (const l of (m.labelIds || [])) ids.add(l);
  const last = arr[arr.length - 1] || {};
  return { ids, lastMsgId: last.id || null, inInbox: ids.has('INBOX') };
}

const DECLUTTER_ONLY = has('--declutter-only'); // skip the additive pass; unflag only

(async () => {
  const upd = db.prepare("UPDATE email_items SET gmail_label=? WHERE id=?");
  let applied = 0, already = 0, noLabel = 0, gone = 0, errors = 0;
  const onGate = (e) => { if (!e.allow) console.error(`  ⛔ FLOOR ${e.tool}: ${e.reason}`); };

  // Select by ROUTE (the triage output), not by verdict — triage routes every
  // inbox item but only cross-system-audit sets verdict='xa:%', so a verdict gate
  // silently drops freshly-triaged mail. gmail_label IS NULL excludes rows already
  // reconciled this pass, so the window ADVANCES instead of re-churning the oldest
  // (the applied=0 bug). Newest-first so the CURRENT inbox gets labeled first.
  if (!DECLUTTER_ONLY) {
  let where = "status IN ('open','acked') AND route IN ('needs_you','fyi','calendar','automated','external') AND gmail_label IS NULL";
  const params = [];
  if (!ALL && VERDICT) { where += ' AND verdict = ?'; params.push(VERDICT); }
  const rows = db.prepare(`SELECT id, thread_id, substr(subject,1,50) subj, route, verdict, gmail_label FROM email_items WHERE ${where} ORDER BY id DESC LIMIT ?`).all(...params, LIMIT);
  console.log(`label-sync: ${rows.length} row(s) | ${DRY ? 'DRY-RUN' : 'APPLYING'}\n`);

  let i = 0;
  for (const r of rows) {
    if (++i % 10 === 0) console.error(`  … ${i}/${rows.length} (applied=${applied} already=${already} gone=${gone} err=${errors})`);
    const want = wantLabelFor(r);
    if (!want) { noLabel++; continue; }
    try {
      const th = threadLabelIds(await withTimeout(gmailCall('get_thread', { thread_id: r.thread_id }, onGate), 25000, 'get_thread'));
      await sleep(150);
      // Left inbox before we reached it: stamp a DISTINCT sentinel rather than a
      // label name, so the record reflects what actually happened (thread archived
      // pre-label) instead of implying we applied a label we never sent. Only NULL
      // rows reach here (WHERE gmail_label IS NULL), so this never overwrites a
      // legitimately-applied stamp on an already-labeled-then-archived thread.
      if (!th.inInbox) { gone++; upd.run('(left-inbox)', r.id); continue; }
      // Already carries the label in REAL Gmail — only now is it truthful to stamp.
      if (th.ids.has(want)) { already++; upd.run(want, r.id); continue; }
      if (DRY) { console.log(`  + ${LABEL_NAME[want]}  ${r.subj}`); applied++; continue; }
      if (th.lastMsgId) {
        await withTimeout(gmailCall('update_email', { email_id: th.lastMsgId, add_labels: [want] }, onGate), 25000, 'update_email');
        upd.run(want, r.id);
        applied++;
        console.log(`  ✓ ${LABEL_NAME[want]}  ${r.subj}`);
        await sleep(200);
      }
    } catch (e) {
      if (e instanceof FloorViolation) { console.error('  FLOOR — stopping.'); break; }
      errors++; console.error(`  ✗ ${r.subj}: ${(e.message || '').slice(0, 70)}`);
    }
  }
  console.log(`\napplied=${applied} already-labeled=${already} no-label-needed=${noLabel} left-inbox=${gone} errors=${errors}`);
  } // end additive pass

  // ── declutter last mile ────────────────────────────────────────────────
  // The additive pass above never REMOVES a label; closure was "handled
  // elsewhere". disposition-capture now supplies that evidence: a native
  // closure (Jordan had the last word in-thread) stamps acted_by='jordan:sent'
  // and flips status→resolved. Such a thread should no longer carry its route
  // label (⚡Needs You et al.) in Gmail, or it lingers in Jordan's flagged view.
  // Remove exactly the label WE applied (gmail_label), evidence-gated by the
  // first-party SENT signal. Reversible: if the thread reopens (someone replies,
  // new msg_id) the additive pass re-labels it. We do NOT archive here.
  if (ALL || DECLUTTER_ONLY || has('--declutter')) {
    const dcRows = db.prepare(`
      SELECT id, thread_id, substr(subject,1,50) subj, gmail_label
      FROM email_items
      WHERE status='resolved' AND acted_by='jordan:sent' AND gmail_label LIKE 'Label\\_%' ESCAPE '\\'
      ORDER BY id DESC LIMIT ?`).all(LIMIT);
    console.log(`\ndeclutter: ${dcRows.length} resolved-by-jordan row(s) to unflag | ${DRY ? 'DRY-RUN' : 'APPLYING'}`);
    let removed = 0, notpresent = 0, dcErr = 0;
    for (const r of dcRows) {
      const want = r.gmail_label; // the label we applied
      try {
        const resp = await withTimeout(gmailCall('get_thread', { thread_id: r.thread_id }, onGate), 25000, 'get_thread');
        await sleep(150);
        const t = resp.json || {};
        const msgs = Array.isArray(t.messages) ? t.messages : (resp.items || []);
        const carriers = msgs.filter((m) => (m.labelIds || []).includes(want));
        if (!carriers.length) { notpresent++; upd.run('(decluttered)', r.id); continue; }
        if (DRY) { console.log(`  - ${LABEL_NAME[want] || want}  ${r.subj}  (${carriers.length} msg)`); removed++; continue; }
        for (const m of carriers) {
          if (!m.id) continue;
          await withTimeout(gmailCall('update_email', { email_id: m.id, remove_labels: [want] }, onGate), 25000, 'update_email');
          await sleep(200);
        }
        upd.run('(decluttered)', r.id);
        removed++;
        console.log(`  ✓ removed ${LABEL_NAME[want] || want}  ${r.subj}`);
      } catch (e) {
        if (e instanceof FloorViolation) { console.error('  FLOOR — stopping declutter.'); break; }
        dcErr++; console.error(`  ✗ ${r.subj}: ${(e.message || '').slice(0, 70)}`);
      }
    }
    console.log(`declutter: removed=${removed} not-present=${notpresent} errors=${dcErr}`);
  }

  process.exit(0); // abandoned timed-out sockets can keep the loop alive; exit clean.
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
