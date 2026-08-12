// TERRITORY: A
/* RUN THE COHERENCE CHECK ON REAL SEASONS — because a check that has only ever
 * seen fixtures is a check nobody knows the answer to.
 *
 * `coherence.test.js` proves the comparator catches a break. It cannot say
 * whether the two live surfaces actually agree, and that is the question. This
 * walks 2023-25 at the same checkpoints the analyzer validates itself at, builds
 * the lineup side's probabilities the way `claims-cron` builds them, and reports
 * the divergence.
 *
 * THE TOLERANCES ARE DECLARED HERE, BEFORE THE RUN, and they are arguments to
 * the comparator rather than defaults inside it:
 *
 *   tol_wins = 1.0   — one game. Below that the two surfaces are arguing about
 *                      less than a single result over a whole rest-of-season.
 *   tol_prob = 0.15  — fifteen points of playoff probability. Chosen as roughly
 *                      the width of one of the analyzer's own calibration
 *                      deciles plus its neighbour: a disagreement smaller than
 *                      the resolution of the only calibration evidence we have
 *                      is not a disagreement anybody could act on.
 *
 * ⚠️ STATED BEFORE THE NUMBERS: I expect these to DIVERGE, and materially. The
 * two sides do not share an input. The analyzer models a team's weekly SCORE
 * from its own past weeks; the claims side models strength from SEASON
 * POINTS-FOR through a tanh. A tanh capped at MIN_P/MAX_P cannot express a
 * 95%-favourite, so the claims side is structurally compressed toward 0.5, which
 * should show up as the analyzer being MORE extreme at both tails. If that is
 * what comes back, the finding is not "a bug" — it is that the two surfaces
 * carry different beliefs and the product has never noticed.
 */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'src', 'coherence.js'));
const ST = require(path.join(ROOT, 'src', 'routes', 'standings.js'));
const LO = require(path.join(ROOT, 'src', 'routes', 'lineup.js'));
const PO = require(path.join(ROOT, 'src', 'routes', 'playoffs.js'));

const TOL_WINS = 1.0;
const TOL_PROB = 0.15;
const CHECKPOINTS = [4, 7, 10];

/* The claims side's probability, built the SAME way `claims-cron.buildClaims`
 * builds it — winProb against the field on season points-for, then normalised so
 * the pair sums to 1. Reproduced here rather than imported because the cron's
 * copy is wrapped in store/egress; the arithmetic is asserted identical by
 * `claims_cron.test.js` on its side and by the identity check on this one. */
function claimsProb(pfByRid, home, away) {
  const vals = Object.keys(pfByRid).map(k => Number(pfByRid[k]) || 0);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length);
  const ph = PO.winProb({ pf: Number(pfByRid[home]) || 0 }, mean, sd);
  const pa = PO.winProb({ pf: Number(pfByRid[away]) || 0 }, mean, sd);
  const denom = ph + pa;
  return denom > 0 ? ph / denom : 0.5;
}

function runSeason(season, year, throughWeek) {
  const fws = LO.fieldWeeklyScores(season);
  const wm = LO.weeklyMatchups(season);
  const weeks = LO.regularSeasonWeeks(season);
  const rids = Object.keys(LO.fieldWeeklyScores(season)[weeks[0]] || {}).map(Number);
  if (!rids.length) return null;

  // Locked state through the checkpoint — the same base both sides start from.
  const baseWins = {}, basePf = {};
  rids.forEach(r => { baseWins[r] = 0; basePf[r] = 0; });
  for (const w of weeks.filter(x => x <= throughWeek)) {
    const scores = fws[w] || {}, pairs = wm[w] || {}, seen = new Set();
    for (const rid of rids) {
      basePf[rid] += Number(scores[rid] || 0);
      const opp = pairs[rid];
      if (opp == null || seen.has(rid)) continue;
      seen.add(rid); seen.add(opp);
      const a = Number(scores[rid] || 0), b = Number(scores[opp] || 0);
      if (a > b) baseWins[rid]++; else if (b > a && baseWins[opp] != null) baseWins[opp]++;
    }
  }

  // The claims side's view of every remaining game.
  const games = [], perTeam = {};
  rids.forEach(r => { perTeam[r] = []; });
  const identities = [];
  for (const w of weeks.filter(x => x > throughWeek)) {
    const pairs = wm[w] || {}, seen = new Set();
    const wkMatchups = [];
    for (const rid of rids) {
      const opp = pairs[rid];
      if (opp == null || seen.has(rid)) continue;
      seen.add(rid); seen.add(opp);
      const p = claimsProb(basePf, rid, opp);
      games.push({ week: w, home: rid, away: opp, p_home: p });
      wkMatchups.push({ home: rid, away: opp, p_home: p });
      perTeam[rid].push(p);
      if (perTeam[opp]) perTeam[opp].push(1 - p);
    }
    if (wkMatchups.length) identities.push(C.weekProbabilityIdentity(wkMatchups));
  }
  if (!games.length) return null;

  const spots = ST.PLAYOFF_SPOTS;
  const proj = ST.projectStandings(season, { throughWeek: throughWeek, sims: 3000, seed: 999 + throughWeek });
  const implied = C.impliedPlayoffOdds({
    games: games, rids: rids, spots: spots, seed: 4242,
    seedOrderFn: ST.seedOrder, sims: 4000, baseWins: baseWins, basePf: basePf,
  });
  const ew = C.expectedWins(perTeam, baseWins);
  const cmp = C.compare({ analyzer: proj.projections, implied: implied,
    expected_wins: ew, tol_prob: TOL_PROB, tol_wins: TOL_WINS });

  return { year, throughWeek, cmp,
    identity_ok: identities.every(i => i.exact), identity_weeks: identities.length };
}

