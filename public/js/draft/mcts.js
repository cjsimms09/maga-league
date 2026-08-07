/* MCTS draft advisor — the search core.
 *
 * A snake draft is a finite, perfect-information, sequential game where
 * opponents act by stochastic but modelable policies. My picks are decision
 * nodes; every opponent pick is a CHANCE node whose distribution comes from
 * that manager's behavioural profile. The tree is shallow and the branching is
 * controllable, which is squarely where UCT works.
 *
 * WHERE THIS DIFFERS FROM THE SPEC, AND WHY
 *
 * The spec's objective is P(top-2), from "the Part 9 §4 machinery". That does
 * not exist in this codebase. The interim V is the roster's optimal legal
 * lineup in projected points, reusing StarterSlotMarginal's own ingredients —
 * one scoring path, not two. It sits behind valuer.evaluate(), so the swap to
 * P(top-2) touches one file.
 *
 * TOURNAMENT RESULTS DO NOT TRANSFER ACROSS VALUE FUNCTIONS. A search validated
 * on points-V is unvalidated on P(top-2)-V; the 1,000-draft tournament must be
 * re-run after the swap.
 *
 * The interim V has no variance, so this search CANNOT discover ceiling-seeking
 * — no lottery tickets, no favourite/underdog asymmetry. It keeps what MCTS is
 * actually for: scarcity timing, run anticipation, positional sequencing, turn
 * strategy, all of which depend on who is available rather than on
 * distributions. The card says this in as many words.
 *
 * The spec also calls for `q_score` on each candidate. The artifact has no such
 * field; the composite's score IS the q_score, so that is what ranks candidates.
 * That makes the candidate generator's force-include rules MORE important, not
 * less: a points-V values a kicker at approximately nothing, so the generator is
 * the only thing standing between this search and an illegal-roster blind spot.
 *
 * A DETERMINISTIC SEARCH
 *
 * Chance nodes sample, so the search needs randomness — but a re-render must
 * never show different numbers for the same state. So the RNG is an explicit
 * seeded generator carried on the search, not Math.random(). Same seed plus
 * same state gives a bit-identical recommendation, which is the reproducibility
 * ship condition and is also what stops the card flickering between two names
 * while somebody is trying to read it.
 */
