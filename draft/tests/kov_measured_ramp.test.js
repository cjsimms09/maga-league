// TERRITORY: A
/* KOV_MEASURED_RAMP — the gated, measured alternative to the reasoned keeper
 * ramp (EXP-KEEPER-OPTION, 2026-08-15). Three properties:
 *   1. The flag ships FALSE — no committed default changed.
 *   2. Flag off: keeperOptionValueRaw is bit-identical to the shipped shape
 *      (late rounds ramp UP) — the gate being present changes nothing.
 *   3. Flag on: the shape inverts to the measured one — a round-5 pick
 *      out-ramps a round-11 pick, and rounds 13+ read zero — and turning it
 *      back off restores the shipped behaviour exactly (flag hygiene).
 */
'use strict';
const path = require('path');
const assert = require('assert');
global.window = global;
const C = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'composite.js'));

const league = { teams: 10, rounds: 15, keeper_rules: { cost_model: 'top_picks_flat', count: 3 } };
const player = { player_id: 'x1', position: 'WR', age: 23, years_exp: 1, vorp: 40, proj_mean: 180 };
const boardStub = [{ player_id: 'alt', position: 'WR', vorp: 10, adjusted_adp: 999 }];
const ctxAt = pick => ({ league, currentPick: pick, board: boardStub, roster: [] });

// 1. THE DEFAULT IS CORY'S RULING — flipped ON 2026-08-16 ("3. Yes"), with
// the 450-pick evidence (keeper value lives rounds 4-6; 0/31 round-13-15
// picks ever kept) and the small-sample caveat both in front of him. Pinned
// so it cannot drift in either direction without a new ruling.
assert.strictEqual(C.CFG.KOV_MEASURED_RAMP, true, 'KOV_MEASURED_RAMP is true per Cory 2026-08-16');

// 2. shipped (measured) shape: peak in rounds 4-6, fraction 7-9, zero late
const onR5 = C.keeperOptionValueRaw(player, ctxAt(45));   // round 5
const onR8 = C.keeperOptionValueRaw(player, ctxAt(75));   // round 8
const onR11 = C.keeperOptionValueRaw(player, ctxAt(105)); // round 11
const onR14 = C.keeperOptionValueRaw(player, ctxAt(135)); // round 14
assert.strictEqual(onR5.ramp, 1.0, 'measured ramp peaks in rounds 4-6');
assert.ok(onR8.ramp > 0 && onR8.ramp < onR5.ramp, 'rounds 7-9 are a fraction of the peak');
assert.strictEqual(onR11.ramp, 0, 'measured ramp is zero in rounds 10-12');
assert.strictEqual(onR14.ramp, 0, 'measured ramp is zero in rounds 13-15');

// 3. the old reasoned shape survives behind the flag (rollback path), then hygiene
C.CFG.KOV_MEASURED_RAMP = false;
let offR5, offR11;
try {
  offR5 = C.keeperOptionValueRaw(player, ctxAt(45));
  offR11 = C.keeperOptionValueRaw(player, ctxAt(105));
  assert.strictEqual(offR5.ramp, 0, 'old reasoned ramp is zero in round 5');
  assert.ok(offR11.ramp > 0.5, 'old reasoned ramp is high in round 11, got ' + offR11.ramp);
  assert.ok(onR5.value !== offR5.value || onR5.ramp !== offR5.ramp,
    'the flag provably reaches the computation');
} finally {
  C.CFG.KOV_MEASURED_RAMP = true;
}
const backR5 = C.keeperOptionValueRaw(player, ctxAt(45));
const backR11 = C.keeperOptionValueRaw(player, ctxAt(105));
assert.strictEqual(backR5.ramp, onR5.ramp, 'flag restored: round-5 ramp back to measured');
assert.strictEqual(backR11.ramp, onR11.ramp, 'flag restored: round-11 ramp back to measured');
assert.strictEqual(C.CFG.KOV_MEASURED_RAMP, true, 'ruled default untouched after the run');

console.log('kov_measured_ramp.test.js: 11 checks passed');
