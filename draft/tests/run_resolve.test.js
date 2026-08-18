// TERRITORY: A
// GRADING THE RUN CALL — the second draft-day loop.
//
// Run multipliers feed `survivalProbability`, so a run call that is wrong makes
// every survival number downstream of it wrong too. Grading this grades a VONA
// input, the same reason survival was worth closing first.
//
// ── THE BASELINE IS THE WHOLE POINT OF THIS FILE ──────────────────────────
//
// The obvious grade is "did the position go faster AFTER the call than BEFORE
// it". That is biased against the model BY CONSTRUCTION: `detectRuns` fires
// precisely because the position just went fast, so the before-window is
// elevated by selection, and regression to the mean alone would score most
// correct calls as failures.
//
// That is the same shape as the survival boundary defect I shipped earlier
// today — a comparison that looks neutral and systematically punishes the model
// on exactly the cases it fired on. §2 is the arm that keeps it shut: the
// baseline is the position's share of the WHOLE DRAFT before the call, not the
// spike that triggered it.
//
// Run: node draft/tests/run_resolve.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};
const W = S.CFG.RUN_WINDOW;
const pk = (n, pos) => ({ overall: n, position: pos });
const call = (at, pos, mult) => [{ pick: at, payload: { positions: [{ position: pos, multiplier: mult }] } }];
// 30 picks where RB is exactly 1/3 of the board — a clean, known baseline.
const HISTORY = Array.from({ length: 30 }, (_, i) => pk(i + 1, (i + 1) % 3 === 0 ? 'RB' : 'WR'));

// ── 1. THE WINDOW MATCHES THE DETECTOR'S OWN HORIZON ────────────────────
{
  const after = Array.from({ length: W }, (_, i) => pk(31 + i, 'RB'));
  const r = S.resolveRun(call(30, 'RB', 1.6), { picks: HISTORY.concat(after) })[0].payload;
  ck('the forward window is RUN_WINDOW — the same horizon runMultipliers looks '
    + 'BACK over; grading a 10-pick detector on a 3-pick future measures the '
    + 'window, not the call', r.window === W && W === 10, { window: r.window, cfg: W });
  ck('and the resolver reports how many picks each side was measured over, so a '
    + 'thin sample cannot hide inside a rate', r.n_before === 29 && r.n_after === W,
  { before: r.n_before, after: r.n_after });
}

// ── 2. THE BASELINE IS THE DRAFT, NOT THE SPIKE ─────────────────────────
{
  const after = Array.from({ length: W }, (_, i) => pk(31 + i, 'RB'));
  const r = S.resolveRun(call(30, 'RB', 1.6), { picks: HISTORY.concat(after) })[0].payload;
  const row = r.positions[0];
  /* THE EXPECTED VALUE IS COMPUTED FROM THE FIXTURE, NOT TYPED. My first
   * version asserted 0.345 by counting the RBs in my head and getting 10 where
   * the fixture has 9 (picks 3,6,...,27 in the 29 before the call). A hand-typed
   * expectation is a second implementation of the thing under test, and mine was
   * wrong — exactly the failure mode this file is otherwise about. */
  const priorPicks = HISTORY.filter(p => p.overall < 30);
  const expected = priorPicks.filter(p => p.position === 'RB').length / priorPicks.length;
  ck('the baseline is the position\'s share of the whole draft before the call',
    Math.abs(row.baseline_rate - expected) < 0.001,
    { got: row.baseline_rate, expected: Math.round(expected * 1000) / 1000,
      rbs: priorPicks.filter(p => p.position === 'RB').length, of: priorPicks.length });
  ck('a run that really continued is scored as continued, with the excess stated',
    row.continued === true && row.observed_rate === 1 && row.excess > 0.6, row);

  /* THE ARM. Build a case where the pre-call window IS the spike — the room took
   * RBs solidly for the ten picks before the call and then reverted to its own
   * long-run rate. An after-vs-before grade calls that a FAILED run. Against the
   * draft baseline it is correctly a continuation. */
  const longRun = Array.from({ length: 20 }, (_, i) => pk(i + 1, i % 5 === 0 ? 'RB' : 'WR')); // 20% RB
  const spike = Array.from({ length: 10 }, (_, i) => pk(21 + i, 'RB'));                       // the trigger
  const revert = Array.from({ length: W }, (_, i) => pk(31 + i, i % 2 === 0 ? 'RB' : 'WR'));  // 50% RB
  const r2 = S.resolveRun(call(30, 'RB', 1.5),
    { picks: longRun.concat(spike, revert) })[0].payload.positions[0];
  ck('FAIL ARM — a position still going ABOVE its draft-long rate after the call '
    + 'is a CONTINUATION, even though it slowed from the spike that triggered it',
  r2.continued === true, r2);
  const beforeWindowRate = 1.0;         // the ten picks before the call were all RB
  ck('and an after-vs-before comparison would have called that same case a '
    + 'FAILURE — which is the bias this baseline exists to avoid',
  r2.observed_rate < beforeWindowRate, { observed: r2.observed_rate, spike: beforeWindowRate });
}

