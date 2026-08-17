// TERRITORY: A
/* CONDITIONAL-VALUE WEEKLY-HIGH SIM — the pricing arm of the stack premium.
 *
 * WHAT IT PRICES. In a league that pays the WEEKLY HIGH ($100/wk, 10 teams),
 * variance is an asset. A same-team QB+WR pair adds covariance to the owner's
 * weekly score: Var(team) grows by 2·rho·sd_a·sd_b (the covIncrement, measured
 * in draft/backtest/conditional_value.py from the component stores). This sim
 * prices that increment: P(weekly high) with the covariance ON vs OFF, in the
 * same seeded draws, and BOTH tails — the same correlation that buys high
 * weeks buys bust weeks, and pretending otherwise would be advocacy.
 *
 * WHY ONE INFLATED SD IS THE EXACT SAME MODEL AS A BIVARIATE PAIR. The team
 * score here is Normal (champodds' model: weekly score ~ N(mean, WEEKLY_SD)).
 * Decompose it as rest + A + B with A,B bivariate-normal at correlation rho:
 * the sum is again Normal with variance sd² + 2·rho·sd_a·sd_b. Only the TOTAL
 * variance reaches the contest, so the sim draws one Normal per team with
 * sdOn = sqrt(sd² + covIncrement) — and the test file proves the identity by
 * running an explicit bivariate construction against this one.
 *
 * MACHINERY: champodds' model constants and generator family — CFG.WEEKLY_SD
 * (21.3, measured over 30 team-seasons 2023-25) via require, mulberry32 +
 * Box-Muller via draft/tools/archetype_season.js (the same generators
 * standings.js/champodds.js use; champodds does not export its copies).
 * Common-random-numbers: ON and OFF arms share every draw, so the delta is
 * the covariance term's alone, not Monte-Carlo luck.
 *
 * BASELINE, stated: all 10 teams at EQUAL means. P(high) = 1/10 exactly by
 * symmetry, so dHigh is measured against a known truth (the test pins it).
 * The equal-mean field is the same neutral baseline champProbLive collapses
 * to preseason; a team already above the field gains slightly less from
 * variance, below-field slightly more — the artifact's caveats say so.
 *
 * GATED: nothing on any surface calls this. Artifact + doc only.
 *
 * CLI: node draft/tools/conditional_value_sim.js --json '{"op":"stack","covIncrement":131}'
 */
'use strict';
const path = require('path');
const CH = require(path.join(__dirname, '..', '..', 'src', 'routes', 'champodds.js'));
const AS = require(path.join(__dirname, 'archetype_season.js'));

const TEAMS = 10;
const DEFAULT_SIMS = 20000;
const DEFAULT_SEED = 20260816;

/** sqrt(sd² + covIncrement) — the ON-arm team sd. REFUSES a covIncrement
 *  that would drive team variance non-positive rather than clamping: a
 *  negative-variance input is a measurement error upstream, and pricing it
 *  silently would launder it into a dollar figure. */
function inflatedSd(sd, covIncrement) {
  const v = sd * sd + covIncrement;
  if (!(v > 0)) throw new Error(`covIncrement ${covIncrement} drives team variance to ${v} <= 0 — refusing`);
  return Math.sqrt(v);
}

/**
 * The weekly-high contest, covariance ON vs OFF under common random numbers.
 *
 * Each simulated week: 10 equal-mean teams draw z-scores; my team's score is
 * mean + sdOff·z (OFF) and mean + sdOn·z (ON) from the SAME z; the other nine
 * draw at the field sd. Counted per arm:
 *   pHigh     — my score is the strict weekly max (the $100)
 *   pLow      — my score is the strict weekly min (the bust tail, priced)
 *   pBelow1Sd — my score < mean − sd (a "bad week" at the field's own scale)
 *
 * @returns { pHighOn, pHighOff, dHigh, pLowOn, pLowOff, dLow,
 *            pBelow1SdOn, pBelow1SdOff, dBelow1Sd, sdOn, sdOff, sims, seed }
 */
