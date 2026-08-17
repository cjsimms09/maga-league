/* THE 41% WALL — players fallen 25+ picks past ADP must NOT share one number.
 *
 * CORY'S CAPTURE, 2026-08-17 (resumed mock, 3 picks made, his pick 33, next 48):
 * EVERY top player at EVERY position — Nacua (adp ~3, fallen 30), Gibbs (adp 1,
 * fallen 32), Bowers, St. Brown, Lamb, McBride — printed exactly "41% gone by
 * your next pick", while a handful of NOT-fallen players differed (Jackson 5%,
 * Maye 4%, Loveland 7%). The survival chart labelled every line "0%".
 *
 * THE MECHANISM, so the fix is checkable rather than believed:
 *
 *   1. With `intervening` covering picks 34-47, Layer 2's windowEnd equals the
 *      target (48). The remainder leg then asks layer1TakenGivenAvailable for
 *      P(taken between 48 and 48 | alive at 48) — a ZERO-WIDTH window, whose
 *      true conditional is (F(48)−F(48))/(1−F(48)) = 0.
 *   2. But every fallen player has F ≥ 0.999 at any current pick, and the
 *      far-tail guard (`if (fC >= 0.999) return 1`) ran BEFORE the empty-window
 *      case: takenAfter = 1, "certainly taken inside a window nobody picks in".
 *   3. Composition: taken = 1 − survivesWindow × (1 − 1) = 1 EXACTLY — the room
 *      model's differentiated answer (Layer 2) was computed and then erased.
 *   4. Conservation tilt: adj_i = exp(−λ·w_i) with w_i = 1 − raw_i. Every
 *      fallen player had raw_i = 0, hence IDENTICAL w_i = 1, hence the SAME
 *      exp(−λ) for all of them — 0.59 on the live board, i.e. "41% gone" for
 *      six different players at four positions with ADPs from 1 to 20.
 *
 * WHERE THE MATH GENUINELY CONVERGES, THE CLOSED FORM IS PROVEN INSTEAD:
 * with NO intervening picks (the chart's later columns), survival is the
 * layer-1 conditional alone, and for a normal the far tail really does go to
 * zero — P(alive at n | alive at c) = Q(z_n)/Q(z_c), and for z_c ≥ 3, n > c,
 * the Mills-ratio bounds give Q(z_n)/Q(z_c) ≤ exp(−(z_n²−z_c²)/2)·(z_c/z_n)·
 * (1+1/z_c²) → the market model honestly claims "gone" there, and the CHART
 * (not the number) is what must carry that once — see warroom_charts.test.js.
 *
 * Run: node draft/tests/survival_fallen_uniform.test.js
 */
'use strict';
const S = require('../../public/js/draft/survival.js');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

// ── the captured board state, reconstructed ────────────────────────────────
const mk = (id, name, pos, adp, vorp, proj) =>
  ({ player_id: id, name, position: pos, adjusted_adp: adp, vorp, proj_mean: proj });

const FALLEN = [
  mk('gibbs', 'Jahmyr Gibbs', 'RB', 1, 90, 320),
  mk('nacua', 'Puka Nacua', 'WR', 3, 85, 310),
  mk('lamb', 'CeeDee Lamb', 'WR', 6, 80, 300),
  mk('stbrown', 'Amon-Ra St. Brown', 'WR', 8, 78, 295),
  mk('bowers', 'Brock Bowers', 'TE', 12, 70, 250),
  mk('mcbride', 'Trey McBride', 'TE', 20, 60, 235),
];
const NOT_FALLEN = [
  mk('jackson', 'Lamar Jackson', 'QB', 38, 65, 380),
  mk('maye', 'Drake Maye', 'QB', 55, 40, 340),
  mk('loveland', 'Colston Loveland', 'TE', 70, 20, 170),
];
const board = FALLEN.concat(NOT_FALLEN);
let did = 0;
['RB', 'WR', 'TE', 'QB'].forEach(pos => {
  for (let i = 0; i < 25; i++) {
    board.push(mk(pos + '_d' + (did++), pos + ' depth' + i, pos,
      36 + i * 6 + (pos === 'QB' ? 20 : 0), Math.max(0, 40 - i * 2), 200 - i * 5));
  }
});
const picks = [];
for (let i = 1; i <= 150; i++) picks.push({ overall: i, slot: ((i - 1) % 10) + 1 });
const CUR = 33, NEXT = 48;
const intervening = [];
for (let p = 34; p < NEXT; p++) {
  intervening.push({ team_slot: ((p - 1) % 10) + 1, pick_no: p, roster: [], profile: null, room: null });
}
const ctx = {
  board, currentPick: CUR, nextPick: NEXT, intervening,
  league: { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } },
  totalPicks: 150, runMultipliers: {}, pickBoard: picks, roundsLeft: 12,
};

