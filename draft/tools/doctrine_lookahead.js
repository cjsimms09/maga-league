// TERRITORY: A
/* WHAT A DOCTRINE IS ACTUALLY WORTH — priced over the whole draft, not one pick.
 *
 * Cory, 2026-08-14, on the fix I shipped for the doctrine panel: *"We've either
 * got bad data or a bad equation … Just making rules to fix a symptom of a
 * deeper problem is going to cause more problems later. We need to build for
 * long term."* He was right, and this is the root fix.
 *
 * ── THE DEFECT THAT PATCH ONLY LABELLED ───────────────────────────────────
 *
 * `doctrine.js scoreBoard()` scores a plan by ONE NUMBER AT ONE PICK: the E[$]
 * of the best player that plan lets me take right now. A plan is not a one-pick
 * object. So the panel charged Late-QB Patience the full price of the
 * quarterback it declined at pick 33 and credited it NOTHING for the pick that
 * decline buys at 73 — a one-sided ledger, which is why eight of nine doctrines
 * tied at $67.0 and the ninth read $46.0 and last.
 *
 * Marking the deferral stopped the panel making a FALSE STATEMENT. It did not
 * make it compute the RIGHT QUANTITY. This does.
 *
 * ── THE RIGHT QUANTITY ────────────────────────────────────────────────────
 *
 * A doctrine is a constraint on which positions may be taken at which of my
 * picks. Its cost is therefore: the best complete draft I can run UNDER that
 * constraint, against the best complete draft I can run without it —
 *
 *     cost(doctrine) = best(unconstrained) − best(subject to doctrine)
 *
 * measured in points of STARTING LINEUP across all twelve picks. Both sides are
 * the same quantity, both are two-sided, and the number is directly readable:
 * "running this plan costs N points of starting lineup."
 *
 * `slot_schedule.js` already computes `best(...)` exactly, by DP over picks x
 * 2^slots, brute-force verified. This file adds the constraint and subtracts.
 * The solver is IMPORTED, not reimplemented — that file just lost three hand
 * -rolled copies of the same DP and is not gaining a fourth.
 *
 * ── THE CONSTRAINTS ARE DERIVED FROM doctrine.js, NOT TRANSCRIBED ─────────
 *
 * A hand-copied table of "what each doctrine forbids" is the two-places disease
 * that produced every serious defect on this project. So each doctrine's shape
 * is PROBED out of the live `LIVE_CONSTRAINTS` predicates:
 *
 *   · a position excluded at a live pick  -> a filter on the value matrix
 *   · "take one by pick k unless you hold one already"  -> a slot DEADLINE
 *   · anything that depends on how the BENCH splits between RB and WR
 *     -> REFUSED, because this DP does not model the bench and an answer
 *        that quietly assumed one would be a guess wearing a number
 *
 * The deadline restatement is what makes the state-dependent ones exact rather
 * than approximated. `early_qb` reads "at live pick 3, if you have no
 * quarterback, take one". Filtering pick 3 to QB-only would forbid the legal
 * plan of taking him at pick 1 — but over the whole draft the constraint is
 * simply THE QB SLOT IS FILLED BY LIVE PICK 3, which the DP can enforce by
 * pruning states that missed it.
 *
 * Run: node draft/tools/doctrine_lookahead.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SS = require(path.join(ROOT, 'draft', 'tools', 'slot_schedule.js'));
const DOC = require(path.join(ROOT, 'public', 'js', 'draft', 'doctrine.js'));

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

/* The roster the constraints are evaluated against: Cory's actual keepers, read
 * off the board rather than typed. `hero_rb` and `robust_rb` both branch on how
 * many backs are already held, and he holds two — assuming an empty roster here
 * would score a different plan than the one he can actually run. */
function keeperRoster() {
  return SS.keep.map(k => ({ position: k.position }));
}

/* ── SHAPE OF ONE DOCTRINE, PROBED FROM ITS OWN PREDICATE ─────────────────
 *
 * Returns { exclusions, deadlines, benchSensitive, unconstrained }.
 */
