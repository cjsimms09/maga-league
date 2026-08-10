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
//
// LENGTH IS NOT AN ADEQUATE WITNESS, which is why the memo keys on an explicit
// monotonic version instead. Length collides in exactly the ways a draft
// produces: remove one player and restore another and the count is unchanged;
// flip a flag or re-sort and it never moved at all. A stale survival table is
// SILENT AND WRONG — strictly worse than slow, because the model's whole job is
// saying who will still be there.
{
  const bd = board(60);
  const t = team(3);
  const victim = bd.find(x => x.position === 'WR' && x.vorp > 100) || bd[2];
  const other = bd.filter(x => x.position === 'WR' && x !== victim)[0];

  const before = S.withinPositionProbability(victim, bd, t);
  check('baseline: an in-pool player has a real probability', before > 0);

  // 1. REMOVAL, length changes.
  const otherBefore = S.withinPositionProbability(other, bd, t);
  bd.splice(bd.indexOf(victim), 1);
  S.bumpBoard(bd);
  const otherAfter = S.withinPositionProbability(other, bd, t);
  check('removing a player IN PLACE invalidates the pool (mass redistributes)',
    otherAfter !== otherBefore, 'before=' + otherBefore + ' after=' + otherAfter);

  // 2. RESTORE, the undo path.
  bd.push(victim); S.bumpBoard(bd);
  const backAgain = S.withinPositionProbability(other, bd, t);
  check('pushing a player BACK (the undo path) invalidates the pool again',
    backAgain !== otherAfter, 'after=' + otherAfter + ' back=' + backAgain);

  // 3. THE CASE LENGTH CANNOT SEE: swap one player for another. Count is
  //    identical before and after, so a length fingerprint would serve the
  //    stale pool and the newcomer would be invisible to the model forever.
  const wrs = bd.filter(x => x.position === 'WR');
  const dropped = wrs[1];
  const lenBefore = bd.length;
  bd.splice(bd.indexOf(dropped), 1);
  const newcomer = { player_id: 'NEW1', name: 'Newcomer', position: 'WR',
                     vorp: 999, proj_mean: 999, adjusted_adp: 1,
                     adp_sd: 4, adp_source: 'ffc' };
  bd.push(newcomer);
  S.bumpBoard(bd);
  check('setup: the swap left the board length UNCHANGED (length is blind here)',
    bd.length === lenBefore, lenBefore + ' -> ' + bd.length);
  const nProb = S.withinPositionProbability(newcomer, bd, t);
  check('a SAME-LENGTH swap invalidates: the newcomer is seen, not cached away',
    nProb > 0.01, 'newcomer probability=' + nProb);

  // 4. THE OTHER CASE LENGTH CANNOT SEE: an in-place value edit. No membership
  //    change at all — a projection update, a news override.
  const target = bd.filter(x => x.position === 'RB')[3];
  const pre = S.withinPositionProbability(target, bd, t);
  target.vorp = 10000;
  S.bumpBoard(bd);
  const post = S.withinPositionProbability(target, bd, t);
  check('an IN-PLACE value edit invalidates (no membership change at all)',
    post > pre, 'before=' + pre + ' after=' + post);
}

