/* WHAT THE LAB WAS ACTUALLY MEASURING WHEN IT MEASURED THE CEILING WEIGHT.
 *
 * harness_divergence.py flagged proj_ceiling as SYNTHETIC: build_bundle.py
 * writes `round((pm or 0.0) * 1.35, 2)`, so on every backtest board
 *
 *     proj_ceiling = 1.35 * proj_mean            exactly, for every player
 *
 * and engine.js:810 derives the ceiling term from
 *
 *     rawSpread = (player.proj_ceiling || player.proj_mean) - player.proj_mean
 *
 * which on that board is 0.35 * proj_mean — A FIXED MULTIPLE OF THE VALUE TERM.
 * If that is right, then no experiment run on a bundle could ever have separated
 * the ceiling weight from the value weight: raising one is arithmetically
 * indistinguishable from raising the other, and the "ceiling effect" measurement
 * that came back -4.8 with a [-26,+17] interval was not a weak signal. It was a
 * collinear one. THE MEASUREMENT COULD NOT HAVE COME OUT ANY OTHER WAY.
 *
 * That measurement is why MEASURED_WEIGHTS.ceiling is 0.
 *
 * THIS FILE DOES NOT ARGUE IT, IT MEASURES IT. Spearman rank correlation between
 * the ceiling spread and proj_mean, on the production board and on a board
 * rebuilt the way the harness builds one. A synthetic board must give exactly
 * 1.0; the production board must not, or the whole concern is empty.
 *
 * Run: node draft/tools/lab_ceiling_degeneracy.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
/* HISTORICAL, NOT CURRENT — corrected 2026-08-17. This was `build_bundle.py:132,
 * verbatim` until that day, when the harness stopped manufacturing dispersion: a
 * bundle now carries the measured p90/p10/sd per (position, band), fitted
 * leave-one-season-out, verified end to end in CI run 32002876691 (706 of 841
 * players attached on 2023, 135 correctly refused off unmeasured cells).
 *
 * The arm is KEPT, because it is the counterfactual that gives this lab its
 * point: it shows what every weight experiment before 08-17 was actually run
 * against. It is no longer a description of the harness. */
const HARNESS_CEILING_RATIO = 1.35;

function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {                 // average ranks over ties
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

function spearman(a, b) {
  const ra = ranks(a), rb = ranks(b), n = a.length;
  const ma = ra.reduce((s, v) => s + v, 0) / n, mb = rb.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = ra[i] - ma, y = rb[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return num / Math.sqrt(da * db);
}

/* The population an experiment actually ranks over: players with a projection.
 * Including the 1,181 zero-projection bodies would put a huge tie block into
 * both series and inflate every correlation toward 1 — a control that makes the
 * finding look stronger than it is, which is the wrong direction to be sloppy in. */
const pool = DATA.players.filter(p => Number(p.proj_mean) > 0 && p.proj_ceiling != null);
const mean = pool.map(p => Number(p.proj_mean));
const prodSpread = pool.map(p => Number(p.proj_ceiling) - Number(p.proj_mean));
const labSpread = pool.map(p => Number(p.proj_mean) * HARNESS_CEILING_RATIO - Number(p.proj_mean));

const rProd = spearman(prodSpread, mean);
const rLab = spearman(labSpread, mean);

console.log('CEILING DEGENERACY ON THE LAB BOARD\n');
console.log('  population: ' + pool.length + ' players with a non-zero projection');
console.log('  ceiling term = (proj_ceiling || proj_mean) - proj_mean      [engine.js:810]\n');
console.log('  Spearman(ceiling spread, proj_mean)');
console.log('    production board (real per-player ceilings)   ' + rProd.toFixed(4));
console.log('    PRE-08-17 harness (proj_ceiling = 1.35*mean)  ' + rLab.toFixed(4));

const distinctProd = new Set(pool.map(p => Math.round(
  (Number(p.proj_ceiling) / Number(p.proj_mean)) * 1e6))).size;
console.log('\n  distinct ceiling/mean ratios: production ' + distinctProd + ', harness 1');

/* A CONCRETE ORDERING NUMBER, because a correlation of 0.98 does not tell a
 * reader whether that matters. How many of the top 100 by ceiling spread are NOT
 * in the top 100 by proj_mean? On the harness board this must be zero. */
function top100(vals) {
  return new Set(vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0])
    .slice(0, 100).map(x => x[1]));
}
const tMean = top100(mean);
const swapProd = Array.from(top100(prodSpread)).filter(i => !tMean.has(i)).length;
const swapLab = Array.from(top100(labSpread)).filter(i => !tMean.has(i)).length;
console.log('  top-100 by ceiling spread that are NOT top-100 by proj_mean:');
console.log('    production ' + swapProd + ' of 100     harness ' + swapLab + ' of 100');

