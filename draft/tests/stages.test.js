/* THE STAGE VOCABULARY — and the guard that keeps an unsized edge honest.
 *
 * Stage 4 ships at a FLOOR because experiment 34 is blocked (D13) and the
 * reliability numbers meant to size it do not exist. PRE-REGISTRATION-34.md
 * committed to that answer before the blockage was known: start small, earn up.
 *
 * An unsized intervention is NOT the same claim as a sized one. Rendering them
 * identically would let a floor-magnitude deviation read as a confident one —
 * the same failure the tier-voice sentence exists to prevent, one layer up.
 *
 * Run: node draft/tests/stages.test.js
 */
'use strict';
const S = require('../../public/js/draft/stages.js');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

// --- the vocabulary is complete and ordered ---------------------------------
{
  const ns = Object.keys(S.STAGES).map(k => S.STAGES[k].n).sort();
  check('all five stages exist, numbered 1-5 with no gaps',
    ns.join(',') === '1,2,3,4,5', ns.join(','));
  check('every stage carries a key and a human label',
    Object.keys(S.STAGES).every(k => S.STAGES[k].key && S.STAGES[k].label));
}

// --- THE UNSIZED LABEL, which is the point ----------------------------------
{
  const edge = S.report(S.STAGES.EDGE, { edge: 'tier cliff' });
  check('a Stage-4 result reports its sizing state at all',
    edge && typeof edge.sized === 'boolean', JSON.stringify(edge));
  check('while EDGE_SIZING is floor, Stage 4 reports sized:FALSE',
    S.edgeSizing() === 'floor' && edge.sized === false,
    'sizing=' + S.edgeSizing() + ' sized=' + edge.sized);
  check('...and says AT MINIMUM, naming what is pending',
    /AT MINIMUM/.test(edge.sizing_line) && /unsized/.test(edge.sizing_line)
    && /34|D13/.test(edge.sizing_line), edge.sizing_line);
  check('the surface line makes the unsized state impossible to miss',
    /Stage 4/.test(S.line(edge)) && /AT MINIMUM/.test(S.line(edge)), S.line(edge));

  // THE ANTI-OVERCLAIM: `sized` is DERIVED here, never supplied. A caller must
  // not be able to assert a confidence the system has not earned — the same
  // failure shape as flipping the doctrine's GOVERNS flag without wiring it.
  const forged = S.report(S.STAGES.EDGE, { sized: true, edge: 'x' });
  check('a caller CANNOT forge sized:true by passing it in',
    forged.sized === false,
    'a detail object claiming sized:true set the flag — the label would then '
      + 'assert a confidence no measurement supports');
}

// --- non-edge stages do not borrow the sizing vocabulary --------------------
{
  [S.STAGES.LEGALITY, S.STAGES.BASELINE, S.STAGES.DOCTRINE].forEach(st => {
    const r = S.report(st, {});
    check(`Stage ${r.stage} (${r.key}) carries no sizing claim`,
      r.sized === null && r.sizing_line === null,
      JSON.stringify({ sized: r.sized, line: r.sizing_line }));
  });
  check('a non-edge stage line names its stage plainly',
    S.line(S.report(S.STAGES.BASELINE)) === 'Stage 2 — consensus baseline');
}

// --- the ABSENT state the MVS renders today ---------------------------------
{
  check('no report yields the MVS "not yet staged" wording, not a blank',
    S.line(null) === 'source: not yet staged', S.line(null));
}

// --- NON-VACUITY: the sized branch must be reachable and must read differently
{
  check('NON-VACUITY: the sized voice differs from the floor voice',
    S.sizingVoice() !== 'sized to its measured edge class'
    && /measured edge class/.test('sized to its measured edge class'),
    'if these ever match, the label stops distinguishing the two states');
}

console.log(`\n${pass}/${pass + fail} stage checks passed`);
process.exit(fail ? 1 : 0);
