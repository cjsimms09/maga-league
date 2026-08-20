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

  /* Does this panel's #1 agree with the board's own #1? That comparison is
   * the reason the panel earns its screen space (A's framing, ported in
   * during the 2026-08-20 merge that found both of us had built this panel
   * independently — genuinely useful, kept rather than dropped along with
   * the duplicate rendering it arrived in). `board` is
   * `{ topName, agrees } | null` — app.js compares by player_id, never by
   * name, and hands down only the boolean + display name so this file stays
   * a pure string-in/HTML-out layer with no board-scoring logic of its own. */
  function agreementLine(board, esc) {
    if (!board || !board.topName) return '';
    return '<div class="rbm-agree' + (board.agrees ? ' rbm-agree-yes' : ' rbm-agree-no') + '">'
      + (board.agrees
        ? '✓ agrees with the board — both want ' + esc(board.topName)
        : '⚠ disagrees with the board, which wants ' + esc(board.topName)
          + ' — usually means the board\'s top name would not start for you')
      + '</div>';
  }

  /**
   * `recs` — the array RosterBuilderMLV.recommend() returns:
   *   [{ player, position, marginal, why }, ...]
   * `evidence` — RosterBuilderMLV.EVIDENCE (or null/undefined) — read live off
   *   the module rather than retyped here, so a future correction to the
   *   numbers (like this one) only has to land in mlv.js. `.caveat` and the
   *   two register-134 strings render in a <details> disclosure, never a
   *   confidence badge (§5②: "the honest statement is a sentence, not a
   *   colour").
   * `board` — `{ topName, agrees } | null` — see agreementLine() above.
   * `explain` — app.js's explainPanel('roster_builder') output (the site-wide
   *   ⓘ-button + collapsed-detail pattern every other panel uses, PANEL_GUIDE
   *   registry in app.js), or '' if unavailable. Kept alongside, not instead
   *   of, the evidence <details> below — this is HOW TO READ the panel
   *   (the FLEX question, VONA not being cross-position comparable — exactly
   *   what Cory asked when he asked for this panel); the evidence disclosure
   *   is WHY TO TRUST it. Different questions, both worth answering.
   * Returns '' when there is nothing to show — no board, no roster, module
   * unavailable upstream — so a missing input degrades to nothing rather than
   * a broken box (same convention as renderPositionBoards).
   */
  function render(recs, evidence, board, explain, esc) {
    if (!Array.isArray(recs) || !recs.length) return '';
    evidence = evidence || {};
    var rows = recs.slice(0, 3).map(function (r, i) { return row(r, i, esc); }).join('');
    /* ⚠️ CORRECTED 2026-08-19, register 134 — the footer used to say "K and DEF
     * excluded... take them at the end", which is the OPPOSITE of what the
     * module does: they are CAPPED at one, not excluded, and once the
     * starting lineup is full the panel puts a kicker/defence AT THE TOP —
     * a bench body is worth exactly zero to this model. The old line would
     * have told Cory "take them at the end" in the same render where row 1
     * was a kicker. ROSTER-BUILDER-PANEL-DESIGN.md §5① has the replacement
     * copy verbatim; used as-is rather than re-derived. */
    var evidenceItems = [evidence.caveat, evidence.onesies_are_capped_not_excluded,
      evidence.cannot_value_a_bench].filter(Boolean);
    return '<div class="rbm-wrap">'
      + '<div class="rbm-head">'
        + '<span class="rbm-title">Roster builder model says</span>'
        + '<span class="rbm-sub">a second voice — not your board\'s own pick</span>'
        + (explain || '')
      + '</div>'
      + agreementLine(board, esc)
      + '<ol class="rbm-list">' + rows + '</ol>'
      + '<div class="rbm-foot">'
        + '<div class="rbm-foot-line">points added to your STARTING LINEUP, not to your roster</div>'
        + '<div class="rbm-foot-line">K and DEF capped at one. Once your lineup is full they top '
          + 'this list — a bench player is worth zero to this model, a kicker in an empty slot is worth +17</div>'
      + '</div>'
      + (evidenceItems.length
        ? '<details class="rbm-evidence"><summary>why trust this</summary>'
          + evidenceItems.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('')
          + '</details>'
        : '')
      + '</div>';
  }

  var API = { render: render };
  global.RBMView = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