// ── 1. the zero-width window is zero, whoever you ask about ────────────────
ck('P(taken in an EMPTY window) is 0, even for a player 30 picks past his ADP '
  + '(the guard-order defect: this returned 1)',
FALLEN.every(p => S.layer1TakenGivenAvailable(p, NEXT, NEXT, ctx) === 0),
FALLEN.map(p => S.layer1TakenGivenAvailable(p, NEXT, NEXT, ctx)));
ck('…and stays 0 through a same-pick ask at the current pick too',
  S.layer1TakenGivenAvailable(FALLEN[0], CUR, CUR, ctx) === 0);

// ── 2. the wall itself: fallen elites do NOT share one probability ─────────
const c = S.conservedSurvival(board, NEXT, ctx);
ck('CONTROL — the conservation tilt actually applied on this state',
  c && c.applied === true && c.picks === 14, c && { applied: c.applied, N: c.picks });
const fallenP = FALLEN.map(p => c.byId[String(p.player_id)]);
ck('CONTROL — every fallen elite got a conserved number', fallenP.every(v => v != null), fallenP);
const distinct = new Set(fallenP.map(v => v.toFixed(6))).size;
ck('players fallen 25+ picks do NOT collapse to ONE probability — the room '
  + 'model splits them (was: all exactly exp(−λ))',
distinct >= 4, { distinct, values: fallenP.map(v => +v.toFixed(4)) });
ck('…and none of them carries raw survival EXACTLY 0 while the room model has '
  + 'a differentiated answer',
FALLEN.every(p => S.survivalProbability(p, NEXT, ctx) > 0),
FALLEN.map(p => S.survivalProbability(p, NEXT, ctx)));
// The room model's ordering carries real information: a fallen TE2 (McBride,
// behind Bowers in every pool) must be safer than the consensus #1 pick.
ck('the split is the ROOM model\'s, not noise: the fallen TE2 outlasts the '
  + 'fallen consensus #1 RB',
c.byId.mcbride > c.byId.gibbs, { mcbride: c.byId.mcbride, gibbs: c.byId.gibbs });

// ── 3. not-fallen players keep differentiated numbers (they always did) ────
const nf = NOT_FALLEN.map(p => c.byId[String(p.player_id)]);
ck('not-fallen players remain differentiated (the 5%/4%/7% strays in the capture)',
  new Set(nf.map(v => v.toFixed(4))).size === 3, nf);

// ── 4. where the math DOES converge, prove it with the closed form ─────────
// Layer-1-only ctx (the chart's later columns: no board, no intervening).
const thin = { currentPick: CUR, runMultipliers: {}, pickBoard: picks };
const sd = S.adpSd; const cdf = S.normalCdf;
const Q = (z) => 1 - cdf(z, 0, 1);                    // normal tail (for small z)
const millsUpper = (zc, zn) =>                        // Q(zn)/Q(zc) upper bound
  Math.exp(-(zn * zn - zc * zc) / 2) * (zc / zn) * (1 + 1 / (zc * zc));
const converge = FALLEN.map(p => {
  const s = sd(p.adjusted_adp, null);
  const zc = (CUR - p.adjusted_adp) / s;              // 4.5σ … 15σ past ADP
  const zn = (68 - p.adjusted_adp) / s;
  return { name: p.name, zc: +zc.toFixed(1),
    bound: millsUpper(zc, zn),                        // closed-form ceiling
    model: S.survivalProbability(p, 68, thin) };      // what the code says
});
ck('CLOSED FORM — under the pure market model every fallen player\'s survival '
  + 'to p68 is bounded by the Mills ratio at ≤ 1e-9: the chart\'s zeros are the '
  + 'model\'s honest claim, not this defect',
converge.every(r => r.zc >= 4.5 && r.bound < 1e-9 && r.model < 1e-6), converge);

// ── 5. anti-regression: the fix must not have moved players the wall never touched
const mid = board.find(p => p.player_id === 'WR_d26' || p.adjusted_adp === 42) || board[15];
const rawMid = S.survivalProbability(mid, NEXT, ctx);
ck('a mid-board player (ADP ahead of the current pick) still gets a sane, '
  + 'in-range probability', rawMid > 0 && rawMid < 1, { adp: mid.adjusted_adp, rawMid });

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: a zero-width remainder window contributes zero hazard,');
console.log('so the room model\'s differentiated answer reaches the conservation tilt and');
console.log('fallen elites stop sharing one redistributed number. Where the market model');
console.log('genuinely converges to "gone" (layer-1-only far tail), the closed form above');
console.log('proves the convergence rather than asserting it.');
