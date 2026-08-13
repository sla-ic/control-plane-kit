// cross-system-audit.js — first-party, in-system adjudication audit of the inbox.
//
// WHY: triage assigns a route from the email alone. This stage RE-CHECKS each live
// inbox thread against cross-system ground truth — Slack (the decision channel),
// local Jira mirror, Calendar, the local commitments/decisions DB — to answer three
// questions Jordan asked: (1) is the route/adjudication right, (2) has he ALREADY
// CLOSED this topic elsewhere, (3) is it labelled correctly. It then writes the
// verdict, corrects route+label, applies the Gmail label (additive/reversible), and
// for verified-closed topics stages an ARCHIVE PROPOSAL (never executes — earned-auto).
//
// ARCHITECTURE (the fix for the melt): runs SEQUENTIALLY through mcp-dispatch, which
// shares ONE mcpgw token. A concurrent 189-agent fan-out melts that token; a paced
// serial loop through the first-party integrations does not. No Glean — direct only.
//
// SAFETY (project_email_recovery): already_closed REQUIRES cited cross-system evidence
// and survives an independent refute pass; default is NOT-closed. Archives are only
// ever PROPOSED. meeting-notes@example.com is hard-protected. Floor is enforced by
// mcp-dispatch on every call.
//
// USAGE
//   node cross-system-audit.js --limit 30            # audit next 30 unaudited (dry preview of writes off? no — writes DB)
//   node cross-system-audit.js --id <thread_id>      # one thread, verbose
//   node cross-system-audit.js --refresh             # re-audit already-audited rows
//   node cross-system-audit.js --no-labels           # skip live Gmail label application
//   node cross-system-audit.js --deep                # add Confluence search per thread

const db = require('/Users/you/.local/share/amp-tasks/db');
const { claude, parseJSON } = require('/Users/you/.local/share/amp-tasks/llm');
const { gmailCall, slackCall, slackSearch, hasSlackUserToken, gcalCall, confluenceCall, FloorViolation } = require('/Users/you/.local/share/amp-tasks/mcp-dispatch');
// Local transcript FTS (raw-first). Best-effort: a missing/failed index must never
// break the audit — transcriptSearch degrades to []. Import is side-effect-free
// (transcript-index guards build() behind require.main).
let transcriptSearch = () => [];
try { transcriptSearch = require('/Users/you/.local/share/amp-tasks/transcript-index').search; } catch (_) {}

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const LIMIT = parseInt(arg('--limit', '30'), 10);
const ONE_ID = arg('--id', null);
const REFRESH = has('--refresh');
const NO_LABELS = has('--no-labels');
const DEEP = has('--deep');
const MODEL = arg('--model', 'sonnet');
const VERBOSE = has('--verbose') || !!ONE_ID;

const PRINCIPAL = 'jordan@example.com';
const BATCH = 'xsaudit-20260720';
const ROUTE_LABEL = { needs_you: 'Label_3', fyi: 'Label_4', calendar: 'Label_5', automated: 'Label_6', external: 'Label_7', inbox: null };
const LABEL_NAME = { Label_3: '⚡ Needs You', Label_4: '👀 FYI', Label_5: '📅 Calendar', Label_6: '📊 Automated', Label_7: '🤝 External' };
const PROTECT_SENDERS = ['meeting-notes@example.com']; // feeds hourly meeting-notes archiver — NEVER archive

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (s, n) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
// Never let an MCP error/permission payload become "evidence" for the LLM — that's
// how the Slack missing_scope string got cited as a closure signal. An error payload
// is not signal; treat it as absent.
function isErrorPayload(text) {
  const t = (text || '').toLowerCase();
  return !t || t.includes('"error"') || t.includes('missing_scope') || t.includes('not_authed')
    || t.includes('unavailable') || t.includes('the request to the') || t.includes('failed. (url');
}
let SLACK_OK = true; // flipped off for the run on a missing_scope probe (saves 1 call/thread)
const SLACK_USER_TOKEN = hasSlackUserToken(); // custom-app xoxp- present ⇒ direct Web API search

