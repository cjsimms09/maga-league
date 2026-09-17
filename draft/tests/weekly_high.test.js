'use strict';
// THE WEEKLY $100 — who gets it, and the four cases where nobody does.
//
// src/weekly_high.js is the decision half of weekly-high-cron: no Blobs, no
// Sleeper, so every rule below is asserted directly rather than through a
// deploy. The cron is a thin wrapper around exactly these functions.
//
// The expensive failure here is not "no entry written" — that is visible. It is
// a WRONG entry: $100 to the wrong owner, or a second $100 on top of one a
// human already corrected. Both get their own case.

const path = require('path');
const WH = require(path.join(__dirname, '..', '..', 'src', 'weekly_high.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
                            : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : ''))); };

const SEASON = { year: 2026, weeks: 15, weekly_payout: 100 };
const owner = (id, name) => ({ id, name });

// ── which weeks need recording ──────────────────────────────────────────────

ck('a finished, unrecorded week is picked up',
   JSON.stringify(WH.weeksNeedingRecord(SEASON, 3, [])) === JSON.stringify([1, 2]),
   WH.weeksNeedingRecord(SEASON, 3, []));

ck('THE WEEK IN PROGRESS IS NOT RECORDED — a high score is not final until the week is over',
   !WH.weeksNeedingRecord(SEASON, 3, []).includes(3),
   WH.weeksNeedingRecord(SEASON, 3, []));

ck('it BACKFILLS every missed week, not just last week',
   JSON.stringify(WH.weeksNeedingRecord(SEASON, 6, [])) === JSON.stringify([1, 2, 3, 4, 5]),
   WH.weeksNeedingRecord(SEASON, 6, []));

ck('an already-recorded week is skipped',
   JSON.stringify(WH.weeksNeedingRecord(SEASON, 4,
     [{ type: 'weekly', year: 2026, week: 2, owner_id: 8, amount: 100 }])) === JSON.stringify([1, 3]),
   WH.weeksNeedingRecord(SEASON, 4, [{ type: 'weekly', year: 2026, week: 2 }]));

// THE EXPENSIVE ONE. The admin form REPLACES on a manual re-record, which is
// right for a human fixing a mistake. A robot doing the same would undo that
// correction every Tuesday, forever, and nobody would see it happen.
ck('A HUMAN CORRECTION IS NEVER OVERWRITTEN — a settled entry still counts as recorded',
   WH.weeksNeedingRecord(SEASON, 3,
     [{ type: 'weekly', year: 2026, week: 1, owner_id: 4, amount: 100, settled: true }]).join() === '2',
   WH.weeksNeedingRecord(SEASON, 3, [{ type: 'weekly', year: 2026, week: 1, settled: true }]));

ck('weekly money is REGULAR SEASON only — week 16 is never paid',
   !WH.weeksNeedingRecord(SEASON, 18, []).includes(16),
   WH.weeksNeedingRecord(SEASON, 18, []));

ck("another season's entry does not mask this season's week",
   WH.weeksNeedingRecord(SEASON, 2, [{ type: 'weekly', year: 2025, week: 1 }]).join() === '1');

ck('a non-weekly ledger entry for the same week does not mask it',
   WH.weeksNeedingRecord(SEASON, 2, [{ type: 'award', year: 2026, week: 1 }]).join() === '1');

// ── who gets the money ──────────────────────────────────────────────────────

const good = WH.entryFor(SEASON, 1, { roster_id: 8, points: 147, team: "Richard's team", owner: owner(8, 'Richard') });
ck('the high scorer gets an entry', good.ok === true, good);
ck('  … for $100, the season rate', good.ok && good.entry.amount === 100, good.entry);
ck('  … attributed to the mapped owner', good.ok && good.entry.owner_id === 8, good.entry);
ck('  … typed `weekly` with the week on it, which is what the ledger keys on',
   good.ok && good.entry.type === 'weekly' && good.entry.week === 1, good.entry);

// Recording who won is a FACT; marking it paid is a claim about money actually
// changing hands, and only a human knows that.
ck('  … and NOT marked paid — a robot does not get to say money changed hands',
   good.ok && good.entry.settled === false, good.entry);

ck('the season rate is used, not a hardcoded 100',
   WH.entryFor({ year: 2026, weeks: 15, weekly_payout: 25 }, 1,
     { roster_id: 8, points: 147, team: 't', owner: owner(8, 'R') }).entry.amount === 25);

// ── the four ways nobody gets paid ──────────────────────────────────────────

ck('no matchup data -> no entry', WH.entryFor(SEASON, 1, null).ok === false);

ck('NOBODY SCORED -> no entry (Sleeper returns 0.00 rows for weeks not played)',
   WH.entryFor(SEASON, 9, { roster_id: 3, points: 0, team: 't', owner: owner(3, 'x') }).ok === false);

// The case that must shout rather than skip quietly: an unmapped roster means
// real money goes unattributed, and it will keep happening every week.
const unmapped = WH.entryFor(SEASON, 1, { roster_id: 8, points: 147, team: 'Unknown', owner: null });
ck('AN UNMAPPED WINNER RECORDS NOTHING rather than guessing an owner', unmapped.ok === false, unmapped);
ck('  … and says UNMAPPED so it cannot be mistaken for "nobody won"',
   /UNMAPPED/.test(unmapped.reason) && /sleeper_map/.test(unmapped.reason), unmapped.reason);
ck('  … naming the roster and score so it can be fixed without re-deriving it',
   unmapped.detail && unmapped.detail.roster_id === 8 && unmapped.detail.points === 147, unmapped.detail);

// ── the real week 1, end to end ─────────────────────────────────────────────
// Rule 121: the numbers below are the ones that actually happened, read off
// league_history.json — Richard 147.00, second Justin 136.36.
const real = WH.entryFor(SEASON, 1,
  { roster_id: 8, points: 147, team: 'Richard2121', owner: owner(8, 'Richard') });
ck('WEEK 1 2026: Richard, 147.00 -> $100 to Richard',
   real.ok && real.entry.owner_id === 8 && real.entry.amount === 100
     && real.entry.desc === 'Week 1 high point', real.entry);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
