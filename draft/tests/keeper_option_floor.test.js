// TERRITORY: A
/* A KEEPER OPTION WAS PRICED AT −138.85, AND IT IS ONE OF THREE LIVE TERMS.
 *
 * ⚠️ THIS SUITE PINS A DEFECT, NOT A DESIRED STATE. The fix is written,
 * measured, and HELD pending Cory's decision — see composite.js. These
 * assertions describe the board AS IT SHIPS TODAY. If someone applies the
 * one-line floor, the NEGATIVE arms below SHOULD go red: read that as the
 * decision having been taken, invert them, and re-pin the three baselines.
 * Same pattern as composite_roster_blindness.test.js.
 *
 * EVIDENCE CLASS: CHARACTERISATION of a live defect, plus regression protection
 * on the ramp. It establishes nothing about whether keeper option value is well
 * modelled.
 *
 * ── WHY THIS TERM AND NOT ANOTHER ──────────────────────────────────────────
 *
 * Under MEASURED_WEIGHTS the shipped score is `value + keeper + stack`. Five of
 * the eight terms are zero. `value` has been audited; `keeper` had never been,
 * and decision_contract already flagged it `uncalibrated — never graded`.
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 *
 * `keeperOptionValue`'s docstring states the contract:
 *
 *     KOV_marginal(i) = max(0, KOV_raw(i) − KOV_raw(incumbent at last slot))
 *
 * The positive path implements it. The `raw.value <= 0` EARLY RETURN did not —
 * it passed `raw.value` through untouched. So every player whose next-year
 * projection sat below what the forfeited pick would return came back negative,
 * at weight 1.0.
 *
 * MEASURED at pick 128, before the fix: 556 of 559 board players negative, most
 * extreme −138.85. Exactly two positive, and they were a DEF and a K.
 *
 * ── WHY NEGATIVE IS WRONG, NOT MERELY UNTIDY ───────────────────────────────
 *
 * A keeper is an option exercised next August with full information. If the
 * player is not worth keeping you decline and the option is worth ZERO. The
 * negative branch charged today for a decision nobody will make.
 *
 * And it was not computing an option price at all: `next_vorp` for a fringe QB
 * is −382.7, which is "he is not a starting QB" restated — something `value`
 * already prices through VONA. It was an unscaled second VORP term wearing the
 * keeper term's name and weight.
 *
 * ── THE JUSTIFICATION IS THE CONTRACT, NOT THE SCORE ───────────────────────
 *
 * Objective evidence is a NULL: starting-lineup points move 1998.4 -> 2003.4 in
 * one deterministic room — the same magnitude as the `need` null that was
 * refused promotion, from a lab whose header says it cannot see injury
 * insurance, which is precisely what keeper value is adjacent to. So the case
 * for fixing rests on the CONTRACT — the code contradicts its own docstring,
 * which is true whatever the measurement says — and NOT on the five points.
 * Anyone re-opening this should argue the contract.
 *
 * WHY IT IS HELD: flooring it makes the keeper term contribute NOTHING on the
 * frozen benchmark pool (intervention-rate: `unexpectedly dead: ["keeper"]`;
 * surface_contract ordering becomes value:60.8 keeper:0.0 onesie:27.8
 * stack:11.4). So the term's entire live contribution today IS the negative
 * branch, and removing the defect removes the term — taking the shipped board
 * from three live terms to two. That is Cory's call to make knowingly, not one
 * to smuggle inside a bug fix days before a draft.
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

// ── THE DEFECT, MEASURED ON THE WHOLE REAL BOARD ──────────────────────────
const LATE = [68, 88, 108, 128, 148];
LATE.forEach(PICK => {
  const ctx = ctxAt(PICK);
  const vals = ctx.board.map(p => C.keeperOptionValue(p, ctx).value);
  const min = Math.min.apply(null, vals);
  const neg = vals.filter(v => v < 0).length;
  ck('pick ' + PICK + ' — keeper options are STILL priced below zero (min '
    + min.toFixed(2) + ', ' + neg + '/' + vals.length + ' negative). AN OPTION '
    + 'CANNOT BE WORTH LESS THAN ZERO; this is the held defect.',
    min < 0, { min: min, negative: neg });
});

// ── CONTROL: the raw quantity IS still negative, so the floor is doing work ──
{
  const PICK = 128, ctx = ctxAt(PICK);
  const raws = ctx.board.map(p => C.keeperOptionValue(p, ctx).raw_value)
    .filter(v => typeof v === 'number');
  const negRaw = raws.filter(v => v < 0).length;
  ck('CONTROL — raw_value is STILL negative for most of the board, so the floor '
    + 'is clamping real values rather than passing through an already-clean set',
    negRaw > 100, { negative_raw: negRaw, of: raws.length });
  ck('...and raw_value is PRESERVED rather than overwritten, so the diagnosis '
    + 'stays available to a reader',
    raws.some(v => v < -50), Math.min.apply(null, raws));
}

// ── THE POSITIVE SIDE EXISTS, SO THE TERM IS NOT WHOLLY NEGATIVE ──────────
{
  const PICK = 128, ctx = ctxAt(PICK);
  const pos = ctx.board.map(p => C.keeperOptionValue(p, ctx).value).filter(v => v > 0);
  ck('CONTROL — a few positive keeper values DO exist, so the term is not '
    + 'uniformly negative and the fix would not merely flip a constant',
    pos.length > 0, { positive: pos.length });
}

// ── THE RAMP: the first three picks were never affected, and that matters ──
{
  [33, 48, 53].forEach(PICK => {
    const ctx = ctxAt(PICK);
    const vals = ctx.board.map(p => C.keeperOptionValue(p, ctx).value);
    ck('pick ' + PICK + ' — keeper is inert this early (KOV_ROUND_RAMP_START), so '
      + 'the defect never touched Cory\'s first three picks',
      vals.every(v => v === 0), { nonzero: vals.filter(v => v !== 0).length });
  });
}

// ── THE FIX, APPLIED IN A SCRATCH COPY, SO THE HELD DECISION IS MEASURED ──
//    NOT ASSERTED. This is the evidence Cory is deciding on, recomputed every
//    run so it cannot rot into a stale number in a commit message.
{
  const PICK = 128, ctx = ctxAt(PICK);
  const floored = ctx.board
    .map(p => Math.max(0, C.keeperOptionValue(p, ctx).value));
  ck('THE HELD FIX: flooring at zero removes every negative price',
    Math.min.apply(null, floored) === 0);
  const live = ctx.board.map(p => C.keeperOptionValue(p, ctx).value);
  const moved = live.filter((v, i) => v !== floored[i]).length;
  ck('...and it would move ' + moved + ' of ' + live.length + ' board players, '
    + 'which is why it is a decision and not a tidy-up',
    moved > 100, { moved: moved, of: live.length });
}

// ── THE TERM STILL REACHES THE SCORE. A fix that silently retires a live
//    weight-1 term is a different change from the one intended. ────────────
{
  const PICK = 128;
  const s = E.recommend(ctxAt(PICK)).filter(x => E.scoreable(x));
  const anyKeeper = s.some(x => Math.abs(((x.components || {}).weighted || {}).keeper || 0) > 1e-9);
  ck('CONTROL — the keeper term does reach the published score today, so it is '
    + 'a live weight-1 term and not already inert', anyKeeper);
  const neg = s.filter(x => (((x.components || {}).weighted || {}).keeper || 0) < 0);
  ck('...and the SURFACE therefore shows negative option prices to Cory — '
    + neg.length + ' of the scored list. That is the user-visible half of this '
    + 'defect and the reason it is worth deciding rather than parking.',
    neg.length > 0, { negative_published: neg.length });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
