// TERRITORY: B
/* THE TOP-N-PER-POSITION LIST, REACTIVE TO THE SOURCE TOGGLE — Cory, direct,
 * 2026-08-21: "No! I want to be able to toggle between sources, I need
 * multiple options for each position... the old list you used to have that
 * list top 5-10 at each position for that source... need more options on
 * Home Screen and I'll toggle source."
 *
 * #rank-source (rank_source.test.js) already re-ranks VONA/tiers/the
 * recommended player through source_board.js; this is the missing piece —
 * the source's OWN top-N per position, changing shape with the same
 * toggle. Pins the app.js wiring; the actual grouping/sorting logic
 * (SourceBoard.topByPosition) is covered by source_board.test.js.
 *
 * Run: node draft/tests/source_top_board.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const EJS = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');

// ── 1. renderAll() actually calls it ────────────────────────────────────────
{
  ck('renderSourceTopBoard() is wired into renderAll(), guarded like every other panel',
    /try \{ renderSourceTopBoard\(\); \} catch \(e\) \{ console\.error\(/.test(APP));
}

// ── 2. the render function itself ───────────────────────────────────────────
{
  const i = APP.indexOf('function renderSourceTopBoard()');
  ck('renderSourceTopBoard() exists', i >= 0);
  const j = APP.indexOf('\n  }', i);
  const body = APP.slice(i, j);

  ck('it degrades to display:none, never a crash, when SourceBoard or the board is missing',
    /typeof SourceBoard === 'undefined' \|\| !state\.board \|\| !state\.board\.length/.test(body)
    && /card\.style\.display = 'none'; return;/.test(body));

  ck('it calls SourceBoard.topByPosition with the LIVE state.board (not sourceAdjustedBoard, '
    + 'which would apply forSource twice) and state.rankSource',
    /SourceBoard\.topByPosition\(state\.board, state\.rankSource/.test(body));

  ck('the active source label is resolved from SourceBoard.SOURCES, not hardcoded, so a source '
    + 'rename or addition needs no change here',
    /SourceBoard\.SOURCES\)\s*\n\s*\.find\(function \(s\) \{ return s\.key === activeKey; \}\)/.test(body));

  ck('every player row carries data-drill, same click-in convention as every other name on the page',
    /data-drill="' \+ esc\(String\(p\.player_id\)\)/.test(body));

  ck('a source that drops a player out of a position entirely still renders a real message, '
    + 'not a blank column',
    /Nobody left/.test(body));

  ck('the note names the ACTIVE source by label, so a reader never has to infer which list they\'re looking at',
    /Showing <b>' \+ esc\(activeLabel\)/.test(body));
}

// ── 3. warroom.ejs — a REAL mount point exists, not a self-mounting fallback ─
{
  ck('#source-top-board-card exists in the view with display:none (content-gated reveal, '
    + 'same convention as #model-compare-card/#source-boards)',
    /<div class="card" id="source-top-board-card" style="display:none">/.test(EJS));
  ck('...and its inner host #source-top-board exists for the render function to fill',
    /<div id="source-top-board"><\/div>/.test(EJS));
  ck('it sits in document order right after #rank-source-card, before #source-boards — '
    + 'the main list beside its own toggle, ahead of the smaller comparison table',
    (function () {
      const rs = EJS.indexOf('id="rank-source-card"');
      const stb = EJS.indexOf('id="source-top-board-card"');
      const sb = EJS.indexOf('id="source-boards"');
      return rs >= 0 && stb >= 0 && sb >= 0 && rs < stb && stb < sb;
    })());
}

// ── 4. style.css — a real CSS order, positioned as the main content ────────
{
  const m = CSS.match(/\.wr-zone1 > #source-top-board-card \{ order: (\d+); \}/);
  ck('#source-top-board-card has an explicit CSS order (an unordered host defaults to 0 and '
    + 'jumps the queue — the exact #seat-plan/#mlv-plan bug class)', !!m, m);

  const rankSrcM = CSS.match(/\.wr-zone1 > #rank-source-card\s*\{ order: (\d+); \}/);
  const sbM = CSS.match(/\.wr-zone1 > #source-boards\s*\{ order: (\d+); \}/);
  ck('...ordered between #rank-source-card (the toggle) and #source-boards (the smaller '
    + 'comparison table) — Cory\'s own words, "need more options on Home Screen"',
    m && rankSrcM && sbM
    && Number(rankSrcM[1]) < Number(m[1]) && Number(m[1]) < Number(sbM[1]),
    { rankSource: rankSrcM && rankSrcM[1], topBoard: m && m[1], sourceBoards: sbM && sbM[1] });

  ck('the six-column grid CSS exists (.stb-grid), so the panel is a real multi-position layout, '
    + 'not a single list',
    /#source-top-board \.stb-grid \{/.test(CSS));
}

{
  /* Cory, 2026-08-21: looking at a DIFFERENT panel (position-boards, further
   * down), he had no way to tell it apart from this one and the Ranking
   * Source toggle above both. This panel's own "switch the toggle above"
   * line named nothing — fixed to name the control explicitly. */
  ck('the panel names the control that changes it — "the toggle above" alone '
     + 'reads as any toggle on the page, not specifically Ranking Source',
    /switch the <b>Ranking Source<\/b>/.test(APP));
}

console.log(`\n${pass}/${pass + fail} source_top_board checks passed`);
if (fail) process.exit(1);
