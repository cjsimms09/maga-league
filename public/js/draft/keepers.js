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
    if (model === 'top_picks_flat') {
      // POSITIONAL (mirrors keepers.py): keeping N keepers forfeits rounds 1..N.
      // Per-player the cost cannot be resolved (it depends on rank within the
      // team's kept set), so every keeper 'wants' round 1 and
      // buildTruePickOrder's collision-roll assigns 1,2,3… — which IS rounds
      // 1..N. Falling through to original_round (the old JS behaviour) was a
      // silent divergence from Python: a keeper first drafted in round 5 would
      // wrongly forfeit round 5 instead of the flat top pick.
      return 1;
    }

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

    /* ⚠️ SLEEPER DOES NOT RENUMBER, AND THIS USED TO PRETEND IT DOES.
     *
     * `survivors.forEach(p, i => p.overall = i + 1)` deleted the forfeited picks
     * and renumbered everything after them. Checked against this league's own
     * draft log on 2026-08-13: 150 picks and round 4 beginning at overall 31 in
     * 2023 (0 keepers), 2024 (23 keepers) and 2025 (20 keepers) alike. A keeper
     * OCCUPIES his pick slot with `is_keeper: true`; the pick is not removed and
     * nothing after it shifts up — so a team's own pick numbers do not depend on
     * how many players anybody else keeps.
     *
     * Cory caught it from the seat arithmetic: slot 8, round 4 is EVEN so the
     * snake reverses, slot 10 picks first, and he is the THIRD pick of the round
     * — 31, 32, 33. The renumbering said 30.
     *
     * `live_index` carries the sequence position the renumbering used to
     * provide, because `adjustedAdp` genuinely wants it: it lays the i-th best
     * available player onto the i-th SELECTION, which is a different thing from
     * the i-th board slot. Keeping them as two named fields is what stops them
     * being conflated again. */
    survivors.forEach(function (p, i) { p.live_index = i + 1; });
    const board = full.map(function (p) {
      return { overall: p.overall, round: p.round, slot: p.team_slot,
               keeper_slot: !!forfeited[p.team_slot + ':' + p.round] };
    });
    const myPicks = survivors.filter(function (p) { return p.team_slot === mySlot; })
      .map(function (p) { return p.overall; });

    return { picks: survivors, forfeited: forfeitDetail, board: board,
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
      /* SEQUENCE POSITION, NOT BOARD POSITION, AND THE CHOICE IS DELIBERATE.
       * `overall` is now the TRUE Sleeper number, so reading it here would move
       * every adjusted ADP on the board — a real question (the j-th selection
       * sits at a true overall past j once keeper slots are counted) but a
       * DIFFERENT one, with its own blast radius and its own measurement.
       * Before the numbering fix `overall` WAS `live_index`, so taking the index
       * preserves this function's behaviour exactly. Bundling the two changes is
       * how the first error happened. Mirrors keepers.py. */
      const seqAdp = i < nPicks ? order.picks[i].live_index : nPicks + (i - nPicks) + 1;
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

  /* THE KEEPER-SLATE CHECKLIST LINE — a pure function of the artifact, so it can
   * be TESTED rather than asserted about by grepping this file for prose.
   *
   * It reads `keeper_slate` and RE-DERIVES NOTHING. The version this replaced
   * counted distinct team_slots in `kept_players` and called that "seats
   * declared" — a second implementation of a question the build already answers,
   * with nothing comparing the two. That is the shape of the defect it is meant
   * to catch: the board carried 147 picks while its own slate stamp said four
   * teams had designated, and both numbers were sitting in the same file.
   *
   * The DETAIL carries the two numbers worth glancing at on draft morning —
   * first pick and total picks on the board — because under top_picks_flat every
   * keeper costs a round in 1..3, so while I keep three my first pick sits in
   * round 4 with every keeper in the league ahead of it. One subtraction checks
   * the whole slate, and it does not depend on WHICH seat holds which keepers.
   */
  function keeperSlateCheck(d) {
    const s = (d || {}).keeper_slate || {};
    const teams = ((d || {}).league || {}).teams || 10;
    if (s.designations_not_applied == null) {
      // NOT a silent fallback to the old count. A board built before the
      // reconciliation landed cannot answer this, and saying so is the honest
      // result; it clears itself on the next nightly rebuild.
      return {
        ok: false,
        label: 'Keeper slate the pick order is built on',
        detail: 'this board predates the slate reconciliation — it cannot say how '
          + 'many designations reached its pick order',
        fix: 'Rebuild: Actions → Build draft board',
      };
    }
    const dropped = Number(s.designations_not_applied) || 0;
    const inOrder = Number(s.teams_in_pick_order) || 0;
    const keepers = Number(s.keepers_in_pick_order) || 0;
    const confirmed = s.status === 'confirmed';
    /* WITHHELD ON PURPOSE is not MISSING BY ACCIDENT. Until the slate confirms,
     * the build deliberately keeps opponent designations OFF the live board so
     * its numbers stay known-provisional rather than authoritative-looking. Both
     * states leave the board short; only one is a fault, and a line that reads
     * them alike would train the reader to dismiss the one that matters. */
    const held = s.withheld_from_board || {};
    const heldKeepers = Number(held.keepers) || 0;
    const picks = (((d || {}).pick_order || {}).picks || []).length;
    const first = (((d || {}).pick_order || {}).my_picks || [])[0];
    const glance = 'first pick ' + (first == null ? '?' : first)
      + ', ' + picks + ' picks on the board, ' + keepers + ' keepers applied';

    return {
      ok: confirmed && dropped === 0,
      label: 'Keeper slate the pick order is built on',
      detail: (confirmed ? 'CONFIRMED' : String(s.status || 'predicted').toUpperCase())
        + ' — ' + inOrder + ' of ' + teams + ' seats, ' + glance
        + (heldKeepers ? ' · ' + heldKeepers + ' opponent keeper(s) WITHHELD on purpose '
            + 'until the slate confirms' : '')
        + (dropped ? ' · ' + dropped + ' DESIGNATION(S) NOT APPLIED' : ''),
      fix: dropped
        ? 'Sleeper reports ' + dropped + ' more team(s) with designations than the '
          + 'board applied — rebuild, and if it persists the generator is dropping them'
        : confirmed ? ''
          : heldKeepers
            ? 'Working as intended: partial slates are held back so these numbers stay '
              + 'known-provisional. They apply in full the moment the slate confirms — '
              + 'watch first pick ' + (first == null ? '?' : first) + ' move then'
          : 'Provisional until keeper lock. Every overall pick number, gap between '
            + 'your turns and survival window moves with the league-wide COUNT — '
            + 'so re-check first pick ' + (first == null ? '?' : first)
            + ' after the slate confirms',
    };
  }


  const api = { draftOrder, keeperCostRound, buildTruePickOrder, adjustedAdp, reapply, round2, keeperSlateCheck };
  global.DraftKeepers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
