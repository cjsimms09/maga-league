// The money system. Every dollar event in the league is one ledger entry with
// a signed amount from the OWNER's point of view:
//   negative = the owner owes the league (buy-in charge)
//   positive = the league owes the owner (weekly win, award, credit)
// An entry counts toward the owner's live balance until the commissioner
// settles it (money actually changed hands). Settled entries stay forever as
// the running tally. Balances therefore carry across seasons automatically —
// built for multi-year tabs like the Germany situation.
const { getDoc, setDoc, newId, now } = require('./data');

const TYPE_LABELS = {
  buy_in: 'Buy-in',
  weekly: 'Weekly High Point',
  award: 'Season Award',
  adjustment: 'Adjustment',
  payment: 'Payment',
  // A balance walked forward from a previous season. It is its own type because
  // it is the one entry that is neither earned this year nor paid this year —
  // filed as an adjustment it made the chart say "the league owes David $375"
  // next to a Won column of nothing, with no way to tell which year it came from.
  carryover: 'Carried Over',
};

async function allEntries() {
  return getDoc('ledger', []);
}

async function addEntry({ owner_id, year, type, amount, desc, week = null, category = null, settled = false }) {
  const ledger = await allEntries();
  const entry = {
    id: newId(), owner_id: Number(owner_id), year: Number(year), type,
    amount: Number(amount), desc, week, category,
    settled: !!settled, created_at: now(), settled_at: settled ? now() : null,
    audit: [{ at: now(), what: `Created${settled ? ' (already settled)' : ''}` }],
  };
  ledger.push(entry);
  await setDoc('ledger', ledger);
  return entry;
}

async function updateEntry(id, patch, auditNote) {
  const ledger = await allEntries();
  const e = ledger.find(x => x.id === id);
  if (!e) return null;
  Object.assign(e, patch);
  if (auditNote) {
    e.audit = [...(e.audit || []), { at: now(), what: auditNote }].slice(-20);
  }
  await setDoc('ledger', ledger);
  return e;
}

async function removeEntry(id) {
  const ledger = await allEntries();
  await setDoc('ledger', ledger.filter(x => x.id !== id));
}

async function setSettled(id, settled, note, by) {
  const cleanNote = settled ? String(note || '').trim().slice(0, 120) : '';
  return updateEntry(id, {
    settled: !!settled, settled_at: settled ? now() : null,
    settle_note: cleanNote,
  }, `${settled ? 'Settled' : 'Re-opened (undo)'}${cleanNote ? ` — ${cleanNote}` : ''}${by ? ` by ${by}` : ''}`);
}

// Settle every open entry for one owner in one shot ("we squared up").
async function settleAll(owner_id) {
  const ledger = await allEntries();
  const t = now();
  let n = 0;
  for (const e of ledger) {
    if (e.owner_id === Number(owner_id) && !e.settled) {
      e.settled = true; e.settled_at = t;
      e.audit = [...(e.audit || []), { at: t, what: 'Settled in a square-up' }].slice(-20);
      n++;
    }
  }
  await setDoc('ledger', ledger);
  return n;
}

// Live balance per owner: sum of unsettled entries.
function balances(ledger, owners) {
  const map = {};
  for (const o of owners) map[o.id] = { owner: o, balance: 0, open: [], settledCount: 0 };
  for (const e of ledger) {
    const b = map[e.owner_id];
    if (!b) continue;
    if (e.settled) b.settledCount++;
    else { b.balance += e.amount; b.open.push(e); }
  }
  for (const b of Object.values(map)) b.balance = Math.round(b.balance * 100) / 100;
  return map;
}

/**
 * What a ledger entry IS, as opposed to which way its sign points.
 *
 * The sign says which direction the money moves; it does not say why. Those are
 * different questions and conflating them is how "Richard paid his buy-in"
 * ended up in the winnings column: recording a payment received creates a
 * POSITIVE entry (it cancels the negative buy-in charge), and any filter that
 * reads `amount > 0` as "won" counts it as prize money.
 *
 * So: classify by type, never by sign. These predicates are the one definition,
 * used by every view that summarises a season.
 */
const isPrize = e => e.type === 'weekly' || e.type === 'award';
const isPayment = e => e.type === 'payment';
const isCarryover = e => e.type === 'carryover';

/**
 * One owner's season, summarised for the standings chart.
 *
 *   won      prize money earned — weekly highs and season awards, nothing else.
 *            Whether it has been PAID is the balance's job, not this column's.
 *   paid_in  money that actually came from them: payments they made, plus any
 *            charge the commissioner ticked off (ticking a charge means "this
 *            one is square"). A payment the league made TO them is neither.
 *   paid_out cash the league has handed over.
 */
function seasonSummary(entries, year) {
  const yr = entries.filter(e => Number(e.year) === Number(year));
  const sum = (list, f = e => Math.abs(e.amount)) => Math.round(list.reduce((s, e) => s + f(e), 0) * 100) / 100;
  const buy_in = yr.find(e => e.type === 'buy_in') || null;
  // Carryover is signed, unlike the other columns: it can point either way and
  // which way it points is the whole information. Positive = the league came
  // into this season owing them.
  const carried = yr.filter(isCarryover);
  const carried_over = Math.round(carried.reduce((s, e) => s + e.amount, 0) * 100) / 100;
  const paid_in = sum(yr.filter(e =>
    (isPayment(e) && e.amount > 0) ||
    (!isPayment(e) && !isCarryover(e) && e.amount < 0 && e.settled)));
  return {
    entries: yr,
    buy_in,
    // Has the buy-in actually been covered? Two ways to record it and both
    // count: ticking the charge itself, or recording a payment that covers it.
    // Deriving the badge from `buy_in.settled` alone left the chart saying
    // "Owes" next to a balance of zero, which is the site contradicting itself
    // about the one number it exists to keep unambiguous.
    buy_in_paid: !!buy_in && (buy_in.settled || paid_in >= Math.abs(buy_in.amount)),
    won: sum(yr.filter(isPrize)),
    paid_in,
    paid_out: sum(yr.filter(e =>
      (isPayment(e) && e.amount < 0) ||
      (isPrize(e) && e.settled))),
    carried_over,
    // Still outstanding from before — a carryover that nobody has squared yet.
    carried_open: Math.round(carried.filter(e => !e.settled)
      .reduce((s, e) => s + e.amount, 0) * 100) / 100,
    carried_entries: carried,
  };
}

// Winnings actually won in ledger years (weekly + awards; adjustments are
// bookkeeping, not winnings) — added to the legacy grid for career totals.
function ledgerWinningsByOwnerYear(ledger) {
  const grid = {};
  for (const e of ledger) {
    if (e.type !== 'weekly' && e.type !== 'award') continue;
    (grid[e.owner_id] ??= {})[e.year] = (grid[e.owner_id][e.year] || 0) + e.amount;
  }
  return grid;
}

function weeklyForYear(ledger, year) {
  return ledger.filter(e => e.type === 'weekly' && e.year === Number(year))
    .sort((a, b) => (a.week || 0) - (b.week || 0));
}

function awardsForYear(ledger, year) {
  const order = ['reg_1', 'reg_2', 'playoff_1', 'playoff_2', 'playoff_3', 'playoff_4'];
  return ledger.filter(e => e.type === 'award' && e.year === Number(year))
    .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
}

module.exports = {
  TYPE_LABELS, allEntries, addEntry, updateEntry, removeEntry, setSettled, settleAll,
  balances, ledgerWinningsByOwnerYear, weeklyForYear, awardsForYear,
  isPrize, isPayment, isCarryover, seasonSummary,
};
