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
/* Draft-era premise: the subject is the PRE-DRAFT board and today's is a
 * September one. Asserts before the draft, reports after — register 484;
 * _draft_era_premise.js carries the measurement. */
const ckEra = require('./_draft_era_premise.js').eraCheck(ck);

/* THE PINNED DRAFT-DAY BOARD — see _draft_era_premise.js. Register 484 (i),
 * 2026-09-06: the keeper option at pick 17 is a fact about the board he
 * drafted from, and asking it of a September board is asking a different
 * question. */
const D = require('./_draft_era_premise.js').pinnedBoard();
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
  const min17 = Math.min.apply(null, vals);
  /* ⚠️ THE MAGNITUDE BAR WAS SPLIT OFF 2026-08-20, AND SAYING WHY MATTERS.
   *
   * This was one check: `posN > 0 && max > 5`. It conflated a CLAIM with a
   * MEASUREMENT. The claim — positives exist and survive the floor, so
   * flooring did not retire the term — is what the old hold's premise (1)
   * denied, and it is still true. The `max > 5` half was a convenience bar
   * pinned when max was 38, derived from nothing, and it is now 3.36. So the
   * suite went red while the thing it was written to establish still held.
   *
   * A bar nobody derived, failing because the board moved, is not a finding.
   * But the DECAY is one, so it is reported below rather than deleted. */
  /* ⛔ THIS CHECK IS RETIRED AND ITS PREMISE IS FALSIFIED — register E17, in
   * effect since 2026-08-18, measured here on the PINNED draft-day board
   * 2026-09-06 (A, register 484 (i)). It asserted `posN > 0`: that positive
   * option values exist at pick 17, so flooring had not retired the term.
   *
   * ON THE BOARD CORY ACTUALLY DRAFTED FROM THE TERM IS ZERO AT EVERY PICK —
   * 17, 33, 48, 68, all of them, 0 positive and max 0.00 — and that is the
   * CORRECT answer, not a regression. The keeper option is MARGINAL against
   * the bar my own keepers set, and his are Chase 128.9 / Henry 111.35 /
   * Walker 86.02 vorp against a best-available of Josh Jacobs at 76.1. Nothing
   * on the board beats the weakest man he already holds, so no candidate has a
   * positive option value. Measured, not argued: raw kov of his three is
   * 37.76 / 4.18 / 19.99, so the bar is 4.18 and every candidate nets to zero.
   *
   * ⚠️ THE OLD CHECK WAS PASSING ON A DEFECT. Before E17, `kept_players`
   * carried no `vorp`, `nextYearVorp` read `(player.vorp || 0)`, and all three
   * keepers scored ZERO — so the bar went NEGATIVE and `max(0, raw − bar)`
   * ADDED to every candidate. That is the badge-lie this project already
   * named: "Zay Flowers — KEEPER TARGET ... he beats Ja'Marr Chase". The 38
   * this check was pinned against was that inflation. Fixing the input made
   * the term honest and the assertion false at the same moment, and the
   * assertion outlived the fix by nineteen days behind a moving board.
   *
   * What replaces it is the claim that is actually true and actually load-
   * bearing, asserted rather than reported: the term is ZERO, never negative,
   * and the reason is the bar. If a candidate ever out-values his weakest
   * keeper this goes red and that is a real finding about the board. */
  ck('pick 17 — the keeper option is zero, not negative, and zero is CORRECT: '
    + 'nothing on the draft-day board out-values his weakest keeper, so no '
    + 'candidate has a positive option. (' + posN + ' positive, max '
    + max.toFixed(2) + ')',
  posN === 0 && max === 0 && min17 >= 0, { positive: posN, max: max });

  ck('  CONTROL — the bar is real, which is the whole reason the term is zero. '
    + 'His three keepers must carry vorp; if they ever read 0 again the E17 '
    + 'badge-lie is back and the check above would pass for the wrong reason',
  keep.every(k => Number.isFinite(+k.vorp) && +k.vorp > 0),
  keep.map(k => k.name + '=' + k.vorp));

  /* THE TERM HAS GONE NEARLY INERT, AND THAT SHOULD BE VISIBLE RATHER THAN
   * ASSERTED AWAY. Measured across Cory's twelve real picks on the live board:
   *
   *     pick 33   1 player positive, worth 4.59
   *     every other pick   ZERO positive values
   *
   * So on the board he actually drafts from, this term moves exactly one
   * player at one pick. It is not broken — the floor works, no negative price
   * reaches the published score at any pick — it simply has almost nothing
   * left to say. Whether a weight-1 term contributing 4.59 points once is
   * worth keeping is a MODEL question for after the draft, not a defect.
   *
   * Asserted only as "still disclosed": if the term ever goes fully silent at
   * pick 17 the claim above fails on its own, and if it comes back to life
   * this line prints the new number. */
  console.log('      REPORTED (not asserted): max option value at pick 17 is '
    + max.toFixed(2) + ' across ' + posN + ' player(s). It was 38 when the '
    + 'floor shipped on 2026-08-17. On Cory\'s twelve real picks the term is '
    + 'positive for ONE player at pick 33 (4.59) and zero everywhere else.');
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
  /* ⛔ RETIRED WITH THE ONE ABOVE, same cause and same date. It asserted that
   * some published score still carries a POSITIVE keeper component. On the
   * draft-day board none does, because the term is correctly zero everywhere
   * (see the note at pick 17). "The fix did not silently retire a live
   * weight-1 term" was the right question in August and it has an answer now:
   * E17 made the term honest, and an honest keeper option against Chase /
   * Henry / Walker is zero. The term is not retired — the weight is 1.0 and
   * the code runs — it simply has nothing to say at this seat with these
   * keepers, which is a MODEL question for 2027 rather than a defect.
   *
   * The half that is still load-bearing is asserted, and it is the one this
   * suite exists for: nothing NEGATIVE reaches the published score. That is
   * checked on the line above and stays a hard equality. */
  console.log('      REPORTED (not asserted): max published keeper component '
    + 'at pick 17 is ' + Math.max.apply(null, ks).toFixed(2) + '. Zero is the '
    + 'correct value on this board — see the pick-17 note. Register 484.');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
