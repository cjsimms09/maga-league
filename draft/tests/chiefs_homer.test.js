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
// The documented, reproduced finding: Bates has 3 KC picks and is NOT the leader.
ck('Bates has exactly 3 KC picks', bates && bates.kc === 3, bates && `kc=${bates.kc}`);
ck('Bates is NOT the top Chiefs drafter', !CH.leaders.includes('Bates'), `leaders=${CH.leaders}`);
ck('Bates ranks 3rd', CH.batesRank === 3, `rank=${CH.batesRank}`);

// The two Germans lead — David and Marian, both at the top.
ck('the leaders are David and Marian', CH.leaders.includes('David') && CH.leaders.includes('Marian'), `${CH.leaders}`);
ck('leaders out-pick Bates', CH.rows[0].kc > bates.kc, `${CH.rows[0].kc} vs ${bates.kc}`);

// Honesty guards: loyalty measured, overpay explicitly NOT fabricated.
ck('verdict names the reputation-without-receipts', /out-Chiefed|reputation/.test(CH.verdict), CH.verdict);
ck('overpay is left UNMEASURED, not invented', /not computable|no archived/.test(CH.overpayNote));
ck('team-attribution caveat carried', /current-season board|changed clubs/.test(CH.teamAttributionNote));

// League rate is a real number, sums are consistent.
const sumKC = CH.rows.reduce((a, r) => a + r.kc, 0);
ck('per-owner KC sums to league KC', sumKC === CH.leagueKC, `${sumKC} vs ${CH.leagueKC}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
