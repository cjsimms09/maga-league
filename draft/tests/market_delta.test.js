// TERRITORY: B
/* MARKET-DELTA CHIP — A dispatch (ROUTES.md 08-18), third in the set: make
 * the board's disagreement with the room visible at 8s/pick. Zero new
 * ARTIFACT (overall_rank/adjusted_adp are both already on every player
 * object), so what needs pinning is the SIGN (which direction is "up"), the
 * THRESHOLD (a chip on every card is decoration, not signal — register 4b's
 * own lesson), CAPTION DISCIPLINE (never "value" or "steal", A's explicit
 * instruction), and — found live, not anticipated — the SCOPE.
 *
 * THE SCOPE BUG, caught before shipping by actually opening the drawer in a
 * browser rather than trusting the unit tests alone: the first pass compared
 * every position. K/DEF are deliberately demoted ~500 ranks below their raw
 * VORP (register 2b — every K/DEF sits at board 620+ against a market ADP
 * of 116-160, the onesie logic working as designed, not a disagreement), so
 * an unfiltered drawer showed the SAME ten kickers/defenses on every single
 * pick. A second bug rode along: `search_rank`-sourced ADP is a deep-bench
 * fallback rank (verified: Josh Kattus, TE, adp_source search_rank,
 * adjusted_adp 761.6 in a 696-player pool), not a real market read — the
 * FALLING badge already excludes it for exactly this reason. Both are
 * pinned below as regressions, not just as unit behavior.
 *
 * Run: node draft/tests/market_delta.test.js
 */
'use strict';
const M = require('../../public/js/draft/market_delta.js');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };
const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
const wr = (over) => Object.assign({ position: 'WR' }, over); // a default skill-position fixture

// ── delta: sign, missing inputs ─────────────────────────────────────────────
ck('board ranks him BETTER than market (our #10, market ADP 40) -> +30, "up"',
  M.delta(wr({ overall_rank: 10, adjusted_adp: 40 })) === 30);
ck('market likes him more than the board (our #40, market ADP 10) -> -30, "down"',
  M.delta(wr({ overall_rank: 40, adjusted_adp: 10 })) === -30);
ck('exact agreement -> 0, not null (a real measured fact, not a missing one)',
  M.delta(wr({ overall_rank: 20, adjusted_adp: 20 })) === 0);
ck('missing overall_rank -> null, never a guess', M.delta(wr({ adjusted_adp: 40 })) === null);
ck('missing adjusted_adp -> null, never a guess', M.delta(wr({ overall_rank: 10 })) === null);
ck('missing player -> null, no throw', M.delta(null) === null);
ck('rounds to a whole number (fractional adp is common)',
  M.delta(wr({ overall_rank: 10, adjusted_adp: 39.6 })) === 30);
ck('K/DEF excluded — the onesie demotion (register 2b: every K/DEF at board 620+ '
  + 'vs market ADP 116-160) is a design choice, not a disagreement to flag',
  M.delta({ position: 'K', overall_rank: 623, adjusted_adp: 116 }) === null
  && M.delta({ position: 'DEF', overall_rank: 620, adjusted_adp: 122 }) === null);
ck('missing position entirely -> null (conservative: unknown is not "skill")',
  M.delta({ overall_rank: 10, adjusted_adp: 40 }) === null);
ck('search_rank ADP excluded — a deep-bench fallback rank, not a real market read '
  + '(same guard the FALLING badge already uses)',
  M.delta({ position: 'TE', overall_rank: 366, adjusted_adp: 761.6, adp_source: 'search_rank' }) === null);
ck('a real fantasypros-sourced skill player still computes normally',
  M.delta({ position: 'WR', overall_rank: 37, adjusted_adp: 67, adp_source: 'fantasypros' }) === 30);
ck('all four skill positions compute (not just WR)',
  ['QB', 'RB', 'WR', 'TE'].every(pos => M.delta({ position: pos, overall_rank: 10, adjusted_adp: 40 }) === 30));

// ── chipHtml: threshold, direction, caption discipline ──────────────────────
ck('a real 30-spot gap renders the chip with the exact spec wording ("↑30 vs room")',
  /↑30 vs room/.test(M.chipHtml(wr({ overall_rank: 10, adjusted_adp: 40 }), esc)));
