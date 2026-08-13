// TERRITORY: A
/* THE BENCH BRANCH HAS AN ANCHOR — regression guard.
 *
 * THIS FILE USED TO ASSERT THE OPPOSITE. It was a characterisation test written
 * on 2026-08-12 that pinned a live defect: with every starting slot filled,
 * `scorePlayer` takes its bench branch, and MEASURED_WEIGHTS zeroed four of that
 * branch's six terms. What was left was `0.5*stack + 1*keeper`, so the war room's
 * top recommendation from round 8 onward was whichever replacement-level player
 * happened to share an NFL team with somebody on my roster. Measured: reaches
 * (ADP > 250) on 111/240 simulated picks. Denzel Mims over Sam LaPorta, then
 * Josh Johnson, Joe Flacco, Tom Brady, Marcedes Lewis.
 *
 * The old file carried a retirement check instructing its own deletion the
 * moment the fix landed. The fix landed (Cory's option 1, 2026-08-12) and this
 * is that retirement: the same states, the assertions inverted, plus the two
 * controls that make an inverted assertion mean anything.
 *
 * THE FIX, so a reader does not have to go find it:
 *   · CFG.BENCH_CEILING_FLOOR floors the branch's anchor the way
 *     VALUE_WEIGHT_FLOOR floors the starter branch's. A branch's anchor is not a
 *     preference and no slider may switch it off.
 *   · the branch recomputes `upsideBonus` with the gate OPEN, because
 *     CEILING_LATE_FROM = 0.6 is a proxy for "the throwaway rounds" and the
 *     bench branch is the actual condition. The proxy said "not late" through
 *     rounds 8-9 while the real condition had already arrived.
 *   · CFG.BENCH_RISK_FLOOR is the safety net — risk is what was silently keeping
 *     DEFAULT_WEIGHTS from reaching, by accident rather than by design.
 *   · THE STARTER BRANCH IS UNTOUCHED. Cory's 2026-08-10 decision to zero
 *     ceiling was made on the starter branch's arithmetic and still stands.
 *
 * Run: node draft/tests/bench_branch_anchor.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;
const adpOf = p => (p.adjusted_adp != null ? p.adjusted_adp : (p.raw_adp != null ? p.raw_adp : 9999));
const REACH_ADP = 250;

/* The same board state the characterisation test used: every starting slot
 * filled, K and DEF still open, built from the live board by VORP rather than
 * by hand so it is the state a competent draft actually reaches. */
const pool = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const byVorp = pool.slice().sort((a, b) => b.vorp - a.vorp);
const roster = [];
const want = { QB: 1, RB: 3, WR: 2, TE: 1 };
Object.keys(want).forEach(pos => {
  byVorp.filter(p => p.position === pos).slice(0, want[pos]).forEach(p => roster.push(p));
});
const taken = new Set(roster.map(p => String(p.player_id)));
pool.slice().sort((a, b) => adpOf(a) - adpOf(b)).slice(0, 72)
  .forEach(p => taken.add(String(p.player_id)));
const board = pool.filter(p => !taken.has(String(p.player_id)));

const baseCtx = {
  board: board, roster: roster, league: L, currentPick: 73, nextPick: 88,
  totalPicks: 150, myPicksLeft: 6, roundsLeft: 8, runMultipliers: {}, intervening: [],
};
const rec = w => E.recommend(Object.assign({}, baseCtx, { weights: w }));

// ── THE BRANCH STILL FIRES — otherwise this suite tests nothing ────────────
{
  const skill = board.filter(p => ['QB', 'RB', 'WR', 'TE'].indexOf(p.position) >= 0).slice(0, 30);
  const fills = skill.map(p => E.starterSlotMarginal(p, roster, L).fills);
  ck('with every starter filled, the skill players left still read BENCH or FLEX',
    fills.every(f => f === 'bench' || f === 'flex'),
    fills.filter(f => f !== 'bench' && f !== 'flex').slice(0, 3));
  /* WAS `ck(..., true)` — a line warning about vacuity while being vacuous, above
   * a `fills.every(...)` that is TRUE ON AN EMPTY ARRAY. Now it checks the thing
   * it was warning about. */
  ck('  and there were skill players left to classify, so `every` is not vacuous',
    fills.length > 0, fills.length);
}

