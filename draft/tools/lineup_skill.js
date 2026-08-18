// TERRITORY: A
/* HOW GOOD IS THIS LEAGUE AT SETTING LINEUPS — measured, not assumed.
 *
 * `bench_mv.js` prices a bench spot as a function of ρ, lineup skill: at ρ=0 the
 * lineup is set on expectations alone and a bench player is worth almost
 * nothing; at ρ=1 every week's best men start and the same player is worth
 * seventy points more. THE ANSWER TO "IS THIS PICK WORTH IT" DEPENDS ENTIRELY ON
 * A NUMBER NOBODY HAD MEASURED, which is exactly the shape of assumption this
 * project keeps finding after it has already changed a decision.
 *
 * It turns out to be measurable from data already on disk and nobody had looked.
 * `league_history.seasons[].weeks[w]` carries, for every team and every week of
 * three completed seasons: the STARTERS actually fielded, and `players_points`
 * for EVERY MAN ON THE ROSTER — bench included. So the lineup a manager set and
 * the lineup he could have set are both recoverable, exactly.
 *
 * ── THE OBSERVED NUMBER: CAPTURE ──────────────────────────────────────────
 *
 *     capture = points actually started / points the best legal lineup scored
 *
 * A pure hindsight benchmark, and that is the point: it is the same quantity
 * ρ=1 represents in the simulator. Capture near 1 means the room is close to
 * clairvoyant and bench depth pays; capture near the expectation-only lineup
 * means bench depth is decoration.
 *
 * ── AND THE FLOOR IT IS READ AGAINST, WHICH IS THE PART THAT IS EASY TO GET
 *    WRONG ────────────────────────────────────────────────────────────────
 *
 * A capture of 0.93 sounds like near-perfection and means nothing on its own,
 * because a manager who starts his best men BY REPUTATION and never looks again
 * already captures most of it. The floor is not zero — it is what you get with
 * NO in-week information at all. So this reports capture beside a ZERO-SKILL
 * BASELINE built from the same rosters, and the fraction of the gap between
 * that baseline and the hindsight optimum is the number that means something.
 *
 * The zero-skill baseline uses each player's OWN SEASON AVERAGE from the same
 * data, which is an in-sample estimate and therefore GENEROUS to the baseline —
 * a real manager in week 3 does not know a player's week 3-17 average. That bias
 * runs against the finding, which is the direction to be wrong in.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 *
 * It is CORY'S LEAGUE, not Cory. It pools ten managers over three seasons; his
 * own capture is reported separately and on a tenth of the sample. And a
 * capture rate is not ρ — it is the observable ρ is CALIBRATED against, by
 * finding the ρ at which the simulator reproduces it on the same seat structure.
 *
 * Run: node draft/tools/lineup_skill.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const HIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

/* POSITION COMES FROM THE RECORD, NOT THE LIVE BOARD. Against a pruned board
 * this measurement fell from 458 team-weeks to 315 — 31% of the sample it rests
 * on — purely because retired players stopped resolving.
 *
 * A defence arrives as a TEAM CODE where every other id is numeric, the same
 * trap as the transaction log: requiring a numeric id silently deletes a
 * position from every roster. position_map handles it in ONE place, and it
 * returns null rather than 'DEF' for an id that is neither — this file's old
 * rule labelled every unrecognisable id a defence. */
const PM = require(path.join(ROOT, 'draft', 'tools', 'position_map.js'));
const posOf = PM.resolver();

const FLEX_ELIG = ['RB', 'WR', 'TE'];
/* The seats come from the SEASON's own `roster_positions`, not from this year's
 * league settings. A season graded against the wrong seat structure produces a
 * capture rate that is a fact about the mismatch. */
function slotsOf(season) {
  const rp = (season.roster_positions || []).filter(s => s !== 'BN' && s !== 'IR'
    && s !== 'TAXI');
  return rp.map(s => ({ slot: s, elig: (s === 'FLEX' || s === 'WRRB_FLEX'
    || s === 'REC_FLEX' || s === 'SUPER_FLEX') ? FLEX_ELIG : [s] }));
}

/* THE BEST LEGAL LINEUP FROM A SET OF SCORED PLAYERS. Dedicated seats first,
 * then the flex from what is left — optimal for this structure, as argued in
 * bench_mv.js. `score` is a function so the SAME assignment code produces the
 * hindsight optimum and the zero-skill baseline; two implementations would be
 * two chances for them to differ for a reason that is not skill. */
