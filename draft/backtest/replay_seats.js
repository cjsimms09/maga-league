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

/* ---- REGISTER 56 / P107 ARMS -------------------------------------------
 * `--arm` selects a VONA configuration. The default is a0, the PRE-FIX
 * engine — which was the shipping one until Cory ruled on the P107 grade on
 * 2026-08-19 and a1 shipped. The default is left at a0 so the committed
 * `engine_seat_choices.json` keeps meaning what every earlier reading of it
 * meant; the shipped configuration is now `--arm a1`.
 *
 * WHY THE ARMS ARE SELECTED HERE AND NOT BY THREE FORKED COPIES OF THIS FILE:
 * the bundle is REASSEMBLED on every CI run (Sleeper and FFC are refused at
 * CONNECT in the agent sandbox, so it cannot be committed), and two runs can
 * therefore see two different player universes. An A1-minus-A0 delta taken
 * across two runs would be confounded by that drift. Passing `--arm` lets one
 * CI job drive all three arms through ONE `bundles.json`, which is the only
 * way the difference means what the prereg says it means.
 *
 * The arm is stamped into meta so a choice file can never be read as the
 * shipping configuration when it is not. */
/* EVERY ARM PINS EVERY FLAG. `a0: {}` was correct for exactly one day and
 * became a silent bug the moment Cory shipped the fix (2026-08-19): an arm
 * that sets nothing INHERITS the shipped default, so "a0" would have quietly
 * become a second copy of a1 and the next A1-minus-A0 delta would have read
 * as a clean zero. An arm is a configuration, not a diff against whatever
 * happens to be shipping. */
/* ...AND "EVERY FLAG" DID NOT INCLUDE `VONA_SLOT_AWARE` OR `VONA_WIRE_BENCH`
 * until 2026-08-19, which is the same defect the paragraph above describes,
 * one flag over. a0/a1/a2 pinned two of the four VONA flags and INHERITED the
 * other two — safe only because each CI step is its own node process and the
 * engine default happened to be false. The moment register 60's re-take makes
 * `VONA_SLOT_AWARE` a live question, an unpinned arm is a configuration nobody
 * can name from the artifact. All four flags are pinned on every arm now. */
const ARMS = {
  // pre-fix
  a0: { VONA_INCLUDE_SELF: false, VONA_SURVIVAL_RESCALE: false,
        VONA_SLOT_AWARE: false, VONA_WIRE_BENCH: false },
  // the fix (SHIPPED 08-19)
  a1: { VONA_INCLUDE_SELF: true,  VONA_SURVIVAL_RESCALE: false,
        VONA_SLOT_AWARE: false, VONA_WIRE_BENCH: false },
  // the diagnostic
  a2: { VONA_INCLUDE_SELF: false, VONA_SURVIVAL_RESCALE: true,
        VONA_SLOT_AWARE: false, VONA_WIRE_BENCH: false },

  /* ---- REGISTER 60 (2) / P119 — THE SLOT-AWARE RE-TAKE ------------------
   * `VONA_SLOT_AWARE` is off because flooring the flex marginal at 0 tied
   * 1331 of 1686 players at exactly 0 and quarterbacks won the tie — measured
   * on a VONA computing the wrong quantity, before register 56 / P107.
   * `SLOT-AWARE-VONA-REPREG-2026-08-19.md` re-takes it and the collapse half
   * has already PASSED (modal share 0.9%, 458 distinct of 562, control clean).
   * These two arms are the seat-replay half — condition (2) of four, and the
   * prereg says explicitly that a NULL here leaves the flag OFF.
   *
   * s0 IS DELIBERATELY IDENTICAL TO a1. It is not redundant: reading the
   * s1−s0 delta off a1's committed file would compare two runs against two
   * separately-reassembled bundles, and the drift between them would sit
   * inside the delta. Same bundle, same run, both arms — the rule this table
   * already follows for a0/a1/a2. */
  s0: { VONA_INCLUDE_SELF: true, VONA_SURVIVAL_RESCALE: false,
        VONA_SLOT_AWARE: false, VONA_WIRE_BENCH: false },
  s1: { VONA_INCLUDE_SELF: true, VONA_SURVIVAL_RESCALE: false,
        VONA_SLOT_AWARE: true,  VONA_WIRE_BENCH: false },
  /* s2 (VONA_WIRE_BENCH true) is NOT DEFINED HERE ON PURPOSE. It needs
   * `ctx.wireWeekly`, and register 60 (3) records that `build.py` never joins
   * `draft/data/wire_level.json` onto the board — so an s2 arm would run,
   * produce a valid-looking artifact, and be byte-identical to s1 because
   * `wireBenchValue` returns null and falls back. That is precisely the
   * false-null shape the `--need` incident produced. It gets defined when the
   * join exists, not before. */
};
/* ---- REGISTER 59 / P110 — THE `need` WEIGHT ARM ------------------------
 * `--need <w>` overrides ONE weight on top of MEASURED_WEIGHTS. It exists
 * because `need` is the only roster-aware term in the score and it ships at
 * zero — which is why the tool drives Cory's own schedule to twelve running
 * backs and two receivers (register 59).
 *
 * ONE WEIGHT, NAMED ON THE COMMAND LINE, AND THE RESOLVED VECTOR STAMPED INTO
 * THE ARTIFACT — never the request. That is not decoration: this file's first
 * `--need` run was DISPATCHED TO CI AGAINST A COPY OF THIS SCRIPT THAT HAD LOST
 * THE FLAG, node ignored the unknown argument, and the job produced a choice
 * file byte-identical to the arm it was supposed to differ from. Graded, P110
 * would have read as a clean null. The read-back stamp is the only thing that
 * caught it.
 *
 * Not a general weight-vector override: a sweep that can set anything is a
 * sweep whose result nobody can attribute, which is what no_fit_guard exists
 * to prevent. */