// Slack signal cache. The mcpgw Slack connector is bot-token only (no user-token
// search:read), so `slackCall('search')` is permanently missing_scope here. Full search
// DOES work through the corp Claude-managed connector (slack-search) but that's harness-only
// (no on-disk endpoint), unreachable from headless node. Bridge: a harness-driven
// enricher (slack-enrich.js) runs those searches and writes rows here; the runtime reads
// this local table — no MCP call, no melt, resumable. Row: one per thread_id.
db.exec(`CREATE TABLE IF NOT EXISTS slack_signal (
  thread_id  TEXT PRIMARY KEY,
  query      TEXT,
  hits       INTEGER DEFAULT 0,
  excerpt    TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
)`);
function cachedSlackSignal(threadId) {
  try {
    const r = db.prepare('SELECT query, hits, excerpt FROM slack_signal WHERE thread_id = ?').get(threadId);
    if (r && r.excerpt && !isErrorPayload(r.excerpt)) return r;
  } catch (_) {}
  return null;
}

// ── thread parsing ──────────────────────────────────────────────────────────
function parseThread(resp) {
  const t = resp.json || {};
  const msgs = t.messages || t.thread || t.emails || resp.items || [];
  const arr = Array.isArray(msgs) ? msgs : [];
  const last = arr[arr.length - 1] || {};
  const principalLast = String(last.from || '').toLowerCase().includes(PRINCIPAL);
  // Union of labelIds across the thread = the ACTUAL Gmail label state (ground truth,
  // not the DB which can drift). Used to decide whether a label really needs applying.
  const labelIds = new Set();
  for (const m of arr) for (const l of (m.labelIds || [])) labelIds.add(l);
  const inInbox = labelIds.has('INBOX');
  return { messages: arr, last, principalLast, lastMsgId: last.id || null, count: arr.length, labelIds, inInbox };
}

// A search query from the subject: drop Re:/Fwd:, keep the distinctive head.
function subjectQuery(subject) {
  return (subject || '').replace(/^(re|fwd|fw):\s*/gi, '').replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
}
function extractJiraKey(s) { const m = (s || '').match(/\b[A-Z][A-Z0-9]+-\d+\b/); return m ? m[0] : null; }

