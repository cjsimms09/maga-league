/* SURVIVAL MEMOISATION — the numbers must not move, and the work must not
 * come back.
 *
 * WHY THIS FILE EXISTS. Marking one opponent pick in the war room blocked the
 * main thread for 5.6-6.4 seconds, measured in the browser; ~5.5s of it was the
 * survival model rebuilding the same softmax denominators tens of thousands of
 * times. Across ~135 opponent picks that is roughly thirteen minutes of frozen
 * UI on draft night, and because the block is synchronous, taps landed during
 * it are DROPPED — which is the mechanism behind mock #2 finishing with a
 * roster that had silently drifted from the truth.
 *
 * The fix is pure memoisation: same arrays, same order, same accumulation, so
 * the floats are bit-identical and only the number of times they are computed
 * changes. That claim is worth exactly as much as its guard, so:
 *
 *   (a) THE GUARD          — work counters, asserted. If a memo is removed the
 *                            count moves and this fails. Deterministic, unlike
 *                            a wall-clock budget, which would flake in CI.
 *   (b) ANTI-OVERREACH     — the dangerous failure of a cache is not slowness,
 *                            it is a STALE READ. A mutated board and a changed
 *                            team must both defeat the memo, and the tests
 *                            below fail if either one is served from cache.
 *   (c) SPEC-CONFORMANCE   — memoised and unmemoised paths must agree exactly.
 *
 * Run: node draft/tests/survival-memo.test.js
 */
'use strict';
const S = require('../../public/js/draft/survival.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
function board(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ player_id: 'p' + i, name: 'P' + i, position: POS[i % POS.length],
      vorp: 120 - i * 0.53 + (i % 7) * 1.7, proj_mean: 200 - i * 0.8,
      adjusted_adp: 1 + i * 0.9, adp_sd: 4 + (i % 9), adp_source: 'ffc' });
  }
  return out;
}
const team = (slot, name) => ({ team_slot: slot, pick_no: slot, roster: [],
  profile: { display_name: name || ('T' + slot) } });

// --- (a) THE GUARD: the board is sorted once per position, not once per player
{
  const bd = board(240);
  const t = team(1);
  S.resetMemoStats();
  bd.forEach(p => S.withinPositionProbability(p, bd, t));
  const st = S.memoStats();
  check('240 players scored -> the board is filtered+sorted ONCE PER POSITION',
    st.poolBuilds === POS.length, 'poolBuilds=' + st.poolBuilds + ' expected ' + POS.length);
  check('...and the softmax is built once per (position, team), not per player',
    st.posSoftmaxBuilds === POS.length, 'posSoftmaxBuilds=' + st.posSoftmaxBuilds);

  // The regression this replaces: 240 players used to mean 240 full board sorts.
  check('the per-player rebuild is gone (240 players != 240 sorts)',
    st.poolBuilds < 240 / 10, 'poolBuilds=' + st.poolBuilds);
}

// --- (a) THE GUARD, layer 2: one softmax per pool, not one per scored player
{
  const bd = board(240);
  const intervening = [];
  for (let p = 10; p < 34; p++) intervening.push(team((p % 10) + 1));
  intervening.forEach((t, i) => { t.pick_no = 10 + i; });
  const ctx = { board: bd, currentPick: 10, totalPicks: 150, roundsLeft: 10,
    league: { teams: 10 }, intervening };

  S.resetMemoStats();
  bd.forEach(p => S.layer2Taken(p, 34, ctx));
  const st = S.memoStats();
  // 24 steps x <=6 positions is the ceiling; per-player would be ~240x that.
  check('layer 2 builds at most one pool-softmax per (step, position)',
    st.poolSoftmaxBuilds <= 24 * POS.length,
    'poolSoftmaxBuilds=' + st.poolSoftmaxBuilds + ' ceiling ' + 24 * POS.length);
  check('...which is far below the per-player cost it replaced',
    st.poolSoftmaxBuilds < 240 * 24 / 10, 'poolSoftmaxBuilds=' + st.poolSoftmaxBuilds);
}

