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
    ADP_SD_RATE: 0.15,          // was 0.22 — see above. GRADED against 219
                                // published dispersions 2026-08-14: measures 0.11. HELD, see keepers.py.
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
    /* ── THE MEASURED ROOM, AS A BASE RATE — GATED, SHIPS OFF ──────────────
     * draft/backtest/draft_behavior.py forward-tested the room's 2023-24
     * behavior against its 2025 draft (preregistered in
     * draft/audit/draft_behavior_2026-08-15.md §2; both criteria passed). The
     * decomposition is the part that matters: the LEAGUE-level bucket mix +
     * need term carried the win (position log-loss 1.408 vs 1.479 base), and
     * the PER-OWNER term made it strictly worse (1.428) — owner signatures do
     * not detectably persist year over year (mean rho 0.074, perm p=0.56).
     * So this switch feeds the LEAGUE prior only, never per-owner terms.
     *
     * OFF BY DEFAULT (the STAGE2_CAP / VONA_SLOT_AWARE pattern): shipping it
     * on would be a silent behavior change; the flip is Cory's call via
     * DECISIONS-NEEDED.md, with the applied-vs-shipped delta measured by
     * draft/tools/room_prior_measure.js and recorded in the audit doc. */
    ROOM_MIX_PRIOR: false,
    // Blend weight when ON. Deliberately the SAME magnitude as BUCKET_BLEND
    // above (0.25) — the existing "his observed mix is a rate, not a law"
    // weight — rather than a new tuned constant.
    ROOM_MIX_W: 0.25,
    RUN_WINDOW: 10,
    /* THE "SAFE" THRESHOLD THE LRM STRIP COMMITS TO. Lived as a bare 0.85 inside
     * `lrmLastSafe` in app.js, which meant the grader had to carry its own copy
     * of the number it grades against — the two would agree until somebody tuned
     * one. It is the strip's only quantitative claim, so it belongs where both
     * the claim and its resolution can read it. */
    LRM_SAFE_P: 0.85,
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

  /* THE ROOM'S MEASURED POSITIONAL MIX BY ROUND BUCKET — 377 non-keeper
   * decisions, 2023-25, keeper-corrected (2023's flags live in a parallel
   * draft; a flag-only count silently includes 30 keeper placements).
   *
   * Copied from draft/data/draft_behavior.json `league_bucket_mix` and
   * DRIFT-GUARDED: room_prior.test.js re-reads the artifact and fails if these
   * numbers no longer match it, so the copy cannot rot silently (the no-retype
   * rule, enforced by a test rather than a comment).
   *
   * Buckets are the ARTIFACT's: early r1-3, mid r4-9, late r10-15. Note the
   * artifact's mid boundary (<=9) differs from bucketMix's profile boundary
   * (<=8) above — the prior uses the boundary its own data was measured on.
   * `early` is n=18 (rounds 1-3 are keeper rounds in this league), so the
   * prior is thin exactly where 2026's board will also be keeper-dominated;
   * mid and late carry n=178 and n=180. Consumed ONLY behind
   * CFG.ROOM_MIX_PRIOR (ships false). */
  const LEAGUE_MIX = {
    early: { QB: 0.0556, RB: 0.5,    WR: 0.4444, TE: 0,      K: 0,      DEF: 0 },
    mid:   { QB: 0.1067, RB: 0.3202, WR: 0.4438, TE: 0.1236, K: 0,      DEF: 0.0056 },
    late:  { QB: 0.1222, RB: 0.2556, WR: 0.2111, TE: 0.0833, K: 0.1722, DEF: 0.1556 },
  };

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

  /* ⚠️ BOARD SLOTS AND SELECTIONS ARE TWO SCALES AND THIS FILE USED ONLY ONE.
   *
   * `adpOf` returns `adjusted_adp`, which counts SELECTIONS — keepers.py maps
   * market ADP onto the live sequence, with kept players removed from the
   * numbering. Every pick number handed to this module is a BOARD SLOT, keeper
   * slots included. They were compared directly.
   *
   * keepers.py already has the converter and REFUSES rather than defaulting:
   *
   *     live_index_of: no board rows. REFUSING to fall back to the pick number
   *     — that is exactly the scale confusion this exists to fix.
   *
   * `grab_by.py:233` calls it. This file had ZERO conversions — grep for
   * `live_index` in it returned 0. One rule, implemented on one side.
   *
   * MEASURED COST at my first pick, board slot 33:
   *
   *                        today (3 keepers)     after keeper lock (17)
   *     live index of 33         30                      15
   *     Josh Allen          4.0% vs 1.5%           61.8% vs 1.5%
   *     A.J. Brown          0.0% vs 0.0%           95.9% vs 0.0%
   *     Nico Collins        0.2% vs 0.0%           97.4% vs 0.0%
   *
   * Small today because only my three keepers are on the board. THE SLATE LOCKS
   * 20 AUGUST AND THE DRAFT IS THE 22nd, so the live error on the night is the
   * right-hand column: the board says a 96%-available receiver is certainly
   * gone. It understates survival, which manufactures urgency and makes the
   * tool reach.
   *
   * B reported "Josh Allen reads 98% where he should read 61%". The mechanism B
   * named was a different defect (applySlot, fixed separately) — but 61% is
   * this one's correct post-lock answer, to a tenth.
   */
  /** Observable counters, so "did the conversion actually run" is a fact a test
   *  and a surface can read rather than a thing anyone assumes. */
  const SCALE = { converted: 0, unconverted: 0 };
  function liveIndexOf(boardPick, ctx) {
    const rows = (ctx && ctx.pickBoard) || null;
    if (!rows || !rows.length) {
      // NOT a silent identity. keepers.py refuses here; refusing in the browser
      // would blank the war room mid-draft, so this converts by identity AND
      // records that it did, so a surface can say the scale is unconverted
      // instead of quietly showing numbers from the wrong one.
      SCALE.unconverted += 1;
      return boardPick;
    }
    SCALE.converted += 1;
    let n = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.keeper_slot && Number(r.overall) <= boardPick) n += 1;
    }
    return n;
  }
  // =============================================== Layer 1 — ADP baseline
  function layer1Taken(player, pick, ctx) {
    return normalCdf(liveIndexOf(pick, ctx),
                     effectiveAdp(player, ctx), effectiveSd(player, ctx));
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

    const round = roundOf(team.pick_no, (league.teams || 10));

    // ---- the measured room, as a base rate (GATED — ships off) ------------
    // Blended, never substituted: the room's 2023-25 bucket mix is a rate over
    // a few hundred picks, and the need/value softmax above still carries the
    // live roster. Weight matches BUCKET_BLEND's magnitude. Applied BEFORE the
    // per-owner tilts so a profiled seat's own evidence still acts on top —
    // the forward test's decomposition (audit doc §3) is why the LEAGUE prior
    // is the only thing this switch feeds.
    if (CFG.ROOM_MIX_PRIOR && round) {
      const bucket = round <= 3 ? 'early' : (round <= 9 ? 'mid' : 'late');
      const prior = LEAGUE_MIX[bucket];
      if (prior) {
        const w = CFG.ROOM_MIX_W;
        let total = 0;
        keys.forEach(k => { out[k] = (1 - w) * out[k] + w * (prior[k] || 0); total += out[k]; });
        if (total > 0) keys.forEach(k => { out[k] /= total; });
      }
    }

    // ---- what his own past drafts say -------------------------------------
    // Applied AFTER the softmax, as bounded multipliers on a proper
    // distribution, then renormalised. Doing it inside the utility would let a
    // tendency compound with the exponential and run away.
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

  /* Same shape as poolSoftmax, and the same reason. This one was the single
   * hottest frame in the profile: it FILTERS AND SORTS THE WHOLE BOARD (~1700
   * players) and then builds a softmax over the result — on every call, once
   * per player scored — although every part of that work is a function of
   * (board, position, team) and none of it depends on WHICH player is being
   * scored. The player only selects a numerator.
   *
   * STALENESS IS THE ONLY WAY THIS CAN LIE, so the key is guarded on both axes.
   * `state.board` is usually replaced by a fresh filter() — a new object, hence
   * a new WeakMap key — but app.js pushes onto it in place when a pick is undone.
   *
   * LENGTH IS NOT AN ADEQUATE WITNESS, and the first version of this used one.
   * Length collides trivially: a pick that removes one player and an undo that
   * restores another leave the count unchanged, and ANY in-place edit that does
   * not change length — a flag flip, a re-sort, a projection update — is
   * invisible to it. A stale survival table from a missed invalidation is
   * SILENT AND WRONG, which is strictly worse than slow: the whole point of
   * this model is telling you who will still be there, and a wrong answer there
   * is indistinguishable from a right one until the player is gone.
   *
   * So the witness is an explicit monotonic VERSION, bumped at every mutation
   * site via `bumpBoard(board)`. Correctness no longer depends on a coincidence
   * of array length; it depends on every mutation path calling the bump, which
   * is a property a test can assert directly — and `survival-memo.test.js`
   * does, for every mutation shape the board actually undergoes.
   */
  var POS_SOFTMAX = typeof WeakMap === 'function' ? new WeakMap() : null;
  var BOARD_VERSION = typeof WeakMap === 'function' ? new WeakMap() : null;

  /** Every in-place mutation of a board array MUST call this. */
  function bumpBoard(board) {
    if (!board || !BOARD_VERSION) return 0;
    var v = (BOARD_VERSION.get(board) || 0) + 1;
    BOARD_VERSION.set(board, v);
    return v;
  }
  function boardVersion(board) {
    if (!board || !BOARD_VERSION) return 0;
    return BOARD_VERSION.get(board) || 0;
  }

  function positionSoftmax(board, position, team) {
    var ver = boardVersion(board);
    var perBoard = POS_SOFTMAX && POS_SOFTMAX.get(board);
    // Belt and braces: the version is the real witness, but a length change is
    // a free, independent tell — if it ever fires, a mutation site is missing
    // its bump, and MEMO.staleLengthCatches makes that visible instead of
    // letting the cheaper check quietly paper over the bug.
    if (perBoard && perBoard.len !== board.length && perBoard.ver === ver) {
      MEMO.staleLengthCatches++;
      perBoard = null;
    }
    if (perBoard && perBoard.ver !== ver) perBoard = null;
    if (!perBoard) {
      perBoard = { ver: ver, len: board.length, byKey: new Map() };
      if (POS_SOFTMAX) POS_SOFTMAX.set(board, perBoard);
    }
    // TWO CACHES, BECAUSE THE TWO HALVES HAVE DIFFERENT KEYS. The pool (the
    // expensive filter+sort over the whole board, plus its id index) depends on
    // position ALONE; only the softmax over it depends on the team. Keying both
    // on (position, team) would be correct but would thrash — layer 2 walks the
    // same positions across nine different opponents, so a single-team slot
    // would re-sort the board on every step and the memo would buy nothing.
    var slot = perBoard.byKey.get(position);
    if (!slot) {
      MEMO.poolBuilds++;
      var pool = board.filter(function (p) { return p.position === position; })
        .sort(function (a, b) {
          return (b.vorp || b.proj_mean || 0) - (a.vorp || a.proj_mean || 0);
        })
        .slice(0, CFG.WITHIN_POS_CANDIDATES);
      var idxById = new Map();
      for (var k = 0; k < pool.length; k++) idxById.set(String(pool[k].player_id), k);
      // How many players at this position sit OUTSIDE the candidate pool. Needed
      // so the tail can SHARE a bounded mass instead of each member carrying a
      // constant — see withinPositionProbability (conservation).
      var posTotal = 0;
      for (var q = 0; q < board.length; q++) if (board[q].position === position) posTotal++;
      slot = { pool: pool, idxById: idxById, byTeam: new Map(),
               tailCount: Math.max(0, posTotal - pool.length) };
      perBoard.byKey.set(position, slot);
    }
    var cached = slot.byTeam.get(team);
    if (cached) return cached;
    MEMO.posSoftmaxBuilds++;

    var pool = slot.pool;
    var out = { team: team, pool: pool, exps: null, sum: 0, idxById: slot.idxById,
                tailCount: slot.tailCount };
    if (pool.length) {
      // ROOM MIXTURE for an UNMAPPED seat (D6, 2026-08-10). Before the live draft
      // object maps uids to seats we cannot say WHO sits where — but we know
      // exactly WHO IS IN THE ROOM: the same 10 managers, profiled over 450 real
      // picks across 3 drafts. So an unmapped seat is not "a league-average
      // manager", it is A DRAW FROM THIS ROOM, and the honest distribution is the
      // MIXTURE over its members.
      //
      // WHY THE MIXTURE AND NOT AN AVERAGE PROFILE — measured, not assumed: the
      // room's mean softmax alpha/beta is 0.999/1.001, i.e. EXACTLY the generic
      // defaults, so averaging PARAMETERS is a provable no-op. All the information
      // is in the SPREAD (reach_delta runs -6.96 to +12.92, a ~20-pick range), and
      // precision -> probability is NONLINEAR, so averaging PROBABILITIES keeps
      // what averaging parameters destroys. Measured effect on the live board: the
      // top player at a position is 2.5-4.8 points more likely to be taken than
      // the mean-manager model believes, and elite RB/WR/QB survival over an
      // 11-pick window was OVERSTATED by 2.6-3.4 points — the error that makes you
      // wait on a player who is already gone.
      //
      // Claims nothing about identity, so nothing to retract when the draft object
      // lands: the moment a seat resolves to a real manager, team.profile is set
      // and that seat uses HIS numbers instead of the mixture.
      var room = (!(team && team.profile) && team && team.room && team.room.length)
        ? team.room : null;
      if (room) {
        // Identical for every unmapped seat, so build it ONCE per (board,
        // position) — this is the hottest frame in the profile and a per-seat
        // mixture would multiply it by the size of the room for no new answer.
        if (slot.mixture === undefined) slot.mixture = roomMixture(pool, room);
        // A degenerate room (no usable profiles) falls THROUGH to the ordinary
        // single-profile path rather than returning null exps — fail to the old
        // behaviour, never to a crash on the clock.
        if (slot.mixture) {
          out.exps = slot.mixture;
          out.sum = 1;                     // already normalised probabilities
          out.room_mixture = true;
          slot.byTeam.set(team, out);
          return out;
        }
      }
      var temp = withinPrecision(team);
      var scores = pool.map(function (p) { return p.vorp == null ? p.proj_mean || 0 : p.vorp; });
      var max = Math.max.apply(null, scores);
      var sum = 0;
      // A man he has drafted before is not just another name at the position.
      var exps = scores.map(function (s, i) {
        var e = Math.exp((s - max) * temp / 10)
          * affinityMultiplier(team && team.profile, pool[i].player_id);
        sum += e;
        return e;
      });
      out.exps = exps;
      out.sum = sum;
    }
    slot.byTeam.set(team, out);
    return out;
  }

  /* P(this player | this position is taken) for a seat we know only as "someone
   * in this room" — the average of each member's own distribution, NOT the
   * distribution of an average member. Each manager brings his own precision
   * (from his reach_delta) and his own repeat-target affinity, so a player some
   * of the room has drafted before is correctly likelier to go. Returns
   * probabilities that sum to 1. Pure over (pool, room). */
  function roomMixture(pool, room) {
    var scores = pool.map(function (p) { return p.vorp == null ? p.proj_mean || 0 : p.vorp; });
    var max = Math.max.apply(null, scores);
    var mix = pool.map(function () { return 0; });
    var n = 0;
    room.forEach(function (profile) {
      if (!profile) return;
      var temp = withinPrecision({ profile: profile });
      var sum = 0;
      var exps = scores.map(function (s, i) {
        var e = Math.exp((s - max) * temp / 10)
          * affinityMultiplier(profile, pool[i].player_id);
        sum += e;
        return e;
      });
      if (!(sum > 0)) return;
      for (var i = 0; i < exps.length; i++) mix[i] += exps[i] / sum;
      n++;
    });
    if (!n) return null;
    for (var j = 0; j < mix.length; j++) mix[j] /= n;
    return mix;
  }

  /* P(this player | a pick at this position). MUST SUM TO 1 ACROSS THE POSITION.
   *
   * CONSERVATION BUG (Cory, 2026-08-10): only as many players can be taken as
   * there are picks, so summing P(gone) over the whole board has to equal the
   * number of intervening picks. It came to 99 against 33 picks — 3x — and the
   * excess was ALL in the tail. The floor below (see withinFromPool for why a
   * floor is right: the room CAN take anyone, so claiming certainty is the worse
   * error) was a per-player CONSTANT handed to every player outside the top-6 at
   * his position. Within-position therefore summed to 1 + 0.01 x tailCount — for
   * WR, with 668 players, 7.6x too much — and every wait-or-take number inherited
   * it.
   *
   * The floor keeps its meaning but becomes a BUDGET: WITHIN_POS_TAIL_P is now
   * the TOTAL probability that a pick at this position goes to someone outside
   * the candidate pool, shared among them, with the pool scaled to (1 - that).
   * Sums to exactly 1 for any tail size, so conservation holds by construction
   * rather than by luck, and nobody is ever certain to survive. */
  function withinPositionProbability(player, board, team) {
    var sm = positionSoftmax(board, player.position, team);
    if (!sm.pool.length) return 0;
    var tailBudget = CFG.WITHIN_POS_TAIL_P;
    if (!sm.idxById.has(String(player.player_id))) {
      var n = sm.tailCount || 1;
      return tailBudget / n;
    }
    var idx = sm.idxById.get(String(player.player_id));
    var share = sm.sum > 0 ? sm.exps[idx] / sm.sum : 0;
    return share * (1 - tailBudget);
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
        if (pool.length) {
          // How many players at this position are OUTSIDE the candidate pool, so
          // the tail can SHARE a bounded probability instead of each member
          // carrying a constant (conservation — see withinFromPool).
          pool.tailCount = Math.max(0, order.length - pool.length);
          topByPos[pos] = pool; availAt[pos] = weights;
        }
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

  /* THE SOFTMAX IS A PROPERTY OF THE POOL, NOT OF THE PLAYER BEING SCORED.
   *
   * `withinFromPool` used to rebuild the entire pool's softmax — a full pass to
   * find `max`, another to exponentiate and sum — on EVERY call, and it is
   * called once per (player x step) from layer2Taken and again once per
   * (candidate x step) from the thinning loop inside precomputeLayer2. Scoring
   * a 200-player board over a 24-pick window therefore re-derived the same few
   * hundred denominators tens of thousands of times.
   *
   * Measured on the live war room: marking ONE opponent pick blocked the main
   * thread for 5.6-6.4 seconds, of which ~5.5s was this function and its
   * closures. Across ~135 opponent picks that is roughly THIRTEEN MINUTES of
   * frozen UI on draft night — and because the block is synchronous, taps made
   * during it are dropped. Dropped taps are exactly how mock #2 ended with a
   * roster that had silently drifted from the truth.
   *
   * The memo below changes NO arithmetic. Same array order, same accumulation
   * order, so `sum` and `exps[idx]` are bit-identical floats; the only thing
   * that changes is how many times they are computed. Keyed on the identity of
   * the `pool` array, which precomputeLayer2 creates fresh per (step, position)
   * and hands to both call sites together with its matching `team`/`avail` —
   * and the entry is re-derived if either of those does not match, so a future
   * caller reusing a pool under different conditions cannot silently read a
   * stale denominator.
   */
  var POOL_SOFTMAX = typeof WeakMap === 'function' ? new WeakMap() : null;

  /* WORK COUNTERS — the deterministic form of "this is still fast".
   *
   * A wall-clock assertion in CI is a flake generator; the thing that actually
   * regressed when this was slow is the NUMBER OF TIMES the expensive work ran,
   * and that is exactly reproducible. `survival-memo.test.js` scores a board
   * and asserts the board is sorted once per position rather than once per
   * player. If someone removes a memo, the count moves and the test fails —
   * which is the point: a performance property nobody can break silently.
   */
  var MEMO = { poolBuilds: 0, posSoftmaxBuilds: 0, poolSoftmaxBuilds: 0,
               staleLengthCatches: 0 };
  function memoStats() {
    return { poolBuilds: MEMO.poolBuilds, posSoftmaxBuilds: MEMO.posSoftmaxBuilds,
             poolSoftmaxBuilds: MEMO.poolSoftmaxBuilds,
             // Non-zero means a mutation site forgot to bumpBoard(). That is a
             // correctness bug, not a performance one.
             staleLengthCatches: MEMO.staleLengthCatches };
  }
  function resetMemoStats() {
    MEMO.poolBuilds = 0; MEMO.posSoftmaxBuilds = 0; MEMO.poolSoftmaxBuilds = 0;
    MEMO.staleLengthCatches = 0;
  }

  function poolSoftmax(pool, team, avail) {
    var memo = POOL_SOFTMAX && POOL_SOFTMAX.get(pool);
    if (memo && memo.team === team && memo.avail === avail) return memo;
    MEMO.poolSoftmaxBuilds++;

    var temp = withinPrecision(team);
    var max = -Infinity;
    var scores = pool.map(function (p) {
      var v = p.vorp == null ? p.proj_mean || 0 : p.vorp;
      if (v > max) max = v;
      return v;
    });
    var sum = 0;
    /* THE ROOM MIXTURE REACHES THE SCORE, NOT ONLY THE PANEL (2026-08-11).
     *
     * TWO IMPLEMENTATIONS OF ONE QUESTION. "P(this player | his position is
     * taken)" is answered in two places: withinPositionProbability, which the
     * THREATS panel calls, and this one, which precomputeLayer2 calls and which
     * therefore produces survival_to_next, VONA and the score. D6 taught the
     * first about rooms and left the second on the generic softmax.
     *
     * Measured on the live board before the fix, top-6 RBs:
     *   withinPositionProbability  Gibbs 0.4500 -> 0.4382 with the room
     *   withinFromPool             Gibbs 0.4397 -> 0.4397, exactly no change
     *
     * So D6's stated purpose — "elite RB/WR/QB survival over an 11-pick window
     * was OVERSTATED by 2.6-3.4 points" — was never applied to the number that
     * says how long a player lasts. The panel and the score disagreed about the
     * same room, and neither was wrong on its own terms.
     *
     * Availability still weights it: the mixture is a distribution over the pool
     * as though every candidate were certain to be there, and a player 20%
     * likely to still be on the board must contribute 20% of that mass. The
     * renormalisation below is what makes the two multiply correctly. */
    var mix = (!(team && team.profile) && team && team.room && team.room.length)
      ? roomMixture(pool, team.room) : null;
    var exps = scores.map(function (v, i) {
      var w = avail ? Math.max(0, Math.min(1, avail[i] == null ? 1 : avail[i])) : 1;
      var e = mix
        ? w * mix[i]
        : w * Math.exp((v - max) * temp / 10)
          * affinityMultiplier(team && team.profile, pool[i].player_id);
      sum += e;
      return e;
    });
    // The index lookup was a linear scan per call too; one map serves every
    // player scored against this pool.
    var idxById = new Map();
    for (var i = 0; i < pool.length; i++) idxById.set(String(pool[i].player_id), i);

    memo = { team: team, avail: avail, exps: exps, sum: sum, idxById: idxById };
    if (POOL_SOFTMAX) POOL_SOFTMAX.set(pool, memo);
    return memo;
  }

  /** P(this specific player, given his position is taken) from a precomputed pool.
   *  `avail` (optional) weights each candidate by how likely he is still there. */
  function withinFromPool(player, pool, team, avail) {
    if (!pool || !pool.length) return 0;
    var sm = poolSoftmax(pool, team, avail);
    var idx = sm.idxById.has(String(player.player_id))
      ? sm.idxById.get(String(player.player_id)) : -1;
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
      //
      // BUT IT IS A BUDGET, NOT A PER-PLAYER CONSTANT (conservation fix,
      // 2026-08-10). Handing every tail member the same 0.01 on every step made
      // the whole board's expected departures scale with the SIZE OF THE TAIL
      // rather than the number of picks: summed over the board, 99 expected
      // departures against 33 actual picks (3x), and 50 of that excess came from
      // 1,262 players beyond ADP rank 500 whom Layer 1 correctly gave 0.00.
      // WITHIN_POS_TAIL_P is now the TOTAL chance a pick at this position goes to
      // someone outside the pool, shared among them — so nobody is certain to
      // survive AND the sum stays tied to the number of picks.
      return CFG.WITHIN_POS_TAIL_P / Math.max(1, pool.tailCount || 1);
    }
    // Availability weights the softmax: a player who is 20% likely to still be
    // on the board contributes 20% of the mass he would if he were certain.
    // (Both the weighting and the accumulation live in poolSoftmax now.)
    // Scaled by (1 - tail budget) so pool + tail sums to exactly 1.
    return sm.sum > 0 ? (sm.exps[idx] / sm.sum) * (1 - CFG.WITHIN_POS_TAIL_P) : 0;
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
  // `ctx` is OPTIONAL and last so no existing caller breaks. Without it
  // liveIndexOf converts by identity and increments SCALE.unconverted, which is
  // the pre-fix behaviour made VISIBLE rather than silently retained.
  function runMultipliers(recentPicks, board, currentPick, ctx) {
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
      // SAME SCALE FIX. This estimates how many players of each position the
      // room "should" have taken between two picks; both bounds are board slots
      // and adpOf is on the selection scale, so the window was measured in the
      // wrong units and the drift correction inherited it.
      const liveNow = liveIndexOf(currentPick, ctx), liveStart = liveIndexOf(start, ctx);
      const mass = normalCdf(liveNow, adpOf(pl), adpSd(adpOf(pl), pl.adp_sd))
        - normalCdf(liveStart, adpOf(pl), adpSd(adpOf(pl), pl.adp_sd));
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

  /* ══ CONSERVATION: ENFORCE THE COUNT IDENTITY ACROSS THE BOARD ══════════
   *
   * THE DEFECT. `survivalProbability` prices each player independently, so the
   * board's expected departures need not equal the picks that actually happen.
   * Measured over Cory's own pick windows, with the board consumed to the
   * current pick:
   *
   *     12-pick windows   ratio ~1.15
   *      6-pick, early    1.22 - 1.29
   *      6-pick, later    1.47 - 1.57
   *
   * Six picks cannot produce 9.4 departures. That is a structural impossibility,
   * not a calibration quibble, and it is WORST in short windows and later rounds
   * — where nearly all of Cory's picks fall. Over-prediction inflates urgency,
   * urgency pushes toward reaching, and reaching is already measured as his
   * single biggest personal leak. The engine was amplifying the behaviour it
   * measured as costing him money.
   *
   * THE REDISTRIBUTION RULE, chosen and defended rather than fallen into.
   * Conservation is an AGGREGATE constraint: it says the excess must go, not
   * where. Three candidates, measured on the live board at pick 28 -> 34:
   *
   *     player            now   proportional   EXPONENTIAL TILT
   *     DeVonta Smith     28%       41%              46%
   *     Breece Hall       22%       36%              43%
   *     Jaylen Waddle     92%       94%              92%
   *
   *   - competing risks (1-w/W)^N  UNDER-conserves (ratio 0.832) — wrong the
   *     other way, because the convexity eats the high-weight players.
   *   - proportional rescale conserves, but can push p above 1 and needs a
   *     clamp, and the clamp breaks the conservation it just achieved. It also
   *     moves ALREADY-SAFE players (Waddle +2pts) because the aggregate is off,
   *     which is not where the error is.
   *   - EXPONENTIAL TILT: find the single scalar L with
   *         sum_i [1 - exp(-L * w_i)] = N
   *     Chosen because it is SOLVED, not selected — one parameter determined by
   *     the constraint rather than a rule someone picked. It is the maximum-
   *     entropy distribution consistent with the count (least-committal given
   *     what we know), rank-preserving, bounded in [0,1] by construction so no
   *     clamp is needed, and it concentrates the correction where the error is:
   *     Waddle moves -0, the contested players move +18 and +21.
   *
   * ══ THE CAVEAT SURVIVES THE FIX, and is stated rather than implied ══
   * THIS IS NOT CALIBRATION. It enforces an identity. If the model's SHAPE is
   * wrong, tilting yields per-player numbers that are still wrong and now merely
   * sum correctly. Necessary, insufficient. Calibration needs outcome data this
   * project does not yet have.
   *
   * ══ THE NEW COST, stated so it is visible rather than discovered ══
   * L is fitted per (board state, target pick). Two adjacent windows can produce
   * different L, so a player's number could move between renders with no pick
   * occurring. That instability is new — the independent model did not have it.
   * It is contained by fitting ONCE PER BOARD STATE and memoising on the board
   * version, so repeated renders of the same state return identical numbers.
   */
  var TILT_MEMO = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  var CTX_FP = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;

  /* THE MEMO KEY MUST DESCRIBE THE ANSWER, NOT JUST THE QUESTION'S SHAPE.
   *
   * The first key was boardVersion + currentPick + targetPick + N. Every one of
   * those can be identical across two contexts that produce genuinely different
   * survival numbers — and one of the existing regression tests proved it within
   * minutes of the tilt going live: twelve intervening picks over a twelve-pick
   * window gives N = 12 either way, so an ADP-only context and a full Layer-2
   * need context hashed to the SAME key and the second call was served the
   * first's cached map. VONA stopped responding to the need model, which is the
   * exact defect that test was written to catch in 2026-08-10.
   *
   * Live this would be worse than in a fixture: the board, my pick and my next
   * pick all hold still between renders while runMultipliers, drift and the
   * opponents' rosters change. A run detected mid-round would have moved nothing.
   *
   * So the fingerprint covers everything survivalProbability actually reads. It
   * is computed ONCE PER CONTEXT OBJECT and cached on it — conservedSurvival is
   * called ~1.7M times per board scan and almost all of those are memo hits, so
   * rebuilding a string per call would cost more than the tilt it is caching.
   */
  function ctxFingerprint(ctx) {
    if (!ctx) return 'nil';
    if (CTX_FP) {
      var hit = CTX_FP.get(ctx);
      if (hit !== undefined) return hit;
    }
    var iv = ctx.intervening || [];
    var parts = [];
    for (var i = 0; i < iv.length; i++) {
      var t = iv[i] || {};
      var roster = t.roster || [];
      var pos = '';
      for (var j = 0; j < roster.length; j++) pos += (roster[j] || {}).position || '?';
      parts.push(t.team_slot + '@' + t.pick_no + '/' + pos
        + '/' + (t.profile ? (t.profile.manager_id || 'p') : '-')
        + '/' + ((t.room || []).length));
    }
    var fp = parts.join('|')
      + '#rm' + JSON.stringify(ctx.runMultipliers || {})
      + '#dr' + JSON.stringify(ctx.drift == null ? null : ctx.drift)
      + '#tp' + (ctx.totalPicks || 0)
      + '#rl' + (ctx.roundsLeft || 0);
    if (CTX_FP) CTX_FP.set(ctx, fp);
    return fp;
  }

  /* TWO-SIDED, and it was not. `if (!(total > N)) return null` made the tilt fire
   * only when the board predicted TOO MANY departures.
   *
   * That guard was written when the model over-predicted — v1's baseline summed
   * to 7.279 against 6 real picks. Correcting the frozen context flipped the sign:
   * the live model now sums to 5.258 against the same 6. So the moment the tilt
   * was finally wired to the app it did nothing at all, on every state, and the
   * baseline did not move. Not because the wiring failed — conservedSurvival was
   * measured being called 1,687,612 times with N correct at 6 — but because the
   * correction only knew how to push one way and the error had moved to the other.
   *
   * THE IDENTITY IS AN IDENTITY IN BOTH DIRECTIONS. Six opponent picks remove six
   * players. A board summing to 5.26 expected departures is claiming that fewer
   * players will be taken than there are picks to take them, which is not
   * conservative — it is impossible, and it makes every player look safer to wait
   * on than he is. That is the direction that costs money in a draft room.
   *
   * mass(L) is continuous and strictly increasing from 0 (at L=0) to the count of
   * players with nonzero weight (as L grows), so a solution exists for any N in
   * between and bisection finds it from either side. `hi` is now GROWN until it
   * brackets the target rather than fixed at 50 — a fixed ceiling silently
   * returns the ceiling when the required L sits above it, which is a wrong
   * answer wearing the shape of a converged one. */
  function solveTilt(weights, N) {
    var i, nonzero = 0;
    for (i = 0; i < weights.length; i++) if (weights[i] > 0) nonzero++;
    /* DEGENERATE WHEN N >= nonzero, and `>=` is the whole point.
     *
     * mass(L) rises to `nonzero` only as L goes to infinity, so N = nonzero is
     * solvable only at L = infinity — every eligible player taken with certainty.
     * The bisection does not report that: at large L every exp(-L*w) UNDERFLOWS
     * to zero, mass equals nonzero exactly, the bracket "succeeds", and it
     * converges on a huge L that sets EVERY survival to ~0. Ordering information
     * is destroyed and the numbers look confident.
     *
     * Caught by an existing engine test within minutes of the tilt going live: an
     * 11-player fixture over an 11-pick window made the man going at ADP 1 and the
     * man going at ADP 55 equally doomed, so "less likely to last" became a tie.
     *
     * This only arises when picks meet or exceed the tiltable board — a fixture
     * condition, not a draft one (1729 players against 6 picks). Returning null
     * keeps the raw numbers, which are still ordered and still honest, rather
     * than emitting an all-zeros board that satisfies the identity and says
     * nothing. */
    if (!(N > 0) || nonzero === 0 || N >= nonzero) return null;

    function mass(L) {
      var m = 0;
      for (var j = 0; j < weights.length; j++) m += 1 - Math.exp(-L * weights[j]);
      return m;
    }
    var lo = 0, hi = 1, guard = 0;
    while (mass(hi) < N && guard++ < 200) hi *= 2;
    if (mass(hi) < N) return null;            // could not bracket — say so, do not clamp
    for (i = 0; i < 120; i++) {
      var mid = (lo + hi) / 2;
      if (mass(mid) < N) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /**
   * Survival for a whole board, with the count identity enforced.
   *
   * Returns { byId, lambda, massBefore, massAfter, picks, applied } — the
   * NUMBERS BESIDE THE VERDICT, so `applied` can be checked rather than trusted.
   */
  function conservedSurvival(board, targetPick, rawCtx) {
    var ctx = normalizeCtx(rawCtx);
    var cur = ctx.currentPick || 0;
    /* N IS OPPONENT PICKS, NOT THE WINDOW. `targetPick - cur` counts my own pick
     * among the departures, and a player I take is not a player who got away —
     * so the tilt was solving for 7 where the identity demands 6, and would have
     * over-thinned the board by one pick's worth of mass on every render.
     *
     * ctx.intervening is already the window minus my seat (app.js builds it that
     * way, and the frozen baseline now mirrors it), so it IS the count. The
     * window is kept only as a fallback for callers that supply no intervening
     * list, and it is the looser of the two. */
    var N = (ctx.intervening && ctx.intervening.length)
      ? ctx.intervening.length
      : Math.max(0, targetPick - cur);
    var list = board || ctx.board || [];
    var key = boardVersion(list) + ':' + cur + ':' + targetPick + ':' + N
      + ':' + ctxFingerprint(ctx);
    if (TILT_MEMO) {
      var hit = TILT_MEMO.get(list);
      if (hit && hit.key === key) return hit.value;
    }
    var ids = [], w = [], raw = [], i, p, s;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      s = survivalProbability(p, targetPick, ctx);
      if (s == null) continue;
      ids.push(String(p.player_id));
      raw.push(s);
      w.push(1 - s);
    }
    var before = 0;
    for (i = 0; i < w.length; i++) before += w[i];
    var L = (N > 0) ? solveTilt(w, N) : null;
    var byId = {}, after = 0, adj;
    for (i = 0; i < ids.length; i++) {
      adj = (L == null) ? raw[i] : Math.exp(-L * w[i]);
      byId[ids[i]] = adj;
      after += 1 - adj;
    }
    var out = { byId: byId, lambda: L, picks: N,
                massBefore: before, massAfter: after,
                ratioBefore: N ? before / N : null,
                ratioAfter: N ? after / N : null,
                applied: L != null, players: ids.length,
                note: 'identity enforced, NOT calibrated — see the header' };
    if (TILT_MEMO) TILT_MEMO.set(list, { key: key, value: out });
    return out;
  }

  /* ══ GRADING THE SURVIVAL CALL — the cheapest closed loop we have ═══════
   *
   * Cory: *"close the loop to actually grade these and find useful info wherever
   * we can."* `loop_closure.js` measured seven claims the model makes and never
   * learns from. This closes the one with the shortest feedback cycle and the
   * highest leverage:
   *
   *   · SHORTEST — a survival call names a pick. Within a handful of picks the
   *     player is either still on the board or he is not. It does not wait for a
   *     week, a season, or a payout. **The draft itself grades it.**
   *   · HIGHEST LEVERAGE — survival drives `expectedBestAvailable`, which is
   *     VONA, which is 62% of what moves the composite. Grading survival is
   *     grading the input Cory said has to be locked solid.
   *
   * ── WHY BRIER AND NOT ACCURACY ────────────────────────────────────────
   *
   * These are PROBABILITIES, not calls. "He survives with p=0.7" is not wrong
   * when he goes; it is wrong only if 0.7 was the wrong number. Accuracy would
   * reward a model that said 1.0 or 0.0 about everything and punish an honest
   * 0.7 — the opposite of what we want. The Brier score, mean (p − outcome)²,
   * is minimised by reporting your true belief, so it cannot be gamed by
   * overconfidence.
   *
   * A BASELINE SHIPS WITH IT, because a Brier score alone is unreadable. The
   * comparison is against always predicting the observed base rate: beat that
   * and the model knows something about WHICH player survives, not merely how
   * many do. `skill` is the fraction of that baseline's error removed — positive
   * is real information, zero is "no better than counting", negative is worse
   * than knowing nothing.
   *
   * ── WHAT IT DELIBERATELY REFUSES ──────────────────────────────────────
   *
   * A capture whose `to_pick` has not been reached yet is NOT resolved as a
   * survival. Absence of a pick is not evidence he lasted; it is evidence the
   * draft has not got there. Resolving early would score every open prediction
   * as a correct "survived" and manufacture a flawless model.
   */
  function resolveSurvival(captures, opts) {
    /* NOT NAMED `ctx`, DELIBERATELY. The app-wiring seam guard scrapes
     * `ctx.<field>` reads out of the engine modules and requires the live
     * `context()` to supply every one of them — so calling this parameter `ctx`
     * made the guard demand that `context()` provide `picks`, which it neither
     * does nor should. This is a pick LOG passed by one caller, not the shared
     * draft context, and the two must not share a name. The guard was right. */
    opts = opts || {};
    const picks = (opts.picks || []).filter(function (p) {
      return p && p.overall != null && p.player_id != null;
    });
    // How far the draft has actually got. A capture cannot be graded past it.
    const reached = picks.reduce(function (m, p) {
      return Number(p.overall) > m ? Number(p.overall) : m;
    }, 0);

    const out = [];
    (captures || []).forEach(function (cap) {
      const payload = cap.payload || cap;
      const toPick = Number(payload.to_pick);
      const fromPick = Number(cap.pick != null ? cap.pick : payload.from_pick);
      const estimates = payload.estimates || [];
      if (!isFinite(toPick) || !estimates.length) return;
      if (reached < toPick) return;                 // not yet resolvable — say nothing

      /* ⚠ THE BOUNDARY AT `to_pick` IS THE ONE THAT MATTERED, AND I HAD IT
       * BACKWARDS. This read `n <= toPick`, so a player taken AT to_pick scored
       * as "did not survive".
       *
       * But `to_pick` is CORY'S OWN NEXT PICK (`myNextTurn()`) — nobody else can
       * pick there. So the only way a player is taken AT to_pick is that he was
       * still on the board when Cory's turn came and CORY DRAFTED HIM. That is
       * the survival call coming TRUE, scored as a miss.
       *
       * And it is biased, not merely wrong: the players Cory actually drafts are
       * the ones the model rated highest and predicted would last. Every
       * successful recommendation would have been recorded as a survival failure,
       * so the Brier score would look worst exactly where the model was right.
       *
       * Survived to pick N means: still there when my turn at N came up — i.e.
       * not taken at any pick STRICTLY BEFORE N. */
      const takenInWindow = {};
      picks.forEach(function (p) {
        const n = Number(p.overall);
        if (n > fromPick && n < toPick) takenInWindow[String(p.player_id)] = n;
      });

      const results = estimates.map(function (e) {
        const gone = Object.prototype.hasOwnProperty.call(takenInWindow, String(e.player_id));
        const outcome = gone ? 0 : 1;               // 1 = survived
        const p = Math.max(0, Math.min(1, Number(e.survival)));
        return { player_id: String(e.player_id), position: e.position || null,
          predicted: p, survived: outcome,
          taken_at: gone ? takenInWindow[String(e.player_id)] : null,
          sq_error: Math.round((p - outcome) * (p - outcome) * 1e6) / 1e6 };
      }).filter(function (r) { return isFinite(r.predicted); });
      if (!results.length) return;

      const n = results.length;
      const brier = results.reduce(function (s, r) { return s + r.sq_error; }, 0) / n;
      const base = results.reduce(function (s, r) { return s + r.survived; }, 0) / n;
      // The base-rate forecaster predicts `base` for everyone, every time.
      const baseBrier = results.reduce(function (s, r) {
        return s + (base - r.survived) * (base - r.survived);
      }, 0) / n;
      // SKILL IS UNDEFINED, NOT ZERO, WHEN THE BASELINE IS PERFECT. If every
      // player survived, base is 1 and the baseline scores 0 — there is nothing
      // to improve on and a ratio would divide by zero. Reporting 0 there would
      // read as "no skill" when the truth is "this round cannot show skill".
      const skill = baseBrier > 1e-9
        ? Math.round((1 - brier / baseBrier) * 1000) / 1000 : null;

      out.push({ method: 'survival-resolver-v1',
        payload: { from_pick: fromPick, to_pick: toPick, n: n,
          brier: Math.round(brier * 1e6) / 1e6,
          base_rate: Math.round(base * 1000) / 1000,
          baseline_brier: Math.round(baseBrier * 1e6) / 1e6,
          skill: skill,
          skill_note: skill === null
            ? 'undefined: every player resolved the same way, so the base rate is '
              + 'already perfect and there is nothing for the model to improve on'
            : 'fraction of the base-rate forecaster\'s error removed; 0 = no better '
              + 'than counting, negative = worse than knowing nothing',
          results: results } });
    });
    return out;
  }

  /* ══ GRADING THE RUN CALL ═══════════════════════════════════════════════
   *
   * The second draft-day loop, and it grades another VONA input: run
   * multipliers feed `survivalProbability`, so a run call that is wrong makes
   * every survival number downstream of it wrong too.
   *
   * THE CLAIM: "position P is going faster than usual right now" — `detectRuns`
   * fires when the multiplier clears RUN_BANNER_AT. Within a few picks the room
   * either kept taking that position or it did not.
   *
   * ── THE BASELINE IS THE TRAP, AND IT IS WHY THIS IS NOT "after vs before" ──
   *
   * The obvious grade is "did P go faster AFTER the call than BEFORE it". That
   * is biased against the model by construction: the call FIRES because P just
   * went fast, so the before-window is elevated by selection and regression to
   * the mean alone would score most correct calls as failures. It is the same
   * shape as the survival boundary bug — a comparison that looks neutral and
   * systematically punishes the model for the cases it fired on.
   *
   * So the baseline is the position's share of THE WHOLE DRAFT SO FAR: how often
   * this position normally goes in this room, measured on this draft, unaffected
   * by the window that triggered the call.
   *
   * ── AND THE MULTIPLIER IS REPORTED, NOT SCORED ────────────────────────────
   *
   * A multiplier of 1.6 claims more than 1.4 does. But nothing here knows what
   * excess a 1.6 SHOULD produce, and inventing a mapping now would be fitting a
   * curve to zero observations. Each row carries the multiplier beside the
   * measured excess so the relationship becomes measurable once there are rows —
   * and stays honestly unasserted until then.
   *
   * The forward window is RUN_WINDOW, the same horizon `runMultipliers` looks
   * BACK over. Grading a 10-pick detector on a 3-pick future would measure the
   * window, not the call.
   */
  function resolveRun(captures, opts) {
    opts = opts || {};
    const W = opts.window || CFG.RUN_WINDOW;
    const picks = (opts.picks || []).filter(function (p) {
      return p && p.overall != null && p.position;
    });
    const reached = picks.reduce(function (m, p) {
      return Number(p.overall) > m ? Number(p.overall) : m;
    }, 0);

    const out = [];
    (captures || []).forEach(function (cap) {
      const at = Number(cap.pick);
      const positions = ((cap.payload || cap).positions) || [];
      if (!isFinite(at) || !positions.length) return;
      if (reached < at + W) return;             // window not complete — say nothing

      const before = picks.filter(function (p) { return Number(p.overall) < at; });
      // A baseline off three picks is not a baseline. Refuse rather than divide
      // by a number that cannot mean anything.
      if (before.length < W) return;
      const after = picks.filter(function (p) {
        const n = Number(p.overall); return n > at && n <= at + W;
      });
      if (!after.length) return;

      const share = function (list, pos) {
        return list.filter(function (p) { return p.position === pos; }).length / list.length;
      };
      const results = positions.map(function (row) {
        const b = share(before, row.position), o = share(after, row.position);
        return { position: row.position, multiplier: row.multiplier,
          baseline_rate: Math.round(b * 1000) / 1000,
          observed_rate: Math.round(o * 1000) / 1000,
          excess: Math.round((o - b) * 1000) / 1000,
          continued: o > b };
      });
      const nCont = results.filter(function (r) { return r.continued; }).length;
      out.push({ method: 'run-resolver-v1',
        payload: { at_pick: at, window: W, n_before: before.length, n_after: after.length,
          positions: results, n_called: results.length, n_continued: nCont,
          baseline_note: 'baseline is the position\'s share of the whole draft before '
            + 'the call, NOT the window that triggered it — an after-vs-before '
            + 'comparison is biased against a detector that fires on a spike',
          multiplier_note: 'the multiplier is recorded beside the measured excess, '
            + 'not scored against it: no mapping from multiplier to expected excess '
            + 'has been established, and inventing one on zero rows would be fitting' } });
    });
    return out;
  }

  /* ══ RESOLVE THE LAST-RESPONSIBLE-MOMENT CALLS ═════════════════════════
   *
   * The LRM strip makes the most actionable claim on the war room: "startable QB
   * safe until pick 73". It has been CAPTURED since decision-capture went in
   * (`PredLedger.lrm`, method `survival-snapshot-v0`) and GRADED BY NOTHING —
   * one of four open loops, and the one that resolves entirely inside the draft.
   * If it is not closed before 22 August the evidence is not recoverable later,
   * which is the same shape as the in-season capture gap.
   *
   * ── WHY THIS IS A HIT RATE AND NOT A BRIER SCORE ───────────────────────
   *
   * `resolveSurvival` scores probabilities, so Brier is right there. An LRM call
   * is NOT a probability — it is a DEADLINE produced by thresholding one at 0.85.
   * The only number the strip commits to is that threshold, so the honest grade
   * is: of the calls that said "safe until N", how often was somebody from that
   * pool actually still there at N? That rate belongs against 0.85, and a gap
   * between them is calibration evidence rather than a bug.
   *
   * ── WHAT COUNTS AS THE CALL COMING TRUE ────────────────────────────────
   *
   * The claim is about the POOL, not the named target: the strip says a startable
   * option survives, and names one only so the reader can check it. So a call
   * hits when ANY member of the pool it was computed over is still undrafted when
   * pick N arrives. The capture stores the pool ids for exactly this reason; a
   * capture without them is skipped rather than graded against the target alone,
   * because grading the named man would be a harder claim than the one made.
   *
   * SAME BOUNDARY AS `resolveSurvival`, and for the same reason: `by_pick` is
   * one of CORY'S OWN picks, so a player taken AT it was taken BY HIM — the call
   * coming true. Strictly-before is the test.
   */
  function resolveLrm(captures, opts) {
    opts = opts || {};                    // never `ctx` — see resolveSurvival
    const picks = (opts.picks || []).filter(function (p) {
      return p && p.overall != null && p.player_id != null;
    });
    const reached = picks.reduce(function (m, p) {
      return Number(p.overall) > m ? Number(p.overall) : m;
    }, 0);
    const takenAt = {};
    picks.forEach(function (p) { takenAt[String(p.player_id)] = Number(p.overall); });

    const rows = [], noDeadline = [];
    (captures || []).forEach(function (cap) {
      const payload = cap.payload || cap;
      const list = payload.last_responsible_moment || [];
      const from = Number(cap.pick != null ? cap.pick : payload.from_pick);
      list.forEach(function (r) {
        ['startable', 'elite'].forEach(function (band) {
          /* ⚠ `Number(null)` IS 0 AND `isFinite(0)` IS TRUE, so my first version
           * graded a NULL DEADLINE as a deadline of pick 0 — which every pool
           * trivially survives, scoring a free HIT. Measured on a constructed
           * case: a TE row with `elite_by: null` came back "by 0 · HIT".
           *
           * A null here is not a deadline at all. It is the strip saying "elite
           * tier gone — there is no safe moment left", which is a DIFFERENT claim
           * and a real one. Counting it as a satisfied deadline would inflate the
           * hit rate exactly where the model admitted it had nothing to offer.
           * Skipped and COUNTED, so it shows up as unresolved rather than
           * disappearing into the numerator. */
          const raw = r[band + '_by'];
          if (raw == null) { noDeadline.push({ position: r.position, band: band }); return; }
          const by = Number(raw);
          const pool = r[band + '_pool_ids'];
          if (!isFinite(by) || by <= 0 || !Array.isArray(pool) || !pool.length) return;
          if (reached < by) return;                  // not resolvable yet
          const alive = pool.filter(function (id) {
            const n = takenAt[String(id)];
            return !(n != null && n > from && n < by);
          });
          rows.push({
            position: r.position, band: band, from_pick: from, by_pick: by,
            pool_size: pool.length, survivors: alive.length,
            hit: alive.length > 0,
            target: r[band + '_target'] || null,
          });
        });
      });
    });

    const n = rows.length;
    const hits = rows.filter(function (r) { return r.hit; }).length;
    return {
      n: n,
      hits: hits,
      hit_rate: n ? hits / n : null,
      /* THE NUMBER THE STRIP COMMITTED TO. Reported beside the outcome so the
       * comparison is the reader's, not a verdict I baked in. */
      implied: CFG.LRM_SAFE_P,
      calibration_gap: n ? (hits / n) - CFG.LRM_SAFE_P : null,
      by_band: ['startable', 'elite'].map(function (b) {
        const sub = rows.filter(function (r) { return r.band === b; });
        return { band: b, n: sub.length,
          hits: sub.filter(function (r) { return r.hit; }).length,
          hit_rate: sub.length ? sub.filter(function (r) { return r.hit; }).length / sub.length : null };
      }),
      rows: rows,
      /* THE "NO SAFE MOMENT LEFT" CALLS, kept apart from the scored ones. They
       * are a real claim and a gradeable one, but not THIS grade — folding them
       * in would credit the model for the calls where it offered no deadline. */
      no_deadline: noDeadline,
      /* A NULL IS NOT A SCORE. Nothing resolvable yet means exactly that, and
       * the caller must not read `hit_rate: null` as a failure. */
      resolvable: n > 0,
    };
  }

  const api = { resolveSurvival, resolveRun, resolveLrm,
    expectedBestByPos, adpDrift, effectiveAdp, effectiveSd,
    CFG, URGENCY, urgency,
    normalCdf, adpSd,
    layer1Taken, layer1TakenGivenAvailable, layer2Taken, precomputeLayer2,
    positionProbabilities, withinPositionProbability, withinFromPool,
    runMultipliers, detectRuns, layer2Weight, withinPrecision,
    roundOf, tendencyTilt, bucketMix, openingTilt, runFollowTilt,
    // The gated room prior's data — exported so room_prior.test.js can hold it
    // against draft/data/draft_behavior.json (the drift guard).
    LEAGUE_MIX,
    affinityMultiplier, tendencyReasons,
    roomMixture,
    survivalProbability,
    positionSoftmax, poolSoftmax, memoStats, resetMemoStats,
    bumpBoard, boardVersion,
    conservedSurvival, solveTilt,
    // THE SCALE CONVERTER AND ITS COUNTERS, EXPORTED ON PURPOSE. "Did the
    // board-slot -> live-selection conversion actually run" must be a fact a
    // test and a surface can read, not a thing anyone assumes. `SCALE` is the
    // live evidence: unconverted > 0 with a pick board present means the
    // context is not being threaded and every survival number is on the wrong
    // scale, which is exactly how this defect survived until 2026-08-14.
    liveIndexOf, SCALE,
  };
  global.DraftSurvival = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
