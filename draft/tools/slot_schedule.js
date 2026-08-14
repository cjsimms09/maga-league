// TERRITORY: A
/* WHEN TO TAKE THE QB AND THE TE — AS AN ASSIGNMENT PROBLEM, NOT A RANKING.
 *
 * Cory, 2026-08-13: "come up with an equation that can help us determine when
 * the best time to take a QB or TE is based on what's left and what's available
 * at the time to maximize value... Besides those 2 grabs the rest is really just
 * taking best available WR or RB and K and DEF at the very end."
 *
 * ── THE EQUATION, AND WHY VONA GETS IT WRONG ────────────────────────────────
 *
 * You take exactly ONE quarterback. If you take him at pick 8 your RB/WR picks
 * are 13, 28, 33...; if you take him at 148 they are 8, 13, 28... The COUNT is
 * identical either way -- only the QUALITY shifts, and it shifts by one pick
 * across every remaining selection. So the trade is not level against level, it
 * is DROP-OFF against DROP-OFF, and the RB/WR side telescopes:
 *
 *     TAKE THE QB NOW RATHER THAN LATER IFF
 *     QBdrop(now -> later)  >  RBWRdrop(now -> later)
 *
 * VONA compares ONE-STEP drops at the CURRENT pick, which is why Josh Allen's
 * 33.6 beats a receiver's 12.7 and the engine takes a quarterback at 1.08.
 *
 * ⚠ THE NUMBERS HERE WERE WRONG AND ARE RESTATED. This read "QB falls 103
 * points, TE 101, RB/WR 139", measured across the OLD fifteen-pick schedule --
 * which began at pick 8, three picks Cory forfeited for his keepers. Measured
 * across the picks he actually owns (33 -> 148), best-available falls:
 *
 *     QB 69   ·   RB 87   ·   WR 72   ·   TE 52   ·   best-of-RB/WR 73
 *
 * The comparison still inverts -- RB/WR falls faster than QB -- but by 4 points
 * across the whole draft, not 36. It is a thin edge, not the wide one that was
 * claimed, and the DP below is the thing to read rather than this ratio: it
 * puts the QB at 73 and prices taking him at 33 at 11.1 points of lineup.
 *
 * ── AND THE REAL PROBLEM IS SMALLER THAN THE DRAFT ──────────────────────────
 *
 * Starters are QB1 RB2 WR2 TE1 FLEX1 K1 DEF1. Cory's keepers already fill
 * RB1, RB2 and WR1, so only SIX starting slots remain -- QB, WR2, TE, FLEX,
 * K, DEF -- against TWELVE picks. SIX PICKS ARE BENCH, and under the current
 * model a bench player is worth nothing (measured: swapping a wasted third QB
 * for a receiver moved the season score -1.74, inside noise).
 *
 * ⚠ IT WAS FIFTEEN PICKS UNTIL 2026-08-14, AND THAT WAS THE BUG. `SCHED` was
 * the literal [8, 13, 28, 33, ...] = `my_picks_BEFORE_keepers`. Picks 8, 13 and
 * 28 are the rounds forfeited FOR Henry, Chase and Walker; the board lists them
 * by name under `pick_order.forfeited`. The keepers were subtracted from the
 * SLOTS (correctly, and derived) and not from the PICKS, so one side of the
 * assignment knew about them and the other did not, and three of the six
 * starters were placed in picks Cory does not own.
 *
 * IT INVERTED THE ANSWER. Old: TE at 13, QB at 33, total 1325.5. Real: TE at
 * 33, QB at 73, total 1178.4 -- and taking the QB at 33 now COSTS 11.1 points
 * rather than being the plan. The old plan also read as rock-stable under drift,
 * which was an artifact of picks 8/13/28 being too early for drift to reach.
 *
 * So the question is exactly: WHICH SIX PICKS BUY THE SIX SLOTS. That is a
 * linear assignment problem, solved here exactly by DP over 15 picks x 2^6
 * slot-states -- 960 states, not a heuristic.
 *
 * ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
 *
 * It does NOT price the bench, so it will happily leave the last nine picks
 * unspecified -- "best available RB/WR" is the right default and this tool does
 * not pretend to improve on it. It cannot until proj_sd is real, because bench
 * value is optionality and optionality needs a distribution.
 * It assumes the room drafts in ADP order. It uses expected best-available, not
 * a distribution over it, so it is risk-neutral about a run at a position.
 *
 * ── VERIFIED, NOT TRUSTED ───────────────────────────────────────────────────
 *
 * The DP was checked against BRUTE FORCE over every assignment of six slots to
 * my picks -- 665,280 of them on the real twelve-pick schedule. A dynamic
 * program that silently finds a local optimum would have looked exactly as
 * convincing.
 *
 * AND THE BRUTE FORCE DID NOT SAVE US FROM THE SCHEDULE BUG, which is the
 * lesson worth keeping: it agreed with the DP to the decimal on the WRONG pick
 * set. Two methods agreeing on the wrong question is not verification, it is
 * two witnesses to the same mistake.
 *
 * AND THE BRUTE FORCE EXPOSED A TIE THE DP HID: it placed DEF at 48 and K at 53
 * where the DP placed them at 108 and 113, for the SAME TOTAL. The best
 * available kicker and defence do not change across that range, so THE MODEL IS
 * INDIFFERENT ABOUT K/DEF TIMING and the pick numbers it prints for them carry
 * no information. Since bench picks have unmodelled value, taking K and DEF LAST
 * is weakly dominant -- which is Cory's rule, and the tool does not contradict
 * it so much as fail to see it.
 *
 * Run: node draft/tools/slot_schedule.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));

const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const keep = KEEP.keepersFrom(DATA);
/* THE PICKS CORY ACTUALLY OWNS — READ, NOT TYPED.
 *
 * This was the literal [8, 13, 28, 33, 48, ...], which is `my_picks_BEFORE_
 * keepers`. Picks 8, 13 and 28 are the first-, second- and third-round slots
 * FORFEITED for Derrick Henry, Ja'Marr Chase and Kenneth Walker — the board
 * lists them under `pick_order.forfeited` by name. So the schedule spent three
 * picks that do not exist, and the optimum it reported (1325.5) placed three of
 * its six starters in them: FLEX at 8, TE at 13, WR at 28.
 *
 * The tell was already in this file. Twelve lines down, the open-slot list is
 * derived from the keepers with the comment "Derived, not typed: a hand-written
 * list would drift the moment the keepers change" — and it is right. The same
 * keepers were subtracted from the SLOTS and not from the PICKS, so one side of
 * the assignment knew about them and the other did not.
 *
 * The brute-force check did not catch it: it verified the DP against the same
 * wrong pick set, and agreeing on the wrong question is not verification. */
