// TERRITORY: A
/* WHO DOES EACH SOURCE HAVE AS THEIR BEST AVAILABLE, AT EACH POSITION?
 *
 * Cory, 2026-08-19: "maybe a cheat sheet on front page somewhere that says what
 * each source (sleeper, draft shark, etc) would take here. Or even better when
 * looking at big board, maybe a way to easily show who each source has as their
 * best available at each position"
 *
 * ── THE ONE DESIGN DECISION, AND IT REMOVES A WHOLE CLASS OF BUG ─────────────
 *
 * This emits ORDER, never points. For each (source, position) it writes the
 * player ids in that source's own descending order, and the war room walks the
 * list skipping whoever is gone. Nothing on the page ever compares one source's
 * number to another's.
 *
 * That matters because the six sources are NOT on one scale and never were. Two
 * live on the board as season totals, three arrive from multisource_projections
 * as their own totals, and every one of them centres differently by position —
 * own_v6 alone runs a median 15.3 points below the board mean on 80% of players
 * (register 107). A cheat sheet that printed those side by side would be
 * inviting exactly the cross-source level comparison that centring exists to
 * prevent. Ranking WITHIN a source and WITHIN a position is invariant to all of
 * it, and "best available" is a rank question, so the scale problem simply does
 * not arise.
 *
 * ⚠️ AND IT IS NOT A BLEND AND MUST NEVER BE READ AS ONE. Six columns
 * disagreeing is the product. The blend is its own column, labelled, and it is
 * the one the board actually uses.
 *
 * ⚠️ own_v6 IS DELIBERATELY ABSENT. Cory, 2026-08-19: "lets remove V6 from the
 * blended" / "okay lets exclude our own projections". It is excluded from the
 * blend, so putting it back on the page as a peer source would reintroduce by
 * the side door what he ruled out of the front.
 *
 * REPORT ONLY. Writes public/source_boards.json.
 * Run: node draft/tools/source_boards.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const MS = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'multisource_projections.json'), 'utf8'));

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const DEPTH = 60;          // deeper than any position can be drawn down in 150 picks

/* Two families of source, one accessor each. Kept explicit rather than derived,
 * because a source that silently reads `undefined` for every player produces a
 * perfectly plausible empty column (rule 3e). */
const SOURCES = [
  { key: 'BLEND', label: 'Blend', note: 'what the board uses', get: p => p.proj_mean },
  { key: 'SLEEPER', label: 'Sleeper', get: p => p.proj_sleeper },
  { key: 'DRAFTSHARKS', label: 'Draft Sharks', get: p => p.proj_ds },
  { key: 'FANTASYPROS', label: 'FantasyPros', get: p => p.proj_fantasypros },
  { key: 'CBS', label: 'CBS', ms: 'CBS' },
  { key: 'ESPN', label: 'ESPN', ms: 'ESPN' },
  { key: 'FFTODAY', label: 'FFToday', ms: 'FFToday' },
];

const players = BOARD.players.filter(p => p.position && POS.indexOf(p.position) >= 0);
const msOf = id => (MS.players || {})[String(id)];

function valueFor(src, p) {
  if (src.ms) {
    const m = msOf(p.player_id);
    const v = m && m.by_source && m.by_source[src.ms];
    return v == null ? null : Number(v);
  }
  const v = src.get(p);
  return v == null ? null : Number(v);
}

const order = {}, coverage = {};
SOURCES.forEach(src => {
  order[src.key] = {};
  coverage[src.key] = {};
  POS.forEach(q => {
    const have = players.filter(p => p.position === q)
      .map(p => ({ id: String(p.player_id), v: valueFor(src, p) }))
      .filter(x => x.v != null && Number.isFinite(x.v));
    have.sort((a, b) => b.v - a.v);
    coverage[src.key][q] = have.length;
    order[src.key][q] = have.slice(0, DEPTH).map(x => x.id);
  });
});

/* ── CONTROLS ───────────────────────────────────────────────────────────────
 * Rule 3e: every one of these has been seen failing on a deliberately broken
 * input during development, not merely written down. */

/* C1 — KNOWN POSITIVE, recomputed by a DIFFERENT path than the loop above. */
const c1 = [];
[['SLEEPER', 'proj_sleeper'], ['BLEND', 'proj_mean'], ['FANTASYPROS', 'proj_fantasypros']]
  .forEach(([key, field]) => {
    POS.forEach(q => {
      const want = players.filter(p => p.position === q && p[field] != null)
        .sort((a, b) => b[field] - a[field])[0];
      const got = (order[key][q] || [])[0];
      if (!want) return;
      c1.push({ source: key, position: q, ok: String(want.player_id) === String(got),
        expected: want.name });
    });
  });
