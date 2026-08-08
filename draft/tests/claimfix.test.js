/* Commissioner claim correction — the mid-selection fat-finger fix.
 * Run: node draft/tests/claimfix.test.js
 */
'use strict';
const CF = require('../../src/claimfix.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// The live shape: Richard (pos 1) claimed slot 7 — the WRONG slot — and Sam
// (pos 2) is on turn. Eight more wait behind.
function liveDoc() {
  return { order: [
    { pos: 1, owner_id: 8, slot: 7 },        // Richard, wrong slot
    { pos: 2, owner_id: 5, slot: null },     // Sam, current turn
    { pos: 3, owner_id: 10, slot: null },
    { pos: 4, owner_id: 1, slot: null },
    { pos: 5, owner_id: 2, slot: null },
    { pos: 6, owner_id: 6, slot: null },
    { pos: 7, owner_id: 3, slot: null },
    { pos: 8, owner_id: 7, slot: null },
    { pos: 9, owner_id: 9, slot: null },
    { pos: 10, owner_id: 4, slot: null },
  ] };
}

// --- SET: reassign Richard to his intended slot --------------------------
{
  const out = CF.applyCorrection(liveDoc(), { owner_id: 8, action: 'set', slot: 3,
    by: 1, at: '2026-08-08T15:00:00Z' });
  check('reassign moves the owner to the intended slot',
    out.change.from === 7 && out.change.to === 3);
  check('the wrong slot returns to the open pool; the right one leaves it',
    CF.openSlots(out.doc).includes(7) && !CF.openSlots(out.doc).includes(3));
  check('the turn does NOT move — Sam stays on the clock',
    out.next_owner_id === 5);
  check('the correction is on the record (audit, never a silent edit)',
    out.doc.corrections.length === 1 && out.doc.corrections[0].from === 7
    && out.doc.corrections[0].to === 3 && out.doc.corrections[0].by === 1);
}

// --- CLEAR: void the claim so Richard re-picks ---------------------------
{
  const out = CF.applyCorrection(liveDoc(), { owner_id: 8, action: 'clear',
    by: 1, at: '2026-08-08T15:00:00Z' });
  check('clear voids the claim', out.change.to === null);
  check('the freed slot is back in the pool', CF.openSlots(out.doc).includes(7));
  check('the cleared owner becomes the current turn (first null in pos order)',
    out.next_owner_id === 8);
}

// --- guardrails -----------------------------------------------------------
{
  // Sam claims slot 4; now try to SET Richard onto Sam's slot.
  const doc = liveDoc();
  doc.order[1].slot = 4;
  let msg = '';
  try { CF.applyCorrection(doc, { owner_id: 8, action: 'set', slot: 4, by: 1, at: 'x' }); }
  catch (e) { msg = String(e.message); }
  check('a slot held by ANOTHER owner is refused, naming the holder',
    /held by owner 5/.test(msg), msg);
  check('the refused correction left the doc untouched',
    doc.order[0].slot === 7 && !(doc.corrections || []).length);

  let m2 = '';
  try { CF.applyCorrection(liveDoc(), { owner_id: 8, action: 'set', slot: 99, by: 1, at: 'x' }); }
  catch (e) { m2 = String(e.message); }
  check('an out-of-range slot is refused', /1-10/.test(m2), m2);

  let m3 = '';
  try { CF.applyCorrection(liveDoc(), { owner_id: 5, action: 'clear', by: 1, at: 'x' }); }
  catch (e) { m3 = String(e.message); }
  check('clearing an owner with no claim is refused', /no claim/.test(m3), m3);

  let m4 = '';
  try { CF.applyCorrection(liveDoc(), { owner_id: 999, action: 'clear', by: 1, at: 'x' }); }
  catch (e) { m4 = String(e.message); }
  check('an owner outside the order is refused', /not in the claim order/.test(m4), m4);
}

// --- the full live scenario: fix Richard, Sam claims, board stays sane -----
{
  const step1 = CF.applyCorrection(liveDoc(), { owner_id: 8, action: 'set', slot: 3,
    by: 1, at: 't1' });
  // Sam (on turn) now claims slot 7 — the slot Richard wrongly held, now free.
  const sam = step1.doc.order.find(e => e.owner_id === 5);
  sam.slot = 7;
  check('after the fix, the previously-wrong slot is claimable by the next owner',
    CF.openSlots(step1.doc).indexOf(7) === -1
    && step1.doc.order.filter(e => e.slot != null).length === 2);
  const next = step1.doc.order.find(e => e.slot == null);
  check('the process continues in position order', next.owner_id === 10);
}

console.log(`\n${pass}/${pass + fail} claim-correction checks passed`);
process.exit(fail ? 1 : 0);