const history = LO.harvest();
const years = LO.defaultSeasons(history);

console.log('='.repeat(78));
console.log('CROSS-TOOL COHERENCE — analyzer playoff odds vs lineup-implied odds');
console.log('='.repeat(78));
console.log(`Tolerances DECLARED BEFORE THE RUN: ±${TOL_PROB} playoff probability, `
  + `±${TOL_WINS} expected wins.`);
console.log('');

let anyDiverge = false, worstProb = 0, worstWins = 0, allIdentity = true;
for (const year of years) {
  const season = LO.seasonOf(history, year);
  if (!season) continue;
  for (const cw of CHECKPOINTS) {
    const r = runSeason(season, year, cw);
    if (!r) { console.log(`  ${year} @wk${cw}: no remaining games — skipped`); continue; }
    const d = r.cmp.rows.filter(x => x.d_playoff_prob != null);
    const mp = Math.max(...d.map(x => Math.abs(x.d_playoff_prob)));
    const mw = Math.max(...d.map(x => Math.abs(x.d_exp_wins)));
    worstProb = Math.max(worstProb, mp); worstWins = Math.max(worstWins, mw);
    if (!r.identity_ok) allIdentity = false;
    if (!r.cmp.coherent) anyDiverge = true;
    console.log(`  ${year} @wk${cw}  ${r.cmp.coherent ? 'COHERENT' : 'DIVERGES '}`
      + `  worst Δodds ${(mp * 100).toFixed(0)}pp   worst Δwins ${mw.toFixed(2)}`
      + `   diverging teams ${r.cmp.diverging.length}/${r.cmp.rows.length}`
      + `   identity ${r.identity_ok ? 'exact' : 'BROKEN'} (${r.identity_weeks} wks)`);
  }
}
console.log('');
console.log(`  IDENTITY (sum of win probs == games, exact): ${allIdentity ? 'HOLDS everywhere' : 'BROKEN somewhere'}`);
console.log(`  WORST divergence across all checkpoints: ${(worstProb * 100).toFixed(0)}pp playoff odds, `
  + `${worstWins.toFixed(2)} expected wins`);
console.log(`  VERDICT: ${anyDiverge ? 'THE TWO SURFACES DISAGREE' : 'coherent at the declared tolerance'}`);

// A worked example from the widest checkpoint, so the shape of the disagreement
// is readable rather than only its size.
const season = LO.seasonOf(history, years[years.length - 1]);
if (season) {
  const r = runSeason(season, years[years.length - 1], 7);
  if (r) {
    console.log(`\n  WORKED EXAMPLE — ${r.year} @wk7, per team:`);
    console.log('    rid   analyzer   implied     Δodds    an.wins  im.wins    Δwins');
    r.cmp.rows.forEach(x => console.log(
      `    ${String(x.rid).padStart(3)}   ${String((x.analyzer_playoff_prob * 100).toFixed(0) + '%').padStart(7)}`
      + `   ${String((x.implied_playoff_prob * 100).toFixed(0) + '%').padStart(7)}`
      + `   ${String(((x.d_playoff_prob) * 100).toFixed(0) + 'pp').padStart(7)}`
      + `   ${String(x.analyzer_exp_wins.toFixed(2)).padStart(7)}  ${String(x.implied_exp_wins.toFixed(2)).padStart(7)}`
      + `   ${String(x.d_exp_wins.toFixed(2)).padStart(7)}   ${x.status}`));
  }
}
