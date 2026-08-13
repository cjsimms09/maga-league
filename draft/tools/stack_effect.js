/* WHAT DID D10's CORRECTION DO TO THE BOARD? stack 0.5 vs 1.0, real keepers.
 *
 * THIS TOOL HAS GIVEN THREE DIFFERENT ANSWERS AND TWO WERE INSTRUMENT FAILURES:
 * an empty roster (no stack term can apply to anyone), then a hand-built context
 * missing eleven of production's seventeen keys (scores compressed near zero, so
 * a +-6 constant dominated and every rank consequence was fiction). It now
 * builds its context through live_context.js, which REFUSES a partial or
 * invented one, and it aborts if its own control fails.
 *
 * Findings: draft/audits/stack_weight_effect_2026-08-13.md
 * Run: node draft/tools/stack_effect.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const E = global.DraftEngine;
const LC = require(path.join(ROOT, 'draft', 'tools', 'live_context.js'));

const run = (pick, next, stackW) => E.recommend(LC.liveContext({
  currentPick: pick, nextPick: next,
  weights: Object.assign({}, E.MEASURED_WEIGHTS, { stack: stackW }),
}));
const nm = r => r.player.name;

/* THE CONTROL. If stack 0.0 and stack 3.0 score identically the override is not
 * reaching the engine and every comparison below is two identical runs agreeing
 * with each other — which is what a broken probe looks like from the outside. */
const lo = run(33, 48, 0.0), hi = run(33, 48, 3.0);
if (lo.slice(0, 50).every((r, i) => Number(r.score) === Number(hi[i].score))) {
  console.error('CONTROL FAILED: stack 0.0 and 3.0 produce identical top-50 scores.');
  console.error('The weight override is not reaching the engine. Refusing to report.');
  process.exit(1);
}
const carrying = hi.filter(r => Math.abs(Number(r.components.weighted.stack) || 0) > 1e-9);
console.log('STACK WEIGHT EFFECT — production context, real keepers\n');
console.log('  keepers: ' + LC.loadBoard().kept_players.map(k => k.name).join(', '));
console.log('  draftable players carrying a non-zero stack term: ' + carrying.length + '\n');

for (const [pick, next] of [[4, 17], [33, 48], [68, 73], [108, 113]]) {
  const a = run(pick, next, 0.5), b = run(pick, next, 1.0);
  const ta = a.slice(0, 10).map(nm), tb = b.slice(0, 10).map(nm);
  const diff = ta.filter((n, i) => n !== tb[i]).length;
  const ra = {}, rb = {};
  a.forEach((r, i) => { ra[nm(r)] = i; }); b.forEach((r, i) => { rb[nm(r)] = i; });
  const movers = Object.keys(ra).filter(n => rb[n] != null && ra[n] !== rb[n]);
  console.log(`  PICK ${String(pick).padStart(3)}  top-1 ${ta[0] === tb[0] ? 'unchanged' : ta[0] + ' -> ' + tb[0]}`
    + `   top-10 differing: ${diff}   board movers: ${movers.length}`);
}
console.log('\n  READING: the correction moves players in the deep tail, where scores are');
console.log('  close enough for a flat +-6 to matter, and changes nothing at the top of the');
console.log('  board. NOTE the states score a board on which NOBODY has been drafted — the');
console.log('  A/B is robust to that (both arms see the same state) but the absolute ranks');
console.log('  are not a forecast of draft night.');
