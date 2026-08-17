// TERRITORY: A
// THE PLAN SPENT THREE PICKS CORY DOES NOT OWN.
//
// `slot_schedule.js` answers Cory's central question — "come up with an equation
// that can help us determine when the best time to take a QB or TE is" — and it
// was answering it on the wrong pick schedule. `SCHED` was the literal
//
//     [8, 13, 28, 33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148]
//
// which is `pick_order.my_picks_BEFORE_keepers`. Picks 8, 13 and 28 are the
// first, second and third round slots FORFEITED for Derrick Henry, Ja'Marr Chase
// and Kenneth Walker — the board lists them by name under `pick_order.forfeited`.
//
// ── WHY IT SURVIVED SO LONG ───────────────────────────────────────────────
//
// The same keepers WERE subtracted from the starting SLOTS, correctly and by
// derivation, under a comment reading "Derived, not typed: a hand-written list
// would drift the moment the keepers change". One side of the assignment knew
// about the keepers and the other did not, and the sentence warning about
// exactly that failure sat twelve lines below the failure.
//
// The brute-force check did not catch it either: it agreed with the DP to the
// decimal — on the wrong pick set. TWO METHODS AGREEING ON THE WRONG QUESTION
// IS NOT VERIFICATION.
//
// ── WHAT IT COST ──────────────────────────────────────────────────────────
//
//              old (15 picks, 3 forfeited)     real (12 picks)
//     TE               pick 13                    pick 33
//     QB               pick 33                    pick 73
//     total             1325.5                     1178.4
//
// The answer INVERTED. The old plan opened with a tight end in round 2 and a
// quarterback at 33; the real one opens with the tight end AT 33 and waits on
// the quarterback until 73. And "QB at 33" — the old plan's headline — now
// prices at 11.1 points of starting lineup FORGONE.
//
// Run: node draft/tests/slot_schedule.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const TOOL = path.join(ROOT, 'draft', 'tools', 'slot_schedule.js');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const PO = D.pick_order || {};
const OUT = execFileSync('node', [TOOL], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });

// ── 1. THE TWO PICK LISTS ARE BOTH REAL, AND DIFFERENT ──────────────────
// If the board ever stops carrying both, this whole file is about nothing.
{
  ck('the board carries the picks Cory OWNS', Array.isArray(PO.my_picks) && PO.my_picks.length > 0);
  ck('and separately the picks he owned BEFORE keepers',
    Array.isArray(PO.my_picks_before_keepers) && PO.my_picks_before_keepers.length > 0);
  ck('CONTROL — the two really differ, which is the only reason confusing them '
    + 'has a cost', PO.my_picks.length !== PO.my_picks_before_keepers.length,
  { owns: PO.my_picks.length, before: PO.my_picks_before_keepers.length });
  ck('the difference is exactly the forfeited rounds, by count',
    PO.my_picks_before_keepers.length - PO.my_picks.length === (PO.forfeited || []).length,
    { delta: PO.my_picks_before_keepers.length - PO.my_picks.length,
      forfeited: (PO.forfeited || []).length });
  ck('and picks 8, 13 and 28 are in the BEFORE list and NOT in the owned list — '
    + 'these are the three the plan used to spend',
  [8, 13, 28].every(p => PO.my_picks_before_keepers.includes(p) && !PO.my_picks.includes(p)),
  { before: PO.my_picks_before_keepers.slice(0, 4), owns: PO.my_picks.slice(0, 4) });
}

