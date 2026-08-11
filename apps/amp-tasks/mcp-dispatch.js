// mcp-dispatch.js — gated MCP transport for headless fleet routines.
//
// WHY THIS EXISTS
//   harness/claude-code/guard.py enforces the floor for INTERACTIVE Claude Code
//   (PreToolUse hook). A headless routine (email-triage.js under launchd, or an
//   CloudRunner cloud run) never passes through that hook — it POSTs straight to the
//   mcpgw MCP endpoints. So the floor would be UNENFORCED on exactly the path
//   that acts unattended. This module closes that gap: every outbound MCP call
//   goes through checkFloor() FIRST, using the SAME docs/policy/floor.json guard.py
//   reads, so the two enforcement points can never drift.
//
//   It is a faithful JS port of guard.py's decision function for the branches an
//   MCP tool call can actually hit: hard_deny -> slack_send -> default_allow.
//   (drive_write/fs_write/bash_deny are Write/Edit/Bash tools, unreachable here.)
//   Fail mode is CLOSED: a missing/unparseable floor denies everything.
//
// USAGE
//   const { gmailCall, slackCall, checkFloor, FloorViolation } = require('./mcp-dispatch');
//   const thread = await gmailCall('get_thread', { thread_id });     // allowed read
//   await gmailCall('send_email', {...});   // throws FloorViolation before any egress
//   node mcp-dispatch.js --selftest        // prove the gate (analogous to golden_test.py)

const fs = require('fs');
const path = require('path');

// ── floor resolution (mirror guard.py's order, plus the launchd runtime copy) ──
//   1) $AMP_FLOOR_JSON
//   2) ./floor.json            (runtime dir — cycle-b.sh copies it in; no repo there)
//   3) ../../docs/policy/floor.json  (repo dev checkout)
function resolveFloorPath() {
  const candidates = [
    process.env.AMP_FLOOR_JSON,
    path.join(__dirname, 'floor.json'),
    path.normalize(path.join(__dirname, '..', '..', 'docs', 'policy', 'floor.json')),
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (_) { /* keep looking */ }
  }
  return candidates[candidates.length - 1] || null;
}

let _floor; // cached
function loadFloor() {
  if (_floor !== undefined) return _floor;
  const p = resolveFloorPath();
  try {
    _floor = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    // Fail closed — a routine that cannot read its floor must not act.
    _floor = null;
  }
  return _floor;
}

class FloorViolation extends Error {
  constructor(reason, tool) { super(reason); this.name = 'FloorViolation'; this.tool = tool; }
}

// slack_send matcher — mirrors guard.py _slack_matches (re.I, require_substring).
function slackMatches(ss, tool) {
  const low = tool.toLowerCase();
  for (const m of ss.match_any || []) {
    if (new RegExp(m.pattern, 'i').test(tool)) {
      const sub = m.require_substring;
      if (sub == null || low.includes(sub)) return true;
    }
  }
  return false;
}

/**
 * Decide allow/deny for an MCP tool call, reading floor.json.
 * @returns {{allow:boolean, reason:string}}
 */
