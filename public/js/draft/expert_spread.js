// TERRITORY: A
/* EXPERT SPREAD — the DISPLAY layer for observed FantasyPros expert
 * disagreement (`expert_spread_2026.json`, `draft/backtest/expert_spread_artifact.py`).
 *
 * ORDERED BY A, 2026-08-18, ROUTES.md `## TO: B`: "surface expert DISAGREEMENT
 * per player" after Cory's "Yes! Best way to implement this data into our
 * model??" — the skill grading proved the flat consensus IS the optimal
 * ranking, so the experts' remaining value is WHERE THEY SPLIT, not a fitted
 * number. A's own instruction, verbatim: "DO NOT present it as a ceiling or
 * blend it into any number — display of published fact only." This file is
 * that display layer, and it is display-only by construction: nothing here is
 * read by engine.js, composite.js, valuation.js, survival.js or any scoring
 * path — the badge ANNOTATES a name, it never changes a rank or a dollar.
 *
 * "EXTREME FOR HIS ADP NEIGHBORHOOD" — the design call this file makes.
 * `spread` (rank_max - rank_min) grows with rank by construction: a top-5
 * consensus player is agreed on tightly (Gibbs spread 4), a QB2 130 picks
 * deep is inherently a wider guess for 90 independent experts even with zero
 * genuine uncertainty. Comparing raw spread across ranks would flag "deep
 * sleeper" as "controversial" for every single deep player — not a signal.
 * So a player is "extreme" only relative to the neighbors he is actually
 * drafted near: a ±15-rank window by `rank_ecr`, badge fires when
 * `spread >= 1.6x` that window's median spread. 1.6 measured against the
 * committed artifact (400 players): ~9.5% flagged overall, 8 of the top 150
 * draftable range (Bowers, Egbuka, Maye, Fannin, Brooks, Tyson, Shough,
 * Willis) — every one a real, nameable uncertainty (injury-shortened debut,
 * unresolved rookie/backup competition), not noise. `MIN_N_EXPERTS` guards
 * against a spread computed on a handful of raters reading as "extreme" —
 * every flagged player in the draftable range clears it by a wide margin
 * (90-91 of 91), but the artifact's tail (n_experts as low as 5) would not.
 */
(function (global) {
  'use strict';

  var WINDOW_RADIUS = 15;      // ranks on each side, by rank_ecr
  var EXTREME_RATIO = 1.6;     // spread >= this x the neighborhood median
  var MIN_N_EXPERTS = 20;      // below this, a wide spread is a sample-size

  function median(nums) {
    if (!nums.length) return null;
    var s = nums.slice().sort(function (a, b) { return a - b; });
    var mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /* Builds the extreme-flag index ONCE per artifact — {player_id: {extreme,
   * ratio, spread, rank_ecr}}. Cheap (400 players, one pass) but the caller
   * (app.js) still caches it per-artifact-identity, same pattern as
   * condValueIndex(). Absent/malformed artifact returns null, never guesses. */
  function index(artifact) {
    if (!artifact || !Array.isArray(artifact.players) || !artifact.players.length) return null;
    var players = artifact.players.slice().sort(function (a, b) {
      return (a.rank_ecr || 0) - (b.rank_ecr || 0);
    });
    var n = players.length;
    var out = Object.create(null);
    for (var i = 0; i < n; i++) {
      var p = players[i];
      if (p.player_id == null || p.spread == null) continue;
      var lo = Math.max(0, i - WINDOW_RADIUS);
      var hi = Math.min(n, i + WINDOW_RADIUS + 1);
      var nbhd = [];
      for (var j = lo; j < hi; j++) {
        if (j === i) continue;
        if (players[j].spread != null) nbhd.push(players[j].spread);
      }
      var med = median(nbhd);
      var ratio = (med != null && med > 0) ? p.spread / med : null;
      var reliable = (p.n_experts || 0) >= MIN_N_EXPERTS;
      out[String(p.player_id)] = {
        spread: p.spread,
        rank_ecr: p.rank_ecr,
        n_experts: p.n_experts,
        neighborhood_median: med,
        ratio: ratio,
        extreme: !!(reliable && ratio != null && ratio >= EXTREME_RATIO),
      };
    }
    return out;
  }

  /* One glanceable token, never a number — the badge states the FACT (experts
   * split), not a magnitude, per A's "display of published fact only". Title
   * carries the one number worth a hover, nothing renders without a real
   * entry (an absent/non-extreme player gets '', not a placeholder). */
  function badgeHtml(playerId, idx, esc) {
    if (!idx) return '';
    var e = idx[String(playerId)];
    if (!e || !e.extreme) return '';
    var title = 'Experts split on him — ranked ' + e.rank_ecr + ' by consensus, '
      + 'but individual FantasyPros experts disagree far more than his neighbors '
      + '(rank spread ' + e.spread + ' vs ~' + Math.round(e.neighborhood_median)
      + ' nearby). Published disagreement, not a model number.';
    return ' <span class="expert-split-badge" title="' + esc(title) + '">⚡ split</span>';
  }

  var API = { index: index, badgeHtml: badgeHtml,
    // exported for the unit tests' recompute checks
    _median: median, WINDOW_RADIUS: WINDOW_RADIUS, EXTREME_RATIO: EXTREME_RATIO,
    MIN_N_EXPERTS: MIN_N_EXPERTS };
  global.ExpertSpread = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
