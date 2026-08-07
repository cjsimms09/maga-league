/* The league books.
 *
 * The bug this suite exists to prevent: the standings chart classified money by
 * the SIGN of an entry rather than by what the entry was. Recording "Richard
 * paid his buy-in" creates a POSITIVE entry — it has to, because it cancels the
 * negative buy-in charge — and a column that reads `amount > 0` as "won" filed
 * a buy-in payment under prize money.
 *
 * Sign says which way the money moved. Type says why. They are different
 * questions, and every summary here answers the second one.
 */
const path = require('path');
const L = require(path.join(__dirname, '..', '..', 'src', 'ledger.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ', name); }
  else { fail++; console.log('FAIL ', name, extra != null ? '\n      ' + extra : ''); }
};
const eq = (name, a, b) => ok(name, a === b, `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);

const YEAR = 2026;
const e = (type, amount, extra = {}) =>
  ({ id: Math.random().toString(36).slice(2), owner_id: 9, year: YEAR, type,
     amount, settled: false, desc: type, ...extra });

console.log('\n--- the reported bug: a buy-in payment is not a win ---');
{
  // Richard is charged the buy-in, then the commissioner records that he paid.
  const entries = [
    e('buy_in', -400),
    e('payment', 400, { desc: 'Buy-in — Venmo' }),
  ];
  const s = L.seasonSummary(entries, YEAR);
  eq('he has won nothing', s.won, 0);
  eq('and paid in the full buy-in', s.paid_in, 400);

  // The balance is what actually decides whether he is square.
  const bal = L.balances(entries, [{ id: 9 }]);
  eq('so he is square', bal[9].balance, 0);
}

console.log('\n--- the other way of recording the same thing ---');
{
  // Some commissioners just tick the buy-in row instead of adding a payment.
  const entries = [e('buy_in', -400, { settled: true })];
  const s = L.seasonSummary(entries, YEAR);
  eq('ticking the charge counts as paid in', s.paid_in, 400);
  eq('and still is not a win', s.won, 0);
  eq('a settled entry drops out of the live balance', L.balances(entries, [{ id: 9 }])[9].balance, 0);
}

console.log('\n--- money the league pays OUT is not money paid in ---');
{
  // "I paid them" is a negative entry. Under the old sign-based rule, once
  // settled it counted as money the owner had paid IN — exactly backwards.
  const entries = [
    e('weekly', 100, { week: 3 }),
    e('payment', -100, { desc: 'Paid out week 3', settled: true }),
  ];
  const s = L.seasonSummary(entries, YEAR);
  eq('nothing was paid in', s.paid_in, 0);
  eq('the prize still counts as won', s.won, 100);
  eq('and it shows as paid out', s.paid_out, 100);
}

console.log('\n--- what "won" means ---');
{
  const entries = [
    e('weekly', 100, { week: 1 }),
    e('weekly', 100, { week: 7 }),
    e('award', 250, { category: 'playoff_2' }),
    e('adjustment', 50, { desc: 'Credit — bought the plaque' }),
    e('payment', 400, { desc: 'buy-in' }),
    e('buy_in', -400),
  ];
  const s = L.seasonSummary(entries, YEAR);
  eq('weekly highs and awards only', s.won, 450);
  ok('a credit is bookkeeping, not a win', s.won === 450);
  ok('and neither is a payment', s.won === 450);
}

console.log('\n--- a prize not yet handed over ---');
{
  const entries = [e('weekly', 100, { week: 4 })];   // won, unpaid
  const s = L.seasonSummary(entries, YEAR);
  eq('it counts as won the moment it is earned', s.won, 100);
  eq('but not as paid out until it is settled', s.paid_out, 0);
  eq('and the league owes him for it', L.balances(entries, [{ id: 9 }])[9].balance, 100);
}

console.log('\n--- seasons do not bleed into each other ---');
{
  const entries = [
    e('buy_in', -400, { year: 2025, settled: true }),
    e('weekly', 100, { year: 2025 }),
    e('buy_in', -400, { year: 2026, settled: true }),
  ];
  const s = L.seasonSummary(entries, 2026);
  eq('only this season is summarised', s.paid_in, 400);
  eq('last season\'s winnings stay there', s.won, 0);
  ok('and the buy-in found is the right year\'s', s.buy_in && s.buy_in.year === 2026);
}

console.log('\n--- a charge that is not a buy-in ---');
{
  const entries = [
    e('adjustment', -25, { desc: 'Late lineup fine', settled: true }),
    e('adjustment', -25, { desc: 'Second fine' }),          // still open
  ];
  const s = L.seasonSummary(entries, YEAR);
  eq('only the settled fine counts as paid', s.paid_in, 25);
  eq('the open one is still owed', L.balances(entries, [{ id: 9 }])[9].balance, -25);
  ok('and no buy-in exists to badge', s.buy_in === null);
}

console.log('\n--- the buy-in badge agrees with the balance ---');
{
  // Recording a payment leaves the charge row open; the badge must still say
  // Paid, or the chart contradicts the balance sitting next to it.
  const entries = [e('buy_in', -400), e('payment', 400, { desc: 'Venmo' })];
  const s = L.seasonSummary(entries, YEAR);
  ok('a covered buy-in reads as paid even with the charge row open', s.buy_in_paid, JSON.stringify(s));
  eq('and the balance agrees', L.balances(entries, [{ id: 9 }])[9].balance, 0);
}
{
  const entries = [e('buy_in', -400, { settled: true })];
  ok('ticking the charge also reads as paid', L.seasonSummary(entries, YEAR).buy_in_paid);
}
{
  const entries = [e('buy_in', -400), e('payment', 200, { desc: 'half now' })];
  const s = L.seasonSummary(entries, YEAR);
  ok('a part payment does NOT read as paid', !s.buy_in_paid, JSON.stringify(s));
  eq('and he still owes the rest', L.balances(entries, [{ id: 9 }])[9].balance, -200);
}
{
  const entries = [e('weekly', 100)];
  ok('no buy-in on file is not "paid"', !L.seasonSummary(entries, YEAR).buy_in_paid);
}

console.log('\n--- carried-over balances get their own column ---');
{
  // David: last season's winnings walked forward, plus this season's buy-in.
  const entries = [
    e('buy_in', -400, { settled: true }),
    e('carryover', 375, { desc: '2025 winnings credit carried on the books' }),
  ];
  const s = L.seasonSummary(entries, YEAR);
  eq('it is not a win this season', s.won, 0);
  eq('and it is not money he paid in', s.paid_in, 400);
  eq('it shows as carried over, signed in his favour', s.carried_over, 375);
  eq('and it is still open', s.carried_open, 375);
  eq('the balance still counts it', L.balances(entries, [{ id: 9 }])[9].balance, 375);
}
{
  // The other direction: somebody who ended last season owing.
  const entries = [e('carryover', -120, { desc: '2025 unpaid balance' })];
  const s = L.seasonSummary(entries, YEAR);
  eq('a debit carries over negative', s.carried_over, -120);
  eq('and is not counted as money paid in', s.paid_in, 0);
}
{
  // Settled carryover: it happened, it is square, it still belongs in the column.
  const entries = [e('carryover', 375, { settled: true, desc: '2025 winnings' })];
  const s = L.seasonSummary(entries, YEAR);
  eq('a settled carryover still shows in the column', s.carried_over, 375);
  eq('but nothing is outstanding', s.carried_open, 0);
  eq('and it never counts as money paid in', s.paid_in, 0);
  eq('nor does it move the live balance', L.balances(entries, [{ id: 9 }])[9].balance, 0);
}
{
  const entries = [e('weekly', 100), e('buy_in', -400, { settled: true })];
  const s = L.seasonSummary(entries, YEAR);
  eq('somebody with no carryover reads as zero, not undefined', s.carried_over, 0);
  ok('and the entry list is empty rather than missing', Array.isArray(s.carried_entries) && !s.carried_entries.length);
}
{
  // Carryover must stay out of the all-time winnings grid.
  const grid = L.ledgerWinningsByOwnerYear([
    e('carryover', 375), e('weekly', 100), e('award', 250),
  ]);
  eq('the winnings grid counts prizes only', grid[9][YEAR], 350);
}

console.log(`\n${pass}/${pass + fail} ledger checks passed`);
if (fail) process.exit(1);
