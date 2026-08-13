// TERRITORY: A
// A FIELD THAT VANISHES IS NOT AN ERROR ANYWHERE. THAT IS THE WHOLE PROBLEM.
//
// `516ba16` correctly moved the first pick from 30 to 33 and, in restamping the
// board's `arithmetic_check`, dropped `condition` — which read "holds only while
// I keep 3 (first pick in round 4)". I dropped it deliberately and my reasoning
// was half right: the RULE now generalises to any keeper count, so the old
// string was obsolete.
//
// THE RULE GENERALISES. THE NUMBER DOES NOT. The sheet prints "#33", and #33 is
// true only while Cory keeps exactly three. `admin.js` maps the field to
// `keeperNote.pickRule` and prints it inside `if (pickRule)`, so a missing field
// printed NOTHING — the sheet went from "#33, and here is when that is true" to
// a bare "#33 — provisional". No error, no warning, no red anything.
//
// **A number, and a number whose provenance was lost, read identically and are
// not the same claim.** Another session found this and named the precedent:
// `score_gap_source` in the ledger, same shape.
//
// ── WHY A TEST FOR ONE FIELD IS THE WRONG FIX ─────────────────────────────
//
// Pinning `condition` would catch this exact field and nothing else. The class
// is "a consumer reads a field the producer stopped emitting, and the consumer's
// falsy-guard turns the absence into silence." So this asserts the CONTRACT:
// every field the artifact promises about the pick arithmetic is present, and
// each carries something a reader can act on rather than a truthy placeholder.
//
// ── AND THE ASSERTION THAT WOULD HAVE MISSED IT ───────────────────────────
//
// The session that found this also reported their own guard was unsound:
// `t.indexOf(a.condition) > 0` with no null check. Once `condition` became
// undefined that searched the rendered page for the literal string "undefined" —
// it would have gone GREEN the moment the sheet printed that word anywhere. It
// went red by luck. Every check below that reads a field asserts its TYPE first,
// because `String(undefined)` is a real string and `indexOf` is happy to find it.
//
// Run: node draft/tests/artifact_field_contract.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const AC = ((D.keeper_slate || {}).arithmetic_check) || {};
const po = D.pick_order || {};
const L = D.league || {};

// ── 1. EVERY PROMISED FIELD IS PRESENT AND NON-EMPTY ────────────────────
// Declared as a list so adding a field to the stamp without adding it here is a
// visible omission rather than a silent one.
const REQUIRED = {
  my_first_pick: 'number', expected: 'number', holds: 'boolean',
  my_keepers: 'number', first_round: 'number', nth_pick_of_round: 'number',
  rule: 'string', independent_of: 'string', condition: 'string',
  first_pick_by_my_keeper_count: 'object',
  board_picks: 'number', live_picks: 'number',
};
const missing = Object.keys(REQUIRED).filter(k => AC[k] === undefined || AC[k] === null);
ck('every field the pick-arithmetic stamp promises is PRESENT', missing.length === 0, missing);
const wrongType = Object.keys(REQUIRED).filter(k =>
  AC[k] != null && typeof AC[k] !== REQUIRED[k]);
ck('and each has the type its consumer expects — `String(undefined)` is a real '
  + 'string and that is how this class hides', wrongType.length === 0,
  wrongType.map(k => k + ':' + typeof AC[k]));
const emptyStr = Object.keys(REQUIRED).filter(k => REQUIRED[k] === 'string'
  && String(AC[k] || '').trim().length < 12);
ck('no string field is a truthy placeholder that satisfies `if (x)` and says '
  + 'nothing', emptyStr.length === 0, emptyStr);

// ── 2. THE CONDITION SAYS WHAT THE NUMBER DEPENDS ON ────────────────────
ck('the condition names MY keeper count, which is what the number moves with',
  typeof AC.condition === 'string' && new RegExp('\\b' + AC.my_keepers + '\\b').test(AC.condition),
  AC.condition);
ck('and distinguishes the RULE (general) from the NUMBER (conditional) — the '
  + 'distinction I got wrong when I deleted it',
  /RULE/.test(AC.condition) && /NUMBER/.test(AC.condition), AC.condition);

// ── 3. IT SHOWS WHAT THE NUMBER BECOMES, NOT JUST THAT IT MIGHT ─────────
// A caveat tells a reader to worry. The map tells him the answer.
const alts = AC.first_pick_by_my_keeper_count || {};
const cap = +((L.keeper_rules || {}).count || 3);
ck('every legal keeper count from 0 to the cap is priced',
  Object.keys(alts).length === cap + 1, Object.keys(alts));
ck('and the entry for MY count IS my first pick',
  alts[String(AC.my_keepers)] === po.my_picks[0], { alts: alts, first: po.my_picks[0] });
/* THE MAP IS THE PRE-KEEPER SNAKE'S PREFIX, which is the whole derivation: under
 * top_picks_flat, keeping N forfeits rounds 1..N, so the first live pick is the
 * (N+1)th entry of the list Cory would have had if he kept nobody. */
const before = po.my_picks_before_keepers || [];
ck('the map IS the (N+1)th entry of the pre-keeper snake, not a restatement',
  Object.keys(alts).every(k => alts[k] === before[+k]),
  { alts: alts, snake: before.slice(0, cap + 1) });
ck('CONTROL — the alternatives genuinely DIFFER, or the condition is decorative',
  new Set(Object.values(alts)).size === Object.keys(alts).length, alts);

// ── 4. FAIL ARM — the checks must fire on the actual regression ─────────
// Reproduce exactly what shipped: the field deleted, and a consumer guarding on
// truthiness. Both the absence AND the unsound assertion are modelled, because
// the unsound one is what let it reach production.
{
  const broken = JSON.parse(JSON.stringify(AC));
  delete broken.condition;
  ck('FAIL ARM — the deleted field is DETECTED',
    Object.keys(REQUIRED).some(k => broken[k] === undefined));
  // The consumer's guard: `if (pickRule)` prints nothing for undefined.
  const rendered = broken.condition ? ('<p>' + broken.condition + '</p>') : '';
  ck('CONTROL — and a truthy-guarded consumer renders SILENCE, which is why '
    + 'nothing went red', rendered === '');
  // The unsound assertion, reconstructed: it searches for the literal "undefined".
  const page = 'first pick #33 — provisional. status: undefined';
  ck('FAIL ARM — `indexOf(undefined)` finds the WORD and passes, so a guard '
    + 'without a type check is not a guard',
    page.indexOf(String(broken.condition)) > 0);
  ck('CONTROL — a type check on the same value refuses it',
    typeof broken.condition !== 'string');
  // And a placeholder that satisfies `if (x)` while saying nothing.
  const placeholder = Object.assign({}, AC, { condition: 'n/a' });
  ck('FAIL ARM — a truthy PLACEHOLDER is caught too, not just an absent field',
    String(placeholder.condition).trim().length < 12);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the board cannot ship a pick-arithmetic stamp that has');
console.log('quietly lost a field, or filled one with a truthy placeholder, and the');
console.log('condition states what the number depends on AND what it becomes at every');
console.log('legal keeper count — derived from the artifact\'s own pre-keeper snake.');
console.log('WHAT IT DOES NOT: check the SHEET. Whether admin.js renders the condition,');
console.log('and how loudly it complains when one is missing, is the other session\'s half');
console.log('and they have already fixed it. This guarantees there is something to render.');
