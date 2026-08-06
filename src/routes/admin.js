const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const H = require('../helpers');
const L = require('../ledger');
const sleeper = require('../sleeper');
const { getDoc, setDoc, store, newId, now } = require('../data');
const { hashPassword, requireCommissioner, aw } = require('../auth');

router.use(requireCommissioner);

const back = (res, tab, extra = '') => res.redirect(`/admin?tab=${tab}${extra}`);
const msg = m => '&msg=' + encodeURIComponent(m);

// One console page; ?tab= picks the section, ?year= the season being managed.
router.get('/', aw(async (req, res) => {
  const world = req.world;
  const tab = req.query.tab || 'alerts';
  const owners = world.owners;
  const active = H.activeOwners(owners);
  const season = H.currentSeason(world.seasons, req.query.year ? parseInt(req.query.year, 10) : undefined);
  const seasons = Object.values(world.seasons).sort((a, b) => b.year - a.year);
  const nameOf = id => (H.ownerById(owners, id) || {}).name || '?';

  const weekly = L.weeklyForYear(world.ledger, season.year).map(e => ({ ...e, name: nameOf(e.owner_id) }));
  const awards = L.awardsForYear(world.ledger, season.year).map(e => ({ ...e, name: nameOf(e.owner_id) }));
  const bal = L.balances(world.ledger, active);
  const draft = await H.draftState(season.year, active);
  const keepers = await H.keepersForYear(season.year, active);
  const votes = await H.allVotes(active);
  const prevSeason = world.seasons[season.year - 1] || null;
  const prevStandings = prevSeason && prevSeason.standings
    ? prevSeason.standings.map((oid, i) => ({ rank: i + 1, name: nameOf(oid), owner_id: oid })) : [];

  // Sleeper panel data (weekly tab shows the one-click suggestion).
  let sleeperInfo = null, suggestion = null, suggestWeek = null;
  if (world.config.sleeper_league_id && (tab === 'sleeper' || tab === 'weekly')) {
    const data = await sleeper.bundle(world.config.sleeper_league_id);
    if (data) {
      sleeperInfo = {
        league: data.league, week: data.week,
        rosters: data.rosters.map(r => ({
          roster_id: r.roster_id,
          team: sleeper.teamName(data.users, data.rosters, r.roster_id),
          mapped: (world.config.sleeper_map || {})[String(r.roster_id)] || '',
        })),
      };
      if (tab === 'weekly') {
        suggestWeek = parseInt(req.query.sweek, 10) || Math.max(1, (data.state.week || 1) - 1);
        const m = await sleeper.matchupsForWeek(world.config.sleeper_league_id, suggestWeek);
        suggestion = sleeper.highScorer(m, data, world.config.sleeper_map || {}, active);
      }
    }
  }

  res.render('admin/console', {
    tab, season, seasons, weekly, awards, draft, keepers, votes, prevStandings,
    balancesMap: bal, ledger: world.ledger, config: world.config,
    payouts: H.payoutTable(season),
    alertRows: [...world.alerts].sort((a, b) => (b.active - a.active) || (a.created_at < b.created_at ? 1 : -1)),
    ownerRows: [...owners].sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name)),
    nameOf, TYPE_LABELS: L.TYPE_LABELS,
    CATEGORIES: H.CATEGORIES, CATEGORY_LABELS: H.CATEGORY_LABELS,
    sleeperInfo, suggestion, suggestWeek,
    flash: req.query.msg || null,
  });
}));

// ---------- alerts ----------
router.post('/alerts', aw(async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (message) {
    const alerts = await getDoc('alerts', []);
    alerts.push({
      id: newId(), message,
      level: ['info', 'warning', 'urgent'].includes(req.body.level) ? req.body.level : 'info',
      active: true, created_at: now(),
    });
    await setDoc('alerts', alerts);
  }
  back(res, 'alerts');
}));
router.post('/alerts/:id/toggle', aw(async (req, res) => {
  const alerts = await getDoc('alerts', []);
  const a = alerts.find(x => x.id === req.params.id);
  if (a) { a.active = !a.active; await setDoc('alerts', alerts); }
  back(res, 'alerts');
}));
router.post('/alerts/:id/delete', aw(async (req, res) => {
  await setDoc('alerts', (await getDoc('alerts', [])).filter(x => x.id !== req.params.id));
  back(res, 'alerts');
}));

