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
    // Mirrors survival.js — a source-provided sd always wins over both.
    ADP_SD_FLOOR: 3.0,        // nobody is unsure about pick 1
    ADP_SD_RATE: 0.15,        // was 0.22; see survival.js for why, and for why
    ADP_SD_CAP: 15.0,         // this is an interim, not a calibration
    RUN_WINDOW: 10,           // picks of history the Bayesian update looks at
    RUN_DAMPING: 0.5,         // how hard observed rates move the hazard
    RUN_MIN: 0.6,             // clamp: a cold position can't go below this
    RUN_MAX: 1.8,             // clamp: a hot position can't exceed this
    RUN_BANNER_AT: 1.4,       // multiplier that earns a "RUN DETECTED" banner
    BENCH_DISCOUNT: 0.35,     // 12-team default; formatDefaults() overrides it
    SURVIVOR_CUTOFF: 0.005,   // stop the VONA product once mass is negligible
    TIE_THRESHOLD: 2.0,       // composite points within which we call it a tie

    // --- on the clock (Part 6: the buddy layer) ---
    // How wide the gap to second has to be before the board is telling you
    // something rather than rounding noise. Below COIN_FLIP the honest answer
    // is "either", and saying so is worth more than a confident ranking that
    // is really a tossup — false precision is how a tool loses trust on the
    // one pick it got loudly wrong.
    COIN_FLIP_GAP: 1.0,
    CLOSE_GAP: 3.5,
    // A target you have starred is allowed to jump a gap this big. Wide enough
    // that your own read wins a close call, narrow enough that it cannot drag
    // a materially worse player to the top of the list.
    TARGET_NUDGE: 3.0,

    // --- plausibility rails (Part 6 §2) ---
    // These never change a recommendation. They flag one, because an
    // integration bug across eight composite terms produces confident nonsense
    // rather than a crash — which this codebase has now done three times.
    RAIL_ADP_AHEAD: 30,           // picks ahead of ADP before "verify this"
    RAIL_LATE_ROUNDS: 2,          // rounds left below which K/DST stops being odd
    RAIL_COMPONENT_RATIO: 1.0,    // a component larger than the player's own VORP
    RAIL_RUNAWAY_RATIO: 3.0,      // top score this many times the runner-up
    RAIL_DEFAULT_POS_CAP: { QB: 3, K: 2, DEF: 2, TE: 3 },

    // --- the paper sheet (Part 6 §3) ---
    // Sized for one sheet of A4 at a readable size, not for completeness. A
    // two-page sheet is a sheet nobody reads the second page of, and the
    // failure mode this exists for — dead phone, no wifi — is exactly the one
    // where flipping pages is worst.
    SHEET_QUEUE_DEPTH: 40,        // your own queue: ~4 rounds of contingency
    SHEET_BEST_DEPTH: 30,         // board order, for when the queue runs dry
    SHEET_POSITION_DEPTH: 12,     // per position — deep enough to show 2-3 tiers
    SHEET_POSITIONS: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],

    // --- reading the room (A1 surfaced) ---
    // How much evidence earns a sentence about an opponent. Set high on purpose.
    // A tool that says something confident about all nine of your league-mates
    // is a tool saying nine things, most of them noise, and one wrong call at
    // the table costs more trust than nine right ones earn. Under these
    // thresholds it says nothing, which is usually correct.
    TELL_TIMING_ROUNDS: 1.0,     // rounds off league average before it is a tendency
    TELL_REACH_PICKS: 2.0,       // picks above/below market
    TELL_BPA_GAP: 0.12,          // best-available rate vs league
    TELL_HOMER_RATE: 0.20,       // share of picks from one NFL team
    TELL_ROOKIE_RATIO: 1.5,      // times the league rookie rate
    TELL_ROOKIE_FLOOR: 0.12,     // ...and at least this often, so 2% vs 1% is not a tell

    // --- the threat board ---
    THREAT_NAMES_PER_PICK: 3,    // names shown per intervening seat
    THREAT_MIN_P: 0.01,          // below this a candidate is noise, not a threat
    THREAT_AT_RISK_MIN: 0.25,    // chance of being gone before it is worth naming
    THREAT_AT_RISK_SHOWN: 8,

    // How deep to compare when reporting what a weight change did. Five is the
    // length of the list on screen — reporting a change below the fold would be
    // reporting a change you cannot see.
    WEIGHT_DIFF_DEPTH: 5,

    // --- auto-adjusting weights by draft phase ---
    // Round boundaries for the four phases. Not fitted — three prior drafts is
    // nowhere near enough to fit weights against, and claiming otherwise would
    // be exactly the false precision this codebase refuses. They are the
    // standard shape of a snake draft, stated so they can be argued with.
    AUTO_ANCHOR_ROUNDS: 2,      // everything is empty; need is meaningless
    AUTO_BUILD_ROUNDS: 6,       // starters filling in
    AUTO_FILL_ROUNDS: 10,       // holes start costing real points
    AUTO_TIGHT_PICKS: 4,        // picks left below which a gap is an emergency
  };

  const DEFAULT_WEIGHTS = { tier: 1.0, need: 1.0, risk: 1.0, ceiling: 0.5,
    keeper: 1.0, bye: 1.0, stack: 1.0 };

  /* Named strategies, as weight sets.
   *
   * Seven sliders is six too many to reason about on the clock, and a knob you
   * do not know how to turn is a knob you never touch — which makes it worse
   * than no knob, because it still looks like a decision you are declining to
   * make. These are the four readings of a draft that actually differ, each
   * expressed as the weights it implies, with the reason attached so it can be
   * argued with rather than trusted.
   *
   * They are starting points. Every one of them is still a slider afterwards.
   */
  const WEIGHT_PRESETS = [
    {
      key: 'balanced', label: 'Balanced',
      why: 'The defaults. Value and lineup need traded off evenly — right until '
        + 'you have a reason it is not.',
      weights: { tier: 1.0, need: 1.0, risk: 1.0, ceiling: 0.5, keeper: 1.0, bye: 1.0, stack: 1.0 },
    },
    {
      key: 'value', label: 'Best available',
      why: 'Take the best player and sort the lineup out later. Need barely '
        + 'registers; tier cliffs and safety do the deciding. Strongest early, '
        + 'dangerous after round 8 when the holes stop filling themselves.',
      weights: { tier: 1.4, need: 0.35, risk: 1.1, ceiling: 0.5, keeper: 1.0, bye: 0.7, stack: 0.7 },
    },
    {
      key: 'upside', label: 'Swing for it',
      why: 'Ceiling over floor, cliffs over comfort. In a 10-team league the '
        + 'median team makes the playoffs, so the payoff is in the tail — but '
        + 'this WILL hand you a bust or two and you should expect it.',
      weights: { tier: 1.2, need: 0.8, risk: 0.45, ceiling: 1.6, keeper: 1.3, bye: 0.8, stack: 1.3 },
    },
    {
      key: 'safe', label: 'Win now, no holes',
      why: 'Fill the lineup, avoid the bye-week landmines, take the boring '
        + 'healthy one. Costs you upside and it is meant to. Sensible when your '
        + 'three keepers already carry the team.',
      weights: { tier: 0.9, need: 1.6, risk: 1.7, ceiling: 0.2, keeper: 0.5, bye: 1.6, stack: 0.8 },
    },
  ];

  /* Which preset (if any) the current weights ARE.
   *
   * Exact match only. "Close to Balanced" is a claim that invites you to stop
   * reading the sliders, which is the opposite of what they are for.
   */
  function matchPreset(weights) {
    const keys = Object.keys(DEFAULT_WEIGHTS);
    for (const p of WEIGHT_PRESETS) {
      if (keys.every(k => Math.abs((weights[k] == null ? 1 : weights[k]) - p.weights[k]) < 1e-9)) return p.key;
    }
    return null;
  }

  /* What a weight change actually did to the top of the board.
   *
   * A slider whose effect you cannot see is a slider you are guessing with.
   * Comparing two ranked lists of names is the only honest answer to "did that
   * do anything" — and most of the time the answer is no, which is worth
   * knowing before you spend a pick believing otherwise.
   */
  function rankDiff(before, after, depth) {
    depth = depth || CFG.WEIGHT_DIFF_DEPTH;
    const a = (before || []).slice(0, depth).map(s => s.player.name);
    const b = (after || []).slice(0, depth).map(s => s.player.name);
    if (!a.length || !b.length) return { changed: false, message: '' };
    if (a[0] !== b[0]) {
      return { changed: true, topChanged: true,
        message: 'Now recommends ' + b[0] + ' over ' + a[0] + '.' };
    }
    const joined = b.filter(n => a.indexOf(n) === -1);
    const dropped = a.filter(n => b.indexOf(n) === -1);
    if (joined.length || dropped.length) {
      return { changed: true, topChanged: false,
        message: (joined.length ? joined.join(', ') + ' into the top ' + depth : '')
          + (joined.length && dropped.length ? '; ' : '')
          + (dropped.length ? dropped.join(', ') + ' out' : '') + '.' };
    }
    const moved = b.some((n, i) => a[i] !== n);
    return { changed: moved, topChanged: false,
      message: moved ? 'Reordered the top ' + depth + ', same names.'
                     : 'No change to the top ' + depth + '.' };
  }

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
      reasons.push(`KEEPER TARGET — ${Math.round(kov.p_keep * 100)}% likely worth keeping next year at this cost`
        + (kov.slots_free
            ? ` (${kov.slots_free} keeper slot${kov.slots_free === 1 ? '' : 's'} still open)`
            : `, and he beats ${kov.displaced || 'your weakest keeper'} for the last slot by `
              + `${Math.round(kov.value)} pts (raw ${Math.round(kov.raw_value)})`));
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
  /**
   * Which mandatory starting slots are still empty, and which positions fill them.
   *
   * FLEX is deliberately excluded from "mandatory": it is satisfiable by three
   * positions the composite already chases hard. K and DST are the danger,
   * because their VORP is near zero — StarterSlotMarginal gives an empty slot
   * full VORP, and full VORP of a kicker is nothing. The composite will
   * therefore never prioritise them on its own.
   */
  function mandatoryGaps(ctx) {
    const starters = (ctx.league || {}).starters || {};
    const roster = ctx.roster || [];
    const held = {};
    roster.forEach(p => { held[p.position] = (held[p.position] || 0) + 1; });

    const gaps = [];
    Object.keys(starters).forEach(slot => {
      if (FLEXIBLE_SLOTS.indexOf(slot) !== -1) return;   // FLEX-type, not position-specific
      const need = (starters[slot] || 0) - (held[slot] || 0);
      for (let i = 0; i < need; i++) gaps.push(slot);
    });
    return gaps;
  }
  const FLEXIBLE_SLOTS = ['FLEX', 'SUPER_FLEX', 'REC_FLEX', 'BN', 'IR', 'TAXI'];
  // Picks remaining below which a bye clash stops being something you can
  // still draft your way out of.
  const BYE_SETTLED_AT = 3;

  /**
   * Roster legality endgame — a HARD filter, not a weight.
   *
   * The failure this prevents: with two picks left, no kicker and no defense,
   * the composite happily recommends a fourth wide receiver because his VONA
   * dwarfs a kicker's. The draft ends, the lineup is illegal, and no amount of
   * survival modelling survives that.
   *
   * A weight cannot fix it — a large enough VONA always outvotes a weight. So
   * once remaining picks are down to the number of mandatory holes, candidates
   * are RESTRICTED to positions that fill one. One round earlier, a soft
   * warning, so the choice is still yours.
   */
  function applyRosterLegality(scored, ctx) {
    const gaps = mandatoryGaps(ctx);
    const picksLeft = ctx.myPicksLeft == null ? 99 : ctx.myPicksLeft;
    if (!gaps.length || !scored.length) return { scored, forced: null, warning: null };

    const needed = {};
    gaps.forEach(pos => { needed[pos] = true; });
    const counts = {};
    gaps.forEach(pos => { counts[pos] = (counts[pos] || 0) + 1; });
    const gapLabel = Object.keys(counts)
      .map(pos => (counts[pos] > 1 ? counts[pos] + '\u00d7' : '') + pos).join(', ');

    if (picksLeft <= gaps.length) {
      const eligible = scored.filter(s => needed[s.player.position]);
      if (eligible.length) {
        eligible.forEach(s => {
          s.forced = true;
          s.reasons = ['FORCED — ' + picksLeft + ' pick' + (picksLeft === 1 ? '' : 's')
            + ' left and you still need ' + gapLabel + '. Nothing else can legally start.']
            .concat(s.reasons || []);
        });
        return {
          scored: eligible,
          forced: { picksLeft, gaps, message: 'Forced: ' + picksLeft + ' pick'
            + (picksLeft === 1 ? '' : 's') + ' left, still missing ' + gapLabel + '.' },
          warning: null,
        };
      }
      // No candidate can fill the hole — say so rather than silently ranking.
      return { scored, forced: null,
        warning: 'You still need ' + gapLabel + ' and nobody on the board plays there.' };
    }

    if (picksLeft <= gaps.length + 1) {
      return { scored, forced: null,
        warning: 'Next pick you will be forced — take ' + gapLabel
          + ' now if you want a choice.' };
    }
    return { scored, forced: null, warning: null };
  }

  /**
   * Format-derived defaults (Part 3 §7).
   *
   * The composite's constants were reasoned for a 12-team league. Ten teams
   * with three keepers is a different game, and several defaults are simply
   * wrong for it — but hand-setting new ones would break again the moment the
   * league changes shape, so they are DERIVED from team count and keeper count.
   *
   * The driver is how much talent actually leaves the pool before the draft
   * and how deep the draft goes. With 10 teams x 3 keepers only 30 players are
   * gone, so replacement level sits high and the waiver wire stays stocked all
   * season. Two consequences follow, and both are real strategy changes:
   *
   *   Bench depth is worth much less. A bench player you are stashing is
   *   competing against a waiver wire that keeps producing startable options,
   *   so the 0.35 discount is too generous — nearer 0.20 in this format.
   *   Handcuffs are close to worthless for the same reason.
   *
   *   VORP spreads compress, so VONA matters more relative to VORP. Positional
   *   scarcity is weaker everywhere except genuinely elite TE and QB.
   *
   * (The FAAB consequence in the source spec does not apply — this league runs
   * waiver priority, confirmed by zero bid amounts across 1,091 historical
   * transactions.)
   */
  function formatDefaults(league) {
    const teams = (league && league.teams) || 12;
    const keepers = ((league && league.keeper_rules) || {}).count || 0;
    const starters = (league && league.starters) || {};
    const startersPerTeam = Object.keys(starters)
      .reduce((n, k) => n + (starters[k] || 0), 0) || 9;

    // Two independent forces, and it matters that they are separated. An
    // earlier version divided (teams x keepers) by (teams x starters), which
    // cancels the team count entirely — a 14-team league scored identically to
    // a 10-team one. The test caught it.
    //
    //   scarcity  — more teams competing for the same NFL player pool means a
    //               thinner wire and a bench that is worth more
    //   relief    — keepers shorten the draft, so more talent goes undrafted
    //               and the wire stays richer, making the bench worth less
    const scarcity = teams / 12;                                  // 1.0 at the baseline
    const relief = keepers / Math.max(1, startersPerTeam);          // 0 at redraft
    const benchDiscount = Math.max(0.15, Math.min(0.45,
      0.35 * scarcity - 0.35 * relief));
    const lockedAway = teams * keepers;

    return {
      teams, keepers, startersPerTeam,
      locked_away: lockedAway,
      scarcity: Number(scarcity.toFixed(3)),
      keeper_relief: Number(relief.toFixed(3)),
      BENCH_DISCOUNT: Number(benchDiscount.toFixed(3)),
      // Streaming is worth more when a startable option is always available, so
      // the positions you can stream get pushed later.
      STREAMABLE_LATE: teams <= 10 ? ['QB', 'TE', 'K', 'DEF'] : ['K', 'DEF'],
      why: teams <= 10
        ? teams + ' teams and ' + keepers + ' keepers: only ' + lockedAway
          + ' players leave the pool, so replacement level is high, the wire stays '
          + 'stocked, and bench depth is worth ' + Math.round(benchDiscount * 100)
          + '% of a starter upgrade rather than 35%.'
        : teams + '-team league: defaults unchanged.',
    };
  }

  /** Apply format-derived defaults to the live config. Idempotent. */
  function applyFormatDefaults(league) {
    const f = formatDefaults(league);
    CFG.BENCH_DISCOUNT = f.BENCH_DISCOUNT;
    return f;
  }

  function recommend(ctx) {
    const all = ctx.board.map(p => scorePlayer(p, ctx));
    all.sort((a, b) => b.score - a.score);

    const legality = applyRosterLegality(all, ctx);
    const scored = legality.scored;

    // Flag when the top candidates are close enough that Monte Carlo should break the tie.
    if (scored.length > 1) {
      const gap = scored[0].score - scored[1].score;
      scored[0].contested = gap < CFG.TIE_THRESHOLD;
      scored[0].gap_to_second = gap;
    }
    if (scored.length) {
      scored[0].legality = legality.forced || null;
      scored[0].legality_warning = legality.warning || null;
    }
    scored.forEach(s => { s.rails = plausibilityRails(s, ctx, scored); });
    return scored;
  }

  /**
   * The whole answer for one pick: the list, how much to trust it, and what
   * each of the top options costs you at your next pick.
   *
   * One call rather than three so the on-the-clock view cannot accidentally
   * render a recommendation from one board and a forecast from another.
   */
  function onTheClock(ctx, lists) {
    let scored = recommend(ctx);
    scored = applyPersonalLists(scored, lists);
    // Personal lists reorder, so contested/gap have to be recomputed against
    // the list you are actually looking at.
    if (scored.length > 1) {
      const gap = scored[0].score - scored[1].score;
      scored[0].contested = gap < CFG.TIE_THRESHOLD;
      scored[0].gap_to_second = gap;
    }
    const top = scored.slice(0, 3);
    return {
      scored,
      confidence: confidence(scored),
      branches: top.map(e => branchForecast(e, ctx)).filter(Boolean),
    };
  }

  /**
   * The shape of the rest of your draft.
   *
   * Halfway through, the useful question stops being "who is best" and becomes
   * "how many picks do I actually have spare". Two picks left with a kicker and
   * a defence still to fill is not a draft, it is an arithmetic problem, and
   * you want to know that three rounds before it becomes one.
   */
  function rosterPlan(ctx) {
    const gaps = mandatoryGaps(ctx);
    const picksLeft = ctx.myPicksLeft == null ? 0 : ctx.myPicksLeft;
    const starters = (ctx.league || {}).starters || {};
    const roster = ctx.roster || [];
    const held = {};
    roster.forEach(p => { held[p.position] = (held[p.position] || 0) + 1; });

    // FLEX is separate: it is satisfiable three ways, so it is a claim on a
    // pick without being a claim on a position.
    let flexNeed = 0;
    Object.keys(starters).forEach(slot => {
      if (FLEXIBLE_SLOTS.indexOf(slot) === -1 || slot === 'BN' || slot === 'IR' || slot === 'TAXI') return;
      const surplus = ['RB', 'WR', 'TE'].reduce((n, pos) =>
        n + Math.max(0, (held[pos] || 0) - (starters[pos] || 0)), 0);
      flexNeed += Math.max(0, (starters[slot] || 0) - surplus);
    });

    const need = {};
    gaps.forEach(g => { need[g] = (need[g] || 0) + 1; });
    const needed = Object.keys(need).map(pos => ({ position: pos, count: need[pos] }));
    const mustSpend = gaps.length + flexNeed;
    const spare = picksLeft - mustSpend;

    let message;
    if (!picksLeft) message = 'Draft over.';
    else if (mustSpend === 0) {
      message = picksLeft + ' picks left and every starting slot is filled. All of it is upside from here.';
    } else if (spare < 0) {
      message = picksLeft + ' picks left but ' + mustSpend + ' slots still to fill. '
        + 'Something has to give — you will be starting someone off waivers.';
    } else if (spare === 0) {
      message = picksLeft + ' picks left and ' + mustSpend + ' slots to fill. '
        + 'Every remaining pick is spoken for.';
    } else {
      message = picksLeft + ' picks left, ' + mustSpend + ' still needed. '
        + spare + (spare === 1 ? ' pick is' : ' picks are') + ' genuinely free.';
    }
    return { needed, flexNeed, mustSpend, picksLeft, spare, message,
             tight: spare <= 0 && picksLeft > 0 };
  }

  /**
   * Bye weeks, and the weeks they actually cost you something.
   *
   * A bye clash only matters if it leaves you unable to FIELD a position — two
   * backup receivers off in the same week is a non-event, and colouring it red
   * teaches people to ignore the colour. So the flag is not "how many are out",
   * it is "how many can you still start".
   */
  function byeGrid(ctx) {
    const roster = ctx.roster || [];
    const starters = (ctx.league || {}).starters || {};
    const byWeek = {};
    roster.forEach(p => {
      if (!p.bye) return;
      (byWeek[p.bye] || (byWeek[p.bye] = [])).push(p);
    });

    return Object.keys(byWeek).map(Number).sort((a, b) => a - b).map(week => {
      const out = byWeek[week];
      const shorts = [];
      Object.keys(starters).forEach(pos => {
        if (FLEXIBLE_SLOTS.indexOf(pos) !== -1) return;
        const need = starters[pos] || 0;
        if (!need) return;
        const away = out.filter(p => p.position === pos).length;
        // A position with nobody on bye that week is not a bye problem, and a
        // position you have not drafted yet is a ROSTER problem — that is what
        // the plan above is for. Flagging both here turns the grid into a wall
        // of red in round three, which teaches people to ignore the colour.
        if (!away) return;
        const have = roster.filter(p => p.position === pos).length;
        const left = have - away;
        if (left < need) shorts.push({ position: pos, need, available: left });
      });
      // In round three you hold two running backs, so ANY running-back bye
      // reads as a hole — and it is not one, because you have six picks left to
      // fill it. A clash is only real once you are nearly out of picks. Until
      // then it is provisional, and the UI says so instead of shouting.
      const picksLeft = ctx.myPicksLeft == null ? 0 : ctx.myPicksLeft;
      const provisional = shorts.length > 0 && picksLeft > BYE_SETTLED_AT;
      return {
        week, players: out, shorts, provisional,
        severity: !shorts.length ? (out.length >= 4 ? 'warn' : 'ok')
          : provisional ? 'warn' : 'bad',
      };
    });
  }

  /**
   * How much to trust the top recommendation, in words.
   *
   * The engine can always sort. What it cannot always do is tell you the sort
   * MEANT anything — and on the clock, "these two are a coin flip, take the one
   * you like" is a more useful sentence than a confident number that happens to
   * be 0.3 points ahead. Every draft tool that loses trust loses it on a pick
   * it was loudly certain about.
   */
  function confidence(scored) {
    if (!scored.length) return { level: 'none', gap: 0, message: 'Board is empty.' };
    if (scored.length === 1) {
      return { level: 'clear', gap: Infinity, message: 'Only one legal option.' };
    }
    const gap = scored[0].score - scored[1].score;
    const a = scored[0].player, b = scored[1].player;
    if (gap < CFG.COIN_FLIP_GAP) {
      return {
        level: 'coin-flip', gap,
        message: 'Coin flip: ' + a.name + ' and ' + b.name + ' score within '
          + gap.toFixed(1) + '. Take whichever you like — the board cannot separate them.',
      };
    }
    if (gap < CFG.CLOSE_GAP) {
      return {
        level: 'close', gap,
        message: 'Close: ' + a.name + ' is ahead of ' + b.name + ' by only '
          + gap.toFixed(1) + '. A real preference should override this.',
      };
    }
    return {
      level: 'clear', gap,
      message: a.name + ' is clearly ahead — ' + gap.toFixed(1) + ' points over ' + b.name + '.',
    };
  }

  /**
   * What your next pick looks like if you take this player now.
   *
   * The decision on the clock is never "who is best" in the abstract, it is
   * "who is best given what I can still get later". Taking the RB is right if
   * the WR you want survives the round trip and wrong if he does not, and that
   * is a different question from which of them scores higher today.
   *
   * Returns the expected best VORP still on the board at your next pick, by
   * position, and flags positions that fall off a cliff in between.
   */
  function branchForecast(entry, ctx) {
    const next = ctx.nextPick;
    if (!next || !ctx.board || !ctx.board.length) return null;

    // Everything except the player you would be taking.
    const remaining = ctx.board.filter(p => p.player_id !== entry.player.player_id);
    const avail = remaining.map(p => survival(p, next, ctx));
    const at = S.expectedBestByPos(remaining, avail);
    // Same measure right now, so "what does waiting cost" is a subtraction
    // rather than a number you have to hold two of in your head.
    const now = S.expectedBestByPos(remaining, remaining.map(() => 1));

    const rows = Object.keys(at).map(pos => ({
      position: pos,
      now: now[pos] || 0,
      at_next: at[pos] || 0,
      loss: Math.max(0, (now[pos] || 0) - (at[pos] || 0)),
    })).sort((x, y) => y.loss - x.loss);

    return { pick: next, taking: entry.player.name, rows };
  }

  /**
   * What a manager's own draft history says about him, in English.
   *
   * The profiles have been feeding the survival model since A1 — alpha_need and
   * beta_value shape every positional distribution, reach_delta widens the
   * softmax for a reacher. All of that has been true and completely invisible.
   * A number that moves a recommendation you cannot see is a number you cannot
   * argue with, and the whole promise of this tool is "explain, don't just
   * rank".
   *
   * Thresholds live in CFG because every one of them is a judgement call about
   * how much evidence earns a sentence. Under them we say nothing, which is the
   * right answer far more often than people building these expect.
   *
   * Everything here is already shrunk toward the league average by managers.py,
   * so a single draft cannot produce a confident tell. `sample_size` is
   * reported anyway — three drafts is three drafts, however it is phrased.
   */
  function managerTells(profile) {
    if (!profile) return [];
    const out = [];
    const n = profile.sample_size || 0;

    // Positional timing: the most useful single fact about an opponent. Negative
    // vs_league means EARLIER than the league — managers.py measures mean round.
    const timing = profile.positional_timing || {};
    Object.keys(timing).forEach(pos => {
      const t = timing[pos] || {};
      const d = t.vs_league;
      if (d == null || Math.abs(d) < CFG.TELL_TIMING_ROUNDS) return;
      out.push({
        kind: 'timing', position: pos,
        weight: Math.abs(d),
        text: d < 0
          ? 'takes ' + pos + ' about ' + Math.abs(d).toFixed(1) + ' rounds earlier than the league'
          : 'waits about ' + d.toFixed(1) + ' rounds longer than the league on ' + pos,
        detail: 'his average ' + pos + ' comes off in round ' + (t.mean_round || 0).toFixed(1),
      });
    });

    // Reaching. Proxy-flagged metrics say so, because a manager who drafted a
    // player who later busted looks like a reacher purely in hindsight.
    const rd = profile.reach_delta || {};
    if (rd.mean != null && Math.abs(rd.mean) >= CFG.TELL_REACH_PICKS) {
      out.push({
        kind: 'reach', weight: Math.abs(rd.mean) / 2,
        // Relative to this league, not to raw ADP: keepers pull every pick
        // "ahead of market" by construction, so the absolute figure is a
        // shared offset rather than anything about him.
        text: rd.mean > 0
          ? 'reaches ' + rd.mean.toFixed(1) + ' picks earlier than the rest of the league'
          : 'lets value come to him — ' + Math.abs(rd.mean).toFixed(1)
            + ' picks later than the rest of the league',
        detail: rd.proxy ? 'measured against today\'s ranks, not the ADP of the day — treat as a hint'
                         : 'measured against that season\'s real ADP',
        proxy: !!rd.proxy,
      });
    }

    // Best-available vs need.
    const bpa = profile.bpa_vs_need || {};
    if (bpa.bpa_rate != null && bpa.league_rate != null
        && Math.abs(bpa.bpa_rate - bpa.league_rate) >= CFG.TELL_BPA_GAP) {
      const hi = bpa.bpa_rate > bpa.league_rate;
      out.push({
        kind: 'bpa', weight: Math.abs(bpa.bpa_rate - bpa.league_rate) * 5,
        text: hi ? 'drafts best-available and ignores his holes'
                 : 'drafts for need — he fills slots before he takes value',
        detail: Math.round(bpa.bpa_rate * 100) + '% best-available vs '
          + Math.round(bpa.league_rate * 100) + '% league',
        proxy: !!bpa.proxy,
      });
    }

    // Homer. Cheap to compute, disproportionately useful — it is the one tell
    // people will confirm out loud at the table.
    const h = profile.homer_index || {};
    if (h.team && h.rate != null && h.rate >= CFG.TELL_HOMER_RATE) {
      out.push({
        kind: 'homer', weight: h.rate * 3, team: h.team,
        text: 'homer for ' + h.team + ' — ' + Math.round(h.rate * 100) + '% of his picks',
        detail: 'expect him to take a ' + h.team + ' player above where you would',
      });
    }

    // Rookies.
    const r = profile.rookie_affinity || {};
    if (r.rate != null && r.league_rate != null && r.rate >= r.league_rate * CFG.TELL_ROOKIE_RATIO
        && r.rate >= CFG.TELL_ROOKIE_FLOOR) {
      out.push({
        kind: 'rookie', weight: (r.rate - r.league_rate) * 6,
        text: 'chases rookies — ' + Math.round(r.rate * 100) + '% vs '
          + Math.round(r.league_rate * 100) + '% league',
      });
    }

    out.sort((a, b) => b.weight - a.weight);
    out.forEach(t => { t.sample_size = n; });
    return out;
  }

  /**
   * Who picks before you do, what they need, and who they are likely to take.
   *
   * This is the question the whole survival model answers internally and has
   * never once said out loud. Round 6, you want the TE, and the real decision is
   * "do the four seats between me and my next pick take him". The tool knew. It
   * expressed that knowledge as a single percentage attached to a player, with
   * no way to see WHICH seat was the threat or WHY.
   *
   * Naming the seat is what makes it actionable, because you know these people.
   * "62% gone" is a number to accept. "Richard takes a QB three rounds early and
   * has no QB" is a number you can check against a man you have played fantasy
   * football with for a decade — and disagree with, which is the point.
   *
   * Returns one row per intervening pick, in pick order, plus a roll-up of who
   * on your board is most likely to be gone and who is most likely to take him.
   */
  function threatBoard(ctx, opts) {
    opts = opts || {};
    const namesPer = opts.namesPerPick || CFG.THREAT_NAMES_PER_PICK;
    // No next pick means no window. `t.pick_no < ctx.nextPick` with a null
    // nextPick would let the whole rest of the draft through and report the
    // last pick of your draft as if forty seats were about to snipe you.
    const intervening = ctx.nextPick ? (ctx.intervening || []).filter(t =>
      t.pick_no >= (ctx.currentPick || 0) && t.pick_no < ctx.nextPick) : [];
    if (!intervening.length || !ctx.board || !ctx.board.length) {
      return { rows: [], atRisk: [], picksUntilNext: 0 };
    }

    // Availability at the time each seat picks, so seat four is not told that
    // a player seat one is 80% likely to have taken is still sitting there.
    const board = ctx.board;
    const rows = [];
    // P(still on the board) for each player, carried forward across the window.
    const alive = {};
    board.forEach(p => { alive[p.player_id] = 1; });

    intervening.forEach(team => {
      const posP = S.positionProbabilities(team, board, ctx);
      const profile = team.profile || null;
      const tells = managerTells(profile);

      // The seat's whole distribution over players: P(position) × P(this man,
      // given the position) × P(he is even still there).
      const cand = [];
      board.forEach(p => {
        const pp = posP[p.position];
        if (!pp) return;
        const within = S.withinPositionProbability(p, board, team);
        const p_take = pp * within * alive[p.player_id];
        if (p_take > CFG.THREAT_MIN_P) cand.push({ player: p, p: p_take });
      });
      cand.sort((a, b) => b.p - a.p);

      // One seat takes exactly one player, so its probabilities cannot sum past
      // 1. Without this a confident seat reads as taking three men at once.
      let mass = 0;
      cand.forEach(c => { mass += c.p; });
      if (mass > 1) cand.forEach(c => { c.p /= mass; });
      cand.forEach(c => { alive[c.player.player_id] *= (1 - c.p); });

      // The full distribution, not the top three. Truncating here would bake a
      // rendering decision into the data, and a caller asking "how likely is he
      // to take a QB" would silently get 0 for any position off the podium.
      const positions = Object.keys(posP).map(k => ({ position: k, p: posP[k] }))
        .sort((a, b) => b.p - a.p);

      rows.push({
        pick_no: team.pick_no,
        team_slot: team.team_slot,
        manager: (profile && (profile.name || profile.display_name)) || null,
        sample_size: profile ? (profile.sample_size || 0) : 0,
        roster_size: (team.roster || []).length,
        positions: positions,
        likely: cand.slice(0, namesPer).map(c => ({
          player_id: c.player.player_id, name: c.player.name,
          position: c.player.position, team: c.player.team || '',
          p: Math.round(c.p * 100),
        })),
        tells: tells.slice(0, 2),
      });
    });

    // Roll-up: who is most likely to be gone, and who takes him.
    const risk = board.map(p => {
      const gone = 1 - alive[p.player_id];
      if (gone < CFG.THREAT_AT_RISK_MIN) return null;
      let culprit = null, best = 0;
      rows.forEach(r => {
        const hit = r.likely.find(l => l.player_id === p.player_id);
        if (hit && hit.p > best) { best = hit.p; culprit = r; }
      });
      return {
        player_id: p.player_id, name: p.name, position: p.position,
        vorp: p.vorp == null ? null : Number(p.vorp.toFixed(1)),
        gone: Math.round(gone * 100),
        // Null rather than a guess when no single seat stands out: "somebody
        // will take him" is a different and weaker claim than naming a seat.
        by: culprit ? (culprit.manager || 'seat ' + culprit.team_slot) : null,
        by_pick: culprit ? culprit.pick_no : null,
      };
    }).filter(Boolean);
    // Ordered by what it costs you, not by probability: a 95%-gone kicker is
    // not news, and a 55%-gone RB1 is the entire decision.
    risk.sort((a, b) => (b.gone / 100) * (b.vorp || 0) - (a.gone / 100) * (a.vorp || 0));

    return {
      rows: rows,
      atRisk: risk.slice(0, CFG.THREAT_AT_RISK_SHOWN),
      picksUntilNext: intervening.length,
    };
  }


  /* Weights that follow the draft instead of waiting to be turned.
   *
   * The honest answer to "should I change these between rounds" is YES, and
   * always has been — the same weights cannot be right in round 1, when every
   * slot is empty and lineup need is meaningless noise, and in round 12, when
   * an unfilled kicker slot is a guaranteed zero. Expecting somebody to work
   * that out mid-draft with eight seconds on the clock is expecting the wrong
   * thing of them.
   *
   * WHAT THIS IS NOT: backtested. Three prior drafts is not enough to fit
   * weights against, and pretending otherwise would be the exact false
   * precision the rest of this codebase refuses. These are the standard
   * structure of a draft — anchor, build, fill, endgame — expressed as weights,
   * plus four situational responses to things happening in front of you. Every
   * single adjustment states its reason, so it is a suggestion you can read and
   * overrule rather than a black box that moves numbers.
   */
  function autoWeights(ctx) {
    const reasons = [];
    const teams = (ctx.league || {}).teams || 10;
    const round = ctx.currentPick ? Math.floor((ctx.currentPick - 1) / teams) + 1 : 1;
    const picksLeft = ctx.myPicksLeft == null ? 99 : ctx.myPicksLeft;
    const w = Object.assign({}, DEFAULT_WEIGHTS);

    // ---- phase ------------------------------------------------------------
    let phase, phaseWhy;
    if (round <= CFG.AUTO_ANCHOR_ROUNDS) {
      phase = 'Anchor';
      phaseWhy = 'Round ' + round + ': every slot is empty, so "need" is noise. '
        + 'Take the best player and the cliffs.';
      w.need = 0.35; w.tier = 1.35; w.risk = 1.1; w.ceiling = 0.45; w.bye = 0.5; w.keeper = 0.9;
    } else if (round <= CFG.AUTO_BUILD_ROUNDS) {
      phase = 'Build';
      phaseWhy = 'Round ' + round + ': starters are filling in. Value still leads, '
        + 'but holes start to matter.';
      w.need = 0.9; w.tier = 1.2; w.risk = 1.0; w.ceiling = 0.6; w.bye = 0.8; w.stack = 1.1;
    } else if (round <= CFG.AUTO_FILL_ROUNDS) {
      phase = 'Fill';
      phaseWhy = 'Round ' + round + ': an empty starting slot now costs real points '
        + 'every week, and a stacked bye is a lineup you cannot field.';
      w.need = 1.45; w.tier = 1.0; w.risk = 0.9; w.ceiling = 0.8; w.bye = 1.4;
    } else {
      phase = 'Endgame';
      phaseWhy = 'Round ' + round + ': the marginal starter is close to worthless, '
        + 'so swing at upside and at players worth keeping next year.';
      w.need = 1.3; w.tier = 0.8; w.risk = 0.6; w.ceiling = 1.4; w.keeper = 1.6; w.bye = 1.1;
    }
    reasons.push({ kind: 'phase', text: phaseWhy });

    // ---- what is actually happening in front of you -----------------------

    // 1. A mandatory gap you can no longer afford to defer.
    const gaps = mandatoryGaps(ctx) || {};
    const missing = (gaps.positions || gaps.needed || []).length
      || Object.keys(gaps).filter(k => gaps[k] > 0).length;
    if (picksLeft <= CFG.AUTO_TIGHT_PICKS && missing) {
      w.need = Math.min(3, w.need + 0.9);
      w.ceiling = Math.max(0, w.ceiling - 0.3);
      reasons.push({ kind: 'tight', text: picksLeft + ' picks left with slots still empty — '
        + 'need outranks everything else now.' });
    }

    // 2. A run on a position you still have to fill.
    const runs = detectRuns(ctx.runMultipliers || {}) || [];
    const hot = (Array.isArray(runs) ? runs : []).map(r => r.position || r).filter(Boolean);
    if (hot.length) {
      w.tier = Math.min(3, w.tier + 0.35);
      reasons.push({ kind: 'run', text: 'Run on ' + hot.join(', ')
        + ' — chasing the last of a tier is worth more while it is emptying.' });
    }

    // 3. Starters all filled: stop optimising a lineup that is already legal.
    const plan = rosterPlan(ctx);
    if (plan && !plan.needed.length && !plan.flexNeed && round > CFG.AUTO_ANCHOR_ROUNDS) {
      w.need = Math.max(0.2, w.need - 0.6);
      w.ceiling = Math.min(3, w.ceiling + 0.4);
      w.keeper = Math.min(3, w.keeper + 0.3);
      reasons.push({ kind: 'complete', text: 'Your starting lineup is full — '
        + 'the rest of this draft is upside and next year\'s keepers.' });
    }

    // 4. A bye week you already cannot field a lineup in.
    const byes = byeGrid(ctx) || [];
    const holes = byes.filter(b => b.severity === 'bad' && !b.provisional).length;
    if (holes) {
      w.bye = Math.min(3, w.bye + 0.5);
      reasons.push({ kind: 'bye', text: holes + ' week' + (holes === 1 ? '' : 's')
        + ' you cannot field a lineup — bye collisions are now a real cost, not a tiebreak.' });
    }

    Object.keys(w).forEach(k => { w[k] = Math.round(Math.max(0, Math.min(3, w[k])) * 10) / 10; });
    return { weights: w, phase: phase, round: round, reasons: reasons };
  }

  /**
   * The sheet you take to the table when the tool is not available.
   *
   * Every other surface in here assumes a working phone, a charged battery and
   * a network. Draft day will eventually not have one of those, and the fallback
   * cannot be "remember what it said" — it has to be paper, or a block of text
   * pasted into whatever still works.
   *
   * Three things, in the order you would want them:
   *   1. YOUR QUEUE, in YOUR order. Never re-sorted. A sheet that quietly
   *      reorders your own decisions is a sheet you stop trusting, and the
   *      whole point of the queue is that it is the one list the model does
   *      not get a vote on. It only annotates: how likely each name is to
   *      still be there when you pick.
   *   2. THE BOARD'S ORDER for everyone not in the queue, so the queue running
   *      dry is a smaller problem than it would otherwise be.
   *   3. BY POSITION with tier breaks marked, because the question at pick 9
   *      of a paper draft is "who is the last decent TE", and a single ranked
   *      column answers that badly.
   *
   * It is a SNAPSHOT and says so. Scores depend on what is already on your
   * roster, so a sheet printed pre-draft is right about round 1 and steadily
   * less right after that. Stamping the state it was built from is what stops
   * that from being a silent error in round 8.
   */
  function cheatSheet(ctx, lists, opts) {
    opts = opts || {};
    const queueDepth = opts.queueDepth || CFG.SHEET_QUEUE_DEPTH;
    const bestDepth = opts.bestDepth || CFG.SHEET_BEST_DEPTH;
    const posDepth = opts.positionDepth || CFG.SHEET_POSITION_DEPTH;

    const warnings = [];
    const avoid = new Set((lists && lists.avoid) || []);
    const targets = new Set((lists && lists.targets) || []);
    const queueIds = ((lists && lists.queue) || []).slice(0, queueDepth);

    // Scored once, through exactly the path the live recommendation uses, so
    // the sheet and the screen can never disagree about who is better.
    const scored = applyPersonalLists(recommend(ctx), lists);
    const byId = {};
    scored.forEach(s => { byId[s.player.player_id] = s; });

    const next = ctx.nextPick || null;
    const row = (p, entry) => ({
      player_id: p.player_id,
      name: p.name,
      position: p.position,
      team: p.team || '',
      bye: p.bye || null,
      tier: p.tier || null,
      adp: p.adjusted_adp == null ? null : Math.round(p.adjusted_adp),
      vorp: p.vorp == null ? null : Number(p.vorp.toFixed(1)),
      targeted: targets.has(p.player_id),
      // The one number worth carrying onto paper: not "is he good" — the sheet
      // is already sorted by that — but "can I wait". Null when there is no
      // next pick to survive to, rather than a fabricated 0.
      survives_to_next: next ? Math.round(survival(p, next, ctx) * 100) : null,
      why: entry && entry.reasons && entry.reasons.length ? entry.reasons[0] : null,
    });

    // 1. Your queue, in your order. A queued player who is already off the
    //    board is REPORTED, not dropped: "he is gone" is the sheet's job too.
    const board = {};
    (ctx.board || []).forEach(p => { board[p.player_id] = p; });
    const queue = [];
    queueIds.forEach((id, i) => {
      const p = board[id];
      if (!p) {
        queue.push({ player_id: id, rank: i + 1, gone: true, name: null });
        return;
      }
      const r = row(p, byId[id]);
      r.rank = i + 1;
      r.gone = false;
      if (avoid.has(id)) {
        // Both starred-for-the-queue and blocked is a contradiction the user
        // made, and resolving it silently either way would be wrong.
        r.conflict = true;
        warnings.push(p.name + ' is in your queue AND on your never list');
      }
      queue.push(r);
    });

    // 2. The board's order, minus anyone already spoken for above.
    const queued = new Set(queueIds);
    const best = scored.filter(s => !queued.has(s.player.player_id))
      .slice(0, bestDepth).map(s => row(s.player, s));

    // 3. By position, with the tier break marked on the last man in each tier.
    //    That mark is the whole reason this section exists on paper.
    const positions = opts.positions || CFG.SHEET_POSITIONS;
    const byPosition = positions.map(pos => {
      const players = scored.filter(s => s.player.position === pos)
        .slice(0, posDepth).map(s => row(s.player, s));
      players.forEach((p, i) => {
        const nxt = players[i + 1];
        p.tier_break = !!(nxt && p.tier && nxt.tier && nxt.tier !== p.tier);
      });
      return { position: pos, players: players };
    }).filter(g => g.players.length);

    if (!queue.length) warnings.push('your queue is empty — this sheet is the board\'s opinion only');
    if (!scored.length) warnings.push('the board is empty — nothing to print');

    return {
      // Provenance, not decoration. Read it before trusting the sheet.
      generated: {
        current_pick: ctx.currentPick || null,
        next_pick: next,
        my_picks_left: ctx.myPicksLeft == null ? null : ctx.myPicksLeft,
        roster_size: (ctx.roster || []).length,
        board_size: (ctx.board || []).length,
        blocked: avoid.size,
      },
      queue: queue,
      best: best,
      byPosition: byPosition,
      warnings: warnings,
    };
  }

  /**
   * The same sheet as plain text, for the clipboard.
   *
   * Plain text because it has to survive being pasted into a notes app, a
   * group chat, or Sleeper's own search box one name at a time — none of which
   * render HTML, and all of which are more likely to be working than this site
   * is at the moment somebody needs this.
   */
  function sheetText(sheet, meta) {
    meta = meta || {};
    const L = [];
    const pad = (s, n) => (String(s == null ? '' : s) + '                              ').slice(0, n);
    const tag = p => (p.targeted ? '*' : ' ');
    const line = p => pad(p.name, 22) + pad(p.position + (p.team ? ' ' + p.team : ''), 8)
      + pad(p.bye ? 'bye' + p.bye : '', 6) + pad(p.tier ? 'T' + p.tier : '', 4)
      + pad(p.adp == null ? '' : 'adp' + p.adp, 7)
      + (p.survives_to_next == null ? '' : p.survives_to_next + '% there next turn');

    L.push('MFGA DRAFT SHEET' + (meta.title ? ' — ' + meta.title : ''));
    const g = sheet.generated || {};
    L.push('snapshot: pick ' + (g.current_pick || '?') + ', ' + (g.roster_size || 0)
      + ' already on your roster, ' + (g.my_picks_left == null ? '?' : g.my_picks_left) + ' picks left');
    if (meta.myPicks && meta.myPicks.length) L.push('your picks: ' + meta.myPicks.join(', '));
    if (meta.built_at) L.push('board built: ' + meta.built_at);
    L.push('* = target. Percentages are the chance he lasts to your NEXT turn.');
    (sheet.warnings || []).forEach(w => L.push('!! ' + w));

    L.push('', '== YOUR QUEUE (your order — take them top down) ==');
    if (!sheet.queue.length) L.push('  (empty)');
    sheet.queue.forEach(p => {
      if (p.gone) { L.push(pad(p.rank + '.', 4) + '[already drafted]'); return; }
      L.push(pad(p.rank + '.', 4) + tag(p) + line(p));
    });

    L.push('', '== BEST AVAILABLE (the board\'s order) ==');
    sheet.best.forEach((p, i) => L.push(pad((i + 1) + '.', 4) + tag(p) + line(p)));

    sheet.byPosition.forEach(grp => {
      L.push('', '== ' + grp.position + ' ==');
      grp.players.forEach((p, i) => {
        L.push(pad((i + 1) + '.', 4) + tag(p) + line(p));
        if (p.tier_break) L.push('    ---- tier break ----');
      });
    });
    return L.join('\n');
  }

  /**
   * Your own read, applied as a nudge rather than an override.
   *
   * Every drafter has players they want and players they will not touch, and a
   * tool that ignores that gets argued with instead of used. But a star is not
   * an argument — it moves a player up a close call, it does not drag a
   * materially worse one to the top. Do-not-draft is absolute, because that one
   * IS an argument you have already had with yourself.
   */
  function applyPersonalLists(scored, lists) {
    const targets = new Set((lists && lists.targets) || []);
    const avoid = new Set((lists && lists.avoid) || []);
    if (!targets.size && !avoid.size) return scored;

    const kept = scored.filter(s => !avoid.has(s.player.player_id));
    if (avoid.size) {
      kept.forEach(s => { s.avoided_count = scored.length - kept.length; });
    }
    for (const s of kept) {
      if (!targets.has(s.player.player_id)) continue;
      s.score += CFG.TARGET_NUDGE;
      s.targeted = true;
      s.reasons = ['⭐ On your target list'].concat(s.reasons || []);
    }
    kept.sort((a, b) => b.score - a.score);
    return kept;
  }

  /**
   * Plausibility rails — catch model failure instead of shipping it.
   *
   * Eight composite terms, three survival layers and a keeper-option term all
   * interacting means an integration bug produces CONFIDENT nonsense rather
   * than a crash. This codebase has already done exactly that three times: a
   * three-layer survival model computed and discarded, an opportunity join that
   * matched nobody, and a board where every projection was zero. All three
   * passed every test.
   *
   * These rails change nothing. They flag. On draft day nobody notices a subtly
   * wrong number; everybody notices a yellow bar.
   */
  function plausibilityRails(entry, ctx, scored) {
    const flags = [];
    const p = entry.player;
    const adp = p.adjusted_adp || p.raw_adp;
    const pick = ctx.currentPick;

    if (adp && pick && adp - pick > CFG.RAIL_ADP_AHEAD) {
      flags.push('~' + Math.round(adp - pick) + ' picks ahead of ADP — verify before taking');
    }

    const roundsLeft = ctx.roundsLeft == null ? 99 : ctx.roundsLeft;
    if ((p.position === 'K' || p.position === 'DEF') && roundsLeft > CFG.RAIL_LATE_ROUNDS
        && !entry.forced) {
      flags.push(p.position + ' this early is almost never right');
    }

    const limits = (ctx.league || {}).position_limits || {};
    const held = (ctx.roster || []).filter(r => r.position === p.position).length;
    const cap = limits[p.position] != null ? limits[p.position] : CFG.RAIL_DEFAULT_POS_CAP[p.position];
    if (cap != null && held >= cap) {
      flags.push('you already hold ' + held + ' at ' + p.position + ' (cap ' + cap + ')');
    }

    // A component dwarfing the player's whole value is the signature of a bug,
    // not of an insight.
    const comps = entry.components || {};
    const vorp = Math.abs(p.vorp || 0) || 1;
    ['keeper', 'ceiling', 'tier', 'need'].forEach(k => {
      const v = Math.abs(comps[k] || 0);
      if (v > vorp * CFG.RAIL_COMPONENT_RATIO) {
        flags.push(k + ' is ' + (v / vorp).toFixed(1) + 'x this player\'s VORP — possible bug');
      }
    });

    if (scored && scored.length > 1 && entry === scored[0]) {
      const a = scored[0].score, b = scored[1].score;
      if (b > 0 && a / b > CFG.RAIL_RUNAWAY_RATIO) {
        flags.push('top score is ' + (a / b).toFixed(1) + 'x the runner-up — suspicious, not a slam dunk');
      }
    }
    return flags;
  }

  global.DraftEngine = {
    CFG, DEFAULT_WEIGHTS,
    normalCdf, adpSd, survival, runMultipliers, detectRuns,
    expectedBestAvailable, vona,
    tierCliffUrgency, starterSlotMarginal, riskAdjustment, upsideBonus,
    scorePlayer, recommend, mandatoryGaps, applyRosterLegality, plausibilityRails,
    confidence, branchForecast, applyPersonalLists, onTheClock, rosterPlan, byeGrid,
    cheatSheet, sheetText, managerTells, threatBoard,
    WEIGHT_PRESETS, matchPreset, rankDiff, autoWeights,
    formatDefaults, applyFormatDefaults,
    // A2/A3 surfaces, re-exported so callers need only one handle.
    survivalModel: S, compositeTerms: C,
    keeperOptionValue: C.keeperOptionValue, byeCollisionPenalty: C.byeCollisionPenalty,
    correlationAdjustment: C.correlationAdjustment,
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).DraftEngine;
}
