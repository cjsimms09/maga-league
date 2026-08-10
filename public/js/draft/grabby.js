/* GRAB-BY (live) — "stick to value, know when to grab", recomputed EVERY pick.
 *
 * The Python draft/grab_by.py produced a pre-draft snapshot that no browser code
 * ever read (audit 2026-08-10). This is the LIVE version: given the current board
 * (which shrinks as players are drafted) and my roster (keepers + picks so far), it
 * answers per position — can I WAIT, or does the value fall off before my next pick?
 *
 *   EVLW(pos) = best available proj NOW − expected best available at my NEXT pick
 *             (survival-weighted, in OUR scoring — proj_mean is league-scored)
 *
 * Large EVLW → the cliff falls before I pick again, so taking it now is the
 * value-maximising move, not a reach. Small EVLW → waiting is free. It is VONA
 * aimed one pick ahead — projection points, positions directly comparable — plus a
 * NEED guard (only positions with a starting slot still open) and a concrete
 * GRAB-BY pick. Reuses the engine's own survival + expected-best-available so the
 * timing is consistent with the composite's value term.
 */
(function (global) {
  'use strict';
  var E = global.DraftEngine || (typeof require === 'function' ? require('./engine.js') : null);

  var FLEX_ELIGIBLE = ['RB', 'WR', 'TE'];
  var SURVIVE_THRESH = 0.5;   // "likely available" at a pick
  var QUALITY_TOL = 3.0;      // grab-by: quality within this many proj pts of today's best
  var WEEK_DIVISOR = 17.0;    // season proj → per-week, for verdict banding
  var BAND_NEGLIGIBLE = 0.3;  // < per week → WAIT
  var BAND_URGENT = 0.8;      // ≥ per week → TAKE-NOW

  function startersOf(league) { return (league && league.starters) || {}; }

  /* dedicated_need + flex_open for MY roster (per-team counts). */
  function positionalNeed(roster, league) {
    var st = startersOf(league), counts = {};
    (roster || []).forEach(function (p) { if (p.position) counts[p.position] = (counts[p.position] || 0) + 1; });
    var positions = {}; Object.keys(counts).forEach(function (p) { positions[p] = true; });
    ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(function (p) { positions[p] = true; });
    var dedicated = {};
    Object.keys(positions).forEach(function (p) { dedicated[p] = Math.max(0, (st[p] || 0) - (counts[p] || 0)); });
    var totalFlex = 0;
    Object.keys(st).forEach(function (s) { if (/FLEX/.test(s)) totalFlex += st[s]; });
    var surplus = FLEX_ELIGIBLE.reduce(function (n, p) {
      return n + Math.max(0, (counts[p] || 0) - (st[p] || 0)); }, 0);
    return { dedicated: dedicated, flexOpen: Math.max(0, totalFlex - surplus) };
  }

  function isLiveNeed(pos, need) {
    if ((need.dedicated[pos] || 0) > 0) return true;
    return need.flexOpen > 0 && FLEX_ELIGIBLE.indexOf(pos) >= 0;
  }

  /* Best likely-available proj at a pick (survival ≥ thresh), reusing the engine's
   * survival-weighted expectation so it matches VONA. */
  function expectedBestAt(availSamePos, pick) {
    if (!E || typeof E.expectedBestAvailable !== 'function') {
      return availSamePos.length ? (availSamePos[0].proj_mean || 0) : 0;
    }
    return E.expectedBestAvailable(availSamePos, pick, {});
  }

  function grabByPick(availSamePos, myRemaining, bestNow) {
    var picks = (myRemaining || []).slice().sort(function (a, b) { return a - b; });
    if (!picks.length) return null;
    var last = picks[0];                                   // you can always grab now
    for (var i = 1; i < picks.length; i++) {
      if (expectedBestAt(availSamePos, picks[i]) >= bestNow - QUALITY_TOL) last = picks[i];
      else break;
    }
    return last;
  }

  function verdict(evlw, need) {
    if (!need) return 'FILLED';
    var perWeek = evlw / WEEK_DIVISOR;
    if (perWeek >= BAND_URGENT) return 'TAKE-NOW';
    if (perWeek >= BAND_NEGLIGIBLE) return 'GRAB-SOON';
    return 'WAIT';
  }

  /* board: live draftable players (already minus drafted); roster: MY players so far;
   * myRemaining: my remaining overall pick numbers (ascending). */
  function report(board, roster, myRemaining, league, positions) {
    positions = positions || ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    var need = positionalNeed(roster, league);
    var remaining = (myRemaining || []).slice().sort(function (a, b) { return a - b; });
    var secondPick = remaining.length > 1 ? remaining[1] : null;
    var rows = positions.map(function (pos) {
      var avail = (board || []).filter(function (p) { return p.position === pos; })
        .sort(function (a, b) { return (b.proj_mean || 0) - (a.proj_mean || 0); });
      var live = isLiveNeed(pos, need);
      if (!avail.length) return { position: pos, need: live, verdict: 'NONE-LEFT', evlw: null, grab_by_pick: null };
      var best = avail[0], bestNow = best.proj_mean || 0;
      var bestNext = secondPick != null ? expectedBestAt(avail, secondPick)
        : (avail[avail.length - 1].proj_mean || 0);
      var evlw = Math.round((bestNow - bestNext) * 100) / 100;
      return {
        position: pos, need: live,
        best_now: { name: best.name, player_id: best.player_id, proj_mean: bestNow,
          tier: best.tier, tier_drop: best.tier_drop },
        evlw: evlw, evlw_per_week: Math.round(evlw / WEEK_DIVISOR * 1000) / 1000,
        grab_by_pick: grabByPick(avail, remaining, bestNow),
        verdict: verdict(evlw, live),
      };
    });
    var live = rows.filter(function (r) { return r.need && r.evlw != null; })
      .sort(function (a, b) { return b.evlw - a.evlw; });
    var headline = null;
    if (live.length) {
      var top = live[0];
      headline = (top.verdict === 'TAKE-NOW' || top.verdict === 'GRAB-SOON')
        ? (top.verdict + ': ' + top.position + ' — ' + (top.best_now.name || '')
           + ' (lose ~' + top.evlw_per_week + '/wk if you wait; grab-by pick ' + top.grab_by_pick + ')')
        : 'WAIT — no position is falling off; take best value available.';
    }
    return { this_pick: remaining.length ? remaining[0] : null, headline: headline,
      flex_open: need.flexOpen, positions: rows };
  }

  global.DraftGrabBy = { report: report, positionalNeed: positionalNeed, isLiveNeed: isLiveNeed,
    grabByPick: grabByPick, expectedBestAt: expectedBestAt };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).DraftGrabBy;
}
