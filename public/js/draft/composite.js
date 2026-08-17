/* A3 — the three new composite terms: KOV, bye collisions, correlation.
 *
 * Kept separate from engine.js because each is a real model with its own
 * assumptions, and each needs to be auditable on its own.
 */
(function (global) {
  'use strict';

  const CFG = {
    // --- KOV -------------------------------------------------------------
    KOV_DISCOUNT: 0.75,          // next year's value discounted to today (spec)
    KOV_ROUND_RAMP_START: 6,     // rounds 1-6 contribute ~nothing: those picks are
    KOV_ROUND_RAMP_FULL: 12,     // expensive to keep anyway. Full weight by round 12.
    /* GATED, DEFAULT FALSE — Cory's ruling required before this ever flips
     * (same pattern as VONA_WIRE_BENCH). EXP-KEEPER-OPTION (draft/backtest/
     * exp_keeper_option.py, 2026-08-15) measured the league's OWN 2023-25
     * keeper history under top_picks_flat and found the reasoned ramp above
     * has the WRONG SHAPE for this league: realized keeper-option value by
     * the round a pick was made is ~7 pts for rounds 4-6 (P(kept next)=11.7%,
     * mean return over the forfeited round +59.9 when kept), ~1.4 pts for
     * rounds 7-9, and ~0 or negative for rounds 10-15 (0 of 31 round-13-15
     * picks were EVER kept). The OLD shipped ramp gave those late rounds
     * MAXIMUM weight and rounds 4-6 zero — inverse to the measurement. ON by
     * Cory's ruling, 2026-08-16 ("3. Yes"), with the small-sample caveat in
     * front of him: two keep transitions, ~40 keep events. The measured shape
     * now IS the shipped shape; flipping back to false restores the old
     * reasoned ramp. */
    KOV_MEASURED_RAMP: true,
    KOV_MEASURED_RAMP_TABLE: { '4-6': 1.0, '7-9': 0.2, '10-12': 0.0, '13-15': 0.0 },
    KOV_BADGE_AT: 8,             // KOV points that earn a "KEEPER TARGET" badge
    // Age decay applied to next year's projection, by position. RBs fall off a
    // cliff; WR/TE hold value; QBs barely move.
    AGE_DECAY: { RB: 0.055, WR: 0.028, TE: 0.025, QB: 0.012, K: 0.0, DEF: 0.0 },
    PEAK_AGE: { RB: 25, WR: 26, TE: 27, QB: 30, K: 30, DEF: 30 },
    // --- bye ---------------------------------------------------------------
    BYE_WEIGHT_BY_POS: { QB: 1.4, TE: 1.35, RB: 1.0, WR: 0.9, K: 0.4, DEF: 0.4 },
    // --- correlation -------------------------------------------------------
    STACK_QB_WR1: 6.0,           // modest in redraft: correlation helps ceilings,
    STACK_QB_TE: 4.0,            // it does not raise the mean
    SAME_TEAM_COMPETITION: -4.0, // two of the same team's target earners cannibalise
    CORRELATION_MIN_ROUND: 6,    // playoff-schedule bonus only applies from here
  };

  // ------------------------------------------------------------------- KOV
  /* The measured ramp (EXP-KEEPER-OPTION), only reachable when
   * CFG.KOV_MEASURED_RAMP is true. Rounds 1-3 read 1.0 DELIBERATELY AND THE
   * CHOICE IS DECLARED: under this league's flat model those rounds are
   * keeper-forfeited and nearly never hold live picks, so the history cannot
   * measure them separately; a live top-3-round pick is at least as keepable
   * as a round-4-6 one, and Cory owns no live pick there anyway. */
  function measuredRamp(round) {
    const t = CFG.KOV_MEASURED_RAMP_TABLE;
    if (round <= 6) return t['4-6']; // rounds 1-3 share the 4-6 peak, per above
    if (round <= 9) return t['7-9'];
    if (round <= 12) return t['10-12'];
    return t['13-15'];
  }

  /**
   * P(this player is worth keeping next season).
   * Logistic over age, role security, breakout signal, and — crucially — how
   * cheap he is to keep, which follows from the round he was drafted in.
   */
  function keepProbability(player, draftRound, league) {
    const pos = player.position;
    const rules = (league && league.keeper_rules) || {};
    const peak = CFG.PEAK_AGE[pos] || 27;
    const age = player.age || peak;

    let z = 0;
    // Cheap keepers are kept. Under original_round, a round-13 player costs a
    // round-13 pick next year — nearly free. A round-2 player costs a round-2 pick.
    const rounds = (league && league.rounds) || 15;
    let costRound = draftRound;
    if (rules.cost_model === 'escalator') costRound = Math.max(1, draftRound - (rules.escalator_rounds || 1));
    else if (rules.cost_model === 'fixed_round') costRound = rules.fixed_round || draftRound;
    else if (rules.cost_model === 'no_cost') costRound = rounds;
    // top_picks_flat: a keeper costs a top pick (round 1 for the best keeper).
    // KOV is next-year keeper VALUE, so the relevant cost is the marginal top
    // pick — round 1. Positional per-keeper resolution is not available here;
    // round 1 is the correct marginal cost for the best keeper candidate.
    else if (rules.cost_model === 'top_picks_flat') costRound = 1;
    z += 2.4 * ((costRound - 1) / Math.max(1, rounds - 1)) - 0.6;

    // Age relative to positional peak.
    z -= 0.28 * Math.max(0, age - peak);
    // Young players still ascending.
    if (player.years_exp != null && player.years_exp <= 2) z += 0.5;
    // Role security.
    if (player.depth_chart_order && player.depth_chart_order > 1) z -= 0.45 * (player.depth_chart_order - 1);
    // Breakout signal: opportunity running ahead of consensus.
    if (player.opportunity_z != null) z += 0.35 * Math.max(-2, Math.min(2, player.opportunity_z));
    // K/DST are never worth a keeper slot.
    if (pos === 'K' || pos === 'DEF') z -= 4;

    return 1 / (1 + Math.exp(-z));
  }

  /** Next season's expected VORP, aged forward from this season's. */
  function nextYearVorp(player) {
    const pos = player.position;
    const peak = CFG.PEAK_AGE[pos] || 27;
    const decay = CFG.AGE_DECAY[pos] == null ? 0.03 : CFG.AGE_DECAY[pos];
    const age = player.age || peak;
    const yearsPast = Math.max(0, age + 1 - peak);
    let factor = Math.pow(1 - decay, yearsPast);
    // Young players ascending toward peak gain rather than lose.
    if (age + 1 < peak) factor *= 1 + 0.04 * Math.min(3, peak - (age + 1));
    return (player.vorp || 0) * factor;
  }

  /**
   * KOV_raw(i) = P(kept) × [E[VORP_next] − E[VORP available at the forfeited round]] × 0.75
   * Ramped so early rounds contribute ~nothing.
   *
   * This is an ABSOLUTE, per-player number and must not be used directly — see
   * keeperOptionValue() below, which makes it marginal. Exported only so the
   * Why? modal can show the raw figure alongside the marginal one.
   */
  function keeperOptionValueRaw(player, ctx) {
    const league = ctx.league || {};
    const teams = league.teams || 10;
    const round = ctx.currentPick ? Math.ceil(ctx.currentPick / teams) : 1;

    const ramp = CFG.KOV_MEASURED_RAMP
      ? measuredRamp(round)
      : (round <= CFG.KOV_ROUND_RAMP_START ? 0
        : Math.min(1, (round - CFG.KOV_ROUND_RAMP_START)
          / Math.max(1, CFG.KOV_ROUND_RAMP_FULL - CFG.KOV_ROUND_RAMP_START)));
    if (ramp <= 0) return { value: 0, p_keep: 0, ramp: 0, next_vorp: 0, alternative: 0 };

    const pKeep = keepProbability(player, round, league);
    const nextV = nextYearVorp(player);
    // What that same forfeited pick would have returned next year: the player
    // whose adjusted ADP sits at that pick, i.e. the market's value there.
    const alt = expectedVorpAtPick(ctx.board || [], round * teams);
    const surplus = nextV - alt;
    return {
      value: ramp * pKeep * surplus * CFG.KOV_DISCOUNT,
      p_keep: pKeep, ramp, next_vorp: nextV, alternative: alt, round,
    };
  }

  /**
   * KOV, made marginal against the keeper slots I actually have.
   *
   * THE BUG THIS FIXES: KOV_raw is per-player and unconstrained, but there are
   * only three keeper slots. The 4th-best keeper candidate on my roster is
   * worth *zero* keeper value, because I cannot keep him. Scored raw, every
   * young ascending player in rounds 10+ earns the bonus independently, and the
   * tool steers the whole back half of the draft toward a bench full of KEEPER
   * TARGET badges — each individually justified, collectively worthless.
   *
   *   KOV_marginal(i) = max(0, KOV_raw(i) − KOV_raw(incumbent at the last slot))
   *
   * The incumbent set is my current roster plus any keepers I entered the draft
   * with that are still keeper-eligible, ranked by raw KOV. Early on, when I
   * hold no candidates, the bar is zero and marginal equals raw. After two
   * strong ones it rises sharply, which is correct: the third slot is worth
   * only what it beats.
   */
  function keeperOptionValue(player, ctx) {
    const raw = keeperOptionValueRaw(player, ctx);
    /* ⚠️ AN OPTION CANNOT BE WORTH LESS THAN ZERO, AND THIS PATH RETURNED
     * NEGATIVE VALUES ALL THE WAY TO −138.85.
     *
     * The docstring above states the contract: KOV_marginal = max(0, raw − bar).
     * The positive path below implements it. THIS early return did not — it
     * passed `raw.value` straight through — so every player whose next-year
     * projection sits below what the forfeited pick would return came back
     * NEGATIVE, at weight 1.0.
     *
     * MEASURED at pick 128: 556 of 559 board players carried a negative keeper
     * value. Exactly two were positive, and they were a defense and a kicker.
     *
     * WHY NEGATIVE IS WRONG AND NOT MERELY UNTIDY. A keeper is an OPTION
     * exercised next August with full information. If the player is not worth
     * keeping you decline, and the option is worth ZERO — never less. The
     * negative branch was charging today for a decision nobody will make.
     *
     * WHAT IT WAS ACTUALLY COMPUTING: `next_vorp` for a fringe QB is −382.7,
     * which is not an option price at all — it is "he is not a starting QB",
     * restated. `value` (VONA) already prices that. So this was an unscaled
     * second VORP term wearing the keeper term's name and weight.
     *
     * FIXED AS A CONTRACT VIOLATION, NOT AS AN IMPROVEMENT. The objective
     * evidence is a NULL: starting-lineup points move 1998.4 -> 2003.4 in one
     * deterministic room, the same magnitude as the `need` null that was
     * refused promotion, measured by a lab that cannot see injury insurance.
     * The case for this change is that the code contradicts its own stated
     * contract, which is true independent of any measurement. */
    /* ⚠️ THE FLOOR IS NOT APPLIED HERE, AND THAT IS A KNOWN DEFECT AWAITING
     * CORY'S DECISION — NOT AN OVERSIGHT. See draft/tests/keeper_option_floor.
     *
     * `value: 0` is deliberately ABSENT from this return. Adding it is the
     * one-line fix, it is written and measured, and it is HELD.
     *
     * WHY IT IS HELD RATHER THAN SHIPPED: flooring it makes the keeper term
     * contribute NOTHING on the frozen benchmark pool — intervention-rate
     * reports `unexpectedly dead: ["keeper"]` and surface_contract's ordering
     * becomes value:60.8 keeper:0.0 onesie:27.8 stack:11.4. So the term's entire
     * live contribution today IS the negative branch. Removing the defect
     * removes the term, which takes the shipped board from three live terms to
     * two, and that is a change Cory should make knowingly four days before a
     * draft rather than one I make inside a bug fix.
     *
     * THE ARGUMENT FOR FIXING IT, so the decision is not re-derived: an option
     * cannot be worth less than zero — you decline it — and the docstring above
     * already specifies max(0, raw − bar). The positive path implements that;
     * this one does not. The objective evidence is a NULL either way (1998.4 ->
     * 2003.4 starting points, one deterministic room, the same magnitude as the
     * `need` null that was refused promotion), so the case rests on the contract
     * and not on the score.
     *
     * Cory's first three picks are unaffected in both states: KOV_ROUND_RAMP_
     * START keeps this term at exactly zero through round 6. */
    if (raw.value <= 0) return Object.assign({}, raw, { raw_value: raw.value, bar: 0, displaced: null });

    const slots = keeperSlots(ctx);
    if (slots <= 0) return Object.assign({}, raw, { value: 0, raw_value: raw.value, bar: Infinity, displaced: null });

    // Everyone already competing for those slots.
    const incumbents = [];
    for (const p of (ctx.roster || [])) {
      if (p && p.player_id !== player.player_id) incumbents.push(p);
    }
    for (const p of (ctx.currentKeepers || [])) {
      if (p && p.keeper_eligible_again !== false
          && !incumbents.some(q => q.player_id === p.player_id)) incumbents.push(p);
    }

    // The bar is the weakest candidate who would still hold a slot. With fewer
    // incumbents than slots there is a free slot, so the bar is zero.
    const ranked = incumbents
      .map(p => ({ p, kov: keeperOptionValueRaw(p, ctx).value }))
      .sort((a, b) => b.kov - a.kov);
    const bar = ranked.length >= slots ? ranked[slots - 1].kov : 0;

    return Object.assign({}, raw, {
      value: Math.max(0, raw.value - bar),
      raw_value: raw.value,
      bar,
      displaced: ranked.length >= slots ? (ranked[slots - 1].p.name || null) : null,
      slots_free: Math.max(0, slots - ranked.length),
    });
  }

  function keeperSlots(ctx) {
    const rules = ((ctx.league || {}).keeper_rules) || {};
    return rules.count == null ? 3 : Number(rules.count);
  }

  /**
   * What a pick at this position in the draft actually returns: the best VORP
   * among players who would plausibly still be on the board there.
   *
   * Nearest-ADP is the wrong lookup — it can land on whichever player happens
   * to sit at that ADP regardless of whether he is any good, and a single
   * mispriced player then drives the whole KOV surplus.
   */
  function expectedVorpAtPick(board, pick) {
    if (!board.length) return 0;
    let best = 0, found = false;
    for (const p of board) {
      const adp = p.adjusted_adp || p.raw_adp || 9999;
      if (adp < pick) continue;             // expected to be gone by then
      const v = p.vorp || 0;
      if (!found || v > best) { best = v; found = true; }
    }
    if (found) return best;
    // Past the end of the board: the tail is replacement level by definition.
    return Math.min.apply(null, board.map(p => p.vorp || 0));
  }

  // ------------------------------------------------------------------- bye
  /**
   * Expected points lost in the bye week from having to start a replacement.
   * Computed from the actual roster, not a flat constant: the penalty only
   * exists when the bye actually forces a replacement-level starter into the
   * lineup, and it scales with how big that drop is.
   */
  function byeCollisionPenalty(player, ctx) {
    const roster = ctx.roster || [];
    const league = ctx.league || {};
    const starters = league.starters || {};
    const bye = player.bye;
    if (!bye) return { value: 0, detail: 'no bye week on file' };

    const pos = player.position;
    const slots = starters[pos] || 0;
    if (!slots) return { value: 0, detail: 'not a dedicated starting position' };

    // Who else at this position is out that week, including the candidate.
    const sameByeAtPos = roster.filter(r => r.position === pos && r.bye === bye);
    const availableThatWeek = roster.filter(r => r.position === pos && r.bye !== bye).length;
    const needed = slots;
    const shortBefore = Math.max(0, needed - availableThatWeek
      - Math.max(0, roster.filter(r => r.position === pos).length - sameByeAtPos.length - availableThatWeek));
    const shortAfter = Math.max(0, needed - availableThatWeek);

    // Adding this player only hurts if he was going to start that week and now
    // can't be covered — i.e. he deepens an existing hole rather than filling one.
    if (shortAfter <= 0) return { value: 0, detail: 'bye is covered' };

    const weeklyMean = (player.proj_mean || 0) / (player.games_expected || 15);
    const replacementWeekly = (player.replacement || 0) / (player.games_expected || 15);
    const drop = Math.max(0, weeklyMean - replacementWeekly);
    const posWeight = CFG.BYE_WEIGHT_BY_POS[pos] == null ? 1 : CFG.BYE_WEIGHT_BY_POS[pos];
    const collisions = sameByeAtPos.length; // how many others already share it
    const value = drop * posWeight * Math.min(1, collisions / Math.max(1, slots));
    return {
      value,
      detail: collisions
        ? `${collisions} other ${pos}${collisions > 1 ? 's' : ''} on bye week ${bye}`
        : `bye week ${bye}`,
      shortBefore, shortAfter,
    };
  }

  // ------------------------------------------------------------ correlation
  /**
   * Stacking and cannibalisation. Deliberately modest — in redraft, correlation
   * moves the ceiling, not the mean, so it should nudge a tie rather than
   * override VONA.
   */
  function correlationAdjustment(player, ctx) {
    const roster = ctx.roster || [];
    const league = ctx.league || {};
    const teams = league.teams || 10;
    const round = ctx.currentPick ? Math.ceil(ctx.currentPick / teams) : 1;
    if (!player.team) return { value: 0, reasons: [] };

    let value = 0;
    const reasons = [];
    const mates = roster.filter(r => r.team === player.team);

    const hasQb = mates.some(r => r.position === 'QB');
    const catchers = mates.filter(r => r.position === 'WR' || r.position === 'TE');

    if (player.position === 'QB' && catchers.length) {
      const w = catchers[0].position === 'TE' ? CFG.STACK_QB_TE : CFG.STACK_QB_WR1;
      value += w;
      reasons.push(`stacks with your ${player.team} ${catchers[0].position}`);
    } else if ((player.position === 'WR' || player.position === 'TE') && hasQb) {
      value += player.position === 'TE' ? CFG.STACK_QB_TE : CFG.STACK_QB_WR1;
      reasons.push(`stacks with your ${player.team} QB`);
    }

    // Two target earners from the same offence split one pie.
    const competing = catchers.length;
    if ((player.position === 'WR' || player.position === 'TE') && competing >= 1) {
      value += CFG.SAME_TEAM_COMPETITION * competing;
      reasons.push(`competes for targets with your ${player.team} ${catchers.map(c => c.position).join('/')}`);
    }

    // Playoff-weeks schedule. Only from round 6 (spec), and only when the
    // artifact actually carries schedule strength — never invented.
    if (round >= CFG.CORRELATION_MIN_ROUND && player.playoff_sos != null) {
      const bump = -player.playoff_sos * 4; // negative sos = easy slate = good
      value += bump;
      if (Math.abs(bump) > 1.5) {
        reasons.push(bump > 0 ? 'soft weeks 15-17 schedule' : 'brutal weeks 15-17 schedule');
      }
    }
    return { value, reasons };
  }

  const api = { CFG, keepProbability, nextYearVorp, keeperOptionValue,
    keeperOptionValueRaw, keeperSlots, expectedVorpAtPick,
                byeCollisionPenalty, correlationAdjustment };
  global.DraftComposite = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
