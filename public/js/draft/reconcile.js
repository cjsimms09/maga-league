/* Live keeper reconciliation.
 *
 * THE RISK THIS ADDRESSES
 * -----------------------
 * The keeper slate is an input file. Everything downstream depends on it being
 * right: adjusted ADP, which picks are forfeited, the true pick sequence, and
 * therefore MY pick numbers and every VONA measured against them. Keepers in
 * this league are finalised days before the draft, and one late change
 * invalidates every number in the tool while the screen continues to look
 * completely normal.
 *
 * Most Sleeper keeper leagues enter keepers as actual draft picks, so the sync
 * will see them. That makes the slate checkable against reality rather than
 * trusted — which is the whole idea here.
 *
 * Two discrepancies matter, and they are not symmetric:
 *
 *   A keeper we did not know about  — someone kept a player the slate says is
 *     available. He is in somebody's roster, not the pool, and a pick we
 *     thought existed does not.
 *
 *   An assumed keeper who was not kept — the slate says gone, but he is still
 *     on the board. The tool will never recommend a player it thinks is
 *     unavailable, so this one is invisible in the worst way: no error, no
 *     warning, just a player silently missing from every recommendation.
 *
 * On either, recommendations HALT rather than continue on a board known to be
 * wrong. A confidently wrong recommendation on draft day is worse than no
 * recommendation, because you will act on it.
 */