// ---------- the ledger (all money flows through here) ----------
router.post('/ledger', aw(async (req, res) => {
  const amount = parseFloat(req.body.amount);
  const owner_id = parseInt(req.body.owner_id, 10);
  const desc = String(req.body.desc || '').trim() || 'Manual adjustment';
  if (Number.isFinite(amount) && amount !== 0 && owner_id) {
    await L.addEntry({
      owner_id, year: H.currentSeason(req.world.seasons).year,
      type: 'adjustment', amount, desc,
    });
  }
  back(res, req.body.back || 'ledger');
}));
router.post('/ledger/:id/settle', aw(async (req, res) => {
  const ledger = await L.allEntries();
  const e = ledger.find(x => x.id === req.params.id);
  if (e) await L.setSettled(e.id, !e.settled);
  back(res, req.body.back || 'ledger', req.body.year ? `&year=${req.body.year}` : '');
}));
router.post('/ledger/:id/delete', aw(async (req, res) => {
  await L.removeEntry(req.params.id);
  back(res, req.body.back || 'ledger', req.body.year ? `&year=${req.body.year}` : '');
}));
router.post('/ledger/settle-all/:ownerId', aw(async (req, res) => {
  const n = await L.settleAll(req.params.ownerId);
  const name = (H.ownerById(req.world.owners, req.params.ownerId) || {}).name || '?';
  back(res, req.body.back || 'ledger', msg(`Squared up with ${name} — ${n} item${n === 1 ? '' : 's'} settled.`));
}));

// ---------- weekly high point ----------
router.post('/weekly', aw(async (req, res) => {
  const world = req.world;
  const year = parseInt(req.body.year, 10);
  const week = parseInt(req.body.week, 10);
  const owner_id = parseInt(req.body.owner_id, 10);
  const season = world.seasons[year];
  if (season && week >= 1 && week <= 25 && owner_id) {
    const amount = Number.isFinite(parseFloat(req.body.amount)) ? parseFloat(req.body.amount) : season.weekly_payout;
    // Re-recording a week replaces the old entry.
    const existing = world.ledger.find(e => e.type === 'weekly' && e.year === year && e.week === week);
    if (existing) await L.removeEntry(existing.id);
    await L.addEntry({
      owner_id, year, type: 'weekly', week, amount,
      desc: `Week ${week} high point`, settled: !!req.body.paid,
    });
  }
  back(res, 'weekly', `&year=${year}`);
}));

// ---------- season awards ----------
router.post('/awards', aw(async (req, res) => {
  const world = req.world;
  const year = parseInt(req.body.year, 10);
  const category = req.body.category;
  const owner_id = parseInt(req.body.owner_id, 10);
  const season = world.seasons[year];
  if (season && H.CATEGORIES.includes(category) && owner_id) {
    let amount = parseFloat(req.body.amount);
    if (!Number.isFinite(amount)) {
      const table = H.payoutTable(season);
      const row = [...table.reg, ...table.playoff].find(r => r.category === category);
      amount = row ? row.amount : 0;
    }
    const existing = world.ledger.find(e => e.type === 'award' && e.year === year && e.category === category);
    if (existing) await L.removeEntry(existing.id);
    await L.addEntry({
      owner_id, year, type: 'award', category, amount,
      desc: H.CATEGORY_LABELS[category], settled: !!req.body.paid,
    });
  }
  back(res, 'awards', `&year=${year}`);
}));

// ---------- standings ----------
router.post('/standings', aw(async (req, res) => {
  const world = req.world;
  const year = parseInt(req.body.year, 10);
  const active = H.activeOwners(world.owners);
  const pairs = [];
  for (const o of active) {
    const r = parseInt(req.body[`rank_${o.id}`], 10);
    if (Number.isFinite(r) && r >= 1) pairs.push({ owner_id: o.id, rank: r });
  }
  const seen = new Set(pairs.map(p => p.rank));
  if (seen.size !== pairs.length) return back(res, 'standings', `&year=${year}` + msg('Duplicate ranks — each place can only be used once.'));
  const seasons = await getDoc('seasons', {});
  if (!seasons[year]) return back(res, 'standings');
  seasons[year].standings = pairs.sort((a, b) => a.rank - b.rank).map(p => p.owner_id);
  await setDoc('seasons', seasons);
  back(res, 'standings', `&year=${year}` + msg('Standings saved.'));
}));

