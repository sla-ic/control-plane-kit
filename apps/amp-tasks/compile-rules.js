#!/usr/bin/env node
/*
 * compile-rules.js — the COMPILER half of the email rule bridge (fixes P1-5).
 *
 * It turns accumulated adjudications into executable email_rules:
 *
 *   1. PROTECT rules (born at state='auto' — safe, they only ever over-KEEP) are
 *      anchored to the tierA-recovery-audit's CONFIRMED misses: mail that carried
 *      a real, still-open, Jordan-owned action and was wrongly bulk-archived. Each
 *      protect rule traces (provenance.adjudications) to the exact Gmail threads
 *      that justified it. This is the "your adjudication compiles into an executed
 *      rule" contract — the thing that was missing (P1-5).
 *
 *   2. ARCHIVE rules (born at state='shadow' — they must EARN 'auto' via the
 *      measured precision gate in rule-engine.js) are induced from the sweep's own
 *      executed history: bot-like senders/domains that were archived many times and
 *      KEPT ~never. Retrospective precision is recorded in provenance for
 *      transparency, but the LIVE precision counters start at ZERO — a rule proves
 *      itself forward on real traffic, so graduation is never circular/by-fiat.
 *
 * Re-runnable: rules are keyed by stable slug (INSERT OR REPLACE), so re-compiling
 * refreshes provenance/retrospective stats without resetting a rule that has
 * already accrued LIVE predictions (those live in email_rule_predictions and are
 * recomputed by rollStats, not clobbered here).
 *
 * Usage:  node compile-rules.js            # compile + upsert
 *         node compile-rules.js --dry-run  # print what it WOULD create, write nothing
 */

const db = require('./db');
const { rollStats } = require('./rule-engine');

const DRY = process.argv.includes('--dry-run');

// ── thresholds for inducing an ARCHIVE rule from sweep history ──
const MIN_ARCHIVES = 4;        // need real repetition before a pattern is a rule
const MAX_KEEP_RATE = 0.0;     // strict: induce only where the sweep NEVER kept this sender

// Senders/domains governed by a PROTECT rule must never also become archive rules.
const PROTECT_DOMAINS = new Set(['ExpenseCo.com', 'learnco.co', 'lattice.com', 'accessco.com']);

// Bot-like sender signature. Human colleagues (firstname.lastname@example.com)
// are NEVER turned into blanket archive rules — their mail is content-dependent.
// A handful of internal automation aliases are explicitly allowed through.
const BOT_RE = /(no-?reply|do-?not-?reply|noreply|notifications?|mailer|bounce|daemon|digest|automated|updates?@|alerts?@|@.*\b(atlassian|dtdg|datadoghq|paylink|travelco|rewardsco|healthco|inscorp|visionco|accessco|learnco|greenhouse|workday|lever|calendly|zoom|docusign|rewardsco)\b)/i;
const INTERNAL_BOT_ALIASES = new Set(['jira@acme.atlassian.net','confluence@acme.atlassian.net','newcarrots@example.com','orders@example.com']);
const isHuman = (email) => /@acme\.com$/i.test(email) && /^[a-z]+\.[a-z]+@/i.test(email) && !INTERNAL_BOT_ALIASES.has(email);
const isBotlike = (email) => INTERNAL_BOT_ALIASES.has(email) || (BOT_RE.test(email) && !isHuman(email));
const domainOf = (e) => { const m = String(e||'').toLowerCase().match(/@([\w.-]+)$/); return m ? m[1] : null; };

// ── the PROTECT rules, each anchored to recovery adjudications ──
// tid → the Gmail thread(s) that proved the miss (from tierA-recovery-audit).
const PROTECT_RULES = [
  {
    id: 'protect-ExpenseCo-action',
    kind: 'protect', match_type: 'domain', domain: 'ExpenseCo.com',
    subject_re: '(pending|reject|resubmit|submit|awaiting|action required|needs|overdue)',
    reason: 'ExpenseCo reports needing submission/resubmission are real, dollar-valued, Jordan-owned actions — never auto-archive.',
    match_type_note: 'domain+subject',
    provenance: { origin: 'recovery', adjudications: ['19f7585a525c6831','19ed7adf452753af'],
      note: '$2,580.35 pending + rejected offsite report were bulk-archived with zero capture.' },
  },
  {
    id: 'protect-learnco-training',
    kind: 'protect', match_type: 'domain', domain: 'learnco.co',
    subject_re: '(past due|overdue|mandatory|assigned|complete|due)',
    reason: 'Past-due mandatory training is a compliance action; keep the latest reminder visible until done.',
    provenance: { origin: 'recovery', adjudications: ['19f6ba9deb76ad77'],
      note: 'Past-due Continu training reminders were bulk-archived without capture.' },
  },
  {
    id: 'protect-lattice-review',
    kind: 'protect', match_type: 'domain', domain: 'lattice.com',
    subject_re: '(check-in|review|self|assessment|calibration|feedback|cycle|summary)',
    reason: 'Performance-review / check-in cycles are rare, high-stakes, Jordan-owned — never auto-archive.',
    provenance: { origin: 'recovery', adjudications: ['19f800d9d3cd59b3'],
      note: '2026 Mid-Year Check-in (Lattice) self-review invite was archived.' },
  },
  {
    id: 'protect-accessco-expiry',
    kind: 'protect', match_type: 'domain', domain: 'accessco.com',
    subject_re: '(expir|renew|action required|approve|request)',
    reason: 'Access-entitlement expiries CAN be conditional, but keeping them visible is the safe direction (ambiguous verdict in recovery).',
    provenance: { origin: 'recovery', adjudications: ['19f7627d122cbaf5'],
      note: 'AccessCo data-access expiry — recovery verdict was split (conditional); protect errs toward the inbox.' },
  },
];

