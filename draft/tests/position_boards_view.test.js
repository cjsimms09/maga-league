/* POSITION BOARDS VIEW — Cory redefined the war room 2026-08-19 (A dispatch,
 * ROUTES.md): six position columns, not one recommendation. This tests the
 * pure render layer: findPick's degrade paths, the live-survival override
 * (per A's explicit "the war room MUST override" instruction), notes staying
 * arithmetic (never a pick), cliff marking, and known-positives against the
 * real committed artifact.
 *
 * Run: node draft/tests/position_boards_view.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const V = require(path.join(ROOT, 'public', 'js', 'draft', 'position_boards_view.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };
const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

// ── fixtures ─────────────────────────────────────────────────────────────
function mkBlock(overrides) {
  return Object.assign({
    VONA: 20, surplus_over_wire: 100, cliff_after_rank: 2, cliff_size: 15,
    note: 'STRIKE — waiting costs 20 and he is +100 over the wire',
    players: [
      { player_id: '1', name: 'Alpha Back', team: 'AAA', proj: 200, floor: 170, ceiling: 250,
        adp: 20, pct_still_there_next_pick: 10, injury_risk_pct: 15 },
      { player_id: '2', name: 'Beta Back', team: 'BBB', proj: 180, floor: 150, ceiling: 220,
        adp: 30, pct_still_there_next_pick: 40, injury_risk_pct: 60 },
      { player_id: '3', name: 'Gamma Back', team: 'CCC', proj: 100, floor: 80, ceiling: 130,
        adp: 90, pct_still_there_next_pick: 85, injury_risk_pct: null },
    ],
  }, overrides);
}
function mkData() {
  return {
    picks: [
      { pick: 33, round: 4, next_pick: 48, positions: {
        RB: mkBlock(), WR: mkBlock({ note: 'wait — plenty left' }),
        QB: mkBlock(), TE: mkBlock(), K: mkBlock(), DEF: mkBlock() } },
      { pick: 48, round: 5, next_pick: 53, positions: {
        RB: mkBlock(), WR: mkBlock(), QB: mkBlock(), TE: mkBlock(), K: mkBlock(), DEF: mkBlock() } },
    ],
    opponents_compact: [{ owner: 'Cory', keeps: '2RB WR', needs: 'QB WR TE K DEF', early_lean: 'league avg only' }],
    round_dropoffs: [{ from_pick: 33, to_pick: 48, pos: { RB: 17, WR: 11, QB: 0, TE: 0, K: 0, DEF: 0 }, steepest: 'RB', flattest: 'QB' }],
    ceiling_steals: [{ name: 'Steal Guy', position: 'WR', adp: 133, proj: 136, ceiling: 228, steal_gap: 15 }],
    _steals_caveat: 'an IF, not a forecast',
  };
}

// ── findPick degrade paths ───────────────────────────────────────────────
{
  const d = mkData();
  ck('exact pick match', V.findPick(d, 33).pick === 33);
  ck('between two picks falls forward to the next one', V.findPick(d, 40).pick === 48);
  ck('past every pick returns null, not a stale entry', V.findPick(d, 999) === null);
  ck('null pickNum falls back to the first entry', V.findPick(d, null).pick === 33);
  ck('empty picks array returns null', V.findPick({ picks: [] }, 33) === null);
  ck('missing picks field returns null, not a throw', V.findPick({}, 33) === null);
}

// ── top-level render degrade paths ───────────────────────────────────────
{
  ck('null data renders nothing', V.renderPositionBoards(null, 33, null, esc) === '');
  ck('data with no picks renders nothing', V.renderPositionBoards({ picks: [] }, 33, null, esc) === '');
  ck('a pick number past every entry renders nothing rather than stale data',
    V.renderPositionBoards(mkData(), 9999, null, esc) === '');
}

// ── the live-survival override, per A's explicit dispatch instruction ───
{
  const d = mkData();
  const html = V.renderPositionBoards(d, 33, null, esc);
  ck('with no live map, the JSON pre-draft number renders with an estimate marker',
    (function () {
      const idx = html.indexOf('10%');
      return idx > -1 && html.slice(idx, idx + 40).indexOf('pb-est') > -1;
    })());
  const live = { '1': 0.73 };
  const htmlLive = V.renderPositionBoards(d, 33, live, esc);
  ck('a live survival entry overrides the JSON number for that player',
    /73%/.test(htmlLive));
  ck('the live cell is NOT marked with the estimate marker',
    (function () {
      const idx = htmlLive.indexOf('73%');
      const nearby = htmlLive.slice(Math.max(0, idx - 300), idx + 50);
      return !/pb-est/.test(nearby);
    })());
  ck('a player absent from the live map still falls back to the JSON estimate, not a blank',
    /40%/.test(htmlLive));
}

// ── notes are printed verbatim and never rewritten toward a pick ────────
{
  const d = mkData();
  const html = V.renderPositionBoards(d, 33, null, esc);
  ck('the RB note prints exactly as the data supplied it', html.includes('STRIKE — waiting costs 20 and he is +100 over the wire'));
  ck('the WR note (a different string) also prints exactly, not templated over', html.includes('wait — plenty left'));
}

// ── cliff marking ─────────────────────────────────────────────────────────
{
  const d = mkData();
  const html = V.renderPositionBoards(d, 33, null, esc);
  ck('a cliff_after_rank inside the list prints a cliff divider row', /pb-cliff-row/.test(html));
  ck('the divider names the cliff size', /cliff.*15 pts|15 pts.*cliff/i.test(html.replace(/<[^>]+>/g, ' ')));
}
{
  // cliff_after_rank at or past the end of the list must not print a
  // dangling divider after the last row.
  const d = mkData();
  d.picks[0].positions.RB = mkBlock({ cliff_after_rank: 3 }); // == players.length, no row after it
  const html = V.renderPositionBoards(d, 33, null, esc);
  const rbSection = html.slice(html.indexOf('>RB<'), html.indexOf('>WR<'));
  ck('a cliff at the very end of the list does not print a trailing divider with nothing under it',
    !/pb-cliff-row/.test(rbSection));
}

// ── six columns, RB/WR first (Cory: "more on RB and WR") ─────────────────
{
  ck('POS_ORDER leads with RB and WR', V.POS_ORDER[0] === 'RB' && V.POS_ORDER[1] === 'WR');
  ck('POS_ORDER carries exactly six positions, all of them', V.POS_ORDER.length === 6
    && ['RB', 'WR', 'QB', 'TE', 'K', 'DEF'].every(p => V.POS_ORDER.indexOf(p) > -1));
  const html = V.renderPositionBoards(mkData(), 33, null, esc);
  ck('all six position headers actually render',
    V.POS_ORDER.every(p => new RegExp('pb-pos">' + p + '<').test(html)));
}

// ── a position with no players degrades to an empty note, not a crash ────
{
  const d = mkData();
  d.picks[0].positions.K = mkBlock({ players: [] });
  const html = V.renderPositionBoards(d, 33, null, esc);
  ck('an empty position list renders a plain "none available" rather than an empty table',
    /pb-empty/.test(html));
}

// ── HTML safety ────────────────────────────────────────────────────────────
{
  const d = mkData();
  d.picks[0].positions.RB.players[0].name = '<script>alert(1)</script>';
  const html = V.renderPositionBoards(d, 33, null, esc);
  ck('a hostile player name is escaped, not injected raw', !/<script>/.test(html) && /&lt;script&gt;/.test(html));
}

// ── the three side panels (opponents / drop-offs / steals) ───────────────
{
  const html = V.renderPositionBoards(mkData(), 33, null, esc);
  ck('opponents_compact renders as a details block naming the owner', /pb-opponents/.test(html) && /Cory/.test(html));
  ck('round_dropoffs renders a table with the steepest position marked', /pb-do-hot/.test(html));
  ck('ceiling_steals renders with its own caveat printed, not silently omitted',
    /pb-steals/.test(html) && /an IF, not a forecast/.test(html));
}
{
  const d = mkData();
  d.opponents_compact = []; d.round_dropoffs = []; d.ceiling_steals = [];
  const html = V.renderPositionBoards(d, 33, null, esc);
  ck('empty side-panel arrays render nothing for that panel rather than an empty shell',
    !/pb-opponents/.test(html) && !/pb-dropoffs/.test(html) && !/pb-steals/.test(html));
}

// ── KNOWN-POSITIVE (rule 3e): the real committed artifact renders for real ──
{
  const BOARD = path.join(ROOT, 'public', 'position_boards.json');
  if (fs.existsSync(BOARD)) {
    const data = JSON.parse(fs.readFileSync(BOARD, 'utf8'));
    const html = V.renderPositionBoards(data, data.picks[0].pick, null, esc);
    ck('KNOWN-POSITIVE — the live artifact renders a non-trivial page for a real pick',
      html.length > 2000, { length: html.length });
    ck('...and player_id actually made it into the emitted data (the field this view needs to override survival)',
      data.picks[0].positions.RB.players.every(p => p.player_id != null));
  } else {
    console.log('SKIP  no committed position_boards.json');
  }
}

// ── wiring: app.js actually calls this and fetches the artifact ─────────
{
  const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('app.js fetches /position_boards.json', /position_boards\.json/.test(SRC));
  ck('app.js calls PositionBoardsView.renderPositionBoards', /PositionBoardsView\.renderPositionBoards/.test(SRC));
  ck('app.js computes a live survival map via DraftSurvival before rendering (the override, not just the fetch)',
    /conservedSurvival/.test(SRC));

  const VIEW = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
  ck('warroom.ejs has a mount point for the position boards panel', /position-boards/.test(VIEW));

  const SCRIPTS = fs.readFileSync(path.join(ROOT, 'views', 'admin', '_warroom_scripts.ejs'), 'utf8');
  ck('the module is actually loaded on the war-room page, before app.js',
    SCRIPTS.indexOf('position_boards_view.js') > -1
    && SCRIPTS.indexOf('position_boards_view.js') < SCRIPTS.indexOf('src="/js/draft/app.js"'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
