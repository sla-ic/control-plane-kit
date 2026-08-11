#!/usr/bin/env node
/* bulk-archive.js — FAST, reversible bulk archive of a Gmail noise category.
 *
 * WHY THIS EXISTS: the per-thread classifier (inbox-sweep.js) reads every body and
 * runs 2 LLM calls per thread — right for judgment, catastrophically slow for bulk.
 * Whole Gmail categories (promotions/social/updates/forums) are noise by definition;
 * they need NO judgment. This walks a category, collects message IDs, and archives
 * them in ONE batch_update_emails call per wave (remove INBOX = archive, reversible,
 * stays in All Mail). No bodies, no get_thread, no LLM. ~2 connector calls per wave.
 *
 * SAFETY: archive only (never trash/delete). PROTECT_SENDERS stay in inbox. Serial
 * (the connector 429s on concurrency). Reversible: everything is searchable in All
 * Mail and re-addable to INBOX.
 *
 * USAGE
 *   node bulk-archive.js --query "in:inbox category:updates" [--limit 15] [--max-waves 100] [--dry-run]
 */
const { gmailCall } = require('./mcp-dispatch');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i+1] && !argv[i+1].startsWith('--') ? argv[i+1] : d; };
const has = (n) => argv.includes(n);
const LIMIT = parseInt(arg('--limit', '15'), 10);
const MAX_WAVES = parseInt(arg('--max-waves', '120'), 10);
const DRY = has('--dry-run');
const QUERY = arg('--query', 'in:inbox category:updates');

// Senders whose mail an external server-side job consumes from the inbox — never archive.
const PROTECT = new Set(['meeting-notes@example.com']);

function items(resp) {
  if (Array.isArray(resp.items) && resp.items.length) return resp.items;
  const j = resp.json || resp.result || {};
  return j.messages || j.threads || j.emails || (Array.isArray(j) ? j : []) || [];
}
const pick = (o, ...ks) => { for (const k of ks) if (o && o[k] != null) return o[k]; };
function senderEmail(m) {
  const raw = String(pick(m, 'sender_email', 'from', 'sender') || '');
  return ((raw.match(/[\w.+-]+@[\w.-]+/) || [])[0] || '').toLowerCase();
}
function epochOf(m) {
  const raw = pick(m, 'internalDate', 'date');
  if (raw == null) return null;
  const p = /^\d+$/.test(String(raw)) ? parseInt(raw, 10) : Date.parse(raw);
  return Number.isNaN(p) ? null : p;
}

async function readWave(query, tries = 5) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await gmailCall('read_emails', { query, max_results: LIMIT }, () => {});
      last = r;
      if (!r.isError && items(r).length) return r;
    } catch (_) { /* retry */ }
    await new Promise((res) => setTimeout(res, 1000 * i));
  }
  return last;
}

async function main() {
  console.log(`\n📦 bulk-archive  query="${QUERY}"  limit=${LIMIT}${DRY ? '  [DRY-RUN]' : ''}\n`);
  const seen = new Set();
  let cursor = null, wave = 0, archived = 0, protectedN = 0;
  const DAY = 86400000;
  while (wave < MAX_WAVES) {
    wave++;
    const q = cursor ? `${QUERY} before:${Math.floor(cursor / 1000)}` : QUERY;
    const resp = await readWave(q);
    if (!resp || resp.isError) { console.log(`  wave ${wave}: read failed after retries — stopping.`); break; }
    const msgs = items(resp);
    if (!msgs.length) { console.log(`\n✅ wave ${wave}: empty below cursor — done.`); break; }

    const ids = [];
    let minEpoch = null;
    let allSeen = true;
    for (const m of msgs) {
      const id = pick(m, 'id', 'msg_id', 'message_id');
      const e = epochOf(m);
      if (e != null) minEpoch = minEpoch == null ? e : Math.min(minEpoch, e);
      if (!id || seen.has(id)) continue;
      allSeen = false;
      seen.add(id);
      if (PROTECT.has(senderEmail(m))) { protectedN++; continue; }
      ids.push(id);
    }

    if (allSeen) { cursor = (minEpoch || cursor || Date.now()) - DAY; continue; }
    console.log(`🌊 wave ${wave}: ${ids.length} to archive${protectedN ? ` (${protectedN} protected so far)` : ''}  [${q}]`);
    if (ids.length && !DRY) {
      try {
        await gmailCall('batch_update_emails', { email_ids: ids, remove_labels: ['INBOX'] }, () => {});
        archived += ids.length;
        console.log(`   ↳ archived ${ids.length}  [total ${archived}]`);
      } catch (e) {
        console.log(`   ✗ batch failed: ${String(e.message).slice(0, 100)} — retrying singly`);
        for (const id of ids) {
          try { await gmailCall('archive_email', { email_id: id }, () => {}); archived++; }
          catch (_) { /* skip */ }
          await new Promise((r) => setTimeout(r, 200));
        }
        console.log(`   ↳ archived (singly) total ${archived}`);
      }
    } else if (ids.length) {
      archived += ids.length; // dry-run tally
    }
    cursor = minEpoch ? minEpoch - 1000 : (cursor ? cursor - DAY : Date.now() - DAY);
    await new Promise((r) => setTimeout(r, 500)); // gentle pacing to avoid 429
  }
  console.log(`\n— bulk-archive done — ${DRY ? 'WOULD archive' : 'archived'} ${archived}, protected ${protectedN}, waves ${wave}\n`);
}
main().catch((e) => { console.error('bulk-archive failed:', e.message); process.exit(1); });