// --- (b) ANTI-OVERREACH: a changed TEAM must not read another team's softmax
{
  const bd = board(120);
  // Two managers with opposite reach behaviour produce different precisions,
  // hence genuinely different within-position probabilities.
  const calm = team(1, 'Calm');
  calm.profile.reach_delta = { mean: -8 };
  const reacher = team(2, 'Reacher');
  reacher.profile.reach_delta = { mean: 12 };

  const p = bd.find(x => x.position === 'RB');
  const a = S.withinPositionProbability(p, bd, calm);
  const b = S.withinPositionProbability(p, bd, reacher);
  check('two DIFFERENT managers get different probabilities (no cross-team reuse)',
    a !== b, 'calm=' + a + ' reacher=' + b);

  // And re-asking the first team still gives the first answer.
  check('re-querying the first manager returns HIS number, not the last one cached',
    S.withinPositionProbability(p, bd, calm) === a,
    a + ' vs ' + S.withinPositionProbability(p, bd, calm));
}

// --- (b) ANTI-OVERREACH: a MUTATED board must not be served from cache -------
{
  // app.js:3441 pushes onto state.board in place when a pick is undone. If the
  // memo keyed on array identity alone, the restored player would stay missing
  // from the pool and read as un-takeable forever.
  const bd = board(60);
  const t = team(3);
  const victim = bd.find(x => x.position === 'WR' && x.vorp > 100) || bd[2];
  const before = S.withinPositionProbability(victim, bd, t);
  check('baseline: an in-pool player has a real probability', before > 0);

  // Remove him in place, then score a different WR: the pool must be rebuilt.
  const other = bd.filter(x => x.position === 'WR' && x !== victim)[0];
  const otherBefore = S.withinPositionProbability(other, bd, t);
  bd.splice(bd.indexOf(victim), 1);
  const otherAfter = S.withinPositionProbability(other, bd, t);
  check('removing a player IN PLACE invalidates the pool (mass redistributes)',
    otherAfter !== otherBefore, 'before=' + otherBefore + ' after=' + otherAfter);

  // Put him back — the undo path — and the pool must notice him again.
  bd.push(victim);
  const backAgain = S.withinPositionProbability(other, bd, t);
  check('pushing a player BACK (the undo path) invalidates the pool again',
    backAgain !== otherAfter, 'after=' + otherAfter + ' back=' + backAgain);
}

// --- (c) SPEC-CONFORMANCE: memoised == freshly computed ----------------------
{
  // A cold module and a warm one must agree exactly. Scoring the same board
  // twice through a warm cache must also be exactly stable.
  const bd = board(180);
  const t = team(5);
  const first = bd.map(p => S.withinPositionProbability(p, bd, t));
  const second = bd.map(p => S.withinPositionProbability(p, bd, t));
  check('a warm cache returns bit-identical values on the second pass',
    first.every((v, i) => Object.is(v, second[i])));

  // Same board contents, fresh array object => no cache => same numbers.
  const fresh = bd.slice();
  const third = fresh.map(p => S.withinPositionProbability(p, fresh, t));
  check('an uncached board of identical contents gives bit-identical values',
    first.every((v, i) => Object.is(v, third[i])),
    first.findIndex((v, i) => !Object.is(v, third[i])) + '');
}

// --- the probabilities are still probabilities -------------------------------
{
  const bd = board(150);
  const t = team(7);
  const vals = bd.map(p => S.withinPositionProbability(p, bd, t));
  check('every within-position probability is in [0,1]',
    vals.every(v => v >= 0 && v <= 1));
  // Per position, the in-pool members must sum to <= 1 (the tail floor is for
  // players OUTSIDE the pool and is deliberately not part of that mass).
  const sums = {};
  bd.forEach((p, i) => {
    const sm = S.positionSoftmax(bd, p.position, t);
    if (sm.idxById.has(String(p.player_id))) {
      sums[p.position] = (sums[p.position] || 0) + vals[i];
    }
  });
  check('the in-pool mass at each position sums to 1 (it is a distribution)',
    Object.keys(sums).every(k => Math.abs(sums[k] - 1) < 1e-9),
    JSON.stringify(sums));
}

console.log(`\n${pass}/${pass + fail} survival-memo checks passed`);
process.exit(fail ? 1 : 0);
