// shared.js — canonical client helpers shared across the amp-tasks surfaces.
//
// WHY: esc()/safeUrl() were copy-pasted into every page and had drifted — fleet's
// esc() never escaped the apostrophe, needs-you carried its own safeUrl, email had
// yet another copy. One divergent escaper is one XSS gap waiting to reopen. This is
// the single source of truth for the green surfaces (email / needs-you / fleet).
// Loaded as a plain <script> (no build step) so the helpers are ordinary globals,
// exactly as the inline copies were.
//
// index.html deliberately keeps its own escHtml/escAttr: those have ~250 call sites
// with subtly different null/0 semantics (escHtml(0) -> '' there, by design), and a
// blind migration would risk the 4,880-line view file for a pure-DRY gain. When that
// file is split into modules it should adopt these; until then, this is authoritative
// for the three simple pages only.

(function (g) {
  'use strict';

  // Text-content escaper. Superset of every prior copy: also neutralizes ' and `
  // so a value spliced into a single-quoted attribute or a template literal can't
  // break out. Renders 0/false as their string form (matches fleet's old esc).
  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"'`]/g, function (c) {
      return {
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#39;', '`': '&#96;'
      }[c];
    });
  }

  // URL guard for href/src: only http(s) survives; everything else (javascript:,
  // data:, relative junk) collapses to '#'. Escape the RESULT before interpolation.
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    return /^https?:\/\//i.test(s) ? s : '#';
  }

  // Only define if the page hasn't already (index keeps its own escHtml/escAttr).
  if (typeof g.esc !== 'function') g.esc = esc;
  if (typeof g.safeUrl !== 'function') g.safeUrl = safeUrl;
})(window);
