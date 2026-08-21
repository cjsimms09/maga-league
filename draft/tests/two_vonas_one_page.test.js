// TERRITORY: A
/* VONA FOLLOWS THE SOURCE, OR IT SHOWS NOTHING.
 *
 * CORY, 2026-08-21, ruling this directly: "Vona should change by source? Or
 * can it not because we only have projected points from draft shark? Vona
 * should change for each source in which we have a projected points total. If
 * we don't have projected points then it shouldn't show Vona for that source."
 *
 * ── WHAT THIS FILE USED TO GUARD, AND WHY IT NO LONGER DOES ───────────────
 *
 * E's audit found the symptom: "all VONA is coming from draft shark and
 * doesn't change with changing source." True of the BY-POSITION panel — its
 * VONA was precomputed once from Draft Sharks — and false of the Big Board,
 * whose VONA is computed live and does follow the toggle. Two numbers, two
 * pipelines, one page.
 *
 * The first version of this file pinned the DISCLOSURE: mark the frozen number
 * `DS` and say it does not follow the toggle. That was the right fix for one
 * evening and the wrong fix in general, and Cory said so. The number should
 * move. It now does, so this file pins the BEHAVIOUR instead.
 *
 * ── WHY IT WAS CHEAPER THAN "A REAL TECHNICAL LIMIT" SUGGESTED ────────────
 *
 * The blocker was believed to be the 300-room simulation — re-running it per
 * source before Saturday was called impossible. It never needed re-running:
 * the simulation drains the board by ADP, and ADP comes from our own board,
 * not from any source's projections. Projections enter only when asking "who
 * is the best of the men still available". So the SAME simulated availability
 * is re-priced under each source in one extra pass per room-pick.
 *
 * The second stated blocker — "we only have projected points from Draft
 * Sharks" — had already stopped being true earlier the same day:
 * attach_multisource.py put eight projection columns on the board.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 320) : '')); }
};

const PB = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/position_boards.json'), 'utf8'));
global.window = global;
require(path.join(ROOT, 'public/js/draft/position_boards_view.js'));
const V = global.window.PositionBoardsView;
const esc = x => String(x == null ? '' : x)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SRCS = ['ds', 'sleeper', 'cbs', 'espn', 'fftoday', 'fantasypros', 'clay', 'ownmodel'];
const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const picks = PB.picks || [];
const row = picks.find(r => (r.positions || {}).RB) || picks[0];

// ── 1. THE ARTIFACT CARRIES A VONA PER SOURCE ────────────────────────────
ck('CONTROL: the artifact has picks with positions, so everything below is '
  + 'measuring real cells rather than an empty object',
!!row && Object.keys(row.positions || {}).length >= 4,
{ picks: picks.length, positions: row ? Object.keys(row.positions || {}) : null });

ck('every position cell carries VONA_by_source — the field Cory\'s ruling needs',
POS.every(q => !row.positions[q] || row.positions[q].VONA_by_source),
POS.filter(q => row.positions[q] && !row.positions[q].VONA_by_source));

/* THE RULING, HALF ONE: it must actually DIFFER across sources. A per-source
 * field that holds the same number eight times is the old defect with more
 * keys — exactly the "nine labels over one opinion" shape this repo keeps
 * finding, so the count is asserted, not eyeballed. */
const rbVals = SRCS.map(k => (row.positions.RB.VONA_by_source || {})[k]).filter(v => v != null);
ck('THE RULING: VONA genuinely differs by source — it is not one number '
  + 'wearing eight labels',
new Set(rbVals.map(v => Number(v).toFixed(1))).size >= 4,
{ rb_by_source: SRCS.map(k => k + '=' + (row.positions.RB.VONA_by_source || {})[k]).join(' ') });

/* KNOWN POSITIVE tying new to old: the `ds` arm must reproduce the legacy
 * top-level VONA. If the per-source machinery had a bug, `ds` is the one cell
 * whose right answer we already knew before writing any of it. */
let dsMatches = 0, dsChecked = 0;
picks.forEach(r => POS.forEach(q => {
  const c = (r.positions || {})[q];
  if (!c || c.VONA == null || !c.VONA_by_source) return;
  dsChecked++;
  if (Math.abs(Number(c.VONA_by_source.ds) - Number(c.VONA)) < 0.05) dsMatches++;
}));
ck('KNOWN POSITIVE: the `ds` arm reproduces the legacy Draft Sharks VONA cell '
  + 'for cell — the one answer we already knew, so the new path is anchored '
  + 'to the old one rather than merely self-consistent',
dsChecked >= 20 && dsMatches === dsChecked, { matched: dsMatches, of: dsChecked });

