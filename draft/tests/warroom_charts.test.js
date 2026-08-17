// TERRITORY: A
/* WAR-ROOM COCKPIT CHARTS — pure functions, driven with fixtures.
 *
 * The cockpit rebuild (2026-08-17, Cory's order) put four new visual encodings
 * on the decide surface: range bars on shortlist rows, running-out tiles,
 * the tier-cliff line, and survival sparklines — plus the rails/columns row
 * grammars. Every one is a PURE string builder in
 * public/js/draft/warroom_charts.js (data in, SVG/HTML out; no DOM, no state),
 * which is what makes THIS file possible: fixtures in, marks asserted.
 *
 * What is pinned, and why:
 *   · CLIFFS LAND AT THE RIGHT INDICES — a cliff drawn one player early turns
 *     "last man of the tier" into "first man of the next", which inverts the
 *     take-now/wait answer the chart exists to give.
 *   · SURVIVAL RENDERS MONOTONE-DECLINING DATA AS A FALLING LINE — svg y grows
 *     downward, so P falling must mean y rising. An inverted axis would tell
 *     Cory his target gets SAFER as picks pass.
 *   · EMPTY DATA RENDERS AN HONEST EMPTY STATE — never a blank box, never a
 *     fabricated mark (the same doctrine as the board's sentinel ADP dashes).
 *
 * Run: node draft/tests/warroom_charts.test.js
 */
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'warroom_charts.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

