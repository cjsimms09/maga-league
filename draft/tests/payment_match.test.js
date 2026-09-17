'use strict';
// A PAYMENT MUST NOT INVENT A DEBT.
//
// The first test below is Cory's exact sequence, 2026-09-17, replayed: pay
// Richard $100 for the week 1 high point before the prize has been recorded,
// and watch the site report that Richard owes Cory $100. It asserts the OLD
// behaviour is gone and the new behaviour is right.
//
// Run: node draft/tests/payment_match.test.js

const path = require('path');
const PM = require(path.join(__dirname, '..', '..', 'src', 'payment_match.js'));
const L = require(path.join(__dirname, '..', '..', 'src', 'ledger.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
                            : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : ''))); };

const OWNERS = [{ id: 8, name: 'Richard', active: true }, { id: 3, name: 'David', active: true }];
const mk = (o) => ({ id: o.id || 'e' + Math.random().toString(36).slice(2, 8),
  owner_id: 8, year: 2026, type: 'weekly', amount: 100, week: null, category: null,
  settled: false, created_at: '2026-09-15T11:00:00.000Z', ...o });

// ── the bug, exactly as it happened ─────────────────────────────────────────
// The ledger has Richard's buy-in (settled) and nothing else. The weekly-high
// cron shipped after its own Tuesday, so the $100 prize was never recorded.
const LEDGER_AS_IT_WAS = [
  mk({ id: 'buyin', type: 'buy_in', amount: -400, settled: true, desc: '2026 buy-in' }),
];

// What the site used to do: append a standalone -100 and nothing else.
const OLD = [...LEDGER_AS_IT_WAS, mk({ id: 'old', type: 'payment', amount: -100, desc: 'Payment sent' })];
const oldBal = L.balances(OLD, OWNERS)[8].balance;
ck('THE BUG REPRODUCES: the old behaviour really did make Richard owe $100',
   oldBal === -100, { balance: oldBal });

// What it does now.
const d = PM.applyPayment({ entries: LEDGER_AS_IT_WAS, owner_id: 8, amount: 100,
                            direction: 'out', note: 'Venmo', year: 2026 });
ck('paying someone who is owed nothing settles nothing…', d.settle.length === 0);
ck('  … and SAYS SO rather than silently booking a debt',
   d.warnings.length === 1 && /not been attributed/.test(d.warnings[0]), d.warnings);

// ── the out-of-order case: the prize lands after the payment ────────────────
const withPayment = [...LEDGER_AS_IT_WAS, d.entry ? { ...d.entry, id: 'pay1', settled: false, created_at: '2026-09-16T12:00:00.000Z' } : null].filter(Boolean);
ck('the standalone payment is still recorded (the money DID move)',
   withPayment.some(e => e.type === 'payment' && e.amount === -100));

const prize = mk({ id: 'prize', type: 'weekly', amount: 100, week: 1, created_at: '2026-09-22T11:00:00.000Z' });
const hit = PM.matchPrizeToOpenPayment({ entries: withPayment, prize });
ck('THE FIX: when the cron records the prize, it FINDS the payment already made',
   hit && hit.id === 'pay1', hit && hit.id);

// and once both are settled, Richard is square with nothing dangling
const settled = withPayment.map(e => (e.id === 'pay1' ? { ...e, settled: true } : e))
  .concat([{ ...prize, settled: true }]);
ck('  … both are settled, the balance is even, and NOTHING is left open',
   L.balances(settled, OWNERS)[8].balance === 0
   && settled.filter(e => !e.settled).length === 0,
   { balance: L.balances(settled, OWNERS)[8].balance });

// ── the normal case: the prize is already on the books ──────────────────────
const owed = [mk({ id: 'w1', type: 'weekly', amount: 100, week: 1 })];
const n = PM.applyPayment({ entries: owed, owner_id: 8, amount: 100, direction: 'out', note: 'Venmo', year: 2026 });
ck('paying a recorded prize SETTLES it instead of appending an opposite entry',
   n.settle.length === 1 && n.settle[0].id === 'w1' && n.entry === null, { settle: n.settle.map(s => s.id), entry: n.entry });
ck('  … and the note Cory typed is written onto the settlement',
   /Venmo/.test(n.settle[0].note) && /Week 1 high point/.test(n.settle[0].note), n.settle[0].note);
const after = owed.map(e => ({ ...e, settled: true }));
ck('  … leaving a balance of even and no open items',
   L.balances(after, OWNERS)[8].balance === 0 && after.every(e => e.settled));

// ── oldest first, and across multiple obligations ───────────────────────────
const many = [
  mk({ id: 'w1', week: 1, amount: 100, created_at: '2026-09-15T11:00:00Z' }),
  mk({ id: 'w2', week: 2, amount: 100, created_at: '2026-09-22T11:00:00Z' }),
  mk({ id: 'w3', week: 3, amount: 100, created_at: '2026-09-29T11:00:00Z' }),
];
const two = PM.applyPayment({ entries: many, owner_id: 8, amount: 200, direction: 'out', year: 2026 });
ck('a $200 payment clears the TWO OLDEST weeks, not an arbitrary pair',
   JSON.stringify(two.settle.map(s => s.id)) === JSON.stringify(['w1', 'w2']), two.settle.map(s => s.id));
