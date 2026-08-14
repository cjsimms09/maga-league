// TERRITORY: A
// ρ WAS THE LARGEST UNMEASURED NUMBER IN THE BENCH MODEL. IT IS NOW MEASURED.
//
// `bench_mv.js` prices a bench spot as a function of lineup skill and the two
// ends differ by seventy points on a bench running back. Until 2026-08-13 there
// was no number — and the data to produce one had been on disk the whole time:
// `league_history.seasons[].weeks[w]` carries the STARTERS actually fielded and
// `players_points` for every man on the roster, bench included, for three
// completed seasons.
//
//     capture       87.7%   what the room actually started
//     no-information 84.1%  the same rosters, lineups set on season averages
//     SKILL SHARE    22.5%  the fraction of the hindsight edge the room takes
//     calibrated ρ   0.385
//
// ── THE CHECK THAT MATTERS IS THE FLOOR, NOT THE CAPTURE ─────────────────
//
// 87.7% sounds like near-perfection and means nothing alone: a manager who
// starts his best men by reputation and never looks again gets 84.1%. Reporting
// capture without the floor beside it is the entire way this measurement goes
// wrong, so the floor is asserted here, not just computed.
//
// ── AND A CROSSWALK HOLE THAT LANDED ENTIRELY ON ONE OWNER ───────────────
//
// Ten players are missing from the board (outside its top 700 — retired or
// deep), 191 player-weeks of ~8,600. Three of them sat in CORY'S STARTING
// lineup all three seasons. My first cut dropped a whole team-week for any
// unmapped man and lost 19% of the sample; my second removed them from the pools
// and printed Cory at 73.8% capture with a NEGATIVE skill share — a number that
// reads as a fact about him and is a fact about the join. A per-owner comparison
// is exactly where a systematic hole does the most damage.
//
// Run: node draft/tests/lineup_skill.test.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'draft', 'tools', 'lineup_skill.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const M = S.measure();
const L = M.ledger;
const all = S.summarise(M.rows);

// ── 1. THERE IS A SAMPLE, AND IT RECONCILES ──────────────────────────────
ck('the log holds three seasons of team-weeks', L.team_weeks >= 500, L.team_weeks);
ck('most of them are gradeable', L.used > 400, L.used);
ck('every team-week is either used or accounted for by a named exclusion',
  L.used + L.starter_unmapped + L.too_thin + L.empty === L.team_weeks,
  { used: L.used, starter: L.starter_unmapped, thin: L.too_thin, empty: L.empty,
    total: L.team_weeks });
ck('all three completed seasons contribute',
  L.seasons.filter(s => s.team_weeks > 100).length === 3,
  L.seasons);

// ── 2. THE FLOOR IS REPORTED AND IS HIGH ─────────────────────────────────
// The point of the whole file. A capture rate without this beside it is a
// number that flatters everyone.
ck('capture is measured', all.capture > 0.5 && all.capture < 1, all.capture);
ck('the ZERO-SKILL floor is also measured, and it is high — most of capture is '
  + 'not skill', all.naive_capture > 0.75, all.naive_capture);
ck('skill share is the gap between them, and it is SMALL',
  all.skill_share > 0 && all.skill_share < 0.5, all.skill_share);
ck('CONTROL — the floor is genuinely below the optimum, or share is undefined',
  all.optimal > all.naive * 1.05, { optimal: all.optimal, naive: all.naive });
ck('CONTROL — the actual lineup sits BETWEEN the floor and the optimum',
  all.actual > all.naive && all.actual < all.optimal,
  { naive: all.naive, actual: all.actual, optimal: all.optimal });

// ── 3. AND IT IS STABLE, WHICH IS WHAT MAKES IT USABLE AS A PARAMETER ────
// One season's share is an estimate; three that agree is a measurement. A ρ
// calibrated on a number that swings season to season would be a ρ calibrated
// on noise.
{
  const per = ['2023', '2024', '2025'].map(sn => {
    const r = M.rows.filter(x => x.season === sn);
    return r.length ? S.summarise(r).skill_share : null;
  }).filter(x => x != null);
  ck('CONTROL — three seasons are separately measurable', per.length === 3, per);
  const spread = Math.max.apply(null, per) - Math.min.apply(null, per);
  ck('and their skill shares agree within 10 points', spread < 0.10,
    per.map(x => (100 * x).toFixed(1) + '%'));
}