// ── first-party cross-system signal gathering (sequential, paced) ─────────────
async function gatherSignals(item, thread) {
  const ev = [];
  const subj = item.subject || '';

  // Slack — the decision channel (heaviest weight). What landed on this topic?
  // Prefer the local slack_signal cache (populated by the harness-driven enricher via
  // the corp full-search connector). Fall back to mcpgw `slackCall('search')` ONLY if
  // no cache row exists — that path is bot-token only (missing_scope) so it will no-op,
  // but keeping it means the runtime lights up automatically if a user-token search
  // scope ever lands on the mcpgw connector (custom app). Error payloads are filtered
  // so they never reach the LLM as false evidence.
  const q = subjectQuery(subj);
  const cached = cachedSlackSignal(item.thread_id);
  if (cached) {
    // 1) local cache (harness-enriched via corp full-search connector).
    ev.push({ system: 'slack', ref: cached.query || q, excerpt: clip(cached.excerpt, 900) });
  } else if (q && SLACK_USER_TOKEN) {
    // 2) direct Slack Web API with a user token (custom app search:read) — headless.
    try {
      const r = await slackSearch(q, { count: 6 });
      if (r.ok && r.text) {
        const txt = clip(r.text, 900);
        ev.push({ system: 'slack', ref: q, excerpt: txt });
        try { db.prepare('INSERT OR REPLACE INTO slack_signal(thread_id,query,hits,excerpt,updated_at) VALUES (?,?,?,?,datetime(\'now\'))').run(item.thread_id, q, r.total || r.matches.length, txt); } catch (_) {}
      }
    } catch (e) { if (e instanceof FloorViolation) throw e; }
    await sleep(200);
  } else if (q && SLACK_OK) {
    // 3) mcpgw fallback — bot-token only (missing_scope); no-ops but future-proofs.
    try {
      const r = await slackCall('search', { query: q });
      const txt = clip(r.text, 700);
      if (isErrorPayload(txt)) { if (txt.includes('missing_scope')) SLACK_OK = false; }
      else ev.push({ system: 'slack', ref: q, excerpt: txt });
    } catch (e) { if (e instanceof FloorViolation) throw e; }
    await sleep(250);
  }

  // Transcript — first-party meeting dialogue (local FTS, no network). RAW-FIRST
  // (Jordan's directive): a Gemini SUMMARY hit is a synthesized claim, same failure
  // class as trusting a compaction summary — it may NOT stand alone as closure
  // evidence. So a raw-dialogue hit is surfaced as normal first-party evidence,
  // while a summary-only hit is explicitly flagged UNCORROBORATED, and the SYS/refute
  // prompts' "concrete cited evidence" bar keeps it from tipping already_closed.
  try {
    const hits = transcriptSearch(q || subj, 4) || [];
    if (hits.length) {
      const raw = hits.filter((h) => h.section === 'raw');
      const use = raw.length ? raw : hits;
      const uncorrob = raw.length ? '' : ' [UNCORROBORATED summary — no raw dialogue backs this; not closure evidence]';
      const excerpt = use.slice(0, 2).map((h) => `«${h.mdate || '?'} ${clip(h.title, 40)}» ${clip((h.snip || '').replace(/[«»…]/g, ''), 260)}`).join(' ; ');
      if (excerpt) ev.push({ system: 'transcript', ref: q || subjectQuery(subj), excerpt: clip(excerpt, 700) + uncorrob });
    }
  } catch (_) { /* index absent/failed → no transcript signal, never fatal */ }

  // Jira — local synced mirror (no network); a Done/Closed status = topic resolved.
  const key = extractJiraKey(subj) || extractJiraKey(item.snippet);
  if (key) {
    try {
      const t = db.prepare('SELECT title, jira_status, status FROM tasks WHERE jira_key = ?').get(key);
      if (t) ev.push({ system: 'jira', ref: key, excerpt: `${t.title || ''} | status: ${t.jira_status || t.status || '?'}` });
    } catch (_) {}
  }

  // Calendar — for meeting/logistics threads, a past-dated event = logistics closed.
  if (item.route === 'calendar' || /meeting|invite|calendar|sync|call\b/i.test(subj)) {
    try {
      const r = await gcalCall('search_events', { query: subjectQuery(subj), max_results: 3 });
      const txt = clip(r.text, 400);
      if (txt && !isErrorPayload(txt)) ev.push({ system: 'calendar', ref: subjectQuery(subj), excerpt: txt });
    } catch (e) { if (e instanceof FloorViolation) throw e; }
    await sleep(250);
  }

  // Confluence — optional deep pass; a published page can mean the decision is documented.
  if (DEEP) {
    try {
      const r = await confluenceCall('list_pages', { limit: 3, query: subjectQuery(subj) });
      const txt = clip(r.text, 400);
      if (txt && !isErrorPayload(txt)) ev.push({ system: 'confluence', ref: subjectQuery(subj), excerpt: txt });
    } catch (e) { if (e instanceof FloorViolation) throw e; }
    await sleep(250);
  }

  // Local commitments/decisions already captured for this thread.
  try {
    const c = db.prepare("SELECT text, status FROM email_commitments WHERE thread_id = ?").all(item.thread_id);
    if (c && c.length) ev.push({ system: 'commitments', ref: item.thread_id, excerpt: c.map((x) => `[${x.status}] ${clip(x.text, 90)}`).join(' ; ').slice(0, 500) });
  } catch (_) {}

  return ev;
}

// ── LLM adjudication ──────────────────────────────────────────────────────────
const SYS = `You are Amp, Jordan Rivera's chief-of-staff reasoning layer at Acme (Jordan leads Payments Platform + Experience; PRINCIPAL = ${PRINCIPAL}).

You are AUDITING one Gmail thread's triage verdict against cross-system evidence. Decide three things and return STRICT JSON only.

ROUTES: needs_you (a real, direct, still-open ask/decision Jordan personally owes) | external (live outside-partner thread — keep visible) | fyi (informational) | calendar (meeting logistics) | automated (bot/notification) | inbox (internal, no single owner-action).

CLOSURE DISCIPLINE — this is where care matters most (a prior blind archive lost 5 real actions):
- already_closed=true ONLY with concrete cited cross-system evidence the topic is decided/shipped/superseded/answered AND Jordan owes nothing further. No evidence ⇒ already_closed=false.
- If Jordan sent the LAST message in the thread, the ball is usually NOT in his court (likely handled/awaiting others) — but "handled" ≠ "closed" unless evidence confirms resolution.
- A payment-partner thread with any dangling ask ⇒ NOT closed.
- When uncertain ⇒ already_closed=false, action=keep_as_is.

action: keep_as_is | relabel (route right, label missing/wrong) | reroute (route wrong) | archive_resolved (closed + no open loop) | escalate (real needs_you Jordan still owes, aging).

Return: {"route_ok":bool,"correct_route":"<route>","already_closed":bool,"closed_confidence":0.0-1.0,"evidence":["cited signal", ...],"open_loop":"the one still-open action, or empty","suggested_label":"Label_3|Label_4|Label_5|Label_6|Label_7|none","action":"...","notes":"one line"}`;

