const { store, getDoc, setDoc, ensureSeeded } = require('./data');
const ledgerLib = require('./ledger');
const seedData = require('./seed-data');

const CATEGORY_LABELS = {
  reg_1: 'Regular Season Champ (1st)',
  reg_2: 'Regular Season Runner-up (2nd)',
  playoff_1: 'League Champion (Playoffs 1st)',
  playoff_2: 'Playoffs 2nd',
  playoff_3: 'Playoffs 3rd',
  playoff_4: 'Playoffs 4th',
};
const CATEGORIES = Object.keys(CATEGORY_LABELS);

function money(n) {
  if (n == null) return '—';
  const v = Math.round(Math.abs(n) * 100) / 100;
  const s = '$' + v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return n < 0 ? '-' + s : s;
}

// One parallel fetch of the docs almost every page needs.
async function loadWorld() {
  await ensureSeeded();
  const [config, owners, seasons, ledger, alerts, history] = await Promise.all([
    getDoc('config', {}), getDoc('owners', []), getDoc('seasons', {}),
    getDoc('ledger', []), getDoc('alerts', []), getDoc('history', { winnings: {}, awards: {}, weekly: {} }),
  ]);
  // Light migrations for deployments seeded by an earlier version.
  if (!config.sleeper_league_id && !config.sleeper_touched && seedData.SLEEPER_LEAGUE_ID) {
    config.sleeper_league_id = seedData.SLEEPER_LEAGUE_ID;
    await setDoc('config', config);
  }
  let ownersDirty = false;
  for (const o of owners) if (o.email === undefined) { o.email = ''; ownersDirty = true; }
  if (ownersDirty) await setDoc('owners', owners);
  return { config, owners, seasons, ledger, alerts, history };
}

const activeOwners = owners => owners.filter(o => o.active);
const ownerById = (owners, id) => owners.find(o => o.id === Number(id)) || null;

function currentSeason(seasons, year) {
  if (year && seasons[year]) return seasons[year];
  const all = Object.values(seasons);
  return all.find(s => s.status === 'active') || all.sort((a, b) => b.year - a.year)[0];
}

// Payout percentages apply to the pot remaining after weekly prizes.
function payoutTable(season) {
  const weeklyTotal = season.weeks * season.weekly_payout;
  const remaining = season.total_pot - weeklyTotal;
  return {
    weeklyTotal, remaining,
    reg: season.payouts.reg.map((pct, i) => ({ place: i + 1, pct, amount: Math.round(remaining * pct * 100) / 100, category: `reg_${i + 1}` })),
    playoff: season.payouts.playoff.map((pct, i) => ({ place: i + 1, pct, amount: Math.round(remaining * pct * 100) / 100, category: `playoff_${i + 1}` })),
  };
}

// Career winnings grid: legacy years verbatim from the spreadsheet + live
// ledger years computed from weekly/award entries.
function winningsGrid(world) {
  const grid = {};
  for (const [oid, years] of Object.entries(world.history.winnings)) {
    grid[oid] = { ...years };
  }
  const legacyYears = new Set();
  for (const years of Object.values(world.history.winnings)) {
    for (const y of Object.keys(years)) legacyYears.add(Number(y));
  }
  const live = ledgerLib.ledgerWinningsByOwnerYear(world.ledger);
  for (const [oid, years] of Object.entries(live)) {
    for (const [y, amt] of Object.entries(years)) {
      if (legacyYears.has(Number(y))) continue;
      (grid[oid] ??= {})[y] = (grid[oid][y] || 0) + amt;
    }
  }
  return grid;
}

function gridYears(grid) {
  const ys = new Set();
  for (const years of Object.values(grid)) for (const y of Object.keys(years)) ys.add(Number(y));
  return [...ys].sort();
}

function careerTotals(grid, owners) {
  const totals = {};
  for (const o of owners) totals[o.id] = Object.values(grid[o.id] || {}).reduce((a, b) => a + b, 0);
  return totals;
}

// Championships & toilet bowls from legacy history + live season awards/standings.
function accolades(world) {
  const champs = {}; const bowls = {};
  const noteAward = (year, rows) => {
    for (const a of rows) {
      if (a.category === 'playoff_1' || (a.category === 'playoff_2' && (a.note || '').startsWith('Co-champion'))) {
        (champs[a.owner_id] ??= []).push({ year: Number(year), co: (a.note || '').startsWith('Co-champion') });
      }
    }
  };
  for (const [year, rows] of Object.entries(world.history.awards)) noteAward(year, rows);
  const liveYears = new Set(Object.values(world.seasons).map(s => s.year).filter(y => !world.history.awards[y]));
  for (const y of liveYears) {
    noteAward(y, ledgerLib.awardsForYear(world.ledger, y).map(e => ({ category: e.category, owner_id: e.owner_id, note: e.desc || '' })));
  }
  for (const s of Object.values(world.seasons)) {
    if (s.standings && s.standings.length && s.status === 'complete') {
      const last = s.standings[s.standings.length - 1];
      (bowls[last] ??= []).push(s.year);
    }
  }
  return { champs, bowls };
}

// ---------------------------------------------------------------- draft
async function draftState(year, owners) {
  const doc = await getDoc(`draft:${year}`, { order: [] });
  const picks = doc.order.map(p => ({ ...p, name: (ownerById(owners, p.owner_id) || {}).name || '?' }));
  const current = picks.find(p => p.slot == null) || null;
  const taken = new Set(picks.filter(p => p.slot != null).map(p => p.slot));
  const availableSlots = [];
  for (let s = 1; s <= picks.length; s++) if (!taken.has(s)) availableSlots.push(s);
  return { picks, current, availableSlots, complete: picks.length > 0 && !current };
}

async function keepersForYear(year, owners) {
  const keys = await store.listKeys(`keepers:${year}:`);
  const docs = await store.getMany(keys);
  const out = [];
  keys.forEach((k, i) => {
    const oid = Number(k.split(':')[2]);
    const o = ownerById(owners, oid);
    ((docs[i] || {}).players || []).forEach((p, idx) => out.push({ owner_id: oid, name: o ? o.name : '?', player_name: p, round: idx + 1 }));
  });
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.round - b.round);
}

// ---------------------------------------------------------------- votes
async function allVotes(owners) {
  const keys = await store.listKeys('vote:');
  const votes = (await store.getMany(keys)).filter(Boolean);
  const withTallies = await Promise.all(votes.map(async v => {
    const bKeys = await store.listKeys(`ballot:${v.id}:`);
    const ballots = (await store.getMany(bKeys)).filter(Boolean).map((b, i) => ({
      owner_id: Number(bKeys[i].split(':')[2]), choice: b.choice,
      name: (ownerById(owners, Number(bKeys[i].split(':')[2])) || {}).name || '?',
    }));
    const yes = ballots.filter(b => b.choice === 'yes').length;
    const no = ballots.filter(b => b.choice === 'no').length;
    const proposer = ownerById(owners, v.proposer_id);
    return { ...v, ballots, yes, no, cast: ballots.length, passed: yes >= 6, proposer_name: proposer ? proposer.name : '?' };
  }));
  return withTallies.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

const activeAlerts = alerts => alerts.filter(a => a.active);

// Rotating fun.
const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];

module.exports = {
  CATEGORY_LABELS, CATEGORIES, money, loadWorld, activeOwners, ownerById, currentSeason,
  payoutTable, winningsGrid, gridYears, careerTotals, accolades, draftState, keepersForYear,
  allVotes, activeAlerts, pickRandom, getDoc, setDoc, store,
  ROASTS: seedData.ROASTS, QUIPS: seedData.QUIPS,
};
