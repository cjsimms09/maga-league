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

  // ── HUB MODE — league money routes through the commissioner (the bank) ──────
  // Cory (id 1) is the bank. Nobody pays anybody but Cory (never Michael→David).
  const hub = settlementReport(nets, venmoOf, 1);
  ck('hub: EVERY transfer touches the bank (id 1) — no peer-to-peer', hub.transfers.every(t => t.from_id === 1 || t.to_id === 1));
  ck('hub: the bank never pays itself', hub.transfers.every(t => t.from_id !== t.to_id));
  ck('hub: each debtor pays the bank their debt', (() => {
    const paidToBank = {}; hub.transfers.filter(t => t.to_id === 1).forEach(t => { paidToBank[t.from_id] = t.amount; });
    return paidToBank[3] === 150 && paidToBank[4] === 150 && paidToBank[5] === 100;
  })(), JSON.stringify(hub.transfers));
  ck('hub: the bank pays each creditor (Marian +100 comes FROM the bank)', (() => {
    const fromBank = {}; hub.transfers.filter(t => t.from_id === 1).forEach(t => { fromBank[t.to_id] = t.amount; });
    return fromBank[2] === 100;   // Cory (id 1) is also a creditor here but is the hub, absorbed
  })(), JSON.stringify(hub.transfers));
  ck('hub: reports the hub id + name', hub.hub === 1 && hub.hubName === 'Cory');
  ck('hub: debtor→bank Venmo is the BANK\'s handle (you pay Cory)', hub.transfers.filter(t => t.to_id === 1).every(t => t.venmo && /cory-v/.test(t.venmo.url)));
  ck('hub: bank→creditor Venmo is the CREDITOR\'s handle', hub.transfers.filter(t => t.from_id === 1).every(t => t.to_id === 2 ? t.venmo === null : true));

  // ── SETTLEMENT ARITHMETIC: every non-bank owner must settle to EXACTLY their
  // net, and the bank's residual must equal the imbalance (the pot it holds).
  // This is the check that would catch a routing bug that still "looks balanced".
  {
    const nets2 = [
      { owner_id: 1, name: 'Cory', net: 0 },      // the bank, square itself
      { owner_id: 2, name: 'A', net: -400 },
      { owner_id: 3, name: 'B', net: -400 },
      { owner_id: 4, name: 'C', net: 150 },
    ];
    const h = settlementReport(nets2, () => null, 1);
    const inflow = {}, outflow = {};
    h.transfers.forEach(t => {
      outflow[t.from_id] = (outflow[t.from_id] || 0) + t.amount;
      inflow[t.to_id] = (inflow[t.to_id] || 0) + t.amount;
    });
    const worst = Math.max(...nets2.filter(n => n.owner_id !== 1).map(n =>
      Math.abs(((inflow[n.owner_id] || 0) - (outflow[n.owner_id] || 0)) - n.net)));
    ck('every non-bank owner settles to EXACTLY their net', worst < 0.005, worst);
    const bankResidual = (inflow[1] || 0) - (outflow[1] || 0);
    ck('the bank\'s residual equals the imbalance it is holding (the pot)',
      Math.abs(bankResidual + h.imbalance) < 0.005, `${bankResidual} vs imbalance ${h.imbalance}`);
    ck('a pot being held is reported as a NEGATIVE imbalance, not a positive one',
      h.imbalance < 0, h.imbalance);
  }

  // Hub who is a pure debtor (bank owes nothing to itself, still collects).
  const hub2 = settlementReport(
    [{ owner_id: 9, name: 'Cory', net: -50 }, { owner_id: 2, name: 'A', net: 30 }, { owner_id: 3, name: 'B', net: 20 }],
    () => null, 9);
  ck('hub can itself be a debtor and is still absorbed (never a counterparty to itself)', hub2.transfers.every(t => !(t.from_id === 9 && t.to_id === 9)) && hub2.transfers.some(t => t.from_id === 9));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
