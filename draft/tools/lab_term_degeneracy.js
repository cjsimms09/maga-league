/* DID THE RISK TERM VARY AT ALL ON A BACKTEST BOARD?
 *
 * harness_divergence.py listed age, injury_status, depth_chart_order and
 * opportunity_z as LAB-BLIND, and games_missed_3yr as dead on both sides.
 * riskAdjustment (engine.js:672) has exactly five clauses and those are its five
 * inputs. If none of them is on the Lab board then the risk term is identically
 * zero for every player in every backtest ever run here, and
 * MEASURED_WEIGHTS.risk = 0 is not a measured setting — it is a setting measured
 * on a term that could not move.
 *
 * THIS DOES NOT REASON ABOUT IT. It rebuilds the production board the way
 * build_bundle.py builds one — the same twelve literal fields, nothing else —
 * runs recommend() on both, and reads the published `risk` component.
 *
 * A DEGENERATE TERM AND A ZERO-WEIGHTED TERM LOOK IDENTICAL IN A RESULT TABLE.
 * That is the whole reason this has gone unnoticed: every experiment reported
 * "risk contributes nothing", which was true, and read as a finding about
 * football when it was a finding about the fixture.
 *
 * Run: node draft/tools/lab_risk_degeneracy.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;

/* build_bundle.py:127-134 — the ONLY player keys a bundle board carries, plus
 * the eight vorp.apply_vorp/assign_tiers adds. Anything else the engine reads is
 * simply not there. */
const BUNDLE_KEYS = ['player_id', 'name', 'position', 'team', 'bye', 'proj_mean',
  'proj_sd', 'proj_ceiling', 'raw_adp', 'adjusted_adp', 'adp_sd', 'adp_source',
  'overall_rank', 'pos_rank', 'replacement', 'tier', 'tier_rank', 'tier_size',
  'tier_drop', 'vorp', 'score'];

function asBundlePlayer(p) {
  const q = {};
  BUNDLE_KEYS.forEach(k => { if (p[k] !== undefined) q[k] = p[k]; });
  q.proj_sd = Math.round((p.proj_mean || 0) * 0.25 * 100) / 100;      // build_bundle.py:131
  q.proj_ceiling = Math.round((p.proj_mean || 0) * 1.35 * 100) / 100; // build_bundle.py:132
  q.adp_sd = null;                                                    // build_bundle.py:133
  return q;
}

const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const prodBoard = pool.slice(0, 400);
const labBoard = prodBoard.map(asBundlePlayer);

/* THE FIRST VERSION OF THIS PROBE SCORED ONE STATE — pick 30, empty roster — AND
 * FOUR OF THE EIGHT TERMS READ [0,0] ON BOTH BOARDS. Not because the fixture
 * strips them: because ceiling is gated off until CEILING_LATE_FROM of the
 * draft, and keeper/stack/bye are all functions of a roster that was empty. A
 * probe whose control arm is flat cannot say anything about the test arm, and it
 * would have reported "1 degenerate term" while being blind to three others.
 *
 * So: Cory's real keepers on the roster, and four states spanning the draft. A
 * term counts as moving if it moves in ANY of them. */
const roster = require(path.join(__dirname, 'keepers_of.js')).keepersFrom(DATA);

const STATES = [
  { currentPick: 30, nextPick: 45, myPicksLeft: 12, roundsLeft: 12 },
  { currentPick: 70, nextPick: 85, myPicksLeft: 8, roundsLeft: 8 },
  { currentPick: 110, nextPick: 125, myPicksLeft: 4, roundsLeft: 4 },
  { currentPick: 145, nextPick: 147, myPicksLeft: 1, roundsLeft: 1 },
];
const ctx = (b, st) => Object.assign({
  board: b, roster: roster, league: L, totalPicks: 147,
  runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS,
}, st);

/* Every published component that MEASURED_WEIGHTS carries a weight for. The
 * question for each is the same: could it move on the board the experiment ran
 * on? A term with one distinct value contributes no variance at ANY weight. */
const TERMS = ['vona', 'tier_urgency', 'need', 'risk', 'ceiling', 'keeper', 'bye', 'stack'];
const WEIGHT_OF = { vona: 'value', tier_urgency: 'tier', need: 'need', risk: 'risk',
  ceiling: 'ceiling', keeper: 'keeper', bye: 'bye', stack: 'stack' };

