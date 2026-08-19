// TERRITORY: A
/* REGISTER 56 / P107 — THE THREE VONA ARMS ON THE BOARD CORY ACTUALLY DRAFTS.
 *
 * The seat replay (`replay_seats.js`, run in CI where the network is) grades
 * these arms against REALISED points across 2023/24/25, and that is the
 * headline. It cannot answer two things:
 *
 *   - it MIRRORS K/DEF by design, so the population where this defect is
 *     LARGEST is the population the headline cannot see. The Rams defence at
 *     pick 48 — survival 0.9999999995, VONA 14.0 — is exactly a K/DEF row.
 *   - it replays 2023-25 boards, not the 2026 board Cory sits down with.
 *
 * So this probe measures the arms HERE, on today's `public/draft_data.json`,
 * at Cory's real pick schedule. It grades nothing and selects nothing. It
 * answers: what moves, in which direction, and is the movement concentrated
 * where the defect says it should be.
 *
 * ── THE CTX IS engine_drive.js's, FIELD FOR FIELD, AND THAT IS DELIBERATE ──
 * That file's header records what a hand-built ctx costs: `myPicksLeft` passed
 * as `roundsLeft` defaulted to 99, legality never fired, and the probe reported
 * four kickers and five defences as an engine defect when it was the driver.
 * Trimmed roster objects produced NaN and scored all 576 players null. Nothing
 * here is re-derived.
 *
 * Run: node draft/tools/vona_arm_board_probe.js [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

global.window = global;
global.document = { getElementById: () => null, querySelector: () => null, addEventListener: () => {} };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(__dirname, 'keepers_of.js'));

/* EVERY ARM PINS EVERY FLAG — see replay_seats.js for why. `a0` means the
 * PRE-FIX engine, which since 2026-08-19 is no longer the shipped one. */
const ARMS = {
  a0: { VONA_INCLUDE_SELF: false, VONA_SURVIVAL_RESCALE: false },  // pre-fix
  a1: { VONA_INCLUDE_SELF: true,  VONA_SURVIVAL_RESCALE: false },  // SHIPPED 08-19
  a2: { VONA_INCLUDE_SELF: false, VONA_SURVIVAL_RESCALE: true },   // diagnostic
};
const SCHED = [8, 13, 28, 33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];
const FOCUS_PICK = 48;                      // where the defect was found
const WEIGHTS = E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS;   // app.js:52 ships MEASURED

const keep = KEEP.keepersFrom(DATA);
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));

function makeCtx(board, roster, i) {
  const pick = SCHED[i];
  return {
    board: board, roster: roster,
    nextPick: SCHED[i + 1] || null,
    currentPick: pick, pick: pick,
    round: Math.ceil(pick / (DATA.league.teams || 10)),
    myPicksLeft: SCHED.length - i,
    myPickIndex: i, totalMyPicks: SCHED.length, totalPicks: 150,
    league: DATA.league, weights: WEIGHTS,
    currentKeepers: roster.filter(p => p.is_keeper),
    ceilingAllStages: false, doctrine: null, drift: null,
    intervening: (SCHED[i + 1] || pick) - pick,
  };
}

function withArm(arm, fn) {
  const flags = ARMS[arm], saved = {};
  Object.keys(ARMS).forEach(a => Object.keys(ARMS[a]).forEach(k => { saved[k] = E.CFG[k]; }));
  Object.keys(saved).forEach(k => { E.CFG[k] = false; });
  Object.keys(flags).forEach(k => { E.CFG[k] = flags[k]; });
  try { return fn(); } finally { Object.keys(saved).forEach(k => { E.CFG[k] = saved[k]; }); }
}

