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
    ADP_SD_FLOOR: 3.0,          // nobody is unsure about pick 1
    ADP_SD_RATE: 0.22,          // uncertainty grows with ADP
    NEAR_HORIZON: 24,           // picks over which Layer 2 is fully trusted
    BLEND_DECAY: 12,            // picks over which Layer 2's weight decays past the horizon
    WITHIN_POS_TEMP: 0.35,      // softmax temperature for "which player at this position"
    WITHIN_POS_CANDIDATES: 6,   // how deep to consider inside a position
    DEFAULT_ALPHA_NEED: 1.0,    // league-average manager: need weight
    DEFAULT_BETA_VALUE: 1.0,    // league-average manager: value weight
    K_DST_FORCED_ROUNDS: 2,     // K/DST become forced picks in the final N rounds
    RUN_WINDOW: 10,
    RUN_DAMPING: 0.5,
    RUN_MIN: 0.6,
    RUN_MAX: 1.8,
    RUN_BANNER_AT: 1.4,
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
    return Math.max(CFG.ADP_SD_FLOOR, CFG.ADP_SD_RATE * adpMean);
  }
  const adpOf = p => p.adjusted_adp || p.raw_adp || 9999;

  // =============================================== Layer 1 — ADP baseline
  function layer1Taken(player, pick) {
    return normalCdf(pick, adpOf(player), adpSd(adpOf(player), player.adp_sd));
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
  function layer1TakenGivenAvailable(player, pick, currentPick) {
    const fN = layer1Taken(player, pick);
    if (currentPick == null || currentPick <= 0) return fN;
    const fC = layer1Taken(player, currentPick);
    if (fC >= 0.999) return 1;           // he should already be gone; treat as gone
    return Math.max(0, Math.min(1, (fN - fC) / (1 - fC)));
  }

  // ==================================== Layer 2 — roster-need-aware model
  /**
   * P(this team takes this position with this pick).
   * softmax( α × need(t,p) + β × bestAvailableValue(p) ) per the spec.
   */
  function positionProbabilities(team, board, ctx) {
    const league = ctx.league || {};
    const starters = league.starters || {};
    const progress = ctx.progress == null ? 0.5 : ctx.progress;
    const roster = team.roster || [];
    const profile = team.profile || null;
    const alpha = profile && profile.softmax ? profile.softmax.alpha_need : CFG.DEFAULT_ALPHA_NEED;
    const beta = profile && profile.softmax ? profile.softmax.beta_value : CFG.DEFAULT_BETA_VALUE;

    // Best available VORP per position, normalised so β is scale-free.
    const bestByPos = {};
    board.forEach(p => {
      const v = p.vorp == null ? 0 : p.vorp;
      if (bestByPos[p.position] == null || v > bestByPos[p.position]) bestByPos[p.position] = v;
    });
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
    return out;
  }

  /** P(this specific player is the one taken, given the position is taken). */
  function withinPositionProbability(player, board, team) {
    const pool = board.filter(p => p.position === player.position)
      .sort((a, b) => (b.vorp || b.proj_mean || 0) - (a.vorp || a.proj_mean || 0))
      .slice(0, CFG.WITHIN_POS_CANDIDATES);
    if (!pool.length) return 0;
    const idx = pool.findIndex(p => String(p.player_id) === String(player.player_id));
    if (idx === -1) return 0;

    // A reacher spreads probability down the list; a value drafter concentrates
    // it on the top name.
    let temp = CFG.WITHIN_POS_TEMP;
    if (team && team.profile && team.profile.reach_delta) {
      temp = Math.max(0.15, Math.min(0.9, CFG.WITHIN_POS_TEMP
        + 0.02 * Math.max(0, team.profile.reach_delta.mean)));
    }
    const scores = pool.map(p => (p.vorp == null ? p.proj_mean || 0 : p.vorp));
    const max = Math.max.apply(null, scores);
    let sum = 0;
    const exps = scores.map(s => { const e = Math.exp((s - max) * temp / 10); sum += e; return e; });
    return exps[idx] / sum;
  }

  /**
   * P(taken before targetPick) from the picks that actually happen in between.
   * ctx.intervening: [{team_slot, roster, profile, pick_no}] in pick order.
   */
  function layer2Taken(player, targetPick, ctx) {
    const intervening = (ctx.intervening || []).filter(
      t => t.pick_no >= (ctx.currentPick || 0) && t.pick_no < targetPick);
    if (!intervening.length) return null; // nothing to model — caller falls back
    // The last pick this layer can actually speak to. Beyond it the caller must
    // continue with Layer 1 rather than pretend Layer 2 covered the whole range.
    const windowEnd = Math.min(targetPick,
      Math.max.apply(null, intervening.map(t => t.pick_no)) + 1);

    let survives = 1;
    // The board shrinks as picks happen; approximate by removing the most
    // likely pick at each step rather than re-simulating (fast, and the error
    // is small over a 12-24 pick window).
    let board = (ctx.board || []).slice();
    for (let i = 0; i < intervening.length; i++) {
      const team = intervening[i];
      const posProbs = positionProbabilities(team, board, Object.assign({}, ctx, {
        progress: ctx.totalPicks ? team.pick_no / ctx.totalPicks : 0.5,
        roundsLeft: ctx.roundsLeft,
      }));
      const pPos = posProbs[player.position] || 0;
      const pWithin = withinPositionProbability(player, board, team);
      survives *= (1 - pPos * pWithin);

      // Remove the modal pick so later teams see a thinner board.
      const topPos = Object.keys(posProbs).sort((a, b) => posProbs[b] - posProbs[a])[0];
      if (topPos) {
        let bestIdx = -1, bestVal = -Infinity;
        for (let j = 0; j < board.length; j++) {
          if (board[j].position !== topPos) continue;
          const v = board[j].vorp == null ? board[j].proj_mean || 0 : board[j].vorp;
          if (v > bestVal) { bestVal = v; bestIdx = j; }
        }
        if (bestIdx >= 0 && String(board[bestIdx].player_id) !== String(player.player_id)) {
          board = board.slice(0, bestIdx).concat(board.slice(bestIdx + 1));
        }
      }
    }
    return { taken: 1 - survives, windowEnd };
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
      ? layer1TakenGivenAvailable(player, targetPick, ctx.currentPick)
      : layer1Taken(player, targetPick);

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
        const t1Window = layer1TakenGivenAvailable(player, l2.windowEnd, cur);
        const takenInWindow = w * l2.taken + (1 - w) * t1Window;
        const survivesWindow = 1 - takenInWindow;
        // Remainder: P(taken between windowEnd and targetPick | survived to windowEnd)
        const takenAfter = layer1TakenGivenAvailable(player, targetPick, l2.windowEnd);
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

  const api = {
    CFG, URGENCY, urgency,
    normalCdf, adpSd,
    layer1Taken, layer1TakenGivenAvailable, layer2Taken, positionProbabilities, withinPositionProbability,
    runMultipliers, detectRuns, layer2Weight,
    survivalProbability,
  };
  global.DraftSurvival = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