// ---------- draft ----------
router.post('/draft/open', aw(async (req, res) => {
  const year = parseInt(req.body.year, 10);
  const seasons = await getDoc('seasons', {});
  const season = seasons[year];
  if (!season) return back(res, 'draft');
  const doc = await getDoc(`draft:${year}`, { order: [] });
  if (!doc.order.length) {
    const prev = seasons[year - 1];
    const prevStandings = prev && prev.standings ? prev.standings : [];
    if (!prevStandings.length) return back(res, 'draft', `&year=${year}` + msg(`Enter final standings for ${year - 1} first — they set the pick order.`));
    doc.order = [...prevStandings].reverse().map((oid, i) => ({ pos: i + 1, owner_id: oid, slot: null }));
    await setDoc(`draft:${year}`, doc);
  }
  season.draft_open = true;
  await setDoc('seasons', seasons);
  back(res, 'draft', `&year=${year}` + msg('Draft room is OPEN.'));
}));
router.post('/draft/close', aw(async (req, res) => {
  const year = parseInt(req.body.year, 10);
  const seasons = await getDoc('seasons', {});
  if (seasons[year]) { seasons[year].draft_open = false; await setDoc('seasons', seasons); }
  back(res, 'draft', `&year=${year}`);
}));
router.post('/draft/reset', aw(async (req, res) => {
  const year = parseInt(req.body.year, 10);
  await store.del(`draft:${year}`);
  const seasons = await getDoc('seasons', {});
  if (seasons[year]) { seasons[year].draft_open = false; await setDoc('seasons', seasons); }
  back(res, 'draft', `&year=${year}` + msg('Draft cleared.'));
}));
router.post('/draft/override', aw(async (req, res) => {
  const year = parseInt(req.body.year, 10);
  const pos = parseInt(req.body.pos, 10);
  const doc = await getDoc(`draft:${year}`, { order: [] });
  const pick = doc.order.find(p => p.pos === pos);
  if (pick) {
    const slot = req.body.slot === '' ? null : parseInt(req.body.slot, 10);
    if (slot != null && doc.order.some(p => p.slot === slot && p.pos !== pos)) {
      return back(res, 'draft', `&year=${year}` + msg(`Spot #${slot} is already taken.`));
    }
    pick.slot = slot;
    await setDoc(`draft:${year}`, doc);
  }
  back(res, 'draft', `&year=${year}`);
}));
router.post('/keepers-lock', aw(async (req, res) => {
  const year = parseInt(req.body.year, 10);
  const seasons = await getDoc('seasons', {});
  if (seasons[year]) { seasons[year].keepers_locked = !seasons[year].keepers_locked; await setDoc('seasons', seasons); }
  back(res, 'draft', `&year=${year}`);
}));

// ---------- votes ----------
router.post('/votes/:id/close', aw(async (req, res) => {
  const v = await getDoc(`vote:${req.params.id}`, null);
  if (v) { v.status = 'closed'; v.closed_at = now(); await setDoc(`vote:${v.id}`, v); }
  back(res, 'votes');
}));
router.post('/votes/:id/reopen', aw(async (req, res) => {
  const v = await getDoc(`vote:${req.params.id}`, null);
  if (v) { v.status = 'open'; v.closed_at = null; await setDoc(`vote:${v.id}`, v); }
  back(res, 'votes');
}));
router.post('/votes/:id/delete', aw(async (req, res) => {
  await store.del(`vote:${req.params.id}`);
  for (const k of await store.listKeys(`ballot:${req.params.id}:`)) await store.del(k);
  back(res, 'votes');
}));

// ---------- owners ----------
router.post('/owners', aw(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const username = String(req.body.username || '').trim().toLowerCase();
  if (!name || !username) return back(res, 'owners');
  const owners = await getDoc('owners', []);
  if (owners.some(o => o.name.toLowerCase() === name.toLowerCase() || o.username === username)) {
    return back(res, 'owners', msg('That name or username already exists.'));
  }
  const temp = 'maga' + crypto.randomInt(1000, 9999);
  owners.push({
    id: Math.max(0, ...owners.map(o => o.id)) + 1, name, username,
    password_hash: hashPassword(temp), must_change_password: true,
    is_commissioner: false, active: true, wins: 0, losses: 0, ties: 0,
  });
  await setDoc('owners', owners);
  back(res, 'owners', msg(`${name} added. Temporary password: ${temp}`));
}));
router.post('/owners/:id/reset-password', aw(async (req, res) => {
  const owners = await getDoc('owners', []);
  const o = owners.find(x => x.id === Number(req.params.id));
  if (!o) return back(res, 'owners');
  const temp = 'maga' + crypto.randomInt(1000, 9999);
  o.password_hash = hashPassword(temp);
  o.must_change_password = true;
  await setDoc('owners', owners);
  back(res, 'owners', msg(`${o.name}'s temporary password: ${temp} (they must change it at next login)`));
}));
router.post('/owners/:id/toggle-active', aw(async (req, res) => {
  if (Number(req.params.id) === req.owner.id) return back(res, 'owners', msg('You cannot deactivate yourself.'));
  const owners = await getDoc('owners', []);
  const o = owners.find(x => x.id === Number(req.params.id));
  if (o) { o.active = !o.active; await setDoc('owners', owners); }
  back(res, 'owners');
}));
router.post('/owners/:id/record', aw(async (req, res) => {
  const owners = await getDoc('owners', []);
  const o = owners.find(x => x.id === Number(req.params.id));
  if (o) {
    o.wins = parseInt(req.body.wins, 10) || 0;
    o.losses = parseInt(req.body.losses, 10) || 0;
    o.ties = parseInt(req.body.ties, 10) || 0;
    await setDoc('owners', owners);
  }
  back(res, 'owners');
}));

