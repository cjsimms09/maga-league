/* THE ROSTER FIXTURE, AND THE PRECONDITION THAT USED TO MAKE `roster: []` LEGAL.
 *
 * ── WHAT CHANGED, 2026-08-20 ───────────────────────────────────────────────
 *
 * This guard's condition has FAILED. It is not broken; it fired.
 *
 * A's ruling (ROUTES, 2026-08-18, on E's queue) was that the empty-roster
 * fiction used by suites claiming production fidelity is legal ONLY WHILE
 * every roster-reading term is either weighted zero or measured-dead on the
 * live seat. Register 160 (E's finding, A-verified) moved `need` from 0.0 to
 * 1.0. `need` reads `ctx.roster`. The condition therefore no longer holds and
 * `assertRosterFictionPrecondition` now THROWS on the shipped weight vector.
 *
 * That is the correct behaviour and it must not be softened. The fix for a
 * suite that trips it is to take a REAL roster from `realRoster()` below — not
 * to weaken the guard, which would leave every other suite's fiction unguarded.
 *
 * ── WHAT IT ACTUALLY COST, MEASURED ────────────────────────────────────────
 *
 * Cory, 2026-08-20: "I do feel like we need to rerun roster test and other
 * model test as previous runs would've been flawed." He is right, and the size
 * of it was measured rather than assumed:
 *
 *   MY OWN ROSTER — material. At the OLD weights (need = 0), running Cory's
 *   twelve picks with `roster: []` against his real keepers already changed the
 *   TOP recommendation at pick 113, and moved scores by up to 7.39 at pick 33.
 *   The `keeper` term (weight 1.0) reads ctx.roster and was never zero, so the
 *   fiction was distorting results BEFORE register 160, not because of it.
 *   With `need` now at 1.0 it moves the pick-33 top-1 as well.
 *
 *   AN OPPONENT'S ROSTER — narrow, and NOT where you would guess. Measured over
 *   the top 200 available at each of Cory's twelve picks (2400 observations),
 *   filling intervening opponents' rosters instead of passing `roster: []`
 *   changes survival by more than 0.05 for 105 of 2400 (4.4%), and the affected
 *   set is almost entirely onesies:
 *
 *       K   45 / 265  (17.0%)      RB   0 / 546  (0.0%)
 *       DEF 39 / 256  (15.2%)      WR   0 / 699  (0.0%)
 *       QB  11 / 317  ( 3.5%)      TE  10 / 317  (3.2%)
 *
 *   Direction is one-sided: the fiction OVER-states survival (worst: Houston
 *   DEF at pick 73, 93% fiction vs 75% real). The mechanism is obvious once
 *   seen — an opponent holding no kicker looks like a man who might take one.
 *   So `roster: []` on INTERVENING picks is inert for every RB/WR decision Cory
 *   makes and is only misleading about K/DEF timing. It is left in place
 *   deliberately, and this note exists so the next reader does not "discover"
 *   it a third time and rebuild a simulation for a zero.
 *
 * ── THE KEEPER TERM IS STILL NOT CERTIFIED SAFE ────────────────────────────
 *
 * `keeper` was never in the zero-weighted list and was not added to this guard
 * as one (session E, 2026-08-18; register E31). It reads `ctx.roster` AND
 * `ctx.currentKeepers`, carries weight 1.0, and is NOT measured-dead: verified
 * via the exact production `scorePlayer` path, at pick 33 — Cory's FIRST pick —
 * the top-scored recommendation (Colston Loveland) carries
 * `weighted.keeper = 4.6`, above `deviation.js`'s own MATERIAL = 2.0 bar. A's
 * earlier figure ("keeper marginal <= ~2.1") does not hold at that pick. It is
 * 0 at all eleven of Cory's other picks, so the exposure is narrow, but it is
 * real and this guard does not paper over it by omission.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BOARD = path.join(__dirname, '..', '..', 'public', 'draft_data.json');

/* ── THE ONE DERIVATION OF "CORY'S REAL ROSTER" ───────────────────────────────
 *
 * Five suites had each grown their own copy of this block. One derivation,
 * reused: a fixture that differs between suites makes their results
 * incomparable, which is the failure mode this whole file exists to prevent.
 *
 * It REFUSES rather than returning [] on a board it cannot read. Falling back
 * to an empty roster is precisely the fiction register 160 made illegal, and a
 * silent fallback would reintroduce it in the one place nobody would look. */
