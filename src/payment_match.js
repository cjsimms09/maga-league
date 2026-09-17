// A PAYMENT SETTLES A DEBT. IT DOES NOT CREATE ONE.
//
// Cory, 2026-09-17, looking at Richard's row reading "owes you $100" the day
// after he paid Richard $100:
//
//   "I put in ledger that I paid Richard $100 for week 1 high point, now it
//    says he owes me money... When I input my payment it should just match to
//    that... I should be able to document that I sent it just so i know who I
//    still owe money to."
//
// WHAT ACTUALLY HAPPENED. Both payment paths (`POST /admin/ledger` with
// kind=payment_sent, and `POST /admin/payment` with direction=i_paid) did one
// thing: append a standalone `payment` entry for -100. The balance is the sum
// of UNSETTLED entries, so:
//
//   * If the $100 weekly-high prize exists, you get TWO open entries, +100 and
//     -100, netting to "even" — the right number by accident, with the prize
//     still flagged as unpaid forever and no link between the two.
//   * If the prize does NOT exist, the -100 stands alone and the site reports
//     that RICHARD OWES CORY $100. Money paid out is recorded as money owed in.
//
// The second is what Cory saw, because the prize genuinely did not exist: the
// weekly-high automation shipped 2026-09-17 04:06 UTC, two days after the
// Tuesday it fires on, so it had never run once and week 1 was unattributed.
//
// The deeper fault is that a payment was modelled as an independent event.
// It is not. A payment is the SETTLEMENT of something already on the books, and
// the ledger has always had a way to say so — `settled: true` with a note. The
// form just never used it. So this module decides, with no I/O:
//
//   1. which open entries a payment pays off (oldest first), to be SETTLED with
//      the note, so the register says "this prize was paid, here is how";
//   2. what is left over, if anything, which is a real standalone payment
//      (an advance, or money for something not yet on the books);
//   3. whether the payment matched NOTHING, which is a warning and not a
//      silent new debt — that is the exact hole Cory fell through.
//
// It also handles the out-of-order case, which is the one that will actually
// happen from now on: Cory pays the winner on Tuesday morning before the cron
// records the prize. `matchPrizeToOpenPayment` lets the incoming prize find the
// payment that was already made and settle the pair.
//
// SIGN CONVENTION (from ledger.js, unchanged): an entry's amount is signed from
// the OWNER's point of view. Positive = the league owes the owner (a weekly
// high, an award, a carried-over credit). Negative = the owner owes the league
// (a buy-in, a fee).

'use strict';

/** Entries that a payment can settle: real obligations, not other payments.
 *  A payment settling a payment is bookkeeping eating its own tail. */
const isObligation = e => e && !e.settled && e.type !== 'payment';

/** Oldest first — a payment pays down the longest-standing debt, which is both
 *  what people mean and what makes "who have I owed the longest" answerable. */
const byOldest = (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''));

const r2 = n => Math.round(n * 100) / 100;

/**
 * Decide what recording a payment should DO.
 *
 * @param {object[]} entries   the whole ledger (any owner, any year)
 * @param {number}   owner_id  who the payment is with
 * @param {number}   amount    always positive; `direction` carries the sign
 * @param {'out'|'in'} direction  'out' = I paid them, 'in' = they paid me
 * @param {string}   note      how it moved (Venmo, cash…) — lands on the settle
 * @param {number}   year      season to file any remainder entry under
 *
 * @returns {{settle: object[], entry: object|null, warnings: string[],
 *            matchedTotal: number, remainder: number}}
 *   settle   entries to mark settled, each with the note to write
 *   entry    a standalone payment entry to append, or null if fully matched
 *   warnings human-readable, surfaced in the UI — never swallowed
 */