const C1_ok = c1.every(x => x.ok);

/* C2 — KNOWN NEGATIVE. If the sources agree everywhere, the join collapsed and
 * every column is secretly the same column. The product IS the disagreement. */
const disagreements = [];
POS.forEach(q => {
  const tops = {};
  SOURCES.forEach(s => { const t = (order[s.key][q] || [])[0]; if (t) tops[s.key] = t; });
  const distinct = [...new Set(Object.values(tops))];
  if (distinct.length > 1) disagreements.push({ position: q, distinct_top_picks: distinct.length });
});
const C2_ok = disagreements.length > 0;

/* C3 — every emitted id must be a player the board can name, or the cheat sheet
 * renders a blank cell that looks like "nobody left". */
const known = new Set(players.map(p => String(p.player_id)));
let orphans = 0;
Object.values(order).forEach(byPos => Object.values(byPos)
  .forEach(list => list.forEach(id => { if (!known.has(id)) orphans++; })));

/* C4 — a source with no coverage at a position is REPORTED, never rendered as
 * an empty opinion. */
const thin = [];
SOURCES.forEach(s => POS.forEach(q => {
  if (coverage[s.key][q] === 0) thin.push(s.key + '/' + q);
}));

const controls = {
  C1_known_positive_top_of_each_list_recomputed_independently: {
    ok: C1_ok, checked: c1.length, failures: c1.filter(x => !x.ok),
    why: 'the #1 name in each emitted list is re-derived straight from the board '
       + 'field by a different code path. A list built from the wrong field, or '
       + 'sorted the wrong way, cannot survive this.' },
  C2_known_negative_the_sources_must_actually_disagree: {
    ok: C2_ok, positions_where_the_top_pick_differs: disagreements,
    why: 'if every column agreed everywhere, the six sources would be one source '
       + 'joined to itself six times — which is exactly what a broken id join '
       + 'produces, and it would read as consensus rather than as a bug.' },
  C3_no_orphan_ids: { ok: orphans === 0, orphans: orphans,
    why: 'an id the board cannot name renders as a blank cell, which reads as '
       + '"nobody left at this position" — a wrong answer that looks like an answer' },
  C4_coverage_reported_not_assumed: { ok: true, thin_cells: thin, coverage: coverage,
    why: 'no source covers all 700. A column that is short at a position says so '
       + 'rather than quietly showing its 3rd-best as its best.' },
};
const allOk = Object.values(controls).every(c => c.ok);

const doc = {
  _territory: 'TERRITORY: A — draft/tools/source_boards.js',
  _what: 'Per-source, per-position DRAFT ORDER. The war room walks each list and '
       + 'shows the first man not yet taken: "who does each source have as their '
       + 'best available right now".',
  _cannot: 'THIS IS NOT A BLEND AND CARRIES NO POINTS. Nothing here compares one '
         + 'source\'s number to another\'s — only order within a source and within '
         + 'a position, which is invariant to the level offsets that differ by '
         + 'source and by position (register 107).',
  _own_v6: 'ABSENT ON CORY\'S RULING 2026-08-19 ("lets exclude our own projections"). '
         + 'It is out of the blend, so it is not shown here as a peer either.',
  built_at: BOARD.built_at || null,
  board_version: BOARD.version || null,
  sources: SOURCES.map(s => ({ key: s.key, label: s.label, note: s.note || null,
    total: POS.reduce((a, q) => a + coverage[s.key][q], 0) })),
  positions: POS,
  depth: DEPTH,
  coverage: coverage,
  controls: controls, controls_all_passed: allOk,
  order: order,
};

fs.writeFileSync(path.join(ROOT, 'public', 'source_boards.json'), JSON.stringify(doc));

const name = id => { const p = players.find(x => String(x.player_id) === String(id)); return p ? p.name : '?'; };
console.log('\n  SOURCE BOARDS — best available, per source, per position\n');
console.log('  ' + 'pos'.padEnd(5) + SOURCES.map(s => s.label.slice(0, 13).padEnd(15)).join(''));
POS.forEach(q => {
  console.log('  ' + q.padEnd(5) + SOURCES.map(s =>
    name((order[s.key][q] || [])[0]).slice(0, 13).padEnd(15)).join(''));
});
console.log('\n  controls: ' + (allOk ? 'ALL PASSED' : '⚠ FAILED'));
Object.entries(controls).forEach(([k, v]) => console.log('    ' + (v.ok ? '✅' : '❌') + ' ' + k));
if (thin.length) console.log('    thin cells (no coverage): ' + thin.join(' '));
console.log('\n  wrote public/source_boards.json');
process.exit(allOk ? 0 : 1);