(function (global) {
  'use strict';

  /**
   * Compare observed picks against the assumed slate.
   *
   * @param picks   observed picks: {player_id, is_keeper, draft_slot, roster_id, pick_no}
   * @param assumed [{player_id, team_slot, cost_round, name}] from the artifact
   * @param opts    {currentRound, playersById}
   */
  function reconcile(picks, assumed, opts) {
    opts = opts || {};
    const byId = opts.playersById || {};
    const assumedById = {};
    (assumed || []).forEach(function (k) { assumedById[String(k.player_id)] = k; });

    const seenKeepers = {};
    const unknown = [];
    // Placement-identity mismatches: the RIGHT player was kept, but Cory
    // (placing keepers by hand the day before the draft) put him on the wrong
    // team or in the wrong round. His manual placement is itself an error
    // surface, so we cross-check every observed keeper against its designation.
    const misplaced = [];
    const teams = opts.teams || null;

    (picks || []).forEach(function (p) {
      if (!p || !p.is_keeper) return;
      const id = String(p.player_id);
      seenKeepers[id] = p;
      const designated = assumedById[id];
      if (!designated) {
        unknown.push({
          player_id: id,
          name: (byId[id] && byId[id].name) || p.metadata && p.metadata.first_name
            ? ((byId[id] && byId[id].name) || (p.metadata.first_name + ' ' + p.metadata.last_name))
            : id,
          team_slot: p.draft_slot || p.roster_id || null,
          pick_no: p.pick_no || null,
        });
        return;
      }
      // Designated keeper seen — verify WHERE he was placed matches the slate.
      const obsTeam = p.draft_slot || p.roster_id || null;
      const obsRound = (teams && p.pick_no) ? Math.ceil(p.pick_no / teams) : null;
      const wrongTeam = obsTeam != null && designated.team_slot != null
        && Number(obsTeam) !== Number(designated.team_slot);
      const wrongRound = obsRound != null && designated.cost_round != null
        && Number(obsRound) !== Number(designated.cost_round);
      if (wrongTeam || wrongRound) {
        misplaced.push({
          player_id: id,
          name: designated.name || (byId[id] && byId[id].name) || id,
          expected_team: designated.team_slot,
          observed_team: obsTeam,
          expected_round: designated.cost_round,
          observed_round: obsRound,
          wrong_team: wrongTeam,
          wrong_round: wrongRound,
        });
      }
    });

    // An assumed keeper is only "missing" once the draft has passed the round
    // his keeper pick would have occupied. Before that, absence proves nothing.
    const currentRound = opts.currentRound == null ? 0 : opts.currentRound;
    const missing = [];
    (assumed || []).forEach(function (k) {
      const id = String(k.player_id);
      if (seenKeepers[id]) return;
      const costRound = k.cost_round || 1;
      if (currentRound > costRound) {
        missing.push({
          player_id: id,
          name: k.name || (byId[id] && byId[id].name) || id,
          team_slot: k.team_slot,
          cost_round: costRound,
        });
      }
    });

    const ok = !unknown.length && !missing.length && !misplaced.length;
    return {
      ok: ok,
      unknown: unknown,
      missing: missing,
      misplaced: misplaced,
      // Halting is the point. A board known to be wrong must not keep
      // producing confident recommendations.
      halt: !ok,
      message: ok ? null : describe(unknown, missing, misplaced),
    };
  }

  function describe(unknown, missing, misplaced) {
    const bits = [];
    if (unknown.length) {
      bits.push(unknown.length + ' player' + (unknown.length === 1 ? ' was' : 's were')
        + ' kept that the slate did not list: '
        + unknown.map(function (u) { return u.name; }).join(', '));
    }
    if (missing.length) {
      bits.push(missing.length + ' assumed keeper'
        + (missing.length === 1 ? ' was' : 's were') + ' not kept: '
        + missing.map(function (m) { return m.name; }).join(', ')
        + ' — still on the board, and currently invisible to every recommendation');
    }
    (misplaced || []).forEach(function (m) {
      const where = [];
      if (m.wrong_team) {
        where.push('placed on team ' + m.observed_team + ', designated for team ' + m.expected_team);
      }
      if (m.wrong_round) {
        where.push('placed in round ' + m.observed_round + ', designated cost round ' + m.expected_round);
      }
      bits.push(m.name + ' was mis-placed: ' + where.join('; '));
    });
    return bits.join('. ') + '.';
  }

  /**
   * Corrected slate: drop assumed keepers who were not kept, add the ones that
   * actually were. Feed straight into DraftKeepers.reapply to rebuild adjusted
   * ADP and the pick sequence client-side — no rebuild, no network, which is
   * what makes this viable mid-draft rather than aspirational.
   */
  function correctedSlate(assumed, result, opts) {
    opts = opts || {};
    const byId = opts.playersById || {};
    const drop = {};
    result.missing.forEach(function (m) { drop[String(m.player_id)] = true; });

    const out = {};
    (assumed || []).forEach(function (k) {
      if (drop[String(k.player_id)]) return;
      const slot = String(k.team_slot);
      (out[slot] || (out[slot] = [])).push(k);
    });
    result.unknown.forEach(function (u) {
      const slot = String(u.team_slot || '');
      if (!slot) return;
      const p = byId[String(u.player_id)];
      (out[slot] || (out[slot] = [])).push({
        player_id: u.player_id,
        name: u.name,
        // Without a known original round the league's undrafted rule decides
        // the cost. Guessing a cheaper round would understate the forfeit and
        // shift every downstream pick number the wrong way.
        original_round: (p && p.original_round) || null,
      });
    });
    return out;
  }

  /**
   * TOP_PICKS_FLAT PLACEMENT LAW — the single JS implementation, shared.
   *
   * Keeping N players forfeits rounds 1..N by rank, so every keeper a team
   * holds must occupy one of ITS OWN rounds 1..N. A keeper outside that window
   * is a placement error, not a preference.
   *
   * Called by `reconcile()` (the commissioner cross-check) AND by app.js's
   * `pickState()` invariant, so the rule exists once on this side. The Python
   * keeper-placement verification asserts the same law against the artifact;
   * they are paired deliberately and both read `forfeited[].cost_round`, so
   * they cannot diverge in MEANING even though the languages differ.
   *
   * `forfeited`: [{player_id, name, team_slot, cost_round}]
   */
  function placementErrors(forfeited) {
    const byTeam = {};
    (forfeited || []).forEach(function (f) {
      const t = Number(f.team_slot);
      if (!t) return;
      (byTeam[t] = byTeam[t] || []).push(f);
    });
    const errors = [];
    Object.keys(byTeam).forEach(function (t) {
      const ks = byTeam[t];
      const n = ks.length;                       // this team keeps N
      const rounds = ks.map(function (k) { return Number(k.cost_round); });
      ks.forEach(function (k) {
        const r = Number(k.cost_round);
        if (!(r >= 1 && r <= n)) {
          errors.push({ team_slot: Number(t), player_id: String(k.player_id),
            name: k.name, cost_round: r, keeps: n,
            why: k.name + ' costs round ' + r + ' but seat ' + t + ' keeps '
              + n + ' — rounds 1..' + n + ' are the only legal costs' });
        }
      });
      // ...and the N rounds must be DISTINCT: two keepers cannot both cost R2.
      const seen = {};
      rounds.forEach(function (r) {
        if (seen[r]) {
          errors.push({ team_slot: Number(t), cost_round: r, keeps: n,
            why: 'seat ' + t + ' has two keepers both costing round ' + r });
        }
        seen[r] = true;
      });
    });
    return errors;
  }

  const api = { reconcile: reconcile, correctedSlate: correctedSlate,
                placementErrors: placementErrors };
  global.DraftReconcile = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