function applyPayment({ entries, owner_id, amount, direction, note = '', year }) {
  const out = direction === 'out';
  const amt = r2(Math.abs(Number(amount) || 0));
  const warnings = [];
  if (!amt) return { settle: [], entry: null, warnings: ['Amount was zero — nothing recorded.'], matchedTotal: 0, remainder: 0 };

  // Paying money OUT settles what the league owes them (positive entries).
  // Taking money IN settles what they owe the league (negative entries).
  const want = out ? 1 : -1;
  const open = (entries || [])
    .filter(e => Number(e.owner_id) === Number(owner_id) && isObligation(e)
                 && Math.sign(Number(e.amount)) === want)
    .sort(byOldest);

  const settle = [];
  let remaining = amt;
  for (const e of open) {
    const owed = Math.abs(Number(e.amount));
    // Only settle what the payment fully covers. A half-paid prize cannot be
    // "settled" without lying about it, so the shortfall stays open and the
    // leftover cash is banked below — the balance still comes out right.
    if (remaining + 1e-9 < owed) break;
    settle.push({
      id: e.id,
      note: [note, `applied to ${describe(e)}`].filter(Boolean).join(' — ').slice(0, 120),
      amount: owed, entry: e,
    });
    remaining = r2(remaining - owed);
    if (remaining <= 0) break;
  }

  const matchedTotal = r2(amt - remaining);

  if (!settle.length) {
    warnings.push(out
      ? `Nothing on the books says you owe them anything right now, so this is recorded as a standalone payment. `
        + `If this was a weekly high point that has not been attributed yet, the Tuesday job will add it and the two will cancel out.`
      : `They have no open charges, so this is recorded as a standalone payment (a credit on their tab).`);
  } else if (remaining > 0) {
    warnings.push(`$${matchedTotal.toFixed(2)} was applied to ${settle.length} open item${settle.length === 1 ? '' : 's'}; `
      + `the remaining $${remaining.toFixed(2)} is banked as a standalone payment.`);
  }

  const entry = remaining > 0 ? {
    owner_id: Number(owner_id), year: Number(year),
    type: 'payment', amount: out ? -remaining : remaining,
    desc: (out ? 'Payment sent' : 'Payment received') + (note ? ` — ${note}` : ''),
  } : null;

  return { settle, entry, warnings, matchedTotal, remainder: remaining };
}

function describe(e) {
  if (e.type === 'weekly') return `Week ${e.week} high point`;
  if (e.type === 'award') return e.desc || e.category || 'season award';
  if (e.type === 'carryover') return 'carried-over balance';
  if (e.type === 'buy_in') return 'buy-in';
  return e.desc || e.type;
}

/**
 * THE OUT-OF-ORDER CASE, which is now the normal one.
 *
 * Cory pays the weekly-high winner when he sees who won. The cron records the
 * prize the next morning. Without this, his early payment sits as a standalone
 * -100 and the owner's row says they owe him $100 until the prize lands — which
 * is precisely the sequence that produced the complaint.
 *
 * So when a prize is recorded, look for an open standalone payment that was
 * plainly made for it and settle the pair.
 *
 * ⚠️ DELIBERATELY CONSERVATIVE — it matches on an EXACT amount only. A $100
 * payment against a $100 prize is unambiguous; a $250 payment against a $100
 * prize is a guess about intent, and a wrong guess silently consumes money that
 * was meant for something else. When in doubt this returns null and both
 * entries stay open and visible, which is a state a human can see and fix. The
 * match is written into both audit trails and is undoable by un-settling.
 */
function matchPrizeToOpenPayment({ entries, prize }) {
  const amt = Math.abs(Number(prize.amount) || 0);
  if (!amt) return null;
  const want = -Math.sign(Number(prize.amount));   // a prize (+) pairs with a payment (-)
  const cand = (entries || []).filter(e =>
    Number(e.owner_id) === Number(prize.owner_id)
    && e.type === 'payment' && !e.settled
    && Math.sign(Number(e.amount)) === want
    && Math.abs(Math.abs(Number(e.amount)) - amt) < 0.005).sort(byOldest);
  return cand.length ? cand[0] : null;
}

/**
 * WHO DO I STILL OWE — Cory's third ask, and the reason settling beats
 * appending an opposite entry. Once a payment SETTLES the prize, this list is
 * simply "open entries the league owes", which is answerable. With two
 * cancelling open entries it never could be: the balance says even while both
 * rows still read unpaid.
 */
function outstandingPayouts(entries, owners) {
  const nameOf = id => ((owners || []).find(o => Number(o.id) === Number(id)) || {}).name || `#${id}`;
  const rows = {};
  for (const e of entries || []) {
    if (!isObligation(e) || Number(e.amount) <= 0) continue;
    const r = (rows[e.owner_id] ??= { owner_id: e.owner_id, name: nameOf(e.owner_id), total: 0, items: [] });
    r.total = r2(r.total + Number(e.amount));
    r.items.push({ id: e.id, amount: Number(e.amount), what: describe(e), year: e.year,
                   week: e.week ?? null, created_at: e.created_at || '' });
  }
  return Object.values(rows)
    .map(r => ({ ...r, items: r.items.sort(byOldest) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

module.exports = { applyPayment, matchPrizeToOpenPayment, outstandingPayouts, isObligation, describe };