function checkFloor(toolName, args = {}) {
  const floor = loadFloor();
  if (!floor) return { allow: false, reason: 'floor.json missing/unparseable — fail closed' };
  const tool = String(toolName || '');

  // 1) hard_deny (anchored .match, re.I)
  for (const entry of floor.hard_deny_tool_patterns || []) {
    if (new RegExp(entry.pattern, 'i').test(tool)) {
      return { allow: false, reason: entry.reason };
    }
  }

  // 2) slack_send — whitelist + DM allowance. Once matched, always exits.
  const ss = floor.slack_send;
  if (ss && slackMatches(ss, tool)) {
    let ch = '';
    for (const fld of ss.channel_field_candidates || []) {
      if (args[fld]) { ch = args[fld]; break; }
    }
    const chNorm = String(ch).trim();
    if (!chNorm) return { allow: false, reason: 'slack send with no channel' };
    const prefixes = ss.allow_dm_prefixes || [];
    if (prefixes.some((p) => chNorm.startsWith(p)) && chNorm.length >= (ss.allow_dm_min_len || 0)) {
      return { allow: true, reason: 'slack DM' };
    }
    if ((ss.channel_id_whitelist || []).includes(chNorm)) {
      return { allow: true, reason: 'slack channel-id whitelist' };
    }
    const names = new Set((ss.channel_name_whitelist || []).map((n) => n.replace(/^#/, '')));
    if (names.has(chNorm.replace(/^#/, ''))) {
      return { allow: true, reason: 'slack channel-name whitelist' };
    }
    return { allow: false, reason: `${ss.deny_reason || 'slack channel not allowed'}: '${chNorm}'` };
  }

  // 3) default allow (reads, create_draft, update_draft, etc.)
  return { allow: true, reason: 'default_allow' };
}

// ── mcpgw MCP transport ───────────────────────────────────────────────────
function readToken() {
  const p = path.join(process.env.HOME, '.config/amp/mcpgw.token');
  if (!fs.existsSync(p)) throw new Error(`mcpgw token not found at ${p}`);
  return fs.readFileSync(p, 'utf8').trim();
}

// mcpgw returns either application/json or text/event-stream. Normalise both
// to the JSON-RPC envelope, then unwrap the MCP tool-result content.
function parseMcpResponse(raw) {
  let env;
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    env = JSON.parse(trimmed);
  } else {
    // SSE: take the last `data:` line carrying a JSON payload.
    const dataLines = trimmed.split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .filter((l) => l && l !== '[DONE]');
    if (!dataLines.length) throw new Error(`unparseable MCP response: ${trimmed.slice(0, 160)}`);
    env = JSON.parse(dataLines[dataLines.length - 1]);
  }
  if (env.error) throw new Error(`MCP error: ${JSON.stringify(env.error).slice(0, 200)}`);
  const result = env.result || {};
  // MCP tool result: { content: [{type:'text', text:'...'}], isError? }
  const blocks = result.content || [];
  const textBlocks = blocks.filter((b) => b.type === 'text').map((b) => b.text);
  const text = textBlocks.join('\n').trim();
  // mcpgw returns list results as ONE JSON object PER content block (e.g.
  // read_emails → one block per email), so the joined text is N concatenated
  // objects and won't JSON.parse whole. Parse each block; `items` is the list.
  const items = [];
  for (const tb of textBlocks) {
    const s = (tb || '').trim();
    if (!s || (s[0] !== '{' && s[0] !== '[')) continue;
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) items.push(...parsed); else items.push(parsed);
    } catch (_) { /* non-JSON block, skip */ }
  }
  // single-object convenience (get_thread etc.): json = the one parsed object.
  let json;
  if (items.length === 1) json = items[0];
  else if (items.length > 1) json = { items };
  else { try { if (text && (text[0] === '{' || text[0] === '[')) json = JSON.parse(text); } catch (_) { /* leave as text */ } }
  return { raw: env, result, text, json, items, isError: !!result.isError };
}

let _rpcId = 0;

/**
 * Call a mcpgw-hosted MCP tool over HTTP, gated by the floor.
 * @param {string} server  mcpgw server slug ('gmail' | 'slack')
 * @param {string} toolPrefix  full tool name prefix used by the floor regexes
 * @param {string} tool  bare tool name (e.g. 'get_thread')
 * @param {object} args
 * @param {(evt:object)=>void} [onGate]  optional sink for a blocked/allowed audit event
 */
async function mcpCall(server, toolPrefix, tool, args = {}, onGate) {
  const fullName = `${toolPrefix}${tool}`;
  const decision = checkFloor(fullName, args);
  if (onGate) onGate({ tool: fullName, allow: decision.allow, reason: decision.reason });
  if (!decision.allow) throw new FloorViolation(decision.reason, fullName);

  const token = readToken();
  const url = `https://mcp.mcpgw.com/${server}/${token}/mcp`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++_rpcId, method: 'tools/call', params: { name: tool, arguments: args } }),
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${raw.slice(0, 200)}`);
    return parseMcpResponse(raw);
  } finally {
    clearTimeout(timer);
  }
}

const GMAIL_PREFIX = 'mcp__gmail-guMCP-server__';
const SLACK_PREFIX = 'mcp__slack-guMCP-server__';
const GDRIVE_PREFIX = 'mcp__gdrive-guMCP-server__';
const GDOCS_PREFIX = 'mcp__gdocs-guMCP-server__';
const GSHEETS_PREFIX = 'mcp__gsheets-guMCP-server__';
const GCAL_PREFIX = 'mcp__gcalendar-guMCP-server__';
const CONFLUENCE_PREFIX = 'mcp__confluence-guMCP-server__';
const JIRA_PREFIX = 'mcp__jira-guMCP-server__';

const gmailCall = (tool, args, onGate) => mcpCall('gmail', GMAIL_PREFIX, tool, args, onGate);
const slackCall = (tool, args, onGate) => mcpCall('slack', SLACK_PREFIX, tool, args, onGate);
// gdrive READ tools (search/get_file/download_file/list_contents) fall through to
// default_allow; the dangerous ones (__delete, add_file_sharing_preference) are
// caught by hard_deny before any egress. Verified in --selftest below.
const gdriveCall = (tool, args, onGate) => mcpCall('gdrive', GDRIVE_PREFIX, tool, args, onGate);
// gdocs/gsheets READS for the Gemini transcript pipeline. read_doc / batch-get
// fall through to default_allow; any write/share/delete tool on these servers
// is still caught by the shared hard_deny patterns before egress (same guard
// guard.py reads). Do NOT weaken the deny set.
const gdocsCall = (tool, args, onGate) => mcpCall('gdocs', GDOCS_PREFIX, tool, args, onGate);
const gsheetsCall = (tool, args, onGate) => mcpCall('gsheets', GSHEETS_PREFIX, tool, args, onGate);
// Calendar + Confluence READS for cross-system closure audit (a past-dated event
// = meeting logistics closed; a published Confluence page = decision landed).
// list_events / search_events / get_page / list_pages fall through to
// default_allow; create/update/delete on these servers are caught by hard_deny
// (calendar delete/write + generic delete patterns) before egress. Read-only use.
const gcalCall = (tool, args, onGate) => mcpCall('gcalendar', GCAL_PREFIX, tool, args, onGate);
const confluenceCall = (tool, args, onGate) => mcpCall('confluence', CONFLUENCE_PREFIX, tool, args, onGate);
// Jira READS for the autonomous task spine (fetch-jira.js → sync-jira.js). Read
// tools are all list_*/get_*/search_issues/execute_jql → default_allow; every
// mutating verb (create_/update_/delete_/transition_/comment_/add_/remove_) on a
// jira server is caught by the jira hard_deny patterns before egress (ADR-0001:
// outward/irreversible actuators stay Jordan-only). Read-only use here.
const jiraCall = (tool, args, onGate) => mcpCall('jira', JIRA_PREFIX, tool, args, onGate);

// ── direct Slack Web API search (headless, no mcpgw) ────────────────────────
//   The mcpgw Slack connector is BOT-token only, so search.messages is a
//   permanent missing_scope (search:read is a USER-token scope mcpgw's app never
//   requests). The fix is a custom Slack app that grants a user token (xoxp-) with
//   search:read — see SLACK-CUSTOM-APP-SETUP.md. Once that token is dropped at
//   ~/.config/amp/slack-user.token, the runtime calls Slack's Web API directly here,
//   with NO mcpgw dependency. Read-only: search.messages only. Still floor-gated
//   for symmetry (search is a read → default_allow; a send would be denied).
function readUserToken() {
  const override = process.env.SLACK_USER_TOKEN;
  if (override && override.trim()) return override.trim();
  const p = path.join(process.env.HOME, '.config/amp/slack-user.token');
  if (!fs.existsSync(p)) return null;
  const t = fs.readFileSync(p, 'utf8').trim();
  return t || null;
}
function hasSlackUserToken() { return !!readUserToken(); }

/**
 * Search Slack messages via the Web API using a user token (xoxp-) with search:read.
 * @param {string} query  Slack search syntax (supports in:#chan, from:@user, etc.)
 * @param {object} [opts] { count=8, sort='timestamp', highlight=false }
 * @returns {Promise<{ok:boolean, error?:string, matches:Array, text:string, total:number}>}
 *          On no-token / API error: {ok:false, error, matches:[], text:''} — never throws
 *          for the missing-token case, so callers can treat Slack as simply absent.
 */
async function slackSearch(query, opts = {}) {
  const decision = checkFloor(`${SLACK_PREFIX}search`, { query });
  if (!decision.allow) throw new FloorViolation(decision.reason, `${SLACK_PREFIX}search`);
  const token = readUserToken();
  if (!token) return { ok: false, error: 'no_user_token', matches: [], text: '', total: 0 };
  const count = Math.min(opts.count || 8, 20);
  const sort = opts.sort || 'timestamp';
  const body = new URLSearchParams({ query: String(query || ''), count: String(count), sort, highlight: opts.highlight ? 'true' : 'false' });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch('https://slack.com/api/search.messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body,
    });
    const j = await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
    if (!j.ok) return { ok: false, error: j.error || `http_${res.status}`, matches: [], text: '', total: 0 };
    const matches = (j.messages && j.messages.matches) || [];
    const total = (j.messages && j.messages.total) || matches.length;
    const text = matches.map((m) => {
      const chan = (m.channel && (m.channel.name ? '#' + m.channel.name : m.channel.id)) || '';
      const who = m.username || (m.user || '');
      return `[${chan} ${who} ${m.ts || ''}] ${(m.text || '').replace(/\s+/g, ' ').trim()}`;
    }).join('\n');
    return { ok: true, matches, text, total };
  } catch (e) {
    return { ok: false, error: e.message || 'fetch_failed', matches: [], text: '', total: 0 };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { checkFloor, gmailCall, slackCall, gdriveCall, gdocsCall, gsheetsCall, gcalCall, confluenceCall, jiraCall, slackSearch, hasSlackUserToken, FloorViolation, loadFloor, resolveFloorPath, parseMcpResponse };

// ── selftest: prove the gate before any network (analogous to golden_test.py) ──
if (require.main === module && process.argv.includes('--selftest')) {
  const cases = [
    // [tool, args, expectAllow]
    [`${GMAIL_PREFIX}send_email`, { to: 'x@y.com' }, false],
    [`${GMAIL_PREFIX}forward_email`, {}, false],
    // ADR-0015: reversible inbox hygiene now ALLOWED (guardrails+review agent+undo gate them).
    [`${GMAIL_PREFIX}trash_email`, {}, true],
    [`${GMAIL_PREFIX}archive_email`, {}, true],
    [`${GMAIL_PREFIX}batch_update_emails`, {}, true],
    [`${GMAIL_PREFIX}update_email`, {}, true],
    // permanent destruction stays DENY — trash != delete.
    [`${GMAIL_PREFIX}delete_email`, {}, false],
    [`${GMAIL_PREFIX}read_emails`, {}, true],
    [`${GMAIL_PREFIX}get_thread`, { thread_id: 't' }, true],
    [`${GMAIL_PREFIX}search`, { query: 'x' }, true],
    [`${GMAIL_PREFIX}list_drafts`, {}, true],
    [`${GMAIL_PREFIX}create_draft`, { thread_id: 't' }, true],
    [`${GMAIL_PREFIX}update_draft`, { draft_id: 'd' }, true],
    [`${GMAIL_PREFIX}create_label`, { name: 'x' }, true],
    // slack: whitelisted channel allowed, unknown denied, no-channel denied
    [`${SLACK_PREFIX}send_message`, { channel_id: 'C0AMPALERT' }, true],
    [`${SLACK_PREFIX}send_message`, { channel_id: 'C_UNKNOWN' }, false],
    [`${SLACK_PREFIX}send_message`, {}, false],
    // calendar / delete generic hard-denies (defense in depth)
    [`${GMAIL_PREFIX}delete_draft`, { draft_id: 'd' }, false],
    // gdrive: READ tools allowed, share/delete denied (do NOT weaken these).
    [`${GDRIVE_PREFIX}search`, { query: 'Notes by Gemini' }, true],
    [`${GDRIVE_PREFIX}get_file`, { file_id: 'x' }, true],
    [`${GDRIVE_PREFIX}download_file`, { file_id: 'x' }, true],
    [`${GDRIVE_PREFIX}list_contents`, {}, true],
    [`${GDRIVE_PREFIX}delete`, { file_id: 'x' }, false],
    [`${GDRIVE_PREFIX}add_file_sharing_preference`, {}, false],
    // gdocs / gsheets: transcript-pipeline READS allowed (default_allow).
    [`${GDOCS_PREFIX}read_doc`, { doc_id: 'x' }, true],
    [`${GSHEETS_PREFIX}batch-get`, { spreadsheet_url: 'x', ranges: ['A2:E'] }, true],
    // jira: the autonomous spine READS allowed; every mutating verb hard-denied
    // (ADR-0001 — jira writes stay Jordan-only, symmetric with confluence).
    [`${JIRA_PREFIX}execute_jql`, { jql: 'assignee = currentUser()' }, true],
    [`${JIRA_PREFIX}list_issues`, { jql: 'x' }, true],
    [`${JIRA_PREFIX}search_issues`, {}, true],
    [`${JIRA_PREFIX}get_issue`, { issue_key: 'PROJ-000' }, true],
    [`${JIRA_PREFIX}get_my_issues`, {}, true],
    [`${JIRA_PREFIX}list_sites`, {}, true],
    [`${JIRA_PREFIX}create_issue`, { project_key: 'PROJ' }, false],
    [`${JIRA_PREFIX}update_issue`, { issue_key: 'PROJ-000' }, false],
    [`${JIRA_PREFIX}delete_issue`, { issue_key: 'PROJ-000' }, false],
    [`${JIRA_PREFIX}transition_my_issue`, { issue_key: 'PROJ-000', transition_to: 'Done' }, false],
    [`${JIRA_PREFIX}comment_on_issue`, { issue_key: 'PROJ-000', body: 'x' }, false],
    [`${JIRA_PREFIX}add_attachment`, { issue_key: 'PROJ-000', file_name: 'x' }, false],
    [`${JIRA_PREFIX}create_issue_link`, { inward_issue_key: 'a', outward_issue_key: 'b', link_type: 'Blocks' }, false],
    [`${JIRA_PREFIX}delete_issue_link`, { link_id: '1' }, false],
    [`${JIRA_PREFIX}add_user_to_issue`, { issue_key: 'PROJ-000', account_id: 'x', role: 'watcher' }, false],
    [`${JIRA_PREFIX}remove_user_from_group`, { group_name: 'g', account_id: 'x' }, false],
  ];
  let pass = 0, fail = 0;
  const floorOk = !!loadFloor();
  if (!floorOk) { console.error(`✗ floor.json not loadable at ${resolveFloorPath()} — fail-closed active`); }
  for (const [tool, args, expect] of cases) {
    const d = checkFloor(tool, args);
    const ok = d.allow === expect;
    if (ok) pass++; else { fail++; console.error(`  ✗ ${tool} expected ${expect ? 'ALLOW' : 'DENY'} got ${d.allow ? 'ALLOW' : 'DENY'} (${d.reason})`); }
  }
  // fail-closed check: an unmatched-but-parse-broken floor denies. Simulate by
  // confirming that when floor is present, an obviously-denied tool is denied.
  console.log(`\nmcp-dispatch selftest: ${pass}/${pass + fail} pass  (floor: ${resolveFloorPath()})`);
  process.exit(fail || !floorOk ? 1 : 0);
}