/** One greedy walk down Cory's schedule under one arm. */
function drive(arm) {
  const taken = new Set(keep.map(k => String(k.player_id)));
  const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));
  const picks = [];
  let focusBoard = null;
  SCHED.forEach((pk, i) => {
    let need = (pk - 1) - (taken.size - keep.length);
    for (let j = 0; j < byAdp.length && need > 0; j++) {
      const p = byAdp[j];
      if (taken.has(String(p.player_id))) continue;
      taken.add(String(p.player_id)); need--;
    }
    const board = pool.filter(p => !taken.has(String(p.player_id)));
    const out = withArm(arm, () => E.recommend(makeCtx(board, roster, i)));
    const list = Array.isArray(out) ? out : (out && out.scored) || [];
    if (pk === FOCUS_PICK) focusBoard = list;
    const top = list[0];
    if (!top || !top.player) { picks.push(null); return; }
    taken.add(String(top.player.player_id));
    roster.push(Object.assign({}, top.player));
    picks.push({ pick: pk, player_id: String(top.player.player_id),
                 name: top.player.name, position: top.player.position,
                 score: top.score == null ? null : +Number(top.score).toFixed(2) });
  });
  const counts = {};
  roster.forEach(p => { counts[p.position] = (counts[p.position] || 0) + 1; });
  return { arm: arm, picks: picks, roster_counts: counts, focus: focusBoard };
}

/* ---- run all three ------------------------------------------------------ */
const runs = {};
Object.keys(ARMS).forEach(a => { runs[a] = drive(a); });

/* THE ARMS MUST DIFFER SOMEWHERE. Three identical rankings would mean the
 * flags never reached the scorer — the same costume failure the error-
 * correlation gate exists to catch, one level up. */
function rankMap(list) {
  const m = {};
  (list || []).forEach((e, i) => { if (e && e.player) m[String(e.player.player_id)] = i + 1; });
  return m;
}
const R = { a0: rankMap(runs.a0.focus), a1: rankMap(runs.a1.focus), a2: rankMap(runs.a2.focus) };
const survOf = {}, posOf = {}, nameOf = {};
(runs.a0.focus || []).forEach(e => {
  if (!e || !e.player) return;
  const id = String(e.player.player_id);
  survOf[id] = e.survival_to_next == null ? null : +e.survival_to_next;
  posOf[id] = e.player.position; nameOf[id] = e.player.name;
});

function moves(arm) {
  const out = [];
  Object.keys(R.a0).forEach(id => {
    if (R[arm][id] == null) return;
    const d = R[arm][id] - R.a0[id];
    if (d !== 0) out.push({ player_id: id, name: nameOf[id], pos: posOf[id],
                            from: R.a0[id], to: R[arm][id], move: d,
                            survival: survOf[id] });
  });
  return out.sort((x, y) => Math.abs(y.move) - Math.abs(x.move));
}

const boardSurv = Object.keys(survOf).map(k => survOf[k]).filter(v => v != null);
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const report = {
  _territory: 'TERRITORY: A — draft/tools/vona_arm_board_probe.js',
  _note: 'DESCRIPTIVE. Grades nothing, selects nothing. The graded arm '
       + 'comparison is the CI seat replay (P107); this measures where the '
       + 'arms move TODAY\'S board, including the K/DEF rows the seat replay '
       + 'mirrors away.',
  board_built_at: DATA.built_at || null,
  focus_pick: FOCUS_PICK,
  next_pick: SCHED[SCHED.indexOf(FOCUS_PICK) + 1],
  board_mean_survival_to_next: mean(boardSurv) == null ? null : +mean(boardSurv).toFixed(4),
  arms: {},
};