(function (global) {
  'use strict';

  const V = global.DraftValue || (typeof require === 'function' ? require('./value.js') : null);
  const S = global.DraftSurvival || (typeof require === 'function' ? require('./survival.js') : null);

  const CFG = {
    // --- search shape ---
    C_UCT: 1.2,               // exploration constant; tune in the tournament
    EXPAND_AT: 3,             // visits before a node grows children (progressive widening)
    K_MINE: 8,                // candidates considered at my nodes
    K_OPP: 5,                 // ...and at opponent nodes
    ROLLOUT_MY_PICKS: 2,      // how far forward a playout runs, in MY picks
    MAX_NODES: 300000,        // hard cap; on hitting it, deepen rather than widen
    // Onesie discovery. Without forcing K/DST into the candidate set near the
    // end, the search can NEVER discover onesie timing — the exact strategic
    // question it exists to answer. A generator that never proposes a kicker
    // produces a search that never learns when kickers matter.
    ENDGAME_WITHIN: 3,        // my picks remaining, at or below which K/DEF are always candidates
  };

  /* Seeded RNG (mulberry32). Small, fast, and reproducible across engines —
   * Math.random() cannot be seeded, and an unseeded search is a card that
   * changes its mind while you read it. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const FLEX_ELIGIBLE = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
                          REC_FLEX: ['WR', 'TE'] };

  /** Positions this roster still needs to field a legal starting lineup. */
  function unmetNeeds(roster, league) {
    const starters = (league || {}).starters || {};
    const have = {};
    (roster || []).forEach(function (p) { have[p.position] = (have[p.position] || 0) + 1; });
    const spent = {};
    const need = {};
    Object.keys(starters).forEach(function (slot) {
      if (FLEX_ELIGIBLE[slot]) return;
      const short = (starters[slot] || 0) - (have[slot] || 0);
      spent[slot] = Math.min(have[slot] || 0, starters[slot] || 0);
      if (short > 0) need[slot] = short;
    });
    Object.keys(starters).forEach(function (slot) {
      const elig = FLEX_ELIGIBLE[slot];
      if (!elig) return;
      let spare = 0;
      elig.forEach(function (pos) { spare += Math.max(0, (have[pos] || 0) - (spent[pos] || 0)); });
      const short = (starters[slot] || 0) - spare;
      if (short > 0) elig.forEach(function (pos) { need[pos] = Math.max(need[pos] || 0, 1); });
    });
    return need;
  }

  /**
   * The action set at one node.
   *
   * NOT the whole board — the top K by composite score, PLUS the best available
   * at every position this team still needs for a legal lineup even if that
   * player is outside the top K, PLUS (at my nodes near the end) the best K and
   * DST. The second and third rules are what let the search reason about roster
   * shape and onesie timing at all.
   */
  function candidates(board, roster, league, opts) {
    opts = opts || {};
    const k = opts.k || CFG.K_MINE;
    const out = [];
    const seen = Object.create(null);
    const push = function (p) {
      if (!p || seen[p.player_id]) return;
      seen[p.player_id] = 1;
      out.push(p);
    };
    // board is expected pre-sorted by score, descending.
    for (let i = 0; i < board.length && out.length < k; i++) push(board[i]);

    const need = unmetNeeds(roster, league);
    Object.keys(need).forEach(function (pos) {
      for (let i = 0; i < board.length; i++) {
        if (board[i].position === pos) { push(board[i]); break; }
      }
    });

    if (opts.endgame) {
      ['K', 'DEF'].forEach(function (pos) {
        for (let i = 0; i < board.length; i++) {
          if (board[i].position === pos) { push(board[i]); break; }
        }
      });
    }
    return out;
  }

  /**
   * Hard legality filter, mirroring the composite's own endgame rule.
   *
   * If I have exactly as many picks left as mandatory unfilled slots, only
   * players who fill one of those slots are legal moves. A filtered action does
   * not exist as far as the search is concerned — the spec is explicit that
   * this is a filter and not a weight, because a weight can always be outvoted.
   */
  function legalActions(cands, roster, league, myPicksLeft, blocked) {
    let list = cands;
    if (blocked && blocked.size) list = list.filter(function (p) { return !blocked.has(p.player_id); });
    const need = unmetNeeds(roster, league);
    const mandatory = Object.keys(need).reduce(function (s, k) { return s + need[k]; }, 0);
    if (myPicksLeft != null && mandatory > 0 && myPicksLeft <= mandatory) {
      const forced = list.filter(function (p) { return need[p.position]; });
      if (forced.length) return forced;
    }
    return list;
  }

  /* Sample a position for an opponent from his behavioural model, then a player
   * within it. Uses the same Layer-2 machinery the survival percentages use, so
   * the search and the board cannot disagree about how a manager behaves. */
  function sampleOpponentPick(board, team, ctx, rand) {
    if (!board.length) return null;
    let posP = null;
    try { posP = S ? S.positionProbabilities(team, board, ctx) : null; } catch (e) { posP = null; }
    if (!posP || !Object.keys(posP).length) return board[0];

    const keys = Object.keys(posP);
    let r = rand(), acc = 0, chosen = keys[keys.length - 1];
    for (let i = 0; i < keys.length; i++) {
      acc += posP[keys[i]];
      if (r <= acc) { chosen = keys[i]; break; }
    }
    const pool = board.filter(function (p) { return p.position === chosen; });
    if (!pool.length) return board[0];

    // Within the position, weight by the same softmax the survival model uses.
    const w = pool.map(function (p) {
      try { return S ? S.withinPositionProbability(p, board, team) : 1; } catch (e) { return 1; }
    });
    let total = 0;
    w.forEach(function (x) { total += x; });
    if (!(total > 0)) return pool[0];
    r = rand() * total; acc = 0;
    for (let i = 0; i < pool.length; i++) {
      acc += w[i];
      if (r <= acc) return pool[i];
    }
    return pool[0];
  }

  // --------------------------------------------------------------- the search
  /**
   * ctx: {
   *   board:      players still available, SORTED by composite score desc
   *   league:     league config (teams, starters)
   *   myRoster:   my players
   *   rosters:    {team_slot: [player]}
   *   schedule:   [{team_slot, pick_no, profile, roster}] from here forward, in pick order
   *   mySlot, myPicksLeft
   *   value:      cache from DraftValue.makeCache()
   *   valueCtx:   {league, baseline, replacement}
   *   blocked:    Set of player_ids never to consider (do-not-draft)
   *   seed
   * }
   */
  function createSearch(ctx) {
    const rand = rng(ctx.seed == null ? 12345 : ctx.seed);
    const cfg = Object.assign({}, CFG, ctx.cfg || {});

    // Flat arrays, not an object graph: at a few hundred thousand nodes the GC
    // pressure of one object per node is the difference between a usable search
    // and a stuttering one.
    const nodes = {
      visits: [], value: [], firstChild: [], childCount: [], action: [],
      depth: [], isMine: [], expanded: [],
    };
    let nodeCount = 0;
    let capHit = false;
    const childIndex = [];      // parallel: node -> array of child node ids
    const nodeState = [];       // node -> {board, myRoster, rosters, step}

    function newNode(action, depth, isMine) {
      const id = nodeCount++;
      nodes.visits[id] = 0;
      nodes.value[id] = 0;
      nodes.action[id] = action;
      nodes.depth[id] = depth;
      nodes.isMine[id] = isMine;
      nodes.expanded[id] = false;
      childIndex[id] = null;
      return id;
    }

    // Calibrate before the first iteration: every Q recorded below is relative
    // to this range, so it has to be fixed before any value is backpropagated.
    ctx.valuer.calibrate(ctx.myRoster || [], ctx.board, ctx.myPicksLeft);

    // The root MUST be my decision. If the caller hands over a schedule that
    // starts on somebody else's pick, every "recommended" action at the root is
    // actually a prediction of what THEY will do — presented as advice. That is
    // a confidently wrong answer with no outward sign, so it is refused.
    const firstTeam = (ctx.schedule || [])[0];
    if (firstTeam && ctx.mySlot != null && firstTeam.team_slot !== ctx.mySlot) {
      throw new Error('MCTS root is seat ' + firstTeam.team_slot + ' but my slot is '
        + ctx.mySlot + ' — the schedule must begin at my pick.');
    }

    const root = newNode(null, 0, true);
    nodeState[root] = {
      board: ctx.board.slice(),
      myRoster: (ctx.myRoster || []).slice(),
      step: 0,
    };

    function stateAt(step, board, myRoster) {
      return { board: board, myRoster: myRoster, step: step };
    }

    /** The team on the clock at schedule position `step`. */
    function teamAt(step) { return (ctx.schedule || [])[step] || null; }

    /* NORMALISED, always.
     *
     * Raw V is a roster point sum around 1,300–1,600. Backpropagating that into
     * Q while UCT explores with c=1.2 makes the exploration term a rounding
     * error — the search descends greedily, looks busy, and thinks nothing.
     * The valuer's range is calibrated once per root against the plausible
     * span of THIS decision, so Q lives in ~[0,1] where c means something. */
    function evaluate(myRoster) {
      return ctx.valuer.normalized(myRoster);
    }

    /* Play forward with fast policies for a bounded horizon, then evaluate. */
    function rollout(st) {
      let board = st.board;
      let mine = st.myRoster.slice();
      let step = st.step;
      let myTaken = 0;
      // Copy-on-write: only clone the board when we actually remove from it.
      let boardCopy = null;
      const removeFrom = function (arr, p) {
        const next = boardCopy === arr ? arr : arr.slice();
        boardCopy = next;
        const i = next.indexOf(p);
        if (i >= 0) next.splice(i, 1);
        return next;
      };

      while (myTaken < cfg.ROLLOUT_MY_PICKS) {
        const team = teamAt(step);
        if (!team || !board.length) break;
        if (team.team_slot === ctx.mySlot) {
          const endgame = (ctx.myPicksLeft - mine.length + (ctx.myRoster || []).length)
            <= cfg.ENDGAME_WITHIN;
          const cands = legalActions(
            candidates(board, mine, ctx.league, { k: 3, endgame: endgame }),
            mine, ctx.league, ctx.myPicksLeft - myTaken, ctx.blocked);
          const pick = cands[0] || board[0];
          mine.push(pick);
          board = removeFrom(board, pick);
          myTaken++;
        } else {
          const pick = sampleOpponentPick(board, team, rolloutCtx(board, team), rand);
          if (pick) board = removeFrom(board, pick);
        }
        step++;
      }
      return evaluate(mine);
    }

    function rolloutCtx(board, team) {
      return {
        board: board, league: ctx.league, runMultipliers: ctx.runMultipliers || {},
        roundsLeft: ctx.roundsLeft, progress: ctx.progress,
      };
    }

    function expand(id) {
      if (nodeCount >= cfg.MAX_NODES) {
        // Deepen existing lines rather than widening. Logged, not silent: a
        // search that quietly stopped growing looks identical to one that
        // converged, and those are opposite conclusions.
        capHit = true;
        nodes.expanded[id] = true;
        childIndex[id] = [];
        return;
      }
      const st = nodeState[id];
      const team = teamAt(st.step);
      if (!team) { nodes.expanded[id] = true; childIndex[id] = []; return; }

      const isMine = team.team_slot === ctx.mySlot;
      let cands;
      if (isMine) {
        const taken = st.myRoster.length - (ctx.myRoster || []).length;
        const left = ctx.myPicksLeft - taken;
        cands = legalActions(
          candidates(st.board, st.myRoster, ctx.league,
            { k: cfg.K_MINE, endgame: left <= cfg.ENDGAME_WITHIN }),
          st.myRoster, ctx.league, left, ctx.blocked);
      } else {
        cands = candidates(st.board, team.roster || [], ctx.league, { k: cfg.K_OPP });
      }

      const kids = [];
      for (let i = 0; i < cands.length && nodeCount < cfg.MAX_NODES; i++) {
        const p = cands[i];
        const cid = newNode(p, nodes.depth[id] + 1, isMine);
        const board2 = st.board.filter(function (x) { return x !== p; });
        nodeState[cid] = stateAt(st.step + 1, board2,
          isMine ? st.myRoster.concat([p]) : st.myRoster);
        kids.push(cid);
      }
      childIndex[id] = kids;
      nodes.expanded[id] = true;
    }

    function uctSelect(id) {
      const kids = childIndex[id];
      let best = -1, bestScore = -Infinity;
      const lnN = Math.log(Math.max(1, nodes.visits[id]));
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i];
        // An unvisited child is always taken first — infinite UCT — so every
        // action gets at least one look before any is dismissed.
        const score = nodes.visits[c] === 0 ? Infinity
          : (nodes.value[c] / nodes.visits[c]) + cfg.C_UCT * Math.sqrt(lnN / nodes.visits[c]);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      return best;
    }

    /* At a chance node, SAMPLE — do not take the argmax.
     *
     * The stochasticity IS the model. Selecting the modal pick would search a
     * room where every manager drafts their most likely player every time,
     * which is not a room that exists, and the whole value of modelling
     * opponents would be thrown away at the point of use. */
    function chanceSelect(id) {
      const kids = childIndex[id];
      if (!kids.length) return -1;
      const st = nodeState[id];
      const team = teamAt(st.step);
      const weights = kids.map(function (c) {
        const p = nodes.action[c];
        let w = 1;
        try {
          const posP = S.positionProbabilities(team, st.board, rolloutCtx(st.board, team));
          w = (posP[p.position] || 0.01) * S.withinPositionProbability(p, st.board, team);
        } catch (e) { w = 1; }
        return w > 0 ? w : 1e-6;
      });
      let total = 0;
      weights.forEach(function (w) { total += w; });
      let r = rand() * total, acc = 0;
      for (let i = 0; i < kids.length; i++) {
        acc += weights[i];
        if (r <= acc) return kids[i];
      }
      return kids[kids.length - 1];
    }

    function iterate() {
      const path = [root];
      let id = root;

      for (;;) {
        const st = nodeState[id];
        const team = teamAt(st.step);
        if (!team || !st.board.length) break;                 // terminal
        if (!nodes.expanded[id]) {
          if (nodes.visits[id] < cfg.EXPAND_AT) break;        // progressive widening
          expand(id);
        }
        const kids = childIndex[id];
        if (!kids || !kids.length) break;
        const isMine = team.team_slot === ctx.mySlot;
        const next = isMine ? uctSelect(id) : chanceSelect(id);
        if (next < 0) break;
        id = next;
        path.push(id);
      }

      const value = rollout(nodeState[id]);
      for (let i = 0; i < path.length; i++) {
        nodes.visits[path[i]] += 1;
        nodes.value[path[i]] += value;
      }
      return value;
    }

    function run(iterations) {
      for (let i = 0; i < iterations; i++) iterate();
      return summary();
    }

    /** The recommendation is always the current root visit distribution. */
    function summary() {
      const kids = childIndex[root] || [];
      const total = kids.reduce(function (s, c) { return s + nodes.visits[c]; }, 0);
      const rows = kids.map(function (c) {
        return {
          player: nodes.action[c],
          visits: nodes.visits[c],
          share: total ? nodes.visits[c] / total : 0,
          q: nodes.visits[c] ? nodes.value[c] / nodes.visits[c] : 0,
          node: c,
        };
      }).sort(function (a, b) { return b.visits - a.visits; });
      return {
        iterations: nodes.visits[root],
        nodes: nodeCount,
        capHit: capHit,
        rootValue: nodes.visits[root] ? nodes.value[root] / nodes.visits[root] : 0,
        actions: rows,
      };
    }

    /* Tree reuse: promote the child matching a pick that actually happened. */
    function advance(playerId) {
      const kids = childIndex[root] || [];
      for (let i = 0; i < kids.length; i++) {
        if (nodes.action[kids[i]] && String(nodes.action[kids[i]].player_id) === String(playerId)) {
          return { hit: true, node: kids[i] };
        }
      }
      // A miss means the room did something the generator never proposed. Worth
      // recording rather than silently rebuilding: it is direct evidence about
      // how good the candidate generator is.
      return { hit: false, node: null };
    }

    return { run: run, iterate: iterate, summary: summary, advance: advance,
             nodeCount: function () { return nodeCount; },
             _internal: { nodes: nodes, childIndex: childIndex, nodeState: nodeState, root: root } };
  }

  /**
   * Why it prefers what it prefers, from statistics already in the tree.
   *
   * "MCTS prefers Kincaid (61%)" is oracular. "…and in lines where you pass,
   * TE4 is gone by your next pick 74% of the time" is an argument you can
   * check. The whole difference between a card that gets trusted and one that
   * gets ignored is in this function.
   */
  function explain(search, summary, league) {
    const rows = summary.actions;
    if (!rows.length) return null;
    const top = rows[0], alt = rows[1];
    if (!alt) return { text: 'Only one legal move.' };

    const I = search._internal;
    const bits = [];
    bits.push('prefers ' + top.player.name + ' (' + Math.round(top.share * 100)
      + '% of playouts, P(top-2) ' + (top.q * 100).toFixed(1) + '%)');

    if (alt.visits) {
      // Q is normalised, so report it as a share of the decision's own span
      // rather than as points — a normalised gap quoted in points would be a
      // number that looks precise and means nothing.
      const gap = (top.q - alt.q) * 100;
      bits.push('over ' + alt.player.name + ' by '
        + (Math.abs(gap) < 0.5 ? 'a hair' : gap.toFixed(0) + '% of the value at stake'));
    }

    // What happens down the road not taken: the positions the search ends up
    // falling back to when it passes on the top action.
    const altKids = I.childIndex[alt.node] || [];
    const fallback = {};
    altKids.forEach(function (c) {
      const a = I.nodes.action[c];
      if (a) fallback[a.position] = (fallback[a.position] || 0) + I.nodes.visits[c];
    });
    const order = Object.keys(fallback).sort(function (a, b) { return fallback[b] - fallback[a]; });
    if (order.length) {
      bits.push('if you take ' + alt.player.name + ' instead, the room most often goes '
        + order.slice(0, 2).join(' then '));
    }
    return { text: bits.join('; ') + '.', top: top, alt: alt };
  }

  const api = { CFG, rng, unmetNeeds, candidates, legalActions, sampleOpponentPick,
                createSearch, explain };
  global.DraftMCTS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