// ── 4. THE OPTIMAL LINEUP IS ACTUALLY OPTIMAL ────────────────────────────
// `fill` produces the hindsight optimum, the zero-skill baseline and (in
// bench_mv) the simulated lineup. If it is not optimal, capture is overstated
// by however much it misses.
{
  const slots = [{ slot: 'QB', elig: ['QB'] }, { slot: 'RB', elig: ['RB'] },
    { slot: 'RB', elig: ['RB'] }, { slot: 'FLEX', elig: ['RB', 'WR', 'TE'] }];
  const players = [
    { id: 'q', position: 'QB', pts: 20 },
    { id: 'r1', position: 'RB', pts: 18 }, { id: 'r2', position: 'RB', pts: 12 },
    { id: 'r3', position: 'RB', pts: 9 }, { id: 'w1', position: 'WR', pts: 15 },
    { id: 'w2', position: 'WR', pts: 4 }];
  const got = S.fill(slots, players, p => p.pts);
  const total = got.reduce((s, p) => s + p.pts, 0);
  ck('the flex takes the best remaining ELIGIBLE man, not the best remaining man',
    total === 20 + 18 + 12 + 15, { chosen: got.map(p => p.id), total: total });
  ck('CONTROL — the greedy answer beats the obvious wrong one (flex from RB)',
    total > 20 + 18 + 12 + 9);
  /* EXHAUSTIVE CHECK on a small case: no assignment scores higher. Greedy is
   * argued to be optimal for this seat structure and an argument is not a
   * proof; this is the proof, on a case small enough to enumerate. */
  let best = 0;
  const idx = players.map((_, i) => i);
  const perm = (arr, k, used, sum) => {
    if (k === slots.length) { best = Math.max(best, sum); return; }
    idx.forEach(i => {
      if (used.has(i)) return;
      if (slots[k].elig.indexOf(players[i].position) < 0) return;
      used.add(i); perm(arr, k + 1, used, sum + players[i].pts); used.delete(i);
    });
  };
  perm(players, 0, new Set(), 0);
  ck('EXHAUSTIVE — no legal assignment scores more than greedy', total === best,
    { greedy: total, exhaustive: best });
}

// ── 5. THE PER-OWNER HOLE IS CLOSED ──────────────────────────────────────
//
// ⚠️ RE-BASED 2026-08-14, AND THE OLD ASSERTION WAS NOT WRONG — IT EXPIRED.
//
// It read: "Cory's own gradeable weeks are FEW — the hole is on his roster, and
// this is the fact that stops a per-owner claim being made", asserting
// `mine.length < 30`. That was true and worth pinning: 4 gradeable weeks of a
// possible 54, and the tool printed "CORY ONLY: NOT MEASURABLE".
//
// THE HOLE IS GONE, so the assertion became unprovable — and a test that can
// only pass while a defect is present stops testing anything the day the defect
// is fixed. C named this shape earlier today on the retired-player detector:
// "it did not stop working, it ran out of things to find."
//
// WHAT CLOSED IT WAS NOT WHAT THE TOOL PREDICTED. Its own note said "Resolving
// those ten ids against Sleeper's full player list is what unlocks it." Nobody
// resolved anything against Sleeper. `lineup_skill` was building its position
// map from `BOARD.players` only, and the missing men were KEEPERS — who live in
// `kept_players`, which it never read. Routing it through the shared
// `position_map` (which includes them) took his sample 4 -> 52 and the league's
// 458 -> 530 team-weeks.
//
// So this section now asserts the OPPOSITE property, which is the one that has
// to keep holding: his rows are gradeable, and the per-owner claim is available.
{
  const mine = M.rows.filter(r => r.mine);
  ck('CONTROL — the owner crosswalk works at all (rows carry owners)',
    new Set(M.rows.map(r => r.owner)).size >= 8,
    new Set(M.rows.map(r => r.owner)).size);
  ck('Cory\'s own weeks are now GRADEABLE — the per-owner claim the tool used to '
    + 'refuse can be made', mine.length >= 30, mine.length);
  ck('and his sample is comparable to everyone else\'s rather than a remnant — '
    + 'a handful of weeks would still be a hole wearing a number',
    mine.length >= 0.6 * (M.rows.length / new Set(M.rows.map(r => r.owner)).size),
    { mine: mine.length, mean_per_owner: Math.round(M.rows.length / new Set(M.rows.map(r => r.owner)).size) });
  ck('every owner has a usable sample, so no per-owner comparison is resting on '
    + 'somebody\'s remnant',
    [...new Set(M.rows.map(r => r.owner))].filter(o =>
      M.rows.filter(r => r.owner === o).length >= 30).length >= 8,
    [...new Set(M.rows.map(r => r.owner))].map(o =>
      o.slice(-4) + ':' + M.rows.filter(r => r.owner === o).length));
  /* AND THE UNRESOLVED COUNT IS PINNED LOW, which is the thing that would
   * regress if anybody re-coupled this tool to the live board. The old
   * assertion measured the SYMPTOM on one owner; this measures the CAUSE. */
  ck('almost nothing is unresolved any more — the cause, not the symptom',
    M.dropped == null || M.dropped <= 20, { dropped: M.dropped, used: M.rows.length });
}