// ── 2. THE SCHEDULE IS READ, NOT TYPED ──────────────────────────────────
{
  const src = fs.readFileSync(TOOL, 'utf8');
  ck('SCHED comes from pick_order.my_picks', /SCHED\s*=\s*\(DATA\.pick_order[^;]*\)\.my_picks/.test(src));
  ck('the forfeited-pick literal is gone from the assignment',
    !/SCHED\s*=\s*\[\s*8\s*,\s*13\s*,\s*28/.test(src));
  ck('and it REFUSES rather than guessing if the board stops carrying it',
    /REFUSING to plan/.test(src));
  /* THE REFUSAL IS EXERCISED, not merely present. A guard nobody runs is a
   * comment. Feed the tool a board with no my_picks and it must die loudly. */
  const tmp = path.join(require('os').tmpdir(), 'ss-noboard-' + process.pid);
  fs.mkdirSync(path.join(tmp, 'public'), { recursive: true });
  const stripped = JSON.parse(JSON.stringify(D));
  delete stripped.pick_order.my_picks;
  fs.writeFileSync(path.join(tmp, 'public', 'draft_data.json'), JSON.stringify(stripped));
  let threw = '';
  try {
    execFileSync('node', ['-e',
      'const p=require("path");const M=p.join(' + JSON.stringify(ROOT) + ',"draft","tools","slot_schedule.js");'
      + 'const fs=require("fs");const orig=fs.readFileSync;'
      + 'fs.readFileSync=function(f,e){if(String(f).endsWith("draft_data.json"))'
      + 'return orig(p.join(' + JSON.stringify(tmp) + ',"public","draft_data.json"),e);'
      + 'return orig.apply(this,arguments)};require(M);'], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) { threw = String(e.stderr || e.message); }
  ck('FAIL ARM — with my_picks absent the tool throws its refusal instead of '
    + 'planning on a guessed schedule', /REFUSING to plan/.test(threw),
  threw.slice(0, 200));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── 3. THE PLAN ONLY EVER USES PICKS CORY OWNS ──────────────────────────
// The assertion that would have failed on the old code, stated directly.
{
  const owns = new Set(PO.my_picks);
  const assigned = [...OUT.matchAll(/^\s*(\d+)\s+(QB|TE|WR|FLEX|K|DEF)\s/gm)].map(m => +m[1]);
  ck('the printed assignment is non-empty (non-vacuity)', assigned.length >= 4, assigned);
  ck('EVERY assigned pick is one Cory actually owns', assigned.every(p => owns.has(p)),
    { assigned: assigned, notOwned: assigned.filter(p => !owns.has(p)) });
  const bench = (OUT.match(/bench picks \(best available RB\/WR\): ([\d, ]+)/) || [])[1];
  const benchPicks = bench ? bench.split(',').map(s => +s.trim()) : [];
  ck('and every BENCH pick too', benchPicks.length > 0 && benchPicks.every(p => owns.has(p)),
    benchPicks.filter(p => !owns.has(p)));
  ck('starters plus bench account for exactly the picks he owns, with no pick '
    + 'used twice', new Set(assigned.concat(benchPicks)).size === owns.size,
  { used: new Set(assigned.concat(benchPicks)).size, owns: owns.size });
}

// ── 4. THE ANSWER THAT CHANGED, ASSERTED AS SHAPE NOT AS DIGITS ─────────
// Pinning "QB at 73" would break the day a projection moves, and that is the
// wrong kind of guard. Pin the ORDERING the fix produced.
{
  const slotAt = s => {
    const m = OUT.match(new RegExp('^\\s*(\\d+)\\s+' + s + '\\s', 'm'));
    return m ? +m[1] : null;
  };
  const qb = slotAt('QB'), te = slotAt('TE');
  ck('the QB and TE are both placed', qb != null && te != null, { qb: qb, te: te });
  ck('the TIGHT END now comes BEFORE the quarterback — the ordering the old '
    + 'schedule had backwards', te < qb, { te: te, qb: qb });
  ck('and the quarterback is NOT taken at Cory\'s first pick, which is what the '
    + 'forfeited-pick schedule recommended', qb !== PO.my_picks[0], qb);
}

// ── 5. THE STABILITY CLAIM IS DERIVED, NOT TYPED ────────────────────────
// It used to print "the plan does not move at all on the negative side"
// unconditionally. That was true of the old schedule — because picks 8/13/28 are
// too early for any plausible drift to reach — and false of the real one.
{
  const src = fs.readFileSync(TOOL, 'utf8');
  ck('the robustness verdict is computed from the drift rows',
    /const\s+stableNeg\s*=/.test(src) && /plans\.push/.test(src));
  /* THE REASSURANCE STILL EXISTS IN THE SOURCE — it is the correct thing to
   * print when the plan really is stable on the negative side. What must be
   * true is that it is GUARDED, and the behavioural form of that is: it must
   * not appear in output that also reports instability. Asserting the string
   * were absent would have been wrong, and was: my first version of this check
   * failed against correct code. */
  ck('the reassurance is inside a conditional rather than printed unconditionally',
    /if\s*\(stableNeg\s*&&\s*!stablePos\)\s*\{[\s\S]{0,120}ASYMMETRY FAVOURS US/.test(src));
  ck('and it is NOT printed alongside an instability warning — the two are '
    + 'mutually exclusive claims about the same table',
  !(/ASYMMETRY FAVOURS US/.test(OUT) && /NOT STABLE/.test(OUT)),
  { reassures: /ASYMMETRY FAVOURS US/.test(OUT), warns: /NOT STABLE/.test(OUT) });
  const rows = [...OUT.matchAll(/^\s+[+-]?\d+%\s+.*?(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/gm)];
  ck('the drift table still prints its rows (non-vacuity)', rows.length >= 5, rows.length);
  const varies = new Set(rows.map(r => r[1] + '/' + r[2] + '/' + r[3] + '/' + r[4])).size > 1;
  ck('the plan DOES move under drift on the real schedule, so an unconditional '
    + '"it never moves" would now be a false reassurance', varies,
  rows.map(r => r.slice(1, 5).join('/')));
  ck('and the output says so, pointing the reader at the slot ORDER instead of '
    + 'the pick numbers', /NOT STABLE/.test(OUT) && /slot ORDER/.test(OUT),
  (OUT.match(/.*NOT STABLE.*/) || [''])[0].slice(0, 120));
}

// ── 6. THE COUNTERFACTUAL IS STILL PRICED ───────────────────────────────
// This is the number Cory actually acts on: what does moving the QB up cost?
/* RE-PINNED 2026-08-17. These pins measured the QB-at-73 plan: four earlier
 * owned picks in the table, one of them an equal-optimum zero. The 08-17
 * board rebuild (executing Cory's same-day rulings — opportunity layer
 * removed, measured p90 ceilings, refreshed projections) lifted the QB
 * shelf and the DP moved the quarterback from pick 73 to pick 48, Cory's
 * SECOND pick — so exactly ONE earlier pick remains to price and the
 * printed table (which by construction lists only picks BEFORE the chosen
 * one) can no longer contain a zero row. `costs.length >= 3` was really
 * pinning "the QB goes late", which is the board's answer, not the tool's
 * property. The properties that are the tool's: the table prices EVERY
 * owned pick before the chosen one (completeness, now exact instead of
 * >=3), and the chosen pick itself re-solves to a cost of exactly zero —
 * asserted through the tool's own exported solver, since the ruling board
 * moved that row out of the printed table. */
{
  const costs = [...OUT.matchAll(/QB at pick\s+(\d+)\s+costs\s+([\d.]+)/g)]
    .map(m => ({ pick: +m[1], cost: +m[2] }));
  const planQB = +(OUT.match(/^\s+(\d+)\s+QB\s/m) || [])[1];
  const before = PO.my_picks.filter(p => p < planQB);
  ck('the DP\'s QB pick is readable from the plan (or nothing below means anything)',
    Number.isFinite(planQB) && PO.my_picks.includes(planQB), planQB);
  ck('the cost of taking the QB earlier is priced at EVERY owned pick before '
    + 'the chosen one — the table is complete, however many rows the board '
    + 'leaves it', before.length >= 1
    && costs.map(c => c.pick).join(',') === before.join(','),
  { priced: costs.map(c => c.pick), owned_before: before });
  ck('every one of those picks is a pick Cory owns',
    costs.every(c => PO.my_picks.includes(c.pick)), costs.map(c => c.pick));
  ck('taking the QB at his FIRST pick carries a real, non-zero cost — the old '
    + 'schedule made that the plan', (costs.find(c => c.pick === PO.my_picks[0]) || {}).cost > 0,
  costs.find(c => c.pick === PO.my_picks[0]));
  // The zero lives AT the chosen pick, by the solver's own arithmetic: pin the
  // QB slot there and re-solve — the total must be the optimum exactly.
  const M = require(TOOL);
  const qbSlot = M.open.findIndex(o => o.slot === 'QB');
  const chosen = M.plan.find(p => p.slot === 'QB');
  const forced = M.solve(M.valueMatrix(0, null),
    { slotIdx: qbSlot, pickIdx: M.SCHED.indexOf(chosen.pick) });
  ck('and the cost falls to zero at the pick the DP actually chose, which is '
    + 'what makes the table a decision rather than a warning',
  chosen.pick === planQB && Math.abs(M.best - forced.total) < 1e-9,
  { chosen: chosen.pick, best: M.best, forced: forced.total });
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the schedule is read from the board rather than typed,');
console.log('the tool refuses instead of guessing when it is missing, every pick in the plan');
console.log('is one Cory owns, the tight-end-before-quarterback ordering is pinned, and the');
console.log('robustness verdict is derived from the drift rows rather than asserted.');
console.log('WHAT IT DOES NOT: establish that the DP\'s plan is the right plan. It assumes the');
console.log('room drafts in ADP order and it does not price the bench — and our room is known');
console.log('to take quarterbacks 4-15 picks ahead of market ADP, which this does not model.');
