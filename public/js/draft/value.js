/* V(roster) — the value function MCTS optimises.
 *
 * ONE SCORING PATH, NOT TWO
 *
 * V is the roster's optimal legal lineup, with unfilled starting slots filled
 * at replacement level, summed in projected points. Every ingredient of that
 * already exists and is already used by StarterSlotMarginal: the same
 * `starters` map, the same flex eligibility, the same `replacement` baseline
 * the artifact ships per position. Nothing here invents a number.
 *
 * An earlier draft of this file wrapped that sum in a Normal approximation and
 * returned P(top-2). That was a second valuation path — a parallel formula with
 * its own assumptions about opponent spread and independence, which would drift
 * from the composite the moment either changed. Deleted. When the quantile work
 * lands and V genuinely becomes P(top-2), it replaces `evaluate` behind the
 * interface below and nothing else moves.
 *
 * WHAT THIS V CANNOT SEE — and the card says so out loud
 *
 * Expected points have no variance, so the search cannot discover
 * ceiling-seeking: no lottery tickets, no favourite/underdog asymmetry, no
 * reason to prefer a boom/bust player when trailing. That dimension is simply
 * absent, and pretending otherwise would be worse than the gap.
 *
 * What it keeps is the part MCTS is actually for — scarcity timing, run
 * anticipation, positional sequencing, turn strategy. All of those depend on
 * who is available rather than on distributions, so they survive the interim V
 * intact. The search is legitimately useful for its core edge and blind in one
 * dimension.
 *
 * NORMALISATION IS NOT COSMETIC
 *
 * Roster point sums run 1,300–1,600. Feeding those to UCT with c=1.2 makes the
 * exploration term a rounding error: the search descends greedily, looks busy,
 * and thinks nothing. So a valuer carries a range for the CURRENT root and maps
 * V into roughly [0,1] before it ever reaches UCT.
 */
