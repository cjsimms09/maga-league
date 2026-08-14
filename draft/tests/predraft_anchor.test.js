// TERRITORY: A
// THE BOARD WAS ADVISING A PICK CORY DOES NOT OWN.
//
// From a mock, eight days out: the war room recommended Jahmyr Gibbs (adp 1),
// offered Bijan Robinson (adp 2) and Puka Nacua (adp 3) as the alternatives, and
// printed "RB: take-now (grab-by 33)".
//
// HIS FIRST PICK IS 33. He owns nothing before it. All three of those men are
// gone long before he chooses, "take-now" names a pick that is not his, and the
// grab-by deadline was the very pick he was standing on.
//
// ── THE CAUSE: TWO QUANTITIES SHARING ONE ACCESSOR ────────────────────────
//
// `pickState().currentPick` is `pickEvents + 1` and is NOT WRONG — it names the
// pick the ROOM is on, and before anybody picks that is 1. `currentPick()`
// returned it unconditionally, and the whole recommendation surface treated it
// as the SEAT BEING DECIDED. Those are different questions.
//
// Same shape as board picks versus live picks, which cost a first pick of 30
// instead of 33, and as an add-week wire level standing in for an ongoing one.
// A variable that answers two questions eventually answers the wrong one.
//
// ── WHAT MAKES IT PROVABLE RATHER THAN ARGUABLE ───────────────────────────
//
// THE SEAT PANEL WAS RIGHT ON THE SAME SCREEN. `seatForCurrentPick()` falls
// forward — `seats.find(s => s.pick >= cur)` — and read "THE PLAN WANTS TE at
// overall 33" while the engine beside it argued for a running back at pick 1.
// Two panels, one screen, two different picks. One of them had to be wrong.
//
// And `currentPick()`'s own comment already promised the fixed behaviour:
// "before any pick is recorded, my first live pick stays the anchor: that is
// the pre-draft prep board". The code stopped doing it when manual mode grew a
// clock; the prose was never updated, so it read as implemented.
//
// Run: node draft/tests/predraft_anchor.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

/* THE REAL FUNCTION, EXTRACTED AND DRIVEN — not grepped. The whole defect was a
 * function whose comment described behaviour the body did not have, so reading
 * the source is exactly the method that could not catch it. */
const fnSrc = (function () {
  const i = SRC.indexOf('  function currentPick() {');
  return i < 0 ? '' : SRC.slice(i, SRC.indexOf('\n  }', i) + 4);
})();
ck('currentPick is locatable', fnSrc.length > 200);

const run = (pickEvents, sync, data) => {
  const state = { sync: sync, data: data === undefined ? D : data };
  const pickState = () => ({ pickEvents: pickEvents, currentPick: pickEvents + 1 });
  // eslint-disable-next-line no-new-func
  return new Function('state', 'pickState', fnSrc + '; return currentPick;')(state, pickState)();
};

const FIRST = D.pick_order.my_picks[0];

// ── 1. THE FIX, ON THE REAL BOARD ───────────────────────────────────────
ck('the artifact really does start Cory at a pick well after 1 — otherwise '
  + 'there is nothing here to get wrong', FIRST > 1, FIRST);
ck('PRE-DRAFT the board anchors on MY FIRST PICK, not the room\'s pick 1',
  run(0, null) === FIRST, { got: run(0, null), want: FIRST });
ck('FAIL ARM — the behaviour that shipped returned 1, which is what put Gibbs, '
  + 'Bijan and Nacua on a board Cory could never take them from',
  run(0, null) !== 1);

// ── 2. IT IS NARROW, WHICH IS WHAT MAKES IT SAFE ────────────────────────
// The moment anything is recorded the room's clock takes over exactly as before.
// A fix to the pre-draft board must not touch the live draft.
{
  ck('one recorded pick and the room clock takes over', run(1, null) === 2, run(1, null));
  ck('mid-draft is untouched', run(40, null) === 41, run(40, null));
  ck('a LIVE SYNC still wins outright — it is the only real clock there is',
    run(0, { currentPickNumber: () => 17 }) === 17, run(0, { currentPickNumber: () => 17 }));
  ck('and sync wins even pre-draft, so connecting to a room mid-first-round '
    + 'does not snap the board back to pick ' + FIRST,
    run(0, { currentPickNumber: () => 3 }) === 3);
}

// ── 3. IT DEGRADES RATHER THAN THROWING ─────────────────────────────────
// This runs during boot, before the board is guaranteed loaded.
{
  ck('no board yet — falls back to the room clock instead of throwing',
    run(0, null, {}) === 1, run(0, null, {}));
  ck('board with an EMPTY schedule does the same, rather than reading [0] of []',
    run(0, null, { pick_order: { my_picks: [] } }) === 1);
  ck('and a missing pick_order entirely', run(0, null, { league: {} }) === 1);
}

// ── 4. THE OTHER HALF IS UNCHANGED, DELIBERATELY ────────────────────────
// `pickState().currentPick` names the pick the ROOM is on and 1 is the truth
// for that. Redefining it would have broken the invariants that read it.
{
  ck('pickState still computes the ROOM clock as pickEvents + 1',
    /currentPick: pickEvents \+ 1,\s*\/\/ INVARIANT 1/.test(SRC));
  ck('and the fix reads pickState rather than replacing it',
    /const ps = pickState\(\);/.test(fnSrc) && /return ps\.currentPick;/.test(fnSrc));
  ck('the guard is on pickEvents === 0, so it cannot fire once a draft is '
    + 'moving', /ps\.pickEvents === 0/.test(fnSrc));
}

// ── 5. THE TWO PANELS NOW AGREE, which is the symptom that exposed it ───
{
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'seat_plan.json'), 'utf8'));
  const firstSeat = (plan.seats || [])[0];
  ck('the seat plan\'s first seat is the same pick the board now anchors on',
    firstSeat && firstSeat.pick === run(0, null),
    { seat: firstSeat && firstSeat.pick, board: run(0, null) });
  ck('CONTROL — before the fix they disagreed, which is exactly what Cory saw: '
    + 'the seat panel naming ' + FIRST + ' beside an engine scoring pick 1',
    firstSeat && firstSeat.pick !== 1);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: with no draft running, every pick-dependent surface is');
console.log('scored for the pick Cory actually owns first, the seat panel and the engine');
console.log('agree about which pick that is, and the moment a real pick lands the room\'s');
console.log('clock takes over untouched.');
console.log('WHAT IT DOES NOT: fix what the board shows MID-DRAFT when it is not his turn.');
console.log('The room is on pick 20, his next is 33, and which of those the recommendation');
console.log('should be scored for is a live design question — not a bug with a right');
console.log('answer, and not one to change eight days out without measuring it.');
