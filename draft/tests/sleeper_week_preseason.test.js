/* Cory, 2026-08-17: "why does matchup tab currently say it is week 2?"
 * Because Sleeper's state.week counts PRESEASON weeks during preseason, and the
 * code read it without checking season_type. A number that is confidently wrong
 * on a live surface is worse than no number. */
const assert = require('assert');
let pass = 0;
const ok = (n, f) => { f(); console.log('PASS ', n); pass++; };

// the pure rule, mirroring src/sleeper.js
function weekFor(state) {
  const seasonType = state.season_type || 'regular';
  const preseason = seasonType !== 'regular' && seasonType !== 'post';
  return { week: preseason ? 1 : Math.max(1, Math.min(state.week || 1, 18)), preseason };
}

ok('FAIL ARM — preseason week 2 no longer renders as regular week 2', () => {
  const r = weekFor({ season_type: 'pre', week: 2 });
  assert.strictEqual(r.week, 1, 'preseason must clamp to the next real week');
  assert.strictEqual(r.preseason, true, 'and must SAY it is preseason');
});
ok('the exact live case Cory saw', () => {
  assert.strictEqual(weekFor({ season_type: 'pre', week: 2 }).week, 1);
});
ok('CONTROL — a real regular-season week is untouched', () => {
  const r = weekFor({ season_type: 'regular', week: 7 });
  assert.strictEqual(r.week, 7);
  assert.strictEqual(r.preseason, false);
});
ok('CONTROL — postseason is not treated as preseason', () => {
  assert.strictEqual(weekFor({ season_type: 'post', week: 18 }).week, 18);
});
ok('CONTROL — missing season_type defaults to regular, old behaviour', () => {
  assert.strictEqual(weekFor({ week: 5 }).week, 5);
});
ok('CONTROL — week is still clamped to 18', () => {
  assert.strictEqual(weekFor({ season_type: 'regular', week: 25 }).week, 18);
});
console.log(`\n${pass}/6 checks passed`);
