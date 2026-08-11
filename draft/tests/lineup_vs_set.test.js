'use strict';
// "NOTHING TO CHANGE" WAS A CLAIM ABOUT A LINEUP NOTHING HAD LOOKED AT.
//
// optimize() builds the projection-optimal lineup and hill-climbs on E[$] from
// there. `calls` is therefore the difference between the two MODEL lineups —
// the dual-objective deviation A measured at ~11% of weeks. It is a property of
// the model. It was being read as a to-do list.
//
// Measured before the fix, on one ordinary roster: bench a 17.8-projected WR for
// a 12.7-projected one and optimize() returned edge 0, zero calls, and the
// Sunday alert's headline "You're already starting the dollar-optimal lineup —
// nothing to change." The lineup was 5.1 projected points and ~$12 worse than
// the one the tool recommended, and the tool congratulated it, because the
// lineup was never passed in.
//
// So: ctx.current. And three states that must stay distinguishable —
//   your lineup has moves in it / your lineup was checked and is right /
//   nothing checked your lineup.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lvs-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const LO = require(path.join(ROOT, 'src', 'routes', 'lineup'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 220) : ''))); };
const need = (obj, name, what) => {
  if (obj && typeof obj[name] === 'function') return obj[name];
  ck(`${what} exists`, false, `lineup.${name} is not exported`);
  return () => ({});
};

const ROSTER = [
  { id: 'p1', name: 'QB One', pos: 'QB', proj: 21.4 },
  { id: 'p2', name: 'RB One', pos: 'RB', proj: 16.2 },
  { id: 'p3', name: 'RB Two', pos: 'RB', proj: 14.1 },
  { id: 'p4', name: 'WR One', pos: 'WR', proj: 17.8 },
  { id: 'p5', name: 'WR Two', pos: 'WR', proj: 15.3 },
  { id: 'p6', name: 'TE One', pos: 'TE', proj: 11.2 },
  { id: 'p7', name: 'FLEX One', pos: 'RB', proj: 13.6 },
  { id: 'p8', name: 'K One', pos: 'K', proj: 8.4 },
  { id: 'p9', name: 'DEF One', pos: 'DEF', proj: 7.9 },
  { id: 'p10', name: 'Bench WR', pos: 'WR', proj: 12.7 },
];
const RIGHT = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'];
const WRONG = ['p1', 'p2', 'p3', 'p10', 'p5', 'p6', 'p7', 'p8', 'p9'];   // 12.7 in, 17.8 out

const optimize = need(LO, 'optimize', 'the solver');
const alertOf = need(LO, 'sundayAlert', 'the Sunday alert');
const band = need(LO, 'weeklyHighBand', 'the weekly-high band')();
const typical = need(LO, 'typicalTeamScore', 'the typical team score')();
const run = current => optimize(ROSTER, {
  band, sigmaByPos: LO.positionSigmas(), oppMean: typical.median, oppSd: typical.sd, current,
});

// ── the regression itself ────────────────────────────────────────────────────
// The model's own view of this roster: the two optima agree, so `calls` is
// empty. That was the ONLY thing the alert consulted.
const blind = run(null);
ck('the two MODEL lineups agree on this roster (so `calls` is empty)',
  (blind.calls || []).length === 0 && Math.abs(blind.edge) < 0.01, { calls: blind.calls, edge: blind.edge });
ck('  and with no lineup supplied, `set` is null — no comparison was made',
  blind.set === null, blind.set);

// A MISSING `set` MUST NOT KILL THE FILE. When the comparison was broken in
// rehearsal, `bad.set.changes` threw a bare TypeError and every check after it
// went unprinted — the failure mode looked like a crash rather than a result.
const EMPTY_SET = { matches: null, changes: [], dollars: null, points: null };
const setOf = r => r.set || EMPTY_SET;

const bad = run(WRONG);
ck('a WRONG lineup is now caught even though `calls` is still empty',
  (bad.calls || []).length === 0 && bad.set && bad.set.matches === false,
  { calls: bad.calls.length, set: bad.set && bad.set.matches });