const SCHED = (DATA.pick_order || {}).my_picks;
if (!Array.isArray(SCHED) || !SCHED.length) {
  throw new Error('REFUSING to plan: pick_order.my_picks is missing from the board. '
    + 'The previous literal was my_picks_before_keepers and spent three forfeited '
    + 'picks; guessing a schedule is how that happened.');
}

/* WHICH STARTING SLOTS ARE STILL OPEN, given the keepers. Derived, not typed:
 * a hand-written list would drift the moment the keepers change. */
const STARTERS = (DATA.league || {}).starters || {};
const FLEX_POS = ['RB', 'WR', 'TE'];
const held = {};
keep.forEach(k => { held[k.position] = (held[k.position] || 0) + 1; });
const open = [];
Object.keys(STARTERS).forEach(pos => {
  if (pos === 'FLEX') return;
  const need = (STARTERS[pos] || 0) - (held[pos] || 0);
  for (let i = 0; i < need; i++) open.push({ slot: pos, elig: [pos] });
});
const flexUsed = FLEX_POS.reduce((n, p) =>
  n + Math.max(0, (held[p] || 0) - (STARTERS[p] || 0)), 0);
for (let i = 0; i < Math.max(0, (STARTERS.FLEX || 0) - flexUsed); i++) {
  open.push({ slot: 'FLEX', elig: FLEX_POS });
}

console.log('WHEN TO TAKE THE QB AND THE TE\n');
console.log('  keepers: ' + keep.map(k => k.name + ' (' + k.position + ')').join(', '));
console.log('  starting slots still to fill: ' + open.map(o => o.slot).join(', ')
  + '   (' + open.length + ' of ' + SCHED.length + ' picks)');
console.log('  the other ' + (SCHED.length - open.length) + ' picks are bench, and bench is '
  + 'best-available RB/WR\n');

/* Expected best available at each pick for each slot. Room drafts in ADP order. */
const val = SCHED.map(p => {
  const gone = new Set(byAdp.slice(0, p - 1).map(x => String(x.player_id)));
  const av = pool.filter(x => !gone.has(String(x.player_id)));
  return open.map(o => {
    const b = av.filter(x => o.elig.indexOf(x.position) >= 0)
      .sort((m, n) => (n.proj_mean || 0) - (m.proj_mean || 0))[0];
    return b ? { v: b.proj_mean, name: b.name, pos: b.position } : { v: 0, name: '-', pos: '-' };
  });
});