const degenerate = Math.abs(rLab - 1) < 1e-9;

console.log('\n  VERDICT');
if (!degenerate) {
  console.log('    Harness ceiling is NOT rank-identical to proj_mean — the premise of');
  console.log('    this probe is wrong and the finding should be withdrawn.');
} else {
  console.log('    HARNESS: rho = 1.0000 exactly, ' + swapLab + ' of 100 reordered. The ceiling');
  console.log('    term carries ZERO information beyond proj_mean, by construction. No');
  console.log('    experiment run on a bundle could separate the ceiling weight from the');
  console.log('    value weight — raising one is arithmetically the same as raising the');
  console.log('    other. THE -4.8 [-26,+17] RESULT WAS COLLINEAR, NOT WEAK. It is not');
  console.log('    evidence that ceiling is worthless; it is not evidence of anything.');
  console.log('');
  console.log('    PRODUCTION: rho = ' + rProd.toFixed(4) + ', ' + swapProd + ' of 100 reordered. NOT the same');
  console.log('    thing as informative. 0.98 is high — the term\'s independent content');
  console.log('    is small, just not zero. SO THE HONEST POSITION IS THAT WE DO NOT KNOW');
  console.log('    WHAT THE CEILING WEIGHT IS WORTH. The measurement that set it to zero');
  console.log('    was incapable of measuring it, and nothing here replaces that');
  console.log('    measurement. MEASURED_WEIGHTS.ceiling = 0 WAS to stay until a');
  console.log('    real-ceiling board re-ran the experiment; it is an UNMEASURED');
  console.log('    setting rather than a measured one, and is labelled that way.');
  console.log('');
  console.log('    *** THAT CONDITION IS NOW MET (2026-08-17). build_bundle.py no');
  console.log('    longer manufactures the ceiling: a bundle carries the measured');
  console.log('    p90/p10/sd per (position, band), leave-one-season-out, verified');
  console.log('    end to end in CI. The re-derivation is RUNNABLE for the first');
  console.log('    time and has NOT been run, so the zero is UN-RE-DERIVED rather');
  console.log('    than refuted. Prereg: draft/backtest/HARNESS-DISPERSION-PREREG.md.');
  console.log('    AND IT WILL NOT SETTLE THE QUESTION ALONE: the measured ceiling');
  console.log('    is still proj_mean x a per-CELL constant, so a weight fitted on');
  console.log('    it measures CROSS-BAND dispersion only. A per-PLAYER ceiling');
  console.log('    needs weekly_volatility.py wired in — see');
  console.log('    draft/backtest/VOLATILITY-WIRING-PREREG.md.');
}

/* CONTROL. If spearman() returned 1.0 for any pair of series this would all be
 * vacuous, so give it one it must not score 1 on. */
const control = spearman(mean.map((v, i) => (i % 7) * 1.0 + v * 0), mean);
console.log('\n  CONTROL: spearman(uninformative sawtooth, proj_mean) = ' + control.toFixed(4)
  + (Math.abs(control) < 0.2 ? '  (near zero as it must be)' : '  *** THE ESTIMATOR IS BROKEN'));

process.exit(degenerate ? 1 : 0);
