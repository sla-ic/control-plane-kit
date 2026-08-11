#!/usr/bin/env node
/* probe-inbox.js — SERIAL, read-only census of reachable inbox volume per category.
 * No gateway/classify cost — just counts what read_emails returns, with retry on the
 * known ~1-in-5 transient empty/isError. Serialized to respect the connector. */
const { gmailCall } = require('./mcp-dispatch');

function threadList(resp) {
  if (Array.isArray(resp.items) && resp.items.length) return resp.items;
  const j = resp.json || resp.result || {};
  return j.threads || j.messages || j.results || j.emails || (Array.isArray(j) ? j : []) || [];
}

async function countQuery(query, max = 15, tries = 5) {
  let best = 0, errs = 0;
  for (let i = 1; i <= tries; i++) {
    try {
      const resp = await gmailCall('read_emails', { query, max_results: max }, () => {});
      const n = threadList(resp).length;
      if (resp.isError) { errs++; }
      else if (n > best) best = n;
      // if we hit the ceiling on a clean read, that's enough signal
      if (!resp.isError && n >= max) return { best: n, ceiling: true, errs };
    } catch (e) { errs++; }
    await new Promise((r) => setTimeout(r, 800 * i));
  }
  return { best, ceiling: best >= max, errs };
}

async function main() {
  const queries = [
    'in:inbox',
    'in:inbox category:primary',
    'in:inbox category:updates',
    'in:inbox category:forums',
    'in:inbox category:promotions',
    'in:inbox category:social',
    'in:inbox is:unread',
  ];
  for (const q of queries) {
    const { best, ceiling, errs } = await countQuery(q, 15);
    console.log(`${ceiling ? '≥' : ' '}${String(best).padStart(3)}  ${errs ? `(${errs} err) ` : ''}${q}`);
  }
}
main().catch((e) => { console.error('probe failed:', e.message); process.exit(1); });
