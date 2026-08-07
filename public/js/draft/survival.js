/* A2 — three-layer survival model.
 *
 * VONA is almost entirely a function of what survives the next 11-23 picks, so
 * modelling that window well beats every other accuracy investment in the tool.
 *
 *   Layer 1  ADP baseline               — always available, the long-horizon anchor
 *   Layer 2  roster-need aware          — near horizon, uses who actually picks next
 *   Layer 3  live Bayesian run detection — reacts to the room in real time
 *
 * Layers 1 and 2 blend with a smooth decay past the near horizon; Layer 3 is a
 * hazard multiplier applied to whatever the blend produced.
 *
 * The public entry point is survivalProbability(player, targetPick, ctx). `ctx`
 * is tolerant: pass a bare {POS: multiplier} map and you get Layer 1 + 3 (the
 * pre-refactor behaviour), or a full context and you get all three.
 */
(function (global) {
  'use strict';

  const CFG = {
    DRIFT_MIN_PICKS: 15,        // no correction until the room has shown itself
    DRIFT_DAMPING: 0.6,         // nudge the model, never replace it
    DRIFT_MAX_OFFSET: 12,       // picks
    DRIFT_MAX_SD_SCALE: 1.6,
    DRIFT_EXPECTED_MAD: 8.0,    // MAD a well-calibrated source produces anyway
    // ADP dispersion. A SOURCE-PROVIDED sd always wins; these only apply when
    // the source has none.
    //
    // The rate was 0.22 with no cap, which at adp 100 gave sd 22 — implying
    // meaningful probability of that player going at pick 56 or pick 144. Real
    // mid-round dispersion is roughly half that. Overwide sd flattens every
    // survival curve, which compresses VONA differences and makes the tool
    // systematically UNDER-react to real positional cliffs — the exact failure
    // it exists to prevent.
    //
    // This is the work order's own specified interim (P1.5): reduce the
    // coefficient and add a cap. It is NOT the real fix. The real fix is FFC's
    // published stdev, or a fit against this league's own prior drafts, and
    // both need the networked build. Until then this is a less-wrong constant,
    // and it is labelled as such rather than presented as calibrated.
    ADP_SD_FLOOR: 3.0,          // nobody is unsure about pick 1
    ADP_SD_RATE: 0.15,          // was 0.22 — see above
    ADP_SD_CAP: 15.0,           // beyond this the curve is flat regardless
    NEAR_HORIZON: 24,           // picks over which Layer 2 is fully trusted
    BLEND_DECAY: 12,            // picks over which Layer 2's weight decays past the horizon
    // NOT a temperature — a PRECISION. It multiplies the score gap inside the
    // softmax, so HIGHER means sharper (more mass on the best name) and LOWER
    // means flatter. It was named TEMP and then used as if it were one, which
    // inverted every reacher adjustment below it for as long as this file has
    // existed. Keeping the key so calibration is unchanged; see withinPrecision.
    WITHIN_POS_TEMP: 0.35,      // softmax PRECISION for "which player at this position"
    WITHIN_POS_CANDIDATES: 6,   // how deep to consider inside a position
    // Probability assigned to a player OUTSIDE the candidate pool. Small, but
    // never zero: zero makes Layer 2 assert survival of exactly 1.0, which is
    // the model claiming certainty about a room that can draft anyone.
    WITHIN_POS_TAIL_P: 0.01,
    DEFAULT_ALPHA_NEED: 1.0,    // league-average manager: need weight
    DEFAULT_BETA_VALUE: 1.0,    // league-average manager: value weight
    K_DST_FORCED_ROUNDS: 2,     // K/DST become forced picks in the final N rounds

    // --- what his own past drafts say he does next (A1 -> prediction) ------
    // The profiles carried six new sequence-aware patterns and none of them
    // reached the prediction: they were analysis you could read, not a model
    // that acted. These wire them in as BOUNDED TILTS on the base
    // distribution — never overrides. Three drafts is three drafts, and a
    // tendency that can dominate a live board is a tendency that will be
    // spectacularly wrong once in front of you.
    //
    // Every one of them multiplies toward 1.0 as evidence thins, via the
    // profile's own shrinkage_weight, so a manager with one prior draft moves
    // the answer a third as far as one with many.
    TENDENCY_STRENGTH: 0.35,    // max +/- from "when does he take this position"
    TENDENCY_SIGMA: 1.5,        // rounds of tolerance around his usual round
    TENDENCY_ERRATIC: 0.4,      // scale when his rounds are all over the place
    BUCKET_BLEND: 0.25,         // weight on his observed early/mid/late mix
    OPENING_BOOST: 0.5,         // extra tilt in rounds 1-2 when he repeats a shape
    RUN_FOLLOW_MARGIN: 0.1,     // how far past league average counts as a follower
    RUN_FOLLOW_MAX: 0.5,        // max extra tilt toward a position that is running
    // A man who has taken the same player in two prior drafts will take him
    // again above market. Three straight years is not a coincidence.
    AFFINITY: { 2: 1.7, 3: 2.4, 4: 3.0 },
    RUN_WINDOW: 10,
    RUN_DAMPING: 0.5,
    RUN_MIN: 0.6,
    RUN_MAX: 1.8,
    RUN_BANNER_AT: 1.4,
    // Significance gate on run detection. Below RUN_Z_MIN standard deviations
    // the observation is indistinguishable from chance and the multiplier stays
    // exactly 1.0; it ramps to full effect at RUN_Z_FULL. 1.5 sigma is roughly
    // a one-in-seven false-positive rate per position per window, which is the
    // most noise worth tolerating before the banner stops meaning anything.
    RUN_Z_MIN: 1.5,
    RUN_Z_FULL: 3.0,
  };

  // How badly an empty slot at this position bites, by round. Index is a
  // fraction of the draft elapsed (0 = round 1, 1 = final round).
  // An empty QB slot in round 8 is urgent; an empty K slot is not until the end.
  const URGENCY = {
    QB:  [0.35, 0.55, 0.95, 1.10, 1.15],
    RB:  [1.20, 1.15, 1.00, 0.85, 0.60],
    WR:  [1.15, 1.15, 1.00, 0.85, 0.60],
    TE:  [0.55, 0.80, 1.05, 1.10, 1.00],
    K:   [0.02, 0.02, 0.05, 0.30, 2.50],
    DEF: [0.03, 0.03, 0.08, 0.40, 2.20],
  };

  function urgency(position, progress) {
    const curve = URGENCY[position] || [1, 1, 1, 1, 1];
    const idx = Math.min(curve.length - 1, Math.max(0, Math.floor(progress * curve.length)));
    return curve[idx];
  }

  // ---- shared math ----
  function erf(x) {
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
  function adpSd(adpMean, provided) {
    if (provided && provided > 0) return provided;
    return Math.min(CFG.ADP_SD_CAP,
                    Math.max(CFG.ADP_SD_FLOOR, CFG.ADP_SD_RATE * adpMean));
  }
  const adpOf = p => p.adjusted_adp || p.raw_adp || 9999;

  // ================================== Global ADP drift (Part 6 §6) ==========
  //
  // Layer 3 detects POSITIONAL runs. It cannot see that this entire room drafts
  // differently from the ADP source — which a keeper league with a re-fitted
  // ADP is exactly where you would expect. If every pick lands six slots ahead
  // of ADP, every survival curve is optimistic and nothing in the model says so.
  //
  // Two separable signals:
  //   signed  — the room is systematically early or late  -> recentre
  //   absolute— the room is simply less predictable        -> widen sd
  //
  // Both damped, both requiring a real sample first. A room is allowed to look
  // unusual for ten picks without the model rewriting itself.
  function adpDrift(observed) {
    const rows = (observed || []).filter(
      o => o && o.pick_no != null && o.adp != null && o.adp < 9999);
    const n = rows.length;
    if (n < CFG.DRIFT_MIN_PICKS) {
      return { n, applied: false, offset: 0, sdScale: 1, message: null };
    }
    let sumSigned = 0, sumAbs = 0;
    rows.forEach(o => {
      const d = o.pick_no - o.adp;
      sumSigned += d;
      sumAbs += Math.abs(d);
    });
    const meanSigned = sumSigned / n;
    const mad = sumAbs / n;

    // Damp toward zero, and cap: drift correction should nudge the model, never
    // replace it.
    const offset = Math.max(-CFG.DRIFT_MAX_OFFSET, Math.min(CFG.DRIFT_MAX_OFFSET,
      meanSigned * CFG.DRIFT_DAMPING));
    // A perfectly calibrated source still produces MAD ≈ 0.8 × sd. Anything
    // beyond that is this room being genuinely noisier than the source implies.
    const expectedMad = CFG.DRIFT_EXPECTED_MAD;
    const sdScale = Math.max(1, Math.min(CFG.DRIFT_MAX_SD_SCALE,
      1 + ((mad / expectedMad) - 1) * CFG.DRIFT_DAMPING));

    let message = null;
    if (Math.abs(offset) >= 1.5) {
      message = 'This room is drafting ' + Math.abs(Math.round(meanSigned))
        + ' picks ' + (meanSigned < 0 ? 'ahead of' : 'behind') + ' ADP on average'
        + ' — survival estimates recentred.';
    }
    if (sdScale > 1.15) {
      message = (message ? message + ' ' : '')
        + 'Picks are ' + ((sdScale - 1) * 100).toFixed(0) + '% less predictable than '
        + 'the ADP source implies — survival curves widened.';
    }
    return { n, applied: true, offset, sdScale, meanSigned, mad, message };
  }

  /** ADP for survival maths, recentred by observed room drift. */
  function effectiveAdp(p, ctx) {
    const d = ctx && ctx.drift;
    return adpOf(p) + (d && d.applied ? d.offset : 0);
  }
  function effectiveSd(p, ctx) {
    const d = ctx && ctx.drift;
    return adpSd(adpOf(p), p.adp_sd) * (d && d.applied ? d.sdScale : 1);
  }

  // =============================================== Layer 1 — ADP baseline
  function layer1Taken(player, pick, ctx) {
    return normalCdf(pick, effectiveAdp(player, ctx), effectiveSd(player, ctx));
  }

  /**
   * Layer 1, conditioned on the player still being on the board right now.
   *
   * This conditioning is not cosmetic. Layer 2 only models the picks between
   * here and the target, so it is inherently conditional on current
   * availability. Blending it against an *unconditional* Layer 1 mixes two
   * different quantities and miscalibrates every survival number the tool
   * produces. Bayes:  P(taken by n | survived to c) = (F(n) - F(c)) / (1 - F(c))
   */
  function layer1TakenGivenAvailable(player, pick, currentPick, ctx) {
    const fN = layer1Taken(player, pick, ctx);
    if (currentPick == null || currentPick <= 0) return fN;
    const fC = layer1Taken(player, currentPick, ctx);
    if (fC >= 0.999) return 1;           // he should already be gone; treat as gone
    return Math.max(0, Math.min(1, (fN - fC) / (1 - fC)));
  }

  // ==================================== Layer 2 — roster-need-aware model
  /**
   * P(this team takes this position with this pick).
   * softmax( α × need(t,p) + β × bestAvailableValue(p) ) per the spec.
   */
  /* ── Turning a manager's history into a prediction ────────────────────────
   *
   * All of this is bounded and multiplicative on the base distribution. None of
   * it can force a position to certainty, and all of it collapses to 1.0 (a
   * no-op) when the profile is absent, thin, or says nothing distinctive —
   * which is the common case and should be.
   */

  /** How far into the draft a given overall pick is, in rounds (1-indexed). */
  function roundOf(pickNo, teams) {
    if (!pickNo || !teams) return null;
    return Math.floor((pickNo - 1) / teams) + 1;
  }

  /**
   * "He takes his first TE in round 6, every year."
   *
   * Peaks at his usual round and falls away either side, so a position is
   * suppressed before he has ever taken one and boosted when he is due. Scaled
   * down hard when his own rounds are scattered — a mean of round 4 built from
   * 1, 4 and 7 is an artefact, and predicting round 4 from it is false
   * precision dressed as insight.
   */
  function tendencyTilt(profile, pos, round) {
    if (!profile || !round) return 1;
    const t = (profile.positional_timing || {})[pos];
    if (!t || t.mean_round == null) return 1;
    const cons = ((profile.draft_patterns || {}).consistency || {})[pos];
    let strength = CFG.TENDENCY_STRENGTH * (profile.shrinkage_weight == null ? 1 : profile.shrinkage_weight);
    if (cons && cons.predictable === false) strength *= CFG.TENDENCY_ERRATIC;
    const d = round - t.mean_round;
    const bell = Math.exp(-(d * d) / (2 * CFG.TENDENCY_SIGMA * CFG.TENDENCY_SIGMA));
    return Math.max(0.1, 1 + strength * (2 * bell - 1));
  }

  /** His observed positional mix in this stretch of the draft. */
  function bucketMix(profile, round) {
    const b = (profile && profile.draft_patterns || {}).by_round_bucket;
    if (!b || !round) return null;
    const name = round <= 3 ? 'early' : (round <= 8 ? 'mid' : 'late');
    const block = b[name];
    return block && block.mix && Object.keys(block.mix).length ? block.mix : null;
  }

  /**
   * Rounds 1-2 only: a repeated opening shape is the strongest single signal in
   * the profile, because it is a decision he has made the same way every year
   * with the whole board in front of him.
   */
  function openingTilt(profile, pos, round) {
    const op = (profile && profile.draft_patterns || {}).openings;
    if (!op || !op.repeats || !op.most_common_open || !round || round > 2) return 1;
    const seq = String(op.most_common_open).split('-');
    const want = seq[round - 1];
    if (!want) return 1;
    const w = (profile.shrinkage_weight == null ? 1 : profile.shrinkage_weight);
    return want === pos ? 1 + CFG.OPENING_BOOST * w : Math.max(0.4, 1 - CFG.OPENING_BOOST * w * 0.5);
  }

  /**
   * A follower takes what is already going; a contrarian is the reason your run
   * detection is wrong about one seat. Measured against the league rate, not an
   * absolute, because in a 10-team league everybody follows runs somewhat.
   */
  function runFollowTilt(profile, pos, runMults) {
    const rf = (profile && profile.draft_patterns || {}).run_following;
    if (!rf || rf.rate == null || rf.league_rate == null) return 1;
    const mult = (runMults || {})[pos];
    if (!mult || mult <= 1) return 1;          // this position is not running
    const edge = rf.rate - rf.league_rate;
    if (Math.abs(edge) < CFG.RUN_FOLLOW_MARGIN) return 1;
    const w = (profile.shrinkage_weight == null ? 1 : profile.shrinkage_weight);
    // Scale by how hot the run is, so a mild multiplier gets a mild tilt.
    const heat = Math.min(1, (mult - 1) / 0.8);
    const tilt = Math.max(-CFG.RUN_FOLLOW_MAX, Math.min(CFG.RUN_FOLLOW_MAX, edge * 2)) * heat * w;
    return Math.max(0.4, 1 + tilt);
  }

  /**
   * He has drafted this exact man before. Twice is a preference; three straight
   * years is a man who will pay over the odds for him again, and no projection
   * knows that.
   */
  function affinityMultiplier(profile, playerId) {
    const rt = (profile && profile.draft_patterns || {}).repeat_targets;
    if (!rt || !rt.length || playerId == null) return 1;
    const hit = rt.find(r => String(r.player_id) === String(playerId));
    if (!hit) return 1;
    const base = CFG.AFFINITY[Math.min(4, hit.times)] || 1;
    const w = (profile.shrinkage_weight == null ? 1 : profile.shrinkage_weight);
    return 1 + (base - 1) * w;
  }

  /** Why a seat's distribution was tilted, in words, for the UI to show. */
  function tendencyReasons(profile, pos, round, runMults) {
    const out = [];
    if (openingTilt(profile, pos, round) > 1.05) {
      out.push('opens ' + (profile.draft_patterns.openings.most_common_open) + ' most years');
    }
    const t = (profile && profile.positional_timing || {})[pos];
    if (t && round && Math.abs(round - t.mean_round) <= CFG.TENDENCY_SIGMA) {
      out.push('usually takes his first ' + pos + ' around round ' + t.mean_round.toFixed(1));
    }
    if (runFollowTilt(profile, pos, runMults) > 1.05) out.push('follows runs more than most');
    return out;
  }

  function positionProbabilities(team, board, ctx) {
    const league = ctx.league || {};
    const starters = league.starters || {};
    const progress = ctx.progress == null ? 0.5 : ctx.progress;
    const roster = team.roster || [];
    const profile = team.profile || null;
    const alpha = profile && profile.softmax ? profile.softmax.alpha_need : CFG.DEFAULT_ALPHA_NEED;
    const beta = profile && profile.softmax ? profile.softmax.beta_value : CFG.DEFAULT_BETA_VALUE;

    // Best available VORP per position, normalised so β is scale-free.
    // With fractional availability this is an EXPECTATION, not a max: walking
    // the position in value order, each player contributes his VORP weighted by
    // the chance he is the best one still there — i.e. he is available and
    // everyone above him is not.
    const bestByPos = ctx.bestByPos || (function () {
      const out = {};
      board.forEach(p => {
        const v = p.vorp == null ? 0 : p.vorp;
        if (out[p.position] == null || v > out[p.position]) out[p.position] = v;
      });
      return out;
    })();
    const vals = Object.values(bestByPos);
    const maxV = vals.length ? Math.max.apply(null, vals) : 1;
    const minV = vals.length ? Math.min.apply(null, vals) : 0;
    const span = Math.max(1e-6, maxV - minV);

    const utility = {};
    Object.keys(bestByPos).forEach(pos => {
      const filled = roster.filter(r => r.position === pos).length;
      const empty = Math.max(0, (starters[pos] || 0) - filled);
      let need = empty * urgency(pos, progress);

      // Flex slots create real need for their eligible positions once dedicated
      // slots are full — otherwise a 2-RB roster looks "done" at RB in round 5.
      const flexEligible = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'] };
      Object.keys(flexEligible).forEach(slot => {
        if (!starters[slot] || flexEligible[slot].indexOf(pos) === -1) return;
        const eligibleOnRoster = roster.filter(r => flexEligible[slot].indexOf(r.position) !== -1).length;
        const dedicated = flexEligible[slot].reduce((s, q) => s + (starters[q] || 0), 0);
        if (eligibleOnRoster < dedicated + starters[slot]) need += 0.5 * urgency(pos, progress);
      });

      // Endgame: K/DST stop being optional in the last couple of rounds.
      if ((pos === 'K' || pos === 'DEF') && ctx.roundsLeft != null
          && ctx.roundsLeft <= CFG.K_DST_FORCED_ROUNDS && empty > 0) {
        need += 4.0;
      }
      // Once starters are full the board shifts to upside and handcuffs, so
      // value dominates need rather than need going to zero.
      const starterHoles = Object.keys(starters).reduce((s, k) => {
        if (flexEligible[k]) return s;
        return s + Math.max(0, (starters[k] || 0) - roster.filter(r => r.position === k).length);
      }, 0);
      const needWeight = starterHoles === 0 ? 0.35 : 1.0;

      const value = (bestByPos[pos] - minV) / span;
      utility[pos] = alpha * need * needWeight + beta * value;
    });

    // softmax
    const keys = Object.keys(utility);
    if (!keys.length) return {};
    const max = Math.max.apply(null, keys.map(k => utility[k]));
    let sum = 0;
    const out = {};
    keys.forEach(k => { const e = Math.exp(utility[k] - max); out[k] = e; sum += e; });
    keys.forEach(k => { out[k] /= sum; });

    // ---- what his own past drafts say -------------------------------------
    // Applied AFTER the softmax, as bounded multipliers on a proper
    // distribution, then renormalised. Doing it inside the utility would let a
    // tendency compound with the exponential and run away.
    const round = roundOf(team.pick_no, (league.teams || 10));
    if (profile && round) {
      const mix = bucketMix(profile, round);
      let total = 0;
      keys.forEach(k => {
        let m = tendencyTilt(profile, k, round)
              * openingTilt(profile, k, round)
              * runFollowTilt(profile, k, ctx.runMultipliers);
        // His observed mix for this stretch, blended rather than substituted:
        // it is a rate over a few dozen picks, not a law.
        if (mix) {
          const obs = mix[k] || 0;
          m *= (1 - CFG.BUCKET_BLEND) + CFG.BUCKET_BLEND * (obs / Math.max(1e-6, 1 / keys.length));
        }
        out[k] = Math.max(0, out[k] * m);
        total += out[k];
      });
      if (total > 0) keys.forEach(k => { out[k] /= total; });
    }
    return out;
  }

  /**
   * Expected best-available VORP per position, given fractional availability.
   *
   * Sorted descending by value, player j is the best available with probability
   * avail_j × Π_{k<j}(1 − avail_k). The leftover mass (everyone gone) scores
   * zero, which is correct — a position picked clean is worth nothing.
   */
  function expectedBestByPos(board, avail) {
    const byPos = {};
    for (let i = 0; i < board.length; i++) {
      const p = board[i];
      (byPos[p.position] || (byPos[p.position] = [])).push(
        { v: p.vorp == null ? 0 : p.vorp, a: avail[i] == null ? 1 : avail[i] });
    }
    const out = {};
    Object.keys(byPos).forEach(pos => {
      const list = byPos[pos].sort((x, y) => y.v - x.v);
      let remaining = 1, exp = 0;
      for (let i = 0; i < list.length && remaining > 1e-6; i++) {
        const a = Math.max(0, Math.min(1, list[i].a));
        exp += remaining * a * list[i].v;
        remaining *= (1 - a);
      }
      out[pos] = exp;
    });
    return out;
  }

  /** P(this specific player is the one taken, given the position is taken). */
  /**
   * How sharply a manager's pick concentrates on the best name at a position.
   *
   * THE BUG THIS FIXES. The constant is a precision, not a temperature: it
   * MULTIPLIES the score gap inside exp(), so a larger value puts MORE mass on
   * the top player. Both call sites raised it for a reacher while a comment two
   * lines above said "a reacher spreads probability down the list" — so every
   * reacher in the league has been modelled as MORE predictable than average,
   * exactly backwards, feeding wrong survival percentages into every
   * recommendation the tool has ever made.
   *
   * Nothing failed, because nothing tested it. That is the same shape as the
   * three integration bugs the plausibility rails exist to catch.
   *
   * Now signed and inverted, so it means what the sentence means:
   *   reaches above market  -> lower precision -> flatter -> harder to predict
   *   lets value come to him -> higher precision -> he takes the best name
   * A league-average manager (delta 0) lands on exactly CFG.WITHIN_POS_TEMP,
   * so behaviour for an unprofiled seat is unchanged.
   */
  function withinPrecision(team) {
    const rd = team && team.profile && team.profile.reach_delta;
    if (!rd || rd.mean == null) return CFG.WITHIN_POS_TEMP;
    return Math.max(0.15, Math.min(0.9, CFG.WITHIN_POS_TEMP - 0.02 * rd.mean));
  }

  function withinPositionProbability(player, board, team) {
    const pool = board.filter(p => p.position === player.position)
      .sort((a, b) => (b.vorp || b.proj_mean || 0) - (a.vorp || a.proj_mean || 0))
      .slice(0, CFG.WITHIN_POS_CANDIDATES);
    if (!pool.length) return 0;
    const idx = pool.findIndex(p => String(p.player_id) === String(player.player_id));
    if (idx === -1) return CFG.WITHIN_POS_TAIL_P;   // see withinFromPool

    const temp = withinPrecision(team);
    const scores = pool.map(p => (p.vorp == null ? p.proj_mean || 0 : p.vorp));
    const max = Math.max.apply(null, scores);
    let sum = 0;
    // A man he has drafted before is not just another name at the position.
    const exps = scores.map((s, i) => {
      const e = Math.exp((s - max) * temp / 10)
        * affinityMultiplier(team && team.profile, pool[i].player_id);
      sum += e;
      return e;
    });
    return sum > 0 ? exps[idx] / sum : 0;
  }

  /**
   * P(taken before targetPick) from the picks that actually happen in between.
   * ctx.intervening: [{team_slot, roster, profile, pick_no}] in pick order.
   */
  /**
   * Everything about the intervening picks that does not depend on which player
   * we are scoring: each pick's positional distribution and the top candidates
   * per position on the board as it thins.
   *
   * Computed once per (currentPick, targetPick) and memoised on the context.
   * Without this, scoring a 200-player board with a 24-pick window is
   * ~30M inner operations per render — far too slow to use live.
   */
  function precomputeLayer2(targetPick, ctx) {
    const intervening = (ctx.intervening || []).filter(
      t => t.pick_no >= (ctx.currentPick || 0) && t.pick_no < targetPick);
    if (!intervening.length) return null;

    const key = (ctx.currentPick || 0) + ':' + targetPick;
    ctx.__l2cache = ctx.__l2cache || {};
    if (ctx.__l2cache[key] !== undefined) return ctx.__l2cache[key];

    const windowEnd = Math.min(targetPick,
      Math.max.apply(null, intervening.map(t => t.pick_no)) + 1);

    // EXPECTED (fractional) thinning.
    //
    // The board is not advanced by deleting the modal pick. Greedy removal
    // takes exactly one player per pick and always the same one, which
    // corrupts what each p_i is conditioned on and biases the whole window
    // toward whichever position happened to look hottest at step 1.
    //
    // Instead every candidate's availability is decremented by his probability
    // of being taken at that pick:
    //
    //     avail[j] <- avail[j] * (1 - P(pick i takes j))
    //
    // Same loop, no branching, and it removes the right amount of board mass
    // in expectation rather than a whole player in one arbitrary place.
    const board = (ctx.board || []).slice();
    const avail = new Array(board.length).fill(1);
    const idxOf = new Map();
    for (let j = 0; j < board.length; j++) idxOf.set(board[j], j);

    // Per-position value ordering, computed once: the board no longer shrinks,
    // so the ordering is fixed and only the availability over it changes.
    const orderByPos = {};
    for (let j = 0; j < board.length; j++) {
      (orderByPos[board[j].position] || (orderByPos[board[j].position] = [])).push(j);
    }
    const valOf = j => (board[j].vorp == null ? board[j].proj_mean || 0 : board[j].vorp);
    Object.keys(orderByPos).forEach(pos => orderByPos[pos].sort((a, b) => valOf(b) - valOf(a)));

    const steps = [];
    for (let i = 0; i < intervening.length; i++) {
      const team = intervening[i];
      const posProbs = positionProbabilities(team, board, {
        league: ctx.league,
        progress: ctx.totalPicks ? team.pick_no / ctx.totalPicks : 0.5,
        roundsLeft: ctx.roundsLeft,
        bestByPos: expectedBestByPos(board, avail),
      });

      // Candidate pool per position, in value order. The depth is measured in
      // EXPECTED players, not slots: keep taking until the availabilities sum
      // to WITHIN_POS_CANDIDATES. Under greedy thinning the board physically
      // shrank, so the window slid down on its own; with fractional thinning it
      // does not, and a fixed top-N would keep re-offering the same decayed
      // names while the player who is actually next up never enters the pool.
      const topByPos = {}, availAt = {};
      Object.keys(orderByPos).forEach(pos => {
        const order = orderByPos[pos];
        const pool = [], weights = [];
        let mass = 0;
        for (let k = 0; k < order.length && mass < CFG.WITHIN_POS_CANDIDATES
                        && pool.length < CFG.WITHIN_POS_CANDIDATES * 4; k++) {
          const j = order[k];
          if (avail[j] <= 1e-4) continue;
          pool.push(board[j]);
          weights.push(avail[j]);
          mass += avail[j];
        }
        if (pool.length) { topByPos[pos] = pool; availAt[pos] = weights; }
      });

      steps.push({ posProbs, topByPos, team, availAt });

      // Decrement in expectation.
      Object.keys(topByPos).forEach(pos => {
        const pPos = posProbs[pos] || 0;
        if (pPos <= 0) return;
        const pool = topByPos[pos];
        for (let k = 0; k < pool.length; k++) {
          const j = idxOf.get(pool[k]);
          const pTaken = pPos * withinFromPool(pool[k], pool, team, availAt[pos]);
          avail[j] *= (1 - Math.max(0, Math.min(1, pTaken)));
        }
      });
    }

    const out = { steps, windowEnd };
    ctx.__l2cache[key] = out;
    return out;
  }

  /** P(this specific player, given his position is taken) from a precomputed pool.
   *  `avail` (optional) weights each candidate by how likely he is still there. */
  function withinFromPool(player, pool, team, avail) {
    if (!pool || !pool.length) return 0;
    let idx = -1;
    for (let i = 0; i < pool.length; i++) {
      if (String(pool[i].player_id) === String(player.player_id)) { idx = i; break; }
    }
    if (idx === -1) {
      // NOT ZERO. Zero here means "no simulated pick can ever take this man",
      // and Layer 2 then reports survival of EXACTLY 1.0 — the model asserting
      // certainty about a real room that can take anyone.
      //
      // Observed on the real board: the top 7 defences graded smoothly from
      // 0.915 to 0.960 and every defence below them returned exactly 1.000000,
      // a cliff at the candidate-pool boundary rather than anywhere in the
      // data. The same boundary sits in the middle of every position, which is
      // exactly the mid-round region VONA works in.
      //
      // A small floor is not a model of the tail — it is a refusal to claim
      // certainty. Anyone outside the pool is unlikely to be taken, not unable.
      return CFG.WITHIN_POS_TAIL_P;
    }
    const temp = withinPrecision(team);
    let max = -Infinity;
    const scores = pool.map(p => {
      const v = p.vorp == null ? p.proj_mean || 0 : p.vorp;
      if (v > max) max = v;
      return v;
    });
    let sum = 0;
    // Availability weights the softmax: a player who is 20% likely to still be
    // on the board contributes 20% of the mass he would if he were certain.
    const exps = scores.map((v, i) => {
      const w = avail ? Math.max(0, Math.min(1, avail[i] == null ? 1 : avail[i])) : 1;
      const e = w * Math.exp((v - max) * temp / 10)
        * affinityMultiplier(team && team.profile, pool[i].player_id);
      sum += e;
      return e;
    });
    return sum > 0 ? exps[idx] / sum : 0;
  }

  /**
   * P(taken before targetPick) from the picks that actually happen in between.
   * ctx.intervening: [{team_slot, roster, profile, pick_no}] in pick order.
   */
  function layer2Taken(player, targetPick, ctx) {
    const pre = precomputeLayer2(targetPick, ctx);
    if (!pre) return null;
    let survives = 1;
    for (let i = 0; i < pre.steps.length; i++) {
      const step = pre.steps[i];
      const pPos = step.posProbs[player.position] || 0;
      if (!pPos) continue;
      const pWithin = withinFromPool(player, step.topByPos[player.position], step.team,
        step.availAt && step.availAt[player.position]);
      survives *= (1 - pPos * pWithin);
    }
    return { taken: 1 - survives, windowEnd: pre.windowEnd };
  }

  // ======================== Layer 3 — live Bayesian run detection (hazard) ====
  function runMultipliers(recentPicks, board, currentPick) {
    const out = {};
    if (!recentPicks || recentPicks.length < 4) return out;
    const window = recentPicks.slice(-CFG.RUN_WINDOW);
    const n = window.length;

    const observed = {};
    window.forEach(p => { observed[p.position] = (observed[p.position] || 0) + 1; });

    const start = currentPick - n;
    const expected = {};
    let expTotal = 0;
    (board || []).forEach(pl => {
      const mass = normalCdf(currentPick, adpOf(pl), adpSd(adpOf(pl), pl.adp_sd))
        - normalCdf(start, adpOf(pl), adpSd(adpOf(pl), pl.adp_sd));
      if (mass > 0) {
        expected[pl.position] = (expected[pl.position] || 0) + mass;
        expTotal += mass;
      }
    });

    Object.keys(observed).forEach(pos => {
      const obsRate = observed[pos] / n;
      const expRate = expTotal > 0 ? (expected[pos] || 0) / expTotal : obsRate;
      if (expRate <= 0.01) return;

      // SIGNIFICANCE GATE.
      //
      // Over a 10-pick window an expectation of 3 RBs and an observation of 6
      // is a 2x ratio that happens by chance constantly. Ungated, the ratio
      // alone moved the multiplier and threw a banner — training the user to
      // react to noise, which is worse than not detecting runs at all.
      //
      // Model the count as Binomial(n, expRate) and ask how many standard
      // deviations the observation actually is. Below RUN_Z_MIN the multiplier
      // stays exactly 1.0; between RUN_Z_MIN and RUN_Z_FULL it ramps in
      // linearly, so detection arrives smoothly rather than switching on.
      const sd = Math.sqrt(n * expRate * (1 - expRate));
      const z = sd > 1e-9 ? (observed[pos] - expRate * n) / sd : 0;
      const gate = Math.max(0, Math.min(1,
        (Math.abs(z) - CFG.RUN_Z_MIN) / Math.max(1e-6, CFG.RUN_Z_FULL - CFG.RUN_Z_MIN)));
      if (gate <= 0) { out[pos] = 1; return; }

      const raw = 1 + CFG.RUN_DAMPING * (obsRate / expRate - 1) * gate;
      out[pos] = Math.max(CFG.RUN_MIN, Math.min(CFG.RUN_MAX, raw));
      // Diagnostics ride along non-enumerably: callers iterate this map with
      // Object.values() and expect every entry to be a multiplier.
      if (!Object.getOwnPropertyDescriptor(out, 'z')) {
        Object.defineProperty(out, 'z', { value: {}, enumerable: false });
      }
      out.z[pos] = z;
    });
    return out;
  }

  function detectRuns(mults) {
    return Object.keys(mults || {})
      .filter(pos => mults[pos] >= CFG.RUN_BANNER_AT)
      .sort((a, b) => mults[b] - mults[a]);
  }

  // ============================================================ the blend ====
  function normalizeCtx(ctx) {
    if (!ctx) return { runMultipliers: {} };
    // A bare {RB: 1.4} map is the pre-refactor call signature.
    const looksLikeMultiplierMap = Object.keys(ctx).length > 0
      && Object.keys(ctx).every(k => typeof ctx[k] === 'number');
    if (looksLikeMultiplierMap) return { runMultipliers: ctx };
    return ctx;
  }

  /** Weight on Layer 2: full inside the near horizon, decaying smoothly past it. */
  function layer2Weight(picksAway) {
    if (picksAway <= CFG.NEAR_HORIZON) return 1;
    return Math.exp(-(picksAway - CFG.NEAR_HORIZON) / CFG.BLEND_DECAY);
  }

  /** THE public entry point. P(player is still on the board at targetPick). */
  function survivalProbability(player, targetPick, rawCtx) {
    const ctx = normalizeCtx(rawCtx);
    // Both layers must answer the same question: "given he is available now,
    // is he still there at targetPick?"
    const t1 = ctx.currentPick != null
      ? layer1TakenGivenAvailable(player, targetPick, ctx.currentPick, ctx)
      : layer1Taken(player, targetPick, ctx);

    let taken = t1;
    let layers = ['adp'];
    if (ctx.intervening && ctx.intervening.length) {
      const l2 = layer2Taken(player, targetPick, ctx);
      if (l2 != null) {
        // Compose, don't blend across mismatched ranges. Layer 2 owns the window
        // it modelled; Layer 1 carries the remainder, conditioned on surviving
        // that window. Survival is then a product of survivals, which is both
        // correct and monotone in targetPick by construction.
        const cur = ctx.currentPick || 0;
        const picksAway = l2.windowEnd - cur;
        const w = layer2Weight(picksAway);
        // ctx was missing on this call and the one below, so effectiveAdp and
        // effectiveSd fell back to raw ADP: the global drift correction and any
        // provided sd were silently dropped inside the Layer-2 path — the exact
        // path that runs whenever a draft is live.
        const t1Window = layer1TakenGivenAvailable(player, l2.windowEnd, cur, ctx);
        const takenInWindow = w * l2.taken + (1 - w) * t1Window;
        const survivesWindow = 1 - takenInWindow;
        // Remainder: P(taken between windowEnd and targetPick | survived to windowEnd)
        const takenAfter = layer1TakenGivenAvailable(player, targetPick, l2.windowEnd, ctx);
        taken = 1 - survivesWindow * (1 - takenAfter);
        layers = l2.windowEnd >= targetPick ? ['need'] : ['need→adp'];
      }
    }

    const mult = (ctx.runMultipliers || {})[player.position];
    if (mult && mult !== 1) {
      // Scale the hazard, not the probability, so a 1.8x-hot position can never
      // produce a >100% chance of being gone.
      taken = 1 - Math.pow(1 - taken, mult);
      layers.push('run');
    }
    const p = Math.max(0, Math.min(1, 1 - taken));
    survivalProbability.lastLayers = layers;
    return p;
  }

  const api = { expectedBestByPos, adpDrift, effectiveAdp, effectiveSd,
    CFG, URGENCY, urgency,
    normalCdf, adpSd,
    layer1Taken, layer1TakenGivenAvailable, layer2Taken, precomputeLayer2,
    positionProbabilities, withinPositionProbability, withinFromPool,
    runMultipliers, detectRuns, layer2Weight, withinPrecision,
    roundOf, tendencyTilt, bucketMix, openingTilt, runFollowTilt,
    affinityMultiplier, tendencyReasons,
    survivalProbability,
  };
  global.DraftSurvival = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
