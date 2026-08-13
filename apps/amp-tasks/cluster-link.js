#!/usr/bin/env node
/*
 * cluster-link.js — the connective tissue between the email plane and the
 * project/cluster substrate (ADR-0018).
 *
 * THE GAP THIS CLOSES: email_items had ZERO linkage to `projects` (the 72 real
 * clusters with synthesis fields your_move/blocker/status_synthesis) or to the
 * planner substrate. Every other worker synthesizes projects, resolves needs-you,
 * audits routes — but nothing answered "which project does this email advance?"
 * So a needs_you item could never be surfaced next to its cluster's live blocker.
 *
 * WHAT IT DOES: for each open email_item without a project link, assign a
 * projects.id + confidence + source, matching STRONGEST-signal-first:
 *   1. pcr    — a Jira/PROJ key in subject/snippet that equals a project's pcr or a
 *               planner row's pcr/pcr_all (mapped to its project by normalized name).
 *   2. alias  — a multi-word project alias/name phrase (from projects.name + planner
 *               aliases) appearing verbatim in the email text.
 *   3. domain — external sender domain → partner project (northwind→Installments, contoso→PROJ,
 *               benefitco→BenefitCo Benefits, paylink/proctwo/procone→the processor cluster, …).
 *   4. llm    — bounded single-call fallback for still-ambiguous ACTIONABLE items
 *               (needs_you / inbox route only), choosing from a compact candidate
 *               list. Off unless --llm. Uses llm.claude (Anthropic-direct) — NOT the
 *               shared mcpgw token, so no fan-out / melt risk.
 *
 * REUSE, don't duplicate: norm() is the exact matcher from synthesize-projects.js /
 * build-vocab.js; extractJiraKey mirrors needs-you-resolver.js; the target table is
 * the existing `projects`, the alias source is the existing planner_projects.
 *
 * Deterministic passes (1–3) are PURE-LOCAL — no gateway at all (email_items already
 * hold subject/snippet/sender). SERIALIZED single process. Default-SAFE: writes only
 * local link rows; --dry computes-and-prints without persisting.
 */

const db = require('./db');

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const DRY = has('--dry');
const USE_LLM = has('--llm');
const LIMIT = parseInt(arg('--limit', '500'), 10);
const RELINK = has('--relink'); // re-evaluate items that already have a link
const ONLY_ACTIONABLE = has('--actionable'); // restrict to needs_you + inbox routes
const RUN_ID = `clink-${process.pid}-${process.hrtime()[1]}`;