// ── 2. THE RULING, HALF TWO: NO PROJECTIONS -> NO VONA ───────────────────
/* TWO legitimate reasons a cell is null, and they are exhaustive:
 *   · the source does not price enough available men there (Cory's rule), or
 *   · it is his LAST pick, so there is no next pick to wait for and VONA is
 *     undefined by definition — the legacy top-level VONA is null there too.
 * The first version of this arm allowed only the first reason and went red on
 * the 41 last-pick cells. That was the TEST being wrong, not the tool: the
 * classification below was run before changing anything and returned ZERO
 * unexplained cells, which is why the assertion is now "nothing outside these
 * two" rather than a loosened threshold. */
let nulls = 0, explained = 0, unexplained = [];
picks.forEach(r => POS.forEach(q => {
  const c = (r.positions || {})[q];
  if (!c || !c.VONA_by_source) return;
  SRCS.forEach(k => {
    if (c.VONA_by_source[k] != null) return;
    nulls++;
    const noCoverage = !((c.covered_by_source || {})[k] > 2);
    const noNextPick = r.next_pick == null;
    if (noCoverage || noNextPick) explained++;
    else unexplained.push('pick ' + r.pick + ' ' + q + ' ' + k);
  });
}));
ck('CONTROL: there ARE uncovered (position, source) cells on this board, so '
  + 'the rule below is exercised rather than vacuously satisfied',
nulls > 0, { null_cells: nulls });

ck('THE RULING: every missing VONA is explained — the source prices too few '
  + 'available men, or it is his last pick and waiting is not a choice. Never '
  + 'a silent fallback to another source, and never an unexplained hole',
unexplained.length === 0,
{ nulls: nulls, explained: explained, unexplained: unexplained.slice(0, 6) });

// ── 3. IT REACHES THE SCREEN ─────────────────────────────────────────────
const render = k => V.renderPositionBoards(PB, row.pick, {}, esc,
  (k === 'ds' ? 'ds' : 'blend'), {}, {}, new Set(), k);
const chipsOf = html => [...html.matchAll(/VONA <b>([^<]*)<\/b>\s*<span class="pb-vona-src">([^<]*)<\/span>/g)]
  .map(m => m[1] + '/' + m[2]);

const perSource = {};
SRCS.forEach(k => { perSource[k] = chipsOf(render(k)).join(' '); });
ck('CONTROL: the panel actually renders VONA chips, so the comparison below '
  + 'is over real markup',
chipsOf(render('ds')).length >= 4, { chips: chipsOf(render('ds')) });

ck('ON SCREEN: the rendered chips change when the source changes — this is '
  + 'the thing E measured as frozen',
new Set(Object.values(perSource)).size >= 4,
{ ds: perSource.ds, sleeper: perSource.sleeper, espn: perSource.espn });

ck('ON SCREEN: the chip is labelled with the source it was priced on, so a '
  + 'reader can never mistake one source\'s number for another\'s',
/pb-vona-src">SLP</.test(render('sleeper')) && /pb-vona-src">CBS</.test(render('cbs')),
{ sleeper_labelled: /pb-vona-src">SLP</.test(render('sleeper')) });

const clay = render('clay');
ck('ON SCREEN: a source with no projections for a position prints a DASH and '
  + 'says why — not a Draft Sharks number under its name',
/pb-vona-none/.test(clay) && /VONA <b>—<\/b>/.test(clay)
  && /does not publish projected points/.test(clay),
{ dashes: (clay.match(/pb-vona-none/g) || []).length });

/* FAIL ARM: the dash must be reachable ONLY through absent coverage. If every
 * source covered everything, the branch above would never render and would rot
 * untested — so this asserts the two states genuinely coexist on this board. */
ck('FAIL ARM: a well-covered source shows numbers where the uncovered one '
  + 'shows dashes, so the dash is a real signal and not the panel failing',
!/pb-vona-none/.test(render('ds')) && /pb-vona-none/.test(clay),
{ ds_has_dashes: /pb-vona-none/.test(render('ds')) });

/* The Big Board VONA is a different number and still follows the toggle;
 * its own suite proves that. Pointed at here so the two files cannot drift
 * into disagreeing about which number does what. */
ck('the sibling guard for the BIG BOARD VONA still exists',
fs.existsSync(path.join(ROOT, 'draft/tests/source_toggle_moves_vona.test.js')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
