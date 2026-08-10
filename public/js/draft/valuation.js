/* SHARED VALUATION (contract C1, SYSTEM-BUILD-PLAN.md).
 *
 * ONE valuation for the whole system: a player is worth what he adds to STARTABLE
 * CAPACITY, whoever holds him and however he arrives — a draft pick, a waiver
 * claim, or a trade are the same decision against a different pool. The draft
 * recommender, the waiver tool, and the lineup/standings analyzers all price a
 * player through THIS function, so if two tools ever value the same player
 * differently, that is a bug (Cory, 2026-08-10).
 *
 * RANK ON VORP, NOT proj_mean. Raw projection is cross-position apples-to-oranges
 * (a QB's ~400 passing points dwarf an RB/WR's ~290 half-PPR) so a proj_mean sort
 * hoards QBs and would take Josh Allen in round 2 over a more valuable TE. VORP —
 * points over the position's replacement level — is comparable across positions
 * and is the single fix for BOTH the QB-hoarding recs bug and the roster-plan
 * builder's position ordering.
 *
 * This module is a faithful, standalone extraction of engine.js
 * starterSlotMarginal (verified equal by draft/tests/valuation.test.js). The live
 * draft still runs its own copy for now; the new tools call this. When the draft
 * is migrated to import this module the two become literally one function.
 */
(function (global) {
  'use strict';

  // Mirrors engine.js. If these drift, the C1 agreement test goes red — which is
  // the point: one valuation means these constants live in one place eventually.
  var INJURY_RATE = { QB: 0.14, RB: 0.28, WR: 0.20, TE: 0.22, K: 0.04, DEF: 0.02 };
  var BENCH_DISCOUNT = 0.35;   // 12-team default; a caller may override via league.bench_discount
  var FLEX_ELIGIBLE = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'] };

  function vorpOf(p) { return Number(p && p.vorp || 0); }
  function projOf(p) { return Number(p && p.proj_mean || 0); }

  /* The startable-slot marginal — byte-for-byte the engine's rule.
   * roster: my current players; league.starters: slot counts. */
  function startableValue(player, roster, league) {
    roster = roster || [];
    var starters = (league || {}).starters || {};
    var benchDiscount = (league || {}).bench_discount != null ? Number(league.bench_discount) : BENCH_DISCOUNT;
    var mine = roster.filter(function (p) { return p.position === player.position; })
      .sort(function (a, b) { return projOf(b) - projOf(a); });
    var dedicated = starters[player.position] || 0;

    if (mine.length < dedicated) {
      return { value: vorpOf(player), fills: 'starter',
               why: 'fills an empty ' + player.position + ' slot' };
    }
    // Dedicated full — can he still start in a flex?
    var flexOpen = 0;
    Object.keys(FLEX_ELIGIBLE).forEach(function (slot) {
      if (!starters[slot]) return;
      if (FLEX_ELIGIBLE[slot].indexOf(player.position) === -1) return;
      var used = roster.filter(function (p) { return FLEX_ELIGIBLE[slot].indexOf(p.position) !== -1; }).length
        - FLEX_ELIGIBLE[slot].reduce(function (s, pos) {
            return s + Math.min(starters[pos] || 0, roster.filter(function (r) { return r.position === pos; }).length);
          }, 0);
      flexOpen += Math.max(0, (starters[slot] || 0) - Math.max(0, used));
    });
    if (flexOpen > 0) {
      return { value: vorpOf(player), fills: 'flex', why: 'starts in your flex' };
    }
    // Bench: upgrade over the man he replaces, discounted, plus injury insurance.
    var incumbent = mine[dedicated - 1] || mine[mine.length - 1];
    var upgrade = incumbent ? projOf(player) - projOf(incumbent) : vorpOf(player);
    var insurance = (INJURY_RATE[player.position] || 0.15) * Math.max(0, vorpOf(player)) * 0.5;
    return {
      value: upgrade * benchDiscount + insurance,
      fills: 'bench',
      why: upgrade > 0 ? ('bench upgrade over your ' + player.position + dedicated) : 'bye/injury cover',
    };
  }

  /* Best available at a position from a pool, BY VORP (not projection). Used by
   * the waiver tool ("best free agent at RB") and the roster-plan builder
   * ("best still-available RB at my next pick"). */
  function bestAvailableByVorp(pool, pos, excludeId) {
    var best = null;
    (pool || []).forEach(function (p) {
      if (p.position !== pos) return;
      if (excludeId != null && String(p.player_id) === String(excludeId)) return;
      if (!best || vorpOf(p) > vorpOf(best)) best = p;
    });
    return best;
  }

  /* Positions still under startable capacity given a roster (the "remaining need"
   * every tool shares). Returns {pos: slotsStillOpen}. */
  function openStartableSlots(roster, league) {
    var starters = (league || {}).starters || {};
    var c = {};
    (roster || []).forEach(function (p) { c[p.position] = (c[p.position] || 0) + 1; });
    var flexPos = { RB: 1, WR: 1, TE: 1 };
    var open = {};
    ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(function (pos) {
      var cap = (starters[pos] || 0);
      if ((c[pos] || 0) < cap) open[pos] = cap - (c[pos] || 0);
    });
    // one shared FLEX claim if RB/WR/TE surplus doesn't already cover it
    var flexSlots = starters.FLEX || 0;
    if (flexSlots) {
      var surplus = ['RB', 'WR', 'TE'].reduce(function (n, pos) {
        return n + Math.max(0, (c[pos] || 0) - (starters[pos] || 0));
      }, 0);
      var flexNeed = Math.max(0, flexSlots - surplus);
      if (flexNeed > 0) open.FLEX = flexNeed;
    }
    void flexPos;
    return open;
  }

  var api = { startableValue: startableValue, bestAvailableByVorp: bestAvailableByVorp,
              openStartableSlots: openStartableSlots,
              INJURY_RATE: INJURY_RATE, BENCH_DISCOUNT: BENCH_DISCOUNT };
  global.SharedValuation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