// ── 6. CALIBRATION IS SOLVED, NOT EYEBALLED ──────────────────────────────
{
  const PLAN = require(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'));
  const byId = {};
  PLAN.pool.forEach(p => { byId[String(p.player_id)] = p; });
  const R = PLAN.keep.map(k => byId[String(k.player_id)] || k)
    .concat(PLAN.plan.filter(x => x.p).map(x => byId[String(x.p.player_id)] || x.p))
    .filter(Boolean);
  const CFG = { sims: 250 };
  const s0 = S.shareAt(R, 0, CFG).share, s1 = S.shareAt(R, 1, CFG).share;
  ck('share(0) is 0 and share(1) is 1 by construction', Math.abs(s0) < 1e-9
    && Math.abs(s1 - 1) < 1e-9, { s0: s0, s1: s1 });
  const a = S.shareAt(R, 0.25, CFG).share, b = S.shareAt(R, 0.6, CFG).share;
  ck('and it is MONOTONE between them, which is what makes bisection legal',
    a < b && a > 0 && b < 1, { at_025: a, at_06: b });
  const rho = S.calibrate(R, all.skill_share, CFG);
  ck('the calibrated ρ sits strictly inside (0,1)', rho > 0.05 && rho < 0.95, rho);
  ck('and reproduces the measured share it was solved for',
    Math.abs(S.shareAt(R, rho, CFG).share - all.skill_share) < 0.03,
    { rho: rho, got: S.shareAt(R, rho, CFG).share, target: all.skill_share });
  ck('CONTROL — a DIFFERENT target gives a different ρ, so calibrate is not a '
    + 'constant', Math.abs(S.calibrate(R, 0.6, CFG) - rho) > 0.05,
    { at_measured: rho, at_60pct: S.calibrate(R, 0.6, CFG) });
  let threw = null;
  try { S.calibrate(R, 1.4, CFG); } catch (e) { threw = e.message; }
  ck('and a target outside (0,1) THROWS rather than returning an end',
    !!threw && /REFUSING/.test(threw), threw);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed  (capture '
  + (100 * all.capture).toFixed(1) + '%, floor ' + (100 * all.naive_capture).toFixed(1)
  + '%, skill share ' + (100 * all.skill_share).toFixed(1) + '%)');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: lineup skill is a MEASURED input to the bench model,');
console.log('the floor it is read against is measured too, three seasons agree, the');
console.log('optimum is provably optimal on an enumerable case, and ρ is solved rather');
console.log('than chosen.');
console.log('WHAT IT DOES NOT: measure CORY. Three of the ten unmapped players started on');
console.log('his roster every season, so the room average stands in for him — an');
console.log('assumption, now a written one. Resolving those ten ids is what closes it.');