/* EXACT, BY DP. state = bitmask of slots filled. 15 picks x 64 states. */
const N = SCHED.length, S = open.length, FULL = (1 << S) - 1;
const dp = Array.from({ length: N + 1 }, () => new Float64Array(1 << S).fill(-1));
const prev = Array.from({ length: N + 1 }, () => new Int32Array(1 << S).fill(-2));
dp[0][0] = 0;
for (let i = 0; i < N; i++) {
  for (let m = 0; m <= FULL; m++) {
    if (dp[i][m] < 0) continue;
    if (dp[i + 1][m] < dp[i][m]) { dp[i + 1][m] = dp[i][m]; prev[i + 1][m] = -1; }  // bench
    for (let s = 0; s < S; s++) {
      if (m & (1 << s)) continue;
      const nm = m | (1 << s), nv = dp[i][m] + val[i][s].v;
      if (nv > dp[i + 1][nm]) { dp[i + 1][nm] = nv; prev[i + 1][nm] = s; }
    }
  }
}
const plan = [];
let m = FULL;
for (let i = N; i > 0; i--) {
  const s = prev[i][m];
  if (s >= 0) { plan.unshift({ pick: SCHED[i - 1], slot: open[s].slot, ...val[i - 1][s] }); m ^= (1 << s); }
}
console.log('  OPTIMAL ASSIGNMENT — total starting value ' + dp[N][FULL].toFixed(1) + '\n');
console.log('  pick   slot    take                      proj');
plan.forEach(p => console.log('  ' + String(p.pick).padStart(4) + '   ' + p.slot.padEnd(7)
  + (p.pos + ' ' + p.name).padEnd(26) + p.v.toFixed(1)));
const benchPicks = SCHED.filter(p => !plan.some(x => x.pick === p));
console.log('\n  bench picks (best available RB/WR): ' + benchPicks.join(', '));