async function adjudicate(item, thread, signals) {
  const evText = signals.length ? signals.map((s) => `[${s.system}${s.ref ? ' ' + s.ref : ''}] ${s.excerpt}`).join('\n') : '(no cross-system signal found)';
  const lastBody = clip(thread.last.body || thread.last.snippet, 900);
  const user = `THREAD
subject: ${item.subject}
from: ${item.sender_email || item.sender}
current route: ${item.route}
messages in thread: ${thread.count}
Jordan sent the last message: ${thread.principalLast ? 'YES' : 'no'}
last message (${clip(thread.last.from, 60)}): ${lastBody}

CROSS-SYSTEM EVIDENCE (first-party: Slack/Jira/Calendar/Confluence/local):
${evText}

Audit this thread. Return the JSON verdict.`;
  const { text } = await claude([{ role: 'user', content: user }], { model: MODEL, system: SYS, maxTokens: 500 });
  const v = parseJSON(text);
  if (!v || typeof v !== 'object') throw new Error('unparseable verdict');
  return v;
}

// Independent refute pass — only for closure / reroute claims (the expensive, risky ones).
const REFUTE_SYS = `You are an adversarial verifier. Your DEFAULT is to REFUTE the claim unless the cited evidence is concrete and specific. Bias hard toward "not closed / keep in inbox" — a wrongly-archived thread loses a real action. Return STRICT JSON: {"verified":bool,"final_action":"keep_as_is|relabel|reroute|archive_resolved|escalate","reason":"one line"}`;
async function refute(item, thread, v) {
  const user = `Claim about thread "${item.subject}" (from ${item.sender_email || item.sender}, current route ${item.route}, Jordan-sent-last=${thread.principalLast}):
  action=${v.action} correct_route=${v.correct_route} already_closed=${v.already_closed}
  evidence=${JSON.stringify(v.evidence || [])}
  notes=${v.notes || ''}

Is this genuinely supported? If already_closed/archive_resolved lacks concrete evidence that Jordan owes nothing, verified=false + final_action=keep_as_is (or escalate if he clearly owes a reply). If a reroute isn't clearly better, verified=false + keep_as_is. Return JSON.`;
  const { text } = await claude([{ role: 'user', content: user }], { model: MODEL, system: REFUTE_SYS, maxTokens: 250 });
  const r = parseJSON(text) || {};
  return { verified: r.verified !== false, final_action: r.final_action || v.action, reason: r.reason || '' };
}

// ── DB + Gmail application ─────────────────────────────────────────────────────
const upd = db.prepare("UPDATE email_items SET route=?, gmail_label=?, status=?, verdict=?, verified_at=datetime('now'), note=? WHERE thread_id=?");
const hasProp = db.prepare("SELECT id FROM email_sweep_actions WHERE thread_id=? AND action='archive' AND status IN ('proposed','executed')");
const insProp = db.prepare(`INSERT INTO email_sweep_actions (thread_id, subject, sender_email, action, label, reason, guardrail, review_verdict, review_note, status, batch_key, created_at)
  VALUES (?, ?, ?, 'archive', ?, ?, 'audit-closed', 'closed', ?, 'proposed', ?, datetime('now'))`);