(function (global) {
  'use strict';

  const CFG = {
    // An unfilled starting slot is not worth zero — it is worth streaming a
    // waiver body. Slightly below replacement because you are picking from
    // what is left after nine other teams, not from the top of the wire.
    UNFILLED_SLOT_FACTOR: 0.85,
    // Guard against a degenerate range collapsing the normaliser.
    MIN_RANGE: 1e-6,
  };

  const FLEX_ELIGIBLE = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
                          REC_FLEX: ['WR', 'TE'] };

  /**
   * The best legal starting lineup from a set of players, in projected points.
   *
   * Greedy by dedicated slot then flex, which is optimal here because flex
   * eligibility is a simple hierarchy: the best unused skill player always
   * belongs in the flex. Same traversal StarterSlotMarginal uses.
   */
  function bestLineup(roster, league, replacement) {
    const starters = (league || {}).starters || {};
    const byPos = {};
    for (let i = 0; i < (roster || []).length; i++) {
      const p = roster[i];
      (byPos[p.position] = byPos[p.position] || []).push(p);
    }
    Object.keys(byPos).forEach(function (k) {
      byPos[k].sort(function (a, b) { return (b.proj_mean || 0) - (a.proj_mean || 0); });
    });

    let points = 0;
    const unfilled = [];
    const used = {};

    Object.keys(starters).forEach(function (slot) {
      if (FLEX_ELIGIBLE[slot]) return;
      const need = starters[slot] || 0;
      const pool = byPos[slot] || [];
      used[slot] = 0;
      for (let i = 0; i < need; i++) {
        const p = pool[i];
        if (p) { points += p.proj_mean || 0; used[slot]++; }
        else {
          unfilled.push(slot);
          points += ((replacement || {})[slot] || 0) * CFG.UNFILLED_SLOT_FACTOR;
        }
      }
    });

    Object.keys(starters).forEach(function (slot) {
      const elig = FLEX_ELIGIBLE[slot];
      if (!elig) return;
      const need = starters[slot] || 0;
      for (let i = 0; i < need; i++) {
        let best = null, bestPos = null;
        for (let j = 0; j < elig.length; j++) {
          const pos = elig[j];
          const p = (byPos[pos] || [])[used[pos] || 0];
          if (p && (!best || (p.proj_mean || 0) > (best.proj_mean || 0))) { best = p; bestPos = pos; }
        }
        if (best) { points += best.proj_mean || 0; used[bestPos] = (used[bestPos] || 0) + 1; }
        else {
          unfilled.push(slot);
          let rep = 0;
          elig.forEach(function (pos) { rep = Math.max(rep, (replacement || {})[pos] || 0); });
          points += rep * CFG.UNFILLED_SLOT_FACTOR;
        }
      }
    });

    return { points: points, unfilled: unfilled };
  }

  /** Replacement level per position — from the artifact where it exists. */
  /* REPLACEMENT LEVEL IS A PROPERTY OF THE LEAGUE, NOT OF THE LIST YOU HAND IN.
   *
   * THE THIN-POOL BUG (C1 class, 2026-08-10). The derived branch indexed
   * (starters x teams) into whatever array it was given and clamped with
   * Math.min(length - 1, ...). Hand it a SUBSET — a waiver pool, a post-claim
   * board, a position-filtered list — and the clamp lands on the WORST player in
   * the subset, so the baseline collapses and every VORP above it inflates.
   * Measured on the live board: RB replacement 189 on the full pool vs 225 on a
   * 25-player subset, QB and TE straight to 0, and the same RB (proj 200) pricing
   * at VORP +11.5 full versus -24.5 thin. A SIGN FLIP on the same player under
   * the same rules — the draft board and the waiver tool would disagree about
   * what he is worth, which is exactly the C1 contract.
   *
   * The invariant: a subset may never INVENT a replacement level. Two honest
   * sources, in order:
   *   1. `p.replacement` — precomputed by the pipeline over the FULL pool. This
   *      is the production path and it is subset-independent by construction.
   *   2. derivation, but ONLY when the pool actually reaches the replacement rank.
   * Anything else FAILS CLOSED: the position comes back `null`, never a number,
   * and the result carries `__thin` naming the positions that could not be
   * resolved. A caller that prices off null gets NaN and notices; a caller that
   * priced off a silently-wrong baseline never did. */
  function replacementLevels(players, league) {
    const teams = (league || {}).teams || 10;
    const starters = (league || {}).starters || {};
    const out = {};
    const byPos = {};
    (players || []).forEach(function (p) {
      if (p.replacement != null && out[p.position] == null) out[p.position] = p.replacement;
      (byPos[p.position] = byPos[p.position] || []).push(p);
    });
    const thin = [];
    /* THE DERIVED FALLBACK NOW USES THE PIPELINE'S DEFINITION (2026-08-10).
     *
     * IT WAS WRONG IN TWO WAYS, and they compounded:
     *
     *   1. FLEX-BLIND. It used `starters[pos] * teams` dedicated slots only. This
     *      league has 1 FLEX x 10 teams, and the iterative allocation gives NINE
     *      of those ten to WR — so 29 WRs start every week, not 20. The 21st WR
     *      is not freely available, which is what replacement level MEANS.
     *   2. OFF BY ONE. It indexed `[needed]`, the FIRST BENCH player. Replacement
     *      is the LAST STARTER — "the worst player who still starts somewhere in
     *      the league every week" (draft/vorp.py). `[needed - 1]`.
     *
     * Measured against the shipped board, derived vs pipeline:
     *      WR  199.00 vs 172.67   (flex + off-by-one, 26.33 points)
     *      QB  337.48 vs 343.42   (off-by-one)
     *      TE  146.90 vs 150.72   (off-by-one)
     *      RB  188.53 vs 188.53   (AGREED — by luck: the off-by-one landed on the
     *                              same rank the flex allocation produces, 21)
     * RB agreeing is the dangerous part: a spot-check on RB would have cleared it.
     *
     * ONE DEFINITION, and the cross-path test in c1_agreement forces the two
     * implementations to keep producing identical numbers on the real artifact.
     * The pipeline value is still PREFERRED whenever present (every one of the
     * 1762 projected players carries it); this path exists only for pools that
     * have none, such as the synthetic MCTS boards.
     */
    const flexCounts = {};                     // pos -> starters incl. flex share
    Object.keys(byPos).forEach(function (pos) {
      byPos[pos].sort(function (a, b) { return (b.proj_mean || 0) - (a.proj_mean || 0); });
      flexCounts[pos] = Math.max(0, (starters[pos] || 0) * teams);
    });
    // Allocate every flex slot to whichever eligible position offers the best
    // next-man-up, one slot at a time. Mirrors vorp.py's convergence loop; a
    // single pass suffices because the greedy order is already the fixed point.
    let totalFlex = 0;
    const eligible = {};
    Object.keys(starters).forEach(function (slot) {
      if (!FLEX_ELIGIBLE[slot]) return;
      totalFlex += (starters[slot] || 0) * teams;
      FLEX_ELIGIBLE[slot].forEach(function (p) { if (byPos[p]) eligible[p] = true; });
    });
    const eligiblePos = Object.keys(eligible).sort();
    for (let s = 0; s < totalFlex; s++) {
      let bestPos = null, bestVal = -Infinity;
      for (let j = 0; j < eligiblePos.length; j++) {
        const pos = eligiblePos[j], idx = flexCounts[pos] || 0;
        if (idx < byPos[pos].length) {
          const v = byPos[pos][idx].proj_mean || 0;
          if (v > bestVal) { bestVal = v; bestPos = pos; }
        }
      }
      if (!bestPos) break;
      flexCounts[bestPos] = (flexCounts[bestPos] || 0) + 1;
    }
    Object.keys(byPos).forEach(function (pos) {
      if (out[pos] != null) return;              // pipeline value — full-pool, trusted
      const n = Math.max(1, flexCounts[pos] || 0);
      if (byPos[pos].length < n) {
        // The subset does not even reach the replacement rank, so there is no
        // honest baseline to compute. Refuse rather than clamp to the worst man.
        out[pos] = null;
        thin.push(pos);
        return;
      }
      out[pos] = (byPos[pos][n - 1] || {}).proj_mean || 0;   // LAST STARTER
    });
    try {
      Object.defineProperty(out, '__thin', { value: thin, enumerable: false });
    } catch (e) { /* frozen/exotic host — the null levels still carry the signal */ }
    return out;
  }

  /* Did every position resolve to a real, full-pool baseline? Callers that must
   * not price on a thin pool (the waiver tool, the lineup optimiser, any C1
   * consumer) gate on this instead of discovering NaN downstream. */
  function replacementIsComplete(levels) {
    if (!levels) return false;
    const thin = levels.__thin;
    if (thin && thin.length) return false;
    return Object.keys(levels).every(function (k) { return levels[k] != null; });
  }

  /* A stable key for a roster: the same SET of players is the same roster,
   * however it was reached. The search revisits identical rosters constantly
   * down different lines, and evaluation is the expensive step. */
  function rosterKey(roster) {
    const ids = new Array(roster.length);
    for (let i = 0; i < roster.length; i++) ids[i] = roster[i].player_id;
    ids.sort();
    return ids.join(',');
  }

  /**
   * The interface. Nothing outside knows how V is computed.
   *
   *   valuer.evaluate(roster)   -> raw value, in whatever units V uses
   *   valuer.normalized(roster) -> the same, mapped to ~[0,1] for UCT
   *
   * When V becomes P(top-2), only `evaluate` and `calibrate` change. NOTE that
   * tournament results DO NOT transfer across value functions: a search
   * validated on points-V is unvalidated on P(top-2)-V, and the 1,000-draft
   * tournament has to be re-run after the swap, no exceptions.
   */
  function makeValuer(opts) {
    const league = opts.league;
    const replacement = opts.replacement || replacementLevels(opts.players || [], league);
    const cache = Object.create(null);
    let hits = 0, misses = 0;
    let lo = 0, hi = 1;

    function evaluate(roster) {
      return bestLineup(roster, league, replacement).points;
    }

    function raw(roster) {
      const key = rosterKey(roster);
      const got = cache[key];
      if (got !== undefined) { hits++; return got; }
      misses++;
      const v = evaluate(roster);
      cache[key] = v;
      return v;
    }

    /**
     * Fix the range this session's Q values live in.
     *
     * Floor: the roster I hold now, with every remaining slot streamed at
     * replacement — the value of drafting nothing useful again.
     * Ceiling: the roster I hold now plus the best available players greedily
     * filling my needs with every pick I have left — the value of a perfect
     * remaining draft.
     *
     * Every reachable outcome lies between those, so the mapping spans the
     * decision actually being made rather than an arbitrary constant. Without
     * it, Q sits around 1,400 and c=1.2 of exploration is a rounding error:
     * UCT degenerates into greedy descent and the search thinks nothing.
     */
    function calibrate(roster, board, picksLeft) {
      lo = raw(roster);
      const held = (roster || []).slice();
      const pool = (board || []).slice()
        .sort(function (a, b) { return (b.proj_mean || 0) - (a.proj_mean || 0); });
      let best = held.slice();
      let bestV = lo;
      for (let i = 0; i < (picksLeft || 0) && i < pool.length; i++) {
        // Greedy on marginal value, which is exactly what "a perfect remaining
        // draft" means under this V: whichever addition raises the lineup most.
        let take = null, takeV = bestV;
        for (let j = 0; j < Math.min(pool.length, 40); j++) {
          const p = pool[j];
          if (best.indexOf(p) >= 0) continue;
          const v = evaluate(best.concat([p]));
          if (v > takeV) { takeV = v; take = p; }
        }
        if (!take) break;
        best = best.concat([take]);
        bestV = takeV;
      }
      hi = bestV;
      if (hi - lo < CFG.MIN_RANGE) hi = lo + CFG.MIN_RANGE;
      return { lo: lo, hi: hi };
    }

    function normalize(v) {
      const t = (v - lo) / (hi - lo);
      return t < 0 ? 0 : (t > 1 ? 1 : t);
    }

    return {
      evaluate: raw,
      normalized: function (roster) { return normalize(raw(roster)); },
      normalizeValue: normalize,
      calibrate: calibrate,
      range: function () { return { lo: lo, hi: hi }; },
      replacement: replacement,
      // C1 GUARD: was every position priced off a real full-pool baseline? A
      // valuer built on a thin pool must be REFUSED by its caller, not quietly
      // used — that is how the draft board and the waiver tool came to disagree
      // about the same player. Surfaces check this before showing a dollar.
      complete: replacementIsComplete(replacement),
      thinPositions: (replacement && replacement.__thin) || [],
      // What this V is, for the card to say out loud rather than imply.
      describe: function () {
        return { units: 'projected season points',
                 objective: 'expected points',
                 blindTo: 'variance — no upside-seeking, no favourite/underdog asymmetry' };
      },
      stats: function () { return { hits: hits, misses: misses }; },
    };
  }

  const api = { CFG, bestLineup, replacementLevels, replacementIsComplete, rosterKey, makeValuer };
  global.DraftValue = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