// ── the AUTHORED rules (P1-5): Jordan's exact matchers from routing-rules.md ──
// These are hand-written by Jordan, so they carry more authority than a pattern
// induced from history. KEEP rules are 'protect' and born 'auto' (safe — protect
// can only over-keep). Destructive rules (archive/trash) are born 'staged': they
// PROPOSE immediately (honoring Jordan's authorship instead of hiding in shadow),
// but still must EARN 'auto' via the same measured precision gate — authorship is
// not fiat. The protect-jira-* / protect-docs-* rules are MORE SPECIFIC
// (sender+subject_re) than the broad jira archive rule, so the action-bearing
// subset is kept while the rest is proposed for archive — routing-rules.md §5/§6
// expressed through the engine's protect-wins + specificity ordering.
const AUTHORED_RULES = [
  // keep/protect (born auto)
  { id: 'protect-jira-mentioned', kind: 'protect', match_type: 'sender+subject_re',
    sender: 'jira@acme.atlassian.net', subject_re: 'mentioned you',
    reason: 'Jira "mentioned you" is a direct ask of Jordan — keep in inbox (routing-rules.md §5).' },
  { id: 'protect-jira-assigned', kind: 'protect', match_type: 'sender+subject_re',
    sender: 'jira@acme.atlassian.net', subject_re: 'assigned .*to you|assigned to you',
    reason: 'Jira "assigned to you" is a Jordan-owned action — keep in inbox (routing-rules.md §5).' },
  { id: 'protect-docs-mention', kind: 'protect', match_type: 'sender+subject_re',
    sender: 'comments-noreply@docs.google.com', subject_re: '@jordan\\.rivera|@jordan@',
    reason: 'Google Docs @mention of Jordan is an action item — keep in inbox (routing-rules.md §6).' },

  // trash (born staged — authored, must still earn auto)
  { id: 'trash-acme-marketing', kind: 'trash', match_type: 'domain',
    domain: 'customers.acmeemail.com',
    reason: 'Acme consumer marketing — Jordan-authored trash (routing-rules.md §2).' },
  { id: 'trash-wellnessco-marketing', kind: 'trash', match_type: 'sender',
    sender: 'care@wellnessco.example.com',
    reason: 'Spring Health marketing — Jordan-authored trash (routing-rules.md §2).' },
  { id: 'trash-slack-expires', kind: 'trash', match_type: 'sender+subject_re',
    sender: 'notification@slack-mail.com', subject_re: 'expires',
    reason: 'Slack invite-expiry marketing — Jordan-authored trash (routing-rules.md §2).' },

  // archive + label (born staged — authored, must earn auto)
  { id: 'archive-calendar-invites', kind: 'archive', match_type: 'subject_re',
    subject_re: '^(Invitation:|Updated invitation:|Canceled event:|Invitation with note:)',
    label: 'Label_5',
    reason: 'Calendar invite churn → 📅 Calendar, archive (routing-rules.md §4); the invite persists on the calendar.' },
  { id: 'archive-slack-digest', kind: 'archive', match_type: 'sender',
    sender: 'notification@slack.com', label: 'Label_6',
    reason: 'Slack digest → 📊 Automated, archive (routing-rules.md §3).' },
  { id: 'archive-jira-fyi', kind: 'archive', match_type: 'sender',
    sender: 'jira@acme.atlassian.net', label: 'Label_4',
    reason: 'Jira notifications that are not mentioned-you/assigned → 👀 FYI, archive (routing-rules.md §5); the more-specific protect-jira-* rules keep the action-bearing subset.' },
];

function slugSender(email) { return 'archive-' + email.replace(/[^a-z0-9]+/gi, '-').toLowerCase(); }
function slugDomain(dom) { return 'archive-dom-' + dom.replace(/[^a-z0-9]+/gi, '-').toLowerCase(); }