const NEED = arg('need', null);
/* ---- P114 — THE `bye` WEIGHT ARM. `bye` also ships at 0 and it prices the
 * ACTUAL failure register 59 found: a starting slot that cannot be filled once
 * byes are applied. The seat replay CAN see this one — its `optimal` estimand
 * builds a LEGAL lineup every week, so a collision costs real points. */
const BYE = arg('bye', null);
/* ---- P115 — THE AUTO ADJUSTER AS A GRADED ARM. `--auto` asks the engine for
 * `autoWeights(ctx)` at every pick, exactly as the war room does when the
 * toggle is on. Measured on the live board (`auto_adjuster_probe.json`), Auto
 * produces the SAME roster shape as `need: 1.0` — WR3/TE2/RB7 against the
 * shipped WR1/TE1/RB10 — so P110's graded +68.6 may be reachable as a UI
 * CHECKBOX rather than a weight edit on draft week. Auto is NOT need=1.0: it
 * ramps tier, risk, ceiling and bye by phase too, so it is a different
 * configuration that lands in the same place, ungraded under the fixed VONA. */
const AUTO = process.argv.indexOf('--auto') >= 0;

/* ⚠️ AN UNKNOWN FLAG IS A HARD ERROR — THIS HAS COST ONE FALSE RESULT ALREADY.
 * node ignores arguments it does not recognise. Twice tonight an edit adding a
 * flag was lost before it was committed while CI kept passing that flag: the
 * `--need` run produced a choice file BYTE-IDENTICAL to the arm it was meant to
 * differ from, and `--bye` was queued to do the same. Only the read-back
 * `weights` stamp stood between that and a published null. A stamp catches it
 * afterwards; this refuses up front. */
const KNOWN_FLAGS = ['in', 'out', 'arm', 'need', 'bye', 'auto'];
process.argv.slice(2).forEach(a => {
  if (a.slice(0, 2) !== '--') return;
  const name = a.slice(2).split('=')[0];
  if (KNOWN_FLAGS.indexOf(name) < 0) {
    console.error('unknown flag --' + name + '; known: ' + KNOWN_FLAGS.join(', ')
      + '. Refusing rather than ignoring it — an ignored flag produces a valid '
      + 'artifact for an arm that never ran.');
    process.exit(2);
  }
});
const ARM = arg('arm', 'a0');
if (!Object.prototype.hasOwnProperty.call(ARMS, ARM)) {
  console.error('unknown --arm ' + ARM + '; known: ' + Object.keys(ARMS).join(','));
  process.exit(2);
}
Object.keys(ARMS[ARM]).forEach(k => {
  if (!(k in E.CFG)) {                   // a renamed flag must not fail SILENT
    console.error('arm ' + ARM + ' sets unknown engine flag ' + k);
    process.exit(2);
  }
  E.CFG[k] = ARMS[ARM][k];
});

/* The weight vector every seat is driven with. MEASURED_WEIGHTS unless --need
 * names an override, so the default invocation is byte-identical to every
 * earlier run of this file. */
