// TERRITORY: A
/* CORY, 2026-08-21: "we need to fix wire logic! should we use last few years of
 * draft to determine how many at each position are rostered/drafted then use
 * that to compare waiver wire" — then, immediately: "it should also change with
 * each source probably?"
 *
 * Both halves are now shipped, and this file is why they stay shipped.
 *
 * ── THE FAILURE THIS GUARDS ──────────────────────────────────────────────────
 *
 * A chip that LOOKS live and is inert. This exact shape has now cost the project
 * three times in one week: `CFG.VONA_WIRE_BENCH` read as enabled for days while
 * `vona()` returned before reaching the branch; VONA itself was frozen to Draft
 * Sharks under a toggle that re-sorted everything around it; and this chip — the
 * "+N wire" — sat beside a VONA chip advertising "Follows the Ranking Source
 * toggle" while doing the opposite, for long enough that we shipped a LABEL
 * admitting it rather than a fix.
 *
 * Nothing that existed before this file could see it. `position_boards_view`'s
 * own suite renders one fixture block and checks the markup; the fixture carried
 * a single scalar `surplus_over_wire: 100`, so a view reading one frozen number
 * and a view reading eight per-source numbers are INDISTINGUISHABLE to it.
 * Measured, not assumed — see the CONTROL block below, which asserts that this
 * file goes red on the pre-fix behaviour it is meant to catch.
 *
 * ── WHY THE ASSERTIONS ARE SHAPED THE WAY THEY ARE ───────────────────────────
 *
 * Rule 3e: every check below has a way to FAIL that is not "the artifact is
 * empty". The two that matter most are the SPREAD checks — a frozen baseline
 * and a per-source baseline both produce a full object of numbers, and only the
 * spread tells them apart. An artifact where all eight sources agree to the
 * decimal is the regression, and it would sail past any not-null check.
 *
 * Thresholds are set against MEASURED spreads on the 2026-08-21 board (RB
 * ranges 87.9-118.7 across sources, WR 91.5-139.0) and deliberately sit well
 * under them, because the board rebuilds nightly and this must pin the
 * BEHAVIOUR, not tonight's numbers.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

/* ── 1. THE DERIVED BASELINE ITSELF ───────────────────────────────────────── */

const WBP = path.join(ROOT, 'draft', 'data', 'waiver_baseline.json');
ck('the derived waiver baseline artifact exists — without it every chip below '
  + 'silently falls back to the frozen 2026 literal',
  fs.existsSync(WBP), { path: 'draft/data/waiver_baseline.json' });

const WB = fs.existsSync(WBP) ? JSON.parse(fs.readFileSync(WBP, 'utf8')) : null;

