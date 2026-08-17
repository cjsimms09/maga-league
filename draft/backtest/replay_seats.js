/* SEAT-LEVEL replay of the REAL engine — the live-edge measurement's choice
 * side. Ordered 2026-08-17 (ROUTES.md "THE LIVE-EDGE MEASUREMENT, ORDERED"):
 * the all-seats league table graded a WEAKENED PROXY (BPA-by-VORP, no
 * survival/VONA/tiers), so "the tool ties its user" was unmeasured. This file
 * measures it: the same engine.js + survival.js the War Room ships, sitting
 * in EVERY owner's real seat under the fixed-opponents counterfactual the
 * proxy table defined.
 *
 * WHY THIS IS JAVASCRIPT — same reason as replay.js, whose bundle contract
 * and ctx assembly this file reuses: a Python re-implementation would test a
 * system that merely resembles the shipping one.
 *
 * WHAT DIFFERS FROM replay.js: replaySeason() records what each policy WOULD
 * have taken at every historical pick and then advances HISTORY — it never
 * lets a policy keep its own player, so it cannot produce a seat's
 * counterfactual ROSTER. This file does the roster construction the proxy
 * table's estimand needs: at the replayed seat's own non-keeper picks the
 * engine's choice STANDS (removed from the board, added to the engine
 * roster); every other owner's pick follows history exactly; a historical
 * pick of a player the engine already holds is counted as SHADOWED, exactly
 * as the proxy defined. K/DEF are MIRRORED at the slots where the seat's
 * owner actually took them (identical on both rosters, cancelling in the
 * skill-only grading), matching the proxy's estimand.
 *
 * WEIGHTS: E.MEASURED_WEIGHTS — the configuration the War Room ships, stated
 * in the artifact. DIAGNOSTIC ONLY, per no_fit_guard: nothing here selects a
 * configuration; replay.js's B3 continues to run DEFAULT_WEIGHTS in its own
 * harness and neither replaces the other.
 *
 * GRADING IS NOT DONE HERE — same wall as replay.js. This file holds only
 * pre-draft-knowable bundle data and records choices; actual points are
 * joined afterwards by draft/backtest/replay_seats_grade.py from the
 * COMMITTED weekly stores.
 *
 * Run: node draft/backtest/replay_seats.js \
 *        --in draft/backtest/bundles.json \
 *        --out draft/backtest/engine_seat_choices.json
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const IN = arg('in', path.join(__dirname, 'bundles.json'));
const OUT = arg('out', path.join(__dirname, 'engine_seat_choices.json'));

// Cory's picks get the full component readout through this round — the QB
// question ("does survival/VONA already produce the top-3 drafters' QB
// wait?") is answered from the engine's own published components, not from a
// re-derivation.
const QB_DETAIL_SEAT = 1;
const QB_DETAIL_THROUGH_ROUND = 9;

function rosterPositionsToStarters(rp) {
  // Same shape replay.js derives; restated here because replay.js does not
  // export it. Slots that are not starting slots do not count.
  const starters = {};
  (rp || []).forEach(slot => {
    if (slot === 'BN' || slot === 'IR' || slot === 'TAXI') return;
    starters[slot] = (starters[slot] || 0) + 1;
  });
  return starters;
}

function weightedOf(entry) {
  const w = ((entry.components || {}).weighted) || {};
  const out = {};
  Object.keys(w).forEach(k => {
    if (typeof w[k] === 'number' && isFinite(w[k])) out[k] = +w[k].toFixed(2);
  });
  return out;
}

function qbSnapshot(scored, chosen) {
  // The best-scored available QB at this pick, in the engine's own terms.
  let qb = null, rank = -1;
  for (let i = 0; i < scored.length; i++) {
    const p = scored[i].player || {};
    if (p.position === 'QB' && scored[i].score != null) { qb = scored[i]; rank = i + 1; break; }
  }
  if (!qb) return null;
  const snap = {
    player_id: String(qb.player.player_id), name: qb.player.name || null,
    engine_rank: rank,
    score: qb.score == null ? null : +qb.score.toFixed(2),
    score_gap_to_chosen: (chosen && chosen.score != null && qb.score != null)
      ? +(chosen.score - qb.score).toFixed(2) : null,
    survival_to_next: qb.survival_to_next == null ? null : +(+qb.survival_to_next).toFixed(3),
    weighted: weightedOf(qb),
    chosen_weighted: chosen ? weightedOf(chosen) : null,
  };
  // Which term does the delaying? The largest weighted-term advantage of the
  // chosen player over the top QB — reported, never interpreted here.
  if (chosen) {
    const a = snap.chosen_weighted, b = snap.weighted;
    let best = null;
    Object.keys(a).forEach(k => {
      const d = +( (a[k] || 0) - (b[k] || 0) ).toFixed(2);
      if (best == null || d > best.advantage) best = { term: k, advantage: d };
    });
    snap.chosen_largest_term_advantage = best;
  }
  return snap;
}

function replaySeat(bundle, seatId) {
  const teams = bundle.teams || 10;
  const starters = rosterPositionsToStarters(bundle.roster_positions);
  const league = { teams: teams, starters: starters,
                   roster_slots: Object.assign({}, starters) };
  const byId = {};
  (bundle.players || []).forEach(p => { byId[String(p.player_id)] = p; });

  const picks = (bundle.picks || []).slice().sort((a, b) => a.pick_no - b.pick_no);
  const taken = new Set();
  const engineRoster = [];          // player objects, keepers + engine picks + mirrored K/DEF
  const engineIds = new Set();
  const records = [];
  let shadowed = 0, kdefDemoted = 0, firstQBRound = null, firstTERound = null;

  // Keepers are off the board before pick 1; the replayed seat keeps its own.
  picks.filter(p => p.is_keeper).forEach(p => {
    const pid = String(p.player_id);
    taken.add(pid);
    if (p.roster_id === seatId && byId[pid]) {
      engineRoster.push(byId[pid]); engineIds.add(pid);
    }
  });

  picks.forEach(pick => {
    if (pick.is_keeper) return;
    const pid = String(pick.player_id);
    if (pick.roster_id !== seatId) {
      // History, exactly. A pick of a player the engine holds is a SHADOW —
      // counted, never cascaded (no butterfly effects, per the proxy).
      if (engineIds.has(pid)) shadowed++;
      taken.add(pid);
      return;
    }
    const actual = byId[pid] || null;
    const actualPos = actual ? actual.position : null;
    if (actualPos === 'K' || actualPos === 'DEF') {
      // MIRRORED: identical on both rosters, cancels in skill-only grading.
      taken.add(pid);
      if (actual) { engineRoster.push(actual); engineIds.add(pid); }
      records.push({ pick_no: pick.pick_no, round: pick.round, actual: pid,
                     chosen: pid, how: 'mirror_' + actualPos });
      return;
    }

    const board = (bundle.players || []).filter(p => !taken.has(String(p.player_id))
                                                  && !engineIds.has(String(p.player_id)));
    if (!board.length) return;
    let nextPick = null;
    for (let i = 0; i < picks.length; i++) {
      if (picks[i].pick_no > pick.pick_no && picks[i].roster_id === seatId
          && !picks[i].is_keeper) { nextPick = picks[i].pick_no; break; }
    }
    const myPicksLeft = picks.filter(p => p.roster_id === seatId
                                     && p.pick_no >= pick.pick_no && !p.is_keeper).length;
    const ctx = {
      board: board, currentPick: pick.pick_no, nextPick: nextPick || pick.pick_no + teams,
      totalPicks: picks.length, myPicksLeft: myPicksLeft, roster: engineRoster,
      league: league, weights: E.MEASURED_WEIGHTS, runMultipliers: {}, intervening: [],
      roundsLeft: Math.max(1, (bundle.rounds || 15) - (pick.round || 1) + 1),
    };
    const scored = E.recommend(ctx);
    // The engine ranks the whole board, K/DEF included. At a slot where the
    // human took a skill player, a K/DEF top entry would break the mirrored
    // cancellation — take the best skill entry instead and COUNT the event.
    let chosen = null;
    for (let i = 0; i < scored.length; i++) {
      const p = scored[i].player || {};
      if (scored[i].score == null) continue;
      if (p.position === 'K' || p.position === 'DEF') { if (!i) kdefDemoted++; continue; }
      chosen = scored[i]; break;
    }
    if (!chosen) chosen = scored.find(s => s.score != null) || scored[0];
    const cp_ = chosen ? chosen.player : board[0];
    const cid = String(cp_.player_id);

    const rec = { pick_no: pick.pick_no, round: pick.round, actual: pid,
                  chosen: cid, chosen_pos: cp_.position || null,
                  chosen_score: chosen && chosen.score != null ? +chosen.score.toFixed(2) : null,
                  how: 'engine' };
    if (cp_.position === 'QB' && firstQBRound == null) firstQBRound = pick.round;
    if (cp_.position === 'TE' && firstTERound == null) firstTERound = pick.round;
    if (seatId === QB_DETAIL_SEAT && (pick.round || 99) <= QB_DETAIL_THROUGH_ROUND) {
      rec.top_qb = qbSnapshot(scored, chosen);
      rec.chosen_name = cp_.name || null;
      rec.chosen_survival_to_next = chosen && chosen.survival_to_next != null
        ? +(+chosen.survival_to_next).toFixed(3) : null;
    }
    records.push(rec);

    engineRoster.push(cp_); engineIds.add(cid); taken.add(cid);
    // The HUMAN's actual pick stays on his own historical roster for grading
    // (grading reads history, not this file) but is NOT removed from the
    // engine's future board unless someone in history takes it later — the
    // proxy's exact counterfactual: only the replayed seat deviates.
  });

  return {
    roster: Array.from(engineIds).sort(),
    records: records,
    shadowed_picks: shadowed,
    kdef_top_entry_demotions: kdefDemoted,
    first_QB_round: firstQBRound,
    first_TE_round: firstTERound,
  };
}

function gitHead() {
  try {
    return cp.execSync('git rev-parse HEAD', {
      cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }).trim();
  } catch (e) { return 'UNAVAILABLE'; }
}

function main() {
  const input = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const bundles = input.bundles || [];
  const out = {
    _territory: 'TERRITORY: A — produced by draft/backtest/replay_seats.js',
    _note: 'CHOICES ONLY — no outcome data enters this file. Grading joins '
      + 'committed weekly stores afterwards via replay_seats_grade.py. '
      + 'Engine: the shipped engine.js/survival.js at the recorded head, '
      + 'MEASURED_WEIGHTS (the War Room configuration), fixed-opponents '
      + 'counterfactual per seat, K/DEF mirrored, keepers as history '
      + 'recorded them.',
    meta: {
      git_head: gitHead(),
      weights: 'MEASURED_WEIGHTS',
      weights_values: E.MEASURED_WEIGHTS,
      qb_detail_seat: QB_DETAIL_SEAT,
      qb_detail_through_round: QB_DETAIL_THROUGH_ROUND,
      bundles: bundles.map(b => ({ season: b.season,
        projection_method: b.projection_method,
        spearman_vs_adp: (b.sanity || {}).spearman_vs_adp,
        players_on_board: (b.players || []).length,
        picks: (b.picks || []).length })),
      caveats: input.caveats || [],
    },
    seasons: {},
  };
  bundles.forEach(b => {
    const seats = {};
    for (let seat = 1; seat <= (b.teams || 10); seat++) {
      seats[String(seat)] = replaySeat(b, seat);
    }
    out.seasons[String(b.season)] = { seats: seats };
    console.log('season ' + b.season + ': '
      + Object.keys(seats).map(s => 's' + s + ' QB r' + seats[s].first_QB_round).join(' '));
  });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('wrote ' + OUT);
}

if (require.main === module) main();
module.exports = { replaySeat, rosterPositionsToStarters, qbSnapshot };
