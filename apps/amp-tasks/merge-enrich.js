// Merge the per-org fleet enrichment (seed/_enrich_{payments,experience}.json,
// produced by the planner-refresh workflow) into the single seed the importer
// reads (seed/projects-enrich.json). Injects org per record; concatenates
// projects + alias_map. LOCAL SSOT only — never writes outbound.
const fs = require('fs');
const D = __dirname + '/seed';
function load(f) {
  try { return JSON.parse(fs.readFileSync(D + '/' + f, 'utf8')); } catch (e) { return null; }
}
const pay = load('_enrich_payments.json');
const cx = load('_enrich_experience.json');
if (!pay || !cx) { console.error('missing input:', 'payments=' + !!pay, 'experience=' + !!cx); process.exit(1); }

const projects = [], alias_map = [], notes = [];
for (const [org, src] of [['payments', pay], ['experience', cx]]) {
  for (const p of (src.projects || [])) projects.push({ org, ...p });
  for (const a of (src.alias_map || [])) alias_map.push({ org, ...a });
  if (src.notes) notes.push(`[${org}] ${src.notes}`);
}
const out = {
  generated_at: new Date().toISOString(),
  projects, alias_map, unresolved: [], notes: notes.join(' | '),
};
fs.writeFileSync(D + '/projects-enrich.json', JSON.stringify(out, null, 1));
console.log('merged projects:', projects.length, '| aliases:', alias_map.length,
            '| payments:', pay.projects.length, '| experience:', cx.projects.length);
console.log('with pcrs:', projects.filter(p => (p.pcrs || []).length).length,
            '| with theme:', projects.filter(p => p.theme).length,
            '| with docs:', projects.filter(p => (p.doc_refs || []).length).length);