ck('  … and banks no remainder', two.entry === null && two.remainder === 0);

// ── partial payment: never claim a prize is settled when it is not ──────────
const part = PM.applyPayment({ entries: many, owner_id: 8, amount: 150, direction: 'out', year: 2026 });
ck('a PARTIAL payment settles what it fully covers and no more',
   part.settle.length === 1 && part.settle[0].id === 'w1', part.settle.map(s => s.id));
ck('  … the leftover $50 is banked so the BALANCE is still right',
   part.entry && part.entry.amount === -50, part.entry);
const partLedger = many.map(e => (e.id === 'w1' ? { ...e, settled: true } : e))
  .concat([{ ...part.entry, id: 'rem', settled: false }]);
ck('  … balance after a $150 payment against $300 owed is $150',
   L.balances(partLedger, OWNERS)[8].balance === 150, L.balances(partLedger, OWNERS)[8].balance);
ck('  … and it says what it did rather than doing it quietly',
   part.warnings.some(w => /banked as a standalone payment/.test(w)), part.warnings);

// ── money coming IN is the same bug mirrored ────────────────────────────────
const charge = [mk({ id: 'b', type: 'buy_in', amount: -400, settled: false })];
const inn = PM.applyPayment({ entries: charge, owner_id: 8, amount: 400, direction: 'in', note: 'Zelle', year: 2026 });
ck('a payment RECEIVED settles the buy-in rather than adding a phantom credit',
   inn.settle.length === 1 && inn.settle[0].id === 'b' && inn.entry === null, inn);
ck('  … and a payment out never settles a charge (sign is respected)',
   PM.applyPayment({ entries: charge, owner_id: 8, amount: 400, direction: 'out', year: 2026 }).settle.length === 0);

// ── a payment must never settle another payment ─────────────────────────────
const pays = [mk({ id: 'p', type: 'payment', amount: 100 })];
ck('a payment cannot settle another payment (no eating its own tail)',
   PM.applyPayment({ entries: pays, owner_id: 8, amount: 100, direction: 'out', year: 2026 }).settle.length === 0);

// ── the conservative matcher ────────────────────────────────────────────────
const inexact = [mk({ id: 'p2', type: 'payment', amount: -250 })];
ck('an INEXACT payment is NOT consumed by a prize — a guess about intent is refused',
   PM.matchPrizeToOpenPayment({ entries: inexact, prize: mk({ amount: 100 }) }) === null);
ck('a SETTLED payment is never re-matched',
   PM.matchPrizeToOpenPayment({ entries: [mk({ id: 'p3', type: 'payment', amount: -100, settled: true })],
                                prize: mk({ amount: 100 }) }) === null);
ck('a payment to a DIFFERENT owner is never matched',
   PM.matchPrizeToOpenPayment({ entries: [mk({ id: 'p4', owner_id: 3, type: 'payment', amount: -100 })],
                                prize: mk({ owner_id: 8, amount: 100 }) }) === null);

// ── who do I still owe ──────────────────────────────────────────────────────
const book = [
  mk({ id: 'w1', owner_id: 8, week: 1, amount: 100 }),
  mk({ id: 'w2', owner_id: 8, week: 2, amount: 100, created_at: '2026-09-22T11:00:00Z' }),
  mk({ id: 'c', owner_id: 3, type: 'carryover', amount: 375, desc: '2025 winnings credit' }),
  mk({ id: 'paid', owner_id: 3, week: 4, amount: 100, settled: true }),
  mk({ id: 'buy', owner_id: 8, type: 'buy_in', amount: -400 }),
];
const owe = PM.outstandingPayouts(book, OWNERS);
ck('WHO I STILL OWE lists only unpaid money the league OWES',
   JSON.stringify(owe.map(r => [r.name, r.total])) === JSON.stringify([['David', 375], ['Richard', 200]]),
   owe.map(r => [r.name, r.total]));
ck('  … a settled prize is not still owed', !owe.some(r => r.items.some(i => i.id === 'paid')));
ck('  … a buy-in they owe the LEAGUE is not something the league owes them',
   !owe.some(r => r.items.some(i => i.id === 'buy')));
ck('  … each item says what it is, so the note can be meaningful',
   owe.find(r => r.name === 'Richard').items[0].what === 'Week 1 high point',
   owe.find(r => r.name === 'Richard').items[0].what);

// ── guards ──────────────────────────────────────────────────────────────────
ck('a zero payment records nothing and says why',
   PM.applyPayment({ entries: book, owner_id: 8, amount: 0, direction: 'out', year: 2026 }).warnings.length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