function realRoster(opts) {
  opts = opts || {};
  let art;
  try {
    art = JSON.parse(fs.readFileSync(BOARD, 'utf8'));
  } catch (e) {
    throw new Error('ROSTER FIXTURE: cannot read public/draft_data.json (' + e.message
      + '). Refusing to fall back to roster: [] — that is the fiction register 160 '
      + 'made illegal, and a suite running on it would report a false green.');
  }
  const kept = (art.kept_players || []).map(k => ({
    player_id: k.player_id, name: k.name, position: k.position,
    proj_mean: k.proj_mean, vorp: k.vorp, is_keeper: true,
  }));
  if (!kept.length && !opts.allowEmpty) {
    throw new Error('ROSTER FIXTURE: the board carries no kept_players. This suite '
      + "needs Cory's real keepers and will not substitute roster: [].");
  }
  return kept;
}

/* The same question without the throw, for a suite that legitimately wants to
 * branch on it (e.g. one whose SUBJECT is the precondition itself). */
function fictionIsLegal(E) {
  const w = (E && E.MEASURED_WEIGHTS) || null;
  if (!w || typeof w.value !== 'number') return false;
  return w.need === 0 && w.bye === 0 && w.risk === 0;
}

function assertRosterFictionPrecondition(E) {
  const w = E && E.MEASURED_WEIGHTS;
  if (!w || typeof w.value !== 'number') {
    throw new Error('ROSTER-FICTION PRECONDITION: engine.js no longer exports '
      + 'MEASURED_WEIGHTS. The roster: [] fixtures in this suite cannot be '
      + 'judged safe against a weight vector that cannot be read.');
  }
  const violations = [];
  if (w.need !== 0) violations.push('need=' + w.need);
  if (w.bye !== 0) violations.push('bye=' + w.bye);
  if (w.risk !== 0) violations.push('risk=' + w.risk);
  if (violations.length) {
    throw new Error('ROSTER-FICTION PRECONDITION FAILED: ' + violations.join(', ')
      + ' -- these terms read ctx.roster and are no longer weighted zero. A '
      + 'roster: [] fixture now scores a seat that does not exist. Rebuild this '
      + "suite's fixtures with a real roster — require realRoster() from "
      + 'draft/tests/_empty_roster_fiction_precondition.js — before trusting '
      + 'anything it asserts.');
  }
  /* `keeper` is knowingly NOT asserted safe here -- see the header. Returned
   * so a caller that wants to notice a further increase can compare against
   * this session's measured ceiling (4.6, pick 33 only) without this file
   * needing to know what "further increase" should mean for it. */
  return { need: w.need, bye: w.bye, risk: w.risk, keeper_weight: w.keeper,
    keeper_known_ceiling: 4.6, keeper_known_ceiling_pick: 33,
    keeper_known_ceiling_measured: '2026-08-18' };
}

/* The opponent-roster figures above, as data rather than prose, so a suite can
 * assert against them instead of re-deriving a number from a comment. */
const OPPONENT_ROSTER_FICTION = {
  measured: '2026-08-20',
  scope: 'top 200 available at each of Cory\'s 12 picks, 2400 observations',
  material_bar: 0.05,
  material: 105,
  observations: 2400,
  by_position: { K: [45, 265], DEF: [39, 256], QB: [11, 317], TE: [10, 317],
    RB: [0, 546], WR: [0, 699] },
  direction: 'the fiction OVER-states survival; it never under-stated it',
  worst: { player: 'Houston Texans', pos: 'DEF', pick: 73, fiction: 0.93, real: 0.75 },
  verdict: 'inert for every RB/WR decision; misleading only about K/DEF timing',
};

module.exports = {
  assertRosterFictionPrecondition: assertRosterFictionPrecondition,
  realRoster: realRoster,
  fictionIsLegal: fictionIsLegal,
  OPPONENT_ROSTER_FICTION: OPPONENT_ROSTER_FICTION,
};
