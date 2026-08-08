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

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

// Quiet the report's console output; we want the numbers, not the banner.
const realLog = console.log;
console.log = () => {};
const r = IR.report(10);
console.log = realLog;

check('the simulation actually produced decisions (non-vacuity)',
  r.picks >= 100, 'picks=' + r.picks);

check('the metric is deterministic across runs (seeded, not drifting)',
  (() => { console.log = () => {}; const b = IR.report(10); console.log = realLog;
           return b.rate === r.rate && b.perDraftMean === r.perDraftMean; })(),
  'two runs disagreed — the metric is not reproducible');

// PINNED. If the composite changes, this moves and somebody has to look.
check('intervention rate is pinned near its 2026-08-08 measurement (73.7%)',
  Math.abs(r.rate - 0.737) < 0.12,
  'rate=' + (r.rate * 100).toFixed(1) + '% — if this was intended, update the pin '
    + 'AND the number quoted in intervention_rate.js and the report');

check('mean deviation magnitude is pinned near 17.1 picks',
  Math.abs(r.meanMagnitude - 17.1) < 6,
  'magnitude=' + r.meanMagnitude.toFixed(1));

// THE DEAD-WEIGHT FINDING, asserted so it cannot quietly resolve or worsen.
check('the known dead-weight terms are still exactly bye and survival',
  r.dead.slice().sort().join(',') === 'bye,survival',
  'dead=' + JSON.stringify(r.dead) + ' — if a term started or stopped firing, '
    + 'that is a real change and needs a look');

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
