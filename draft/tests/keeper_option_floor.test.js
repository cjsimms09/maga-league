// TERRITORY: A
/* THE KEEPER OPTION FLOOR IS SHIPPED, AND THE MEASURED RAMP IS WHY.
 *
 * EVIDENCE CLASS: CORRECTNESS against the term's own stated contract
 * (KOV_marginal = max(0, raw − bar)), plus regression protection on both
 * historical states of the defect. It establishes nothing about whether
 * keeper option value is well modelled.
 *
 * ── HISTORY, because this suite has now pinned TWO different worlds ────────
 *
 * 1. THE ORIGINAL DEFECT (pinned by this suite's first version): the
 *    `raw.value <= 0` early return passed raw through unfloored. Under the
 *    OLD reasoned ramp (zero through round 6, ramping up late) that priced
 *    556 of 559 board players negative at pick 128, min −138.85. The floor
 *    was written, measured, and HELD for Cory on two premises: flooring
 *    left the term dead on the frozen pool, and the first three picks were
 *    untouched in both states.
 *
 * 2. THE INTERACTION (found 2026-08-17, this suite going red): Cory's
 *    measured-ramp ruling (KOV_MEASURED_RAMP: true) reversed the ramp —
 *    rounds 1-6 now 1.0, rounds 10-15 now 0. That moved the unfloored
 *    negative branch from the late rounds onto the EARLY picks at full
 *    weight: measured at pick 17, 586 of 587 published scores carried a
 *    negative keeper term, min −118.69. Both premises of the hold were
 *    false — positives (up to +38) now exist early and survive a floor, and
 *    the early picks were exactly what the held state was distorting. So
 *    the floor shipped, as the contract always specified.
 *
 * If someone reverts the floor or the ramp, the arms below name which world
 * they have recreated.
 *
 * Run: node draft/tests/keeper_option_floor.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const C = require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const pool = D.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const keep = KEEP.keepersFrom(D);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));

function boardAt(PICK) {
  const taken = new Set(byAdp.slice(0, PICK - 1).map(p => String(p.player_id)));
  keep.forEach(k => taken.add(String(k.player_id)));
  return pool.filter(p => !taken.has(String(p.player_id)));
}
function ctxAt(PICK) {
  return { board: boardAt(PICK), roster: keep, league: D.league, currentPick: PICK,
    nextPick: PICK + 15, totalPicks: 150, myPicksLeft: 8, roundsLeft: 8,
    runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS };
}

ck('the measured ramp is the shipped state — this suite pins the interaction '
  + 'of that ruling with the floor, so it must know which ramp is live',
  C.CFG.KOV_MEASURED_RAMP === true, C.CFG.KOV_MEASURED_RAMP);

// ── THE CONTRACT: NO OPTION PRICES BELOW ZERO, AT ANY PICK ────────────────
const PICKS = [17, 33, 48, 68, 88, 108, 128, 148];
PICKS.forEach(PICK => {
  const ctx = ctxAt(PICK);
  const vals = ctx.board.map(p => C.keeperOptionValue(p, ctx).value);
  const min = Math.min.apply(null, vals);
  ck('pick ' + PICK + ' — no keeper option is priced below zero (min '
    + min.toFixed(2) + '). An option you can decline cannot cost you points.',
    min >= 0, { min: min });
});

// ── THE TERM IS ALIVE EARLY (the measured ramp's whole point) ─────────────
{
  const ctx = ctxAt(17);
  const vals = ctx.board.map(p => C.keeperOptionValue(p, ctx).value);
  const posN = vals.filter(v => v > 0).length;
  const max = Math.max.apply(null, vals);
  ck('pick 17 — positive option values exist and survive the floor ('
    + posN + ' positive, max ' + max.toFixed(2) + '), so flooring did NOT '
    + 'retire the term: premise (1) of the old hold is measurably false under '
    + 'the measured ramp',
    posN > 0 && max > 5, { positive: posN, max: max });
}

// ── AND DEAD LATE, BY THE RULING RATHER THAN BY THE DEFECT ────────────────
{
  const ctx = ctxAt(128);
  const vals = ctx.board.map(p => C.keeperOptionValue(p, ctx).value);
  ck('pick 128 — the term is zero across the board: the measured ramp reads 0 '
    + 'in rounds 10-15, where the ORIGINAL defect used to put −138.85. The '
    + 'late rounds are now quiet by ruling, not by clamp.',
    vals.every(v => v === 0), { nonzero: vals.filter(v => v !== 0).length });
}

// ── DIAGNOSIS PRESERVED: raw_value still carries the unfloored quantity ───
{
  const ctx = ctxAt(33);
  const raws = ctx.board.map(p => C.keeperOptionValue(p, ctx).raw_value)
    .filter(v => typeof v === 'number');
  const negRaw = raws.filter(v => v < 0).length;
  ck('pick 33 — raw_value is preserved and negative for most of the board ('
    + negRaw + '/' + raws.length + '), so the floor is doing real work and a '
    + 'reader can still see what it clamped',
    negRaw > 400, { negative_raw: negRaw, of: raws.length });
}

// ── FAIL ARM 1: the ORIGINAL defect, reconstructed ────────────────────────
//    Old ramp + the unfloored raw (keeperOptionValueRaw IS the pre-floor
//    quantity). This is the evidence the first version of this suite carried.
{
  const saved = C.CFG.KOV_MEASURED_RAMP;
  C.CFG.KOV_MEASURED_RAMP = false;
  const ctx = ctxAt(128);
  const raws = ctx.board.map(p => C.keeperOptionValueRaw(p, ctx).value);
  const neg = raws.filter(v => v < 0).length;
  const min = Math.min.apply(null, raws);
  C.CFG.KOV_MEASURED_RAMP = saved;
  ck('FAIL ARM (old ramp, unfloored): pick 128 reconstructs the original '
    + 'defect — ' + neg + '/' + raws.length + ' negative, min ' + min.toFixed(2)
    + '. If the floor is ever removed under the old ramp, THIS is what ships.',
    neg > 500 && min < -100, { negative: neg, min: min });
}

// ── FAIL ARM 2: the INTERACTION, reconstructed ────────────────────────────
//    Measured ramp + the unfloored raw. This is what the held state was
//    publishing on 2026-08-17 and the reason the hold ended.
{
  const ctx = ctxAt(17);
  const raws = ctx.board.map(p => C.keeperOptionValueRaw(p, ctx).value);
  const neg = raws.filter(v => v < 0).length;
  const min = Math.min.apply(null, raws);
  ck('FAIL ARM (measured ramp, unfloored): pick 17 reconstructs the '
    + 'interaction — ' + neg + '/' + raws.length + ' negative, min '
    + min.toFixed(2) + ' at weight 1.0 on an EARLY pick. Both premises of '
    + 'holding the floor died here.',
    neg > 500 && min < -100, { negative: neg, min: min });
}

// ── THE SURFACE: what Cory sees carries no negative option prices, and the
//    term still reaches the published score ────────────────────────────────
{
  const s = E.recommend(ctxAt(17)).filter(x => E.scoreable(x));
  const ks = s.map(x => (((x.components || {}).weighted || {}).keeper || 0));
  const neg = ks.filter(k => k < 0).length;
  ck('pick 17 surface — zero negative keeper terms reach the published score '
    + '(was 586/587 in the held state)', neg === 0, { negative_published: neg });
  ck('...and the term still contributes — some published score carries a '
    + 'positive keeper component, so the fix did not silently retire a live '
    + 'weight-1 term', ks.some(k => k > 1e-9), { max: Math.max.apply(null, ks) });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