ck('  it names the exact swap', setOf(bad).changes.length === 1
  && setOf(bad).changes[0].startName === 'WR One' && setOf(bad).changes[0].sitName === 'Bench WR',
  setOf(bad).changes);
ck('  it prices the fix in points', Math.abs(setOf(bad).points - 5.1) < 0.05, setOf(bad).points);
ck('  and in dollars, above the print threshold', setOf(bad).dollars > 0.5, setOf(bad).dollars);

const good = run(RIGHT);
ck('the CORRECT lineup is confirmed correct', good.set && good.set.matches === true, good.set);
ck('  with no changes and nothing to gain',
  setOf(good).changes.length === 0 && Math.abs(setOf(good).dollars) < 0.01, setOf(good));

// ── the three states must never collapse into one sentence ──────────────────
const A = alertOf(bad, { week: 9, band });
const B = alertOf(good, { week: 9, band });
const C = alertOf(blind, { week: 9, band });
ck('a wrong lineup says there are changes to make', /change/i.test(A.headline) && A.actionable === true, A.headline);
ck('a right lineup says YOUR lineup is optimal', /your lineup is already/i.test(B.headline), B.headline);
ck('  and is not actionable — no email is owed', B.actionable === false, B.actionable);
ck('an unchecked lineup claims nothing about YOUR lineup',
  !/your lineup/i.test(C.headline) && !/you.re already starting/i.test(C.headline), C.headline);
ck('  and says so in a field a caller can branch on',
  A.lineupKnown === true && B.lineupKnown === true && C.lineupKnown === false,
  [A.lineupKnown, B.lineupKnown, C.lineupKnown]);
ck('the three headlines are three different sentences',
  new Set([A.headline, B.headline, C.headline]).size === 3, [A.headline, B.headline, C.headline]);

// The exact sentence that was wrong. It asserted something about the manager's
// lineup off an empty `calls` array; it must never be produced without a check.
const src = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'lineup.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ck("the old \"you're already starting…\" claim is gone from the code",
  !/You're already starting the dollar-optimal/.test(src));

// ── a dead starter is a to-do even when the dollars are small ───────────────
{
  // Everyone on the bench is worthless, so swapping the OUT starter for any of
  // them is worth almost nothing in dollars — the exact case the $0.50 print
  // threshold used to filter into silence.
  const roster = ROSTER.map(p => p.id === 'p4' ? { ...p, proj: 0 } : p);
  const r = optimize(roster, { band, sigmaByPos: LO.positionSigmas(),
    oppMean: typical.median, oppSd: typical.sd, current: RIGHT });
  r.inactive = [{ name: 'WR One', pos: 'WR', starter: true, reason: 'out' }];
  const a = alertOf(r, { week: 9, band });
  ck('a zeroed STARTER is reported as a dead slot', a.dead.length === 1, a.dead);
  ck('  which makes the week actionable on its own', a.actionable === true, a);
}
{
  // The same player OUT but on the BENCH is not a to-do. A guard that fires on
  // any injured player anywhere fires every week and means nothing.
  const r = run(RIGHT);
  r.inactive = [{ name: 'Bench WR', pos: 'WR', starter: false, reason: 'out' }];
  const a = alertOf(r, { week: 9, band });
  ck('a zeroed BENCH player is NOT a dead slot', a.dead.length === 0, a.dead);
  ck('  and does not by itself earn an email', a.actionable === false, a);
}

// ── the model's own deviation stat is untouched ─────────────────────────────
// `calls` is what the backtest grades and what the ~11%/$9-a-season figure is
// measured on. Adding the lineup comparison must not have moved it.
ck('`calls` still means recommended-vs-naive, not recommended-vs-yours',
  JSON.stringify(bad.calls) === JSON.stringify(blind.calls)
  && JSON.stringify(good.calls) === JSON.stringify(blind.calls),
  { withBadLineup: bad.calls.length, blind: blind.calls.length });
ck('  and `edge` is unchanged by which lineup you happen to have set',
  bad.edge === blind.edge && good.edge === blind.edge, [bad.edge, good.edge, blind.edge]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
