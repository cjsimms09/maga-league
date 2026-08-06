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

  const DEFAULT_WEIGHTS = { tier: 1.0, need: 1.0, risk: 1.0, ceiling: 0.5 };

  // Positional injury rates -> how much bye/injury insurance a bench body is worth.
  const INJURY_RATE = { QB: 0.14, RB: 0.28, WR: 0.20, TE: 0.22, K: 0.04, DEF: 0.02 };
  // Age at which production reliably falls off, by position.
  const AGE_CLIFF = { RB: 27, WR: 30, TE: 31, QB: 36, K: 99, DEF: 99 };

  // ---- normal distribution (no dependencies) ----
  function erf(x) {
    // Abramowitz & Stegun 7.1.26 — max error 1.5e-7, far tighter than our inputs.
    const s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
    return s * (1 - poly * Math.exp(-x * x));
  }
  function normalCdf(x, mu, sigma) {
    if (!sigma || sigma <= 0) return x >= mu ? 1 : 0;
    return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
  }

  // ================================================= Module 5: survival model
  function adpSd(adpMean, provided) {
    if (provided && provided > 0) return provided;
    return Math.max(CFG.ADP_SD_FLOOR, CFG.ADP_SD_RATE * adpMean);
  }

  /** P(player still on the board at `pick`), with the live run multiplier. */
  function survival(player, pick, runMultipliers) {
    const adp = player.adjusted_adp || player.raw_adp || 9999;
    const sd = adpSd(adp, player.adp_sd);
    let taken = normalCdf(pick, adp, sd);
    const mult = (runMultipliers && runMultipliers[player.position]) || 1;
    if (mult !== 1) {
      // Scale the hazard, not the probability, so results stay in [0,1] and a
      // 2x-hot position can never produce a >100% chance of being gone.
      taken = 1 - Math.pow(1 - taken, mult);
    }
    return Math.max(0, Math.min(1, 1 - taken));
  }

  /**
   * Bayesian-ish live update: compare the positional mix of the last N picks to
   * what ADP predicted, and turn the ratio into a damped hazard multiplier.
   */
  function runMultipliers(recentPicks, board, currentPick) {
    const out = {};
    if (!recentPicks || recentPicks.length < 4) return out;
    const window = recentPicks.slice(-CFG.RUN_WINDOW);
    const n = window.length;

    const observed = {};
    window.forEach(p => { observed[p.position] = (observed[p.position] || 0) + 1; });

    // Expected: of the players who *should* have gone in this window, what mix?
    const start = currentPick - n;
    const expected = {};
    let expTotal = 0;
    board.forEach(pl => {
      const adp = pl.adjusted_adp || pl.raw_adp || 9999;
      const sd = adpSd(adp, pl.adp_sd);
      const mass = normalCdf(currentPick, adp, sd) - normalCdf(start, adp, sd);
      if (mass > 0) {
        expected[pl.position] = (expected[pl.position] || 0) + mass;
        expTotal += mass;
      }
    });

    Object.keys(observed).forEach(pos => {
      const obsRate = observed[pos] / n;
      const expRate = expTotal > 0 ? (expected[pos] || 0) / expTotal : obsRate;
      if (expRate <= 0.01) return;
      const raw = 1 + CFG.RUN_DAMPING * (obsRate / expRate - 1);
      out[pos] = Math.max(CFG.RUN_MIN, Math.min(CFG.RUN_MAX, raw));
    });
    return out;
  }

  function detectRuns(mults) {
    return Object.keys(mults || {})
      .filter(pos => mults[pos] >= CFG.RUN_BANNER_AT)
      .sort((a, b) => mults[b] - mults[a]);
  }

  // ========================================================= Module 6: VONA
  /**
   * E[best available at `nextPick`] for one position.
   * P(j is the best survivor) = P(j survives) × Π over better players P(taken).
   */
  function expectedBestAvailable(playersAtPos, nextPick, runMults) {
    const sorted = playersAtPos.slice().sort((a, b) => b.proj_mean - a.proj_mean);
    let expected = 0, allBetterGone = 1, massUsed = 0;
    for (const p of sorted) {
      const surv = survival(p, nextPick, runMults);
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
  function vona(player, board, nextPick, runMults) {
    if (nextPick == null) return player.proj_mean; // no future pick: everything is at stake
    const samePos = board.filter(p => p.position === player.position && p.player_id !== player.player_id);
    const eba = expectedBestAvailable(samePos, nextPick, runMults);
    return player.proj_mean - eba;
  }

  // =============================================== Module 7: composite score
  function tierCliffUrgency(player, board, nextPick, runMults) {
    const tierMates = board.filter(p => p.position === player.position && p.tier === player.tier
      && p.player_id !== player.player_id);
    // P(every remaining tier-mate is gone) = the tier is exhausted.
    let pExhausted = 1;
    tierMates.forEach(p => { pExhausted *= (1 - survival(p, nextPick, runMults)); });
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
    const v = vona(player, ctx.board, ctx.nextPick, ctx.runMultipliers);
    const tier = tierCliffUrgency(player, ctx.board, ctx.nextPick, ctx.runMultipliers);
    const need = starterSlotMarginal(player, ctx.roster || [], ctx.league || {});
    const risk = riskAdjustment(player);
    const ceiling = upsideBonus(player, ctx.currentPick, ctx.totalPicks, ctx.myPicksLeft);

    const score = v + w.tier * tier + w.need * need.value + w.risk * risk.value + w.ceiling * ceiling;

    const survivalToNext = ctx.nextPick ? survival(player, ctx.nextPick, ctx.runMultipliers) : 0;
    const reasons = [];
    if (v > 8) reasons.push(`${v.toFixed(0)} pts better than what's left at ${player.position} by pick ${ctx.nextPick}`);
    if (tier > 5) reasons.push(`last of Tier ${player.tier} ${player.position} — ${Math.round((1 - survivalToNext) * 100)}% gone by your next pick`);
    if (need.value > 0) reasons.push(need.why);
    risk.reasons.forEach(r => reasons.push(r));
    if (w.ceiling * ceiling > 6) reasons.push(`ceiling ${Math.round(player.proj_ceiling)} — worth the swing here`);
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
        weighted: {
          tier: w.tier * tier, need: w.need * need.value,
          risk: w.risk * risk.value, ceiling: w.ceiling * ceiling,
        },
      },
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
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).DraftEngine;
}