function fill(slots, players, score) {
  const byPos = {};
  players.forEach(p => { (byPos[p.position] || (byPos[p.position] = [])).push(p); });
  Object.keys(byPos).forEach(k => byPos[k].sort((a, b) => score(b) - score(a)));
  const used = new Set(), chosen = [];
  slots.forEach(s => {
    if (s.elig.length > 1) return;
    const pick = (byPos[s.slot] || []).find(p => !used.has(p));
    if (pick) { used.add(pick); chosen.push(pick); }
  });
  slots.filter(s => s.elig.length > 1).forEach(() => {
    let best = null;
    FLEX_ELIG.forEach(pos => (byPos[pos] || []).forEach(p => {
      if (!used.has(p) && (!best || score(p) > score(best))) best = p;
    }));
    if (best) { used.add(best); chosen.push(best); }
  });
  return chosen;
}

function measure() {
  const rows = [];
  const ledger = { team_weeks: 0, used: 0, no_position: 0, starter_unmapped: 0, too_thin: 0, empty: 0, seasons: [] };
  const myId = String((BOARD.league || {}).my_manager_id || '');

  (HIST.seasons || []).forEach(season => {
    const slots = slotsOf(season);
    if (!slots.length) return;
    const weeks = season.weeks || {};
    /* Season averages for the zero-skill baseline, from the SAME data. In-sample
     * and therefore generous to the baseline — a bias that runs AGAINST the
     * finding, which is the direction to be wrong in. */
    const tot = {}, cnt = {};
    Object.keys(weeks).forEach(w => (weeks[w] || []).forEach(t => {
      Object.keys(t.players_points || {}).forEach(pid => {
        tot[pid] = (tot[pid] || 0) + (+t.players_points[pid] || 0);
        cnt[pid] = (cnt[pid] || 0) + 1;
      });
    }));
    const avg = pid => (cnt[pid] ? tot[pid] / cnt[pid] : 0);

    /* roster_id -> owner, so Cory's own rows can be separated out. `owners` is a
     * MAP KEYED BY roster_id — `{"1": {user_id, display_name, team_name}}` — not
     * a list. Read, not guessed: this repo has spent the week on field names
     * that looked right and were not. */
    const owner = {};
    Object.keys(season.owners || {}).forEach(rid => {
      owner[String(rid)] = String((season.owners[rid] || {}).user_id || '');
    });

    let used = 0;
    Object.keys(weeks).forEach(wk => {
      (weeks[wk] || []).forEach(t => {
        ledger.team_weeks++;
        const pts = t.players_points || {};
        const ids = Object.keys(pts);
        if (!ids.length) { ledger.empty++; return; }
        /* AN UNMAPPABLE MAN IS REMOVED FROM ALL THREE ARMS, not from one.
         *
         * My first cut dropped the whole team-week and it produced a hole
         * exactly where the answer was needed: ten players — outside the current
         * board's top 700, so retired or deep — account for 191 player-weeks out
         * of ~8,600 (2.2%), but because one bad man voids a whole roster that
         * became 103 of 540 team-weeks (19%), INCLUDING every one of Cory's. A
         * filter that deletes a fifth of the sample over 2% of the data is
         * measuring its own crosswalk.
         *
         * So the team-week is graded on the mappable subset, consistently, in
         * the actual lineup AND the optimum AND the baseline. If the unmapped man
         * was STARTED his points leave `actual` while the optimum still fills
         * that seat from the bench, so this UNDERSTATES capture — the
         * unflattering direction, which is the one to be wrong in. */
        const mappable = ids.filter(pid => !!posOf(pid));
        const drops = ids.length - mappable.length;
        if (drops) ledger.no_position += drops;
        /* AND A TEAM-WEEK WHOSE STARTER IS UNMAPPABLE IS UNGRADEABLE, DROPPED.
         *
         * Removing an unmapped man from the pools is fine while he sat on the
         * bench — he is one of six or seven and the optimum barely moves. If he
         * was STARTED, his points leave `actual` while the optimum still fills
         * that seat, and capture collapses for a reason that is about the
         * crosswalk.
         *
         * I SHIPPED THAT FOR ONE RUN AND IT LANDED ENTIRELY ON CORY. Three of the
         * ten unmapped ids appear in exactly 54 team-weeks each — his roster,
         * every season — and his capture read 73.8% against a league 85.8%, with
         * a NEGATIVE skill share. Printing that would have told him he leaves
         * thirty points a week on his bench, on the strength of a join failure.
         * A per-owner comparison is exactly where a systematic hole does the most
         * damage, because it looks like a fact about the owner. */
        if ((t.starters || []).some(pid => !posOf(pid))) { ledger.starter_unmapped++; return; }
        if (mappable.length < slots.length) { ledger.too_thin++; return; }
        const ok = new Set(mappable);
        const players = mappable.map(pid => ({ id: pid, position: posOf(pid),
          pts: +pts[pid] || 0, avg: avg(pid) }));
        const opt = fill(slots, players, p => p.pts).reduce((s, p) => s + p.pts, 0);
        const naive = fill(slots, players, p => p.avg).reduce((s, p) => s + p.pts, 0);
        const actual = (t.starters || []).reduce((s, pid) =>
          s + (ok.has(String(pid)) && pts[pid] != null ? +pts[pid] : 0), 0);
        if (!(opt > 0)) { ledger.empty++; return; }
        used++; ledger.used++;
        rows.push({ season: String(season.season), week: +wk,
          roster_id: t.roster_id, owner: owner[String(t.roster_id)] || '',
          actual: actual, optimal: opt, naive: naive,
          mine: myId && owner[String(t.roster_id)] === myId });
      });
    });
    ledger.seasons.push({ season: String(season.season), team_weeks: used });
  });
  return { rows: rows, ledger: ledger };
}

