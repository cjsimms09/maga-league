// TERRITORY: A
// PRICING A PLAN OVER THE WHOLE DRAFT INSTEAD OF AT ONE PICK.
//
// Cory, on the patch I shipped for the doctrine panel: "We've either got bad
// data or a bad equation … Just making rules to fix a symptom of a deeper
// problem is going to cause more problems later." He was right. Marking a
// deferral stopped the panel making a FALSE STATEMENT; it did not make it
// compute the RIGHT QUANTITY. This file guards the thing that does.
//
//     cost(doctrine) = best(unconstrained) − best(subject to doctrine)
//
// both sides in points of STARTING LINEUP across all twelve picks, both
// two-sided, using the DP `slot_schedule.js` already brute-force verified.
//
// ── THE THREE THINGS THAT COULD SILENTLY MAKE THIS WRONG ──────────────────
//
// 1. A TRANSCRIBED CONSTRAINT TABLE. Hand-copying "what each doctrine forbids"
//    out of doctrine.js is the two-places disease that produced every serious
//    defect here. §3 proves the shapes are PROBED from the live predicates by
//    mutating a predicate and requiring the shape to follow.
//
// 2. A STATE-DEPENDENT CONSTRAINT FLATTENED INTO A FILTER. `early_qb` reads
//    "at live pick 3, if you have no quarterback, take one". Filtering pick 3
//    to QB-only would forbid the legal plan of taking him at pick 1. Restated
//    over the whole draft it is a DEADLINE — QB slot filled by live pick 3 —
//    and §4 checks that restatement against an independent pin-based solve.
//
// 3. AN APPROXIMATION WEARING A NUMBER. `wr_anchor` depends on how the bench
//    splits between RB and WR, which this DP does not model. It must REFUSE.
//    §5 proves the refusal is real by showing the sensitivity is detected.
//
// Run: node draft/tests/doctrine_lookahead.test.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SS = require(path.join(ROOT, 'draft', 'tools', 'slot_schedule.js'));
const DOC = require(path.join(ROOT, 'public', 'js', 'draft', 'doctrine.js'));
const DL = require(path.join(ROOT, 'draft', 'tools', 'doctrine_lookahead.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};
const { baseline, doctrines } = DL.scoreAll();

// ── 1. THE BASELINE IS THE SAME PLAN THE SCHEDULE TOOL REPORTS ──────────
// If these ever diverge, one of the two is scoring a different draft.
{
  ck('the unconstrained baseline equals slot_schedule\'s own optimum — one '
    + 'solver, one answer', Math.abs(baseline.total - SS.best) < 1e-9,
  { lookahead: baseline.total, schedule: SS.best });
  ck('and it fills every open starting slot', baseline.plan.length === SS.open.length,
    { filled: baseline.plan.length, open: SS.open.length });
  ck('using only picks Cory owns', baseline.plan.every(p => SS.SCHED.indexOf(p.pick) >= 0),
    baseline.plan.map(p => p.pick));
}

// ── 2. AN UNCONSTRAINED DOCTRINE COSTS EXACTLY ZERO ─────────────────────
// The control. A doctrine that forbids nothing must price at 0.000, not 0.03 —
// any drift here means the constrained solve is not the same computation.
{
  const free = Object.values(doctrines).filter(r => r.scorable && r.shape.unconstrained);
  ck('at least one doctrine is genuinely unconstrained, or this control tests '
    + 'nothing', free.length >= 2, free.map(r => r.key));
  ck('CONTROL — every unconstrained doctrine costs EXACTLY zero',
    free.every(r => r.cost === 0), free.map(r => [r.key, r.cost]));
  ck('and `balanced` is one of them, since it is the control the whole panel '
    + 'is measured against', doctrines.balanced.cost === 0, doctrines.balanced.cost);
}

// ── 3. THE SHAPES ARE DERIVED, NOT TRANSCRIBED ──────────────────────────
// The strongest check in the file: mutate a predicate in doctrine.js and the
// shape must follow. A hand-copied table would not move.
{
  const before = DL.shapeOf('late_qb');
  ck('late_qb is read as a set of position EXCLUSIONS', before.exclusions.length > 0,
    before.exclusions.length);
  ck('and it excludes QB specifically', before.exclusions.every(e => e.pos === 'QB'),
    [...new Set(before.exclusions.map(e => e.pos))]);

  const orig = DOC.LIVE_CONSTRAINTS.late_qb;
  try {
    // Same shape, different position: now it defers TIGHT ENDS, not quarterbacks.
    DOC.LIVE_CONSTRAINTS.late_qb = function (pos, i) { return i >= 8 || pos !== 'TE'; };
    const after = DL.shapeOf('late_qb');
    ck('MUTATION — change the predicate and the derived shape follows it, which '
      + 'is what proves nothing here is transcribed',
    after.exclusions.length > 0 && after.exclusions.every(e => e.pos === 'TE'),
    [...new Set(after.exclusions.map(e => e.pos))]);

    // And a doctrine that forbids nothing must come back unconstrained.
    DOC.LIVE_CONSTRAINTS.late_qb = function () { return true; };
    ck('MUTATION — a predicate that permits everything is read as unconstrained',
      DL.shapeOf('late_qb').unconstrained === true);
  } finally {
    DOC.LIVE_CONSTRAINTS.late_qb = orig;
  }
  ck('and the original predicate is restored, so the rest of this file is not '
    + 'testing a mutant', DL.shapeOf('late_qb').exclusions.every(e => e.pos === 'QB'));
}

// ── 4. THE DEADLINE RESTATEMENT IS EXACT ────────────────────────────────
{
  const eq = DL.shapeOf('early_qb');
  ck('early_qb is read as a DEADLINE, not as a per-pick filter',
    eq.deadlines.length === 1 && eq.deadlines[0].pos === 'QB' && eq.exclusions.length === 0,
    eq.deadlines);
  ck('the deadline is live pick 3, matching the predicate\'s own `i === 3`',
    eq.deadlines[0].byPickIdx === 2, eq.deadlines[0]);

  /* THE INDEPENDENT CHECK. Solve it a completely different way — pin the QB
   * slot to each pick at or before the deadline and take the best — and the two
   * must agree. A deadline implemented wrongly (say, off by one, or forcing the
   * slot AT the deadline rather than BY it) would diverge here. */
  const qbIdx = SS.open.findIndex(o => o.slot === 'QB');
  const v = SS.valueMatrix(0, null);
  let bestPinned = -Infinity;
  for (let i = 0; i <= eq.deadlines[0].byPickIdx; i++) {
    const r = SS.solve(v, { slotIdx: qbIdx, pickIdx: i });
    if (r.feasible && r.total > bestPinned) bestPinned = r.total;
  }
  ck('and solving it the OTHER way — pin the QB to each pick up to the deadline '
    + 'and take the best — gives the identical total',
  Math.abs(doctrines.early_qb.total - bestPinned) < 1e-9,
  { deadline: doctrines.early_qb.total, pinned: bestPinned });

  /* OFF-BY-ONE ARM: forcing the QB at the deadline pick EXACTLY must be WORSE
   * than or equal to allowing anything up to it, and here strictly worse — so
   * the two implementations are not accidentally the same thing. */
  const atExactly = SS.solve(v, { slotIdx: qbIdx, pickIdx: eq.deadlines[0].byPickIdx });
  ck('FAIL ARM — "fill it AT the deadline" is a different, worse answer than '
    + '"fill it BY the deadline", so the distinction is being tested',
  atExactly.total < bestPinned - 1e-9, { at: atExactly.total, by: bestPinned });
}

// ── 5. THE REFUSAL IS REAL ──────────────────────────────────────────────
{
  const wa = DL.shapeOf('wr_anchor');
  ck('wr_anchor is detected as bench-sensitive', wa.benchSensitive === true);
  ck('so it is reported as NOT SCORABLE rather than given a number',
    doctrines.wr_anchor.scorable === false && doctrines.wr_anchor.cost === null,
    doctrines.wr_anchor);
  ck('and the reason names the bench explicitly, so a reader knows what would '
    + 'have to change', /bench/i.test(doctrines.wr_anchor.why), doctrines.wr_anchor.why);

  /* CONTROL — the detector is not simply flagging everything. If it were, every
   * cost in the table would be null and the tool would say nothing at all. */
  const scorable = Object.values(doctrines).filter(r => r.scorable);
  ck('CONTROL — most doctrines ARE scorable, so the bench check discriminates '
    + 'rather than refusing wholesale', scorable.length >= 7,
  { scorable: scorable.length, total: Object.keys(doctrines).length });

  /* AND THE SENSITIVITY IS REPRODUCED FROM THE PREDICATE, not remembered. */
  const keep = DL.keeperRoster();
  const bench = n => keep.concat(Array.from({ length: n }, () => ({ position: 'WR' })));
  const asRB = n => keep.concat(Array.from({ length: n }, () => ({ position: 'RB' })));
  const C = DOC.LIVE_CONSTRAINTS.wr_anchor;
  let disagreed = false;
  for (let n = 0; n <= 6; n++) for (let i = 1; i <= 6; i++) {
    DL.POSITIONS.forEach(p => { if (C(p, i, bench(n)) !== C(p, i, asRB(n))) disagreed = true; });
  }
  ck('reproduced from the predicate: it really does answer differently when the '
    + 'bench is receivers instead of backs', disagreed);
}

// ── 6. THE FINDING, AS DIRECTION RATHER THAN DIGITS ─────────────────────
// Not the exact costs — those move with the board. The ORDERING and the claim.
{
  const c = k => doctrines[k].cost;
  ck('deferring the quarterback to live pick 8 costs MORE than being made to '
    + 'take him by live pick 3 — waiting is right, waiting forever is not',
  c('late_qb') > c('early_qb'), { late_qb: c('late_qb'), early_qb: c('early_qb') });
  /* RE-PINNED 2026-08-17: early_qb's cost fell to EXACTLY zero, and the zero
   * is the board's doing, not a bug in the pricer. The 08-17 rebuild
   * (Cory's same-day rulings — opportunity layer removed, measured p90
   * ceilings, refreshed projections) lifted the QB shelf and the
   * unconstrained plan now takes the quarterback at pick 48, Cory's second
   * pick — INSIDE early_qb's live-pick-3 deadline — so the constraint no
   * longer binds and its price is honestly nothing. "BOTH cost something"
   * was a claim about the 08-14 board (QB at 73, both extremes priced), not
   * about the tool. The pin that survives a board move is the RELATIONSHIP:
   * a doctrine costs zero exactly when the unconstrained plan already
   * satisfies it — asserted both ways below, so a pricer that returned zero
   * for a binding constraint (or a cost for a satisfied one) still fails.
   * late_qb still costs real points: waiting forever remains wrong. */
  const eqDeadlinePick = SS.SCHED[DL.shapeOf('early_qb').deadlines[0].byPickIdx];
  const qbPlanPick = (baseline.plan.find(p => p.slot === 'QB') || {}).pick;
  ck('early_qb now costs ZERO because the value plan already satisfies it — the '
    + 'QB comes by the deadline unconstrained, so the doctrine prices as '
    + 'non-binding, not as an endorsement',
  c('early_qb') === 0 && qbPlanPick <= eqDeadlinePick,
  { early_qb: c('early_qb'), qb_pick: qbPlanPick, deadline_pick: eqDeadlinePick });
  ck('FAIL ARM — zero-iff-satisfied holds in BOTH directions: late_qb, which the '
    + 'plan does NOT satisfy, still costs real points — waiting is right, '
    + 'waiting forever still is not', c('late_qb') > 0,
  { late_qb: c('late_qb') });

  const qbPick = (baseline.plan.find(p => p.slot === 'QB') || {}).pick;
  const tePick = (baseline.plan.find(p => p.slot === 'TE') || {}).pick;
  ck('the unconstrained plan takes the TIGHT END before the QUARTERBACK',
    tePick < qbPick, { te: tePick, qb: qbPick });
  ck('and it does NOT take the quarterback at Cory\'s first pick, which is what '
    + 'the one-step panel was effectively recommending', qbPick !== SS.SCHED[0],
  { qb: qbPick, first: SS.SCHED[0] });

  /* ELITE-TE COSTS NOTHING, and that is a real result rather than a bug: the
   * value plan already takes a tight end at live pick 1, so the doctrine asks
   * for something it was going to do anyway. */
  ck('Elite-TE Anchor costs zero — the value plan already satisfies it, so it '
    + 'is a NAME for what the model does, not a strategy that changes a pick',
  c('elite_te') === 0, c('elite_te'));
}

// ── 7. IT REFUSES TO CLAIM A WINNER ─────────────────────────────────────
// The output is read by someone deciding a draft. A cost table sorted low-to-
// high looks exactly like a ranking of which plan is BEST, and it is not.
{
  const { execFileSync } = require('child_process');
  const out = execFileSync('node', [path.join(ROOT, 'draft', 'tools', 'doctrine_lookahead.js')],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  ck('the output says outright that it cannot say which plan WINS',
    /DOES NOT DO: say which plan WINS/.test(out));
  ck('and explains the asymmetry — a doctrine can only look neutral or costly '
    + 'against the value model\'s own projections', /never better/.test(out));
  ck('it names what WOULD test it, rather than leaving the reader with a table',
    /cory_conditional/.test(out) && /enrolls nothing/.test(out));
  ck('a zero cost is explained as "the constraint never binds", not as an '
    + 'endorsement', /never binds/.test(out) && /anyway/.test(out));
  ck('and the refusal is visible in the output, not just in the return value',
    /NOT SCORABLE/.test(out));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: a doctrine is priced over all twelve picks against the');
console.log('same solver slot_schedule uses, the constraint shapes are PROBED from');
console.log('doctrine.js rather than transcribed (proved by mutation), the state-dependent');
console.log('ones are restated as deadlines and checked against an independent pin-based');
console.log('solve, and the one constraint this DP cannot model is refused rather than');
console.log('guessed.');
console.log('WHAT IT DOES NOT: establish that any doctrine is worth running. Measured against');
console.log('the value model\'s own projections a constraint can only cost, never gain — so');
console.log('this prices plans, it does not rank them. Nothing here is wired to the panel.');
