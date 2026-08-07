/* V(roster) → P(top-2 finish). The value function MCTS optimises.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * The MCTS build order specifies "the Part 9 §4 machinery" — a light Monte
 * Carlo of my roster against the projected league. That machinery does not
 * exist in this codebase. Rather than pretend it does, or block the search on
 * building it, this is a deliberately simpler value function that is honest
 * about its assumptions and fast enough to be called a hundred thousand times.
 *
 * THE MODEL
 *
 * A season total is a sum of ~14 weekly lineup scores, so by the central limit
 * theorem it is close to Normal even when the weekly scores are not. So:
 *
 *   my season total  ~ Normal(Σ starter proj_mean, √Σ starter proj_sd²)
 *   each opponent    ~ Normal(mu_opp, sd_opp), independent
 *
 * P(top 2 of 10) is then P(at most 1 of 9 opponents beats me), integrated over
 * my own distribution:
 *
 *   P = ∫ φ(x; μ, σ) · [ (1−q(x))⁹ + 9·q(x)·(1−q(x))⁸ ] dx
 *
 * where q(x) = P(one opponent exceeds x). One-dimensional, so Gauss–Legendre
 * over ±5σ converges to more decimal places than the inputs deserve, in about
 * forty evaluations. Deterministic — no seed, no sampling noise, and identical
 * on every call, which is what makes the reproducibility ship condition
 * achievable at all.
 *
 * WHERE IT IS WRONG, STATED PLAINLY
 *
 *   - Opponents are independent and identically distributed. They are not:
 *     they draft from the same pool I do, so my taking a player lowers theirs.
 *     The search partly captures this by removing players from the board.
 *   - It uses SEASON totals, so it cannot see week-to-week lineup decisions,
 *     start/sit, or injury replacement. A real P(top-2) would simulate weeks.
 *   - Bye weeks are not modelled here at all; the composite already penalises
 *     bye collisions and double-counting them would be worse than omitting them.
 *
 * What it gets right is the thing MCTS actually needs: a monotone, smooth,
 * comparable number that rises when my roster improves and is sensitive to
 * roster SHAPE rather than to raw point totals — an unfilled starting slot
 * costs real probability, which is exactly the signal greedy VORP is blind to.
 */
