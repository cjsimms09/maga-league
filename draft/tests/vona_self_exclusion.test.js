// TERRITORY: A
/* REGISTER 56 — VONA MUST NOT PRICE THE WAIT ON A MAN WHO IS CERTAINLY THERE.
 *
 * `vona()` answers "what does it cost me to wait on this player?" and computed
 * that answer over a pool with the player REMOVED. If you pass on him, he is
 * one of the men who might still be there at your next pick — with probability
 * `survival(him, nextPick)`. Removing him from the pool asserts that
 * probability is ZERO for every player on the board.
 *
 * Found live on 2026-08-19 at pick 48 (next turn 53): Los Angeles Rams DEF,
 * survival 0.9999999995, VONA 14.0. Certain to be there, priced at fourteen
 * points of urgency — and that same board built an opening script that made
 * that defence a TARGET eighty picks before its ADP.
 *
 * These arms are the PROPERTY, not the flag: with the fix on, a player who is
 * certain to survive must have a VONA of about zero, and one who is certain to
 * be gone must keep his full margin over the next man. Both directions, because
 * a change that zeroes everybody would pass the first arm alone.
 *
 * Run: node draft/tests/vona_self_exclusion.test.js
 */
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

/* A SYNTHETIC BOARD, ON PURPOSE. The live board's numbers move every night and
 * a control anchored to them decays into a test that passed once. Here survival
 * is forced to a known value per player, so the arithmetic answer is known by
 * construction and stays known. */
function board(rows) {
  return rows.map((r, i) => ({
    player_id: 'p' + i, name: r.name, position: r.pos,
    proj_mean: r.proj, adjusted_adp: r.adp, raw_adp: r.adp,
    bye: 7, team: 'XX',
  }));
}

/* ctx.board is what the conserved-survival accessor reads; supplying it keeps
 * this exercising the same path the War Room does rather than a shortcut. */
function ctxFor(b, pick) {
  return { board: b, currentPick: pick, roster: [],
           league: { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } } };
}

const withFlags = (flags, fn) => {
  const saved = {};
  Object.keys(flags).forEach(k => { saved[k] = E.CFG[k]; E.CFG[k] = flags[k]; });
  try { return fn(); } finally { Object.keys(saved).forEach(k => { E.CFG[k] = saved[k]; }); }
};

/* ---- 1. THE SHIPPED CONFIGURATION IS THE RULED ONE ----------------------- */
/* This arm was written as "ships OFF" while P107 was ungraded, and it is now
 * "ships ON" because Cory ruled on the grade (2026-08-19, "ship it now"). It
 * pins THE RULING, not a preference: an edit that silently reverts the fix has
 * to come here and say so, which is the whole job of this line. */
ck('VONA_INCLUDE_SELF ships ON — Cory\'s 2026-08-19 ruling on the P107 grade',
   E.CFG.VONA_INCLUDE_SELF === true, { v: E.CFG.VONA_INCLUDE_SELF });
ck('VONA_SURVIVAL_RESCALE ships OFF — it is a diagnostic arm and ships under no outcome',
   E.CFG.VONA_SURVIVAL_RESCALE === false, { v: E.CFG.VONA_SURVIVAL_RESCALE });

/* ---- 2. THE DEFECT, REPRODUCED ------------------------------------------ */
/* A defence nobody will take for a hundred picks, at a pick five turns from
 * ours. ADP far in the future => survival ~1. */
const CERTAIN = board([
  { name: 'Certain DEF', pos: 'DEF', proj: 120, adp: 300 },
  { name: 'Next DEF',    pos: 'DEF', proj: 106, adp: 320 },
  { name: 'Third DEF',   pos: 'DEF', proj: 100, adp: 340 },
]);
const cCtx = ctxFor(CERTAIN, 48);
const sCertain = E.survival(CERTAIN[0], 53, cCtx);
ck('precondition: the synthetic certain-survivor really does survive (>0.99)',
   sCertain > 0.99, { survival: sCertain });

const vCertainOld = withFlags({ VONA_INCLUDE_SELF: false, VONA_SURVIVAL_RESCALE: false }, () => E.vona(CERTAIN[0], CERTAIN, 53, cCtx));
ck('THE DEFECT: with the player excluded from his own pool, a certain survivor is priced at his full margin',
   vCertainOld > 10, { vona: vCertainOld, margin_over_next: 14 });

const vCertainNew = withFlags({ VONA_INCLUDE_SELF: true, VONA_SURVIVAL_RESCALE: false }, () => E.vona(CERTAIN[0], CERTAIN, 53, cCtx));
ck('THE FIX: a man certain to be there costs about nothing to wait on',
   Math.abs(vCertainNew) < 0.5, { vona: vCertainNew });

