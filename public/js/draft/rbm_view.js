/* ROSTER BUILDER MODEL PANEL — a SECOND VOICE, never the board's own pick.
 *
 * Cory, 2026-08-19: "it needs to be clear what player model is recommending
 * and why and I still want to retain my current view. So maybe a spot that's
 * says roster builder model says and then the player."
 *
 * Full spec: ROSTER-BUILDER-PANEL-DESIGN.md (A, 2026-08-19). The one rule
 * that governs every decision in this file: this panel must never be
 * mistakable for the war room's own recommendation. It gets its own label,
 * its own accent color, and it sits in its own box — it does not touch,
 * reorder, or annotate the board or #recs-card.
 *
 * PURE RENDER LAYER, same split as position_boards_view.js: this file turns
 * already-computed data into HTML and touches no DOM, no state, no fetch.
 * app.js calls RosterBuilderMLV.recommend(board, roster, {league, topN:3})
 * (public/js/draft/mlv.js) and hands the result here.
 */
(function (global) {
  'use strict';

  function fmtNum(n) {
    if (n == null || !isFinite(n)) return '—';
    return (Math.round(n * 10) / 10).toString();
  }

  function fmtMarginal(n) {
    if (n == null || !isFinite(n)) return '—';
    var r = Math.round(n * 10) / 10;
    return (r >= 0 ? '+' : '') + r;
  }

  /* Three rows is enough (§2 of the spec) — he has his own board for depth;
   * this is a second opinion, and a long list stops reading like one. */
  function row(rec, i, esc) {
    var p = rec.player || {};
    return '<li class="rbm-row">'
      + '<span class="rbm-rank">' + esc(String(i + 1)) + '</span>'
      + '<span class="rbm-name">' + esc(p.name || '—') + '</span>'
      + '<span class="rbm-pos">' + esc(rec.position || '') + '</span>'
      + (p.adp != null ? '<span class="rbm-adp">ADP ' + esc(fmtNum(p.adp)) + '</span>' : '<span class="rbm-adp"></span>')
      + '<span class="rbm-marginal" title="marginal lineup value — points this pick adds to your STARTING lineup, not to your roster">'
        + esc(fmtMarginal(rec.marginal)) + '</span>'
      + '<div class="rbm-why">' + esc(rec.why || '') + '</div>'
      + '</li>';
  }

  /**
   * `recs` — the array RosterBuilderMLV.recommend() returns:
   *   [{ player, position, marginal, why }, ...]
   * `evidenceCaveat` — the one honest sentence (RosterBuilderMLV.EVIDENCE.caveat),
   *   printed in a <details> disclosure, never a confidence badge (§5②: "the
   *   honest statement is a sentence, not a colour").
   * Returns '' when there is nothing to show — no board, no roster, module
   * unavailable upstream — so a missing input degrades to nothing rather than
   * a broken box (same convention as renderPositionBoards).
   */
  function render(recs, evidenceCaveat, esc) {
    if (!Array.isArray(recs) || !recs.length) return '';
    var rows = recs.slice(0, 3).map(function (r, i) { return row(r, i, esc); }).join('');
    return '<div class="rbm-wrap">'
      + '<div class="rbm-head">'
        + '<span class="rbm-title">Roster builder model says</span>'
        + '<span class="rbm-sub">a second voice — not your board\'s own pick</span>'
      + '</div>'
      + '<ol class="rbm-list">' + rows + '</ol>'
      + '<div class="rbm-foot">'
        + '<div class="rbm-foot-line">points added to your STARTING LINEUP, not to your roster</div>'
        + '<div class="rbm-foot-line">K and DEF excluded — worth +17 and +23 all draft; take them at the end</div>'
      + '</div>'
      + (evidenceCaveat
        ? '<details class="rbm-evidence"><summary>why trust this</summary><p>' + esc(evidenceCaveat) + '</p></details>'
        : '')
      + '</div>';
  }

  var API = { render: render };
  global.RBMView = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
