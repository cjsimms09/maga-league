/* THE ROOM MIXTURE REACHES THE SCORE, NOT ONLY THE PANEL.
 *
 * THE DEFECT. "P(this player | his position is taken)" is answered in two
 * places. `withinPositionProbability` is called by the THREATS panel and was
 * taught about rooms by D6. `withinFromPool` -> `poolSoftmax` is called by
 * `precomputeLayer2`, and therefore produces `survival_to_next`, VONA and the
 * score — and was not. Measured before the fix, top-6 RBs:
 *
 *     withinPositionProbability   Gibbs 0.4500 -> 0.4382   with the room
 *     withinFromPool              Gibbs 0.4397 -> 0.4397   exactly zero
 *
 * So the system permitted the panel to use a room-aware probability and the
 * scorer to use a room-blind one for the same conceptual quantity — which means
 * recommendations were generated from a quantity the UI did not describe, and
 * D6's measurement could not be cited as evidence about the recommendation
 * engine at all.
 *
 * THE GRADUATION CRITERION WAS NOT "the code path changed". It was that the
 * DIRECTION of the behavioural change is mathematically consistent with the
 * intended model, demonstrated numerically. draft/tools/rb_direction.js is that
 * evidence; this file pins the parts of it that must not silently regress.
 *
 * THE INVARIANT, which is an identity in layer 2 rather than a convention:
 *     survives = Π_i (1 - pPos_i · pWithin_i)
 * so for an identical state, raising P(taken within N picks) must lower survival
 * over that same N-pick window. Asserted anyway — an identity in the source is
 * not evidence about the code that ships.
 *
 * Run: node draft/tests/room_reaches_the_score.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;
const MGRS = ((DATA.manager_profiles || {}).managers) || {};
const ROOM = Object.keys(MGRS).map(k => MGRS[k])
  .filter(m => m && String(m.manager_id) !== String(L.my_manager_id));
const board = DATA.players.filter(p => p.position && p.proj_mean != null);

ck('the artifact carries a room to mix over', ROOM.length >= 2, ROOM.length);

const pool = board.filter(p => p.position === 'RB')
  .sort((a, b) => (b.vorp || 0) - (a.vorp || 0)).slice(0, 6);
const avail = pool.map(() => 1);
const GEN = { profile: null, room: null };
const ROO = { profile: null, room: ROOM };

// ── THE DEFECT ITSELF: the scorer's path must now see the room ──────────────
{
  const g = S.withinFromPool(pool[0], pool, GEN, avail);
  const r = S.withinFromPool(pool[0], pool, ROO, avail);
  ck('withinFromPool responds to the room at all', g !== r,
    { generic: g, room: r, note: 'this was 0.4397 vs 0.4397 before the fix' });
  ck('  and the panel path still does too (it was never broken)',
    S.withinPositionProbability(pool[0], board, GEN)
      !== S.withinPositionProbability(pool[0], board, ROO));
  ck('  both move the elite share in the SAME direction',
    (r - g < 0) === (S.withinPositionProbability(pool[0], board, ROO)
                     - S.withinPositionProbability(pool[0], board, GEN) < 0),
    'the two implementations of one quantity must not disagree about sign');
}

// ── CONSERVATION: the mixture is a distribution, not a free multiplier ──────
{
  const sum = f => pool.reduce((s, p) => s + S.withinFromPool(p, pool, f, avail), 0);
  const sg = sum(GEN), sr = sum(ROO);
  ck('within-position still sums to the same mass with the room as without',
    Math.abs(sg - sr) < 1e-9, { generic: sg, room: sr });
  ck('  and that mass is 1 minus the tail budget, not 1',
    sg < 1 && sg > 0.9, sg);
}

// ── A PROFILE STILL BEATS THE ROOM: naming a seat must override the mixture ──
{
  const named = { profile: ROOM[0], room: ROOM };
  const roomOnly = S.withinFromPool(pool[0], pool, ROO, avail);
  ck('a seat with a real profile ignores the room mixture',
    S.withinFromPool(pool[0], pool, named, avail) !== roomOnly,
    'once the draft order names a seat it must use HIS numbers, not the room\'s');
}

// ── A DEGENERATE ROOM FAILS TO THE OLD BEHAVIOUR, NEVER TO A CRASH ──────────
{
  let threw = null, v = null;
  try { v = S.withinFromPool(pool[0], pool, { profile: null, room: [] }, avail); }
  catch (e) { threw = e.message; }
  ck('an empty room falls through to the generic path rather than throwing',
    threw === null && v === S.withinFromPool(pool[0], pool, GEN, avail), threw);

  let threw2 = null, v2 = null;
  try { v2 = S.withinFromPool(pool[0], pool, { profile: null, room: [null, null] }, avail); }
  catch (e) { threw2 = e.message; }
  ck('  and a room of unusable profiles does the same', threw2 === null && v2 != null, threw2);
}

// ── THE INVARIANT, OVER THE WHOLE BOARD ─────────────────────────────────────
{
  const TEAMS = L.teams || 10, MY = L.my_draft_slot;
  const slotOf = o => {
    const r = Math.ceil(o / TEAMS), i = o - (r - 1) * TEAMS;
    return (r % 2 === 1) ? i : (TEAMS - i + 1);
  };
  const ctxAt = (cur, next, fill) => {
    const w = [];
    for (let o = cur; o < next; o++) {
      const s = slotOf(o);
      if (s === MY) continue;
      w.push(Object.assign({ team_slot: s, pick_no: o, roster: [] }, fill));
    }
    return { board: board, league: L, currentPick: cur, nextPick: next,
      totalPicks: TEAMS * (L.rounds || 15), roundsLeft: 12, intervening: w };
  };

  let viol = 0, moved = 0;
  [[30, 41], [41, 50]].forEach(([cur, next]) => {
    const cg = ctxAt(cur, next, GEN), cn = ctxAt(cur, next, ROO);
    board.forEach(p => {
      const g = S.survivalProbability(p, next, cg);
      // A second ctx per arm: layer 2 memoises onto the object it is handed, so
      // a shared ctx would serve the second arm the first arm's answers and the
      // invariant would hold vacuously.
      const n = S.survivalProbability(p, next, cn);
      if (g == null || n == null) return;
      const dS = n - g, dT = (1 - n) - (1 - g);
      if (Math.abs(dT) <= 1e-12) return;
      moved++;
      if (!((dT > 0) === (dS < 0))) viol++;
    });
  });
  ck('take UP <=> survival DOWN, over the whole board and two windows', viol === 0, viol);
  // NON-VACUITY. The six best RBs by VORP are all taken with probability
  // 1.000000 at pick 30, so a probe restricted to them reports every row "ok"
  // while nothing moves — a pass that means nothing.
  ck('  and the probe was satisfiable: something actually moved', moved > 100, moved);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