if (WB) {
  ck('CONTROL: the baseline\'s own controls passed, so the numbers below are '
    + 'ones the tool was willing to write rather than ones it warned about',
    WB.controls_all_passed === true, { failures: WB.control_failures });

  /* Cory's FIRST sentence, literally: the count comes from real drafts. */
  ck('the COUNT comes from this league\'s own completed seasons, more than one '
    + '— a baseline from a single draft is that draft, not a league behaviour',
    (WB.seasons_used || []).length >= 2, { seasons: WB.seasons_used });

  ck('both counts are published — ROSTERED (what the baseline uses) and DRAFTED '
    + '(what it is compared against); they differ, so which one is used is a '
    + 'real choice and must stay visible',
    POS.every(q => WB.rostered_count[q] > 0 && WB.drafted_count[q] > 0)
      && POS.some(q => WB.rostered_count[q] !== WB.drafted_count[q]),
    { rostered: WB.rostered_count, drafted: WB.drafted_count });

  /* ⚠️ THE ONE THAT CATCHES A FROZEN BASELINE WEARING EIGHT NAMES. */
  const spreads = {};
  POS.forEach(q => {
    const vals = Object.keys(WB.baseline)
      .map(k => WB.baseline[k][q]).filter(v => v != null);
    spreads[q] = vals.length < 2 ? 0
      : +(Math.max.apply(null, vals) - Math.min.apply(null, vals)).toFixed(1);
  });
  ck('DIFFERENT SOURCES PRICE THE WIRE DIFFERENTLY — if every source returned '
    + 'the same baseline the per-source plumbing would be decoration. Measured '
    + '08-21: RB 87.9-118.7, WR 91.5-139.0',
    spreads.RB > 5 && spreads.WR > 5, { spreads });

  ck('a source that does not price deep enough at a position emits NULL rather '
    + 'than a guess — Cory\'s own rule for VONA, applied here',
    Object.keys(WB.baseline).some(k => POS.some(q => WB.baseline[k][q] == null)),
    { nulls: Object.keys(WB.baseline).map(k => k + ':'
        + POS.filter(q => WB.baseline[k][q] == null).join('/')).filter(s => s.indexOf(':') < s.length - 1) });

  /* SANITY, and it has a real way to fail: the wire man must be worth LESS than
   * the best player at his position. If he outscored the field the ranking is
   * inverted and every surplus on the page is negative-turned-zero. */
  const board = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const all = board.players.concat(board.kept_players || []);
  const inverted = POS.filter(q => {
    const best = Math.max.apply(null, all.filter(p => p.position === q && p.proj_mean != null)
      .map(p => p.proj_mean).concat([-Infinity]));
    return WB.baseline.blend[q] != null && WB.baseline.blend[q] >= best;
  });
  ck('the man on the wire scores BELOW the best player at his position, at '
    + 'every position — an inverted ranking would zero every surplus on the page',
    inverted.length === 0, { inverted });
}

/* ── 2. THE ARTIFACT THE WAR ROOM ACTUALLY READS ──────────────────────────── */

const PB = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'position_boards.json'), 'utf8'));

ck('position_boards.json says WHERE its wire number came from, travelling with '
  + 'the number instead of living only in a tool nobody opens',
  PB.waiver_baseline_meta && PB.waiver_baseline_meta.derived === true,
  { meta: PB.waiver_baseline_meta });

const blocks = [];
(PB.picks || []).forEach(r => POS.forEach(q => {
  if (r.positions && r.positions[q]) blocks.push({ pick: r.pick, pos: q, b: r.positions[q] });
}));

ck('CONTROL: there are position blocks to check — an empty artifact would make '
  + 'every assertion below vacuously true',
  blocks.length >= 30, { blocks: blocks.length });

ck('every position block carries a PER-SOURCE surplus, not one frozen scalar',
  blocks.every(x => x.b.surplus_over_wire_by_source
    && typeof x.b.surplus_over_wire_by_source === 'object'),
  { missing: blocks.filter(x => !x.b.surplus_over_wire_by_source).slice(0, 3) });

/* THE INERTNESS DETECTOR, on the artifact rather than the baseline: if the
 * plumbing were wired to one source and copied eight times, every block would
 * report eight identical numbers. */
const movingBlocks = blocks.filter(x => {
  const v = Object.keys(x.b.surplus_over_wire_by_source)
    .map(k => x.b.surplus_over_wire_by_source[k]).filter(n => n != null);
  return v.length >= 2 && (Math.max.apply(null, v) - Math.min.apply(null, v)) > 1;
});
ck('the surplus MOVES between sources on most blocks — the same check that '
  + 'caught VONA frozen to Draft Sharks under a live-looking toggle',
  movingBlocks.length >= blocks.length * 0.5,
  { moving: movingBlocks.length, of: blocks.length });

/* NUMERATOR AND DENOMINATOR FROM ONE SOURCE. This is the actual defect: the old
 * chip took a Draft Sharks projection and subtracted a frozen literal. */
const badArith = [];
blocks.forEach(x => {
  const b = x.b;
  Object.keys(b.surplus_over_wire_by_source || {}).forEach(k => {
    const s = b.surplus_over_wire_by_source[k];
    if (s == null) return;
    const now = (b.best_now_by_source || {})[k];
    const wire = (b.waiver_by_source || {})[k];
    if (now == null || wire == null) { badArith.push([x.pick, x.pos, k, 'unpublished inputs']); return; }
    const want = Math.max(0, now - wire);
    if (Math.abs(want - s) > 0.15) badArith.push([x.pick, x.pos, k, now, wire, s, +want.toFixed(1)]);
  });
});
ck('every published surplus EQUALS that source\'s own best-available minus that '
  + 'source\'s own wire — both halves from one source, which the old chip never '
  + 'guaranteed and could not be checked before this',
  badArith.length === 0, { n: badArith.length, first: badArith.slice(0, 3) });

