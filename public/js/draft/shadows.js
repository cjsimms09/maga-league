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
  function onMyPick(shadows, board, baseCtx, round, drafted) {
    if (shadows.frozen) return [];

    /* THE AVAILABILITY GATE.
     *
     * Reported from a rehearsal: shadows were selecting players already taken,
     * which makes every shadow roster fictional and voids the counterfactual —
     * the entire point of Phase H is comparison against a team that COULD have
     * been drafted.
     *
     * An isolated repro proved THIS MODULE picks correctly when handed a
     * correctly-filtered board (0 duplicates, 0 unavailable across 42 picks and
     * 7 strategies), so the fault was upstream: `state.board` is rebuilt from
     * `state.drafted`, and seatless "✕ he is gone" marks were never entering
     * that set, so any rebuild RESURRECTED every hand-marked opponent pick.
     * Shadows then drafted men Cory had watched come off the board. That root
     * cause is fixed in attribution.markLocal.
     *
     * This gate is the second line, per the single-path rule: shadows
     * cross-check the board they are handed against the AUTHORITATIVE drafted
     * set and drop anyone already gone, counting every rejection so the guard
     * is falsifiable rather than merely reassuring. A counterfactual that
     * quietly drafts ghosts is worse than no counterfactual at all.
     */
    const gone = (drafted instanceof Set) ? drafted
      : (drafted && drafted.length ? new Set(drafted.map(String)) : null);
    if (gone && gone.size) {
      const before = board.length;
      board = board.filter(p => !gone.has(String(p.player_id)));
      shadows.rejected = (shadows.rejected || 0) + (before - board.length);
    }
    if (!board.length) return [];

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

  /* THE PROJECTION (read-only) — what each strategy would take from the board AS
   * IT STANDS RIGHT NOW, committing NOTHING.
   *
   * onMyPick() BUILDS counterfactual rosters over the draft: stateful, fires only
   * at my picks, mutates each shadow's roster. That is the 2026-grading record.
   * This is the OTHER question the war-room panel asks — "what does each strategy
   * WANT at this decision" — and it must be answerable at EVERY pick, from the
   * live board and my current roster, whether or not I have picked yet. It runs
   * each strategy's weights through the same E.recommend (same legality rails, no
   * taste lists) and returns the top choice, without touching any shadow state. So
   * the strategy-split panel is always populated and always honest, instead of
   * blank until the first shadow commit — the "it renders empty" failure mode.
   *
   * Returns [{key, name, player_id, player, position, score}] — one per strategy,
   * ordered as profiles() declares them. */
  function project(board, baseCtx, round, myRoster) {
    if (!board || !board.length) return [];
    const mine = new Set((myRoster || []).map(p => String(p.player_id)));
    const avail = board.filter(p => !mine.has(String(p.player_id)));
    if (!avail.length) return [];
    const out = [];
    profiles().forEach(def => {
      const ctx = Object.assign({}, baseCtx, {
        board: avail,
        roster: myRoster || [],
        weights: def.weights(round || 1),
      });
      const scored = E.recommend(ctx);
      const choice = scored.length ? scored[0].player : avail[0];
      out.push({
        key: def.key, name: def.name,
        player_id: String(choice.player_id), player: choice.name,
        position: choice.position,
        score: scored.length ? scored[0].score : null,
      });
    });
    return out;
  }

  /* The consensus/dissent summary over a projection (or any [{player_id, player,
   * key}] list). Pure, so the panel and a test read the same split. `contested`
   * is true when the leader has less than a 75% supermajority — the signal that
   * this is a decision worth slowing down for (the tournaments said ~2 picks per
   * draft carry the edge, and strategy disagreement detects them better than any
   * hand-tuned threshold). Returns null on an empty projection. */
  function consensus(projection) {
    const rows = (projection || []).filter(r => r && r.player_id);
    if (!rows.length) return null;
    const byPlayer = {};
    rows.forEach(r => { (byPlayer[r.player_id] = byPlayer[r.player_id]
      || { player: r.player, position: r.position, keys: [] }).keys.push(r.key); });
    const ranked = Object.keys(byPlayer).sort(
      (a, b) => byPlayer[b].keys.length - byPlayer[a].keys.length);
    const n = rows.length;
    const lead = byPlayer[ranked[0]];
    const agree = lead.keys.length;
    const dissenters = ranked.slice(1).map(pid => ({
      player: byPlayer[pid].player, position: byPlayer[pid].position,
      keys: byPlayer[pid].keys,
    }));
    return {
      n, agree, lead: lead.player, lead_position: lead.position,
      contested: agree < Math.ceil(n * 0.75),
      dissenters,
    };
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

  const api = { profiles, boardHash, weightHash, create, onMyPick, project,
                consensus, freeze, gradeGuard };
  global.DraftShadows = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
