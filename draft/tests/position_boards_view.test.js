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
        proj_blend: 191, floor_blend: 165, ceiling_blend: 240, bye: 9,
        adp: 20, pct_still_there_next_pick: 10, injury_risk_pct: 15 },
      { player_id: '2', name: 'Beta Back', team: 'BBB', proj: 180, floor: 150, ceiling: 220,
        proj_blend: 176, floor_blend: 148, ceiling_blend: 215,
        adp: 30, pct_still_there_next_pick: 40, injury_risk_pct: 60 },
      { player_id: '3', name: 'Gamma Back', team: 'CCC', proj: 100, floor: 80, ceiling: 130,
        proj_blend: null, floor_blend: null, ceiling_blend: null,
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
    round_dropoffs: [
      { from_pick: 33, to_pick: 48, from_round: 4, to_round: 5,
        pos: { RB: 17, WR: 11, QB: 0, TE: 0, K: 0, DEF: 0 }, steepest: 'RB', flattest: 'QB' },
      { from_pick: 48, to_pick: 53, from_round: 5, to_round: 6,
        pos: { RB: 4, WR: 27, QB: 6, TE: 0, K: 0, DEF: 0 }, steepest: 'WR', flattest: 'TE' },
      { from_pick: 53, to_pick: 68, from_round: 6, to_round: 7,
        pos: { RB: 9, WR: 3, QB: 2, TE: 0, K: 0, DEF: 0 }, steepest: 'RB', flattest: 'TE' },
    ],
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
  const rbSection = html.slice(html.indexOf('pb-pos">RB<'), html.indexOf('pb-pos">WR<'));
  ck('a cliff at the very end of the list does not print a trailing divider with nothing under it',
    !/pb-cliff-row/.test(rbSection));
}

// ── the projection-source toggle (ROUTES-B-TOGGLE.md, A→B 2026-08-19) ────
{
  const d = mkData();
  const htmlDefault = V.renderPositionBoards(d, 33, null, esc);
  ck('with no projSource passed, defaults to Draft Sharks numbers (unchanged behavior)',
    /\b200\b/.test(htmlDefault) && !/\b191\b/.test(htmlDefault));
  const htmlDs = V.renderPositionBoards(d, 33, null, esc, 'ds');
  ck('projSource "ds" prints the Draft Sharks proj (200), not the blend (191)',
    /\b200\b/.test(htmlDs) && !/\b191\b/.test(htmlDs));
  const htmlBlend = V.renderPositionBoards(d, 33, null, esc, 'blend');
  ck('projSource "blend" prints the blend proj (191), not the Draft Sharks one (200) alone',
    /\b191\b/.test(htmlBlend));
  ck('the toggle never re-sorts the list — Alpha still leads under "blend" (200 DS-ranked #1)',
    (function () {
      const rbSection = htmlBlend.slice(htmlBlend.indexOf('pb-pos">RB<'), htmlBlend.indexOf('pb-pos">WR<'));
      const alphaIdx = rbSection.indexOf('Alpha Back');
      const betaIdx = rbSection.indexOf('Beta Back');
      return alphaIdx > -1 && betaIdx > -1 && alphaIdx < betaIdx;
    })());
  ck('a player with no blend number (Gamma) falls back to the Draft Sharks figure under "blend", not a blank',
    /\b100\b/.test(htmlBlend));
  ck('the toggle buttons render, and the active one is marked',
    /data-pb-source="ds"/.test(htmlBlend) && /data-pb-source="blend"/.test(htmlBlend)
    && /class="pb-src-btn pb-src-active" data-pb-source="blend"/.test(htmlBlend)
    && !/class="pb-src-btn pb-src-active" data-pb-source="ds"/.test(htmlBlend));
  ck('...and flips when "ds" is active',
    /class="pb-src-btn pb-src-active" data-pb-source="ds"/.test(htmlDs)
    && !/class="pb-src-btn pb-src-active" data-pb-source="blend"/.test(htmlDs));
}