/* ── ROBUSTNESS: DOES THE PLAN SURVIVE THE ROOM NOT DRAFTING AT ADP? ────────
 *
 * The whole equation rests on projecting who is still there at each of my picks.
 * WE KNOW THAT PROJECTION IS WRONG -- src/calibration_drift.js measures survival
 * OVER-PREDICTING DEPARTURES by 15-57%, i.e. players last LONGER than modelled.
 * A plan that only holds at exactly-ADP is not a plan, it is a coincidence.
 *
 * `drift` is how much deeper the room has actually gone by each of my picks:
 * negative = the room reaches less deep and players survive longer (THE KNOWN
 * BIAS DIRECTION), positive = players go faster than ADP. */
{
  const DRIFTS = [[-0.25, 'room reaches 25% LESS deep'], [-0.15, '15% less deep'],
    [0, 'exactly ADP'], [0.15, '15% deeper (players go faster)'],
    [0.25, '25% deeper'], [0.5, '50% deeper']];
  const plans = [];
  console.log('\n  ROBUSTNESS — the plan under a mis-projected room:');
  console.log('    drift   meaning                          QB    TE    WR  FLEX    total');
  DRIFTS.forEach(([d, lbl]) => {
    const v2 = SCHED.map(p => {
      const cut = Math.max(0, Math.round((p - 1) * (1 + d)));
      const gone = new Set(byAdp.slice(0, cut).map(x => String(x.player_id)));
      const av = pool.filter(x => !gone.has(String(x.player_id)));
      return open.map(o => {
        const b = av.filter(x => o.elig.indexOf(x.position) >= 0)
          .sort((m, n) => (n.proj_mean || 0) - (m.proj_mean || 0))[0];
        return b ? b.proj_mean : 0;
      });
    });
    const d2 = Array.from({ length: N + 1 }, () => new Float64Array(1 << S).fill(-1));
    const p2 = Array.from({ length: N + 1 }, () => new Int32Array(1 << S).fill(-2));
    d2[0][0] = 0;
    for (let i = 0; i < N; i++) for (let m = 0; m <= FULL; m++) {
      if (d2[i][m] < 0) continue;
      if (d2[i + 1][m] < d2[i][m]) { d2[i + 1][m] = d2[i][m]; p2[i + 1][m] = -1; }
      for (let s = 0; s < S; s++) {
        if (m & (1 << s)) continue;
        const nm = m | (1 << s), nv = d2[i][m] + v2[i][s];
        if (nv > d2[i + 1][nm]) { d2[i + 1][nm] = nv; p2[i + 1][nm] = s; }
      }
    }
    const where = {}; let m = FULL;
    for (let i = N; i > 0; i--) { const s = p2[i][m]; if (s >= 0) { where[open[s].slot] = SCHED[i - 1]; m ^= (1 << s); } }
    console.log('    ' + String(d > 0 ? '+' + (d * 100) : d * 100).padStart(5) + '%  '
      + lbl.padEnd(32) + String(where.QB).padStart(4) + String(where.TE).padStart(6)
      + String(where.WR).padStart(6) + String(where.FLEX).padStart(6)
      + String(d2[N][FULL].toFixed(0)).padStart(9));
    plans.push({ d: d, QB: where.QB, TE: where.TE, WR: where.WR, FLEX: where.FLEX });
  });

  /* THE STABILITY CLAIM IS NOW COMPUTED, BECAUSE THE TYPED ONE WENT STALE.
   *
   * This used to print "THE ASYMMETRY FAVOURS US: the plan does not move at all
   * on the negative side" unconditionally. That was TRUE of the old schedule and
   * FALSE of the real one — and the old schedule spent three forfeited picks, so
   * its stability was an artifact of planning around picks 8/13/28, which are so
   * early that no plausible drift changes what is there. Remove them and the
   * plan moves on both sides.
   *
   * A sentence that reassures the reader regardless of the numbers above it is
   * the same failure as a badge on an uninstalled term. So it is derived. */
  const base = plans.find(p => p.d === 0) || plans[0];
  const same = p => p.QB === base.QB && p.TE === base.TE
    && p.WR === base.WR && p.FLEX === base.FLEX;
  const neg = plans.filter(p => p.d < 0), pos = plans.filter(p => p.d > 0);
  const stableNeg = neg.every(same), stablePos = pos.every(same);
  if (stableNeg && !stablePos) {
    console.log('    THE ASYMMETRY FAVOURS US: the plan does not move on the negative');
    console.log('    side, which is the direction survival is known to err.');
  } else if (stableNeg && stablePos) {
    console.log('    THE PLAN IS STABLE in both directions across the drifts tested.');
  } else {
    console.log('    ⚠ THE PLAN IS NOT STABLE — it moves under drift on the '
      + (stablePos ? 'negative side' : (stableNeg ? 'positive side' : 'BOTH sides'))
      + '.');
    console.log('    Carry the slot ORDER into the room, not these pick numbers: the');
    console.log('    assignment reshuffles under drift while the shape holds, and a');
    console.log('    printed pick number implies a precision this does not have.');
  }
}

/* THE COUNTERFACTUAL THAT MAKES IT A DECISION RATHER THAN AN ANSWER. */
console.log('\n  WHAT TAKING THE QB EARLIER WOULD COST:');
const qbIdx = open.findIndex(o => o.slot === 'QB');
if (qbIdx >= 0) {
  const chosen = plan.find(p => p.slot === 'QB');
  SCHED.forEach((p, i) => {
    if (p >= chosen.pick) return;
    // force QB at pick i, re-solve the rest
    const d2 = Array.from({ length: N + 1 }, () => new Float64Array(1 << S).fill(-1));
    d2[0][0] = 0;
    for (let a = 0; a < N; a++) for (let mm = 0; mm <= FULL; mm++) {
      if (d2[a][mm] < 0) continue;
      if (a === i) { const nm = mm | (1 << qbIdx);
        if (!(mm & (1 << qbIdx)) && d2[a + 1][nm] < d2[a][mm] + val[a][qbIdx].v)
          d2[a + 1][nm] = d2[a][mm] + val[a][qbIdx].v;
        continue; }
      if (d2[a + 1][mm] < d2[a][mm]) d2[a + 1][mm] = d2[a][mm];
      for (let s = 0; s < S; s++) { if (s === qbIdx || (mm & (1 << s))) continue;
        const nm = mm | (1 << s);
        if (d2[a + 1][nm] < d2[a][mm] + val[a][s].v) d2[a + 1][nm] = d2[a][mm] + val[a][s].v; }
    }
    const loss = dp[N][FULL] - d2[N][FULL];
    console.log('    QB at pick ' + String(p).padStart(4) + '  costs '
      + loss.toFixed(1).padStart(7) + ' points of starting lineup');
  });
}