/* Pooled, not a mean of ratios: a 90-point week and a 190-point week are not
 * two equally informative observations of the same quantity. */
function summarise(rows) {
  const s = (k) => rows.reduce((t, r) => t + r[k], 0);
  const A = s('actual'), O = s('optimal'), N = s('naive');
  return {
    n: rows.length, actual: A, optimal: O, naive: N,
    capture: O ? A / O : null,
    naive_capture: O ? N / O : null,
    /* THE NUMBER THAT MEANS SOMETHING: of the points available ABOVE a
     * no-information lineup, how many were taken. */
    skill_share: (O - N) ? (A - N) / (O - N) : null,
    points_left: O - A,
  };
}

/* ── CALIBRATION: TURNING THE OBSERVED SHARE INTO ρ ───────────────────────
 *
 * Skill share is an OBSERVABLE; ρ is the simulator's parameter. They are not
 * the same number and mapping one to the other by eye is how a measured input
 * becomes a guess again. So it is solved: run the SAME roster through
 * `bench_mv.simSeason` at a ρ, and compute the identical statistic —
 *
 *     share(ρ) = ( E[total at ρ] − E[total at 0] ) / ( E[total at 1] − E[total at 0] )
 *
 * — then bisect for the ρ where it equals what the league does. Bisection is
 * legitimate because share(ρ) is monotone in ρ by construction: a better signal
 * never makes a max-of-signal lineup worse in expectation.
 *
 * IT IS CALIBRATED ON THE ROSTER THE ANSWER IS FOR. ρ is not a property of a
 * manager alone — a deep bench offers more chances to be right — so the roster
 * passed in should be the one being drafted, not a generic one. */
function shareAt(roster, rho, cfg) {
  const B = require('./bench_mv.js');
  const sim = roster.map(B.toSim);
  const c = Object.assign({ sims: 800, seed: 20260822, injuryModel: 'block',
    corr: 0, streamBudget: Infinity }, cfg || {});
  const run = r => {
    const cc = Object.assign({}, c, { rho: r });
    let t = 0;
    for (let i = 0; i < cc.sims; i++) t += B.simSeason(sim, i, cc);
    return t / cc.sims;
  };
  const lo = run(0), hi = run(1), at = run(rho);
  return { share: (hi - lo) ? (at - lo) / (hi - lo) : null, lo: lo, hi: hi, at: at };
}

function calibrate(roster, targetShare, cfg) {
  if (!(targetShare > 0 && targetShare < 1)) {
    throw new Error('lineup_skill.calibrate: the target share must be in (0,1); got '
      + targetShare + '. REFUSING to calibrate against a number outside the range '
      + 'the statistic can take.');
  }
  let a = 0, b = 1;
  for (let i = 0; i < 12; i++) {
    const m = (a + b) / 2;
    if (shareAt(roster, m, cfg).share < targetShare) a = m; else b = m;
  }
  return (a + b) / 2;
}

module.exports = { measure, summarise, fill, slotsOf, posOf, shareAt, calibrate };