/* THE NOTE QUOTES THE CHIPS. "waiting costs 35 and he is +130 over the wire" is
 * the same two numbers rendered above it; a note left on Draft Sharks while the
 * chips follow the toggle is a LOUDER disagreement than the one we just fixed. */
ck('the arithmetic NOTE is per-source too, so it cannot describe a different '
  + 'source than the two chips it is quoting',
  blocks.every(x => x.b.note_by_source && typeof x.b.note_by_source === 'object'),
  { missing: blocks.filter(x => !x.b.note_by_source).slice(0, 2).map(x => x.pick + '/' + x.pos) });

const noteMoves = blocks.filter(x => {
  const n = Object.keys(x.b.note_by_source || {}).map(k => x.b.note_by_source[k]);
  return new Set(n.filter(Boolean)).size >= 2;
});
ck('and those notes actually DIFFER between sources on some blocks — identical '
  + 'strings everywhere would mean the per-source note is decoration',
  noteMoves.length >= 5, { differing: noteMoves.length, of: blocks.length });

/* ── 3. THE VIEW READS IT ─────────────────────────────────────────────────── */

const VIEW = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'position_boards_view.js'), 'utf8');

ck('the view reads surplus_over_wire_by_source — the artifact could carry '
  + 'perfect per-source numbers and the page still print the frozen one',
  /surplus_over_wire_by_source/.test(VIEW));

ck('the view no longer claims the chip is FIXED TO DRAFT SHARKS — a stale label '
  + 'on a fixed number is its own defect, and this is the register 5h shape',
  !/FIXED TO DRAFT SHARKS/.test(VIEW));

ck('the view still has a NULL branch for a source with no opinion, rather than '
  + 'falling back to another source\'s number under this source\'s name',
  /pb-surplus pb-vona-none/.test(VIEW));

/* ── 4. THE SECOND VOICE USES THE SAME BASELINE ───────────────────────────── */

global.window = global;
const MLV = require(path.join(ROOT, 'public', 'js', 'draft', 'mlv.js'));

ck('mlv.js no longer carries the frozen RB 78.4 — it was the one position where '
  + 'the legacy literal genuinely diverged (board rank 51 vs a drafted count of '
  + '47 and a rostered count of 44, 18.5 blend points)',
  Math.abs(MLV.WAIVER.RB - 78.4) > 1, { RB: MLV.WAIVER.RB });

if (WB) {
  ck('and what it carries instead IS the derived blend baseline, not a third '
    + 'hand-typed set of numbers — the drift this whole fix exists to end',
    POS.every(q => WB.baseline.blend[q] == null
      || Math.abs(MLV.WAIVER[q] - WB.baseline.blend[q]) < 0.11),
    { mlv: MLV.WAIVER, derived: WB.baseline.blend });
}

/* opts.waiver must be USED, not accepted and ignored — the inert-parameter
 * shape. Priced against a wire of 0 a 300-point player is worth 300; against
 * 250 he is worth 50, and the marginal ordering must move with it. */
const league = { roster_slots: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1, FLEX: 1 } };
const testBoard = [
  { player_id: '1', name: 'Big QB', position: 'QB', proj_mean: 400 },
  { player_id: '2', name: 'Good RB', position: 'RB', proj_mean: 240 },
];
const withHigh = MLV.recommend(testBoard, [], { league: league, topN: 2,
  waiver: { QB: 380, RB: 100, WR: 129, TE: 120, K: 126, DEF: 93 } });
const withLow = MLV.recommend(testBoard, [], { league: league, topN: 2,
  waiver: { QB: 100, RB: 100, WR: 129, TE: 120, K: 126, DEF: 93 } });