async function applyVerdict(item, thread, v, finalAction, verified, onGate) {
  const finalRoute = (finalAction === 'reroute' && v.correct_route) ? v.correct_route : item.route;
  const wantLabel = ROUTE_LABEL[finalRoute] || null;
  let status = item.status || 'open';
  let note = clip(v.notes, 250);
  let labelApplied = false, proposed = false;

  if (finalAction === 'archive_resolved' && verified && v.already_closed) {
    const sender = String(item.sender_email || item.sender || '').toLowerCase();
    if (PROTECT_SENDERS.some((p) => sender.includes(p))) {
      note = 'PROTECTED sender — closure ignored; ' + note;
    } else {
      status = 'resolved';
      note = 'CLOSED: ' + clip(v.notes, 120) + ' | ev: ' + (v.evidence || []).join('; ').slice(0, 250);
      if (!hasProp.get(item.thread_id)) {
        insProp.run(item.thread_id, item.subject || '', item.sender_email || item.sender || '', wantLabel, ('audit: closed cross-system. ' + clip(v.notes, 200)), (v.evidence || []).join('; ').slice(0, 400), BATCH);
        proposed = true;
      }
    }
  } else if (finalAction === 'escalate') {
    status = 'open';
    note = 'ESCALATE: ' + clip(v.open_loop || v.notes, 200);
  }

  // Apply the label live (additive, reversible, floor-allowed) unless closed (the
  // archive proposal carries the label) or --no-labels. Decide off ACTUAL Gmail
  // state (thread.labelIds), not the DB — the DB's gmail_label can drift.
  const alreadyHasLabel = wantLabel ? thread.labelIds.has(wantLabel) : true;
  if (wantLabel && !NO_LABELS && status !== 'resolved' && !alreadyHasLabel) {
    try {
      const eid = thread.lastMsgId;
      if (eid) { await gmailCall('update_email', { email_id: eid, add_labels: [wantLabel] }, onGate); labelApplied = true; await sleep(200); }
    } catch (e) { if (e instanceof FloorViolation) throw e; note = note + ` [label apply failed: ${clip(e.message, 60)}]`; }
  }

  // Only record gmail_label in the DB when it's genuinely on the thread in Gmail
  // (already there, or we just applied it). Never claim a label we didn't apply.
  const dbLabel = (wantLabel && (alreadyHasLabel || labelApplied)) ? wantLabel : (status === 'resolved' ? wantLabel : null);
  upd.run(finalRoute, dbLabel, status, 'xa:' + finalAction, note, item.thread_id);
  return { finalRoute, wantLabel, labelApplied, proposed, status, alreadyHadLabel: alreadyHasLabel };
}

// ── main loop ──────────────────────────────────────────────────────────────────
(async () => {
  let rows;
  if (ONE_ID) {
    rows = db.prepare('SELECT * FROM email_items WHERE thread_id=?').all(ONE_ID);
  } else {
    const where = REFRESH ? '1=1' : "(verdict IS NULL OR verdict NOT LIKE 'xa:%')";
    rows = db.prepare(`SELECT * FROM email_items WHERE status IN ('open','acked') AND ${where} ORDER BY id DESC LIMIT ?`).all(LIMIT);
  }
  console.log(`cross-system-audit: ${rows.length} thread(s) | model=${MODEL} labels=${!NO_LABELS} deep=${DEEP}`);
  const onGate = (e) => { if (!e.allow) console.error(`  ⛔ FLOOR ${e.tool}: ${e.reason}`); };
  const tally = {};
  let done = 0, errors = 0, labels = 0, proposals = 0;

  for (const item of rows) {
    try {
      const tr = parseThread(await gmailCall('get_thread', { thread_id: item.thread_id }, onGate));
      await sleep(200);
      const signals = await gatherSignals(item, tr);
      const v = await adjudicate(item, tr, signals);

      let finalAction = v.action || 'keep_as_is';
      let verified = true, reason = '';
      if (finalAction === 'archive_resolved' || finalAction === 'reroute') {
        const r = await refute(item, tr, v);
        verified = r.verified; finalAction = r.final_action; reason = r.reason;
      }
      const res = await applyVerdict(item, tr, v, finalAction, verified, onGate);
      tally[finalAction] = (tally[finalAction] || 0) + 1;
      if (res.labelApplied) labels++;
      if (res.proposed) proposals++;
      done++;
      const flag = (v.action !== finalAction) ? ` (audit:${v.action}→refuted)` : '';
      console.log(`  ✓ [${finalAction}${flag}] ${clip(item.subject, 52)} | ${item.route}${res.finalRoute !== item.route ? '→' + res.finalRoute : ''} ${res.wantLabel || 'no-label'}${res.labelApplied ? '✓' : ''}${res.proposed ? ' +archive-proposal' : ''}`);
      if (VERBOSE) console.log(`       ev=${JSON.stringify((v.evidence || []).slice(0, 3))} closed=${v.already_closed} conf=${v.closed_confidence} ${reason ? '| refute:' + reason : ''}`);
    } catch (e) {
      errors++;
      console.error(`  ✗ ${clip(item.subject, 52)}: ${clip(e.message, 100)}`);
      if (e instanceof FloorViolation) { console.error('  FLOOR violation — stopping.'); break; }
    }
  }

  console.log(`\ndone=${done} errors=${errors} labels-applied=${labels} archive-proposals=${proposals}`);
  console.log(`actions: ${JSON.stringify(tally)}`);
  const remaining = db.prepare("SELECT COUNT(*) n FROM email_items WHERE status IN ('open','acked') AND (verdict IS NULL OR verdict NOT LIKE 'xa:%')").get().n;
  console.log(`unaudited remaining: ${remaining}`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
