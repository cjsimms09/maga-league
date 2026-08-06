/* Draft engine — Modules 5, 6, 7.
 *
 * Pure functions over the artifact built offline. Everything here runs in the
 * browser during a live draft, so it must stay fast (it is: the whole board is
 * a few hundred players and every loop below is linear or n log n).
 *
 * Every recommendation carries its own `reasons` array so a pick can be audited
 * after the fact — "why did it say that" should never require reading code.
 */
(function (global) {
  'use strict';

  // A2/A3 live in their own modules; engine.js orchestrates them.
  const S = global.DraftSurvival || (typeof require === 'function' ? require('./survival.js') : null);
  const C = global.DraftComposite || (typeof require === 'function' ? require('./composite.js') : null);
  if (!S || !C) throw new Error('draft engine requires survival.js and composite.js to load first');

  // ---- config knobs (every magic number lives here, with its reasoning) ----
  const CFG = {
    ADP_SD_FLOOR: 3.0,        // nobody is unsure about pick 1
    ADP_SD_RATE: 0.22,        // uncertainty grows with ADP
    RUN_WINDOW: 10,           // picks of history the Bayesian update looks at
    RUN_DAMPING: 0.5,         // how hard observed rates move the hazard
    RUN_MIN: 0.6,             // clamp: a cold position can't go below this
    RUN_MAX: 1.8,             // clamp: a hot position can't exceed this
    RUN_BANNER_AT: 1.4,       // multiplier that earns a "RUN DETECTED" banner
    BENCH_DISCOUNT: 0.35,     // a bench upgrade is worth this much of a starter one
    SURVIVOR_CUTOFF: 0.005,   // stop the VONA product once mass is negligible
    TIE_THRESHOLD: 2.0,       // composite points within which we call it a tie
  };

  const DEFAULT_WEIGHTS = { tier: 1.0, need: 1.0, risk: 1.0, ceiling: 0.5,
    keeper: 1.0, bye: 1.0, stack: 1.0 };

  // Positional injury rates -> how much bye/injury insurance a bench body is worth.
  const INJURY_RATE = { QB: 0.14, RB: 0.28, WR: 0.20, TE: 0.22, K: 0.04, DEF: 0.02 };
  // Age at which production reliably falls off, by position.
  const AGE_CLIFF = { RB: 27, WR: 30, TE: 31, QB: 36, K: 99, DEF: 99 };

  // ---- Module 5 now lives in survival.js (A2 three-layer model) ----
  // These thin wrappers keep the pre-refactor call sites working unchanged.
  const normalCdf = S.normalCdf;
  const adpSd = S.adpSd;
  const survival = S.survivalProbability;
  const runMultipliers = S.runMultipliers;
  const detectRuns = S.detectRuns;

  // ========================================================= Module 6: VONA
  /**
   * E[best available at `nextPick`] for one position.
   * P(j is the best survivor) = P(j survives) × Π over better players P(taken).
   */
  function expectedBestAvailable(playersAtPos, nextPick, survivalCtx) {
    const sorted = playersAtPos.slice().sort((a, b) => b.proj_mean - a.proj_mean);
    let expected = 0, allBetterGone = 1, massUsed = 0;
    for (const p of sorted) {
      const surv = survival(p, nextPick, survivalCtx);
      const pBest = surv * allBetterGone;
      expected += p.proj_mean * pBest;
      massUsed += pBest;
      allBetterGone *= (1 - surv);
      if (allBetterGone < CFG.SURVIVOR_CUTOFF) break;
    }
    // Whatever probability mass is left means everyone listed is gone; fall back
    // to the worst known player rather than silently crediting zero points.
    if (massUsed < 1 && sorted.length) {
      expected += sorted[sorted.length - 1].proj_mean * (1 - massUsed);
    }
    return expected;
  }

  /** VONA — how much you lose by waiting. The primary decision metric. */
  function vona(player, board, nextPick, survivalCtx) {
    if (nextPick == null) return player.proj_mean; // no future pick: everything is at stake
    const samePos = board.filter(p => p.position === player.position && p.player_id !== player.player_id);
    const eba = expectedBestAvailable(samePos, nextPick, survivalCtx);
    return player.proj_mean - eba;
  }

  // =============================================== Module 7: composite score
  function tierCliffUrgency(player, board, nextPick, survivalCtx) {
    const tierMates = board.filter(p => p.position === player.position && p.tier === player.tier
      && p.player_id !== player.player_id);
    // P(every remaining tier-mate is gone) = the tier is exhausted.
    let pExhausted = 1;
    tierMates.forEach(p => { pExhausted *= (1 - survival(p, nextPick, survivalCtx)); });
    const drop = player.tier_drop || 0;
    return drop * pExhausted;
  }

  /** Value only counts if it reaches the starting lineup. */
  function starterSlotMarginal(player, roster, league) {
    const starters = league.starters || {};
    const flexEligible = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'] };
    const mine = roster.filter(p => p.position === player.position)
      .sort((a, b) => b.proj_mean - a.proj_mean);
    const dedicated = starters[player.position] || 0;

    if (mine.length < dedicated) {
      return { value: player.vorp, why: `fills an empty ${player.position} slot` };
    }
    // Dedicated slots full — can they still start in a flex?
    let flexOpen = 0;
    Object.keys(flexEligible).forEach(slot => {
      if (!starters[slot]) return;
      if (!flexEligible[slot].includes(player.position)) return;
      const used = roster.filter(p => flexEligible[slot].includes(p.position)).length
        - flexEligible[slot].reduce((s, pos) => s + Math.min(starters[pos] || 0,
          roster.filter(r => r.position === pos).length), 0);
      flexOpen += Math.max(0, (starters[slot] || 0) - Math.max(0, used));
    });
    if (flexOpen > 0) {
      return { value: player.vorp, why: 'starts in your flex' };
    }
    // Bench: worth the upgrade over the man he replaces, discounted, plus a
    // small insurance premium scaled by how often this position misses games.
    const incumbent = mine[dedicated - 1] || mine[mine.length - 1];
    const upgrade = incumbent ? player.proj_mean - incumbent.proj_mean : player.vorp;
    const insurance = (INJURY_RATE[player.position] || 0.15) * Math.max(0, player.vorp) * 0.5;
    return {
      value: upgrade * CFG.BENCH_DISCOUNT + insurance,
      why: upgrade > 0 ? `bench upgrade over your ${player.position}${dedicated}` : 'bye/injury cover',
    };
  }

  function riskAdjustment(player) {
    let risk = 0;
    const reasons = [];
    const cliff = AGE_CLIFF[player.position] || 99;
    if (player.age && player.age >= cliff) {
      const over = player.age - cliff + 1;
      risk -= Math.min(25, 6 * over);
      reasons.push(`age ${player.age} — past the ${player.position} cliff`);
    }
    if (player.injury_status && !/^(healthy|active)$/i.test(player.injury_status)) {
      risk -= 12;
      reasons.push(`listed ${player.injury_status}`);
    }
    if (player.games_missed_3yr >= 8) {
      risk -= 8;
      reasons.push(`${player.games_missed_3yr} games missed in 3 seasons`);
    }
    if (player.depth_chart_order && player.depth_chart_order > 1) {
      risk -= 6 * (player.depth_chart_order - 1);
      reasons.push(`#${player.depth_chart_order} on the depth chart`);
    }
    if (player.opportunity_z != null && player.opportunity_z > 1) {
      risk += 6;
      reasons.push('opportunity metrics ahead of consensus');
    } else if (player.opportunity_z != null && player.opportunity_z < -1) {
      risk -= 6;
      reasons.push('opportunity metrics behind consensus');
    }
    return { value: risk, reasons };
  }

  function upsideBonus(player, pickNumber, totalPicks, myPicksLeft) {
    const raw = (player.proj_ceiling || player.proj_mean) - player.proj_mean;
    // Late picks should be lottery tickets, not safe floors.
    const lateness = totalPicks ? Math.min(1, pickNumber / totalPicks) : 0.5;
    const endgame = myPicksLeft != null && myPicksLeft <= 5 ? 1.6 : 1.0;
    return raw * (0.3 + 0.7 * lateness) * endgame;
  }

  /** The full composite, with a human-readable audit trail attached. */
  function scorePlayer(player, ctx) {
    const w = Object.assign({}, DEFAULT_WEIGHTS, ctx.weights || {});
    // Pass the full context (not just run multipliers) so the A2 three-layer
    // model reaches VONA. Passing ctx.runMultipliers here silently reduced the
    // primary decision metric to the ADP-only Layer 1.
    const v = vona(player, ctx.board, ctx.nextPick, ctx);
    const tier = tierCliffUrgency(player, ctx.board, ctx.nextPick, ctx);
    const need = starterSlotMarginal(player, ctx.roster || [], ctx.league || {});
    const risk = riskAdjustment(player);
    const ceiling = upsideBonus(player, ctx.currentPick, ctx.totalPicks, ctx.myPicksLeft);
    const kov = C.keeperOptionValue(player, ctx);
    const bye = C.byeCollisionPenalty(player, ctx);
    const stack = C.correlationAdjustment(player, ctx);

    const score = v
      + w.tier * tier
      + w.need * need.value
      + w.risk * risk.value
      + w.ceiling * ceiling
      + w.keeper * kov.value
      - w.bye * bye.value
      + w.stack * stack.value;

    const survivalToNext = ctx.nextPick ? survival(player, ctx.nextPick, ctx) : 0;
    const reasons = [];
    if (v > 8) reasons.push(`${v.toFixed(0)} pts better than what's left at ${player.position} by pick ${ctx.nextPick}`);
    if (tier > 5) reasons.push(`last of Tier ${player.tier} ${player.position} — ${Math.round((1 - survivalToNext) * 100)}% gone by your next pick`);
    if (need.value > 0) reasons.push(need.why);
    risk.reasons.forEach(r => reasons.push(r));
    if (w.ceiling * ceiling > 6) reasons.push(`ceiling ${Math.round(player.proj_ceiling)} — worth the swing here`);
    if (w.keeper * kov.value >= C.CFG.KOV_BADGE_AT) {
      reasons.push(`KEEPER TARGET — ${Math.round(kov.p_keep * 100)}% likely worth keeping next year at this cost`);
    }
    if (w.bye * bye.value > 3) reasons.push(`bye collision: ${bye.detail}`);
    stack.reasons.forEach(r => reasons.push(r));
    if (!reasons.length) reasons.push(`best value on the board at ${player.position}`);

    return {
      player,
      score,
      components: {
        vona: v,
        tier_urgency: tier,
        need: need.value,
        risk: risk.value,
        ceiling,
        keeper: kov.value,
        bye: -bye.value,
        stack: stack.value,
        keeper_detail: kov,
        bye_detail: bye,
        weighted: {
          tier: w.tier * tier, need: w.need * need.value,
          risk: w.risk * risk.value, ceiling: w.ceiling * ceiling,
          keeper: w.keeper * kov.value, bye: -w.bye * bye.value, stack: w.stack * stack.value,
        },
      },
      keeper_target: kov.value >= C.CFG.KOV_BADGE_AT,
      survival_to_next: survivalToNext,
      reasons,
    };
  }

  /** Rank the whole available board. Returns scored entries, best first. */
  function recommend(ctx) {
    const scored = ctx.board.map(p => scorePlayer(p, ctx));
    scored.sort((a, b) => b.score - a.score);
    // Flag when the top candidates are close enough that Monte Carlo should break the tie.
    if (scored.length > 1) {
      const gap = scored[0].score - scored[1].score;
      scored[0].contested = gap < CFG.TIE_THRESHOLD;
      scored[0].gap_to_second = gap;
    }
    return scored;
  }

  global.DraftEngine = {
    CFG, DEFAULT_WEIGHTS,
    normalCdf, adpSd, survival, runMultipliers, detectRuns,
    expectedBestAvailable, vona,
    tierCliffUrgency, starterSlotMarginal, riskAdjustment, upsideBonus,
    scorePlayer, recommend,
    // A2/A3 surfaces, re-exported so callers need only one handle.
    survivalModel: S, compositeTerms: C,
    keeperOptionValue: C.keeperOptionValue, byeCollisionPenalty: C.byeCollisionPenalty,
    correlationAdjustment: C.correlationAdjustment,
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).DraftEngine;
}
