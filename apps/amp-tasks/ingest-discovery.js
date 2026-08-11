#!/usr/bin/env node
// Ingest /tmp/discovery-*.jsonl into project_artifacts.
// Idempotent on (project_id, url). Records with no url use snippet hash as the dedup key.
//
// Each JSONL line: {project_id, kind, title, url, snippet, author, ts, ...extra}

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const db   = require('./db');

const DIR = '/tmp';
const files = fs.readdirSync(DIR).filter(f => f.startsWith('discovery-') && f.endsWith('.jsonl') && !f.includes('-meta-'));

const ins = db.prepare(`
  INSERT INTO project_artifacts (project_id, kind, title, url, snippet, author, ts, raw_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(project_id, url) DO UPDATE SET
    title    = excluded.title,
    snippet  = excluded.snippet,
    author   = excluded.author,
    ts       = excluded.ts,
    raw_json = excluded.raw_json
`);

const validProj = new Set(db.prepare(`SELECT id FROM projects`).all().map(r => r.id));

let total = 0, inserted = 0, skipped = 0, byKind = {}, byTheme = {};

const txn = db.transaction(() => {
  for (const f of files) {
    const theme = f.replace(/^discovery-/, '').replace(/\.jsonl$/, '');
    byTheme[theme] = byTheme[theme] || { lines: 0, inserted: 0 };
    const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      byTheme[theme].lines++;
      total++;
      let r;
      try { r = JSON.parse(t); } catch { skipped++; continue; }
      if (!r.project_id || !validProj.has(r.project_id) || !r.kind) { skipped++; continue; }
      // Synthetic url for rows lacking one (so unique index still dedups by content)
      const url = r.url || `synth:${r.kind}:${crypto.createHash('sha1').update(`${r.project_id}|${r.title||''}|${r.snippet||''}|${r.ts||''}`).digest('hex').slice(0,16)}`;
      try {
        ins.run(r.project_id, r.kind, r.title || null, url, r.snippet || null, r.author || null, r.ts || null, JSON.stringify(r));
        inserted++;
        byTheme[theme].inserted++;
        byKind[r.kind] = (byKind[r.kind] || 0) + 1;
      } catch (e) {
        skipped++;
      }
    }
  }
});
txn();

console.log(`Ingested ${inserted}/${total} discovery rows (${skipped} skipped).`);
console.log('  by kind:', byKind);
console.log('  by theme:');
for (const [t, s] of Object.entries(byTheme)) console.log(`    ${t}: ${s.inserted}/${s.lines}`);

const coverage = db.prepare(`
  SELECT COUNT(DISTINCT project_id) AS n FROM project_artifacts
`).get();
const totalProj = db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE roadmap IN ('Payments','Experience')`).get();
console.log(`\nProject coverage: ${coverage.n}/${totalProj.n} roadmap projects have ≥1 artifact.`);
