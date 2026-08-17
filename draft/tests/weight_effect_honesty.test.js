// TERRITORY: A
// THE ADJUSTER FEEDBACK MUST NOT REPORT A QUIET TOP 5 AS A QUIET BOARD.
//
// Cory, 2026-08-17: "All of our adjustment bars seemed to have no affect."
// Measured on the live board, that is what the tool TOLD him and it was wrong:
// tier at pick 33 reordered 9 of the top 25 and reported "No change to the top
// 5"; risk at pick 120 reordered 17 and reported the same. In 5 of 12 measured
// cells real movement was reported as nothing.
//
// The bars were never dead. This sentence was — and a man who moves a slider,
// reads "No change", and concludes the adjuster is broken then stops using the
// adjusters, which is the expensive part.
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 240) : '')); }
};

const mk = (names) => names.map((n, i) => ({ player: { name: n }, score: 100 - i }));

// ── a quiet top 5 over a moved board ────────────────────────────────────────
{
  const before = mk(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
  //          top 5 identical, positions 6+ reordered
  const after = mk(['A', 'B', 'C', 'D', 'E', 'J', 'I', 'H', 'G', 'F']);
  const d = E.rankDiff(before, after);
  ck('a quiet top 5 with a moved board is NOT reported as "no change"',
    /reordered below it/.test(d.message), d.message);
  ck('  the deeper movement is COUNTED, not just hinted', d.deepMoved === 4, d);
  ck('  and `changed` is true, so the caller can style it as a real effect',
    d.changed === true, d);
  ck('  the top-5 headline still says what it means', /No change to the top 5/.test(d.message), d.message);
}

// ── the other arm: a genuinely inert change stays inert ─────────────────────
{
  const same = mk(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  const d = E.rankDiff(same, mk(['A', 'B', 'C', 'D', 'E', 'F', 'G']));
  ck('an ACTUALLY inert change still reports no change and no deep count',
    d.deepMoved === 0 && !/reordered below it/.test(d.message), d);
  ck('  and `changed` is false', d.changed === false, d);
}

// ── the headline still wins when the top pick moves ─────────────────────────
{
  const d = E.rankDiff(mk(['A', 'B', 'C', 'D', 'E']), mk(['B', 'A', 'C', 'D', 'E']));
  ck('a changed TOP RECOMMENDATION is still the headline, not buried in a count',
    d.topChanged === true && /Now recommends B over A/.test(d.message), d.message);
}

// ── the depth is a named constant, not a literal ────────────────────────────
{
  ck('the deep window is configurable and matches the rendered candidate depth',
    E.CFG.WEIGHT_DIFF_DEEP === 25, E.CFG.WEIGHT_DIFF_DEEP);
  ck('the headline depth is unchanged — "did my pick move" is still asked first',
    E.CFG.WEIGHT_DIFF_DEPTH === 5, E.CFG.WEIGHT_DIFF_DEPTH);
}

// ── the war-room copy must not state a weight the engine does not ship ──────
{
  const fs = require('fs');
  const ejs = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'admin', 'warroom.ejs'), 'utf8');
  const m = ejs.match(/\['stack', 'Correlation \/ stacking', ([0-9.]+)/);
  ck('the stack slider default equals MEASURED_WEIGHTS.stack',
    m && parseFloat(m[1]) === E.MEASURED_WEIGHTS.stack, m && m[1]);
  ck('and the copy no longer tells Cory it ships at 0.5',
    !/ships at 0\.5/.test(ejs));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
process.exit(fail ? 1 : 0);