// Upsert that PRESERVES live prediction stats: we write rule config + provenance,
// but never zero out applied/agreed/disagreed for a rule that already exists (its
// live counters are the source of truth for the gate). New rules start at zero.
const upsert = db.prepare(`
  INSERT INTO email_rules (id, kind, label, match_type, sender, domain, subject_re, reason, provenance, state, created_by)
  VALUES (@id,@kind,@label,@match_type,@sender,@domain,@subject_re,@reason,@provenance,@state,'compiler')
  ON CONFLICT(id) DO UPDATE SET
    kind=excluded.kind, label=excluded.label, match_type=excluded.match_type,
    sender=excluded.sender, domain=excluded.domain, subject_re=excluded.subject_re,
    reason=excluded.reason, provenance=excluded.provenance
`);

function put(rule) {
  if (DRY) { console.log(`  [dry] ${rule.state.padEnd(6)} ${rule.kind.padEnd(7)} ${rule.match_type.padEnd(16)} ${rule.sender||rule.domain||rule.subject_re}`); return; }
  upsert.run({
    id: rule.id, kind: rule.kind, label: rule.label || null,
    match_type: rule.match_type, sender: rule.sender || null, domain: rule.domain || null,
    subject_re: rule.subject_re || null, reason: rule.reason || null,
    provenance: JSON.stringify(rule.provenance || {}), state: rule.state,
  });
}

function main() {
  console.log(`\n🧩 compile-rules ${DRY ? '[DRY-RUN]' : ''}\n`);

  // ── 1. PROTECT rules (auto — safe) ──
  console.log('PROTECT rules (state=auto, from recovery adjudications):');
  for (const r of PROTECT_RULES) {
    // protect rules use domain+subject → match_type 'sender+subject_re' semantics on domain.
    // rule-engine matches domain via match_type='domain' (subject ignored) OR we want the
    // subject filter. We encode as match_type='domain' but ALSO carry subject_re; the engine's
    // 'domain' path ignores subject_re, so widen to keep it SAFE: match on domain alone is a
    // superset (protect is safe to over-apply). We keep subject_re in the row for documentation
    // and future tightening, but match on domain so no real action email slips through.
    put({ ...r, match_type: 'domain', state: 'auto' });
  }

  // ── 1b. AUTHORED rules (P1-5): Jordan's routing-rules.md matchers ──
  console.log('\nAUTHORED rules (keep→auto, archive/trash→staged, from routing-rules.md):');
  for (const r of AUTHORED_RULES) {
    const state = r.kind === 'protect' ? 'auto' : 'staged';
    put({
      ...r, state,
      provenance: { origin: 'authored', source: 'routing-rules.md',
        note: r.kind === 'protect'
          ? 'Jordan-authored keep matcher; protect is safe at auto (only ever over-keeps).'
          : 'Jordan-authored destructive matcher; born staged (proposes) — must earn auto via the measured precision gate, authorship is not fiat.' },
    });
  }

  // ── 2. ARCHIVE rules (shadow — must earn auto) induced from sweep history ──
  const bySender = db.prepare(`
    SELECT sender_email,
           SUM(CASE WHEN action='archive' AND status='executed' THEN 1 ELSE 0 END) archived,
           SUM(CASE WHEN action='keep' THEN 1 ELSE 0 END) kept,
           SUM(CASE WHEN action='trash' AND status='executed' THEN 1 ELSE 0 END) trashed
    FROM email_sweep_actions
    WHERE sender_email IS NOT NULL AND sender_email != ''
    GROUP BY sender_email`).all();

  const candidates = bySender.filter((r) => {
    if (r.archived < MIN_ARCHIVES) return false;
    const keepRate = r.kept / (r.archived + r.kept);
    if (keepRate > MAX_KEEP_RATE) return false;
    if (!isBotlike(r.sender_email)) return false;
    if (PROTECT_DOMAINS.has(domainOf(r.sender_email))) return false;
    return true;
  }).sort((a, b) => b.archived - a.archived);

  console.log(`\nARCHIVE rules (state=shadow, induced from ${bySender.length} senders → ${candidates.length} clean candidates):`);
  for (const c of candidates) {
    const retro = c.archived / (c.archived + c.kept); // = 1.0 given MAX_KEEP_RATE=0
    put({
      id: slugSender(c.sender_email), kind: 'archive', match_type: 'sender',
      sender: c.sender_email,
      reason: `Bot-like sender archived ${c.archived}× and never kept in sweep history.`,
      provenance: { origin: 'sweep_history', archived: c.archived, kept: c.kept,
        seeded_precision: retro, note: 'Induced from executed sweep decisions; must earn auto via live precision gate.' },
      state: 'shadow',
    });
    console.log(`  ${String(c.archived).padStart(3)}× / kept ${c.kept}  ${c.sender_email}`);
  }

  // ── recompute live stats for existing rules (no-op for brand-new ones) ──
  if (!DRY) {
    for (const r of db.prepare(`SELECT id FROM email_rules`).all()) rollStats(r.id);
  }

  const summary = DRY ? null : db.prepare(`SELECT kind, state, COUNT(*) n FROM email_rules GROUP BY kind, state ORDER BY kind, state`).all();
  console.log('\n— rule table —');
  if (summary) console.table(summary);
  console.log(DRY ? '\n(dry-run: nothing written)\n' : '\n✅ rules compiled.\n');
}

main();
