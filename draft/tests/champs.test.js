'use strict';
// THE CROWN — the defending champion + dynasty counts, derived from the champions
// roll. The logic is asserted over a FIXTURE (champs functions take an optional
// roll) so this never false-alarms when the real champion changes in January — that
// change is the whole point. A final block sanity-checks the live archive's shape
// without hardcoding who currently holds it.
const path = require('path');
const C = require(path.join(__dirname, '..', '..', 'src', 'champs'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

// A fixture roll: two solo titles for A, a co-championship (asterisked) shared by
// B and C, and the latest year won by A.
const fixture = [
  { year: 2018, champion: 'A', asterisk: false },
  { year: 2019, champion: 'B/C', asterisk: true },   // disputed co-title
  { year: 2020, champion: 'B', asterisk: false },
  { year: 2021, champion: 'A', asterisk: false },     // latest -> A defends
];

ck('defending = the latest season winner', JSON.stringify(C.defendingChampions(fixture)) === '["A"]', JSON.stringify(C.defendingChampions(fixture)));
ck('reigning year is the max year', C.reigningYear(fixture) === 2021, C.reigningYear(fixture));
ck('isDefending true for the holder', C.isDefending('A', fixture) === true);
ck('isDefending false for a past champ', C.isDefending('B', fixture) === false);

const tc = C.titleCounts(fixture);
ck('A has 2 clean titles', tc.A && tc.A.clean === 2 && tc.A.disputed === 0 && tc.A.total === 2, JSON.stringify(tc.A));
ck('B has 1 clean + 1 disputed', tc.B && tc.B.clean === 1 && tc.B.disputed === 1 && tc.B.total === 2, JSON.stringify(tc.B));
ck('C has only the disputed co-title', tc.C && tc.C.clean === 0 && tc.C.disputed === 1 && tc.C.total === 1, JSON.stringify(tc.C));

// A co-championship in the latest year crowns BOTH holders.
const coLatest = [{ year: 2025, champion: 'X/Y', asterisk: true }];
ck('a co-championship crowns both holders', JSON.stringify(C.defendingChampions(coLatest)) === '["X","Y"]', JSON.stringify(C.defendingChampions(coLatest)));

// Empty roll is safe.
ck('empty roll -> nobody defends', C.defendingChampions([]).length === 0 && C.reigningYear([]) === null);

// Live archive sanity — shape only, no hardcoded holder (it moves on its own).
const liveDef = C.defendingChampions();
const liveCounts = C.titleCounts();
ck('live: exactly one defending line (a name, or co-holders)', Array.isArray(liveDef) && liveDef.length >= 1, JSON.stringify(liveDef));
ck('live: the defender has a title recorded', liveDef.every(n => liveCounts[n] && liveCounts[n].total >= 1), JSON.stringify(liveDef));
ck('live: Marian carries the disputed 2022 co-title', liveCounts.Marian && liveCounts.Marian.disputed >= 1, JSON.stringify(liveCounts.Marian));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