// ── norm(): identical to synthesize-projects.js:31 / build-vocab.js — do not fork ──
const norm = (s) => String(s || '').toLowerCase().replace(/[\[\]]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// PROJ/Jira key extractor — mirrors needs-you-resolver.js extractJiraKey.
const jiraKeys = (s) => Array.from(String(s || '').matchAll(/([A-Z]{2,}-\d+)/g)).map((m) => m[1].toUpperCase());

function runStart() { if (DRY) return; try { db.prepare(`INSERT INTO fleet_runs (run_id, worker, host, model, status) VALUES (?,?,?,?,'running')`).run(RUN_ID, 'amp-cluster-link', require('os').hostname(), USE_LLM ? 'claude' : 'none'); } catch (_) {} }
function runEnd(status, considered, errors) { try { db.prepare(`UPDATE fleet_runs SET status=?, considered=?, errors=?, ended_at=datetime('now') WHERE run_id=?`).run(status, considered || 0, errors || 0, RUN_ID); } catch (_) {} }

function ensureSchema() {
  // Link lives ON email_items (a message belongs to at most one primary cluster;
  // multi-project spillover is rare and can be added as a join table later without
  // migrating this). Mirrors the projects.synth_* provenance convention.
  const cols = db.prepare(`PRAGMA table_info(email_items)`).all().map((c) => c.name);
  if (!cols.includes('project_id')) db.prepare(`ALTER TABLE email_items ADD COLUMN project_id INTEGER`).run();
  if (!cols.includes('project_confidence')) db.prepare(`ALTER TABLE email_items ADD COLUMN project_confidence REAL`).run();
  if (!cols.includes('project_source')) db.prepare(`ALTER TABLE email_items ADD COLUMN project_source TEXT`).run();
  if (!cols.includes('project_linked_at')) db.prepare(`ALTER TABLE email_items ADD COLUMN project_linked_at TEXT`).run();
  try { db.prepare(`CREATE INDEX IF NOT EXISTS idx_email_items_project ON email_items(project_id)`).run(); } catch (_) {}
}

// ── Build the match index from the EXISTING substrate ────────────────────────
function buildIndex() {
  const projects = db.prepare(`SELECT id, name, area, theme, pcr FROM projects`).all();
  const projById = new Map(projects.map((p) => [p.id, p]));
  const projByNorm = new Map();
  for (const p of projects) { const n = norm(p.name); if (n && !projByNorm.has(n)) projByNorm.set(n, p.id); }

  const pcrToProj = new Map();   // 'PROJ-123' -> projectId
  const phraseToProj = [];       // [{phrase, tokens:Set, projectId, weight}]
  // Single-token generic project names are too common to be reliable aliases
  // (e.g. "onboarding" matched an unrelated PROJ). Require multi-word phrases, or a
  // single token that is BOTH long and not a generic business word.
  const STOP = new Set(['onboarding', 'infrastructure', 'payments', 'payment', 'pcr', 'pars', 'offers', 'checkout', 'orders', 'disputes', 'auth', 'subscriptions', 'integration']);
  const addPhrase = (raw, projectId, weight) => {
    const n = norm(raw); if (!n || n.length < 4) return;
    const toks = n.split(' ').filter((w) => w.length >= 3);
    if (!toks.length) return;
    if (toks.length === 1 && (STOP.has(toks[0]) || toks[0].length < 6)) return; // low-precision single token
    phraseToProj.push({ phrase: n, tokens: new Set(toks), projectId, weight });
  };

  // From projects directly
  for (const p of projects) {
    if (p.pcr) for (const k of jiraKeys(p.pcr)) pcrToProj.set(k, p.id);
    addPhrase(p.name.replace(/^PROJ:\s*/i, ''), p.id, 1.0);
  }

  // From planner_projects — map each planner row to a project by normalized name,
  // then fold its pcr/pcr_all/aliases into that project's match set.
  const planner = db.prepare(`SELECT best_name, name, key, pcr, pcr_all, aliases, theme FROM planner_projects`).all();
  for (const pp of planner) {
    const n = norm(pp.best_name || pp.name || pp.key);
    let pid = projByNorm.get(n);
    if (!pid) continue; // planner row with no synthesis-project counterpart — skip (target must be a real cluster)
    for (const field of [pp.pcr, pp.pcr_all]) if (field) for (const k of jiraKeys(field)) pcrToProj.set(k, pid);
    if (pp.aliases) { try { for (const a of JSON.parse(pp.aliases)) addPhrase(a, pid, 0.9); } catch (_) {} }
    if (pp.best_name) addPhrase(pp.best_name, pid, 0.85);
  }

  // Partner sender-domain → project. Derived deterministically by finding the
  // project whose name contains the partner token; explicit where the name differs.
  const findByToken = (tok) => { for (const p of projects) if (norm(p.name).includes(tok)) return p.id; return null; };
  const domainMap = {};
  const setDom = (dom, pid) => { if (pid) domainMap[dom] = pid; };
  setDom('northwind.com', findByToken('northwind'));
  setDom('contoso.com', findByToken('contoso'));
  setDom('benefitco.com', findByToken('benefitco'));
  setDom('procone.com', findByToken('procone') || findByToken('multi processor'));
  setDom('proctwo.com', findByToken('proctwo') || findByToken('multi processor'));
  setDom('paylink.com', findByToken('paylink'));
  setDom('visionco.com', findByToken('vision') || findByToken('ml'));
  setDom('jpmorgan.com', findByToken('multi processor') || findByToken('token'));

  // Local Jira mirror (the `tasks` table synced by sync-jira.js) — ground truth for
  // what a bare "PROJ-XXXX" actually IS. Lets a PROJ-key email resolve to a specific
  // cluster instead of the generic per-Jira-project bucket (id "PROJ").
  const pcrMirror = new Map(); // 'PROJ-000' -> {title, area}
  try {
    for (const t of db.prepare(`SELECT jira_key, title, project FROM tasks WHERE jira_key IS NOT NULL AND title IS NOT NULL`).all()) {
      pcrMirror.set(String(t.jira_key).toUpperCase(), { title: t.title, area: t.project || null });
    }
  } catch (_) {}

  return { projById, projByNorm, pcrToProj, phraseToProj, domainMap, pcrMirror };
}

// Match a PROJ title against the existing phrase index → an established cluster.
function matchTitleToProject(title, idx) {
  const ntext = ' ' + norm(title) + ' ';
  let best = null;
  for (const ph of idx.phraseToProj) {
    if (ntext.includes(' ' + ph.phrase + ' ')) {
      const score = ph.weight * (0.6 + Math.min(0.4, ph.phrase.length / 60));
      if (!best || score > best.score) best = { projectId: ph.projectId, score };
    }
  }
  return best && best.score >= 0.6 ? best.projectId : null;
}

// Ensure a specific per-PROJ cluster exists (idempotent by pcr key). A PROJ issue is
// its own unit of work → its own cluster; synthesize-projects can enrich it later.
function ensurePcrCluster(key, title, area) {
  const existing = db.prepare(`SELECT id FROM projects WHERE pcr = ?`).get(key);
  if (existing) return existing.id;
  if (DRY) return -1;
  const name = `${key} — ${String(title).slice(0, 80)}`;
  const info = db.prepare(`INSERT INTO projects (name, description, status, color, area, pcr, source_url)
    VALUES (?, ?, 'active', '#64748b', ?, ?, ?)`)
    .run(name, `Auto-created from Jira mirror for emailed PROJ ${key}.`, area || 'Payments', key, `https://acme.atlassian.net/browse/${key}`);
  return info.lastInsertRowid;
}

// Before matching: for every open email carrying a PROJ key that the substrate can't
// yet place, resolve it via the local Jira mirror and fold it into pcrToProj — either
// onto an existing cluster (title match) or a fresh per-PROJ cluster. PURE-LOCAL.
function resolvePcrClusters(idx) {
  const emails = db.prepare(`SELECT subject, snippet FROM email_items WHERE status='open'`).all();
  const need = new Set();
  for (const e of emails) for (const k of jiraKeys(`${e.subject || ''} ${e.snippet || ''}`)) {
    if (!idx.pcrToProj.has(k) && idx.pcrMirror.has(k)) need.add(k);
  }
  let onExisting = 0, created = 0;
  for (const k of need) {
    const { title, area } = idx.pcrMirror.get(k);
    const existingPid = matchTitleToProject(title, idx);
    if (existingPid) { idx.pcrToProj.set(k, existingPid); onExisting++; continue; }
    const pid = ensurePcrCluster(k, title, area);
    if (pid && pid !== -1) { idx.pcrToProj.set(k, pid); created++; }
  }
  if (need.size) console.log(`cluster-link: PROJ resolve — ${onExisting} onto existing cluster, ${created} new PROJ cluster(s) (${need.size} keys via mirror)`);
  return { onExisting, created };
}

// Match one item. Returns {projectId, confidence, source, detail} or null.
function matchItem(it, idx) {
  const text = `${it.subject || ''} ␟ ${it.snippet || ''}`;
  const domain = (it.sender_email || '').split('@')[1] || '';

  // 1. PROJ / Jira key
  for (const k of jiraKeys(text)) {
    const pid = idx.pcrToProj.get(k);
    if (pid) return { projectId: pid, confidence: 0.95, source: 'pcr', detail: k };
  }

  // 2. Alias / name phrase — full normalized phrase must appear as a token-subsequence.
  const ntext = ' ' + norm(text) + ' ';
  let best = null;
  for (const ph of idx.phraseToProj) {
    // require the whole phrase to appear (multi-word phrases are high-precision)
    if (ntext.includes(' ' + ph.phrase + ' ')) {
      const score = ph.weight * (0.6 + Math.min(0.4, ph.phrase.length / 60));
      if (!best || score > best.score) best = { projectId: ph.projectId, score, phrase: ph.phrase };
    }
  }
  if (best && best.score >= 0.6) return { projectId: best.projectId, confidence: Math.min(0.92, best.score), source: 'alias', detail: best.phrase };

  // 3. Sender domain
  if (idx.domainMap[domain]) return { projectId: idx.domainMap[domain], confidence: 0.7, source: 'domain', detail: domain };

  return null;
}

async function llmMatch(item, candidates) {
  const { claude, parseJSON } = require('./llm');
  const list = candidates.map((p) => `${p.id}: ${p.name}${p.area ? ` [${p.area}]` : ''}`).join('\n');
  const msg = [{
    role: 'user',
    content: `Assign this email to ONE project cluster, or none. Reply strict JSON: {"project_id": <id or null>, "confidence": 0..1, "why": "<12 words>"}.\n\nEMAIL\nsubject: ${item.subject || ''}\nfrom: ${item.sender || ''} <${item.sender_email || ''}>\nsnippet: ${(item.snippet || '').slice(0, 400)}\n\nPROJECTS\n${list}\n\nOnly assign if genuinely about that project's work. Prefer null over a weak guess.`,
  }];
  try {
    const r = await claude(msg, { max_tokens: 200, temperature: 0 });
    const j = parseJSON(typeof r === 'string' ? r : (r && r.text) || '');
    if (j && j.project_id) return { projectId: j.project_id, confidence: Math.min(0.75, j.confidence || 0.6), source: 'llm', detail: (j.why || '').slice(0, 80) };
  } catch (e) { /* degrade silently — deterministic links already persisted */ }
  return null;
}

function persist(itemId, m) {
  if (DRY) return;
  db.prepare(`UPDATE email_items SET project_id=?, project_confidence=?, project_source=?, project_linked_at=datetime('now') WHERE id=?`)
    .run(m.projectId, m.confidence, m.source, itemId);
}

(async () => {
  ensureSchema();
  runStart();
  const idx = buildIndex();
  resolvePcrClusters(idx); // fold mirror-resolvable PROJ keys into the index first
  const where = [`status='open'`];
  if (!RELINK) where.push(`project_id IS NULL`);
  if (ONLY_ACTIONABLE) where.push(`(route='needs_you' OR route='inbox' OR route IS NULL)`);
  const items = db.prepare(`SELECT id, thread_id, subject, snippet, sender, sender_email, route
    FROM email_items WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(LIMIT);

  // Relink re-evaluates from scratch: clear the selected set first so a now-null
  // match actually removes a stale link (persist() only writes on a match).
  if (RELINK && !DRY && items.length) {
    const ids = items.map((i) => i.id);
    db.prepare(`UPDATE email_items SET project_id=NULL, project_confidence=NULL, project_source=NULL, project_linked_at=NULL WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  }

  const counts = { pcr: 0, alias: 0, domain: 0, llm: 0, none: 0 };
  const unmatchedActionable = [];
  for (const it of items) {
    const m = matchItem(it, idx);
    if (m) { persist(it.id, m); counts[m.source]++; continue; }
    // Deterministic miss. Queue actionable items for the optional LLM pass.
    if (it.route === 'needs_you' || it.route === 'inbox' || it.route == null) unmatchedActionable.push(it);
    else counts.none++;
  }

  if (USE_LLM && unmatchedActionable.length) {
    const candidates = db.prepare(`SELECT id, name, area FROM projects WHERE status IN ('active','backlog') OR your_move IS NOT NULL OR blocker IS NOT NULL ORDER BY id`).all();
    for (const it of unmatchedActionable) {
      const m = await llmMatch(it, candidates); // SERIAL — one at a time, Anthropic-direct
      if (m) { persist(it.id, m); counts.llm++; } else counts.none++;
    }
  } else {
    counts.none += unmatchedActionable.length;
  }

  const linked = counts.pcr + counts.alias + counts.domain + counts.llm;
  console.log(`cluster-link: ${DRY ? 'DRY — ' : ''}${linked}/${items.length} linked (pcr=${counts.pcr} alias=${counts.alias} domain=${counts.domain} llm=${counts.llm}), ${counts.none} unmatched`);
  if (!DRY) runEnd('ok', items.length, 0);
})().catch((e) => { console.error('cluster-link FAILED:', e.message); if (!DRY) runEnd('crashed', 0, 1); process.exit(1); });
