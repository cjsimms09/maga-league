'use strict';
// THE OTHER FIVE-SIXTHS OF THE MONEY — regular-season and playoff prizes.
//
// Two layers here, and the second is the one that matters:
//
//   1. the RULES (src/season_awards.js) — pure, so every branch is asserted
//      directly: paid only when decided, never overwritten, never marked paid,
//      loud on an unmapped winner.
//
//   2. THE DERIVATION IS RIGHT, checked against an INDEPENDENT SOURCE. Deriving
//      the six winners from the Sleeper harvest and comparing them with
//      master_sheet_archive.json — the hand-maintained founding document, which
//      nothing in this pipeline writes — gives 18 of 18 across 2023, 2024, 2025.
//      That is what makes "the site has all the info it needs" a measurement
//      rather than a hope.

const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const SA = require(path.join(ROOT, 'src', 'season_awards.js'));
const sleeper = require(path.join(ROOT, 'src', 'sleeper.js'));
const H = require(path.join(ROOT, 'src', 'routes', 'history-data.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
                            : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : ''))); };

const SEASON = { year: 2026, weeks: 15 };
const AMOUNTS = { reg_1: 225, reg_2: 50, playoff_1: 300, playoff_2: 200, playoff_3: 125, playoff_4: 100 };
const STAND = [
  { rank: 1, roster_id: 8, owner_id: 8, team: 'Richard2121' },
  { rank: 2, roster_id: 3, owner_id: 3, team: 'cashworth' },
];
const OWNER_OF = rid => ({ 8: 8, 3: 3, 5: 5, 2: 2 })[rid] ?? null;
const cats = r => r.entries.map(e => e.category).sort();

// ── paying early is the hazard ──────────────────────────────────────────────

const midSeason = SA.awardsToRecord(SEASON, 3, STAND, {}, AMOUNTS, [], OWNER_OF);
ck('MID-SEASON: no regular-season prize — a standings lead is not a prize',
   midSeason.entries.length === 0, cats(midSeason));
ck('  … and it SAYS why rather than silently doing nothing',
   midSeason.skipped.some(s => /not over/.test(s.reason)), midSeason.skipped);

ck('the regular season is complete only when EVERY paying week is played',
   SA.regularSeasonComplete(SEASON, 15) === false && SA.regularSeasonComplete(SEASON, 16) === true);

const done = SA.awardsToRecord(SEASON, 16, STAND, {}, AMOUNTS, [], OWNER_OF);
ck('REGULAR SEASON OVER: 1st and 2nd are paid',
   JSON.stringify(cats(done)) === JSON.stringify(['reg_1', 'reg_2']), cats(done));
ck('  … 1st gets the 1st amount, to the right owner',
   done.entries.find(e => e.category === 'reg_1').amount === 225
     && done.entries.find(e => e.category === 'reg_1').owner_id === 8);

// ── the bracket decides the playoffs, not the standings ─────────────────────

const undecided = SA.awardsToRecord(SEASON, 18, STAND, {}, AMOUNTS, [], OWNER_OF);
ck('AN UNDECIDED BRACKET PAYS NOTHING for the playoffs',
   !cats(undecided).some(c => c.startsWith('playoff')), cats(undecided));

const decided = SA.awardsToRecord(SEASON, 18, STAND, { 1: 8, 2: 3, 3: 5, 4: 2 }, AMOUNTS, [], OWNER_OF);
ck('A DECIDED BRACKET pays all four places',
   ['playoff_1', 'playoff_2', 'playoff_3', 'playoff_4'].every(c => cats(decided).includes(c)), cats(decided));
ck('  … a 3-seed CAN win it: placement comes from the bracket, not the standings rank',
   decided.entries.find(e => e.category === 'playoff_3').owner_id === 5);

// partially decided — the final played, the third-place game not
const partial = SA.awardsToRecord(SEASON, 18, STAND, { 1: 8, 2: 3 }, AMOUNTS, [], OWNER_OF);
ck('a PARTIALLY decided bracket pays only the decided places',
   cats(partial).includes('playoff_1') && cats(partial).includes('playoff_2')
     && !cats(partial).includes('playoff_3'), cats(partial));

// ── never overwrite, never guess, never mark paid ───────────────────────────

const already = SA.awardsToRecord(SEASON, 16, STAND, {}, AMOUNTS,
  [{ type: 'award', year: 2026, category: 'reg_1', owner_id: 4, amount: 225, settled: true }], OWNER_OF);
ck('A HUMAN CORRECTION IS NEVER OVERWRITTEN — an existing award is left alone',
   JSON.stringify(cats(already)) === JSON.stringify(['reg_2']), cats(already));

const unmapped = SA.awardsToRecord(SEASON, 18, STAND, { 1: 99 }, AMOUNTS, [], OWNER_OF);
ck('AN UNMAPPED WINNER PAYS NOTHING rather than guessing an owner',
   !cats(unmapped).includes('playoff_1'), cats(unmapped));
ck('  … and says UNMAPPED, naming the roster',
   unmapped.skipped.some(s => /UNMAPPED/.test(s.reason) && s.detail && s.detail.roster_id === 99),
   unmapped.skipped);

ck('nothing is marked PAID — a robot does not get to say money changed hands',
   decided.entries.every(e => e.settled === false));

const noAmount = SA.awardsToRecord(SEASON, 16, STAND, {}, { reg_1: 0 }, [], OWNER_OF);
ck('a category with no configured payout is skipped, not paid $0',
   noAmount.entries.length === 0, noAmount.skipped);

// ── THE DERIVATION, against an independent record ───────────────────────────
// This is the claim "it has all the info it needs", measured.

const master = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft/data/master_sheet_archive.json'), 'utf8'));
const lh = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft/data/league_history.json'), 'utf8'));
const A = H.build();
const ORD = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
let agree = 0, disagree = [];
for (const y of ['2023', '2024', '2025']) {
  const season = A.byYear[Number(y)];
  const raw = lh.seasons.find(s => s.season === y);
  const m = master.seasons[y];
  if (!season || !raw || !m) { disagree.push(`${y} missing`); continue; }
  const nameOf = rid => (season.teams[rid] || {}).name || `#${rid}`;
  const check = (label, got, want) => {
    if (String(got) === String(want)) agree++; else disagree.push(`${y} ${label}: ${got} vs ${want}`);
  };
  check('reg_1', nameOf((season.standings.find(r => r.rank === 1) || {}).roster_id),
        m.regular_season['1st'].winner);
  check('reg_2', nameOf((season.standings.find(r => r.rank === 2) || {}).roster_id),
        m.regular_season['2nd'].winner);
  // placementsFrom is the LIVE reader; feeding it the harvested bracket proves
  // the same function the cron will use on Sleeper's feed gets these right.
  const pl = sleeper.placementsFrom(raw.brackets && raw.brackets.winners);
  for (const p of [1, 2, 3, 4]) check(`playoff_${p}`, nameOf(pl[p]), m.playoffs[ORD[p]].winner);
}
ck('THE SIX WINNERS ARE DERIVABLE — 18 of 18 against the master sheet, an independent record',
   agree === 18 && disagree.length === 0, { agree, disagree });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
