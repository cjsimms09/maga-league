'use strict';
// TERRITORY: D
// The start/sit decision-null for the ARM — GRADING-POLICY.md requirements
// 1-4, built for P298 and P314 (register 198's sibling gap).
//
// The point of this file is NOT that the tool runs. It is that each control
// can FAIL. A control that cannot fail is worse than none, and this harness
// has already produced one: the first known-positive asserted that perfect
// hindsight sits at percentile 1.0, which is false in 31.7% of real weeks
// because a blind draw ties the optimum. It failed on its first run and the
// CONTROL was wrong, not the arm.
//
// Run: node draft/tests/lineup_vs_random.test.js
const path = require('path');
const M = require(path.join(__dirname, '..', 'tools', 'lineup_vs_random.js'));
const LO = require(path.join(__dirname, '..', '..', 'src', 'routes', 'lineup.js'));
const ART = require(path.join(__dirname, '..', 'backtest', 'lineup_vs_random.json'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

// ── the RNG is deterministic, per the policy's fix-seed-and-order rule ─────
{
  const a = M.rng(M.SEED_NULL), b = M.rng(M.SEED_NULL);
  const sa = [], sb = [];
  for (let i = 0; i < 50; i++) { sa.push(a()); sb.push(b()); }
  ck('the same seed replays the identical stream', JSON.stringify(sa) === JSON.stringify(sb));
  const c = M.rng(M.SEED_NEGATIVE);
  ck('a DIFFERENT seed gives a different stream', c() !== M.rng(M.SEED_NULL)());
}

// ── the structural guard against the vacuous known-negative ────────────────
ck('the known-negative is drawn from an INDEPENDENT stream (policy: never '
  + 'sampled from the null it is scored against)', M.SEED_NEGATIVE !== M.SEED_NULL);

// ── percentile orientation — invert it and every verdict inverts ───────────
{
  const draws = [1, 2, 3, 4];
  ck('a value above every draw scores 1.0', M.percentile(5, draws) === 1);
  ck('a value below every draw scores 0.0', M.percentile(0, draws) === 0);
  ck('a value tying every draw scores 0.5', M.percentile(7, [7, 7, 7, 7]) === 0.5);
  ck('ties count as half, not as wins', M.percentile(2, [1, 2, 3, 4]) === 0.375,
    M.percentile(2, [1, 2, 3, 4]));
}

// ── a drawn lineup is LEGAL, using the solver's own rules ──────────────────
{
  const pos = { qb1: 'QB', rb1: 'RB', rb2: 'RB', wr1: 'WR', wr2: 'WR', te1: 'TE', bn: 'RB' };
  const ids = Object.keys(pos).sort();
  // ⚠️ `slots` is an OBJECT keyed by position, not an array — `bestLineup`
  // iterates its keys. The first version of this fixture passed
  // ['QB','RB',...] and got an EMPTY lineup back, so the three legality
  // assertions below were asserting nothing at all while reading as a clean
  // pass. Caught only because the "the draw explores more than one legal
  // lineup" check went red beside them.
  const slots = { QB: 1, RB: 2, WR: 2, TE: 1 };
  const nSlots = Object.values(slots).reduce((a, b) => a + b, 0);
  const r = M.rng(7);
  for (let i = 0; i < 40; i++) {
    const l = M.randomLegalLineup(ids, pos, slots, r);
    const used = l.starters.map(s => s.pid);
    if (used.length !== nSlots) { ck('drawn lineup fills every slot', false, used); break; }
    if (new Set(used).size !== used.length) { ck('no player starts twice', false, used); break; }
    const bad = l.starters.find(s => s.slot !== 'FLEX' && pos[s.pid] !== s.slot);
    if (bad) { ck('every starter is eligible for his slot', false, bad); break; }
    if (i === 39) {
      ck('drawn lineup fills every slot', true);
      ck('no player starts twice', true);
      ck('every starter is eligible for his slot', true);
    }
  }
  // ...and the draw must actually VARY, or the "null" is a constant.
  const seen = new Set();
  const r2 = M.rng(11);
  for (let i = 0; i < 60; i++) {
    seen.add(M.randomLegalLineup(ids, pos, slots, r2).starters.map(s => s.pid).sort().join('|'));
  }
  ck('the draw explores more than one legal lineup', seen.size > 1, seen.size);
}

// ── EVERY CONTROL CAN GO RED. This is the part that matters. ───────────────
{
  const good = ART.weeks.slice(0, 50);
  ck('controls() passes on the real graded weeks', M.controls(good).ok === true,
    M.controls(good).checks.filter(c => !c.ok));

  const beaten = good.map((w, i) => i === 0 ? { ...w, oracle_tops_every_draw: false } : w);
  ck('RED when a null draw beats perfect hindsight',
    M.controls(beaten).ok === false);

  const offCentre = good.map(w => ({ ...w, negative_percentile: 0.9 }));
  ck('RED when the random agent does NOT land at the null centre',
    M.controls(offCentre).ok === false);

  const flat = good.map(w => ({ ...w, null_sd: 0 }));
  ck('RED when the null has no spread — the vacuity guard neither other '
    + 'control would notice', M.controls(flat).ok === false);

  const notDominating = good.map((w, i) => i === 0 ? { ...w, arm_points: w.oracle_points + 1 } : w);
  ck('RED when hindsight does not dominate the arm',
    M.controls(notDominating).ok === false);

  ck('RED when there are no graded weeks at all', M.controls([]).ok === false);
}

// ── the graded result, pinned ──────────────────────────────────────────────
{
  const s = ART.summary;
  ck('all controls green in the committed artifact', ART.controls.ok === true);

  // The headline, and it is the answer P143's conversion said was missing:
  // the arm HAS skill against the null and still loses badly to the owners.
  ck('the arm beats the random-legal null', s.arm_mean_percentile > 0.5, s.arm_mean_percentile);
  ck('the arm sits well BELOW the owners on the same null',
    s.human_mean_percentile - s.arm_mean_percentile > 0.15,
    [s.arm_mean_percentile, s.human_mean_percentile]);

  // Requirement 4 first: points, then percentile.
  ck('points left is reported and the arm leaves more than the owners',
    s.arm_points_left_per_week > s.human_points_left_per_week);

  // Cross-check against the OTHER harness. -14.54 is lineup_edge_backtest's
  // own edgeVsActual; two paths through the same history must agree or one
  // of them is wrong.
  ck('arm-minus-human points reproduces lineup_edge_backtest\'s -14.54',
    Math.abs(s.arm_minus_human_points - (-14.54)) < 0.01, s.arm_minus_human_points);

  // ...and against A's INDEPENDENT Python instrument, which shares no code:
  // start_sit_vs_random.py puts the owners at 0.8497 over its own population.
  ck('the owners\' percentile agrees with A\'s independent Python measurement '
    + '(0.8497) within 0.05', Math.abs(s.human_mean_percentile - 0.8497) < 0.05,
    s.human_mean_percentile);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
