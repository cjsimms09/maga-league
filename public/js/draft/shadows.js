/* PHASE H — shadow rosters (strategy-hunt-learning-seed.md, Phase H).
 *
 * "Would this strategy have worked?" answered the only way a replay can't:
 * run them all, live, silently. After every REAL pick of mine, each strategy
 * drafts its own counterfactual pick at my slot, from the board AS IT ACTUALLY
 * STOOD when my pick arrived. The 2026 season then grades every shadow roster
 * out-of-sample, in dollars.
 *
 * The four build requirements, implemented exactly:
 *  1. Correct board state per shadow pick — the caller hands the exact board;
 *     every shadow pick logs a BOARD-STATE HASH so the robot can assert the
 *     sequencing (a shadow pick against the wrong snapshot is a bug).
 *  2. Hard filters yes, personal taste no — shadows go through E.recommend,
 *     which carries the legality rails, and NEVER receive my targets/never
 *     lists (those live in onTheClock, which shadows do not call).
 *  3. Freeze means freeze — each shadow stamps strategy name, WEIGHT-FUNCTION
 *     HASH, board built_at and a frozen flag. Grading refuses a roster whose
 *     strategy hash no longer matches the code (gradeGuard).
 *  4. Rehearsal flagging — mock/rehearsal shadows carry rehearsal:true and are
 *     never mixed with real draft-night entries.
 *
 * Deterministic: no Date.now/Math.random anywhere; timestamps come from the
 * caller (the board's built_at), hashes are FNV-1a.
 */
(function (global) {
  'use strict';

  const E = (typeof module !== 'undefined' && module.exports)
    ? require('./engine.js')
    : global.DraftEngine;

  /* The strategy set: Default plus the named profiles the backtest races,
   * expressed as round-aware weight functions over the engine's DEFAULT_WEIGHTS.
   * Mirrors draft/backtest/strategies.js — if the Phase-S table promotes a
   * winner, it is one of these keys. */
  function profiles() {
    const B = E.DEFAULT_WEIGHTS;
    const scale = over => Object.assign({}, B, over);
    return [
      { key: 'default', name: 'Default', weights: () => scale({}) },
      { key: 'value_anchor', name: 'Value-Anchor',
        weights: () => ({ value: B.value, tier: B.tier / 2, need: B.need / 2,
          risk: B.risk / 2, ceiling: B.ceiling / 2, keeper: B.keeper / 2,
          bye: B.bye / 2, stack: B.stack / 2 }) },
      { key: 'tier_hunter', name: 'Tier-Hunter', weights: () => scale({ tier: B.tier * 2 }) },
      { key: 'need_filler', name: 'Need-Filler', weights: () => scale({ need: B.need * 2 }) },
      { key: 'upside_late', name: 'Upside-Late',
        weights: r => scale({ ceiling: B.ceiling * (1 + Math.max(0, r - 4) * 0.5) }) },
      { key: 'scarcity', name: 'Scarcity',
        weights: () => scale({ tier: B.tier * 1.5, need: B.need * 1.5, risk: B.risk * 0.5 }) },
      { key: 'keeper_builder', name: 'Keeper-Builder',
        weights: r => scale({ keeper: B.keeper * (r >= 8 ? 2 : 1) }) },
    ];
  }

  /* FNV-1a 32-bit over a string; hex. Cheap, deterministic, dependency-free. */
  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  /* Requirement 1: the board snapshot's fingerprint — sorted ids, so the same
   * set of available players always hashes identically. */
  function boardHash(board) {
    return fnv((board || []).map(p => String(p.player_id)).sort().join(','));
  }

  /* Requirement 3: the weight FUNCTION's fingerprint — the weights it emits at
   * every round, serialized with sorted keys. A changed strategy changes this. */
  function weightHash(profile, rounds) {
    const rows = [];
    for (let r = 1; r <= (rounds || 15); r++) {
      const w = profile.weights(r);
      rows.push(r + ':' + Object.keys(w).sort().map(k => k + '=' + w[k]).join(','));
    }
    return fnv(rows.join('|'));
  }

  function create(opts) {
    opts = opts || {};
    const strategies = {};
    profiles().forEach(p => {
      strategies[p.key] = {
        key: p.key, name: p.name,
        weight_hash: weightHash(p, opts.rounds || 15),
        roster: [], log: [],
      };
    });
    return {
      strategies: strategies,
      rehearsal: !!opts.rehearsal,     // requirement 4
      frozen: false,
      built_at: opts.built_at || null,
    };
  }

  /**
   * My real pick just arrived. Each shadow drafts at this slot from `board` —
   * the board AS IT STOOD (including the player I actually took).
   *
   * baseCtx carries the real pick context (currentPick/nextPick/league/...);
   * the shadow swaps in its OWN roster and its board-minus-own-picks, and its
   * strategy's weights for this round. No taste lists ever enter here (req 2).
   */
  function onMyPick(shadows, board, baseCtx, round) {
    if (shadows.frozen) return [];
    const bh = boardHash(board);
    const defs = profiles();
    const out = [];
    Object.keys(shadows.strategies).forEach(key => {
      const s = shadows.strategies[key];
      const def = defs.find(d => d.key === key);
      if (!def) return;
      const mine = new Set(s.roster.map(p => String(p.player_id)));
      // The real board minus the players THIS shadow already holds (history
      // never removed them; a shadow cannot roster a player twice).
      const myBoard = board.filter(p => !mine.has(String(p.player_id)));
      if (!myBoard.length) return;
      const ctx = Object.assign({}, baseCtx, {
        board: myBoard,
        roster: s.roster,
        weights: def.weights(round || 1),
      });
      const scored = E.recommend(ctx);
      const choice = scored.length ? scored[0].player : myBoard[0];
      s.roster.push(choice);
      const rec = {
        pick_no: baseCtx.currentPick, round: round || 1,
        board_hash: bh,                                   // requirement 1
        player_id: String(choice.player_id), name: choice.name,
        position: choice.position,
        strategy: key, weight_hash: s.weight_hash,
        rehearsal: shadows.rehearsal,                     // requirement 4
      };
      s.log.push(rec);
      out.push(rec);
    });
    return out;
  }

  /* Requirement 3: freeze at draft end. After this, no shadow moves. */
  function freeze(shadows, meta) {
    shadows.frozen = true;
    Object.keys(shadows.strategies).forEach(key => {
      const s = shadows.strategies[key];
      s.frozen = true;
      s.built_at = (meta && meta.built_at) || shadows.built_at;
      s.rehearsal = shadows.rehearsal;
    });
    return shadows;
  }

  /* Requirement 3, the other half: September grading MUST refuse a roster whose
   * strategy hash no longer matches the code. A changed strategy is a different
   * strategy — it does not inherit an old roster's outcome. */
  function gradeGuard(shadowStrategy, rounds) {
    const def = profiles().find(d => d.key === shadowStrategy.key);
    if (!def) return { ok: false, reason: 'strategy ' + shadowStrategy.key + ' no longer exists' };
    const now = weightHash(def, rounds || 15);
    if (now !== shadowStrategy.weight_hash) {
      return { ok: false, reason: 'weight-function hash changed (' + shadowStrategy.weight_hash
        + ' -> ' + now + ') — a changed strategy must not be graded on an old roster' };
    }
    if (!shadowStrategy.frozen) return { ok: false, reason: 'roster is not frozen' };
    return { ok: true };
  }

  const api = { profiles, boardHash, weightHash, create, onMyPick, freeze, gradeGuard };
  global.DraftShadows = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
