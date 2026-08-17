// Document layout on top of the KV store. Docs are grouped by who writes them
// so concurrent writers never share a key:
//   config                — commissioner + one-time secret
//   owners                — array of owners (rare writes)
//   seasons               — {year: season} (commissioner only)
//   ledger                — array of money entries (commissioner only)
//   alerts                — array (commissioner only)
//   history               — legacy 2016-2025 records (seeded, commissioner edits rare)
//   draft:<year>          — pick order + chosen slots (turn-based single writer)
//   keepers:<year>:<oid>  — one doc per owner (owner writes their own)
//   vote:<id>             — vote metadata (created by proposer)
//   ballot:<voteId>:<oid> — one doc per owner per vote (owner writes their own)
//   sleeper-cache         — cached Sleeper API bundle (racy writes are harmless)
const crypto = require('crypto');
const store = require('./store');
const seed = require('./seed-data');
const { hashPassword } = require('./auth');

const newId = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const now = () => new Date().toISOString();

async function getDoc(key, fallback) {
  const v = await store.get(key);
  return v == null ? fallback : v;
}
const setDoc = store.set;

// Atomic read-modify-write on one doc (audit finding 1, 2026-08-16). The
// whole read→fn→write is serialized per key by store.mutate — two racing
// writers can no longer eat each other's update within this instance (see
// src/store.js's concurrency header for the honest multi-instance limits).
// fn gets the current doc (or `fallback` when missing) and returns the next
// doc, or undefined for a deliberate no-write. Resolves to the doc that is
// now current. EVERY writer of a shared multi-writer doc (ledger, owners,
// config, alerts) goes through this, never through a bare getDoc+setDoc.
async function mutateDoc(key, fallback, fn) {
  return store.mutate(key, cur => fn(cur == null ? fallback : cur));
}

// ---------------------------------------------------------------- seeding
let seededThisBoot = false;

// Initialization is IDEMPOTENT AND LOCKED (audit finding 5, 2026-08-16).
// It used to check `config`, write a dozen docs, and write `config` LAST —
// so two concurrent cold-start requests both saw no config and both seeded,
// minting every vote doc twice. The whole seed now runs inside store.mutate
// on a `seed-lock` doc: the second caller waits on the lock, re-checks
// `config` and finds the first one's work. (Same in-process scope as every
// mutate — two simultaneous cold INSTANCES could still race; see store.js.)
async function ensureSeeded() {
  if (seededThisBoot) return;
  await store.mutate('seed-lock', async () => {
    if (seededThisBoot) return undefined;
    const config = await store.get('config');
    if (config) { seededThisBoot = true; return undefined; }
    await seedEverything();
    seededThisBoot = true;
    return { seeded_at: now() };
  });
}

async function seedEverything() {
  const defaultHash = hashPassword(process.env.DEFAULT_PASSWORD || 'imabitch');
  const owners = seed.OWNERS.map((o, i) => ({
    id: i + 1, name: o.name, username: o.username, password_hash: defaultHash,
    must_change_password: true, is_commissioner: !!o.commissioner, active: true, email: '',
    wins: o.wins, losses: o.losses, ties: o.ties,
  }));
  const byName = {}; owners.forEach(o => byName[o.name] = o.id);

  const seasons = {};
  for (const s of seed.SEASONS) {
    seasons[s.year] = {
      year: s.year, buy_in: s.buy_in, total_pot: s.total_pot, weeks: s.weeks,
      weekly_payout: s.weekly_payout, payouts: s.payouts, status: s.status,
      draft_open: false, keepers_locked: false,
      standings: (seed.STANDINGS[s.year] || []).map(n => byName[n]),
    };
  }

  // Legacy record book (pre-ledger years — money already paid out).
  const history = {
    winnings: {},   // owner_id -> {year: amount}
    awards: {},     // year -> [{category, owner_id, amount, note}]
    weekly: {},     // year -> [owner_id per week]
  };
  for (const [name, years] of Object.entries(seed.LEGACY_WINNINGS)) history.winnings[byName[name]] = years;
  for (const [year, rows] of Object.entries(seed.AWARDS)) {
    history.awards[year] = rows.map(([category, name, amount, note]) => ({ category, owner_id: byName[name], amount, note: note || '' }));
  }
  for (const [year, names] of Object.entries(seed.WEEKLY_WINNERS)) history.weekly[year] = names.map(n => byName[n]);

  // Live money ledger opens with the 2026 season. Signed amounts are from the
  // owner's point of view: negative = owes the league, positive = league owes them.
  const ledger = [];
  const Y = 2026;
  for (const o of owners) {
    const paid = seed.PAYMENTS_2026[o.name] || { paid: 0, note: '' };
    ledger.push({
      id: newId(), owner_id: o.id, year: Y, type: 'buy_in', amount: -seasons[Y].buy_in,
      desc: `${Y} buy-in`, settled: paid.paid >= seasons[Y].buy_in, created_at: now(),
      settled_at: paid.paid >= seasons[Y].buy_in ? now() : null,
    });
    if (o.name === 'David') {
      ledger.push({
        id: newId(), owner_id: o.id, year: Y, type: 'adjustment', amount: 375,
        desc: '2025 winnings credit carried on the books', settled: false, created_at: now(), settled_at: null,
      });
    }
  }

  for (const [year, { order, open }] of Object.entries(seed.DRAFTS)) {
    await setDoc(`draft:${year}`, {
      order: order.map(([name, slot], i) => ({ pos: i + 1, owner_id: byName[name], slot: slot ?? null })),
    });
    if (open && seasons[year]) seasons[year].draft_open = true;
  }

  for (const v of seed.VOTES) {
    const id = newId();
    await setDoc(`vote:${id}`, {
      id, question: v.question, description: v.description, proposer_id: byName['Cory'],
      status: 'open', created_at: now(), closed_at: null,
    });
  }

  await setDoc('owners', owners);
  await setDoc('seasons', seasons);
  await setDoc('history', history);
  await setDoc('ledger', ledger);
  await setDoc('alerts', [{
    id: newId(), message: 'DRAFT DAY IS SET: 08/22/26 at 5:00 PM. Be there.',
    level: 'urgent', active: true, created_at: now(),
  }, {
    id: newId(), message: 'Welcome to the new league site! Check The Tab to see where your money stands.',
    level: 'info', active: true, created_at: now(),
  }]);
  await setDoc('config', {
    secret: crypto.randomBytes(32).toString('hex'),
    sleeper_league_id: seed.SLEEPER_LEAGUE_ID || '', sleeper_map: {},
    seeded_at: now(),
  });
  console.log('League data seeded (2016-2026 history + 2026 ledger).');
}

module.exports = { store, getDoc, setDoc, mutateDoc, ensureSeeded, newId, now };
