// TERRITORY: B
/* THE REAL RE-RANKING TOGGLE — Cory, live 2026-08-20: "This toggle should
 * just rearrange the board though and also may change vona calc or
 * recommended player." Two prior toggles were display-only; this one
 * genuinely re-ranks by swapping context()'s board/roster through
 * source_board.js before the engine ever sees it. Pins the app.js wiring
 * structurally (source_board.js itself is covered by source_board.test.js,
 * the Python precompute by test_alt_source_rankings.py).
 *
 * Run: node draft/tests/rank_source.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

// ── 1. context() is the single choke point, and it is actually swapped ─────
{
  const i = SRC.indexOf('function context()');
  const j = SRC.indexOf('\n  }', SRC.indexOf('return {', i));
  const body = SRC.slice(i, j);
  ck('context() hands the engine a source-adjusted board, not state.board raw',
    /board:\s*sourceAdjustedBoard\(\)/.test(body), body.slice(0, 400));
  ck('context() hands the engine a source-adjusted roster too (currency consistency)',
    /roster:\s*sourceAdjustedRoster\(\)/.test(body));
}

// ── 2. sourceAdjustedBoard/Roster degrade to state.board/myRoster when SourceBoard is absent ──
{
  const i = SRC.indexOf('function sourceAdjustedBoard()');
  const j = SRC.indexOf('\n  }', i);
  const body = SRC.slice(i, j);
  ck('sourceAdjustedBoard() exists', i >= 0);
  ck('it degrades to state.board when SourceBoard is not loaded (never a hard crash)',
    /typeof SourceBoard === 'undefined'\) return state\.board/.test(body));
  ck('otherwise it calls SourceBoard.forSource with the live state.board and state.rankSource',
    /SourceBoard\.forSource\(state\.board, state\.rankSource\)/.test(body));
}

// ── 3. setRankSource / loadRankSource — persistence + validation ───────────
{
  const i = SRC.indexOf('function setRankSource(');
  const j = SRC.indexOf('\n  }', i);
  const body = SRC.slice(i, j);
  ck('setRankSource() exists', i >= 0);
  ck('it validates against SourceBoard.SOURCES rather than trusting the caller',
    /SourceBoard\.SOURCES\.some/.test(body));
  ck('"blend" clears state.rankSource to null (the trusted default), not the literal string "blend"',
    /state\.rankSource = key === 'blend' \? null/.test(body));
  ck('it persists the choice to localStorage under its own key, not PROJ_SOURCE_KEY',
    /localStorage\.setItem\(RANK_SOURCE_KEY/.test(body));
  ck('choosing "blend" REMOVES the stored key rather than storing the string "blend"',
    /localStorage\.removeItem\(RANK_SOURCE_KEY\)/.test(body));
  ck('it triggers a FULL re-render (renderAll), not a single panel — this changes everything downstream',
    /try \{ renderAll\(\); \}/.test(body));

  ck('RANK_SOURCE_KEY is a distinct localStorage key from PROJ_SOURCE_KEY (the two toggles must never collide)',
    /const RANK_SOURCE_KEY = 'mfga\.draft\.ranksource'/.test(SRC)
    && /const PROJ_SOURCE_KEY = 'mfga\.draft\.projsource'/.test(SRC));

  ck('loadRankSource() is called at init, alongside loadProjSource()',
    /loadProjSource\(\);\s*\n\s*loadRankSource\(\);/.test(SRC));
}

// ── 4. every other scoring surface that read state.board directly was fixed too ─
{
  ck('DraftShadows.project no longer reads state.board raw anywhere in app.js',
    !/DraftShadows\.project\(state\.board/.test(SRC));
  ck('...it reads the source-adjusted board+roster instead, everywhere it is called',
    (SRC.match(/DraftShadows\.project\(sourceAdjustedBoard\(\), context\(\), round, sourceAdjustedRoster\(\)\)/g) || []).length >= 3);
  ck('the Roster Builder panel (mlv.js) reads the source-adjusted board, not state.board raw',
    /RosterBuilderMLV\.recommend\(sourceAdjustedBoard\(\)/.test(SRC));
  ck('...at every call site — no remaining state\\.board-into-RosterBuilderMLV call',
    !/RosterBuilderMLV\.recommend\(state\.board/.test(SRC));
}

// ── 5. the panel itself — always visible, above the recommendation, loud when active ─
{
  const i = SRC.indexOf('function renderRankSourcePanel()');
  const j = SRC.indexOf('\n  function renderModelCompare', i);
  const body = SRC.slice(i, j);
  ck('renderRankSourcePanel() exists', i >= 0);
  ck('it lists Blend plus every SourceBoard.SOURCES entry as a button',
    /BUTTONS = \[\{ key: 'blend'/.test(body) && /concat\(SourceBoard\.SOURCES\)/.test(body));
  ck('each button shows a coverage count (how many players that source actually covers)',
    /SourceBoard\.coverage\(state\.board, s\.key\)/.test(body));
  ck('a LOUD warning renders when a non-blend source is active',
    /rs-warn/.test(body) && /VONA, tiers and the recommended player/.test(body));
  ck('the warning is absent on blend (the default reads calm, not alarmed)',
    /active !== 'blend'/.test(body));
  ck('every button carries data-rank-source for the click delegate to key off',
    /data-rank-source/.test(body));

  const delegate = SRC.indexOf("closest('[data-rank-source]')");
  ck('the click delegate is wired to setRankSource, distinct from the pbSrc/setProjSource handler beside it',
    delegate >= 0 && /setRankSource\(rankSrc\.getAttribute/.test(SRC.slice(delegate, delegate + 200)));

  ck('renderRankSourcePanel is actually called from the live render cycle',
    /try \{ renderRankSourcePanel\(\); \}/.test(SRC));
}

// ── 6. it is mounted ABOVE the recommendation card, not buried below it ────
{
  const ejs = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
  ck('warroom.ejs has the mount point', /id="rank-source-card"/.test(ejs) && /id="rank-source"/.test(ejs));
  const rankIdx = ejs.indexOf('id="rank-source-card"');
  const recsIdx = ejs.indexOf('id="recs-card"');
  ck('it sits BEFORE #recs-card in the document (and CSS order agrees — see style.css)',
    rankIdx > 0 && recsIdx > 0 && rankIdx < recsIdx);

  const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
  const rsOrder = (css.match(/\.wr-zone1 > #rank-source-card\s*\{\s*order:\s*(\d+)/) || [])[1];
  const recsOrder = (css.match(/\.wr-zone1 > #recs-card\s*\{\s*order:\s*(\d+)/) || [])[1];
  ck('CSS order also places it before #recs-card (order numbers, not just DOM position)',
    rsOrder != null && recsOrder != null && Number(rsOrder) < Number(recsOrder), { rsOrder, recsOrder });
}

// ── 7. the script is actually loaded, before app.js ─────────────────────────
{
  const scripts = fs.readFileSync(path.join(ROOT, 'views', 'admin', '_warroom_scripts.ejs'), 'utf8');
  const sbIdx = scripts.indexOf('src="/js/draft/source_board.js"');
  const appIdx = scripts.indexOf('src="/js/draft/app.js"');
  ck('source_board.js is loaded on the war-room page', sbIdx >= 0);
  ck('...before app.js, which depends on it', sbIdx >= 0 && appIdx > sbIdx);
}

console.log(`\n${pass}/${pass + fail} rank-source checks passed`);
if (fail) process.exit(1);