// ── THE DEFECT IS GONE ─────────────────────────────────────────────────────
const mTop = rec(E.MEASURED_WEIGHTS)[0];
{
  ck('SHIPPED (MEASURED) no longer recommends a player the room has never heard of',
    adpOf(mTop.player) <= REACH_ADP,
    { pick: mTop.player.name, adp: adpOf(mTop.player), vorp: mTop.player.vorp });
  const better = board.filter(p => adpOf(p) < 150).sort((a, b) => b.vorp - a.vorp)[0];
  ck('  and it is not being outranked by a far better player on the same board',
    !better || Number(mTop.player.vorp) >= Number(better.vorp) - 50,
    better ? { available: better.name, vorp: better.vorp, picked: mTop.player.vorp } : null);
  ck('  DEFAULT_WEIGHTS still does not reach either',
    adpOf(rec(E.DEFAULT_WEIGHTS)[0].player) <= REACH_ADP);
}

// ── THE ANCHOR IS RUNNING NOW ──────────────────────────────────────────────
{
  /* The old file's second finding: the branch's comment credited an anchor that
   * was identically zero at the pick the branch decides, because upsideBonus was
   * gated to 0.6 of the draft and the branch starts near 0.47. */
  const gated = E.upsideBonus(board[0], 73, 150, 6);
  const open = E.upsideBonus(board[0], 73, 150, 6, false, true);
  ck('the OLD gate still reads zero at pick 73 — the proxy has not been moved',
    Math.abs(gated) < 1e-9, gated);
  ck('  but the bench branch\'s own gate is open, so the anchor has a value',
    Math.abs(open) > 0, open);
  ck('  which is the point: the branch uses the CONDITION, not the proxy',
    Math.abs(open) > Math.abs(gated));

  // THE STARTER BRANCH MUST NOT HAVE MOVED. Cory's ceiling-zero decision was
  // made on its arithmetic; silently changing it would re-open far more than
  // this fix costed.
  const early = E.upsideBonus(board[0], 30, 150, 12);
  ck('the STARTER branch\'s early ceiling is still zero — that decision stands',
    Math.abs(early) < 1e-9, early);
}