['a1', 'a2'].forEach(arm => {
  const mv = moves(arm);
  const demoted = mv.filter(m => m.move > 0 && m.survival != null);
  const promoted = mv.filter(m => m.move < 0 && m.survival != null);
  report.arms[arm] = {
    players_that_moved: mv.length,
    /* P107-b, the MECHANISM leg: if the defect account is right, the players
     * this arm pushes DOWN are the high-survival ones — the men who would
     * still be there. Spread evenly across survival means the account is
     * wrong even if the points move. */
    mean_survival_of_demoted: mean(demoted.map(m => m.survival)) == null ? null
      : +mean(demoted.map(m => m.survival)).toFixed(4),
    mean_survival_of_promoted: mean(promoted.map(m => m.survival)) == null ? null
      : +mean(promoted.map(m => m.survival)).toFixed(4),
    biggest_moves: mv.slice(0, 12),
    /* ⚠️ POST-HOC, AND LABELLED AS SUCH. P107-b preregistered the BOARD-WIDE
     * mean-survival comparison directly above, and that leg came back against
     * my account: A1 pushes the deep negative-VONA tail UP toward zero
     * (survival-weighting shrinks a negative as readily as a positive), which
     * swamps the top-of-position demotions in a board-wide mean. THIS statistic
     * — the same comparison restricted to the top 50, where a pick is actually
     * decided — is a repair of my measurement, not of the prediction. It is
     * reported beside the registered one, never instead of it. */
    top50_scoped_post_hoc: (function () {
      const t = mv.filter(m => m.from <= 50 && m.survival != null);
      const dn = t.filter(m => m.move > 0), up = t.filter(m => m.move < 0);
      return { n: t.length,
               mean_survival_demoted: mean(dn.map(m => m.survival)) == null ? null
                 : +mean(dn.map(m => m.survival)).toFixed(4),
               mean_survival_promoted: mean(up.map(m => m.survival)) == null ? null
                 : +mean(up.map(m => m.survival)).toFixed(4),
               n_demoted: dn.length, n_promoted: up.length };
    })(),
    top10: (runs[arm].focus || []).slice(0, 10).map((e, i) => ({
      rank: i + 1, name: e.player.name, pos: e.player.position,
      score: e.score == null ? null : +Number(e.score).toFixed(2),
      survival: e.survival_to_next == null ? null : +(+e.survival_to_next).toFixed(4),
      rank_under_a0: R.a0[String(e.player.player_id)] || null,
    })),
    roster_counts: runs[arm].roster_counts,
  };
});
report.arms.a0 = {
  top10: (runs.a0.focus || []).slice(0, 10).map((e, i) => ({
    rank: i + 1, name: e.player.name, pos: e.player.position,
    score: e.score == null ? null : +Number(e.score).toFixed(2),
    survival: e.survival_to_next == null ? null : +(+e.survival_to_next).toFixed(4),
  })),
  roster_counts: runs.a0.roster_counts,
};
report.full_schedule = Object.fromEntries(Object.keys(ARMS).map(a =>
  [a, runs[a].picks.map(p => p ? (p.position + ' ' + p.name) : null)]));

/* ---- print -------------------------------------------------------------- */
console.log('VONA ARMS ON THE LIVE BOARD — built ' + report.board_built_at);
console.log('focus pick ' + FOCUS_PICK + ', next turn ' + report.next_pick
  + ', board mean survival ' + report.board_mean_survival_to_next + '\n');
['a0', 'a1', 'a2'].forEach(a => {
  console.log('  ' + a.toUpperCase() + '  top 10'
    + (a === 'a0' ? '  (shipping)' : a === 'a1' ? '  (include-self — the fix)'
                                                : '  (flat rescale — diagnostic)'));
  report.arms[a].top10.forEach(r => {
    console.log('    ' + String(r.rank).padStart(2) + '  '
      + (r.pos + ' ' + r.name).padEnd(28)
      + String(r.score).padStart(7)
      + '  surv ' + String(r.survival).padStart(6)
      + (r.rank_under_a0 ? '   was #' + r.rank_under_a0 : ''));
  });
  console.log('    roster over 15 picks: ' + JSON.stringify(report.arms[a].roster_counts) + '\n');
});
['a1', 'a2'].forEach(a => {
  const r = report.arms[a];
  console.log('  ' + a.toUpperCase() + ': ' + r.players_that_moved + ' players moved | '
    + 'mean survival DEMOTED ' + r.mean_survival_of_demoted
    + ' vs PROMOTED ' + r.mean_survival_of_promoted
    + ' vs board ' + report.board_mean_survival_to_next);
});

const outPath = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();
if (outPath) { fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); console.log('\nwrote ' + outPath); }

module.exports = { report, ARMS };
