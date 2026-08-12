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
//
// RE-PINNED AGAIN 2026-08-11: 84.2% -> 78.3%, because THE SEAT MOVED, 4 -> 8.
//
// ATTRIBUTED BY MEASUREMENT, not assumed. Forcing my_draft_slot back to 4 on the
// same frozen pool returns 83.3% — inside the old band; at 8 it is 78.3%. The
// mean magnitude barely moves (17.8 -> 18.0), which is what a pure seat change
// should look like. So this is not a composite change and the band is NOT
// widened; the centre moves and the reason is on the record.
//
// AND A GAP THE FREEZE DOES NOT COVER, worth knowing before the next surprise:
// intervention_pool_v1 freezes the BOARD, which is what made this metric stable
// against daily rebuilds. It does not freeze the SEAT — `intervention_rate.js`
// reads `my_draft_slot` from the live artifact — so a seat change moves a number
// labelled "pinned on a frozen pool". The freeze is doing its job; its scope is
// just narrower than the label suggests.
// RE-PINNED AGAIN 2026-08-12: 78.3% -> 85.8%, magnitude 19.8 -> 15.0. The
// BENCH-BRANCH ANCHOR FIX (Cory's option 1). The pool is NOT re-frozen: the
// board did not change, the engine did, and re-freezing the pool would confound
// the two. Same call the seat-change re-pin made.
//
// THE TWO NUMBERS MOVED IN OPPOSITE DIRECTIONS, and that is the fix's signature
// rather than a puzzle. Before, the branch had no anchor and picked whoever
// shared an NFL team with my roster — a handful of ENORMOUS deviations (ADP 696,
// 982, 1111). Now it picks real bench players: it deviates from ADP order MORE
// OFTEN (85.8%) and by MUCH LESS when it does (15.0 against 19.8). A tool that
// reaches wildly a few times scores a lower rate and a higher magnitude than one
// that departs sensibly and often.
//
// ATTRIBUTED BY MEASUREMENT, not assumed: the baseline freeze moved on exactly
// ONE of its three canonical states — late-onesies-open — and left the early and
// mid states byte-identical. So the change is confined to the rounds where the
// bench branch fires, which is what the fix touched and nothing else.
// RE-PINNED AGAIN 2026-08-12 (second time today): 85.8% -> 93.3%, magnitude
// 15.0 -> 15.9. THE ONESIE HARD CAP (Cory's option 2), a SEPARATE change from
// the bench anchor above and re-pinned separately so the two are not conflated.
//
// AND THE SIGNATURE IS NOT THE SAME AS THE FIX ABOVE — I wrote that it was, from
// misreading the summary line: `93.3% · 11.2/draft · 15.9 picks` is rate,
// DEVIATIONS PER DRAFT, then magnitude. 11.2 is a count, not a distance.
//
// The honest reading: the cap makes the tool depart from ADP order MORE OFTEN
// (85.8% -> 93.3%) and by SLIGHTLY MORE when it does (15.0 -> 15.9). That is a
// different shape from the anchor fix, which departed more often and by far
// less, and it makes sense: sinking a third QB/TE below every startable player
// pushes the pick further down the ADP list rather than pulling it back toward
// the market. A roster-legality rule DEVIATES; it does not tidy.
//
// MEASURED ALONGSIDE: the roster-construction run over 120 rooms went from a
// modal QB3 RB1 WR3 TE3 to QB2 RB1 WR5 TE2 at 96.7%, with unfilled starting
// slots staying at 0/120. The rate moved because the SHAPE moved.
//
// The pool is NOT re-frozen, same reasoning as above: the board did not change,
// the engine did, and re-freezing would confound them.
check('intervention rate is pinned (frozen pool, shipped weights, seat 8)',
  Math.abs(r.rate - 0.933) < 0.05,
  'rate=' + (r.rate * 100).toFixed(1) + '% — this now measures the ENGINE on a FIXED '
    + 'board, so a move here is a real composite change. If intended, freeze a NEW '
    + 'pool version and re-pin; do not widen the band.');

check('mean deviation magnitude is pinned (frozen pool)',
  Math.abs(r.meanMagnitude - 15.9) < 3,
  'magnitude=' + r.meanMagnitude.toFixed(1));

// A SCOPE NOTE ADDED 2026-08-12, so "ceiling: dead" is not read as a global
// truth: ceiling is dead in the STARTER branch by arithmetic (its weight is 0),
// and it is NOT dead in the bench branch any more — CFG.BENCH_CEILING_FLOOR
// gives it 0.25 there regardless of the slider. This metric still reports it
// dead because on THIS frozen pool the perturbation does not reach a
// bench-branch decision. The label is accurate for the pool and narrower than
// it sounds, which is the same caveat the seat-freeze note makes.
//
// THE DEAD-WEIGHT FINDING, split into the two things it was conflating.
//
// Under the SHIPPED weights, tier/need/risk/ceiling/bye are weighted ZERO, so
// their being "dead" is arithmetic, not a discovery — asserting it as a finding
// would dress a definition up as evidence. The old assertion ("exactly bye and
// survival") was measured under DEFAULT_WEIGHTS, where those terms were at 1.0
// and deadness genuinely meant something.
const ZERO_WEIGHTED = Object.keys(E_MEASURED).filter(k => !E_MEASURED[k]).sort();
const deadSet = r.dead.slice().sort();
/* ── THE FLOORS ARE NAMED HERE RATHER THAN RATIONALISED IN A COMMENT ────────
 *
 * This assertion used to read "every zero-weighted term is dead" and pass, with
 * a comment above it acknowledging that BENCH_CEILING_FLOOR "gives it 0.25 there
 * regardless of the slider" and arguing the perturbation never reached a bench
 * decision on this pool. That argument was doing the work a check should do.
 *
 * It stopped being true on 2026-08-13 for a reason worth keeping: the published
 * components now report the term the BENCH BRANCH ACTUALLY USED rather than
 * `w.ceiling * ceiling`, so a floor-reinstated term is now visible as alive
 * instead of reading as zero. THE BEHAVIOUR DID NOT CHANGE — the reporting
 * stopped hiding it.
 *
 * So the honest statement is: a zero-weighted term is dead UNLESS A NAMED FLOOR
 * REINSTATES IT, and the floors are enumerated so that adding a third one to the
 * engine fails here rather than quietly widening the exception. */
const FLOOR_REINSTATED = { ceiling: 'CFG.BENCH_CEILING_FLOOR', risk: 'CFG.BENCH_RISK_FLOOR' };
const unexplainedAlive = ZERO_WEIGHTED
  .filter(t => deadSet.indexOf(t) === -1)
  .filter(t => !FLOOR_REINSTATED[t]);
check('every zero-weighted term is dead, EXCEPT the ones a named floor reinstates',
  unexplainedAlive.length === 0,
  'alive with no floor to explain it: ' + JSON.stringify(unexplainedAlive)
  + '  (zero-weighted=' + JSON.stringify(ZERO_WEIGHTED) + ' dead=' + JSON.stringify(deadSet) + ')');
/* And the converse, so the exception list cannot rot into a mute: a floor that
 * no longer reinstates anything is a floor that should be deleted, not carried. */
const inertFloors = Object.keys(FLOOR_REINSTATED)
  .filter(t => ZERO_WEIGHTED.indexOf(t) !== -1 && deadSet.indexOf(t) !== -1);
check('  and every declared floor is actually reinstating its term',
  inertFloors.length === 0,
  'declared as floor-reinstated but measured dead: ' + JSON.stringify(inertFloors)
  + ' — delete the exception or delete the floor');

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
