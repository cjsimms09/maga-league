// TERRITORY: A
// CONDITIONAL-VALUE SIM — pure-function tests with deterministic seeds:
// the zero-covariance null, both tails moving together, the symmetric-field
// baseline (P(high) = 1/10 by construction), the bivariate-pair identity
// (an explicit correlated QB+WR construction prices the same as the one
// inflated sd), the refusal arms, and the point-equivalent inversion.
//
// Run: node draft/tests/conditional_value_sim.test.js
'use strict';
const path = require('path');
const CV = require(path.join(__dirname, '..', 'tools', 'conditional_value_sim.js'));
const AS = require(path.join(__dirname, '..', 'tools', 'archetype_season.js'));
const CH = require(path.join(__dirname, '..', '..', 'src', 'routes', 'champodds.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// ── inflatedSd: hand arithmetic and the refusal arm ─────────────────────────
{
  ck('inflatedSd: sqrt(21.3^2 + 122.29) recomputed by hand',
    near(CV.inflatedSd(21.3, 122.29), Math.sqrt(453.69 + 122.29), 1e-12));
  ck('inflatedSd: zero increment is the identity',
    CV.inflatedSd(21.3, 0) === 21.3);
  let threw = false;
  try { CV.inflatedSd(21.3, -454); } catch (e) { threw = true; }
  ck('inflatedSd REFUSES an increment that drives variance <= 0 (no silent clamp)', threw);
}

// ── determinism ─────────────────────────────────────────────────────────────
{
  const a = CV.weeklyHighContest({ covIncrement: 100, sims: 4000, seed: 7 });
  const b = CV.weeklyHighContest({ covIncrement: 100, sims: 4000, seed: 7 });
  ck('same seed, same inputs -> identical result',
    JSON.stringify(a) === JSON.stringify(b));
  const c = CV.weeklyHighContest({ covIncrement: 100, sims: 4000, seed: 8 });
  ck('a different seed actually moves the draws', a.pHighOn !== c.pHighOn);
}

// ── the zero-covariance null and the symmetric baseline ─────────────────────
{
  const r = CV.weeklyHighContest({ covIncrement: 0, sims: 20000, seed: 11 });
  ck('covIncrement 0: dHigh is EXACTLY 0 (common random numbers, same sd)',
    r.dHigh === 0 && r.dLow === 0 && r.dBelow1Sd === 0, r);
  // 10 equal teams: P(high) = 1/10 by symmetry. MC se at 20k sims ~ 0.0021.
  ck('symmetric 10-team field: pHighOff within 3 MC sigmas of 0.10',
    near(r.pHighOff, 0.10, 0.0065), r.pHighOff);
  ck('symmetric field: pLowOff likewise ~0.10', near(r.pLowOff, 0.10, 0.0065));
}

// ── both tails move together, in the sign of the covariance ─────────────────
{
  const up = CV.weeklyHighContest({ covIncrement: 122.29, sims: 20000, seed: 3 });
  ck('positive covariance raises P(weekly high)', up.dHigh > 0, up.dHigh);
  ck('the SAME covariance raises the bust tail too (dLow > 0) — both tails priced',
    up.dLow > 0, up.dLow);
  ck('and the below-1-sd bad-week rate rises with it', up.dBelow1Sd > 0);
  const dn = CV.weeklyHighContest({ covIncrement: -31.78, sims: 20000, seed: 3 });
  ck('negative covariance (the Chase+Higgins pair) LOWERS P(weekly high)',
    dn.dHigh < 0, dn.dHigh);
  ck('...and lowers the bust tail symmetrically', dn.dLow < 0);
  const big = CV.weeklyHighContest({ covIncrement: 200, sims: 20000, seed: 3 });
  ck('a larger increment buys a larger dHigh (monotone in covariance)',
    big.dHigh > up.dHigh, { big: big.dHigh, up: up.dHigh });
}

// ── the bivariate identity: an explicit correlated pair prices the same ─────
{
  // Explicit construction: team = rest + A + B with corr(A,B) = rho, against
  // the module's single inflated draw. Same model by algebra; this pins it.
  const sd = CH.CFG.WEEKLY_SD, sdA = 10.83, sdB = 10.87, rho = 0.5194;
  const dv = 2 * rho * sdA * sdB;
  const sims = 60000, mean = 100;
  const restVar = sd * sd - sdA * sdA - sdB * sdB;
  ck('fixture sanity: the pair variance fits inside the team variance', restVar > 0);
  const sdRest = Math.sqrt(restVar);
  const rand = AS.mulberry32(99);
  let hi = 0;
  for (let s = 0; s < sims; s++) {
    const z1 = AS.gauss(rand, 0, 1);
    const z2 = rho * z1 + Math.sqrt(1 - rho * rho) * AS.gauss(rand, 0, 1);
    const mine = mean + sdRest * AS.gauss(rand, 0, 1) + sdA * z1 + sdB * z2;
    let oppMax = -Infinity;
    for (let t = 1; t < CV.TEAMS; t++) {
      const o = AS.gauss(rand, mean, sd);
      if (o > oppMax) oppMax = o;
    }
    if (mine > oppMax) hi++;
  }
  const pBiv = hi / sims;
  const pInf = CV.weeklyHighContest({ covIncrement: dv, sims, seed: 42 }).pHighOn;
  // independent seeds -> statistical agreement only: se ~ 0.0013 per arm.
  ck('explicit bivariate QB+WR construction matches the inflated-sd contest within MC noise',
    near(pBiv, pInf, 0.008), { pBiv, pInf });
}

// ── refusal arms ────────────────────────────────────────────────────────────
{
  let threw = false;
  try { CV.weeklyHighContest({ sims: 100 }); } catch (e) { threw = true; }
  ck('an ABSENT covIncrement refuses — a missing correlation is not a zero premium', threw);
  threw = false;
  try { CV.weeklyHighContest({ covIncrement: NaN, sims: 100 }); } catch (e) { threw = true; }
  ck('NaN covIncrement refuses too', threw);
}

// ── point equivalent: the mean bump that buys the same P(high) ──────────────
{
  const peZero = CV.pointEquivalent({ covIncrement: 0, sims: 8000, seed: 5 });
  ck('covIncrement 0 -> point equivalent ~0 (no premium to match)',
    near(peZero, 0, 0.05), peZero);
  const peSmall = CV.pointEquivalent({ covIncrement: 61.66, sims: 8000, seed: 5 });
  const peBig = CV.pointEquivalent({ covIncrement: 122.29, sims: 8000, seed: 5 });
  ck('point equivalent is positive for a positive premium', peSmall > 0, peSmall);
  ck('and monotone: a bigger covariance needs a bigger mean bump to match',
    peBig > peSmall, { peBig, peSmall });
  ck('scale sanity: the Burrow-Chase-size premium prices in single-digit weekly points',
    peBig > 0.5 && peBig < 10, peBig);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
