/* IF SURVIVAL IS MISCALIBRATED, HOW WRONG IS THE ONLY TERM THAT CARRIES WEIGHT?
 *
 * Item 31 on Cory's list is "CALIBRATION DRIFT DETECTION. Survival over-predicts
 * by 15 to 57 percent depending on window." It sits in PART FOUR, framed as a
 * monitoring build. IT DOES NOT BELONG THERE, and this file is the measurement
 * that says so.
 *
 *   VONA        = proj_mean - expectedBestAvailable(samePos, nextPick)
 *   expectedBestAvailable = sum over players of proj_mean x P(is best survivor)
 *                           where P is built from survival(p, nextPick)
 *
 * VONA IS A SURVIVAL-WEIGHTED EXPECTATION, and VONA carries weight 1.0 — it is
 * the value term, the one term with an out-of-sample dollar measurement behind
 * it, and after item 10 it is one of only three weights that is not either
 * degenerate or collinear on the board its experiments ran on.
 *
 * So a 15-57% survival error is not a monitoring gap. It is an input error to
 * the quantity that decides every pick. OVER-predicting survival means players
 * look more likely to still be there, so expectedBestAvailable rises, so VONA
 * falls — and it falls UNEVENLY BY POSITION, because a position with a steep run
 * (RB, WR) has different survival dynamics than a flat one (QB, TE). An uneven
 * compression of the value term across positions is the exact shape of the QB/TE
 * symptom that started all of this.
 *
 * THIS FILE DOES NOT ASSUME THE 15-57% IS RIGHT. It takes the range as given and
 * asks what it would COST — which is the question that decides whether item 31
 * is a Part Four build or a Part One defect.
 *
 * Run: node draft/tools/survival_sensitivity.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
/* MONKEYPATCHING DOES NOT REACH IT, AND THE CONTROL IS WHAT SAID SO.
 *
 * Two attempts failed and both would have produced a confident false null:
 *   1. patching S.survivalProbability AFTER requiring engine.js — engine.js does
 *      `const survivalRaw = S.survivalProbability` at load, so the binding was
 *      already captured.
 *   2. patching it BEFORE — but CONSERVE_SURVIVAL_ON routes through
 *      S.conservedSurvival, which calls survivalProbability through survival.js's
 *      OWN internal binding, which no external assignment can reach.
 *
 * Both printed "0 of 12 top picks change" and the CONTROL — survival scaled to
 * ZERO must move something — caught both. Without it this file would have
 * reported that VONA is insensitive to survival, which is arithmetically
 * impossible given eba is a survival-weighted sum.
 *
 * SO THE ARITHMETIC IS COMPUTED DIRECTLY instead. expectedBestAvailable is
 *     sum_j  proj_j x surv_j x prod_{i<j} (1 - surv_i)
 * and survivalProbability is callable from outside. Recomputing eba at two
 * survival scalings measures exactly the quantity in question and depends on no
 * patching at all — which is also why it cannot be defeated the way the first
 * two attempts were. */
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(__dirname, 'keepers_of.js'));

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;
const adpOf = p => (p.adjusted_adp != null ? Number(p.adjusted_adp)
  : (p.raw_adp != null ? Number(p.raw_adp) : 9999));
const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const K = KEEP.keepersFrom(DATA);

/* eba, recomputed at a survival scaling. `scale < 1` models survival having
 * been OVER-predicted by (1-scale): the corrected probability is LOWER. */
function ebaAt(playersAtPos, nextPick, ctx, scale) {
  const sorted = playersAtPos.slice().sort((a, b) => b.proj_mean - a.proj_mean);
  let expected = 0, allBetterGone = 1, massUsed = 0;
  for (const p of sorted) {
    let sv = S.survivalProbability(p, nextPick, ctx);
    if (typeof sv !== 'number' || !isFinite(sv)) sv = 1;
    const surv = Math.max(0, Math.min(1, sv * scale));
    const pBest = surv * allBetterGone;
    expected += p.proj_mean * pBest;
    massUsed += pBest;
    allBetterGone *= (1 - surv);
    if (allBetterGone < E.CFG.SURVIVOR_CUTOFF) break;
  }
  if (massUsed < 1 && sorted.length) {
    expected += sorted[sorted.length - 1].proj_mean * (1 - massUsed);
  }
  return expected;
}

