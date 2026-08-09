'use strict';
// RIVALRY GAME OF THE WEEK — the registry, the pair matching, the slate ranking,
// and the notable-facts builder. Pure functions, so fixtures assert the logic.
const path = require('path');
const R = require(path.join(__dirname, '..', '..', 'src', 'rivalries'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

// Pair matching is order-independent and case-insensitive.
ck('Dylan vs Sam is a rivalry', !!R.billingFor('Dylan', 'Sam'));
ck('Sam vs Dylan matches the same one', R.billingFor('Sam', 'Dylan').key === 'dylan-sam');
ck('case-insensitive', R.billingFor('dylan', 'SAM').key === 'dylan-sam');
ck('Marian vs David is the German egg', R.billingFor('Marian', 'David').tone === 'german' && R.billingFor('Marian', 'David').egg === true);
ck('a non-rivalry pair returns null', R.billingFor('Bates', 'Sam') === null);
ck('missing names return null', R.billingFor('', 'Sam') === null);

// Every rivalry the spec named is present, with a name and copy.
for (const k of ['dylan-sam', 'bates-richard', 'marian-david', 'sam-jeremy', 'michael-cory', 'cory-david', 'richard-justin']) {
  const r = R.RIVALRIES.find(x => x.key === k);
  ck('rivalry ' + k + ' exists with a name + blurb', !!(r && r.name && r.blurb && r.tone));
}

// Ranking: Dylan–Sam outranks Bates–Richard outranks the rest.
const ds = R.billingFor('Dylan', 'Sam').rank;
const br = R.billingFor('Bates', 'Richard').rank;
const cd = R.billingFor('Cory', 'David').rank;
ck('Dylan–Sam is the marquee (rank 1)', ds === 1, ds);
ck('Bates–Richard is second', br === 2, br);
ck('Dylan–Sam outranks the friendlies', ds < cd && br < cd);

// billingForSlate ranks a week's hits and drops non-rivalry games.
const slate = [
  { a: 'Cory', b: 'David' },      // friendship, rank 6
  { a: 'Dylan', b: 'Sam' },       // grudge, rank 1
  { a: 'Bates', b: 'Justin' },    // not a rivalry -> dropped
];
const hits = R.billingForSlate(slate);
ck('slate keeps only the rivalry games', hits.length === 2, hits.length);
ck('slate ranks the marquee first', hits[0].key === 'dylan-sam', hits[0].key);
ck('slate carries the pair through', hits[0].pair && hits[0].pair.a === 'Dylan');

// notableFrom turns an h2h summary into billing facts.
const rec = {
  played: 3, record: '2-1', a: { wins: 2 }, b: { wins: 1 },
  playoffs: 1,
  playoffGames: [{ season: '2024', winner: 'a', margin: 20, final: false }],
  games: [
    { winner: 'a', margin: 1.5, season: '2025' },
    { winner: 'b', margin: 40, season: '2024' },
    { winner: 'a', margin: 20, season: '2024' },
  ],
};
const nf = R.notableFrom(rec, 'Cory', 'David');
ck('notable carries the record', nf.record === '2-1', nf.record);
ck('notable finds the closest game', /closest: Cory by 1.5/.test(nf.line), nf.line);
ck('notable finds the worst beating', /worst beating: David by 40/.test(nf.line), nf.line);
ck('notable mentions the playoff knockout', /knocked the other out/.test(nf.line), nf.line);
ck('no-history notable is graceful', /First meeting/.test(R.notableFrom({ played: 0 }, 'A', 'B').line));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
