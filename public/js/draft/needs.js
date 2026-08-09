/* OPPONENT POSITIONAL NEEDS (feature C) — who still needs a starter where.
 *
 * The most actionable unbuilt draft signal, computable from rosters we already
 * track. "QB: only 2 teams still need one" means you can wait on QB indefinitely;
 * "3 of the 4 teams picking before your next turn need a RB" means a run is about
 * to happen and the RB you want may not survive. It turns a generic survival
 * probability into WHO specifically wants WHAT, right now.
 *
 * Pure: takes rosters + the starters config, returns need sets and counts. No DOM.
 * A team "needs a starter at P" when its roster holds fewer than P's DEDICATED
 * starter slots; FLEX is a separate need met by any surplus RB/WR/TE. Unit-tested
 * in draft/tests/needs.test.js.
 */
(function (global) {
  'use strict';

  var DEDICATED = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

  function posCounts(roster) {
    var c = {};
    (roster || []).forEach(function (p) {
      if (p && p.position) c[p.position] = (c[p.position] || 0) + 1;
    });
    return c;
  }

  /* The positions where THIS team's dedicated starter slots are still unfilled,
   * plus FLEX when its RB/WR/TE surplus can't cover the flex slots. */
  function teamNeeds(roster, starters) {
    starters = starters || {};
    var c = posCounts(roster), need = [];
    DEDICATED.forEach(function (pos) {
      var req = starters[pos] || 0;
      if ((c[pos] || 0) < req) need.push(pos);
    });
    var flex = starters.FLEX || 0;
    if (flex > 0) {
      var used = Math.min(c.RB || 0, starters.RB || 0)
        + Math.min(c.WR || 0, starters.WR || 0)
        + Math.min(c.TE || 0, starters.TE || 0);
      var pool = (c.RB || 0) + (c.WR || 0) + (c.TE || 0) - used;
      if (pool < flex) need.push('FLEX');
    }
    return need;
  }

  /* {pos: how many teams still need a dedicated starter there}, across all rosters. */
  function leagueNeeds(rosters, starters) {
    var out = {};
    Object.keys(rosters || {}).forEach(function (slot) {
      teamNeeds(rosters[slot], starters).forEach(function (pos) {
        out[pos] = (out[pos] || 0) + 1;
      });
    });
    return out;
  }

  /* Of the teams whose slots are in `slotsBefore` (the seats picking before my
   * next turn), how many need each position. Returns {n, byPos, perTeam}. */
  function needsBeforePick(rosters, starters, slotsBefore) {
    var out = {}, perTeam = {}, n = 0;
    (slotsBefore || []).forEach(function (slot) {
      n++;
      var need = teamNeeds((rosters || {})[slot], starters);
      perTeam[slot] = need;
      need.forEach(function (pos) { out[pos] = (out[pos] || 0) + 1; });
    });
    return { n: n, byPos: out, perTeam: perTeam };
  }

  /* The sharpest one-liners, sorted by pressure. `before` from needsBeforePick,
   * `league` from leagueNeeds, `teams` = league size. Returns [{pos, before, league, line}]. */
  function pressure(before, league, teams) {
    var positions = {};
    Object.keys((before && before.byPos) || {}).forEach(function (p) { positions[p] = 1; });
    Object.keys(league || {}).forEach(function (p) { positions[p] = 1; });
    var rows = Object.keys(positions).map(function (pos) {
      var b = (before.byPos[pos] || 0), lg = (league[pos] || 0);
      return { pos: pos, before: b, league: lg,
               // pressure = imminent demand first, then league-wide scarcity of need
               score: b * 100 + lg };
    });
    rows.sort(function (a, b) { return b.score - a.score; });
    return rows;
  }

  var api = { teamNeeds: teamNeeds, leagueNeeds: leagueNeeds,
              needsBeforePick: needsBeforePick, pressure: pressure, posCounts: posCounts };
  global.DraftNeeds = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