(function (global) {
  'use strict';

  const CFG = {
    // Gauss–Legendre nodes over my own distribution. 24 is already past the
    // point where more changes the third decimal, and this is the hot loop.
    QUAD_NODES: 24,
    QUAD_SPAN: 5,             // ±5σ covers everything that matters
    TOP_N: 2,                 // "top 2" — the objective the whole system uses
    // A starting slot you never fill is not worth zero, it is worth whatever
    // is on waivers. Expressed as a fraction of the positional replacement
    // level so it scales with the format rather than being a magic number.
    UNFILLED_SLOT_FACTOR: 0.85,
    // Fallback spread when a player carries no proj_sd, as a fraction of mean.
    DEFAULT_SD_FRACTION: 0.22,
  };

  const FLEX_ELIGIBLE = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
                          REC_FLEX: ['WR', 'TE'] };

  // --- Gauss–Legendre nodes/weights on [-1, 1], computed once -----------------
  const QUAD = (function (n) {
    // Newton iteration on the Legendre polynomial. Done here rather than by a
    // hardcoded table so changing QUAD_NODES stays a one-line change.
    const x = new Array(n), w = new Array(n);
    for (let i = 0; i < n; i++) {
      let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5));
      let pp = 0;
      for (let it = 0; it < 100; it++) {
        let p0 = 1, p1 = 0;
        for (let j = 0; j < n; j++) {
          const p2 = p1; p1 = p0;
          p0 = ((2 * j + 1) * z * p1 - j * p2) / (j + 1);
        }
        pp = n * (z * p0 - p1) / (z * z - 1);
        const dz = p0 / pp;
        z -= dz;
        if (Math.abs(dz) < 1e-14) break;
      }
      x[i] = z;
      w[i] = 2 / ((1 - z * z) * pp * pp);
    }
    return { x: x, w: w };
  })(CFG.QUAD_NODES);

  function normPdf(z) { return Math.exp(-0.5 * z * z) / 2.5066282746310002; }

  // Abramowitz & Stegun 7.1.26 — same erf the survival model uses, kept local
  // so this module has no load-order dependency on it.
  function erf(x) {
    const s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t
      - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function normCdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

  /**
   * The best legal starting lineup out of a set of players, by projection.
   *
   * Greedy by position then flex, which is optimal here because flex eligibility
   * is a simple hierarchy — the best leftover skill player always belongs in the
   * flex. Returns the summed mean and variance, plus which slots went unfilled.
   */
  function bestLineup(roster, league, replacement) {
    const starters = (league || {}).starters || {};
    const byPos = {};
    (roster || []).forEach(function (p) {
      (byPos[p.position] = byPos[p.position] || []).push(p);
    });
    Object.keys(byPos).forEach(function (k) {
      byPos[k].sort(function (a, b) { return (b.proj_mean || 0) - (a.proj_mean || 0); });
    });

    let mean = 0, variance = 0;
    const unfilled = [];
    const used = {};

    // Dedicated slots first.
    Object.keys(starters).forEach(function (slot) {
      if (FLEX_ELIGIBLE[slot]) return;
      const need = starters[slot] || 0;
      const pool = byPos[slot] || [];
      used[slot] = 0;
      for (let i = 0; i < need; i++) {
        const p = pool[i];
        if (p) {
          mean += p.proj_mean || 0;
          const sd = p.proj_sd || (p.proj_mean || 0) * CFG.DEFAULT_SD_FRACTION;
          variance += sd * sd;
          used[slot]++;
        } else {
          unfilled.push(slot);
          const rep = (replacement || {})[slot] || 0;
          mean += rep * CFG.UNFILLED_SLOT_FACTOR;
          const sd = rep * CFG.DEFAULT_SD_FRACTION;
          variance += sd * sd;
        }
      }
    });

    // Then flex, from whoever is left over.
    Object.keys(starters).forEach(function (slot) {
      const elig = FLEX_ELIGIBLE[slot];
      if (!elig) return;
      const need = starters[slot] || 0;
      for (let i = 0; i < need; i++) {
        let best = null, bestPos = null;
        elig.forEach(function (pos) {
          const p = (byPos[pos] || [])[used[pos] || 0];
          if (p && (!best || (p.proj_mean || 0) > (best.proj_mean || 0))) { best = p; bestPos = pos; }
        });
        if (best) {
          mean += best.proj_mean || 0;
          const sd = best.proj_sd || (best.proj_mean || 0) * CFG.DEFAULT_SD_FRACTION;
          variance += sd * sd;
          used[bestPos] = (used[bestPos] || 0) + 1;
        } else {
          unfilled.push(slot);
          let rep = 0;
          elig.forEach(function (pos) { rep = Math.max(rep, (replacement || {})[pos] || 0); });
          mean += rep * CFG.UNFILLED_SLOT_FACTOR;
          const sd = rep * CFG.DEFAULT_SD_FRACTION;
          variance += sd * sd;
        }
      }
    });

    return { mean: mean, sd: Math.sqrt(variance), unfilled: unfilled };
  }

  /**
   * The league I am trying to finish above.
   *
   * Built once per board from the players who will realistically be started:
   * the top (teams × slot count) at each position. Their mean is what an
   * average team's lineup looks like, which is the only baseline that makes
   * P(top-2) mean anything.
   */
  function leagueBaseline(players, league) {
    const teams = (league || {}).teams || 10;
    const starters = (league || {}).starters || {};
    const byPos = {};
    (players || []).forEach(function (p) {
      (byPos[p.position] = byPos[p.position] || []).push(p);
    });
    Object.keys(byPos).forEach(function (k) {
      byPos[k].sort(function (a, b) { return (b.proj_mean || 0) - (a.proj_mean || 0); });
    });

    let mean = 0, variance = 0;
    Object.keys(starters).forEach(function (slot) {
      const elig = FLEX_ELIGIBLE[slot];
      const need = starters[slot] || 0;
      const positions = elig || [slot];
      // For a flex, pool the eligible positions and take the next best.
      const pool = [];
      positions.forEach(function (pos) {
        const dedicated = elig ? (starters[pos] || 0) * teams : 0;
        (byPos[pos] || []).slice(dedicated, dedicated + need * teams)
          .forEach(function (p) { pool.push(p); });
      });
      if (!elig) {
        const take = (byPos[slot] || []).slice(0, need * teams);
        take.forEach(function (p) {
          mean += (p.proj_mean || 0) / teams;
          const sd = p.proj_sd || (p.proj_mean || 0) * CFG.DEFAULT_SD_FRACTION;
          // AVERAGE variance per slot, not summed across every team's player.
          // Summing over all `teams` players filling a slot and rescaling gave
          // a single opponent the spread of the whole league — sd 497 on a mean
          // of 2347, which flattens P(top-2) toward a coin flip and destroys
          // the search's ability to tell two rosters apart.
          variance += (sd * sd) / teams;
        });
        // A position with fewer startable players than the league needs is a
        // scarcity fact, not a reason to under-count the baseline.
        const short = need * teams - take.length;
        if (short > 0 && take.length) {
          const last = take[take.length - 1];
          mean += short * (last.proj_mean || 0) / teams;
        }
      } else {
        pool.sort(function (a, b) { return (b.proj_mean || 0) - (a.proj_mean || 0); });
        pool.slice(0, need * teams).forEach(function (p) {
          mean += (p.proj_mean || 0) / teams;
          const sd = p.proj_sd || (p.proj_mean || 0) * CFG.DEFAULT_SD_FRACTION;
          variance += (sd * sd) / teams;
        });
      }
    });

    // `variance` is now the average variance of ONE team's starting lineup:
    // each slot contributed the mean variance of the players filling it across
    // the league, and there are as many contributions as there are slots.
    const sd = Math.sqrt(variance);
    return { mean: mean, sd: sd > 0 ? sd : Math.max(1, mean * 0.08), teams: teams };
  }

  /**
   * P(I finish in the top N of `teams`), given my season distribution and a
   * common opponent distribution.
   *
   * Exact under the model rather than sampled, so the same roster always
   * returns bit-identical value — which the reproducibility ship condition
   * requires and a Monte Carlo could not give without fixing a seed.
   */
  function pTopN(mine, opp, teams, topN) {
    const nOpp = Math.max(0, (teams || 10) - 1);
    const beat = Math.max(0, (topN == null ? CFG.TOP_N : topN) - 1);  // how many may beat me
    if (!nOpp) return 1;
    const sd = mine.sd > 0 ? mine.sd : 1e-6;
    const lo = mine.mean - CFG.QUAD_SPAN * sd, hi = mine.mean + CFG.QUAD_SPAN * sd;
    const half = (hi - lo) / 2, mid = (hi + lo) / 2;

    // Binomial tail: at most `beat` of nOpp opponents exceed x.
    let total = 0;
    for (let i = 0; i < QUAD.x.length; i++) {
      const x = mid + half * QUAD.x[i];
      const z = (x - mine.mean) / sd;
      const dens = normPdf(z) / sd;
      const q = 1 - normCdf((x - opp.mean) / (opp.sd > 0 ? opp.sd : 1e-6));
      let cum = 0, term;
      for (let k = 0; k <= beat; k++) {
        term = binom(nOpp, k) * Math.pow(q, k) * Math.pow(1 - q, nOpp - k);
        cum += term;
      }
      total += QUAD.w[i] * half * dens * cum;
    }
    return Math.max(0, Math.min(1, total));
  }

  const BINOM = {};
  function binom(n, k) {
    const key = n + ':' + k;
    if (BINOM[key] != null) return BINOM[key];
    let r = 1;
    for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
    BINOM[key] = r;
    return r;
  }

  /**
   * The whole value function: a roster in, P(top-2) out.
   *
   * `ctx.baseline` and `ctx.replacement` are precomputed once per board — doing
   * them per call would dominate the cost and they do not depend on my roster.
   */
  function rosterValue(roster, ctx) {
    const mine = bestLineup(roster, ctx.league, ctx.replacement);
    return pTopN(mine, ctx.baseline, (ctx.league || {}).teams || 10,
                 ctx.topN == null ? CFG.TOP_N : ctx.topN);
  }

  /* A stable key for a roster, for memoisation.
   *
   * Sorted player ids: the same set reached down two different lines of the
   * search is the same roster, and the search reaches identical rosters
   * constantly. Order of acquisition changes nothing about season value.
   */
  function rosterKey(roster) {
    const ids = new Array(roster.length);
    for (let i = 0; i < roster.length; i++) ids[i] = roster[i].player_id;
    ids.sort();
    return ids.join(',');
  }

  function makeCache() {
    const map = Object.create(null);
    let hits = 0, misses = 0;
    return {
      value: function (roster, ctx) {
        const key = rosterKey(roster);
        const got = map[key];
        if (got !== undefined) { hits++; return got; }
        misses++;
        const v = rosterValue(roster, ctx);
        map[key] = v;
        return v;
      },
      stats: function () { return { hits: hits, misses: misses, size: Object.keys(map).length }; },
      clear: function () { Object.keys(map).forEach(function (k) { delete map[k]; }); },
    };
  }

  /** Replacement level per position, from the artifact if present else derived. */
  function replacementLevels(players, league) {
    const teams = (league || {}).teams || 10;
    const starters = (league || {}).starters || {};
    const out = {};
    const byPos = {};
    (players || []).forEach(function (p) {
      if (p.replacement != null && out[p.position] == null) out[p.position] = p.replacement;
      (byPos[p.position] = byPos[p.position] || []).push(p);
    });
    Object.keys(byPos).forEach(function (pos) {
      if (out[pos] != null) return;
      byPos[pos].sort(function (a, b) { return (b.proj_mean || 0) - (a.proj_mean || 0); });
      const idx = Math.min(byPos[pos].length - 1, Math.max(0, (starters[pos] || 1) * teams));
      out[pos] = (byPos[pos][idx] || {}).proj_mean || 0;
    });
    return out;
  }

  const api = { CFG, bestLineup, leagueBaseline, pTopN, rosterValue, rosterKey,
                makeCache, replacementLevels, normCdf };
  global.DraftValue = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
