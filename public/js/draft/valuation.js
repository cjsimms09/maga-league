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

  /* ══ THE CLAIM'S VALUE — ONE BASELINE, NOT TWO MARGINALS ══
   *
   * B's finding, 2026-08-11: the waiver tool priced claiming a kicker STRICTLY
   * WORSE than the one already starting at $59, and 28 of those points were the
   * gap between the WR2 and the kicker — nothing to do with the two kickers.
   *
   * TWO COMPOUNDING BUGS, and naming them separately matters because fixing one
   * leaves the other:
   *
   *   1. INCOMMENSURABLE BASELINES. `startableValue` returns a number on THREE
   *      different scales depending on `fills`: a starter or flex fit returns
   *      `vorp` — a marginal against the POSITIONAL REPLACEMENT LEVEL — while a
   *      bench fit returns `upgrade * benchDiscount + insurance`, a marginal
   *      against MY OWN INCUMBENT. The waiver route computed
   *      `netPoints = sv.value - dropVal`, subtracting one from the other. Those
   *      two quantities are measured from different zeroes, so their difference
   *      means nothing.
   *
   *   2. SUBTRACTING A NEGATIVE ADDS. A drop candidate who is worse than the man
   *      he sits behind has a NEGATIVE startableValue. `sv.value - dropVal` then
   *      ADDS the drop's deficit to the claim. A kicker worth ~0 minus a drop
   *      worth -28 prices at +28, which is the WR2-to-kicker gap arriving as if
   *      it were the claim's merit.
   *
   * THE FIX IS NOT A BETTER MARGINAL. It is to stop differencing marginals and
   * ask the only question that has one baseline: **what does my starting lineup
   * score with this move, versus without it?**
   *
   *     net = bestLineup(roster - drop + claim) - bestLineup(roster)
   *
   * That is automatically <= 0 for a strictly worse kicker, needs no
   * `Math.max(0, ...)` clamp to look sane, and is denominated in exactly the
   * quantity `dollarsPerPoint` prices: marginal projected points in the STARTING
   * LINEUP.
   *
   * THE OPTIMISER IS INJECTED, NOT REIMPLEMENTED. `lineupPoints` is supplied by
   * the caller so this uses the ONE real lineup optimiser rather than a second
   * greedy copy living here — a second copy is the disease this file exists to
   * cure. It REFUSES rather than falling back: a silent fallback to a private
   * implementation is how two valuations drift while both look right.
   */
  function claimValue(claim, drop, roster, league, lineupPoints) {
    if (typeof lineupPoints !== 'function') {
      throw new Error('claimValue requires a lineupPoints(roster, league) function — '
        + 'the real optimiser must be injected. Refusing to fall back to a second '
        + 'implementation, which is how two valuations drift while both look right.');
    }
    roster = roster || [];
    var dropId = drop ? String(drop.player_id) : null;
    var after = roster.filter(function (p) {
      return dropId == null || String(p.player_id) !== dropId;
    }).concat([claim]);

    var before = Number(lineupPoints(roster, league)) || 0;
    var afterPts = Number(lineupPoints(after, league)) || 0;
    var net = afterPts - before;

    return {
      // NOT CLAMPED. A claim that makes the lineup worse must be able to say so;
      // the old Math.max(0, ...) turned "this is a downgrade" into "this is
      // worth nothing", and those are different sentences on a Tuesday.
      net_points: net,
      lineup_before: before,
      lineup_after: afterPts,
      improves: net > 0,
      drop_id: dropId,
      why: net > 0
        ? 'starting lineup improves by ' + (Math.round(net * 100) / 100)
        : (net === 0 ? 'no change to the starting lineup'
                     : 'DOWNGRADE — the starting lineup gets worse by '
                       + (Math.round(-net * 100) / 100)),
    };
  }

  /* Best available at a position from a pool, BY VORP (not projection). Used by
   * the waiver tool ("best free agent at RB") and the roster-plan builder
   * ("best still-available RB at my next pick"). */
  /* ══ IS THIS CLAIM WORTH THE PRIORITY IT COSTS? ═══════════════════════════
   *
   * THE STRUCTURE THAT WAS MISSING. The waiver tool ranks claims by `net_value`
   * and stops there — which answers "is he an upgrade" and never "is he worth
   * SPENDING ON". Under a system where claiming depletes something, those are
   * different questions, and only the second one is the decision.
   *
   * AND `contested` WAS ALREADY BEING COMPUTED AND THROWN AWAY. `whoElseNeeds`
   * derives which rivals have an open startable slot and flags the eager ones;
   * the route publishes `rivals` and `contested` and then sorts on `net_value`
   * alone. A value produced and not consumed is rule 14, and this one is the
   * input the stopping decision actually needs: an UNCONTESTED player is one you
   * may get without spending anything, so his claim should almost never consume
   * a depleting resource.
   *
   * WHAT THIS DELIBERATELY DOES NOT DECIDE. `league_config.waivers` says
   * `is_faab: false` with a vestigial `budget: 100` beside it, which leaves the
   * system underdetermined between:
   *
   *   ROLLING PRIORITY  — claiming sends you to the back. Priority depletes,
   *                       there is a real option value, this function matters.
   *   REVERSE STANDINGS — priority resets weekly off record. Claiming costs you
   *                       nothing you keep, THERE IS NO STOPPING PROBLEM, and
   *                       the right rule is "claim anything with net > 0".
   *
   * Guessing would produce a confident recommendation built on a coin flip, so
   * `depletes` is a REQUIRED argument with no default. Pass false and this
   * returns "claim it" for every positive-value claim, which is the correct
   * answer under reverse standings rather than a disabled feature.
   *
   * THE RULE, when priority depletes: spend it only when this week's gain beats
   * what the same priority is expected to buy later. `reserve` is that option
   * value — the expected best net_points still to come over the remaining
   * horizon — and it is supplied by the caller rather than invented here,
   * because A does not own the league's week-to-week free-agent distribution.
   */
  function claimStoppingRule(opts) {
    var o = opts || {};
    if (typeof o.depletes !== 'boolean') {
      throw new Error('claimStoppingRule: `depletes` is required and has no default. '
        + 'Rolling priority and reverse-standings priority are different problems '
        + '(one has an option value, the other has none) and league_config says '
        + 'is_faab:false without distinguishing them. Resolve it, do not guess.');
    }
    var net = Number(o.net_points || 0);
    var contested = !!o.contested;
    var reserve = o.reserve == null ? null : Number(o.reserve);

    if (!o.depletes) {
      return { claim: net > 0, spend_priority: false, reason: net > 0
        ? 'priority does not deplete — any positive-value claim is free to make'
        : 'no gain: net_points <= 0', net_points: net, reserve: null, contested: contested };
    }
    if (net <= 0) {
      return { claim: false, spend_priority: false, net_points: net, reserve: reserve,
        contested: contested, reason: 'no gain: net_points <= 0' };
    }
    if (!contested) {
      // Nobody else has an open startable slot at his position. Claiming with
      // priority buys what waiting would likely give you anyway.
      return { claim: true, spend_priority: false, net_points: net, reserve: reserve,
        contested: false,
        reason: 'uncontested — no rival has an open startable slot, so he can be '
              + 'added without spending priority' };
    }
    if (reserve == null) {
      // NOT a default of zero. Zero would mean "nothing better is ever coming",
      // which silently makes every contested claim worth spending on — the most
      // aggressive possible policy, arrived at by an absent argument.
      return { claim: true, spend_priority: null, net_points: net, reserve: null,
        contested: true,
        reason: 'contested, but no `reserve` supplied — cannot say whether this '
              + 'beats what the priority buys later. UNDECIDED, not approved.' };
    }
    var worth = net > reserve;
    return { claim: true, spend_priority: worth, net_points: net, reserve: reserve,
      contested: true, margin: round2(net - reserve),
      reason: worth
        ? 'contested and worth ' + round2(net - reserve) + ' more than the best '
          + 'claim the priority is expected to buy later'
        : 'contested, but the priority is expected to buy ' + round2(reserve - net)
          + ' more later — hold it' };
  }

  function round2(x) { return Math.round(Number(x || 0) * 100) / 100; }

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

  var api = { startableValue: startableValue, claimValue: claimValue,
    claimStoppingRule: claimStoppingRule,
    bestAvailableByVorp: bestAvailableByVorp,
              openStartableSlots: openStartableSlots,
              INJURY_RATE: INJURY_RATE, BENCH_DISCOUNT: BENCH_DISCOUNT };
  global.SharedValuation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