const WEIGHTS = Object.assign({}, E.MEASURED_WEIGHTS);
const OVERRIDES = [];
[['need', NEED], ['bye', BYE]].forEach(([k, v]) => {
  if (v == null) return;
  const n = parseFloat(v);
  if (!isFinite(n)) { console.error('--' + k + ' must be a number, got ' + v); process.exit(2); }
  WEIGHTS[k] = n;
  OVERRIDES.push(k + '=' + n);
});
if (AUTO) OVERRIDES.push('AUTO_PHASE_WEIGHTS');
/* ONE ARM AT A TIME. Two overrides at once is a THIRD configuration nobody
 * preregistered, attributable to neither — the same reason the VONA arms refuse
 * to run together. */
if (OVERRIDES.length > 1) {
  console.error('one arm at a time; got ' + OVERRIDES.join(' and ')
    + ' — a combined arm is a configuration nobody preregistered');
  process.exit(2);
}

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

function replaySeat(bundle, seatId, excludedIds) {
  // `excludedIds` (optional Set) is the DIAGNOSTIC status-filtered arm: the
  // same deterministic roster-status exclusions the restated proxy table
  // committed per season (draft/data/replay_league_table_restated.json) are
  // removed from the ENGINE's candidate board too — the first engine run
  // drafted Gronkowski/Brown/Fournette in 2023, the exact board-vintage
  // blindness the live board verifiably does not have. Both arms are always
  // recorded; neither is selected (no_fit_guard). History is NEVER filtered:
  // if the room really drafted an excluded player, that pick still happens.
  const excluded = excludedIds || new Set();
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
                                                  && !engineIds.has(String(p.player_id))
                                                  && !excluded.has(String(p.player_id)));
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
      league: league, weights: WEIGHTS, runMultipliers: {}, intervening: [],
      roundsLeft: Math.max(1, (bundle.rounds || 15) - (pick.round || 1) + 1),
    };
    /* Auto is asked PER PICK — that is the point of a phase table, and hoisting
     * it out of the loop would grade one frozen phase. */
    if (AUTO) {
      const a = E.autoWeights(ctx);
      ctx.weights = (a && a.weights) ? a.weights : a;
    }
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

function loadStatusExclusions() {
  // The committed deterministic exclusion lists (rule + both error
  // directions: draft_replay_2025.roster_status_exclusions), over the
  // BOARD-AGNOSTIC population — the restated table's lists are scoped to
  // the proxy board (a Y-1-season population) and missed bundle-only
  // players like Gronkowski-2023, which made the first filtered arm filter
  // nothing. Absent file => the arm is skipped and says why, never silently.
  const p = path.join(__dirname, '..', 'data', 'roster_status_exclusions.json');
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const out = {};
    Object.keys(d.years || {}).forEach(s => {
      out[s] = new Set((d.years[s].excluded || []).map(e => String(e.player_id)));
    });
    return { by_season: out, source: 'draft/data/roster_status_exclusions.json' };
  } catch (e) {
    return { by_season: null, source: null, why: String(e && e.message || e) };
  }
}

function main() {
  const input = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const bundles = input.bundles || [];
  const exclusions = loadStatusExclusions();
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
      // REGISTER 56 / P107. `vona_arm` names the configuration; `vona_flags`
      // is read back OFF THE ENGINE rather than echoing the request, so a
      // flag that failed to apply shows up in the artifact as what it is.
      vona_arm: ARM,
      vona_flags: { VONA_INCLUDE_SELF: E.CFG.VONA_INCLUDE_SELF,
                    VONA_SURVIVAL_RESCALE: E.CFG.VONA_SURVIVAL_RESCALE },
      weights: OVERRIDES.length ? 'MEASURED_WEIGHTS with ' + OVERRIDES.join(',')
                                : 'MEASURED_WEIGHTS',
      weights_values: WEIGHTS,
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
  out.meta.status_filter = exclusions.by_season
    ? { source: exclusions.source,
        excluded_per_season: Object.fromEntries(Object.keys(exclusions.by_season)
          .map(s => [s, exclusions.by_season[s].size])) }
    : { skipped_why: exclusions.why };
  bundles.forEach(b => {
    const seats = {};
    const excl = exclusions.by_season
      ? exclusions.by_season[String(b.season)] : null;
    for (let seat = 1; seat <= (b.teams || 10); seat++) {
      seats[String(seat)] = replaySeat(b, seat);
      if (excl) seats[String(seat)].status_filtered = replaySeat(b, seat, excl);
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
