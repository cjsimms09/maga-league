// TERRITORY: B
/* REGISTER 220/237 (E, 2026-08-21, re-measured and reproduced by B against
 * live code, same day) — "THE BIG BOARD TAB SHOWS THE BLEND UNDER ALL NINE
 * SOURCES, WHILE ITS CAPTION CHANGES PER SOURCE AND CLAIMS OTHERWISE."
 *
 * renderColumns() (warroom_charts.js) read WarRoomData.board() -- always
 * state.board, the raw blend -- while renderBoard()'s flat "Overall ranking"
 * table on the SAME tab already followed state.rankSource via
 * sourceAdjustedBoard(). #board-ordering-note repainted a true sentence
 * ("Ordered by Sleeper's OWN published ranking...") describing a list that
 * never moved. Confirmed live: CBS top RB by the columns was Gibbs/Robinson
 * (the blend order) while CBS's own numbers reverse the top two
 * (Robinson 355, Gibbs 353).
 *
 * FIX, REUSE NOT REIMPLEMENTATION (Rule 11): WarRoomData now also exposes
 * sourceAdjustedBoard() -- the SAME function renderBoard() already calls --
 * and renderColumns() reads that instead. boardAtPos()'s existing sort on
 * p.proj_mean needed no change, because proj_mean IS the field the source
 * swap overwrites.
 *
 * Run: node draft/tests/big_board_columns_follow_source.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const CHARTS = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'warroom_charts.js'), 'utf8');

// ── 1. WarRoomData exposes the SAME sourceAdjustedBoard() renderBoard() uses ──
{
  const wrdStart = APP.indexOf('window.WarRoomData = {');
  const wrdEnd = APP.indexOf('\n  };', wrdStart);
  const wrd = APP.slice(wrdStart, wrdEnd > wrdStart ? wrdEnd : wrdStart + 4000);
  ck('CONTROL — window.WarRoomData is findable in app.js at all', wrdStart >= 0);
  ck('WarRoomData.sourceAdjustedBoard exists and calls the real function '
     + '(not a second derivation)',
    /sourceAdjustedBoard:\s*function\s*\(\)\s*\{[\s\S]{0,80}return sourceAdjustedBoard\(\)/.test(wrd));
  ck('...and it degrades to the raw board on error, never a throw that '
     + 'takes the columns down',
    /catch \(e\) \{ return state\.board \|\| \[\]; \}/.test(wrd));
  ck('the plain board() accessor is UNCHANGED — other WarRoomData consumers '
     + 'that legitimately want the raw blend must not be affected',
    /board: function \(\) \{ return state\.board \|\| \[\]; \}/.test(wrd));
}

// ── 2. renderColumns() reads the source-adjusted board, not the raw one ──────
{
  const rcStart = CHARTS.indexOf('function renderColumns()');
  const rcEnd = CHARTS.indexOf('\n  }', rcStart);
  const rc = CHARTS.slice(rcStart, rcEnd > rcStart ? rcEnd : rcStart + 2000);
  ck('CONTROL — renderColumns() is findable in warroom_charts.js at all', rcStart >= 0);
  ck('renderColumns() calls d.sourceAdjustedBoard(), not the bare d.board()',
    /d\.sourceAdjustedBoard\(\)/.test(rc));
  ck('...with a defensive fallback to d.board() if the accessor is ever '
     + 'missing (older cached app.js), so this file degrades rather than throws',
    /typeof d\.sourceAdjustedBoard === 'function'/.test(rc)
      && /: d\.board\(\)/.test(rc));
  ck('the bare, unguarded `d.board()` call this defect used to be is gone',
    !/var board = d\.board\(\);/.test(rc));
}

console.log(`\n${pass}/${pass + fail} big-board-columns-follow-source checks passed`);
if (fail) process.exit(1);