ck('CONTROL: both arms returned recommendations, so the comparison below is '
  + 'between two real answers rather than two empty lists',
  withHigh.length === 2 && withLow.length === 2,
  { high: withHigh.length, low: withLow.length });
ck('opts.waiver actually changes the roster-builder\'s answer — a cheap QB wire '
  + 'promotes the QB, an expensive one demotes him. This is the inert-parameter '
  + 'check: `opts.waiver` accepted and ignored would give one answer twice',
  withHigh[0].position === 'RB' && withLow[0].position === 'QB',
  { expensiveWire: withHigh.map(r => r.position), cheapWire: withLow.map(r => r.position) });

/* A HOLE IN ONE SOURCE'S BASELINE MUST NOT BECOME A ZERO. FFToday prices no
 * kickers and Clay no defences — measured on the real artifact, not invented —
 * so this path is live, and a zero baseline makes a kicker pure surplus and
 * hands him a starting slot. */
const holed = MLV.recommend(
  testBoard.concat([{ player_id: '3', name: 'Wire K', position: 'K', proj_mean: 130 }]),
  [], { league: league, topN: 3, waiver: { QB: 100, RB: 100 } });
ck('a MISSING position in the passed baseline falls back to the derived blend '
  + 'figure, never to zero — a zero wire prices a replacement-level kicker as '
  + 'pure surplus, which is the 415-point-QB failure wearing a different hat',
  holed.every(r => !(r.position === 'K' && r.marginal > 20)),
  { rows: holed.map(r => r.position + ':' + r.marginal) });

/* ── 5. THE CONTROL FOR THIS FILE (rule 3f) ───────────────────────────────── */
/* Every check above passes on the shipped tree. That is exactly what a test
 * asserting nothing also does. So: reconstruct the PRE-FIX artifact — one
 * frozen scalar copied to all eight sources against the legacy literal — and
 * confirm this file's own detectors go red on it. If this block ever passes,
 * the detectors above have stopped detecting. */
{
  const LEGACY = { QB: 322.9, RB: 78.4, WR: 124.8, TE: 130.4, K: 128.6, DEF: 100.0 };
  const frozen = blocks.map(x => {
    const by = {}; const wires = {};
    Object.keys(x.b.surplus_over_wire_by_source).forEach(k => {
      by[k] = x.b.surplus_over_wire; wires[k] = LEGACY[x.pos];
    });
    return { pick: x.pick, pos: x.pos, b: { surplus_over_wire_by_source: by, waiver_by_source: wires,
      best_now_by_source: x.b.best_now_by_source } };
  });
  const frozenMoving = frozen.filter(x => {
    const v = Object.keys(x.b.surplus_over_wire_by_source)
      .map(k => x.b.surplus_over_wire_by_source[k]).filter(n => n != null);
    return v.length >= 2 && (Math.max.apply(null, v) - Math.min.apply(null, v)) > 1;
  });
  ck('CONTROL (rule 3f) — the spread detector goes RED on a reconstructed '
    + 'pre-fix artifact (one Draft Sharks number copied to all eight source '
    + 'keys). A detector that passes on the bug it was written for is not a '
    + 'detector',
    frozenMoving.length < blocks.length * 0.5,
    { movingUnderFrozen: frozenMoving.length, of: blocks.length });

  const frozenBad = [];
  frozen.forEach(x => Object.keys(x.b.surplus_over_wire_by_source).forEach(k => {
    const s = x.b.surplus_over_wire_by_source[k];
    const now = (x.b.best_now_by_source || {})[k];
    const wire = x.b.waiver_by_source[k];
    if (s == null || now == null || wire == null) return;
    if (Math.abs(Math.max(0, now - wire) - s) > 0.15) frozenBad.push([x.pick, x.pos, k]);
  }));
  ck('CONTROL (rule 3f) — the one-source arithmetic check ALSO goes red on that '
    + 'same reconstruction, because a Draft Sharks numerator over a frozen '
    + 'denominator does not reconcile under any other source',
    frozenBad.length > 0, { mismatches: frozenBad.length });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