// ---------- season settings ----------
router.post('/season', aw(async (req, res) => {
  const year = parseInt(req.body.year, 10);
  if (!Number.isFinite(year)) return back(res, 'season');
  const seasons = await getDoc('seasons', {});
  const active = H.activeOwners(req.world.owners);
  const buy_in = parseFloat(req.body.buy_in) || 0;
  const weeks = parseInt(req.body.weeks, 10) || 0;
  const weekly_payout = parseFloat(req.body.weekly_payout) || 0;
  const total_pot = Number.isFinite(parseFloat(req.body.total_pot)) ? parseFloat(req.body.total_pot) : buy_in * active.length;
  const pct = k => (parseFloat(req.body[k]) || 0) / 100;
  const payouts = {
    reg: [pct('reg_1'), pct('reg_2')],
    playoff: [pct('playoff_1'), pct('playoff_2'), pct('playoff_3'), pct('playoff_4')],
  };
  const status = ['upcoming', 'active', 'complete'].includes(req.body.status) ? req.body.status : 'upcoming';
  const isNew = !seasons[year];

  seasons[year] = {
    ...(seasons[year] || { draft_open: false, keepers_locked: false, standings: [] }),
    year, buy_in, total_pot, weeks, weekly_payout, payouts, status,
  };
  if (status === 'active') {
    for (const s of Object.values(seasons)) if (s.year !== year && s.status === 'active') s.status = 'complete';
  }
  await setDoc('seasons', seasons);

  if (isNew) {
    // New season -> everyone gets a buy-in charge on their tab automatically.
    for (const o of active) {
      await L.addEntry({ owner_id: o.id, year, type: 'buy_in', amount: -buy_in, desc: `${year} buy-in` });
    }
    return back(res, 'season', `&year=${year}` + msg(`Season ${year} created — ${H.money(buy_in)} buy-in charged to all ${active.length} owners' tabs.`));
  }
  // Buy-in changed mid-flight? Keep unpaid charges in sync.
  const ledger = await L.allEntries();
  let touched = 0;
  for (const e of ledger) {
    if (e.type === 'buy_in' && e.year === year && !e.settled && e.amount !== -buy_in) { e.amount = -buy_in; touched++; }
  }
  if (touched) await setDoc('ledger', ledger);
  back(res, 'season', `&year=${year}` + msg(`Season ${year} saved.${touched ? ` ${touched} unpaid buy-in charge(s) updated to ${H.money(buy_in)}.` : ''}`));
}));

// ---------- sleeper ----------
router.post('/sleeper', aw(async (req, res) => {
  const config = await getDoc('config', {});
  config.sleeper_league_id = String(req.body.league_id || '').trim();
  await setDoc('config', config);
  await store.del('sleeper-cache');
  back(res, 'sleeper', msg(config.sleeper_league_id ? 'Sleeper league connected.' : 'Sleeper league disconnected.'));
}));
router.post('/sleeper/map', aw(async (req, res) => {
  const config = await getDoc('config', {});
  const map = {};
  for (const [k, v] of Object.entries(req.body)) {
    if (k.startsWith('map_') && v) map[k.slice(4)] = Number(v);
  }
  config.sleeper_map = map;
  await setDoc('config', config);
  back(res, 'sleeper', msg('Team mapping saved.'));
}));

// ---------- backup ----------
router.get('/export', aw(async (req, res) => {
  const dump = {};
  for (const key of ['config', 'owners', 'seasons', 'ledger', 'alerts', 'history', 'sleeper-cache']) {
    dump[key] = await getDoc(key, null);
  }
  for (const prefix of ['draft:', 'keepers:', 'vote:', 'ballot:']) {
    for (const k of await store.listKeys(prefix)) dump[k] = await getDoc(k, null);
  }
  if (dump.config) delete dump.config.secret; // keep the session secret out of downloads
  res.setHeader('Content-Disposition', `attachment; filename="maga-league-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(dump);
}));

module.exports = router;
