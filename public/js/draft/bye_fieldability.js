// TERRITORY: B
/* BYE-WEEK FIELDABILITY WARNING — A dispatch (ROUTES.md 08-19, register 73):
 * "if the roster cannot fill a starting slot in some week once byes are
 * applied, say so on screen... the difference between noticing in August
 * and noticing in November."
 *
 * WHY THIS EXISTS: measured (B, register 59 item (1) reproduction), 10 of 10
 * realistic-opponent simulated drafts at Cory's real schedule and real
 * keepers left at least one week where a dedicated starter slot could not
 * be filled even counting FLEX — week 6 in all ten, traced to Ja'Marr Chase
 * (Cory's own keeper, week-6 bye) colliding with a single rostered QB whose
 * bye also lands on 6 in 9 of 10 seeds. A's own live-board probe (register
 * 73, fieldability_probe.js) found the shipped configuration un-fieldable in
 * three weeks: 6 (QB+WR), 11 (WR), 13 (TE) — register 59's week-11 hole
 * exactly.
 *
 * ⚠️ CORRECTED 08-19: the first cut of this file (register 59 item (4))
 * counted its own matcher — pooling every dedicated position's leftover,
 * QB included, into FLEX capacity. This league's FLEX is RB/WR/TE only
 * (draft_data.json league.starters has no SUPER_FLEX; legality.js's own
 * FLEX_POS agrees), so a spare QB could mask a real WR/TE shortfall and
 * under-report a genuine hole. A's dispatch called this by name before I
 * found it myself: "greedy is WRONG here... Rule 11: one matcher." Fixed by
 * moving the matcher to fieldable.js (shared with A's probe — see that
 * file) instead of patching the count-based logic in place.
 *
 * SCOPE, matching legality.js's own STREAMABLE convention: K/DEF are
 * excluded from the check. They're one-per-roster and streamed by design
 * (register R-legality in robot-mock.js already treats them as non-
 * mandatory) — flagging every week a solo kicker's bye lands would be noise
 * on a slot Cory is expected to fill off the wire, not draft depth for.
 *
 * PURE: no DOM, no fetch. Reads the roster and the league's starters config,
 * nothing else — same split as market_delta.js/playoffOdds.js this session.
 */
(function (global) {
  'use strict';

  var DEDICATED = ['QB', 'RB', 'WR', 'TE'];
  var SKILL_SLOTS = { QB: true, RB: true, WR: true, TE: true, FLEX: true };

  function getFieldable() {
    if (typeof Fieldable !== 'undefined') return Fieldable.fieldable;
    if (typeof module !== 'undefined' && module.exports) {
      return require('./fieldable.js').fieldable;
    }
    return null;
  }

  /* For each week 1-18: ask the shared bipartite matcher (fieldable.js,
   * Rule 11 — one matcher, shared with A's fieldability_probe.js) whether
   * every SKILL slot (K/DEF excluded, see SCOPE above) can be filled once
   * that week's byes are applied. Returns the weeks that fail — not a
   * boolean, so the caller can name them rather than just say "some week is
   * a problem". */
  function unfieldableWeeks(roster, starters) {
    var match = getFieldable();
    if (!match) return [];
    var holes = [];
    for (var wk = 1; wk <= 18; wk++) {
      var r = match(roster, wk, starters);
      var skillUnfilled = (r.unfilled || []).filter(function (s) { return SKILL_SLOTS[s]; });
      if (skillUnfilled.length) holes.push(wk);
    }
    return holes;
  }

  /* GATE: an incomplete roster is trivially unfieldable everywhere — a
   * fresh keeper-only roster with no QB drafted yet fails all 18 weeks, and
   * that is not a finding, it's "the draft is not done" restated as an
   * alarm (exactly the noise register 4b already fixed once). Only start
   * checking once every dedicated position has at least one player, so the
   * warning only ever names a REAL collision, never "you haven't picked a
   * TE yet". */
  function isRosterComplete(roster, starters) {
    var s = starters || {};
    var byPos = {};
    (roster || []).forEach(function (p) { if (p) byPos[p.position] = (byPos[p.position] || 0) + 1; });
    return DEDICATED.every(function (pos) { return !s[pos] || (byPos[pos] || 0) >= 1; });
  }

  /* One line, plain language, never alarmist about a streamed K/DEF week —
   * this only fires on the mandatory positions. '' when clean, or when the
   * roster is still incomplete (see isRosterComplete above), so an early
   * draft pick never sees a false "everything is broken". */
  function warningHtml(roster, starters, esc) {
    if (!isRosterComplete(roster, starters)) return '';
    var holes = unfieldableWeeks(roster, starters);
    if (!holes.length) return '';
    var weeks = holes.map(function (w) { return 'week ' + w; }).join(', ');
    var title = 'On ' + (holes.length === 1 ? 'this week' : 'these weeks')
      + ', your current roster cannot fill every starting slot (FLEX included) even with '
      + 'everyone else available — check who is on bye and plan a wire pickup or a redraft target.';
    return '<div class="wr-bye-warn" title="' + esc(title) + '">'
      + '⚠️ Unfieldable ' + (holes.length === 1 ? 'week' : 'weeks') + ': ' + esc(weeks) + '</div>';
  }

  var API = { unfieldableWeeks: unfieldableWeeks, warningHtml: warningHtml,
    isRosterComplete: isRosterComplete, DEDICATED: DEDICATED };
  global.ByeFieldability = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
