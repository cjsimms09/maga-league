/* MEASURE THE CRUDE STAGE 2 CAP — cap-off vs cap-on, same engine.
 *
 * Isolates the cap's effect by toggling CFG.STAGE2_CAP between two runs of the
 * SAME deterministic simulation (not a diff against the old baseline, which would
 * conflate the cap with unrelated engine additions this session). Reports:
 *   - how many of the recommendations changed IDENTITY (the pre-registered #1),
 *   - the new deviation rate vs the un-capped rate,
 *   - WHICH decisions changed (pick, from -> to, and the lead driver that lost).
 *
 * Run: node draft/tools/stage2_cap_measure.js [drafts]
 */
'use strict';
const path = require('path');
const E = require('../../public/js/draft/engine.js');
const D = require('../../public/js/draft/deviation.js');
const IR = require('./intervention_rate.js');

const N = Number(process.argv[2]) || 25;
const SEEDS = [];
for (let i = 0; i < N; i++) SEEDS.push(1000 + i * 7919);

function run() {
  const picks = [];
  SEEDS.forEach(seed => IR.simulate(seed).forEach(r => picks.push(r)));
  return picks;
}

E.CFG.STAGE2_CAP = false;
const off = run();
E.CFG.STAGE2_CAP = true;
const on = run();
E.CFG.STAGE2_CAP = false;

const n = Math.min(off.length, on.length);
let changed = 0;
const swaps = [];
for (let i = 0; i < n; i++) {
  if (off[i].player !== on[i].player) {
    changed++;
    swaps.push({ overall: off[i].overall, round: off[i].round,
      from: off[i].player, fromDev: off[i].deviation, fromLead: off[i].leadDriver,
      to: on[i].player });
  }
}
const rate = arr => arr.filter(p => p.intervened).length / arr.length;

console.log('='.repeat(74));
console.log('CRUDE STAGE 2 CAP — MEASURED (cap-off vs cap-on, same engine, T=' + E.CFG.STAGE2_CAP_T + ')');
console.log('='.repeat(74));
console.log('  ' + N + ' drafts · ' + n + ' decisions');
console.log('');
console.log('  picks that changed IDENTITY : ' + changed + '  (' + (changed / n * 100).toFixed(1) + '%)');
console.log('  deviation rate  off -> on   : ' + (rate(off) * 100).toFixed(1)
  + '%  ->  ' + (rate(on) * 100).toFixed(1) + '%');
console.log('');

if (!changed) {
  console.log('  0 picks moved — per the pre-registration this is a LABELING LAYER, not a');
  console.log('  behavioral anchor. T=' + E.CFG.STAGE2_CAP_T + ' does not bind or `earned` is mis-defined.');
  console.log('  A FINDING, not a knob to turn. SOURCE stays absent.');
} else {
  // Direction check: the reverted reaches should be value/weak-led, not need/ceiling.
  const leadCounts = {};
  swaps.forEach(s => { leadCounts[s.fromLead || 'none'] = (leadCounts[s.fromLead || 'none'] || 0) + 1; });
  console.log('  DIRECTION — lead driver of the picks the cap reverted:');
  Object.keys(leadCounts).sort((a, b) => leadCounts[b] - leadCounts[a]).forEach(k => {
    const kl = k === 'none' ? '' : ' [' + (D.EVIDENCE[k] ? D.EVIDENCE[k].klass : '?') + ']';
    console.log('    ' + String(leadCounts[k]).padStart(4) + '  ' + k + kl);
  });
  console.log('');
  console.log('  THE ACTUAL DECISIONS THAT CHANGED (first 20):');
  swaps.slice(0, 20).forEach(s => {
    console.log('    pick ' + String(s.overall).padStart(3) + ' (r' + s.round + ')  '
      + s.from + ' (' + (s.fromLead || '?') + ', dev ' + (s.fromDev || 0).toFixed(0) + ')'
      + '  ->  ' + s.to);
  });
  if (swaps.length > 20) console.log('    ... and ' + (swaps.length - 20) + ' more');
}
console.log('='.repeat(74));