ck('the room-favors-him direction renders "↓"',
  /↓30 vs room/.test(M.chipHtml(wr({ overall_rank: 40, adjusted_adp: 10 }), esc)));
ck('below MIN_DELTA (a 4-spot gap) -> no chip — decoration, not signal',
  M.chipHtml(wr({ overall_rank: 10, adjusted_adp: 14 }), esc) === '');
ck('exactly at MIN_DELTA -> chip fires (boundary is inclusive)',
  M.chipHtml(wr({ overall_rank: 10, adjusted_adp: 10 + M.MIN_DELTA }), esc) !== '');
ck('one below MIN_DELTA -> no chip', M.chipHtml(wr({ overall_rank: 10, adjusted_adp: 10 + M.MIN_DELTA - 1 }), esc) === '');
ck('missing fields -> no chip, no throw', M.chipHtml({}, esc) === '' && M.chipHtml(null, esc) === '');
ck('a K clearing the threshold still gets no chip — the scope exclusion applies here too',
  M.chipHtml({ position: 'K', overall_rank: 623, adjusted_adp: 116 }, esc) === '');
ck('CAPTION DISCIPLINE: the chip never says "value" or "steal" (A\'s explicit instruction)',
  !/value|steal/i.test(M.chipHtml(wr({ overall_rank: 10, adjusted_adp: 40 }), esc)));
ck('the title states DISAGREEMENT, not a claim it pays off',
  /disagreement/i.test(M.chipHtml(wr({ overall_rank: 10, adjusted_adp: 40 }), esc))
  && /whether it pays/i.test(M.chipHtml(wr({ overall_rank: 10, adjusted_adp: 40 }), esc)));
ck('the chip carries the up/down class for CSS, matching the arrow',
  /class="wr-market-delta up"/.test(M.chipHtml(wr({ overall_rank: 10, adjusted_adp: 40 }), esc))
  && /class="wr-market-delta down"/.test(M.chipHtml(wr({ overall_rank: 40, adjusted_adp: 10 }), esc)));
ck('hostile name/values are escaped through the passed esc()',
  M.chipHtml(wr({ overall_rank: '<x>', adjusted_adp: 40 }), esc).indexOf('<x>') === -1);

// ── contrarianList: top-N each way over an arbitrary pool ───────────────────
{
  const pool = [
    { name: 'A', position: 'WR', overall_rank: 5, adjusted_adp: 55 },    // +50
    { name: 'B', position: 'RB', overall_rank: 60, adjusted_adp: 10 },   // -50
    { name: 'C', position: 'QB', overall_rank: 20, adjusted_adp: 22 },   // +2, real but tiny
    { name: 'D', position: 'TE', overall_rank: 100, adjusted_adp: 90 }, // -10
    { name: 'E' },                                                       // no fields -> excluded
    { name: 'Kicker', position: 'K', overall_rank: 623, adjusted_adp: 116 },   // scope-excluded
    { name: 'Defense', position: 'DEF', overall_rank: 620, adjusted_adp: 122 }, // scope-excluded
  ];
  const list = M.contrarianList(pool, 2);
  ck('up is sorted descending by delta, capped at n', list.up.length === 2
    && list.up[0].player.name === 'A' && list.up[1].player.name === 'C', list.up);
  ck('down is sorted ascending (most negative first), capped at n', list.down.length === 2
    && list.down[0].player.name === 'B' && list.down[1].player.name === 'D', list.down);
  ck('a player missing both fields is silently excluded, not a NaN row',
    !list.up.concat(list.down).some(e => e.player.name === 'E'));
  ck('K/DEF never appear in either list, even uncapped (the known-positive regression: '
    + 'this drawer used to show the same 10 kickers/defenses on every pick)',
    !M.contrarianList(pool, 10).up.concat(M.contrarianList(pool, 10).down)
      .some(e => e.player.position === 'K' || e.player.position === 'DEF'));
  ck('n defaults to 10 when omitted', M.contrarianList(pool).up.length <= 10);
  ck('empty pool -> empty lists, no throw', M.contrarianList([]).up.length === 0
    && M.contrarianList([]).down.length === 0);
  ck('null pool -> empty lists, no throw', M.contrarianList(null).up.length === 0);
}

