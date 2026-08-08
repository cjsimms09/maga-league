/* THE CREED AND THE PREFERENCE SIGNAL MUST DESCRIBE THE SAME PLAN.
 *
 * Two descriptions of one thing is a drift surface, and this repo has been bitten
 * by that exact shape twice this week: `markLocal` and `applyRemote` disagreeing
 * about a seatless pick, and the tier sentence needing an SSOT so "confirmed"
 * could not drift to "verified". A doctrine has a CREED (prose, shown to Cory)
 * and a PREFERENCE SIGNAL (numbers, used by the engine). Nothing stops an edit to
 * one from leaving the other behind — and the failure is silent, because the
 * banner keeps reading correctly while the score does something else.
 *
 * Generating the creed from the signal is not practical: the creed carries
 * rhetoric ("hammer WR value", "the cliff pays it back") that no weight table
 * implies. So the enforceable version is PARITY — the creed's positional claims
 * are parsed and asserted against the signal's sign.
 *
 * THE RULE: if the creed says a position waits, the signal must down-weight it.
 * If the creed names a position as the plan, the signal must up-weight it.
 *
 * Run: node draft/tests/creed-signal-parity.test.js
 */
'use strict';
const DOC = require('../../public/js/draft/doctrine.js');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

const POS_WORDS = {
  RB: /\b(back|backs|rb)\b/i,
  WR: /\b(wr|receiver|receivers)\b/i,
  TE: /\bte\b/i,
  QB: /\bqb\b/i,
};
// Words that mean "later / not yet" applied to a position.
const DEFER = /\b(wait|waits|no|until|let the room|patience|later)\b/i;
// Words that mean "this is the plan".
const EMPHASIS = /\b(anchor|hammer|two|elite|strike|feast|pay for|ride|take)\b/i;

/* CREEDS ARE SEQUENTIAL, so a claim is checked across the states it could apply
 * to, not at one arbitrary moment. hero_rb says "one anchor back, THEN hammer WR
 * value" — at pick 1 with an empty roster the signal correctly down-weights WR,
 * because the anchor comes first. Asserting the WR claim at pick 1 tested the
 * creed's second clause against the first clause's state and reported drift that
 * was not there.
 *
 * The honest semantics: a directional claim must be EXPRESSIBLE — there must
 * exist a state in the plan's own window where the signal carries the claimed
 * sign. A claim the signal can never express anywhere IS drift. */
const STATES = [
  { i: 1, roster: [] },
  { i: 2, roster: [{ position: 'RB' }] },
  { i: 3, roster: [{ position: 'RB' }, { position: 'WR' }] },
  { i: 4, roster: [{ position: 'RB' }, { position: 'RB' }] },
  { i: 5, roster: [{ position: 'RB' }, { position: 'WR' }, { position: 'TE' }] },
];
const anyState = (k, pos, test) =>
  STATES.some(st => test(DOC.prefers(k, pos, st.i, st.roster)));
const allStates = (k, pos, test) =>
  STATES.every(st => test(DOC.prefers(k, pos, st.i, st.roster)));
const keys = Object.keys(DOC.DOCTRINES);

check('every doctrine has BOTH a creed and a preference signal',
  keys.every(k => DOC.DOCTRINES[k].creed && typeof DOC.PREFERS[k] === 'function'),
  keys.filter(k => !DOC.DOCTRINES[k].creed || typeof DOC.PREFERS[k] !== 'function').join(','));

// Non-vacuity: the parser must actually find claims, or every check below is
// trivially true. Per the fixture-premise rule.
let claimsFound = 0;

keys.forEach(k => {
  const creed = DOC.DOCTRINES[k].creed;
  Object.keys(POS_WORDS).forEach(pos => {
    if (!POS_WORDS[pos].test(creed)) return;
    // Which clause mentions this position?
    const clause = creed.split(/[;,]/).find(c => POS_WORDS[pos].test(c)) || creed;
    const defers = DEFER.test(clause);
    const emphasises = EMPHASIS.test(clause);
    if (!defers && !emphasises) return;             // no directional claim
    claimsFound++;
    if (defers && !emphasises) {
      // A deferral is a stronger claim: the signal must NEVER up-weight it
      // inside the plan's window, and must down-weight it somewhere.
      check(`${k}: creed defers ${pos} ("${clause.trim()}") -> signal down-weights it, never up`,
        anyState(k, pos, w => w < 0) && allStates(k, pos, w => w <= 0),
        'weights: ' + STATES.map(st => DOC.prefers(k, pos, st.i, st.roster).toFixed(2)).join(' '));
    } else if (emphasises && !defers) {
      check(`${k}: creed emphasises ${pos} ("${clause.trim()}") -> signal up-weights it somewhere`,
        anyState(k, pos, w => w > 0),
        'weights: ' + STATES.map(st => DOC.prefers(k, pos, st.i, st.roster).toFixed(2)).join(' '));
    }
  });
});

check('the creed parser actually found directional claims (non-vacuity)',
  claimsFound >= 6, `only ${claimsFound} claims parsed — the parity checks above ` +
  'may be passing because nothing was tested');

// The two doctrines that deliberately carry NO positional claim must also carry
// no positional signal — silence in one description must be silence in both.
['ceiling', 'balanced'].forEach(k => {
  const anyWeight = ['RB', 'WR', 'TE', 'QB']
    .some(p => anyState(k, p, w => w !== 0));
  check(`${k}: a creed with no positional claim has no positional signal`,
    !anyWeight,
    'this doctrine tilts a position its creed never mentions — the signal is ' +
    'asserting a plan the creed does not describe');
});

// Weights stay inside the bound that keeps the tilt a tilt.
check('every weight is clamped to [-1, 1] (the upper bound is structural)',
  keys.every(k => ['RB', 'WR', 'TE', 'QB', 'K', 'DEF'].every(p =>
    [1, 2, 3, 5, 8].every(i => Math.abs(DOC.prefers(k, p, i, [])) <= 1))));

console.log(`\n${pass}/${pass + fail} creed/signal parity checks passed`);
process.exit(fail ? 1 : 0);
