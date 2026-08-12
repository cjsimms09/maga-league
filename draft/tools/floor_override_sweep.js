/* ITEM 9, SUB-CLASS ONE: A FLOOR THAT OVERRIDES A CONFIGURED VALUE.
 *
 * The class Cory named — "the system describing itself incorrectly" — has one
 * sub-class that is fully mechanical and has already produced THREE findings:
 * a constant is set to a value (often ZERO, often because a measurement said
 * so), and a `Math.max(FLOOR, thatValue)` elsewhere silently reinstates it.
 *
 *   BENCH_CEILING_FLOOR 0.25 over MEASURED_WEIGHTS.ceiling = 0  (measured -4.8,
 *     [-26,+17], unsignable) — ranked the whole back half of every draft
 *   BENCH_RISK_FLOOR    0.25 over MEASURED_WEIGHTS.risk = 0
 *   PATHS_BAND          12.0 over its own stated COIN_FLIP_GAP*4 = 4.0
 *
 * The weight vector is the system's description of what it believes; a floor is
 * the behaviour. Where they disagree, the description loses silently.
 *
 * This enumerates every floor-over-configured-value site and reports whether the
 * floor CAN bind — i.e. whether it exceeds the configured value at the shipped
 * settings. A floor that cannot bind is inert and honest; one that can is the
 * defect class.
 *
 * Run: node draft/tools/floor_override_sweep.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
['survival', 'composite', 'engine'].forEach(m =>
  require(path.join(ROOT, 'public', 'js', 'draft', m + '.js')));
const E = global.DraftEngine;
const CFG = E.CFG, W = E.MEASURED_WEIGHTS;

/* Each site: the floor constant, the value it floors, and how to read that
 * value at the SHIPPED settings. Enumerated from a grep of
 * `Math.max(CFG.*` across the draft modules — the list is manual because the
 * second argument is an expression, not a name a scan can resolve. */
const SITES = [
  { file: 'engine.js:1113', floor: 'VALUE_WEIGHT_FLOOR', floors: 'MEASURED_WEIGHTS.value',
    floorVal: CFG.VALUE_WEIGHT_FLOOR, configured: W.value },
  { file: 'engine.js:1140', floor: 'BENCH_CEILING_FLOOR', floors: 'MEASURED_WEIGHTS.ceiling',
    floorVal: CFG.BENCH_CEILING_FLOOR, configured: W.ceiling },
  { file: 'engine.js:1141', floor: 'BENCH_RISK_FLOOR', floors: 'MEASURED_WEIGHTS.risk',
    floorVal: CFG.BENCH_RISK_FLOOR, configured: W.risk },
  { file: 'survival.js:129', floor: 'ADP_SD_FLOOR', floors: 'ADP_SD_RATE * adpMean',
    floorVal: CFG.ADP_SD_FLOOR, configured: null,
    note: 'floors a DERIVED spread, not a configured weight — binding is the design' },
  { file: 'survival.js:1006', floor: 'RUN_MIN/RUN_MAX', floors: 'the observed run multiplier',
    floorVal: CFG.RUN_MIN, configured: null,
    note: 'a declared clamp on an observed rate, stated as a clamp' },
];

let binding = 0, inert = 0, byDesign = 0;
console.log('FLOOR-OVER-CONFIGURED-VALUE SWEEP\n');
console.log('  site                  floor                 floors                      verdict');
SITES.forEach(s => {
  let verdict;
  if (s.configured == null) { verdict = 'BY DESIGN — ' + s.note; byDesign++; }
  else if (Number(s.floorVal) > Number(s.configured)) {
    verdict = 'BINDING — overrides ' + s.configured + ' with ' + s.floorVal;
    binding++;
  } else { verdict = 'inert at shipped settings (' + s.configured + ' >= ' + s.floorVal + ')'; inert++; }
  console.log('  ' + s.file.padEnd(22) + s.floor.padEnd(22) + s.floors.padEnd(28) + verdict);
});

console.log('\n  COUNT: ' + SITES.length + ' floor sites — ' + binding + ' BINDING, '
  + inert + ' inert, ' + byDesign + ' clamps on derived/observed values (not this class).');
if (binding) {
  console.log('\n  A BINDING FLOOR IS NOT AUTOMATICALLY A DEFECT. It is a defect when the');
  console.log('  value it overrides was set deliberately — by a measurement, a ruling, or a');
  console.log('  slider — because then the system is doing the opposite of what it says.');
  console.log('  Each binding site below needs that judgement recorded, not just the number.');
}
process.exit(0);
