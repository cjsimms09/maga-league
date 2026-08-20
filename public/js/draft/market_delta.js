// TERRITORY: B
/* MARKET-DELTA CHIP — the board's disagreement with the room, made visible
 * on every PICK/WATCH card (A dispatch, ROUTES.md 08-18, third in the set
 * after the expert-split badge and the nav-consolidation map).
 *
 * WHY: register 5c / the brief §🟣 measured the board is deliberately
 * contrarian in named places (TE +49.8 spots vs market on average, LaPorta
 * board-37/room-67, RB −23.1) and Cory ruled those bets stay. He does not
 * need to remember which bet he is making pick to pick — he needs to SEE it.
 *
 * ZERO NEW DATA: `overall_rank` (the board's rank) and `adjusted_adp` (the
 * market's rank — already used as a rank throughout app.js/engine.js, not a
 * raw pick number) are both already on every player object. This file is a
 * pure derivation over fields that exist, nothing fetched, nothing graded.
 *
 * CAPTION DISCIPLINE (A's own instruction, matching 4u's lesson): the chip
 * states DISAGREEMENT with the room, never "value" or "steal" — whether a
 * disagreement pays off is the season's question, not the card's claim.
 *
 * THRESHOLD: MIN_DELTA borrows the FALLING badge's own "worth mentioning"
 * gap size (10 spots, app.js's existing `(curPickNo - p.adjusted_adp) >= 10`)
 * rather than inventing a new number — showing every ±1-3 spot noise delta
 * on every single card would be exactly the "too busy and wordy" complaint
 * (register 4b) this project already fixed once. B's call, disclosed in
 * ROUTES.md; A can move it.
 */
(function (global) {
  'use strict';

  var MIN_DELTA = 10;

  /* K/DEF EXCLUDED — not a new call, an existing one applied here. The board
   * deliberately demotes K/DEF hundreds of ranks below their raw VORP
   * (register 2b: every K/DEF sits at board 620+ against a market ADP of
   * 116-160, a ~-500 "drift" that is the onesie-demotion working as designed,
   * not a disagreement about their value). Comparing that demoted rank to
   * market rank would flood this chip/drawer with the same ten kickers and
   * defenses on every single pick, drowning the skill-position signal the
   * feature exists to show (register 5c's real examples — LaPorta, Dak,
   * Purdy — are all QB/RB/WR/TE). `search_rank`-sourced ADP is excluded for
   * the same reason FALLING already excludes it: a deep-bench fallback
   * rank, not a real market read (verified: Josh Kattus, TE, adp_source
   * search_rank, adjusted_adp 761.6 in a 696-player pool — not a market
   * number, a sentinel). */
  var SKILL_POSITIONS = { QB: 1, RB: 1, WR: 1, TE: 1 };

  /* Positive = the board ranks him BETTER (lower/earlier) than the market
   * does — the board is bullish where the room is not. Negative = the room
   * pays for him sooner than the board ranks him. Null if either input is
   * missing, the position isn't a skill position, or the ADP is a
   * search_rank fallback rather than a real market read — never a guessed
   * or misleading delta. */
  function delta(p) {
    if (!p || p.overall_rank == null || p.adjusted_adp == null) return null;
    if (!SKILL_POSITIONS[p.position]) return null;
    if (p.adp_source === 'search_rank') return null;
    return Math.round(p.adjusted_adp - p.overall_rank);
  }

  /* One glanceable chip, never a claim about payoff. '' below MIN_DELTA —
   * most players are not a real disagreement, and a chip on everyone is
   * decoration, not signal (same discipline as the expert-split badge). */
  function chipHtml(p, esc) {
    var d = delta(p);
    if (d == null || Math.abs(d) < MIN_DELTA) return '';
    var up = d > 0;
    var title = (up
      ? 'The board ranks him ' + d + ' spots ahead of where the room pays'
      : 'The room pays for him ' + Math.abs(d) + ' spots ahead of where the board ranks him')
      + ' (our #' + p.overall_rank + ' vs market ADP ' + Math.round(p.adjusted_adp) + '). '
      + 'Disagreement with the room — whether it pays is the season’s question.';
    return ' <span class="wr-market-delta ' + (up ? 'up' : 'down') + '" title="' + esc(title) + '">'
      + (up ? '↑' : '↓') + Math.abs(d) + ' vs room</span>';
  }

  /* The "contrarian picks" drawer: top-N each way among the players passed
   * in (the caller hands the AVAILABLE pool — state.board is already
   * undrafted-only, so this makes no drafted/available judgment itself). */
  function contrarianList(players, n) {
    n = n || 10;
    var withDelta = [];
    for (var i = 0; i < (players || []).length; i++) {
      var p = players[i];
      var d = delta(p);
      if (d != null) withDelta.push({ player: p, delta: d });
    }
    var up = withDelta.slice().sort(function (a, b) { return b.delta - a.delta; }).slice(0, n);
    var down = withDelta.slice().sort(function (a, b) { return a.delta - b.delta; }).slice(0, n);
    return { up: up, down: down };
  }

  /* Renders the drawer as a closed <details> — a one-tap disclosure, not
   * more always-on prose on a card Cory already called "too busy". '' when
   * there is nothing to show (no available players, or nobody carries both
   * fields), so a broken feed loses the drawer, never fakes an empty list. */
  function drawerHtml(players, esc) {
    var list = contrarianList(players, 10);
    if (!list.up.length && !list.down.length) return '';
    var row = function (e) {
      return '<li><span class="cd-nm">' + esc(e.player.name) + '</span>'
        + '<span class="rec-pos ' + esc(e.player.position || '') + '">' + esc(e.player.position || '') + '</span>'
        + '<span class="cd-delta ' + (e.delta > 0 ? 'up' : 'down') + '">'
          + (e.delta > 0 ? '↑' : '↓') + Math.abs(e.delta) + '</span></li>';
    };
    return '<details class="wr-contrarian">'
      + '<summary>🔀 Contrarian picks <span class="muted">board vs room, top 10 each way</span></summary>'
      + '<div class="wr-contrarian-body">'
        + '<div class="wr-contrarian-col"><div class="wr-contrarian-h">board loves, room won’t pay</div>'
          + '<ul>' + (list.up.length ? list.up.map(row).join('') : '<li class="muted">none available right now</li>') + '</ul></div>'
        + '<div class="wr-contrarian-col"><div class="wr-contrarian-h">room pays, board won’t bite</div>'
          + '<ul>' + (list.down.length ? list.down.map(row).join('') : '<li class="muted">none available right now</li>') + '</ul></div>'
      + '</div></details>';
  }

  var API = { delta: delta, chipHtml: chipHtml, contrarianList: contrarianList, drawerHtml: drawerHtml, MIN_DELTA: MIN_DELTA };
  global.MarketDelta = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