function spread(board) {
  const acc = {};
  TERMS.forEach(t => { acc[t] = []; });
  STATES.forEach(st => {
    const recs = E.recommend(ctx(board, st));
    TERMS.forEach(t => {
      recs.forEach(r => {
        const v = Number(r.components && r.components[t]);
        if (isFinite(v)) acc[t].push(v);
      });
    });
  });
  const out = {};
  TERMS.forEach(t => {
    const vals = acc[t];
    out[t] = {
      n: vals.length,
      distinct: new Set(vals.map(v => Math.round(v * 1e6))).size,
      nonzero: vals.filter(v => Math.abs(v) > 1e-9).length,
      lo: vals.length ? Math.min.apply(null, vals) : NaN,
      hi: vals.length ? Math.max.apply(null, vals) : NaN,
    };
  });
  return out;
}

console.log('TERM DEGENERACY ON THE LAB BOARD\n');
console.log('  Same 400 players, scored twice: once with every production field, once');
console.log('  carrying only the fields build_bundle.py puts on a bundle board.');
console.log('  A term with ONE distinct value cannot have influenced any backtest');
console.log('  result at any weight — and in a result table that is indistinguishable');
console.log('  from a term that was measured and found worthless.\n');

const prod = spread(prodBoard);
const lab = spread(labBoard);

console.log('  term            weight   production          harness board');
console.log('  ' + '-'.repeat(72));
const dead = [];
TERMS.forEach(t => {
  const p = prod[t], l = lab[t];
  const degenerate = l.distinct <= 1 && p.distinct > 1;
  if (degenerate) dead.push(t);
  console.log('  ' + (degenerate ? '***' : '   ') + ' ' + t.padEnd(13)
    + String(E.MEASURED_WEIGHTS[WEIGHT_OF[t]]).padEnd(8)
    + (p.distinct + ' vals [' + p.lo.toFixed(1) + ',' + p.hi.toFixed(1) + ']').padEnd(20)
    + (l.distinct + ' vals [' + l.lo.toFixed(1) + ',' + l.hi.toFixed(1) + ']')
    + (degenerate ? '   DEGENERATE' : ''));
});

console.log('\n  VERDICT');
if (!dead.length) {
  console.log('    No term collapses on a harness board. The premise is wrong and any');
  console.log('    finding resting on it should be withdrawn.');
} else {
  console.log('    ' + dead.length + ' term(s) are DEGENERATE on a backtest board: ' + dead.join(', '));
  dead.forEach(t => {
    const w = WEIGHT_OF[t];
    console.log('      · MEASURED_WEIGHTS.' + w + ' = ' + E.MEASURED_WEIGHTS[w]
      + ' was set on a term that could not move.');
  });
  console.log('    Those settings are UNMEASURED, not measured. They are not necessarily');
  console.log('    WRONG — a zero may still be the right number — but the evidence');
  console.log('    recorded for them is evidence of a fixture, not of football, and the');
  console.log('    comment beside them must say so rather than cite an interval.');
}

/* WHAT THIS INSTRUMENT CANNOT SEE, stated so a clean row is not over-read.
 * DEGENERACY (one distinct value) is the strongest form of "could not be
 * measured", not the only one. A term that varies plentifully but is a fixed
 * MONOTONE FUNCTION of another term is equally unmeasurable — raising one weight
 * is arithmetically the same as raising the other — and it shows up here as
 * hundreds of distinct values, i.e. as a pass. `ceiling` is exactly that case:
 * build_bundle.py writes proj_ceiling = 1.35 * proj_mean, so the ceiling spread
 * is 0.35 * proj_mean and rank-identical to vona's input. See
 * lab_ceiling_degeneracy.js, which measures the rank correlation this probe is
 * blind to. A CLEAN ROW HERE MEANS "NOT DEGENERATE", NOT "WAS MEASURABLE". */
console.log('\n  NOT COVERED HERE: collinearity. A term that is a fixed monotone function');
console.log('  of another varies freely and still cannot be measured separately.');
console.log('  ceiling passes this probe and fails that one — see lab_ceiling_degeneracy.js.');

/* CONTROL — if every term were degenerate on BOTH boards the probe would be
 * measuring recommend() failing, not the fixture. */
const prodMoving = TERMS.filter(t => prod[t].distinct > 1);
console.log('\n  CONTROL: terms that DO vary on the production board: ' + prodMoving.length
  + ' of ' + TERMS.length + (prodMoving.length ? ' — OK' : ' *** PROBE IS VACUOUS'));
console.log('           (' + prodMoving.join(', ') + ')');

process.exit(dead.length ? 1 : 0);