/* ── AND THE FLOORS ARE NOW ZERO, WHICH IS THE POINT ────────────────────────
 *
 * This asserted the OPPOSITE until 2026-08-14: that both bench floors were
 * ABOVE zero, "like the starter branch's value anchor". That was true and it was
 * the defect — `Math.max(0.25, w.ceiling)` over a MEASURED_WEIGHTS.ceiling of
 * ZERO, set there because the effect measured -4.8 with a [-26,+17] interval and
 * could not be signed. A constant was switching a measurement back on for every
 * bench pick, and this test was pinning it in place.
 *
 * THE FLOORS COULD NOT BE REMOVED WHILE THE BRANCH HAD NOTHING ELSE IN IT.
 * Tested 2026-08-13: zeroing the ceiling floor made the QB/TE symptom worse,
 * because VONA had been discarded in that branch. With VONA restored the branch
 * ranks on the one term with an out-of-sample dollar measurement behind it, and
 * the floors stopped being load-bearing — QB then matched the market reference
 * exactly, with an identical reach distribution and zero junk either way.
 *
 * The assertion now pins the honest state: the measured weight is what runs.
 * The VALUE floor stays above zero and is checked separately — it floors a
 * weight the measurement put at 1.0, so it cannot override anything. */
{
  ck('the bench floors are ZERO — the measured weights are what run',
    E.CFG.BENCH_CEILING_FLOOR === 0 && E.CFG.BENCH_RISK_FLOOR === 0,
    { ceiling: E.CFG.BENCH_CEILING_FLOOR, risk: E.CFG.BENCH_RISK_FLOOR });
  ck('  and no floor anywhere exceeds the weight it floors',
    E.CFG.VALUE_WEIGHT_FLOOR <= E.MEASURED_WEIGHTS.value
    && E.CFG.BENCH_CEILING_FLOOR <= E.MEASURED_WEIGHTS.ceiling
    && E.CFG.BENCH_RISK_FLOOR <= E.MEASURED_WEIGHTS.risk,
    'a floor above its own weight silently overrides a deliberate setting — '
    + 'that is the defect class, not a safety net');

  /* NON-VACUITY, and it is the check that makes every assertion above mean
   * something. An inverted test passes trivially if the branch stopped being
   * reachable, or if the board no longer contains anything to reach for. So:
   * the junk that USED to win must still be on the board and must still be
   * winnable by a scorer with no anchor. */
  const junk = board.filter(p => Number(p.vorp) < -100);
  ck('CONTROL: replacement-level players are still on this board',
    junk.length > 10, junk.length);
  /* MY FIRST VERSION OF THIS CONTROL DID NOT WORK, and it is worth keeping the
   * reason. It passed `ceiling: 0` and called that "without the floors" — but
   * `Math.max(CFG.BENCH_CEILING_FLOOR, w.ceiling)` is exactly what a floor
   * means, so the arm still got 0.25 and picked a real player. A control that
   * cannot reproduce the defect proves nothing about the fix. The floors have
   * to be genuinely removed, which means reaching past the weights. */
  const savedC = E.CFG.BENCH_CEILING_FLOOR, savedR = E.CFG.BENCH_RISK_FLOOR;
  E.CFG.BENCH_CEILING_FLOOR = 0; E.CFG.BENCH_RISK_FLOOR = 0;
  let noFloor;
  try { noFloor = rec(E.MEASURED_WEIGHTS)[0]; }
  finally { E.CFG.BENCH_CEILING_FLOOR = savedC; E.CFG.BENCH_RISK_FLOOR = savedR; }
  /* ── THIS ASSERTION INVERTED ON 2026-08-13, AND THAT IS THE IMPROVEMENT ────
   *
   * It used to read "with the floors REMOVED the same board still reaches for
   * one" — i.e. the floors were the ONLY thing standing between the bench branch
   * and a replacement-level player, so removing them had to reproduce the
   * defect. That was true, and it was a thin place for the whole back half of a
   * draft to rest: the anchor was a term measured at -4.8 with a [-26,+17]
   * interval, held up by a constant that overrode its own measured weight of 0.
   *
   * The bench branch now keeps VONA (see engine.js — the branch was discarding
   * it on the strength of a comment calling it "value over the next STARTER",
   * which is not what vona() computes). So the anchor is the one term with an
   * out-of-sample dollar measurement behind it, and the floors are no longer
   * load-bearing for this property.
   *
   * THE INVARIANT IS THEREFORE STRONGER, AND IT IS WHAT IS ASSERTED NOW: with
   * the floors removed the branch must STILL refuse the junk. If this ever flips
   * back, the ceiling floor has silently become the anchor again. */
  ck('  with the floors REMOVED the branch STILL refuses replacement-level junk',
    adpOf(noFloor.player) <= REACH_ADP,
    { would_have_picked: noFloor.player.name, adp: adpOf(noFloor.player),
      note: 'VONA is the anchor now, not BENCH_CEILING_FLOOR' });
  ck('  and the no-floor pick is a REAL player, not a projection-zero body',
    Number(noFloor.player.proj_mean) > 0 && (noFloor.player.team || 'FA') !== 'FA',
    { name: noFloor.player.name, proj: noFloor.player.proj_mean, team: noFloor.player.team });
  ck('  and the floors were restored afterwards',
    E.CFG.BENCH_CEILING_FLOOR === savedC && E.CFG.BENCH_RISK_FLOOR === savedR);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
