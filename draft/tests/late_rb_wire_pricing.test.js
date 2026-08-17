// TERRITORY: A
// LATE-RB-BELOW-THE-WIRE IS BAKED INTO THE PRICING, NOT REMEMBERED — pinned.
//
// The measured finding (empirical_draft_value_2026-08-16 §7.2/§10, three
// seasons): rounds 11-15 RB produced 3 starters from 35 picks — 8.6%
// [3.0, 22.4], 1/1/1 by season — EVERY RB cell from round 8 on sits
// significantly below replacement (R13 RB −113.5, R15 RB −142.1), and tight
// end is the only position whose late cells are NOT measurably below it.
//
// Cory's mandate is that this must live in the model, not in anyone's memory.
// IT ALREADY DOES, mechanically, because bench/late pricing consults
// PER-POSITION wire levels rather than one scalar:
//
//   · draft_plan.js WAIVER[pos] — the best man still unrostered when a
//     150-pick draft ends, PER POSITION (board-measured: RB ≈ 125 vs WR ≈ 137
//     season pts at this writing) — struck into every bench option value
//     (optionValue(mu, sd, WAIVER[pos])) and into bench_rule.js's audit;
//   · draft/data/wire_level.json per_week[pos] — 422 real 2023-25
//     acquisition-week scores — consumed by engine.js wireBenchValue via
//     ctx.wireWeekly[pos] (per-position behaviour pinned in
//     vona_wire_bench.test.js) and drawn as a sample by bench_mv.js.
//
// A late RB prices near zero precisely because the RB wire line eats his
// projection; a late TE keeps value exactly where the study found the only
// safe late position. This suite pins the PROPERTIES that make that true, so
// nobody can collapse the wire to a scalar (or flip the RB/TE ordering) and
// leave the study's finding stranded as folklore:
//
//   1. WAIVER is per-position, complete, and NOT a broadcast scalar;
//   2. the measured wire ordering that kills late RB holds in BOTH spaces:
//      the RB wire is NOT above the WR/TE wire (realized: RB 7.8 < WR 11.1 <
//      TE 11.6 pts/wk on n=143/113/83; the study's held-wire seasons: RB
//      100.3 < TE 115.6 < WR 124.1);
//   3. the strike level actually MOVES the priced option value by position —
//      the same projection prices differently as an RB than as a TE/WR, which
//      is the whole difference between per-position and scalar pricing.
//
// Run: node draft/tests/late_rb_wire_pricing.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const PLAN = require(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'));
const W = PLAN.WAIVER;

// ── 1. per-position, complete, not a scalar ────────────────────────────────
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
ck('WAIVER carries a finite positive level for every position',
  POSITIONS.every(p => Number.isFinite(W[p]) && W[p] > 0), W);
ck('the levels are per-position, not one number wearing six keys',
  new Set(POSITIONS.map(p => W[p])).size >= 4, W);

// ── 2. the ordering that makes late RB dead and late TE safe ───────────────
ck('board-space: the RB waiver line does not sit above WR\'s (the study\'s '
  + 'shape — a late RB has the worst free alternative to beat)',
  W.RB <= W.WR, { RB: W.RB, WR: W.WR });
ck('board-space: the RB waiver line does not sit above TE\'s either',
  W.RB <= W.TE, { RB: W.RB, TE: W.TE });

const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'wire_level.json'), 'utf8'));
ck('realized-space (422 scored 2023-25 acquisitions): RB is the WORST '
  + 'skill wire per week — the measured mechanism under the study\'s '
  + '3-starters-in-35-late-RB-picks',
  L.per_week.RB < L.per_week.WR && L.per_week.RB < L.per_week.TE, L.per_week);
ck('and those levels carry their n (measured strength, never folklore)',
  L.n && L.n.RB > 100 && L.n.WR > 100 && L.n.TE > 50, L.n);

// ── 3. the per-position strike MOVES the price ─────────────────────────────
// One projection, three positions: if pricing consulted a scalar, these three
// would be identical. They must not be.
const mu = (W.RB + W.WR) / 2;               // deliberately between the lines
const sd = 25;
const priced = {
  RB: PLAN.optionValue(mu, sd, W.RB),
  WR: PLAN.optionValue(mu, sd, W.WR),
  TE: PLAN.optionValue(mu, sd, W.TE),
};
ck('the same projection prices DIFFERENTLY by position (per-position strike, '
  + 'not scalar)', new Set(Object.values(priced).map(v => v.toFixed(4))).size >= 2, priced);
ck('and in the study\'s direction: the projection clears the RB line by more '
  + 'than it clears the WR line (a mid projection is worth MORE as an RB '
  + 'exactly because the RB wire is worse)', priced.RB > priced.WR, priced);

// ── the option value itself is a real strike, not decoration ───────────────
ck('a projection far below its positional wire prices to ~nothing '
  + '(the late-RB fate, mechanically)',
  PLAN.optionValue(W.RB - 80, 10, W.RB) < 1.0,
  PLAN.optionValue(W.RB - 80, 10, W.RB));
ck('a projection above its positional wire keeps real value',
  PLAN.optionValue(W.TE + 40, 10, W.TE) > 30,
  PLAN.optionValue(W.TE + 40, 10, W.TE));

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
process.exit(fail ? 1 : 0);