function weeklyHighContest({ covIncrement, sd = CH.CFG.WEEKLY_SD, teams = TEAMS,
                             sims = DEFAULT_SIMS, seed = DEFAULT_SEED, mean = 100 }) {
  if (covIncrement == null || !isFinite(covIncrement)) {
    throw new Error('covIncrement required — an absent correlation is not a zero premium, refuse to price it');
  }
  const sdOn = inflatedSd(sd, covIncrement);
  const rand = AS.mulberry32(seed);
  let hiOn = 0, hiOff = 0, loOn = 0, loOff = 0, b1On = 0, b1Off = 0;
  const bar = mean - sd;
  for (let s = 0; s < sims; s++) {
    const zMe = AS.gauss(rand, 0, 1);
    const mineOff = mean + sd * zMe;
    const mineOn = mean + sdOn * zMe;
    let oppMax = -Infinity, oppMin = Infinity;
    for (let t = 1; t < teams; t++) {
      const o = AS.gauss(rand, mean, sd);
      if (o > oppMax) oppMax = o;
      if (o < oppMin) oppMin = o;
    }
    if (mineOn > oppMax) hiOn++;
    if (mineOff > oppMax) hiOff++;
    if (mineOn < oppMin) loOn++;
    if (mineOff < oppMin) loOff++;
    if (mineOn < bar) b1On++;
    if (mineOff < bar) b1Off++;
  }
  const f = x => x / sims;
  return {
    pHighOn: f(hiOn), pHighOff: f(hiOff), dHigh: f(hiOn - hiOff),
    pLowOn: f(loOn), pLowOff: f(loOff), dLow: f(loOn - loOff),
    pBelow1SdOn: f(b1On), pBelow1SdOff: f(b1Off), dBelow1Sd: f(b1On - b1Off),
    sdOn, sdOff: sd, sims, seed,
  };
}

/**
 * The composite-point equivalent: the WEEKLY mean bump an UNSTACKED team
 * would need to reach the stacked team's P(weekly high). Solved by bisection
 * on the same seeded contest (monotone in the bump), so the answer is in the
 * sim's own units — season points = weekly × co-active weeks, applied by the
 * artifact builder. Returns the weekly bump in points.
 */
function pointEquivalent({ covIncrement, sd = CH.CFG.WEEKLY_SD, teams = TEAMS,
                           sims = DEFAULT_SIMS, seed = DEFAULT_SEED, tol = 1e-4 }) {
  const target = weeklyHighContest({ covIncrement, sd, teams, sims, seed }).pHighOn;
  const pAt = bump => {
    // same generator, same field: my mean shifted, variance NOT inflated
    const rand = AS.mulberry32(seed);
    let hi = 0;
    for (let s = 0; s < sims; s++) {
      const mine = 100 + bump + sd * AS.gauss(rand, 0, 1);
      let oppMax = -Infinity;
      for (let t = 1; t < teams; t++) {
        const o = AS.gauss(rand, 100, sd);
        if (o > oppMax) oppMax = o;
      }
      if (mine > oppMax) hi++;
    }
    return hi / sims;
  };
  let lo = 0, hi = Math.max(1, sd);
  if (covIncrement < 0) { lo = -Math.max(1, sd); hi = 0; }
  for (let i = 0; i < 40 && hi - lo > tol; i++) {
    const mid = (lo + hi) / 2;
    if (pAt(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function main() {
  const i = process.argv.indexOf('--json');
  if (i < 0 || !process.argv[i + 1]) {
    console.error('usage: node conditional_value_sim.js --json \'{"op":"stack","covIncrement":<number>}\'');
    process.exit(2);
  }
  const req = JSON.parse(process.argv[i + 1]);
  if (req.op !== 'stack') throw new Error(`unknown op ${req.op}`);
  const res = weeklyHighContest(req);
  res.pointEquivalentWeekly = Math.round(pointEquivalent(req) * 1000) / 1000;
  process.stdout.write(JSON.stringify(res) + '\n');
}

module.exports = { TEAMS, DEFAULT_SIMS, DEFAULT_SEED, inflatedSd,
  weeklyHighContest, pointEquivalent };

if (require.main === module) main();
