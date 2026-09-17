'use strict';
// THE CHIEFS-HOMER COUNTER — locks the audited finding that refutes the Bates
// reputation. League-visible history (a RESULT: who drafted whom), not a tool.
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const H = require(path.join(ROOT, 'src', 'routes', 'history-data.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const A = H.build();
const CH = A.chiefsHomers;

ck('chiefsHomers section exists', !!CH && Array.isArray(CH.rows) && CH.rows.length > 0);
ck('all ten owners tallied', CH.rows.length === 10, `got ${CH.rows.length}`);

const bates = CH.rows.find(r => r.owner === 'Bates');
ck('Bates is present', !!bates);

// ⚠️ THE PINNED LEADERBOARD IS GONE, AND THE FINDING IT LOCKED IS SUPERSEDED.
// This asserted `bates.kc === 3`, `batesRank === 3`, and that David and Marian
// lead — the 2026-audited finding "Bates has 3 KC picks and is NOT the leader",
// which refuted his reputation.
//
// That finding was computed over 2023-2025, the only seasons the chronicle then
// carried. On 2026-09-17 the live season joined it (the weekly-high fix), Bates
// drafted TWO MORE CHIEFS in 2026, and he is now tied at the top on 5.
//
// THE REPUTATION IS BACK AND THE DATA SAYS SO. That is news, not a regression —
// but re-pinning 5 would just move the staleness a year down the road, which is
// the trap this repo has hit three times in eight days. So the INVARIANTS are
// asserted and the leaderboard is left free to move:
//   · every owner is tallied, counts are sane non-negative integers
//   · `leaders` really is the set holding the maximum
//   · `batesRank` agrees with the rows rather than being carried separately
// The 2023-25 finding stays recorded HERE, in prose, where a stale number can
// mislead nobody.
const kcs = CH.rows.map(r => r.kc);
ck('every KC count is a non-negative integer', kcs.every(n => Number.isInteger(n) && n >= 0), `${kcs}`);
const maxKc = Math.max(...kcs);
ck('leaders ARE the owners holding the maximum',
   CH.leaders.length > 0 && CH.leaders.every(n => (CH.rows.find(r => r.owner === n) || {}).kc === maxKc)
     && CH.rows.filter(r => r.kc === maxKc).length === CH.leaders.length,
   `leaders=${CH.leaders} max=${maxKc}`);
ck('rows are sorted by KC picks, descending', kcs.every((n, i) => i === 0 || kcs[i - 1] >= n), `${kcs}`);
ck('batesRank agrees with the rows it is derived from',
   CH.batesRank === (CH.rows.filter(r => r.kc > bates.kc).length + 1),
   `stated=${CH.batesRank} derived=${CH.rows.filter(r => r.kc > bates.kc).length + 1}`);

// Honesty guards: loyalty measured, overpay explicitly NOT fabricated.
ck('verdict names the reputation-without-receipts', /out-Chiefed|reputation/.test(CH.verdict), CH.verdict);
ck('overpay is left UNMEASURED, not invented', /not computable|no archived/.test(CH.overpayNote));
ck('team-attribution caveat carried', /current-season board|changed clubs/.test(CH.teamAttributionNote));

// League rate is a real number, sums are consistent.
const sumKC = CH.rows.reduce((a, r) => a + r.kc, 0);
ck('per-owner KC sums to league KC', sumKC === CH.leagueKC, `${sumKC} vs ${CH.leagueKC}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
