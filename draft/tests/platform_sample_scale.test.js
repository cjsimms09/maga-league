// TERRITORY: A
/* LAYER 2 — THE LEARNING JOIN. `vs_market` DIFFERENCED TWO DIFFERENT SCALES.
 *
 * `capturePlatformSample` computed `adjusted_adp - pick_no`.
 *
 *   adjusted_adp counts SELECTIONS.
 *   pick_no      counts BOARD SLOTS.
 *
 * A keeper occupies a board slot without being a selection, so in any keeper
 * room the two diverge by the number of keeper slots before that pick, and the
 * delta is biased by exactly that count — growing as the draft goes on. It is
 * the same two-quantities-one-variable defect that produced the applySlot bug
 * and the survival scale bug, and the same one keepers.py:live_index_of and
 * survival.js:liveIndexOf were written to fix.
 *
 * ── IT NEVER PRODUCED A WRONG NUMBER, AND THAT IS WHY IT SURVIVED ──────────
 *
 * Sampling is gated on `state.mockMode`, and Sleeper mock rooms carry no
 * keepers. Board slots and selections coincide there, so every sample ever
 * written is correct. THE CORRECTNESS WAS A PROPERTY OF THE ROOMS WE HAPPENED
 * TO SAMPLE — asserted nowhere, relied on everywhere, and invisible the moment
 * a keeper room is sampled.
 *
 * ── WHY THIS IS A LEARNING DEFECT AND NOT MERELY A DISPLAY ONE ────────────
 *
 * These rows are training data for exp 31. A mis-scaled delta does not crash,
 * does not look wrong, and joins cleanly against everything else. Rows written
 * before and after a keeper room entered the sample would sit in the same table
 * on different scales with NOTHING to tell them apart. That is unrecoverable
 * after the fact, which is the class the standing rule ranks above decision
 * quality: evidence preservation.
 *
 * ── THE FIX IS A NO-OP ON EVERY SAMPLE COLLECTED SO FAR ────────────────────
 *
 * `selectionIndexOf` counts non-keeper picks up to pickNo. In a keeper-free
 * room that count IS pickNo, so historical values are unchanged to the digit.
 * The KEEPER_FREE_IS_IDENTITY arm below proves that rather than asserting it —
 * preserving production behaviour where the evidence supports it, which is the
 * standing rule, not a preference.
 *
 * Run: node draft/tests/platform_sample_scale.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ── LIFT THE REAL FUNCTION OUT OF app.js. Not a reimplementation: a copy of
//    the logic under test would pass while the shipped one was broken. ───────
const i = SRC.indexOf('  function selectionIndexOf(');
const end = SRC.indexOf('\n  function ', i + 10);
ck('CONTROL: selectionIndexOf is locatable in app.js', i > 0 && end > i, { i: i, end: end });
const BODY = SRC.slice(i, end);
const selectionIndexOf = new Function('return ' + BODY.trim())();

// ── THE IDENTITY ARM: keeper-free rooms are untouched ──────────────────────
{
  const picks = [];
  for (let n = 1; n <= 120; n++) picks.push({ pick_no: n });
  const bad = [];
  for (let n = 1; n <= 120; n++) {
    const r = selectionIndexOf(n, picks);
    if (r.index !== n) bad.push({ pick: n, got: r.index });
  }
  ck('KEEPER_FREE_IS_IDENTITY — every mock sample ever written keeps its exact value',
    bad.length === 0, bad.slice(0, 5));
  ck('...and the basis SAYS it was keeper-free rather than leaving it ambiguous',
    selectionIndexOf(60, picks).basis === 'selection-keeper-free',
    selectionIndexOf(60, picks).basis);
  ck('...reporting zero keeper slots, not null',
    selectionIndexOf(60, picks).keepers === 0);
}

// ── THE DEFECT ARM: a keeper room must diverge, by exactly the keeper count ─
{
  // Cory's real shape: 150 slots, keepers at 8, 13, 28.
  const KEEP = new Set([8, 13, 28]);
  const picks = [];
  for (let n = 1; n <= 150; n++) picks.push({ pick_no: n, is_keeper: KEEP.has(n) });

  const at33 = selectionIndexOf(33, picks);
  ck('CONTROL: the fixture really contains keepers', at33.keepers === 3, at33);
  ck('a keeper room DIVERGES — pick 33 is selection 30, not 33',
    at33.index === 30, at33);
  ck('...and the divergence is EXACTLY the keeper count before it',
    33 - at33.index === at33.keepers, { pick: 33, index: at33.index, keepers: at33.keepers });
  ck('...and the basis names the conversion, so September can filter on it',
    at33.basis === 'selection-converted', at33.basis);

  // The bias GROWS. A constant offset might be argued away; a growing one is
  // a different number at every pick and cannot be corrected after the fact
  // without knowing the board.
  const early = selectionIndexOf(7, picks);
  ck('the bias is not constant — it is 0 before the first keeper and 3 after',
    early.index === 7 && (33 - at33.index) === 3,
    { at7: early.index, at33: at33.index });

  ck('the LAST pick is not the last selection — 150 slots, 147 selections',
    selectionIndexOf(150, picks).index === 147, selectionIndexOf(150, picks));
}

// ── REFUSAL, NOT A GUESS, WHEN THE STREAM CANNOT ANSWER ────────────────────
{
  const noStream = selectionIndexOf(40, null);
  ck('no pick stream -> index null, so vs_market is null rather than mis-scaled',
    noStream.index === null && noStream.basis === 'pick-stream-unavailable', noStream);
  ck('empty pick stream refuses too — an empty read is not evidence of zero keepers',
    selectionIndexOf(40, []).index === null, selectionIndexOf(40, []));
  ck('no pick number -> refuses rather than defaulting to zero',
    selectionIndexOf(null, [{ pick_no: 1 }]).index === null,
    selectionIndexOf(null, [{ pick_no: 1 }]));
}

// ── OUT-OF-ORDER AND MALFORMED ROWS. The sync feed is not guaranteed sorted. ─
{
  const KEEP = new Set([8, 13, 28]);
  const ordered = [];
  for (let n = 1; n <= 60; n++) ordered.push({ pick_no: n, is_keeper: KEEP.has(n) });
  const shuffled = ordered.slice().reverse();
  ck('ORDER-INDEPENDENT — a reversed feed gives the same selection index',
    selectionIndexOf(33, shuffled).index === selectionIndexOf(33, ordered).index,
    { shuffled: selectionIndexOf(33, shuffled).index, ordered: selectionIndexOf(33, ordered).index });

  const dirty = ordered.concat([{ pick_no: null }, { pick_no: 'x' }, {}]);
  ck('malformed rows are SKIPPED, not counted as selections',
    selectionIndexOf(33, dirty).index === selectionIndexOf(33, ordered).index,
    { dirty: selectionIndexOf(33, dirty).index });
}

// ── THE CALL SITE AND THE PAYLOAD ──────────────────────────────────────────
{
  ck('the sampler is CALLED with the pick stream — without it every sample '
    + 'would silently take the unavailable branch and log null forever',
    /capturePlatformSample\(pick, p, slot, picks\)/.test(SRC));
  ck('vs_market is computed from the SELECTION index, not from pick_no',
    /Math\.round\(\(adp - scale\.index\) \* 10\)/.test(SRC));
  ['vs_market_basis', 'selection_no', 'keeper_slots_before'].forEach(f => {
    ck('the payload carries ' + f + ' — a delta is meaningless without its basis',
      new RegExp('\\b' + f + ':').test(SRC));
  });
  ck('pick_no is STILL recorded — the board slot is real and losing it would '
    + 'make the conversion unauditable',
    /pick_no: pickNo/.test(SRC));
}

// ── FAIL ARM ───────────────────────────────────────────────────────────────
{
  // Reintroduce the defect in a scratch copy: count every pick, keeper or not.
  const broken = new Function('return ' + BODY.trim()
    .replace('if (p.is_keeper) { keepers += 1; continue; }',
             'if (p.is_keeper) { keepers += 1; }'))();
  const KEEP = new Set([8, 13, 28]);
  const picks = [];
  for (let n = 1; n <= 150; n++) picks.push({ pick_no: n, is_keeper: KEEP.has(n) });
  ck('FAIL ARM: the scratch copy really is broken (counts keepers as selections)',
    broken(33, picks).index === 33, broken(33, picks));
  ck('FAIL ARM: ...and the shipped one does NOT agree with it',
    selectionIndexOf(33, picks).index !== broken(33, picks).index);
  ck('FAIL ARM: ...while still agreeing on a keeper-free room, which is why '
    + 'no mock sample could ever have exposed this',
    broken(33, [{ pick_no: 33 }]).index === selectionIndexOf(33, [{ pick_no: 33 }]).index);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
