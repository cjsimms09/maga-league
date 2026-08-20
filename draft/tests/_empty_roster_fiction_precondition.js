/* THE SHARED PRECONDITION FOR `roster: []` / `currentKeepers: []` FIXTURES.
 *
 * A's ruling (ROUTES, 2026-08-18, on E's queue): the empty-roster fiction used
 * by suites claiming production fidelity is legal ONLY WHILE every
 * roster-reading term is either weighted zero or measured-dead on the live
 * seat. That is a fact about the CURRENT weight vector and board, not a
 * standing guarantee — so it must be checked, not assumed, every time these
 * suites run.
 *
 * `need`, `bye` and `risk` all read `ctx.roster` and are unambiguous: at
 * weight 0 they cannot fire on ANY roster, empty or real, so the fiction is
 * exactly as safe as a populated one for those three terms. Asserted here.
 *
 * `keeper` DOES NOT belong in that list, and was not added to this guard as
 * one (session E, 2026-08-18; register E31). It reads `ctx.roster` AND
 * `ctx.currentKeepers`, carries weight 1.0, and is NOT measured-dead: verified
 * via the exact production `scorePlayer` path, at pick 33 — Cory's FIRST pick
 * — the top-scored recommendation (Colston Loveland) carries
 * `weighted.keeper = 4.6`, above `deviation.js`'s own MATERIAL = 2.0 bar. A's
 * cited figure ("keeper marginal <= ~2.1") does not hold at that pick. It is
 * 0 at all eleven of Cory's other picks, so the exposure is narrow, but it is
 * real and this guard does not paper over it by omission.
 *
 * So this function asserts what is TRUE (need/bye/risk are structurally
 * inert) and separately reports the keeper term's measured ceiling so a
 * reader sees the actual number rather than an unstated assumption. It does
 * NOT assert keeper is safe, because that would be asserting something false.
 */
'use strict';

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
      + "suite's fixtures with a real roster (Cory's real keepers at minimum) "
      + 'before trusting anything it asserts.');
  }
  /* `keeper` is knowingly NOT asserted safe here -- see the header. Returned
   * so a caller that wants to notice a further increase can compare against
   * this session's measured ceiling (4.6, pick 33 only) without this file
   * needing to know what "further increase" should mean for it. */
  return { need: w.need, bye: w.bye, risk: w.risk, keeper_weight: w.keeper,
    keeper_known_ceiling: 4.6, keeper_known_ceiling_pick: 33,
    keeper_known_ceiling_measured: '2026-08-18' };
}

module.exports = { assertRosterFictionPrecondition: assertRosterFictionPrecondition };
