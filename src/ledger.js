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
  };
  ledger.push(entry);
  await setDoc('ledger', ledger);
  return entry;
}

async function updateEntry(id, patch) {
  const ledger = await allEntries();
  const e = ledger.find(x => x.id === id);
  if (!e) return null;
  Object.assign(e, patch);
  await setDoc('ledger', ledger);
  return e;
}

async function removeEntry(id) {
  const ledger = await allEntries();
  await setDoc('ledger', ledger.filter(x => x.id !== id));
}

async function setSettled(id, settled, note) {
  return updateEntry(id, {
    settled: !!settled, settled_at: settled ? now() : null,
    settle_note: settled ? String(note || '').trim().slice(0, 120) : '',
  });
}

// Settle every open entry for one owner in one shot ("we squared up").
async function settleAll(owner_id) {
  const ledger = await allEntries();
  const t = now();
  let n = 0;
  for (const e of ledger) {
    if (e.owner_id === Number(owner_id) && !e.settled) { e.settled = true; e.settled_at = t; n++; }
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
};