// ── drawerHtml: the one-tap disclosure, closed by default ───────────────────
{
  const pool = [
    { name: 'Big Riser', position: 'RB', overall_rank: 5, adjusted_adp: 55 },
    { name: 'Big Faller', position: 'WR', overall_rank: 60, adjusted_adp: 10 },
    { name: 'Some Kicker', position: 'K', overall_rank: 623, adjusted_adp: 116 },
  ];
  const html = M.drawerHtml(pool, esc);
  ck('renders a <details> (closed by default — register 4b: dense-by-default is the fixed complaint)',
    /<details class="wr-contrarian">/.test(html) && !/<details class="wr-contrarian" open/.test(html));
  ck('carries both skill-position names', /Big Riser/.test(html) && /Big Faller/.test(html));
  ck('does NOT carry the kicker — the scope exclusion reaches the rendered drawer, not just the list function',
    !/Some Kicker/.test(html));
  ck('carries both directional deltas with the up/down class', /cd-delta up/.test(html) && /cd-delta down/.test(html));
  ck('empty pool -> empty string, not an empty shell (an honest absence, same rule as the widgets shipped tonight)',
    M.drawerHtml([], esc) === '');
  ck('null pool -> empty string, no throw', M.drawerHtml(null, esc) === '');
  ck('a K-only pool -> empty string too (nothing survives the scope filter)',
    M.drawerHtml([{ name: 'Only Kicker', position: 'K', overall_rank: 623, adjusted_adp: 116 }], esc) === '');
  ck('a pool where nobody clears MIN_DELTA... still lists them (the drawer is top-10 regardless of threshold, unlike the on-card chip)',
    M.drawerHtml([{ name: 'X', position: 'QB', overall_rank: 10, adjusted_adp: 12 }], esc).indexOf('X') >= 0);
}

// ── wiring: app.js actually calls this on the rec-card list and the panel ──
{
  const fs = require('fs');
  const path = require('path');
  const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('app.js calls MarketDelta.chipHtml per row, guarded against the module being absent',
    /MarketDelta\.chipHtml\(p, escapeHtml\)/.test(SRC) && /typeof MarketDelta !== 'undefined'/.test(SRC));
  ck('app.js calls MarketDelta.drawerHtml over state.board (the available pool)',
    /MarketDelta\.drawerHtml\(state\.board, escapeHtml\)/.test(SRC));
  ck('the drawer HTML actually reaches the rendered panel', /contrarianHtml/.test(SRC)
    && /host\.innerHTML = explainPanel\('recommendations'\) \+ head \+ orderNote \+ contrarianHtml/.test(SRC));

  const SCRIPTS = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'admin', '_warroom_scripts.ejs'), 'utf8');
  ck('the module is actually loaded on the war-room page, before app.js',
    SCRIPTS.indexOf('market_delta.js') > -1
    && SCRIPTS.indexOf('market_delta.js') < SCRIPTS.indexOf('src="/js/draft/app.js"'));
}

// ── KNOWN-POSITIVE against the real committed board ──────────────────────────
// Rule 3e: a filter that has never been proven to let ANYTHING through is
// indistinguishable from one that blocks everything. Confirm real skill
// players with real fantasypros ADP clear MIN_DELTA on the live board.
{
  const fs = require('fs');
  const path = require('path');
  let board;
  try {
    board = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8')).players;
  } catch (e) { board = null; }
  if (board) {
    const list = M.contrarianList(board, 10);
    ck('KNOWN-POSITIVE: the live board has real skill-position disagreements clearing MIN_DELTA both ways',
      list.up.length > 0 && list.down.length > 0, { upLen: list.up.length, downLen: list.down.length });
    ck('...and every one of them is a skill position with a real (non-search_rank) ADP source',
      list.up.concat(list.down).every(e =>
        ['QB', 'RB', 'WR', 'TE'].indexOf(e.player.position) >= 0 && e.player.adp_source !== 'search_rank'));
  } else {
    console.log('SKIP  known-positive against the live board — public/draft_data.json not present in this environment');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
