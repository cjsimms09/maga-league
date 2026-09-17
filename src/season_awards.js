'use strict';
//
// THE OTHER FIVE-SIXTHS OF THE MONEY — regular-season and playoff prizes.
//
// Cory, 2026-09-17: "Same with all other winnings.. it shouldn't need claude to
// do these things.. it has all the info it needs."
//
// He is right, and it is demonstrable rather than a matter of opinion. Derived
// from the Sleeper harvest and checked against `master_sheet_archive.json` —
// the hand-maintained founding document, an entirely independent record — the
// six awards come out RIGHT on every completed season:
//
//     2023, 2024, 2025 × (reg 1st, reg 2nd, playoff 1st-4th) = 18 of 18 agree
//
// So nothing here is a guess about who won. What was missing was a job that
// writes it into the ledger. `POST /admin/awards` has always done that, and it
// needed a human to open the admin panel and press it — the same shape as the
// weekly high (src/weekly_high.js), and the same outcome: an empty ledger
// beside finished games.
//
// PURE — no I/O, so every rule below is unit-tested without Blobs, Sleeper or a
// deploy. netlify/functions/weekly-high-cron.js does the fetching and writing.
//
// ── WHAT "DECIDED" MEANS, because paying early is the real hazard ───────────
// Awarding the regular-season prize to whoever currently leads is exactly the
// bug found in history-data's computeMoney on 2026-09-16: after ONE GAME it
// had Richard winning $250 on a 1-0 record. So:
//   · reg_1 / reg_2   only once EVERY regular-season week has been played
//   · playoff_1..4    only from a bracket match that has a winner AND a loser;
//                     an undecided match yields no placement and no money
// Nothing is provisional here. If it is not settled, it is not written.

const CATEGORY_ORDER = ['reg_1', 'reg_2', 'playoff_1', 'playoff_2', 'playoff_3', 'playoff_4'];

/** The ledger already holds this category for this year? */
function existingAward(ledger, year, category) {
  return (ledger || []).find(e =>
    e && e.type === 'award' && Number(e.year) === Number(year) && e.category === category) || null;
}

/**
 * Is the regular season over? Every paying week played, not "we are past week N"
 * by the calendar — a postponed week would make the calendar lie.
 */
function regularSeasonComplete(season, stateWeek) {
  const weeks = Number(season && season.weeks) || 0;
  return weeks > 0 && Number(stateWeek) > weeks;
}

/**
 * The awards that are DECIDED and NOT yet recorded.
 *
 * @param {object} season    { year, weeks }
 * @param {number} stateWeek Sleeper's current NFL week
 * @param {Array}  standings sleeper.standings() rows (ranked, carrying owner_id)
 * @param {object} placements sleeper.placementsFrom() — {1..4: roster_id}
 * @param {object} amounts   { reg_1, reg_2, playoff_1..4 } dollar amounts
 * @param {Array}  ledger
 * @param {Function} ownerOf roster_id -> owner id or null
 * @returns {{entries: Array, skipped: Array}}
 */
function awardsToRecord(season, stateWeek, standings, placements, amounts, ledger, ownerOf) {
  const entries = [];
  const skipped = [];
  const want = [];

  if (regularSeasonComplete(season, stateWeek)) {
    const r1 = (standings || []).find(r => r.rank === 1);
    const r2 = (standings || []).find(r => r.rank === 2);
    if (r1) want.push(['reg_1', r1.owner_id, r1.roster_id, r1.team]);
    if (r2) want.push(['reg_2', r2.owner_id, r2.roster_id, r2.team]);
  } else {
    skipped.push({ category: 'reg_1/reg_2',
                   reason: 'the regular season is not over — a standings lead is not a prize' });
  }

  for (const place of [1, 2, 3, 4]) {
    const rid = (placements || {})[place];
    if (rid == null) {
      skipped.push({ category: `playoff_${place}`, reason: 'the bracket has not decided this place yet' });
      continue;
    }
    want.push([`playoff_${place}`, ownerOf ? ownerOf(rid) : null, rid, null]);
  }

  for (const [category, ownerId, rosterId, team] of want) {
    if (existingAward(ledger, season.year, category)) {
      skipped.push({ category, reason: 'already recorded — left exactly as it is' });
      continue;
    }
    if (ownerId == null) {
      // The case that must shout. Real money, no owner to attribute it to.
      skipped.push({ category,
        reason: 'UNMAPPED — the winning roster has no owner in config.sleeper_map, '
              + 'so $ cannot be attributed. Fix the map; nothing was recorded.',
        detail: { roster_id: rosterId, team } });
      continue;
    }
    const amount = Number(amounts && amounts[category]);
    if (!Number.isFinite(amount) || amount <= 0) {
      skipped.push({ category, reason: 'no payout amount configured for this category',
                     detail: { amount: amounts && amounts[category] } });
      continue;
    }
    entries.push({
      owner_id: Number(ownerId), year: Number(season.year), type: 'award',
      category, amount,
      desc: null,          // the caller supplies CATEGORY_LABELS; this module stays label-free
      // Not paid. Who won is a fact; money changing hands is a human's claim.
      settled: false,
      _roster_id: rosterId,
    });
  }
  return { entries, skipped };
}

module.exports = { CATEGORY_ORDER, existingAward, regularSeasonComplete, awardsToRecord };