// --- (b) THE THREE SHAPES A LENGTH FINGERPRINT IS BLIND TO -------------------
//
// Named explicitly because they are the cases that motivated replacing the
// length witness, and each one is a real draft action:
//   push-then-splice netting zero  -> mark a pick, then undo a different one
//   in-place FLAG mutation         -> a news override / off-board toggle
//   same-length swap               -> covered above
// In all three the count is identical before and after, so length cannot see
// them and a stale survival table would be served with full confidence.
{
  const bd = board(60);
  const t = team(8);

  // PUSH-THEN-SPLICE NETTING ZERO.
  const rb = bd.filter(x => x.position === 'RB')[2];
  const pre = S.withinPositionProbability(rb, bd, t);
  const len0 = bd.length;
  const added = { player_id: 'ZED', name: 'Zed', position: 'RB', vorp: 5000,
                  proj_mean: 5000, adjusted_adp: 1, adp_sd: 4, adp_source: 'ffc' };
  bd.push(added);                              // +1
  const gone = bd.filter(x => x.position === 'RB' && x !== rb && x !== added)[0];
  bd.splice(bd.indexOf(gone), 1);              // -1  -> net zero
  S.bumpBoard(bd);
  check('setup: push-then-splice netted ZERO change in length',
    bd.length === len0, len0 + ' -> ' + bd.length);
  const post = S.withinPositionProbability(rb, bd, t);
  check('a push-then-splice netting zero still invalidates (a 5000-vorp RB appeared)',
    post !== pre, 'before=' + pre + ' after=' + post);

  // IN-PLACE FLAG MUTATION — no membership change, no length change, no value
  // change; just a boolean the board carries.
  const wr = bd.filter(x => x.position === 'WR')[1];
  const flagPre = S.withinPositionProbability(wr, bd, t);
  wr.off_board = true;
  wr.vorp = wr.vorp - 40;        // what a news override actually does downstream
  S.bumpBoard(bd);
  const flagPost = S.withinPositionProbability(wr, bd, t);
  check('an in-place FLAG/override mutation invalidates the cached pool',
    flagPost !== flagPre, 'before=' + flagPre + ' after=' + flagPost);
}

// --- (b) THE BUMP IS THE CONTRACT: a missed bump must be DETECTABLE ----------
//
// Correctness now rests on every mutation site calling bumpBoard(). That is a
// property worth asserting directly rather than trusting, so the memo keeps a
// belt-and-braces length check whose only job is to COUNT how often it saves us.
// A non-zero count means some mutation path forgot its bump — a correctness
// bug wearing a performance bug's clothes.
{
  const bd = board(40);
  const t = team(4);
  S.resetMemoStats();
  bd.forEach(p => S.withinPositionProbability(p, bd, t));
  check('a correctly-bumped workload never trips the stale-length backstop',
    S.memoStats().staleLengthCatches === 0,
    'staleLengthCatches=' + S.memoStats().staleLengthCatches);

  // Now mutate WITHOUT bumping — the defect this backstop exists to expose.
  bd.push({ player_id: 'X9', name: 'Unbumped', position: 'RB',
            vorp: 500, proj_mean: 500, adjusted_adp: 2, adp_sd: 4, adp_source: 'ffc' });
  S.withinPositionProbability(bd[0], bd, t);
  check('a MISSED bump is caught and counted, not silently served',
    S.memoStats().staleLengthCatches === 1,
    'staleLengthCatches=' + S.memoStats().staleLengthCatches);
  S.bumpBoard(bd);
}

// --- versions are monotonic --------------------------------------------------
{
  const bd = board(10);
  const v0 = S.boardVersion(bd);
  const v1 = S.bumpBoard(bd);
  const v2 = S.bumpBoard(bd);
  check('board versions increase monotonically and never repeat',
    v1 === v0 + 1 && v2 === v1 + 1, [v0, v1, v2].join(','));
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
  // POOL + TAIL = 1, not pool = 1. The pool deliberately keeps only
  // (1 - WITHIN_POS_TAIL_P); the reserved remainder is SHARED by everyone outside
  // the candidate pool. Asserting pool == 1 was the old invariant and it is
  // exactly what broke conservation: with the tail ALSO getting a constant each,
  // a position summed to 1 + 0.01 x tailCount (7.6x for WR), so the board's
  // expected departures scaled with the size of the tail instead of the number of
  // picks (Cory, 2026-08-10). The distribution is pool + tail.
  const TAIL = S.CFG.WITHIN_POS_TAIL_P;
  check('in-pool mass at each position is exactly (1 - tail budget)',
    Object.keys(sums).every(k => Math.abs(sums[k] - (1 - TAIL)) < 1e-9),
    JSON.stringify(sums));
  check('pool + tail sums to exactly 1 (the real conservation law)',
    Object.keys(sums).every(k => Math.abs((sums[k] + TAIL) - 1) < 1e-9),
    JSON.stringify(sums));
}

console.log(`\n${pass}/${pass + fail} survival-memo checks passed`);
process.exit(fail ? 1 : 0);