// ── 1. RANGE BAR ──────────────────────────────────────────────────────────
{
  const svg = C.rangeBar(100, 180, 300, { min: 50, max: 350, w: 100, h: 12 });
  ck('rangeBar renders an svg with the band and the tick',
    /wr-range-band/.test(svg) && /wr-range-tick/.test(svg));
  ck('and carries the three quantities it encodes (data-f/m/c)',
    /data-f="100"/.test(svg) && /data-m="180"/.test(svg) && /data-c="300"/.test(svg));
  // Geometry: on min=50,max=350,w=100 → x(v) = (v-50)/300*100
  const bx = parseFloat((svg.match(/rect class="wr-range-band" x="([\d.]+)"/) || [])[1]);
  const bw = parseFloat((svg.match(/wr-range-band[^/]*width="([\d.]+)"/) || [])[1]);
  const mx = parseFloat((svg.match(/wr-range-tick" x1="([\d.]+)"/) || [])[1]);
  ck('the band starts at the floor and spans to the ceiling',
    Math.abs(bx - (100 - 50) / 300 * 100) < 0.11 && Math.abs((bx + bw) - (300 - 50) / 300 * 100) < 0.2,
    { bx, bw });
  ck('the tick sits at the projection, INSIDE the band',
    Math.abs(mx - (180 - 50) / 300 * 100) < 0.11 && mx > bx && mx < bx + bw, { mx, bx, bw });
  ck('the leader wears the lead class', /class="wr-range lead"/.test(
    C.rangeBar(100, 180, 300, { min: 50, max: 350, lead: true })));
  ck('EMPTY/INVALID → nothing, never a fabricated bar',
    C.rangeBar(null, 180, 300, { min: 0, max: 400 }) === ''
    && C.rangeBar(100, 180, 300, {}) === ''                       // no scale
    && C.rangeBar(300, 180, 100, { min: 0, max: 400 }) === ''      // ceiling < floor
    && C.rangeBar(100, 180, 300, { min: 5, max: 5 }) === '');      // degenerate scale
}

// ── 2. TIER-CLIFF CHART — cliffs at the right indices ─────────────────────
{
  // tiers: [1,1,1,2,2,3] → tier changes AFTER index 2 and AFTER index 4.
  const rows = [
    { name: 'Alpha One', proj: 320, tier: 1 },
    { name: 'Bravo Two', proj: 300, tier: 1 },
    { name: 'Charlie Three', proj: 290, tier: 1 },
    { name: 'Delta Four', proj: 240, tier: 2 },
    { name: 'Echo Five', proj: 230, tier: 2 },
    { name: 'Foxtrot Six', proj: 180, tier: 3 },
  ];
  const svg = C.tierCliffChart(rows, { pos: 'RB', goneBy: 2 });
  const at = [...svg.matchAll(/data-cliff-at="(\d+)"/g)].map(m => Number(m[1]));
  ck('cliff marks land exactly where the tier changes (after indices 2 and 4)',
    at.length === 2 && at[0] === 2 && at[1] === 4, at);
  ck('the last man of each ending tier is direct-labeled',
    /Three</.test(svg) && /Five</.test(svg));
  ck('the reachable-window shade is present and carries its index',
    /wr-cliff-shade/.test(svg) && /data-gone-by="2"/.test(svg));
  ck('goneBy 0 draws NO shade — an empty window must not paint',
    !/wr-cliff-shade/.test(C.tierCliffChart(rows, { pos: 'RB', goneBy: 0 })));
  ck('the projections drive the line — first point highest (smallest y)', (() => {
    const pts = (svg.match(/polyline class="wr-cliff-line"[^>]*points="([^"]+)"/) || [])[1]
      .split(' ').map(p => parseFloat(p.split(',')[1]));
    // proj is strictly decreasing in the fixture → y strictly increasing.
    return pts.every((y, i) => i === 0 || y > pts[i - 1]);
  })());
  ck('a flat tier list (no changes) draws no cliff',
    ![...C.tierCliffChart([{ name: 'A A', proj: 200, tier: 1 }, { name: 'B B', proj: 190, tier: 1 }],
      { pos: 'TE' }).matchAll(/data-cliff-at/g)].length);
  ck('EMPTY → honest empty state, not a blank svg',
    /wr-chart-empty/.test(C.tierCliffChart([], { pos: 'QB' }))
    && /not enough/.test(C.tierCliffChart([{ name: 'Solo', proj: 100, tier: 1 }], { pos: 'QB' })));
}

// ── 3. SURVIVAL SPARKLINES — declining data draws a falling line ──────────
{
  const rows = [
    { name: 'Jahmyr Gibbs', points: [{ pick: 33, p: 0.9 }, { pick: 48, p: 0.5 }, { pick: 61, p: 0.1 }] },
    { name: 'Puka Nacua', points: [{ pick: 33, p: 0.6 }, { pick: 48, p: 0.3 }, { pick: 61, p: 0.05 }] },
  ];
  const svg = C.survivalSpark(rows);
  const lines = [...svg.matchAll(/polyline class="wr-spark-line[^"]*"[^>]*points="([^"]+)"/g)]
    .map(m => m[1].split(' ').map(p => parseFloat(p.split(',')[1])));
  ck('one line per player', lines.length === 2, lines.length);
  ck('MONOTONE DECLINING survival renders y strictly INCREASING (svg y grows '
    + 'down) — the line falls, never rises',
  lines.every(ys => ys.every((y, i) => i === 0 || y > ys[i - 1])), lines);
  ck('the end-of-line label is the LAST pick\'s probability',
    />10%</.test(svg) && />5%</.test(svg));
  ck('a player about to be gone is marked dying',
    /wr-spark-line dying/.test(svg));
  ck('pick numbers label the columns', /p33</.test(svg) && /p61</.test(svg));
  ck('EMPTY → honest empty state',
    /wr-chart-empty/.test(C.survivalSpark([]))
    && /wr-chart-empty/.test(C.survivalSpark([{ name: 'X', points: [] }])));
}

// ── 4. RUNNING-OUT TILES ──────────────────────────────────────────────────
{
  const html = C.runningOutTiles([
    { position: 'RB', verdict: 'TAKE NOW', costWait: 21, filled: 3, hollow: 5, note: 'biggest drop' },
    { position: 'QB', verdict: 'can wait', costWait: 2, filled: 6, hollow: 2 },
    { position: 'TE', verdict: 'NO SEAT', costWait: 0, filled: 1, hollow: 1 },
  ]);
  ck('TAKE NOW wears the urgent (red) class',
    /wr-tile urgent[^>]*data-pos="RB"/.test(html));
  ck('can-wait wears calm and NO SEAT dims',
    /wr-tile calm[^>]*data-pos="QB"/.test(html) && /wr-tile dead[^>]*data-pos="TE"/.test(html));
  ck('filled squares count the pre-cliff players (3 solid for RB)',
    ((html.match(/data-pos="RB"[\s\S]*?data-pos="QB"/) || [''])[0]
      .match(/<i class="wr-sq"><\/i>/g) || []).length === 3);
  ck('post-cliff players render hollow',
    /<i class="wr-sq hollow"><\/i>/.test(html));
  ck('the wait cost is printed on an urgent tile', /wait −21 pts/.test(html));
  ck('EMPTY → honest empty state', /wr-chart-empty/.test(C.runningOutTiles([])));
}

// ── 5. THE RAILS AND COLUMNS ROW GRAMMARS ─────────────────────────────────
{
  const rails = C.posRails([
    { pos: 'RB', total: 41, rows: [
      { id: '11', name: 'Jahmyr Gibbs', gone: 91, tier: 1 },
      { id: '12', name: 'Kyren Williams', gone: 55, tier: 2 },
      { id: '13', name: 'Deep Bench', gone: 5, tier: 4 },
    ] },
    { pos: 'K', total: 30, collapsed: true, rows: [{ id: '9', name: 'Ka Kicker', gone: null, tier: 8 }] },
  ]);
  ck('every rail row is a drill-down trigger (data-drill)',
    (rails.match(/data-drill="1[123]"/g) || []).length === 3);
  ck('gone-by-next %% is color-coded: ≥70 hot, ≥40 warm, else cool',
    /wr-pr-gone hot[^>]*>91%/.test(rails) && /wr-pr-gone warm[^>]*>55%/.test(rails)
    && /wr-pr-gone cool[^>]*>5%/.test(rails));
  ck('a missing survival number prints an em-dash, never a fake percent',
    /wr-pr-gone"[^>]*>—</.test(rails));
  ck('K/DEF collapse behind a summary', /<details class="wr-posrail collapsed">/.test(rails));
  ck('the header carries the count left', /41 left/.test(rails));
  ck('EMPTY → honest empty state', /wr-chart-empty/.test(C.posRails([])));

  const cols = C.posColumns([
    { pos: 'WR', total: 62, rows: [
      { id: '21', rank: 1, name: 'Ja\'Marr Chase', proj: 310, cliffAfter: false },
      { id: '22', rank: 2, name: 'Puka Nacua', proj: 300, cliffAfter: true },
      { id: '23', rank: 3, name: 'Tier Two Guy', proj: 240, cliffAfter: false },
    ] },
  ]);
  ck('the column header carries position and count', /<b>WR<\/b><span>62 left<\/span>/.test(cols));
  ck('the RED CLIFF LINE is drawn after the marked row and only there',
    /Nacua[\s\S]{0,200}wr-cliffline/.test(cols)
    && (cols.match(/wr-cliffline/g) || []).length === 1);
  ck('column rows are drill-down triggers', /data-drill="22"/.test(cols));
  ck('EMPTY → honest empty state', /wr-chart-empty/.test(C.posColumns([])));
}

// ── 6. ROSTER SHAPE ───────────────────────────────────────────────────────
{
  const html = C.rosterShape([
    { label: 'QB', filled: true, name: 'Jayden Daniels' },
    { label: 'RB 1', filled: true, name: 'Jahmyr Gibbs' },
    { label: 'RB 2', filled: false },
    { label: 'FLEX', filled: false },
  ], 2);
  ck('filled slots carry the player, empty slots stay visibly empty',
    /wr-slot filled[\s\S]{0,120}J\. Daniels/.test(html)
    && (html.match(/<div class="wr-slot">/g) || []).length === 2);
  ck('the caption counts what the draft still owes', /2 starting slots still to fill/.test(html));
  ck('and the bench', /bench 2/.test(html));
  ck('EMPTY → honest empty state', /wr-chart-empty/.test(C.rosterShape([])));
}

// ── 7. PURITY — the builders read nothing but their arguments ─────────────
{
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'warroom_charts.js'), 'utf8');
  /* lastIndexOf: the file's header PROSE also says "COCKPIT CONTROLLER" — the
   * section banner is the last occurrence. The pure half is everything between
   * the PURE CHART BUILDERS banner and that banner. */
  const start = src.lastIndexOf('PURE CHART BUILDERS');
  const end = src.lastIndexOf('COCKPIT CONTROLLER');
  const pureHalf = src.slice(start, end);
  ck('CONTROL — the pure half is locatable and non-trivial',
    start > 0 && end > start && pureHalf.length > 3000, { start, end, len: pureHalf.length });
  ck('no DOM reads in the pure half (document/getElementById)',
    !/document\.|getElementById|querySelector/.test(pureHalf));
  ck('no state reads in the pure half (WarRoomData)',
    !/WarRoomData/.test(pureHalf));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the cockpit\'s marks encode exactly the numbers they');
console.log('are given — cliffs on the right players, survival falling when the data falls,');
console.log('honest empty states everywhere — and the builders stay pure, so this file can');
console.log('keep driving them with fixtures.');
console.log('WHAT IT DOES NOT: judge the DERIVATIONS (which players count as startable,');
console.log('which survival number feeds the spark) — those live in the controller half and');
console.log('are exercised by the browser rehearsals.');
