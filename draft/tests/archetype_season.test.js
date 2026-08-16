// TERRITORY: A
// SEASON-OUTCOME SCORING — pure-function tests with deterministic seeds, plus
// the cross-derivation-path check (rule 11): this module's playoff read must
// agree with src/routes/champodds.js on the same strengths.
//
// Run: node draft/tests/archetype_season.test.js
'use strict';
const path = require('path');
const AS = require(path.join(__dirname, '..', 'tools', 'archetype_season.js'));
const CH = require(path.join(__dirname, '..', '..', 'src', 'routes', 'champodds.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// ── playerWeekMean: the season total is conserved, absent is not zero ──────
{
  const p = { player_id: '1', position: 'RB', proj_mean: 160, bye: 7 };
  ck('bye week contributes exactly 0', AS.playerWeekMean(p, 7) === 0);
  ck('a non-bye week is proj_mean/16', near(AS.playerWeekMean(p, 3), 10, 1e-12));
  let sum = 0;
  for (let w = 1; w <= 17; w++) sum += AS.playerWeekMean(p, w);
  ck('IDENTITY (fp epsilon only): 17-week sum equals proj_mean exactly',
    near(sum, 160, 1e-9), sum);
}
{
  const p = { player_id: '2', position: 'WR', proj_mean: 170 };  // no bye known
  ck('unknown bye: flat proj_mean/17 — the unknown is spread, never zeroed',
    near(AS.playerWeekMean(p, 5), 10, 1e-12));
  let sum = 0;
  for (let w = 1; w <= 17; w++) sum += AS.playerWeekMean(p, w);
  ck('unknown-bye 17-week sum also equals proj_mean', near(sum, 170, 1e-9));
}

// ── lineupPointsForWeek: known-correct case, computed by hand ──────────────
{
  // QB 20; RB 15,12,8 (RB3 8 vs WR3 9 for flex); WR 14,11,9; TE 7; K 6; DEF 5.
  // Dedicated: 20+15+12+14+11+7+6+5 = 90. Flex best remaining: WR3 9 > RB3 8.
  // Expected total 99 — established independently of the implementation.
  let id = 0;
  const mk = (pos, pts) => ({ player_id: String(++id), position: pos, _pts: pts });
  const roster = [mk('QB', 20), mk('RB', 15), mk('RB', 12), mk('RB', 8),
    mk('WR', 14), mk('WR', 11), mk('WR', 9), mk('TE', 7), mk('K', 6), mk('DEF', 5)];
  const weekPts = {};
  roster.forEach(p => { weekPts[p.player_id] = p._pts; });
  ck('hand-computed lineup: dedicated 90 + best flex 9 (WR3 over RB3) = 99',
    near(AS.lineupPointsForWeek(roster, weekPts), 99, 1e-9),
    AS.lineupPointsForWeek(roster, weekPts));
  // Boundary control: raise RB3 to 9.5 and the flex flips to him — 99.5.
  weekPts[roster[3].player_id] = 9.5;
  ck('flex flips at the boundary: RB3 9.5 now beats WR3 9 -> 99.5',
    near(AS.lineupPointsForWeek(roster, weekPts), 99.5, 1e-9));
}

// ── the wire floor: streamed slots, hand-computed ──────────────────────────
{
  let id = 100;
  const mk = (pos, pts) => ({ player_id: String(++id), position: pos, _pts: pts });
  const roster = [mk('QB', 4), mk('RB', 15), mk('RB', 12), mk('WR', 14),
    mk('WR', 11), mk('TE', 7), mk('K', 6), mk('DEF', 5)];
  const weekPts = {};
  roster.forEach(p => { weekPts[p.player_id] = p._pts; });
  const floor = { QB: 23.38, RB: 7.8, WR: 11.1, TE: 11.6 };
  // Hand-computed: QB slot streams (4 -> 23.38), TE streams (7 -> 11.6),
  // RB/WR own players beat their floors (15,12,14,11 vs 7.8/11.1... WR2 11
  // is BELOW 11.1 -> streams to 11.1), K/DEF have no floor (6+5), no
  // flex-eligible spare so FLEX streams at min(7.8, 11.1, 11.6) = 7.8.
  // Total = 23.38 + 15 + 12 + 14 + 11.1 + 11.6 + 6 + 5 + 7.8 = 105.88
  const got = AS.lineupPointsForWeek(roster, weekPts, floor);
  ck('wire floor, hand-computed: streamed QB/TE/WR2/FLEX -> 105.88',
    near(got, 105.88, 1e-9), got);
  ck('the same roster WITHOUT the floor keeps the zero-replacement total (74)',
    near(AS.lineupPointsForWeek(roster, weekPts), 74, 1e-9),
    AS.lineupPointsForWeek(roster, weekPts));
  // Boundary: a WR at exactly the floor is indifferent; at floor+0.1 the
  // own player wins and the total moves by exactly 0.1.
  weekPts[roster[4].player_id] = 11.2;
  ck('boundary: WR2 at floor+0.1 beats the stream by exactly 0.1',
    near(AS.lineupPointsForWeek(roster, weekPts, floor), 105.98, 1e-9));
}
{
  const wmOff = AS.weeklyTeamMeans([
    { player_id: 'q', position: 'QB', proj_mean: 320, bye: 5 }]);
  const wmOn = AS.weeklyTeamMeans([
    { player_id: 'q', position: 'QB', proj_mean: 320, bye: 5 }],
    AS.REGULAR_SEASON_WEEKS, { wireFloor: { QB: 23.38, RB: 7.8, WR: 11.1, TE: 11.6 } });
  // Hand-computed bye week (only a QB rostered, on bye): floored lineup =
  // QB 23.38 + RB 2x7.8 + WR 2x11.1 + TE 11.6 + FLEX 7.8 + K/DEF 0 = 80.58;
  // unfloored = 0.
  ck('weeklyTeamMeans threads the floor: the QB bye week streams the whole '
    + 'lineup (80.58) instead of scoring 0',
    wmOff.series[4] === 0 && near(wmOn.series[4], 80.58, 1e-9),
    { off: wmOff.series[4], on: wmOn.series[4] });
}

// ── weeklyTeamMeans: byes bite where there is no depth ─────────────────────
{
  const roster = [
    { player_id: 'q', position: 'QB', proj_mean: 320, bye: 5 },
    { player_id: 'r1', position: 'RB', proj_mean: 240, bye: 6 },
    { player_id: 'r2', position: 'RB', proj_mean: 208, bye: 7 },
    { player_id: 'w1', position: 'WR', proj_mean: 224, bye: 8 },
    { player_id: 'w2', position: 'WR', proj_mean: 192, bye: 9 },
    { player_id: 't', position: 'TE', proj_mean: 160, bye: 10 },
    { player_id: 'k', position: 'K', proj_mean: 144, bye: 11 },
    { player_id: 'd', position: 'DEF', proj_mean: 128, bye: 12 },
  ];
  const wm = AS.weeklyTeamMeans(roster);
  ck('series covers the 15-week regular season', wm.series.length === 15);
  // Week 1: nobody on bye, no flex-eligible spare -> sum of all/16.
  const full = (320 + 240 + 208 + 224 + 192 + 160 + 144 + 128) / 16;
  ck('a no-bye week starts everyone: sum(proj_mean)/16', near(wm.series[0], full, 1e-9));
  ck('the QB bye week (5) loses exactly the QB\'s weekly mean',
    near(wm.series[4], full - 320 / 16, 1e-9), wm.series[4]);
  ck('unknown_bye is 0 when every projected player has a bye', wm.unknown_bye === 0);
}
{
  const wm = AS.weeklyTeamMeans([
    { player_id: 'a', position: 'WR', proj_mean: 100 },          // projected, no bye
    { player_id: 'b', position: 'RB', proj_mean: 0 },            // unprojected, no bye
    { player_id: 'c', position: 'TE', proj_mean: 90, bye: 6 },
  ]);
  ck('unknown_bye COUNTS only projected players missing a bye (1, not 2)',
    wm.unknown_bye === 1, wm.unknown_bye);
}

// ── standingsMC: determinism, identities, sanity ───────────────────────────
function flatTeams(means) {
  const t = {};
  Object.keys(means).forEach(id => { t[id] = Array(15).fill(means[id]); });
  return t;
}
{
  const means = {};
  for (let i = 1; i <= 10; i++) means[i] = 95 + i;
  const teams = flatTeams(means);
  const a = AS.standingsMC(teams, { sd: 21.3, sims: 500, seed: 42 });
  const b = AS.standingsMC(teams, { sd: 21.3, sims: 500, seed: 42 });
  ck('same seed reproduces byte-identical results',
    JSON.stringify(a) === JSON.stringify(b));
  const c = AS.standingsMC(teams, { sd: 21.3, sims: 500, seed: 43 });
  ck('a different seed produces different results — the MC actually varies',
    JSON.stringify(a) !== JSON.stringify(c));

  const sumPlayoff = Object.values(a).reduce((s, r) => s + r.playoff_prob, 0);
  const sumBottom = Object.values(a).reduce((s, r) => s + r.bottom3_prob, 0);
  // Exact identities (rule 10b): every sim seats exactly 4 and 3. The only
  // defensible band is float epsilon.
  ck('IDENTITY: playoff probabilities sum to exactly 4', near(sumPlayoff, 4, 1e-9), sumPlayoff);
  ck('IDENTITY: bottom-3 probabilities sum to exactly 3', near(sumBottom, 3, 1e-9), sumBottom);
  ck('a stronger mean never lowers playoff odds by more than MC noise '
    + '(monotone-ish sanity: team 10 > team 1)',
    a[10].playoff_prob > a[1].playoff_prob);
}
{
  const means = { 1: 200 };
  for (let i = 2; i <= 10; i++) means[i] = 100;
  const r = AS.standingsMC(flatTeams(means), { sd: 15, sims: 800, seed: 7 });
  ck('a dominant team makes the playoff ~always and busts ~never',
    r[1].playoff_prob > 0.99 && r[1].bottom3_prob < 0.005, r[1]);
}
{
  let threw = false;
  try { AS.standingsMC(flatTeams({ 1: 100, 2: 100 }), { sims: 10, seed: 1 }); }
  catch (e) { threw = true; }
  ck('sd is REQUIRED — no silent default for the one measured parameter', threw);
  let threw2 = false;
  try {
    AS.standingsMC({ 1: Array(15).fill(100), 2: Array(14).fill(100) },
      { sd: 20, sims: 10, seed: 1 });
  } catch (e) { threw2 = true; }
  ck('unequal week series refuse rather than mis-pairing weeks', threw2);
}

// ── RULE 11: cross-derivation-path agreement with champodds ────────────────
// Same flat strengths through (a) this module's standings MC and (b) the
// validated champodds simulator. Two independently coded paths, same model
// assumptions (Normal weekly draws, random pairings, top-4 cut) — their
// playoff numbers must agree to within MC error, or one of the two is not
// computing what it claims.
{
  const means = {};
  for (let i = 1; i <= 10; i++) means[i] = 90 + 3 * i;
  const mine = AS.standingsMC(flatTeams(means), { sd: 21.3, sims: 6000, seed: 11 });
  const strengths = {};
  Object.keys(means).forEach(id => { strengths[id] = { mean: means[id], sd: 21.3 }; });
  const theirs = CH.simulate({ strengths, baseRec: null, futureWeeks: 15,
    schedule: null, cut: 4, sims: 6000, seed: 12 });
  let worst = 0, worstId = null;
  for (let i = 1; i <= 10; i++) {
    const d = Math.abs(mine[i].playoff_prob - theirs[i].playoff_prob);
    if (d > worst) { worst = d; worstId = i; }
  }
  // 6000 sims -> MC se ~ 0.006 per arm; 0.025 is ~3 combined sigmas.
  ck('playoff_prob agrees with champodds.simulate on every team (worst |d| < 0.025)',
    worst < 0.025, { worst, worstId });
  let worstW = 0;
  for (let i = 1; i <= 10; i++) {
    worstW = Math.max(worstW, Math.abs(mine[i].exp_wins - theirs[i].exp_wins));
  }
  ck('exp_wins agrees with champodds.simulate on every team (worst |d| < 0.15)',
    worstW < 0.15, worstW);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
