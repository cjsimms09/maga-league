'use strict';
// SETTLEMENT REPORT — minimal who-pays-whom from net positions.
const path = require('path');
const { settlementReport } = require(path.join(__dirname, '..', '..', 'src', 'routes', 'settlement'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

(function () {
  const venmoOf = id => ({ 1: { handle: 'cory-v', url: 'https://venmo.com/u/cory-v' } }[id] || null);

  // balanced season: two winners (+300,+100), three losers (−150,−150,−100)
  const nets = [
    { owner_id: 1, name: 'Cory', net: 300 },
    { owner_id: 2, name: 'Marian', net: 100 },
    { owner_id: 3, name: 'David', net: -150 },
    { owner_id: 4, name: 'Bates', net: -150 },
    { owner_id: 5, name: 'Sam', net: -100 },
  ];
  const r = settlementReport(nets, venmoOf);
  ck('books balance', r.balanced && r.imbalance === 0, r.imbalance);
  ck('total moved = total owed ($400)', r.total === 400, r.total);
  ck('every transfer is debtor→creditor', r.transfers.every(t => nets.find(n => n.owner_id === t.from_id).net < 0 && nets.find(n => n.owner_id === t.to_id).net > 0));
  ck('transfers clear every creditor', (() => {
    const got = {}; r.transfers.forEach(t => { got[t.to_id] = (got[t.to_id] || 0) + t.amount; });
    return got[1] === 300 && got[2] === 100;
  })(), JSON.stringify(r.transfers));
  ck('transfers clear every debtor', (() => {
    const paid = {}; r.transfers.forEach(t => { paid[t.from_id] = (paid[t.from_id] || 0) + t.amount; });
    return paid[3] === 150 && paid[4] === 150 && paid[5] === 100;
  })());
  ck('payee Venmo attached when on file', r.transfers.some(t => t.to_id === 1 && t.venmo && /cory-v/.test(t.venmo.url)));
  ck('missing Venmo is null, not a crash', r.transfers.filter(t => t.to_id === 2).every(t => t.venmo === null));
  ck('minimal-ish transfer count (≤ debtors+creditors−1)', r.transfers.length <= 4, r.transfers.length);

  // rounding + tiny imbalance surfaced, not hidden
  const odd = settlementReport([{ owner_id: 1, name: 'A', net: 100 }, { owner_id: 2, name: 'B', net: -99.5 }]);
  ck('imbalance surfaced when books do not close', !odd.balanced && Math.abs(odd.imbalance - 0.5) < 0.001, odd.imbalance);

  // all-even season: no transfers
  const even = settlementReport([{ owner_id: 1, name: 'A', net: 0 }, { owner_id: 2, name: 'B', net: 0 }]);
  ck('all-even → no transfers, balanced', even.transfers.length === 0 && even.balanced);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