function shapeOf(key) {
  const allow = DOC.LIVE_CONSTRAINTS[key];
  const base = keeperRoster();
  const N = SS.SCHED.length;
  const out = { key: key, exclusions: [], deadlines: [], benchSensitive: false,
    unconstrained: true };
  if (!allow) return out;

  /* BENCH SENSITIVITY FIRST — if the answer moves with a split this DP does not
   * model, nothing below it can be trusted. Probed by asking the predicate the
   * same question with the bench modelled as ALL backs and then ALL receivers;
   * if it ever disagrees with itself, we refuse. */
  for (let b = 0; b <= N && !out.benchSensitive; b++) {
    const asRB = base.concat(Array.from({ length: b }, () => ({ position: 'RB' })));
    const asWR = base.concat(Array.from({ length: b }, () => ({ position: 'WR' })));
    for (let i = 1; i <= N && !out.benchSensitive; i++) {
      POSITIONS.forEach(p => {
        if (allow(p, i, asRB) !== allow(p, i, asWR)) out.benchSensitive = true;
      });
    }
  }
  if (out.benchSensitive) { out.unconstrained = false; return out; }

  for (let i = 1; i <= N; i++) {
    const permitted = POSITIONS.filter(p => allow(p, i, base));
    if (permitted.length === POSITIONS.length) continue;
    out.unconstrained = false;

    /* A LONE PERMITTED POSITION IS A REQUIREMENT, and the question is whether it
     * is a requirement THIS PICK or a deadline. Ask the predicate what it says
     * once that position is already held: if it goes quiet, the doctrine wanted
     * one BY NOW, not one RIGHT NOW. */
    if (permitted.length === 1) {
      const P = permitted[0];
      const held = base.concat([{ position: P }]);
      const satisfied = POSITIONS.every(p => allow(p, i, held));
      if (satisfied) {
        const slotIdx = SS.open.findIndex(o => o.elig.length === 1 && o.elig[0] === P);
        if (slotIdx >= 0) { out.deadlines.push({ slotIdx: slotIdx, byPickIdx: i - 1, pos: P }); continue; }
        // No dedicated slot for that position (it would have to go in the flex).
        // Refuse rather than pick a slot on its behalf.
        out.benchSensitive = true;
        return out;
      }
    }
    POSITIONS.filter(p => !allow(p, i, base))
      .forEach(p => out.exclusions.push({ liveIndex: i, pos: p }));
  }
  return out;
}

/** Score every doctrine by look-ahead. Returns {key: {...}} sorted-able. */
function scoreAll() {
  const baseline = SS.solve(SS.valueMatrix(0, null));
  const out = {};
  Object.keys(DOC.LIVE_CONSTRAINTS).forEach(key => {
    const shape = shapeOf(key);
    if (shape.benchSensitive) {
      out[key] = { key: key, scorable: false, total: null, cost: null,
        why: 'its constraint depends on how the bench splits between RB and WR, '
          + 'which this DP does not model — refusing to guess' };
      return;
    }
    const excl = {};
    shape.exclusions.forEach(e => { (excl[e.liveIndex] = excl[e.liveIndex] || []).push(e.pos); });
    const filter = shape.unconstrained ? null : function (pos, liveIndex) {
      const banned = excl[liveIndex];
      return !banned || banned.indexOf(pos) < 0;
    };
    const r = SS.solve(SS.valueMatrix(0, filter), null, shape.deadlines);
    out[key] = {
      key: key, scorable: true, feasible: r.feasible,
      total: r.feasible ? r.total : null,
      cost: r.feasible ? baseline.total - r.total : null,
      plan: r.plan, shape: shape,
    };
  });
  return { baseline: baseline, doctrines: out };
}

if (require.main === module) {
  const { baseline, doctrines } = scoreAll();
  const meta = k => DOC.doctrineMeta(k);
  console.log('WHAT EACH DOCTRINE COSTS — priced across all ' + SS.SCHED.length
    + ' of my picks, not at one\n');
  console.log('  best unconstrained plan: ' + baseline.total.toFixed(1)
    + ' points of starting lineup');
  console.log('  (' + baseline.plan.map(p => p.slot + '@' + p.pick).join('  ') + ')\n');
  console.log('  doctrine                      cost   plan');
  const rows = Object.values(doctrines).sort((a, b) =>
    (a.cost == null ? 1e9 : a.cost) - (b.cost == null ? 1e9 : b.cost));
  rows.forEach(r => {
    if (!r.scorable) {
      console.log('  ' + meta(r.key).name.padEnd(26) + '     —   NOT SCORABLE: ' + r.why);
      return;
    }
    if (!r.feasible) {
      console.log('  ' + meta(r.key).name.padEnd(26) + '     —   IMPOSSIBLE: this plan cannot '
        + 'fill every starting slot');
      return;
    }
    console.log('  ' + meta(r.key).name.padEnd(26) + r.cost.toFixed(1).padStart(7)
      + '   ' + r.plan.filter(p => ['QB', 'TE'].indexOf(p.slot) >= 0)
        .map(p => p.slot + '@' + p.pick).join(' '));
  });

  console.log('\n  COST = points of starting lineup given up by running that plan instead of');
  console.log('  best-available. Zero means the constraint never binds — the value plan');
  console.log('  already does what the doctrine asks, so the doctrine is a NAME for what');
  console.log('  the model would do anyway, not a strategy that changes anything.\n');
  const free = rows.filter(r => r.scorable && r.feasible && r.cost < 0.05);
  console.log('  costs nothing (does not change a single pick): '
    + (free.length ? free.map(r => meta(r.key).name).join(', ') : 'none'));
  console.log('\n  WHAT THIS DOES NOT DO: say which plan WINS. It prices what each one gives');
  console.log('  up against the value model\'s own projections — so a doctrine can only ever');
  console.log('  look neutral or costly here, never better. A plan beats best-available only');
  console.log('  if the projections are wrong in a way the plan exploits, and that is a');
  console.log('  claim about the projections which this cannot test. The paired-room race');
  console.log('  (cory_conditional.py) is the test for that, and it currently enrolls nothing.');
}

module.exports = { shapeOf, scoreAll, keeperRoster, POSITIONS };
