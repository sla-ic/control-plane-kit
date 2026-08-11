// transcript-index.js — build a local FTS index over meeting transcripts, split
// into RAW dialogue vs GEMINI SUMMARY, so the audit can corroborate.
//
// WHY (Jordan's directive): "DO NOT OVERINDEX ON GEMINI SUMMARIES. CORROBORATE
// WITH THE RAW TRANSCRIPTS." A Gemini "Decisions: Aligned/Shelved" block is a
// synthesized CLAIM — same failure class as a compaction summary treated as
// gospel. The raw speaker-level dialogue is ground truth. This index tags every
// chunk section='raw' | 'summary' and records has_raw per source, so a summary
// decision can NEVER stand alone as closure evidence: transcriptSignal() only
// returns a summary hit flagged UNCORROBORATED when no raw dialogue backs it.
//
// SOURCES
//   ~/.local/share/amp-tasks/transcripts/*.txt   (current pull: # Notes + # Transcript)
//   ~/Documents/Claude/Projects/transcripts/*.md  (pre-Amp corpus: raw-heavy)
//
// USAGE
//   node transcript-index.js            # (re)build the index
//   node transcript-index.js --stats    # show what's indexed
//   node transcript-index.js --q "northwind pay later"   # test a signal query

const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('/Users/you/.local/share/amp-tasks/db');

const HOME = os.homedir();
const SOURCES = [
  path.join(HOME, '.local/share/amp-tasks/transcripts'),
  path.join(HOME, 'Documents/Claude/Projects/transcripts'),
];

const has = (k) => process.argv.includes(k);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

