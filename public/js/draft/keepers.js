/* Keeper adjustment, in the browser.
 *
 * WHY THIS MOVED OUT OF PYTHON
 * ----------------------------
 * Keeper adjustment used to live only in `draft/keepers.py`, so changing one
 * team's keepers meant a full pipeline rebuild. That is the wrong split: this
 * is cheap arithmetic — rank the surviving pool, lay it on the remaining pick
 * sequence, blend toward raw ADP — not a data-heavy operation. Nothing about it
 * needs the network.
 *
 * What it deliberately does NOT touch: VORP replacement level (a function of
 * roster settings and team count), tiers, and projections. None depend on
 * keepers, which is exactly why keeper adjustment separates cleanly from
 * everything expensive.
 *
 * THE DANGER
 * ----------
 * Two implementations of the same maths is how you get a silent divergence
 * that corrupts every pick number while both sides look fine. So the Python
 * and JS versions are pinned to a SHARED FIXTURE — `draft/fixtures/keeper_vectors.json`
 * — and both test suites assert against it. If they ever disagree, both suites
 * go red. Do not change one side without regenerating the vectors and running
 * the other.
 */
(function (global) {
  'use strict';

  /** Full pick sequence before keepers. Mirrors keepers.py draft_order(). */
  function draftOrder(teams, rounds, draftType) {
    const picks = [];
    let overall = 0;
    for (let rnd = 1; rnd <= rounds; rnd++) {
      let order;
      if (draftType === 'linear') {
        order = range(1, teams);
      } else if (draftType === 'third_round_reversal') {
        // R1 forward, R2 back, R3 back again (the reversal), then normal snake.
        if (rnd === 1) order = range(1, teams);
        else if (rnd === 2 || rnd === 3) order = range(1, teams).reverse();
        else order = rnd % 2 === 0 ? range(1, teams) : range(1, teams).reverse();
      } else {
        order = rnd % 2 === 1 ? range(1, teams) : range(1, teams).reverse();
      }
      for (let i = 0; i < order.length; i++) {
        overall += 1;
        picks.push({ overall: overall, round: rnd, slot: order[i], team_slot: order[i] });
      }
    }
    return picks;
  }
  function range(a, b) {
    const out = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out;
  }

  /** Which round a keeper costs its team. null means it costs nothing. */
  function keeperCostRound(keeper, cfg) {
    const rules = cfg.keepers || {};
    const model = rules.cost_model;
    if (model === 'no_cost') return null;
    if (model === 'fixed_round') return parseInt(rules.fixed_round, 10);

    let original = keeper.original_round;
    if (original == null) {
      original = (cfg.original_rounds || {})[String(keeper.player_id)];
    }
    if (original == null) {
      if (rules.undrafted_rule === 'ineligible') {
        throw new Error((keeper.name || keeper.player_id)
          + ' was undrafted and is not keeper-eligible');
      }
      original = parseInt(rules.undrafted_round == null ? 10 : rules.undrafted_round, 10);
    }
    if (model === 'escalator') {
      const years = parseInt(keeper.years_kept == null ? 1 : keeper.years_kept, 10);
      const step = parseInt(rules.escalator_rounds == null ? 1 : rules.escalator_rounds, 10);
      return Math.max(1, parseInt(original, 10) - step * years);
    }
    return parseInt(original, 10);   // original_round
  }

  /**
   * The draft as it will actually run, once keepers eat their picks.
   * Mirrors keepers.py build_true_pick_order().
   */
  function buildTruePickOrder(cfg, keepersByTeam) {
    const teams = cfg.teams;
    const rounds = cfg.rounds || (cfg.roster_size - (cfg.keepers || {}).count);
    const full = draftOrder(teams, rounds, cfg.draft_type || 'snake');
    const mySlot = cfg.my_draft_slot;

    // Each keeper consumes its team's pick in the cost round. If that round is
    // already spent (two keepers costing the same round), roll to the next
    // unspent round — the pick still has to come from somewhere. This rule is
    // easy to lose in a port and would quietly shift every downstream pick.
    const forfeited = {};   // "slot:round" -> true
    const forfeitDetail = [];
    Object.keys(keepersByTeam).forEach(function (teamSlotKey) {
      const teamSlot = parseInt(teamSlotKey, 10);
      const list = (keepersByTeam[teamSlotKey] || []).slice().sort(function (a, b) {
        const ra = keeperCostRound(a, cfg), rb = keeperCostRound(b, cfg);
        return (ra == null ? 99 : ra) - (rb == null ? 99 : rb);
      });
      list.forEach(function (k) {
        let rnd = keeperCostRound(k, cfg);
        if (rnd == null) return;
        rnd = Math.min(Math.max(1, rnd), rounds);
        while (forfeited[teamSlot + ':' + rnd] && rnd < rounds) rnd += 1;
        if (forfeited[teamSlot + ':' + rnd]) return;   // out of picks to give
        forfeited[teamSlot + ':' + rnd] = true;
        forfeitDetail.push(Object.assign({}, k, { team_slot: teamSlot, cost_round: rnd }));
      });
    });

    const survivors = full.filter(function (p) {
      return !forfeited[p.team_slot + ':' + p.round];
    }).map(function (p) { return Object.assign({}, p); });

    const myOriginal = full.filter(function (p) { return p.team_slot === mySlot; })
      .map(function (p) { return p.overall; });
    survivors.forEach(function (p, i) {
      p.original_overall = p.overall;
      p.overall = i + 1;
    });
    const myPicks = survivors.filter(function (p) { return p.team_slot === mySlot; })
      .map(function (p) { return p.overall; });

    return { picks: survivors, forfeited: forfeitDetail,
             my_picks: myPicks, my_original_picks: myOriginal };
  }

  /**
   * Re-map ADP onto the true remaining pick sequence.
   * Mirrors keepers.py adjusted_adp() exactly, including the rounding.
   */
  function adjustedAdp(players, order, cfg, keptIds) {
    const weight = cfg.adp_blend_weight == null ? 0.7 : Number(cfg.adp_blend_weight);
    const kept = {};
    (keptIds || []).forEach(function (id) { kept[String(id)] = true; });

    const pool = players.filter(function (p) { return !kept[String(p.player_id)]; })
      .slice()
      .sort(function (a, b) {
        const ra = a.consensus_rank == null ? (a.raw_adp == null ? 9999 : a.raw_adp) : a.consensus_rank;
        const rb = b.consensus_rank == null ? (b.raw_adp == null ? 9999 : b.raw_adp) : b.consensus_rank;
        return ra - rb;
      });

    const nPicks = order.picks.length;
    const keptRanks = players.filter(function (p) { return kept[String(p.player_id)]; })
      .map(function (p) { return p.raw_adp == null ? 9999 : p.raw_adp; })
      .sort(function (a, b) { return a - b; });

    return pool.map(function (p, i) {
      const seqAdp = i < nPicks ? order.picks[i].overall : nPicks + (i - nPicks) + 1;
      const raw = p.raw_adp;
      let blended;
      if (raw == null) {
        blended = seqAdp;
      } else {
        let ahead = 0;
        for (let k = 0; k < keptRanks.length; k++) if (keptRanks[k] < raw) ahead++;
        const shifted = Math.max(1.0, raw - ahead);
        blended = weight * seqAdp + (1 - weight) * shifted;
      }
      return Object.assign({}, p, {
        adjusted_adp: round2(blended),
        pool_rank: i + 1,
      });
    });
  }

  // Python's round() is banker's rounding; JS toFixed is half-away-from-zero.
  // The vectors are generated from Python, so match Python or the shared
  // fixture test fails on values like 2.675 — which is exactly the kind of
  // silent one-pick divergence this whole file is guarded against.
  function round2(x) {
    const scaled = x * 100;
    const floor = Math.floor(scaled);
    const diff = scaled - floor;
    let n;
    if (Math.abs(diff - 0.5) < 1e-9) {
      n = (floor % 2 === 0) ? floor : floor + 1;   // ties to even
    } else {
      n = Math.round(scaled);
    }
    return n / 100;
  }

  /**
   * One call to re-derive everything a keeper or slot change invalidates.
   * This is what makes mid-draft reconciliation viable: no network, no rebuild.
   */
  function reapply(players, cfg, keepersByTeam) {
    const order = buildTruePickOrder(cfg, keepersByTeam);
    const keptIds = [];
    Object.keys(keepersByTeam).forEach(function (slot) {
      (keepersByTeam[slot] || []).forEach(function (k) {
        if (k && k.player_id != null) keptIds.push(String(k.player_id));
      });
    });
    return { order: order, players: adjustedAdp(players, order, cfg, keptIds), kept_ids: keptIds };
  }

  const api = { draftOrder, keeperCostRound, buildTruePickOrder, adjustedAdp, reapply, round2 };
  global.DraftKeepers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