/* ---- 3. THE OTHER DIRECTION — the fix must not simply zero everyone ------ */
/* Same shape, but the man is going imminently: ADP right on top of our next
 * pick means survival near zero, so the full margin is genuinely at stake. */
const DOOMED = board([
  { name: 'Going now RB', pos: 'RB', proj: 220, adp: 44 },
  { name: 'Next RB',      pos: 'RB', proj: 180, adp: 300 },
  { name: 'Third RB',     pos: 'RB', proj: 175, adp: 320 },
]);
const dCtx = ctxFor(DOOMED, 42);
const sDoomed = E.survival(DOOMED[0], 60, dCtx);
ck('precondition: the synthetic doomed player really is doomed (<0.20)',
   sDoomed < 0.20, { survival: sDoomed });

const vDoomedOld = withFlags({ VONA_INCLUDE_SELF: false, VONA_SURVIVAL_RESCALE: false }, () => E.vona(DOOMED[0], DOOMED, 60, dCtx));
const vDoomedNew = withFlags({ VONA_INCLUDE_SELF: true, VONA_SURVIVAL_RESCALE: false }, () => E.vona(DOOMED[0], DOOMED, 60, dCtx));
ck('CONTROL: a player who will be gone keeps essentially all of his urgency',
   vDoomedNew > 0.8 * vDoomedOld && vDoomedNew > 25, { old: vDoomedOld, fixed: vDoomedNew });

/* ---- 4. THE ALGEBRA THE PREREG CLAIMS ----------------------------------- */
/* For the TOP man at a position, include-self collapses to
 *     (1 - s) x (proj - E[best OTHER at pos]).
 * Asserting that here is what makes the flag a FORMULA and not a fudge: if a
 * future edit reaches the same board ordering by some other route, this fails. */
[[CERTAIN, cCtx, 53], [DOOMED, dCtx, 60]].forEach(([b, ctx, next], i) => {
  const s = E.survival(b[0], next, ctx);
  const others = b.slice(1);
  const ebaOther = E.expectedBestAvailable(others, next, ctx);
  const predicted = (1 - s) * (b[0].proj_mean - ebaOther);
  const actual = withFlags({ VONA_INCLUDE_SELF: true, VONA_SURVIVAL_RESCALE: false }, () => E.vona(b[0], b, next, ctx));
  ck('include-self equals (1 - s) x margin for the top man at a position [case ' + i + ']',
     Math.abs(predicted - actual) < 0.01, { predicted: predicted, actual: actual, s: s });
});

/* ---- 5. THE TWO ARMS ARE ALTERNATIVES, NOT LAYERS ------------------------ */
/* Switching both on would apply the survival discount twice and read as a third
 * arm nobody registered. The engine refuses; this pins the refusal, because a
 * guard that is never exercised is a comment. */
let threw = false;
try {
  withFlags({ VONA_INCLUDE_SELF: true, VONA_SURVIVAL_RESCALE: true },
            () => E.vona(CERTAIN[0], CERTAIN, 53, cCtx));
} catch (e) { threw = /alternative arms/.test(String(e.message)); }
ck('running A1 and A2 together REFUSES rather than silently double-discounting', threw);

/* ---- 6. A2 IS RUNNABLE AND IS NOT A1 ------------------------------------ */
/* The diagnostic must actually differ from the fix somewhere, or the prereg is
 * comparing an arm with itself — the costume gate, applied to our own arms. */
/* ⚠️ EVERY FLAG SET EXPLICITLY, and this line is why: it was written as
 * `{ VONA_SURVIVAL_RESCALE: true }` alone, and the moment the fix SHIPPED
 * (VONA_INCLUDE_SELF default false -> true) it stopped describing arm A2 and
 * started asking for both arms at once — which the engine correctly refused,
 * and this suite went red. A partial flag set is a diff against whatever
 * happens to be shipping, not a configuration. */
const A2 = { VONA_SURVIVAL_RESCALE: true, VONA_INCLUDE_SELF: false };
const A1 = { VONA_SURVIVAL_RESCALE: false, VONA_INCLUDE_SELF: true };
const vRescaleDoomed = withFlags(A2, () => E.vona(DOOMED[0], DOOMED, 60, dCtx));
ck('A2 differs from A1 below the top of a position — they are not the same arm in two costumes',
   Math.abs(vRescaleDoomed - vDoomedNew) > 0.01
   || Math.abs(withFlags(A2, () => E.vona(DOOMED[1], DOOMED, 60, dCtx))
               - withFlags(A1, () => E.vona(DOOMED[1], DOOMED, 60, dCtx))) > 0.01,
   { a2_top: vRescaleDoomed, a1_top: vDoomedNew });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