// ── 3. A RUN THAT DIED IS SCORED AS DEAD ────────────────────────────────
// Or the metric only ever confirms.
{
  const flat = Array.from({ length: W }, (_, i) => pk(31 + i, 'WR'));
  const row = S.resolveRun(call(30, 'RB', 1.6),
    { picks: HISTORY.concat(flat) })[0].payload.positions[0];
  ck('CONTROL — a called run that stopped is `continued: false` with a NEGATIVE '
    + 'excess, so the grade can disconfirm', row.continued === false && row.excess < 0, row);
}

// ── 4. IT REFUSES RATHER THAN GRADING ON NOTHING ────────────────────────
{
  const partial = Array.from({ length: 4 }, (_, i) => pk(31 + i, 'RB'));
  ck('a call whose window the draft has not finished resolves to NOTHING — the '
    + 'same refusal as survival, for the same reason',
  S.resolveRun(call(30, 'RB', 1.6), { picks: HISTORY.concat(partial) }).length === 0);
  ck('CONTROL — it DOES resolve once the window completes, so the refusal is '
    + 'about timing and not a broken resolver',
  S.resolveRun(call(30, 'RB', 1.6),
    { picks: HISTORY.concat(Array.from({ length: W }, (_, i) => pk(31 + i, 'RB'))) }).length === 1);

  const thin = [pk(1, 'RB'), pk(2, 'WR')];
  ck('a baseline of three picks is not a baseline — it refuses rather than '
    + 'dividing by a number that cannot mean anything',
  S.resolveRun(call(2, 'RB', 1.5),
    { picks: thin.concat(Array.from({ length: W }, (_, i) => pk(3 + i, 'RB'))) }).length === 0);
  ck('a pick log with no positions grades nothing — the claim is ABOUT a '
    + 'position, so ids alone cannot settle it',
  S.resolveRun(call(30, 'RB', 1.6),
    { picks: HISTORY.concat(Array.from({ length: W }, (_, i) => ({ overall: 31 + i }))) }).length === 0);
}

// ── 5. THE MULTIPLIER IS RECORDED, NOT SCORED ───────────────────────────
{
  const after = Array.from({ length: W }, (_, i) => pk(31 + i, 'RB'));
  const r = S.resolveRun(call(30, 'RB', 1.6), { picks: HISTORY.concat(after) })[0].payload;
  ck('the multiplier rides with the measured excess, so the relationship becomes '
    + 'measurable once there are rows', r.positions[0].multiplier === 1.6
    && typeof r.positions[0].excess === 'number');
  ck('and the row SAYS it is unscored — no mapping from multiplier to expected '
    + 'excess has been established, and inventing one on zero observations would '
    + 'be fitting', /not scored against it/.test(r.multiplier_note));
  ck('the baseline choice is stated on the row too, because it is the one '
    + 'decision a later reader could get wrong',
  /biased against a detector that fires on a spike/.test(r.baseline_note));
}

// ── 6. THE WIRING ───────────────────────────────────────────────────────
{
  const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('run captures are remembered client-side for grading', /state\.runCaptures/.test(app));
  ck('de-duplicated on the SAME `sig` the ledger already uses, rather than a '
    + 'second definition of "the same run call" that could disagree with it',
  /_key === rKey/.test(app) && /rKey = String\(c\.pick\) \+ '\|' \+ sig/.test(app));
  ck('the resolver runs from the pick sync', /resolveRunCalls\(picks\);/.test(app));
  ck('it is gated on mockMode', /function resolveRunCalls[\s\S]{0,200}state\.mockMode/.test(app));
  ck('the pick log it builds carries POSITIONS, without which the claim cannot '
    + 'be graded at all', /resolveRunCalls[\s\S]{0,900}position: p && p\.position/.test(app));
  const SRV = require(path.join(ROOT, 'src', 'predledger.js'));
  ck('`run_resolved` is DECLARED on the server, or every resolution row would be '
    + 'rejected and the loop would look closed while collecting nothing',
  SRV.KINDS.indexOf('run_resolved') >= 0);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: a run call is graded over the same horizon the detector');
console.log('looks back on, against the position\'s draft-long rate rather than the spike');
console.log('that triggered it, refusing when the window is incomplete or the baseline too');
console.log('thin, and able to disconfirm as well as confirm.');
console.log('WHAT IT DOES NOT: say whether the MULTIPLIER is well calibrated. It records the');
console.log('number beside the measured excess and asserts no mapping between them — that');
console.log('needs rows, and the first ones arrive on 22 August.');