// ── the horizontal-scroll affordance (six columns are wider than the panel
// at a normal desktop width by design — see .pb-grid's own CSS comment; a
// live screenshot showed K/DEF vanishing off the right edge with no signal
// anything was there. app.js measures real scrollLeft and toggles
// pb-grid-more-left/right on .pb-wrap; this only checks the static markup
// those classes hook into is present, and — the defect an earlier version
// actually shipped — that the hint sits in the toolbar's own space rather
// than overlaid on a column where it would clip real text) ────────────────
{
  const d = mkData();
  const html = V.renderPositionBoards(d, 33, null, esc);
  ck('the toggle and the scroll hint share one toolbar row, not the grid itself',
    /<div class="pb-toolbar">[\s\S]*?pb-src-toggle[\s\S]*?pb-grid-hint[\s\S]*?<\/div>/.test(html));
  ck('the hint text names the action, not just a bare arrow',
    /class="pb-grid-hint" aria-hidden="true">scroll for more/.test(html));
  ck('the hint is OUTSIDE pb-grid-wrap — it must never sit on top of a column\'s own text',
    (function () {
      const wrapIdx = html.indexOf('pb-grid-wrap');
      const hintIdx = html.indexOf('pb-grid-hint');
      return hintIdx > -1 && wrapIdx > -1 && hintIdx < wrapIdx;
    })());
  ck('pb-grid itself is unchanged — still the six-column scroll container the classes attach to',
    /<div class="pb-grid-wrap"><div class="pb-grid">/.test(html));
}

// ── the row restructure: 4 columns, not 6 (measured width fix — six nowrap
// numeric columns did not fit an ~120px table cell budget at any readable
// size; a 3-column subline attempt after that wrapped every row to 3-4 lines
// and broke long names mid-word, verified by actually looking at the
// rendered page, not by eyeballing the code) ────────────────────────────────
{
  const d = mkData();
  const html = V.renderPositionBoards(d, 33, null, esc);
  ck('the table header is down to four scannable columns, floor-ceiling as a Fl–Ce range bar',
    /<div[^>]*>Player<\/div><div[^>]*>Proj<\/div><div[^>]*>Fl–Ce<\/div><div[^>]*>Surv<\/div>/.test(html));
  ck('every header label carries a title with its full name — never a bare ellipsis if it were ever tight',
    /title="Player">Player</.test(html) && /title="Projection">Proj</.test(html)
    && /title="Survival — chance he is still there at your next pick">Surv</.test(html));
  ck('team sits inline beside the name (one line, not a wrapped subline)',
    (function () {
      const rbSection = html.slice(html.indexOf('pb-pos">RB<'), html.indexOf('pb-pos">WR<'));
      return /Alpha Back <span class="pb-team">AAA<\/span>/.test(rbSection);
    })());
  ck('floor–ceiling renders as a range bar (SVG), not bare/absent text — never dropped',
    (function () {
      const rbSection = html.slice(html.indexOf('pb-pos">RB<'), html.indexOf('pb-pos">WR<'));
      return /class="pb-range">/.test(rbSection) && /pb-range-band/.test(rbSection)
        && /floor 170 · proj 200 · ceiling 250/.test(rbSection);
    })());
  ck('ADP and bye both move to the name\'s title (one hover away, never dropped) — WAR-ROOM-SPEC.md P1 names both',
    (function () {
      const rbSection = html.slice(html.indexOf('pb-pos">RB<'), html.indexOf('pb-pos">WR<'));
      return /class="pb-name" title="ADP 20 · bye 9"/.test(rbSection);
    })());
  ck('a player with no bye data still shows ADP alone, not a broken "ADP 20 · bye null"',
    (function () {
      const rbSection = html.slice(html.indexOf('pb-pos">RB<'), html.indexOf('pb-pos">WR<'));
      return /class="pb-name" title="ADP 30"/.test(rbSection);
    })());
  ck('the injury risk indicator is a DOT with the exact percentage on hover (Beta Back, 60%) — not a text column',
    /pb-risk-dot pb-risk-hi" title="60% injury risk/.test(html));
  ck('...and the dot renders as a single character, not "⚕67%" text (the earlier badge shape)',
    !/⚕/.test(html));
  ck('a cliff divider renders as its own full-width row, not a table cell (the table is a CSS grid now)',
    /<div class="pb-cliff-row">▽ cliff/.test(html));
}

