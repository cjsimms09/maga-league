// TERRITORY: A
/* TWO FUNCTIONS CLAIMED ONE NAME AND THE SOURCE TOGGLE HAS BEEN CALLING THE
 * WRONG ONE. Found 2026-08-20, two days before the draft, by the sweep I told B
 * I would run if theirs did not happen.
 *
 * THE DEFECT, WITH EVERY LINK CHECKED RATHER THAN ASSUMED:
 *
 *   1. `position_boards_view.js:401-402` draws two buttons Cory clicks during
 *      the draft: `data-pb-source="ds"` and `data-pb-source="blend"`.
 *   2. `app.js:12193` delegates that click to `setProjSource(...)`.
 *   3. `app.js` declares `function setProjSource` TWICE — at 1048 and at 5337.
 *      Both sit at brace depth 1, and the file has exactly ONE place where
 *      depth goes 0 -> 1 (line 7), so both are in the same function scope.
 *      The later declaration wins. B's is dead.
 *   4. The comment at app.js:3077 says the second one and its PROJ_SOURCES
 *      array "stay in the file, UNREFERENCED". That is backwards. It is not
 *      unreferenced; it is the only one reachable, and it has silently replaced
 *      the function that comment says won on the merits.
 *
 * WHAT CORY WOULD HAVE SEEN ON SATURDAY, three separate wrong behaviours from
 * one collision:
 *
 *   · B's version relabels the numbers on the position-boards panel and calls
 *     `renderPositionBoardsPanel()`. The live version never calls it, so the
 *     panel he is looking at does not update when he clicks its own toggle.
 *   · B's version only ever changes what is DISPLAYED. The live version, for
 *     any key that is not 'blend', fetches `/board_<key>.json` and calls
 *     `applySourceBoard(d.players, d.league)` — which swaps the whole board and
 *     re-scores VONA. Clicking "Draft Sharks" on a display toggle silently
 *     re-scores the draft.
 *   · They write DIFFERENT localStorage keys — `mfga.draft.projsource`
 *     (app.js:19, what `loadProjSource()` reads on boot) versus
 *     `wr_proj_source` (app.js:5340). So the choice never restores.
 *
 * THE CLASS IS NOT NEW. `main`'s own HEAD commit is "Fix the war room: two
 * modules claimed one global name, board never loaded". This is that, one file
 * inward, and nothing was watching for it.
 *
 * MEASURED BEFORE THIS FILE WAS WRITTEN (Rule 3i — look at the population, do
 * not quote the one value that fits the story): across the three war-room
 * scripts there are 349 top-level function declarations and EXACTLY ONE
 * duplicated name. So this guard is cheap and specific, not a sweeping style
 * rule, and it starts life green on two of the three files.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function ck(what, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + what); }
  else { fail++; console.log('  FAIL ' + what + (detail !== undefined ? '  ->  ' + detail : '')); }
}

/* The war-room scripts, each of which is one IIFE whose top-level declarations
 * share a single scope. Indent is the scope marker: two spaces == the IIFE's
 * own body. */
const FILES = [
  'public/js/draft/app.js',
  'public/js/draft/warroom_charts.js',
  'public/js/draft/position_boards_view.js',
  'public/js/draft/engine.js',
];

function topLevelFunctions(src) {
  const seen = new Map();
  src.split('\n').forEach((line, i) => {
    const m = /^  function ([A-Za-z_$][\w$]*)\s*\(/.exec(line);
    if (!m) return;
    if (!seen.has(m[1])) seen.set(m[1], []);
    seen.get(m[1]).push(i + 1);
  });
  return seen;
}

/* ── THE CONTROL FIRST, BECAUSE A DETECTOR THAT CANNOT FIRE PROVES NOTHING ──
 *
 * Rule 3e/3f. "No duplicates found" and "the scanner is broken" look identical
 * from the outside, and this scanner is a regex over source text — exactly the
 * shape that returns a confident clean answer while matching nothing. So it is
 * run against a case whose answer is known before any real file is trusted. */
{
  const synthetic = [
    '(function () {',
    "  'use strict';",
    '  function alpha() { return 1; }',
    '  function beta() { return 2; }',
    '  function alpha() { return 3; }',   // the planted collision
    '    function beta() { return 4; }',  // NESTED — must NOT count as a dup
    '}());',
  ].join('\n');
  const found = topLevelFunctions(synthetic);
  ck('CONTROL: the scanner catches a planted same-scope collision',
    (found.get('alpha') || []).length === 2, JSON.stringify([...found]));
  ck('CONTROL: and it does NOT flag a nested declaration of the same name',
    (found.get('beta') || []).length === 1, JSON.stringify(found.get('beta')));
}

/* ── AND THE JS SEMANTICS THIS WHOLE FILE RESTS ON ────────────────────────
 * If the later declaration did NOT win, the collision above would be harmless
 * and this suite would be theatre. Asserted rather than remembered. */
{
  const later = (function () {
    /* eslint-disable no-func-assign */
    function f() { return 'FIRST'; }
    function f() { return 'SECOND'; }
    return f();
  }());
  ck('CONTROL: within one scope the LATER function declaration wins',
    later === 'SECOND', later);
}

/* ── THE GUARD ─────────────────────────────────────────────────────────── */
for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { ck(rel + ' exists', false, 'missing'); continue; }
  const src = fs.readFileSync(abs, 'utf8');
  const seen = topLevelFunctions(src);
  const dups = [...seen.entries()].filter(([, at]) => at.length > 1);
  ck(rel + ': no two top-level functions claim one name',
    dups.length === 0,
    dups.length
      ? dups.map(([n, at]) => n + ' @ ' + at.join(' and ')).join('; ')
        + '  — the LATER one wins and the earlier is dead code. Whichever '
        + 'behaviour is wanted, ONE of them has to be renamed or removed; '
        + 'leaving both is a coin flip decided by line order.'
      : undefined);
  //: the scanner must actually be reading something, or a clean pass is vacuous
  ck('  (and it found declarations to check: ' + seen.size + ')', seen.size > 5, seen.size);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
