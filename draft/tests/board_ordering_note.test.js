/* Cory, 2026-08-21, on the Big Board tab: "Where do that info come from does
 * it change based on source selected? Also can we get a view or tab of big
 * board that says overall ranking (all players) of that source, not just by
 * position?"
 *
 * Both answers were already TRUE — state.bigBoardOrdering was computed and
 * the "Overall ranking" view already existed as the "Full table" disclosure
 * — but neither was said out loud anywhere on screen, which is why he had no
 * way to know either was already there. This pins the two fixes:
 *
 *   1. #board-ordering-note on the Big Board tab prints which of the three
 *      ordering bases is active (blend / Sleeper's own rank / our math on a
 *      source's projections) every time renderBoard() runs.
 *   2. The "Full table" disclosure is relabeled "Overall ranking" so the
 *      view he asked for is findable by name.
 *
 * Run: node draft/tests/board_ordering_note.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let fails = [];
let ran = 0;
function ck(name, cond, detail) {
  ran += 1;
  if (cond) console.log('PASS  ' + name);
  else {
    fails.push(name);
    console.log('FAIL  ' + name
      + (detail === undefined ? '' : '  — ' + JSON.stringify(detail).slice(0, 320)));
  }
}

const EJS = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'css', 'warroom.css'), 'utf8');

/* ── 1. THE MOUNT POINT EXISTS, ON THE BIG BOARD TAB, ABOVE THE COLUMNS ────*/
const boardTabStart = EJS.indexOf('id="wr-tab-board"');
const boardTabEnd = EJS.indexOf('</section>', boardTabStart);
const boardTabSrc = EJS.slice(boardTabStart, boardTabEnd > boardTabStart ? boardTabEnd : boardTabStart + 6000);

ck('CONTROL — the Big Board tab panel is findable in warroom.ejs at all',
  boardTabStart !== -1, null);

ck('#board-ordering-note exists inside the Big Board tab (not some other tab)',
  /id="board-ordering-note"/.test(boardTabSrc), null);

ck('...and it sits above #wr-board-columns, so the ordering basis is read '
   + 'before the ranked columns rather than after',
  boardTabSrc.indexOf('id="board-ordering-note"') < boardTabSrc.indexOf('id="wr-board-columns"'),
  null);

/* ── 2. THE "OVERALL RANKING" VIEW HE ASKED FOR IS NAMED THAT ──────────────*/
ck('the "Full table" disclosure is relabeled to say "Overall ranking" — the '
   + 'exact view already existed (#wr-fulltable, all positions, one list) but '
   + 'its old summary text never said so',
  /<summary[^>]*>Overall ranking\b/.test(boardTabSrc), null);

ck('...and it is still the same #wr-fulltable element, not a new duplicate '
   + 'view (Rule 11 — reuse, do not re-derive)',
  /id="wr-fulltable"[\s\S]{0,200}Overall ranking/.test(boardTabSrc), null);

/* ── 3. renderBoard() POPULATES THE NOTE FOR ALL THREE ORDERING BASES ──────*/
const rbStart = APP.indexOf('function renderBoard()');
const rbEnd = APP.indexOf('\n  function ', rbStart + 10);
const renderBoardSrc = APP.slice(rbStart, rbEnd > rbStart ? rbEnd : rbStart + 8000);

ck('CONTROL — renderBoard() is findable in app.js at all',
  rbStart !== -1, null);

/* ⚠️ THIS ARM PINNED THE ACCESSOR SPELLING, NOT THE PROPERTY (fixed 08-21).
 * It required the literal `getElementById('board-ordering-note')` and went red
 * when the lookup moved to `$('#board-ordering-note')` — a change that was NOT
 * cosmetic and must not be reverted: `ui_fidelity_numbers.test.js` eval-lifts
 * renderBoard with an injected `$` stub and NO `document`, so the raw
 * `document.` call threw ReferenceError and took that whole suite down
 * (app.js:6980 records it). `$` is `document.querySelector` (app.js:11), so the
 * two spellings are the same operation on an id.
 *
 * The property this file is FOR is "the note is looked up AND actually written",
 * so it is now asserted as both halves rather than as one string match. That is
 * strictly stronger than what it replaced: the old regex passed on a lookup
 * whose result was never assigned to. */
{
  const lookedUp = /getElementById\('board-ordering-note'\)/.test(renderBoardSrc)
    || /\$\('#board-ordering-note'\)/.test(renderBoardSrc);
  ck('renderBoard() looks up #board-ordering-note (either accessor — `$` and '
     + 'getElementById are the same call on an id)', lookedUp, null);
  ck('...and actually WRITES to it, which is the half the old accessor-string '
     + 'regex could not tell apart from a lookup whose result is dropped',
    /\bnote\.(textContent|innerHTML)\s*=/.test(renderBoardSrc), null);
}

ck('...covers the BLEND branch by name — the default state, previously the '
   + 'one Cory had zero way to identify since no source is "selected" then',
  /bigBoardOrdering === 'blend'/.test(renderBoardSrc)
    && /the Blend/.test(renderBoardSrc), null);

ck('...covers the PURE branch — Sleeper is named explicitly as their OWN '
   + 'published board, not ours',
  /bigBoardOrdering === 'pure'/.test(renderBoardSrc)
    && /Sleeper.{0,3}s OWN published/.test(renderBoardSrc), null);

ck('...covers the DERIVED branch (every other source) and says outright that '
   + 'it is OUR math on THEIR numbers, not a board that source published',
  /SourceBoard\.SOURCES\.find/.test(renderBoardSrc)
    && /does not publish their own overall board/.test(renderBoardSrc), null);

/* ── 4. THE NOTE IS STYLED, NOT UNSTYLED TEXT DUMPED IN THE BAR ────────────*/
ck('.wr-board-ordering has a CSS rule (warroom.css) rather than relying on '
   + '.muted alone for spacing',
  /\.wr-board-ordering\s*\{/.test(CSS), null);

/* `ran`, NOT a literal. This line printed a hardcoded 10 while the file held 12
 * checks — a total that cannot drift is a total that stops being a fact, and it
 * had already stopped being one. Counted now. */
console.log('\n%d checks, %d failed', ran, fails.length);
if (fails.length) { console.log('FAILED'); process.exit(1); }