// ── rangeBarMini / rangeScaleFor — the floor-proj-ceiling range visual ────
{
  const scale = { min: 100, max: 300 };
  ck('a player at the scale minimum renders a band starting at x=0',
    /x="0\.0"/.test(V.rangeBarMini(100, 150, 200, scale, esc)));
  ck('a player at the scale maximum renders a band reaching the svg\'s own full width',
    (function () {
      const svg = V.rangeBarMini(250, 275, 300, scale, esc);
      const svgW = +svg.match(/<svg viewBox="0 0 ([\d.]+)/)[1];
      const rect = svg.match(/<rect[^>]*>/)[0];
      const x = rect.match(/x="([\d.]+)"/);
      const w = rect.match(/width="([\d.]+)"/);
      return x && w && Math.round(+x[1] + +w[1]) === svgW;
    })());
  ck('missing floor/proj/ceiling falls back to the bare number, not a broken bar',
    V.rangeBarMini(null, 150, null, scale, esc) === '150');
  ck('a degenerate scale (min === max) falls back to the bare number rather than dividing by zero',
    V.rangeBarMini(150, 150, 150, { min: 200, max: 200 }, esc) === '150');
  ck('the exact numbers are one hover away, never dropped',
    /title="floor 100 · proj 150 · ceiling 200"/.test(V.rangeBarMini(100, 150, 200, scale, esc)));
  ck('rangeScaleFor is scoped to the position it is given — RB\'s min/max ignores WR-sized numbers',
    (function () {
      const rbPlayers = [{ proj: 200, floor: 170, ceiling: 250 }];
      const s = V.rangeScaleFor(rbPlayers, 'ds');
      return s.min === 170 && s.max === 250;
    })());
  ck('rangeScaleFor returns null for an empty list, not a crash',
    V.rangeScaleFor([], 'ds') === null);
}

// ── the VONA fall-off-by-round mini chart, per column ─────────────────────
{
  const d = mkData();
  const html = V.renderPositionBoards(d, 33, null, esc);
  ck('one round-drop-off chart renders per column (6 total)',
    (html.match(/class="pb-do-mini"/g) || []).length === 6);
  ck('the RB column names its own steepest transition, R4→5 (17 pts), not a cross-position pick',
    (function () {
      const rbSection = html.slice(html.indexOf('pb-pos">RB<'), html.indexOf('pb-pos">WR<'));
      return /R4→5.*17 pts/.test(rbSection.replace(/<[^>]+>/g, ' ')) || /R4→5/.test(rbSection) && /17/.test(rbSection);
    })());
  ck('the WR column names ITS OWN steepest transition, R5→6 (27 pts) — a different round than RB\'s',
    (function () {
      const wrSection = html.slice(html.indexOf('pb-pos">WR<'), html.indexOf('pb-pos">QB<'));
      return /R5→6/.test(wrSection) && /27/.test(wrSection);
    })());
  ck('a position flat across every round (TE, all zero) says so rather than drawing a fake bar',
    (function () {
      const teSection = html.slice(html.indexOf('pb-pos">TE<'), html.indexOf('pb-pos">K<'));
      return /flat across rounds/.test(teSection);
    })());
  ck('each chart is own-scaled: RB\'s bars are NOT scaled against WR\'s larger max (own-scale, not shared)',
    (function () {
      // With a shared 0-27 scale, RB's own max (17) would render at height
      // proportional to 17/27 = 63%. Own-scaled, RB's own max (17) always
      // renders near full height (>= 90% of the chart's own max height).
      const rbChart = V.roundDropoffChart('RB', d.round_dropoffs, esc);
      const heights = [...rbChart.matchAll(/height="([\d.]+)"/g)].map(m => +m[1]).filter(h => h > 1);
      const maxH = Math.max(...heights);
      return maxH >= 27 * 0.85; // chart height 30, minus padding — near-full-height bar for the position's own max
    })());
  ck('the steepest bar for a position is marked hot (pb-do-bar-hot), and only one bar is',
    (function () {
      const rbChart = V.roundDropoffChart('RB', d.round_dropoffs, esc);
      return (rbChart.match(/pb-do-bar-hot/g) || []).length === 1;
    })());
  ck('a missing round_dropoffs argument renders nothing, not a broken chart',
    V.roundDropoffChart('RB', null, esc) === '' && V.roundDropoffChart('RB', [], esc) === '');
  ck('each bar carries an exact-value tooltip via <title>, not a bare shape',
    /<title>/.test(V.roundDropoffChart('RB', d.round_dropoffs, esc)));
  ck('the chart carries an aria-label naming the position and its biggest gap (accessibility)',
    /aria-label="RB round-to-round drop-off, biggest gap R4→5/.test(V.roundDropoffChart('RB', d.round_dropoffs, esc)));
  ck('a round-number tick renders under every bar, one per transition (was bars with no axis at all)',
    (function () {
      const chart = V.roundDropoffChart('RB', d.round_dropoffs, esc);
      return (chart.match(/class="pb-do-tick"/g) || []).length === d.round_dropoffs.length;
    })());
  ck('the ticks name the round each transition ENDS at (to_round), in order — 5, 6, 7 for this fixture',
    (function () {
      const chart = V.roundDropoffChart('RB', d.round_dropoffs, esc);
      const nums = [...chart.matchAll(/pb-do-tick">(\d+)</g)].map(m => m[1]);
      return nums.join(',') === '5,6,7';
    })());
}

// ── the strike bar (WAR-ROOM-SPEC.md P2) — peak VONA pick per position ───
{
  // Deliberately different peaks per position, mirroring strike_page.js's
  // own claim: "TE peaks early, RB in the middle, QB and K at the very end."
  const strikeData = {
    picks: [
      { pick: 33, round: 4, positions: {
        RB: mkBlock({ VONA: 10 }), WR: mkBlock({ VONA: 5 }), QB: mkBlock({ VONA: 1 }),
        TE: mkBlock({ VONA: 21 }), K: mkBlock({ VONA: 0 }), DEF: mkBlock({ VONA: 0 }) } },
      { pick: 48, round: 5, positions: {
        RB: mkBlock({ VONA: 35 }), WR: mkBlock({ VONA: 14 }), QB: mkBlock({ VONA: 2 }),
        TE: mkBlock({ VONA: 3 }), K: mkBlock({ VONA: 0 }), DEF: mkBlock({ VONA: 0 }) } },
      { pick: 133, round: 15, positions: {
        RB: mkBlock({ VONA: 8 }), WR: mkBlock({ VONA: 2 }), QB: mkBlock({ VONA: 6 }),
        TE: mkBlock({ VONA: 0 }), K: mkBlock({ VONA: 14 }), DEF: mkBlock({ VONA: 0, cliff_after_rank: null }) } },
    ],
  };
  const peaks = V.strikePeaks(strikeData);
  ck('TE peaks early (pick 33), matching strike_page.js\'s own stated shape',
    peaks.TE && peaks.TE.pick === 33 && peaks.TE.vona === 21);
  ck('RB peaks in the middle (pick 48)',
    peaks.RB && peaks.RB.pick === 48 && peaks.RB.vona === 35);
  ck('K peaks at the very end (pick 133)',
    peaks.K && peaks.K.pick === 133 && peaks.K.vona === 14);
  ck('a position with VONA 0 everywhere still resolves to its first pick, not null (0 is a real answer)',
    peaks.DEF && peaks.DEF.pick === 33 && peaks.DEF.vona === 0);
  ck('strikePeaks on empty data returns null for every position, not a throw',
    V.strikePeaks({ picks: [] }).RB === null);
  const bar = V.strikeBar(strikeData, esc);
  ck('the strike bar renders one cell per position, six total',
    (bar.match(/pb-strike-cell/g) || []).length === 6);
  ck('TE\'s cell names its peak pick and rounded cost',
    (function () {
      const teCell = bar.slice(bar.indexOf('>TE<'), bar.indexOf('>TE<') + 200);
      return /pick 33/.test(teCell) && /costs 21/.test(teCell);
    })());
  ck('the bar carries a title explaining it is a fact, not a recommendation (P196: never rank across positions)',
    /not a recommendation/.test(bar));
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
    ck('...and proj_blend actually made it into the emitted data (ROUTES-B-TOGGLE.md — the toggle needs both arms present)',
      data.picks[0].positions.RB.players.every(p => p.proj_blend != null));
    const htmlBlendReal = V.renderPositionBoards(data, data.picks[0].pick, null, esc, 'blend');
    ck('...and the real artifact actually renders under "blend" too, not just "ds"',
      htmlBlendReal.length > 2000, { length: htmlBlendReal.length });
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
  ck('app.js wires the projection-source toggle (data-pb-source -> setProjSource, ROUTES-B-TOGGLE.md)',
    /data-pb-source/.test(SRC) && /function setProjSource/.test(SRC) && /state\.projSource/.test(SRC));
  ck('the toggle preference is persisted and reloaded on init, same pattern as the other UI prefs',
    /function loadProjSource/.test(SRC) && /loadProjSource\(\)/.test(SRC));

  const VIEW = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
  ck('warroom.ejs has a mount point for the position boards panel', /position-boards/.test(VIEW));

  const SCRIPTS = fs.readFileSync(path.join(ROOT, 'views', 'admin', '_warroom_scripts.ejs'), 'utf8');
  ck('the module is actually loaded on the war-room page, before app.js',
    SCRIPTS.indexOf('position_boards_view.js') > -1
    && SCRIPTS.indexOf('position_boards_view.js') < SCRIPTS.indexOf('src="/js/draft/app.js"'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
