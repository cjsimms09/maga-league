// ─────────────────────────────────────────────────────────────────────────────
// DRAFT-SELECTION ORDER — reverse-finish, two-stage.
//
// The rule (Cory): slot-selection order is REVERSE of final finish — last place
// selects first, champion selects last. The final finish is:
//   • positions 5–10: the six non-playoff teams by regular-season rank (locked
//     the moment the regular season ends), and
//   • positions 1–4: the four playoff teams ordered by BRACKET finish (can't be
//     known until the championship is decided).
// So selection resolves in two stages: the first (N−playoffTeams) picks lock at
// regular-season end (reverse of the non-playoff six); the last `playoffTeams`
// picks stay pending until the bracket completes. Reg-season ties break on total
// points (PF), same as standings (Cory-confirmed).
//
// Pure. The board reset / archive / UI wire this; here is just the computation
// so it can be verified against history before anything is baked in.
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
  const nonPlayoff = regOrder.slice(playoffTeams);          // final finishes 5..n (reg-season order)
  const playoffSeeds = regOrder.slice(0, playoffTeams);     // the teams that made it (bracket TBD)

  // Stage 1 — the non-playoff six select first, worst record first. Always locked.
  const picks = [];
  const reversedNon = [...nonPlayoff].reverse();            // worst → best among non-playoff
  reversedNon.forEach((oid, i) => picks.push({ pick: i + 1, owner_id: oid, source: 'regular', locked: true }));

  const dinner = regOrder[n - 1];                           // worst record overall

  if (!playoffFinish || !playoffFinish.length) {
    // Stage 1 only — the playoff teams' order is pending the bracket.
    return { picks, pending: playoffSeeds, dinner, complete: false };
  }

  // Stage 2 — playoff teams, final finishes 1..playoffTeams (champ..lowest).
  // Selection order is reverse: the lowest bracket finisher selects first among
  // them, the champion selects last (dead last overall).
  const reversedPlayoff = [...playoffFinish].reverse();     // worst bracket → champ
  reversedPlayoff.forEach((oid, i) =>
    picks.push({ pick: reversedNon.length + i + 1, owner_id: oid, source: 'playoff', locked: true }));

  return { picks, pending: [], dinner, complete: true };
}

module.exports = { regSeasonOrder, computeSelectionOrder };
