/* THE INTERVENTION RATE, pinned so it cannot drift silently.
 *
 * This is a CHARACTERIZATION test, not a target. It records what the model
 * actually does today and fails when that changes materially — so a change to
 * the composite has to be a decision somebody made, not a side effect nobody
 * noticed. It deliberately does NOT assert the pre-registered prior, because
 * the measurement currently misses it by a wide margin and a test that fails
 * for a known, reported reason trains people to ignore red.
 *
 * Measured 2026-08-08 over 25 seeded drafts: 73.7% of picks deviate beyond the
 * noise band, 8.8 per draft, mean magnitude 17.1 picks, 100% LEAN evidence,
 * 212 of 221 deviations are REACHES. Cory's pre-registered prior was ~2 per
 * draft. The gap is the finding, and it is the empirical case for the anchor
 * doctrine rather than an argument against measuring it.
 *
 * Run: node draft/tests/intervention-rate.test.js
 */
'use strict';
const IR = require('../tools/intervention_rate.js');

const E_MEASURED = require(require('path').join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js')).MEASURED_WEIGHTS;

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

// Quiet the report's console output; we want the numbers, not the banner.
const realLog = console.log;
console.log = () => {};
// FROZEN POOL + THE WEIGHTS THE TOOL SHIPS. Both were wrong, independently
// (B's audit, 2026-08-10):
//
//  1. The harness ran E.DEFAULT_WEIGHTS — tier, need, risk and bye at 1.0, the
//     terms measured as DRAG — while the tool loads MEASURED_WEIGHTS with those
//     at zero. So "the tool deviates from the market on X% of picks" described a
//     configuration nobody runs, and it was cited as a headline finding.
//
//  2. It pinned a raw number against the LIVE board, which is rebuilt daily. B
//     showed the rate is data-driven not weight-driven: every weight config lands
//     91-93% today against a 73.7% pin, because the board changed (the DEF-bye
//     fix alone moved bye coverage 201 -> 773 players). A guard that cries wolf
//     every morning is a guard that gets switched off.
//
// And freezing exposed a THIRD fault neither of us could see through the noise:
// mean deviation magnitude reads 377.5 picks on the live board — impossible in a
// 150-pick draft. The live pool carries ~1,400 players with sentinel ADP (the 913
// values), and deviation-from-market computed against a sentinel is nonsense. The
// frozen top-300 gives 19.8, which is a real number.
//
// The pool is IMMUTABLE. A new board means a new version, never an edit, or this
// silently goes back to measuring the board instead of the engine.
const FROZEN = JSON.parse(require('fs').readFileSync(
  require('path').join(__dirname, '..', 'baseline', 'intervention_pool_v1.json'), 'utf8'));
const r = IR.report(10, { pool: FROZEN.pool });
console.log = realLog;

check('the simulation actually produced decisions (non-vacuity)',
  r.picks >= 100, 'picks=' + r.picks);

check('the metric is deterministic across runs (seeded, not drifting)',
  (() => { console.log = () => {}; const b = IR.report(10, { pool: FROZEN.pool }); console.log = realLog;
           return b.rate === r.rate && b.perDraftMean === r.perDraftMean; })(),
  'two runs disagreed — the metric is not reproducible');

// PINNED. If the composite changes, this moves and somebody has to look.
// RE-PINNED 2026-08-10 on the frozen pool under the SHIPPED weights. The old pins
// (73.7% / 17.1) measured DEFAULT_WEIGHTS against a board that no longer exists,
// so they are not comparable and carrying them forward would be false continuity.
check('intervention rate is pinned (frozen pool, shipped weights)',
  Math.abs(r.rate - 0.842) < 0.05,
  'rate=' + (r.rate * 100).toFixed(1) + '% — this now measures the ENGINE on a FIXED '
    + 'board, so a move here is a real composite change. If intended, freeze a NEW '
    + 'pool version and re-pin; do not widen the band.');

check('mean deviation magnitude is pinned (frozen pool)',
  Math.abs(r.meanMagnitude - 19.8) < 3,
  'magnitude=' + r.meanMagnitude.toFixed(1));

// THE DEAD-WEIGHT FINDING, split into the two things it was conflating.
//
// Under the SHIPPED weights, tier/need/risk/ceiling/bye are weighted ZERO, so
// their being "dead" is arithmetic, not a discovery — asserting it as a finding
// would dress a definition up as evidence. The old assertion ("exactly bye and
// survival") was measured under DEFAULT_WEIGHTS, where those terms were at 1.0
// and deadness genuinely meant something.
const ZERO_WEIGHTED = Object.keys(E_MEASURED).filter(k => !E_MEASURED[k]).sort();
const deadSet = r.dead.slice().sort();
check('every zero-weighted term is dead (arithmetic, stated so it is not read as a finding)',
  ZERO_WEIGHTED.every(t => deadSet.indexOf(t) !== -1),
  'zero-weighted=' + JSON.stringify(ZERO_WEIGHTED) + ' dead=' + JSON.stringify(deadSet));

// THIS is the real one: survival carries no weight of its own — it lives inside
// VONA, which ships at 1.0 — so it is ACTIVE and still not differentiating any
// pick. That is a finding about the survival model, and it must not quietly
// resolve or worsen.
check('survival is dead DESPITE being active — the finding worth pinning',
  deadSet.indexOf('survival') !== -1,
  'dead=' + JSON.stringify(deadSet) + ' — if survival started differentiating picks '
    + 'that is a REAL change (the conservation fix and the room mixture both touch it) '
    + 'and it needs a look, not a re-pin');

// And nothing UNEXPECTED is dead: anything dead that is neither zero-weighted nor
// survival is a term that stopped firing without anyone deciding it should.
const unexpected = deadSet.filter(t => t !== 'survival' && ZERO_WEIGHTED.indexOf(t) === -1);
check('no term is dead unexpectedly', unexpected.length === 0,
  'unexpectedly dead: ' + JSON.stringify(unexpected));

// The honest-bar guard: this must never silently become "fine".
check('the rate has NOT quietly drifted below the prior without anyone noticing',
  r.perDraftMean > 0.5,
  'per-draft mean collapsed to ' + r.perDraftMean.toFixed(2)
    + ' — that would make this a consensus board, which is a product decision, '
    + 'not a refactor side effect');

console.log('\n  measured: ' + (r.rate * 100).toFixed(1) + '% · '
  + r.perDraftMean.toFixed(1) + '/draft · ' + r.meanMagnitude.toFixed(1) + ' picks · dead: '
  + (r.dead.join(',') || 'none'));
console.log(`\n${pass}/${pass + fail} intervention-rate checks passed`);
process.exit(fail ? 1 : 0);
