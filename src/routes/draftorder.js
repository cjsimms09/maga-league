// ─────────────────────────────────────────────────────────────────────────────
// DRAFT-SELECTION ORDER — reverse-finish, two-stage.  (Rule CONFIRMED 2026-08-09.)
//
// We compute a SELECTION ORDER — who chooses their draft slot WHEN — not a slot
// assignment. Which slot anyone ends up in falls out of what they pick and what
// is left, so a champion who selects last can still land at slot 7; that is not a
// rule violation, just what was available. (This distinction is why the 2025
// draft looked like a discrepancy before: the champion at slot 7 is fine.)
//
// The order (Cory, confirmed against history):
//   1. Non-playoff six, REVERSE regular-season finish — last place selects first.
//   2. Then the playoff four, REVERSE PLAYOFF (bracket) finish — 4th selects
//      first among them, then 3rd, then runner-up, then the CHAMPION last of all.
// The bracket, NOT the regular-season standings, governs the four — a team can
// finish 1st in the regular season and 4th in the bracket, and it selects by the
// bracket result. Reg-season ties break on total points (PF), same as standings.
//
// Two stages, because the two halves resolve at different times: the non-playoff
// six lock the moment the regular season ends (positions 5–10 are known); the
// playoff four stay pending until the bracket completes.
//
// VERIFIED AGAINST HISTORY (draft/tests/draftorder.test.js): the 2025 draft —
// the one completed draft whose bracket finish DIFFERS from its regular-season
// standings — reproduces the actual selection order EXACTLY under this rule
// (David finished 1st in the 2024 regular season but 4th in the bracket, and he
// selected 7th, first among the four — which only reverse-BRACKET predicts). That
// is the decisive case, so the rule is confirmed and no longer provisional.
//
// Pure. The board reset / archive / live claim board wire this.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

/** Regular-season order (best→worst) from rows, tiebroken by total points. */
function regSeasonOrder(rows) {
  return [...rows]
    .sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.pf || 0) - (a.pf || 0))
    .map(r => r.owner_id);
}

/**
 * Compute the selection order.
 * @param regOrder      owner ids, best→worst by regular season (or pass rows to regSeasonOrder first)
 * @param playoffFinish owner ids of the playoff teams, best→worst by BRACKET
 *                      (champ first). null/undefined ⇒ playoffs not decided yet.
 * @param playoffTeams  how many make the playoffs (default 4)
 * @returns {
 *   picks:   [{ pick, owner_id, source:'regular'|'playoff', locked }]  // full when complete
 *   pending: owner_id[]   // the playoff teams whose slot isn't decided yet (stage 1)
 *   dinner:  owner_id     // last place buys dinner on draft day
 *   complete: boolean
 * }
 */
function computeSelectionOrder(regOrder, playoffFinish, playoffTeams = 4) {
  const n = regOrder.length;

  const picks = [];
  let nonPlayoff, dinner;

  if (playoffFinish && playoffFinish.length) {
    // Stage 2 — the bracket is known. The playoff four ARE the bracket teams; the
    // non-playoff six are everyone else, kept in regular-season order. Deriving
    // non-playoff by EXCLUSION (rather than assuming they're the bottom six of the
    // regular season) keeps the order correct even in the rare year a bracket team
    // wasn't a top-seed — a silent-wrong draft order is the worst failure here.
    const inPlayoff = new Set(playoffFinish);
    nonPlayoff = regOrder.filter(o => !inPlayoff.has(o));
    const reversedNon = [...nonPlayoff].reverse();          // worst → best among non-playoff
    reversedNon.forEach((oid, i) => picks.push({ pick: i + 1, owner_id: oid, source: 'regular', locked: true }));

    // The playoff four, reverse bracket finish: 4th, 3rd, runner-up, CHAMPION last.
    const reversedPlayoff = [...playoffFinish].reverse();   // worst bracket → champ
    reversedPlayoff.forEach((oid, i) =>
      picks.push({ pick: reversedNon.length + i + 1, owner_id: oid, source: 'playoff', locked: true }));

    dinner = nonPlayoff.length ? nonPlayoff[nonPlayoff.length - 1] : regOrder[n - 1];
    return { picks, pending: [], dinner, complete: true };
  }

  // Stage 1 — the bracket isn't decided. The top `playoffTeams` seeds make the
  // playoffs (league format), so the non-playoff six are the rest, and their six
  // picks lock now, worst record first. The playoff seeds' order is pending.
  nonPlayoff = regOrder.slice(playoffTeams);
  const playoffSeeds = regOrder.slice(0, playoffTeams);
  const reversedNon = [...nonPlayoff].reverse();
  reversedNon.forEach((oid, i) => picks.push({ pick: i + 1, owner_id: oid, source: 'regular', locked: true }));
  dinner = regOrder[n - 1];                                 // worst record overall
  return { picks, pending: playoffSeeds, dinner, complete: false };
}

/**
 * Bracket finish (champ→4th) from an AWARDS-style list of [category, name, ...]
 * rows, mapped to owner ids via nameToId. Reads playoff_1..playoff_N in order.
 * Returns [] if the categories aren't present (bracket not recorded).
 */
function bracketFinishFromAwards(awardRows, nameToId, playoffTeams = 4) {
  if (!Array.isArray(awardRows)) return [];
  const out = [];
  for (let i = 1; i <= playoffTeams; i++) {
    const row = awardRows.find(r => r[0] === `playoff_${i}`);
    if (!row) break;
    const oid = nameToId ? nameToId(row[1]) : row[1];
    if (oid == null) break;
    out.push(oid);
  }
  return out;
}

module.exports = {
  regSeasonOrder, computeSelectionOrder, bracketFinishFromAwards,
  // CONFIRMED (Cory 2026-08-09) against the 2025 draft, the decisive bracket-≠-
  // standings case. Surfaces may render the top-four order as final, not provisional.
  PLAYOFF_RULE_CONFIRMED: true,
};