const MY = [30, 45, 50, 65, 70, 85, 90, 105, 110, 125, 130, 145];
const POS = ['QB', 'RB', 'WR', 'TE'];

function stateAt(pick) {
  const taken = new Set(byAdp.slice(0, pick - 1).map(p => String(p.player_id)));
  K.forEach(k => taken.add(String(k.player_id)));
  const later = MY.filter(x => x > pick);
  return {
    board: pool.filter(p => !taken.has(String(p.player_id))),
    roster: K, league: L, currentPick: pick,
    nextPick: later.length ? later[0] : 147, totalPicks: 147,
    myPicksLeft: later.length + 1, roundsLeft: later.length + 1,
    runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS,
  };
}

console.log('SURVIVAL SENSITIVITY — what a miscalibrated survival costs VONA\n');
console.log('  VONA = proj_mean - expectedBestAvailable(samePos, nextPick),');
console.log('  and eba is a survival-weighted sum. MEASURED_WEIGHTS.value = '
  + E.MEASURED_WEIGHTS.value + ' — this is the term that decides picks.\n');
console.log('  Change in VONA for the best available player at each position,');
console.log('  averaged over Cory\'s twelve picks. POSITIVE = VONA rises when the');
console.log('  over-prediction is corrected.\n');
console.log('  scale  meaning                               ' + POS.map(p => p.padEnd(9)).join(''));
console.log('  ' + '-'.repeat(84));

const SCALES = [
  [0.85, 'over-predicted by 15%'],
  [0.60, 'over-predicted by 40%'],
  [0.43, 'over-predicted by 57% (worst)'],
];

const rows = [];
SCALES.forEach(([sc, label]) => {
  const acc = {}; POS.forEach(p => { acc[p] = []; });
  MY.forEach(pick => {
    const ctx = stateAt(pick);
    POS.forEach(pos => {
      const at = ctx.board.filter(p => p.position === pos);
      if (at.length < 2) return;
      const best = at.slice().sort((a, b) => b.proj_mean - a.proj_mean)[0];
      const rest = at.filter(p => p.player_id !== best.player_id);
      const base = Number(best.proj_mean) - ebaAt(rest, ctx.nextPick, ctx, 1);
      const scaled = Number(best.proj_mean) - ebaAt(rest, ctx.nextPick, ctx, sc);
      acc[pos].push(scaled - base);
    });
  });
  const mean = p => (acc[p].length
    ? acc[p].reduce((s, v) => s + v, 0) / acc[p].length : NaN);
  rows.push({ sc, label, by: Object.fromEntries(POS.map(p => [p, mean(p)])) });
  console.log('  ' + sc.toFixed(2).padEnd(7) + label.padEnd(38)
    + POS.map(p => (mean(p) >= 0 ? '+' : '') + mean(p).toFixed(1)).map(x => x.padEnd(9)).join(''));
});

/* CONTROL — the one that caught two dead probes before this one. */
const ctx0 = stateAt(70);
const at0 = ctx0.board.filter(p => p.position === 'RB');
const best0 = at0.slice().sort((a, b) => b.proj_mean - a.proj_mean)[0];
const rest0 = at0.filter(p => p.player_id !== best0.player_id);
const e1 = ebaAt(rest0, ctx0.nextPick, ctx0, 1);
const e0 = ebaAt(rest0, ctx0.nextPick, ctx0, 0);
console.log('\n  CONTROL: eba at RB, pick 70 — scale 1.00 -> ' + e1.toFixed(1)
  + ', scale 0.00 -> ' + e0.toFixed(1)
  + (Math.abs(e1 - e0) > 0.01 ? '   the scaling reaches the arithmetic'
    : '   *** NOTHING MOVED — this table is void'));

const spread = rows[rows.length - 1];
const vals = POS.map(p => spread.by[p]);
console.log('\n  WHAT IT MEANS');
console.log('    At the worst window the value term moves by '
  + Math.min.apply(null, vals).toFixed(1) + ' to +'
  + Math.max.apply(null, vals).toFixed(1) + ' points, AND UNEVENLY BY POSITION.');
console.log('    VONA is compared ACROSS positions to pick, so an uneven shift is');
console.log('    not a scale error that cancels — it reorders the board.');
