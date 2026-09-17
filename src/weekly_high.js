'use strict';
//
// WHO WON THE WEEK, AND THE $100 THAT GOES WITH IT.
//
// Cory, 2026-09-17: "Every week the high point should be recorded and winnings
// for that week attributed.. this isn't hard."
//
// It is not hard, and it was never being done. The admin panel has had a
// one-click "weekly high point" form since the beginning — POST /admin/weekly,
// which writes the ledger entry that actually moves $100 into somebody's
// winnings — and it requires a human to open the page, pick the week, and press
// the button. Nobody pressed it. The chronicle could show the winner (once the
// season stopped being filtered out) while the LEDGER, which is what /bank and
// every "winnings this year" number read from, stayed empty. Two surfaces, one
// of them manual, and the manual one is the one that holds the money.
//
// THIS MODULE IS THE DECISION, WITH NO I/O IN IT. The cron
// (netlify/functions/weekly-high-cron.js) does the fetching and the writing;
// everything that decides WHETHER and WHOM lives here so it can be tested
// without Blobs, Sleeper, or a deploy.
//
// ── THE RULES, stated once ──────────────────────────────────────────────────
//   · a week is eligible only when it is FINISHED (strictly before the NFL
//     state week) and inside the season's paying weeks
//   · already in the ledger -> LEAVE IT ALONE. Never replace, never top up.
//     The admin form deliberately replaces on a manual re-record; a robot that
//     did the same would silently overwrite a correction somebody made on
//     purpose, and would do it every Tuesday forever.
//   · nobody scored -> not played, skip (Sleeper returns 0.00 rows for weeks
//     that have not happened)
//   · the winner maps to no owner -> RECORD NOTHING and say so loudly. Money
//     must not be attributed to a guess, and a silent skip here looks exactly
//     like a week nobody won.

/** The ledger key for a weekly-high entry: one per (year, week). */
function existingWeeklyEntry(ledger, year, week) {
  return (ledger || []).find(e =>
    e && e.type === 'weekly' && Number(e.year) === Number(year) && Number(e.week) === Number(week)) || null;
}

/**
 * Which weeks still need a weekly-high entry.
 *
 * @param {object}   season      the season doc ({ year, weeks, weekly_payout })
 * @param {number}   stateWeek   Sleeper's current NFL week (the week IN PROGRESS)
 * @param {Array}    ledger      the money ledger
 * @returns {number[]} ascending week numbers, each finished, paying, and unrecorded
 */
function weeksNeedingRecord(season, stateWeek, ledger) {
  if (!season || !Number.isFinite(Number(stateWeek))) return [];
  const paying = Number(season.weeks) || 0;
  const out = [];
  // strictly LESS than the state week: the week Sleeper calls current is still
  // being played, and a high score is not final until it is over.
  for (let w = 1; w < Number(stateWeek); w++) {
    if (w > paying) break;                                  // weekly money is regular-season only
    if (existingWeeklyEntry(ledger, season.year, w)) continue;
    out.push(w);
  }
  return out;
}

/**
 * Turn a week's high scorer into the ledger entry to write, or into a REASON
 * not to write one. Never returns a half-answer.
 *
 * @param {object} season
 * @param {number} week
 * @param {object|null} scorer  sleeper.highScorer() output
 * @returns {{ok: true, entry: object} | {ok: false, reason: string, detail?: object}}
 */
function entryFor(season, week, scorer) {
  if (!scorer) {
    return { ok: false, reason: 'no matchup data for the week' };
  }
  if (!(Number(scorer.points) > 0)) {
    return { ok: false, reason: 'nobody scored — the week has not been played',
             detail: { points: scorer.points } };
  }
  if (!scorer.owner || scorer.owner.id == null) {
    // The one case that must shout. An unmapped roster means config.sleeper_map
    // is missing this team, and money cannot be attributed to a guess.
    return { ok: false, reason: 'UNMAPPED — the winning roster has no owner in config.sleeper_map, '
                                 + 'so $ cannot be attributed. Fix the map; nothing was recorded.',
             detail: { roster_id: scorer.roster_id, team: scorer.team, points: scorer.points } };
  }
  const amount = Number.isFinite(Number(season.weekly_payout)) ? Number(season.weekly_payout) : 100;
  return {
    ok: true,
    entry: {
      owner_id: Number(scorer.owner.id),
      year: Number(season.year),
      type: 'weekly',
      week: Number(week),
      amount,
      desc: `Week ${week} high point`,
      // NOT settled. Recording who won is a fact; marking it PAID is a claim
      // about money changing hands, which only a human knows. The admin form
      // keeps its `paid` checkbox for exactly that.
      settled: false,
    },
    scorer: { team: scorer.team, points: scorer.points, owner: scorer.owner.name || scorer.owner.id },
  };
}

module.exports = { existingWeeklyEntry, weeksNeedingRecord, entryFor };