// ── schema ────────────────────────────────────────────────────────────────────
// FTS5 over chunks; a companion table records per-source metadata incl. has_raw.
db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS transcript_fts USING fts5(
  source, title, mdate, section, chunk, tokenize='porter unicode61'
)`);
db.exec(`CREATE TABLE IF NOT EXISTS transcript_source (
  source   TEXT PRIMARY KEY,
  title    TEXT,
  mdate    TEXT,
  has_raw  INTEGER DEFAULT 0,
  raw_chars INTEGER DEFAULT 0,
  sum_chars INTEGER DEFAULT 0,
  indexed_at TEXT DEFAULT (datetime('now'))
)`);

// ── parsing ─────────────────────────────────────────────────────────────────--
const SPEAKER_RE = /^(?:\*\*[A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)*:?\*\*|[A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+){0,3}:)\s/;
const TX_HDR_RE = /^#+\s+.*transcript/i;

function isSpeakerLine(l) { return SPEAKER_RE.test(l); }

function parseDate(name) {
  const m = name.match(/(\d{4})[_-](\d{2})[_-](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function deriveTitle(name, lines) {
  // gemini "# Notes" format keeps the human title on/near line 3
  if (/^#\s*Notes/i.test(lines[0] || '')) {
    for (let i = 1; i < 6; i++) { const t = (lines[i] || '').trim(); if (t && !/^(invited|attachments|summary)$/i.test(t)) return t.slice(0, 120); }
  }
  // "## <Title> - Transcript" or "# Meeting transcripts"
  const hdr = lines.find((l) => TX_HDR_RE.test(l));
  if (hdr) return hdr.replace(/^#+\s*/, '').replace(/\\?-?\s*transcript\s*$/i, '').replace(/[\\*]/g, '').trim().slice(0, 120) || name;
  // filename minus the "- Notes by Gemini"/date tail
  return name.replace(/\.(txt|md)$/i, '').replace(/\s*-\s*\d{4}[_-].*$/, '').replace(/\s*-\s*Notes by Gemini.*$/i, '').trim().slice(0, 120) || name;
}

// Split a file into { summary, raw } at the first transcript header. If none,
// classify by whether it has speaker lines (raw) or not (summary).
function splitSections(text) {
  const lines = text.split(/\r?\n/);
  const hdrIdx = lines.findIndex((l) => TX_HDR_RE.test(l));
  if (hdrIdx >= 0) {
    return { summary: lines.slice(0, hdrIdx).join('\n'), raw: lines.slice(hdrIdx + 1).join('\n') };
  }
  const speakerCount = lines.filter(isSpeakerLine).length;
  if (speakerCount >= 5) return { summary: '', raw: text };
  return { summary: text, raw: '' };
}

// Chunk on speaker/paragraph boundaries into ~1400-char windows so an FTS hit
// returns a coherent, quotable passage (with who said it) rather than a fragment.
function chunk(text, size = 1400) {
  const out = [];
  const paras = text.split(/\n(?=(?:\*\*)?[A-Z])/); // break before likely speaker/heading lines
  let buf = '';
  for (const p of paras) {
    const s = p.trim();
    if (!s) continue;
    if (buf.length + s.length > size && buf) { out.push(buf.trim()); buf = ''; }
    buf += s + '\n';
    if (buf.length > size * 1.6) { out.push(buf.trim()); buf = ''; }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((c) => c.replace(/\s+/g, '').length > 40);
}

// ── build ─────────────────────────────────────────────────────────────────────
function build() {
  db.exec('DELETE FROM transcript_fts');
  db.exec('DELETE FROM transcript_source');
  const insFts = db.prepare('INSERT INTO transcript_fts(source, title, mdate, section, chunk) VALUES (?,?,?,?,?)');
  const insSrc = db.prepare('INSERT OR REPLACE INTO transcript_source(source,title,mdate,has_raw,raw_chars,sum_chars) VALUES (?,?,?,?,?,?)');
  let files = 0, chunks = 0, withRaw = 0;

  const tx = db.transaction(() => {
    for (const dir of SOURCES) {
      let names = [];
      try { names = fs.readdirSync(dir).filter((n) => /\.(txt|md)$/i.test(n)); } catch (_) { continue; }
      for (const name of names) {
        const full = path.join(dir, name);
        let text;
        try { text = fs.readFileSync(full, 'utf8'); } catch (_) { continue; }
        if (text.replace(/\s+/g, '').length < 200) continue; // skip stubs/placeholders
        const lines = text.split(/\r?\n/);
        const title = deriveTitle(name, lines);
        const mdate = parseDate(name);
        const { summary, raw } = splitSections(text);
        const hasRaw = raw.replace(/\s+/g, '').length > 300 ? 1 : 0;
        const rel = path.join(path.basename(dir), name);

        for (const c of chunk(raw)) { insFts.run(rel, title, mdate, 'raw', c); chunks++; }
        for (const c of chunk(summary)) { insFts.run(rel, title, mdate, 'summary', c); chunks++; }
        insSrc.run(rel, title, mdate, hasRaw, raw.length, summary.length);
        files++; if (hasRaw) withRaw++;
      }
    }
  });
  tx();
  console.log(`indexed ${files} file(s), ${chunks} chunk(s), ${withRaw} with raw transcript`);
}

// ── query (mirrors what cross-system-audit's transcriptSignal will call) ────────
function ftsQuery(q) {
  const terms = (q || '').replace(/[^\w\s-]/g, ' ').split(/\s+/).filter((t) => t.length > 2).slice(0, 8);
  if (!terms.length) return null;
  return terms.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
}
function search(q, limit = 6) {
  const match = ftsQuery(q);
  if (!match) return [];
  try {
    return db.prepare(
      `SELECT source, title, mdate, section, snippet(transcript_fts,4,'«','»','…',18) AS snip,
              bm25(transcript_fts) AS score
       FROM transcript_fts WHERE transcript_fts MATCH ?
       ORDER BY (CASE section WHEN 'raw' THEN 0 ELSE 1 END), score LIMIT ?`
    ).all(match, limit);
  } catch (e) { return []; }
}

// ── cli ─────────────────────────────────────────────────────────────────────--
// Guarded so `require('./transcript-index')` (from cross-system-audit's
// transcriptSignal) imports search()/ftsQuery() WITHOUT re-running build() —
// the schema CREATE-IF-NOT-EXISTS above is idempotent and safe on import.
if (require.main === module) {
if (has('--stats')) {
  const srcs = db.prepare('SELECT source,title,mdate,has_raw,raw_chars,sum_chars FROM transcript_source ORDER BY has_raw DESC, mdate DESC').all();
  console.log(`sources: ${srcs.length}\n`);
  for (const s of srcs) console.log(`${s.has_raw ? '📄RAW ' : '⚠️SUM '} ${s.mdate || '????-??-??'} | ${s.title} | raw=${s.raw_chars} sum=${s.sum_chars}\n         ${s.source}`);
  const n = db.prepare('SELECT COUNT(*) n FROM transcript_fts').get().n;
  const nr = db.prepare("SELECT COUNT(*) n FROM transcript_fts WHERE section='raw'").get().n;
  console.log(`\nchunks: ${n} (raw ${nr} / summary ${n - nr})`);
} else if (arg('--q', null) !== null) {
  const q = arg('--q', '');
  console.log(`query: "${q}"  match=${ftsQuery(q)}\n`);
  for (const r of search(q, 8)) console.log(`[${r.section.toUpperCase()} ${r.mdate || ''}] ${r.title}\n   ${r.snip.replace(/\s+/g, ' ').slice(0, 240)}\n`);
} else {
  build();
}
}

module.exports = { search, ftsQuery };