if (require.main === module) {
  const M = measure();
  const L = M.ledger;
  console.log('LINEUP SKILL IN THIS LEAGUE — measured from ' + L.used + ' team-weeks\n');
  console.log('  team-weeks in the log            ' + L.team_weeks);
  console.log('  used                             ' + L.used);
  console.log('  player-weeks removed, no position on the board  ' + L.no_position);
  console.log('  team-weeks dropped, an UNMAPPED man was STARTED  ' + L.starter_unmapped);
  console.log('  team-weeks dropped, too few mappable men  ' + L.too_thin);
  console.log('  dropped, no scores at all        ' + L.empty);
  console.log('  by season: ' + L.seasons.map(s => s.season + ':' + s.team_weeks).join('  '));

  const all = summarise(M.rows);
  console.log('\n  POOLED, ALL TEN MANAGERS');
  console.log('    points actually started        ' + all.actual.toFixed(0));
  console.log('    best legal lineup, in hindsight ' + all.optimal.toFixed(0));
  console.log('    zero-skill lineup (season avgs) ' + all.naive.toFixed(0));
  console.log('    CAPTURE                        ' + (100 * all.capture).toFixed(1) + '%');
  console.log('    a no-information lineup gets   ' + (100 * all.naive_capture).toFixed(1) + '%');
  console.log('    SKILL SHARE of the gap         ' + (100 * all.skill_share).toFixed(1) + '%');
  console.log('    points left on the bench       ' + all.points_left.toFixed(0)
    + '  (' + (all.points_left / all.n).toFixed(1) + ' per team-week)');

  /* ── CORY'S OWN NUMBER IS NOT MEASURABLE AND SAYS SO ────────────────────
   * Four of his fifty-four team-weeks survive, because three of the ten
   * unmapped players sat in his STARTING lineup all three seasons. Four rows is
   * an anecdote, and an anecdote about a manager's competence printed beside a
   * league average reads as a finding. It is refused rather than shown with a
   * caveat, because the caveat is what gets skipped. */
  const MIN_ROWS = 30;
  const mine = M.rows.filter(r => r.mine);
  if (mine.length >= MIN_ROWS) {
    const c = summarise(mine);
    console.log('\n  CORY ONLY — ' + c.n + ' team-weeks');
    console.log('    CAPTURE ' + (100 * c.capture).toFixed(1) + '%   no-information '
      + (100 * c.naive_capture).toFixed(1) + '%   SKILL SHARE '
      + (100 * c.skill_share).toFixed(1) + '%');
  } else {
    console.log('\n  CORY ONLY: NOT MEASURABLE — ' + mine.length + ' gradeable team-weeks '
      + 'of a possible 54.');
    console.log('    Three of the ten players missing from the board sat in his STARTING');
    console.log('    lineup across all three seasons, so his weeks are the ones this');
    console.log('    crosswalk cannot grade. Resolving those ten ids against Sleeper\'s');
    console.log('    full player list is what unlocks it; until then his personal rate is');
    console.log('    UNKNOWN, which is not the same as average and not the same as poor.');
  }

  console.log('\n  BY SEASON');
  ['2023', '2024', '2025'].forEach(sn => {
    const r = M.rows.filter(x => x.season === sn);
    if (!r.length) return;
    const c = summarise(r);
    console.log('    ' + sn + '  capture ' + (100 * c.capture).toFixed(1)
      + '%   no-info ' + (100 * c.naive_capture).toFixed(1)
      + '%   skill share ' + (100 * c.skill_share).toFixed(1) + '%');
  });

  console.log('\n  ── CALIBRATION ────────────────────────────────────────────────');
  console.log('  bench_mv.js prices a roster spot as a function of ρ, and ρ=1 is exactly');
  console.log('  the hindsight optimum measured above. Solving for the ρ that reproduces');
  console.log('  this room\'s skill share, on the roster actually being drafted:\n');
  const PLAN = require('./draft_plan.js');
  const byId = {};
  PLAN.pool.forEach(p => { byId[String(p.player_id)] = p; });
  const R = PLAN.keep.map(k => byId[String(k.player_id)] || k)
    .concat(PLAN.plan.filter(x => x.p).map(x => byId[String(x.p.player_id)] || x.p))
    .filter(Boolean);
  console.log('    roster: ' + R.length + ' players (keepers + every planned pick)');
  [0.1, 0.25, 0.5, 0.75].forEach(r => {
    console.log('    ρ=' + r + '  ->  skill share ' + (100 * shareAt(R, r).share).toFixed(1) + '%');
  });
  const rho = calibrate(R, all.skill_share);
  console.log('\n    MEASURED SKILL SHARE ' + (100 * all.skill_share).toFixed(1)
    + '%   ->   ρ = ' + rho.toFixed(3));
  console.log('\n  THIS IS THE LEAGUE\'S ρ, NOT CORY\'S. His own weeks are the ones the');
  console.log('  crosswalk cannot grade. Using the room average for him assumes he is');
  console.log('  average at setting lineups, which is an assumption and is now a written');
  console.log('  one rather than a 0.5 nobody chose.');
}
