const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const H = require('../helpers');
const L = require('../ledger');
const sleeper = require('../sleeper');
const notify = require('../notify');
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
  const votes = await H.allVotes(active, H.voteThreshold(world.config));
  const prevSeason = world.seasons[season.year - 1] || null;
  const prevStandings = prevSeason && prevSeason.standings
    ? prevSeason.standings.map((oid, i) => ({ rank: i + 1, name: nameOf(oid), owner_id: oid })) : [];

  // Sleeper panel data (weekly tab shows the one-click suggestion).
  let sleeperInfo = null, suggestion = null, suggestWeek = null, sleeperStatus = null;
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

  // A straight answer to "why isn't Sleeper working". The cache doc records
  // both the last success and the last failure, so the panel can say which of
  // the four things is actually wrong instead of a shrug.
  if (tab === 'sleeper') {
    const cache = await getDoc('sleeper-cache', null);
    const mapped = Object.keys(world.config.sleeper_map || {}).length;
    sleeperStatus = {
      hasId: !!world.config.sleeper_league_id,
      leagueId: world.config.sleeper_league_id || '',
      live: !!sleeperInfo,
      mapped,
      teams: sleeperInfo ? sleeperInfo.rosters.length : 0,
      unmapped: sleeperInfo ? sleeperInfo.rosters.filter(r => !r.mapped).length : null,
      // Which ones, not just how many. Sleeper display names rarely contain the
      // owner's first name — of the ten in this league the auto-matcher can
      // only recognise three — so this list is the actual work to be done.
      unmappedTeams: sleeperInfo ? sleeperInfo.rosters.filter(r => !r.mapped).map(r => r.team) : [],
      lastOk: cache && cache.fetched_at ? new Date(cache.fetched_at).toISOString() : null,
      lastFail: cache && cache.failed_at ? new Date(cache.failed_at).toISOString() : null,
    };
  }

  res.render('admin/console', {
    tab, season, seasons, weekly, awards, draft, keepers, votes, prevStandings,
    balancesMap: bal, ledger: world.ledger, config: world.config,
    payouts: H.payoutTable(season),
    alertRows: [...world.alerts].sort((a, b) => (b.active - a.active) || (a.created_at < b.created_at ? 1 : -1)),
    ownerRows: [...owners].sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name)),
    nameOf, TYPE_LABELS: L.TYPE_LABELS,
    CATEGORIES: H.CATEGORIES, CATEGORY_LABELS: H.CATEGORY_LABELS,
    sleeperInfo, suggestion, suggestWeek, sleeperStatus,
    ledgerFilter: parseInt(req.query.owner, 10) || 0,
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
    notify.alertPosted(req.world.owners, message, alerts[alerts.length - 1].level).catch(() => {});
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

// ---------- the books (all money flows through here) ----------
// Full manual entry: who, which direction, how much, what for, note, season.
router.post('/ledger', aw(async (req, res) => {
  const owner_id = parseInt(req.body.owner_id, 10);
  const raw = parseFloat(req.body.amount);
  const kind = ['charge', 'credit', 'payment_received', 'payment_sent', 'carry_credit', 'carry_debit']
    .includes(req.body.kind) ? req.body.kind : 'credit';
  const desc = String(req.body.desc || '').trim() || 'Manual entry';
  const note = String(req.body.note || '').trim().slice(0, 120);
  const year = parseInt(req.body.year, 10) || H.currentSeason(req.world.seasons).year;
  if (Number.isFinite(raw) && raw !== 0 && owner_id) {
    const negative = kind === 'charge' || kind === 'payment_sent' || kind === 'carry_debit';
    const amount = Math.abs(raw) * (negative ? -1 : 1);
    await L.addEntry({
      owner_id, year,
      // Carryover is its own type, not an adjustment: it is the one entry that
      // is neither earned nor paid this season, and the chart gives it a column.
      type: kind.startsWith('payment') ? 'payment'
          : kind.startsWith('carry') ? 'carryover' : 'adjustment',
      amount,
      desc: desc + (note ? ` — ${note}` : ''),
    });
  }
  back(res, req.body.back || 'ledger');
}));

// The whole register as a CSV — the commissioner's actual accounting file.
router.get('/ledger.csv', aw(async (req, res) => {
  const world = req.world;
  const nameOf = id => (H.ownerById(world.owners, id) || {}).name || '?';
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['date', 'owner', 'type', 'description', 'amount', 'season', 'status', 'settled_on', 'settle_note']];
  for (const e of [...world.ledger].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
    rows.push([(e.created_at || '').slice(0, 10), nameOf(e.owner_id), L.TYPE_LABELS[e.type] || e.type,
      e.desc, e.amount.toFixed(2), e.year, e.settled ? 'settled' : 'open',
      (e.settled_at || '').slice(0, 10), e.settle_note || '']);
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="league-books-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(rows.map(r => r.map(esc).join(',')).join('\n'));
}));
router.post('/ledger/:id/settle', aw(async (req, res) => {
  const ledger = await L.allEntries();
  const e = ledger.find(x => x.id === req.params.id);
  if (e) {
    const updated = await L.setSettled(e.id, !e.settled, req.body.note, req.owner.name);
    if (updated && updated.settled) {
      const target = H.ownerById(req.world.owners, updated.owner_id);
      if (target) notify.moneySettled(target, updated).catch(() => {});
    }
  }
  if (req.body.back === 'bank') return res.redirect('/bank');
  back(res, req.body.back || 'ledger', req.body.year ? `&year=${req.body.year}` : '');
}));
router.post('/ledger/:id/delete', aw(async (req, res) => {
  await L.removeEntry(req.params.id);
  back(res, req.body.back || 'ledger', req.body.year ? `&year=${req.body.year}` : '');
}));
router.post('/ledger/settle-all/:ownerId', aw(async (req, res) => {
  const n = await L.settleAll(req.params.ownerId);
  const name = (H.ownerById(req.world.owners, req.params.ownerId) || {}).name || '?';
  if (req.body.back === 'bank') return res.redirect('/bank');
  back(res, req.body.back || 'ledger', msg(`Squared up with ${name} — ${n} item${n === 1 ? '' : 's'} settled.`));
}));

// Record an actual cash movement of any amount against an owner's tab.
// 'they_paid' = money came to the commissioner (+), 'i_paid' = went out (-).
router.post('/payment', aw(async (req, res) => {
  const owner_id = parseInt(req.body.owner_id, 10);
  const amount = Math.abs(parseFloat(req.body.amount));
  const dir = req.body.direction === 'i_paid' ? -1 : 1;
  const note = String(req.body.note || '').trim().slice(0, 120);
  if (owner_id && Number.isFinite(amount) && amount > 0) {
    await L.addEntry({
      owner_id, year: H.currentSeason(req.world.seasons).year,
      type: 'payment', amount: dir * amount,
      desc: (dir === 1 ? 'Payment received' : 'Payment sent') + (note ? ` — ${note}` : ''),
    });
  }
  res.redirect('/bank#owner-' + owner_id);
}));

// ---------- punishment wall moderation ----------
router.post('/punishments/:id/delete', aw(async (req, res) => {
  await store.del(`punish:${req.params.id}`);
  res.redirect('/votes#punishments');
}));
router.post('/punishments-lock', aw(async (req, res) => {
  const config = await getDoc('config', {});
  config.punishments_locked = !config.punishments_locked;
  await setDoc('config', config);
  res.redirect('/votes#punishments');
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
  for (const k of await store.listKeys(`vcomment:${req.params.id}:`)) await store.del(k);
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

// ---------- league settings ----------
router.post('/settings', aw(async (req, res) => {
  const config = await getDoc('config', {});
  const t = parseInt(req.body.vote_threshold, 10);
  if (Number.isFinite(t) && t > 0 && t <= 20) config.vote_threshold = t;
  await setDoc('config', config);
  back(res, 'season', msg(`Rule changes now need ${config.vote_threshold} YES votes.`));
}));

// Freeze each owner's pre-Sleeper record, then track the Sleeper era live.
// Seasons Sleeper never saw (the league's old site) are preserved exactly.
router.post('/sync-records', aw(async (req, res) => {
  const world = req.world;
  const active = H.activeOwners(world.owners);
  const data = await sleeper.bundle(world.config.sleeper_league_id);
  const uMap = sleeper.userMap(data, world.config.sleeper_map || {});
  const recs = await sleeper.records(world.config.sleeper_league_id, uMap, active, { force: true });
  if (!recs || !recs.careerByUser) return back(res, 'owners', msg('Could not reach Sleeper to sync records.'));
  const era = H.sleeperEraByOwner(recs, uMap);
  const owners = await getDoc('owners', []);
  let n = 0;
  for (const o of owners) {
    const e = era[o.id];
    if (!e) continue;
    // Baseline = the record you already had, minus what Sleeper can account for.
    o.record_baseline = {
      wins: Math.max(0, (o.wins || 0) - (e.wins || 0)),
      losses: Math.max(0, (o.losses || 0) - (e.losses || 0)),
      ties: Math.max(0, (o.ties || 0) - (e.ties || 0)),
      through: `pre-${recs.seasonsCovered[0]}`,
    };
    n++;
  }
  await setDoc('owners', owners);
  back(res, 'owners', msg(`Synced ${n} owner${n === 1 ? '' : 's'}. Pre-${recs.seasonsCovered[0]} records frozen as-is; Sleeper seasons (${recs.seasonsCovered.join(', ')}) now update themselves.`));
}));

router.post('/unsync-records', aw(async (req, res) => {
  const owners = await getDoc('owners', []);
  for (const o of owners) delete o.record_baseline;
  await setDoc('owners', owners);
  back(res, 'owners', msg('Back to manual records.'));
}));

// Propose all six season payouts from Sleeper's final standings + bracket.
router.post('/propose-awards', aw(async (req, res) => {
  const world = req.world;
  const year = parseInt(req.body.year, 10);
  const season = world.seasons[year];
  const active = H.activeOwners(world.owners);
  const data = await sleeper.bundle(world.config.sleeper_league_id);
  if (!season || !data) return back(res, 'awards', `&year=${year}` + msg('Could not reach Sleeper.'));
  const rows = sleeper.standings(data, world.config.sleeper_map || {}, active);
  const byName = {};
  for (const o of active) byName[o.name] = o.id;
  const idAt = i => (rows[i] && rows[i].owner_name) ? byName[rows[i].owner_name] : null;
  const table = H.payoutTable(season);
  const plan = [
    ['reg_1', idAt(0)], ['reg_2', idAt(1)],
    ['playoff_1', idAt(0)], ['playoff_2', idAt(1)], ['playoff_3', idAt(2)], ['playoff_4', idAt(3)],
  ];
  let n = 0;
  for (const [category, owner_id] of plan) {
    if (!owner_id) continue;
    const row = [...table.reg, ...table.playoff].find(r => r.category === category);
    const existing = world.ledger.find(e => e.type === 'award' && e.year === year && e.category === category);
    if (existing) continue; // never overwrite what you already entered
    await L.addEntry({
      owner_id, year, type: 'award', category, amount: row ? row.amount : 0,
      desc: H.CATEGORY_LABELS[category],
    });
    n++;
  }
  back(res, 'awards', `&year=${year}` + msg(n
    ? `Drafted ${n} award${n === 1 ? '' : 's'} from Sleeper standings — playoff spots are a guess, fix any that are wrong.`
    : 'Nothing to add — awards already recorded.'));
}));

// ---------- sleeper ----------
router.post('/sleeper', aw(async (req, res) => {
  const config = await getDoc('config', {});
  config.sleeper_league_id = String(req.body.league_id || '').trim();
  config.sleeper_touched = true;
  await setDoc('config', config);
  await store.del('sleeper-cache');
  back(res, 'sleeper', msg(config.sleeper_league_id ? 'Sleeper league connected.' : 'Sleeper league disconnected.'));
}));
router.post('/sleeper/map', aw(async (req, res) => {
  const config = await getDoc('config', {});
  const owners = H.activeOwners(req.world.owners);
  const nameOf = id => (H.ownerById(owners, id) || {}).name || ('#' + id);

  const map = {};
  const byOwner = {};
  for (const [k, v] of Object.entries(req.body)) {
    if (!k.startsWith('map_') || !v) continue;
    const rosterId = k.slice(4);
    const ownerId = Number(v);
    map[rosterId] = ownerId;
    (byOwner[ownerId] = byOwner[ownerId] || []).push(rosterId);
  }

  // One owner cannot hold two Sleeper teams. Nothing used to stop it, and the
  // failure was silent in the worst way: the duplicated owner appeared twice in
  // the standings, somebody else appeared not at all, and every score-based
  // lookup for the missing owner quietly returned nothing.
  const dupes = Object.entries(byOwner).filter(([, rosters]) => rosters.length > 1);
  if (dupes.length) {
    return back(res, 'sleeper', msg(
      'Not saved — ' + dupes.map(([o, r]) => `${nameOf(o)} is on ${r.length} teams`).join(', ')
      + '. Each owner can hold one Sleeper team. Nothing was changed.'));
  }

  config.sleeper_map = map;
  await setDoc('config', config);

  // Say what actually landed. "Saved." is what a form says when it has no idea
  // whether the thing you wanted happened, and it is why nobody trusts it.
  const total = Object.keys(map).length;
  const missing = owners.filter(o => !Object.values(map).includes(o.id)).map(o => o.name);
  back(res, 'sleeper', msg(
    `Mapped ${total} team${total === 1 ? '' : 's'}.`
    + (missing.length ? ` Still without a Sleeper team: ${missing.join(', ')}.` : ' Every owner has one.')));
}));

router.post('/sleeper/refresh-records', aw(async (req, res) => {
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const data = await sleeper.bundle(world.config.sleeper_league_id);
  const uMap = sleeper.userMap(data, world.config.sleeper_map || {});
  const recs = await sleeper.records(world.config.sleeper_league_id, uMap, owners, { force: true });
  back(res, 'sleeper', msg(recs ? `Record book recomputed across ${recs.seasonsCovered.length} Sleeper season(s).` : 'Could not reach Sleeper to rebuild the record book.'));
}));

// ---------- the war room (commissioner's draft optimization tool) ----------
// The heavy lifting lives in public/js/draft/* against the offline-built
// draft_data.json artifact; this route only serves the shell.
router.get('/warroom', aw(async (req, res) => {
  const season = H.currentSeason(req.world.seasons);
  const overrides = await getDoc('draft-config-overrides', {});

  // The draft slot is decided on this site, in the draft room, and can change
  // right up to draft day — after the pipeline has already built a board for
  // whatever slot it was told. Read the claimed spot straight from the draft
  // order so the War Room never has to be told twice.
  let claimedSlot = null;
  try {
    const draft = await H.draftState(season.year, req.world.owners);
    const mine = draft.picks.find(p => p.owner_id === req.owner.id && p.slot != null);
    if (mine) claimedSlot = mine.slot;
  } catch (e) {
    // A missing draft order is normal preseason; fall back to the override.
  }

  res.render('admin/warroom', {
    season,
    config: req.world.config,
    // The claimed spot wins: it is the thing that actually happened, whereas
    // the override is what someone typed. An explicit override still shows in
    // the setup screen, so a deliberate what-if is one field away.
    overrides: claimedSlot ? { ...overrides, my_draft_slot: claimedSlot } : overrides,
    claimedSlot,
    // A slot claimed on THIS site's /draft page is provenance 'site-claimed'
    // (Sleeper draft order still pending). That is a real claim on our own
    // backend — better than a manual guess — but not yet the Sleeper-verified
    // state the A2 machinery flips to when the draft object's order lands.
    slotProvenance: claimedSlot ? 'site-claimed' : null,
  });
}));

// The rehearsal guide, served from the doc so there is one copy of it. Rendered
// rather than linked to GitHub because on draft week nobody wants to leave the
// site to find out how to test the site.
router.get('/warroom/rehearsal', aw(async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  let md = '';
  try {
    md = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'MOCK-DRAFT-REHEARSAL.md'), 'utf8');
  } catch (e) {
    md = '# Rehearsal guide\n\nCould not read docs/MOCK-DRAFT-REHEARSAL.md.';
  }
  res.render('admin/rehearsal', { md });
}));

// ---------- STATUS DASHBOARD ----------
// The phone-readable face of STATUS.md + DECISIONS-NEEDED.md. Those files stay
// the source of truth; this route re-parses them on every load, so it is always
// current with whatever was last pushed (no build step, no drift). Next to the
// war room, behind the same login.
router.get('/status', aw(async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const dash = require('../dashboard');
  const root = path.join(__dirname, '..', '..');
  const read = f => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { return ''; } };
  const statusText = read('STATUS.md');
  const decText = read('DECISIONS-NEEDED.md');

  // Health strip, all best-effort — any field may be null and the view degrades.
  const health = { commit: null, commitAt: null, ci: null, audit: null };
  // Last commit: git in dev; Netlify exposes COMMIT_REF but not the time, so we
  // try git first and fall back to the env ref. Never throw — a dashboard that
  // 500s because git is absent is worse than one that says "unknown".
  try {
    const cp = require('child_process');
    health.commit = cp.execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    health.commitAt = cp.execSync('git log -1 --format=%cI', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    health.commit = (process.env.COMMIT_REF || '').slice(0, 7) || null;
  }
  // Sunday self-audit summary (E-1 writes a one-line summary to STATUS.md). Pull
  // the most recent line that looks like an audit stamp, if any.
  const auditLine = statusText.split('\n').reverse()
    .find(l => /self-?audit|sunday audit|weekly audit/i.test(l) && !/^#/.test(l));
  if (auditLine) health.audit = dash.clean(auditLine).slice(0, 200);

  const model = dash.buildModel({
    statusText: statusText,
    decText: decText,
    now: new Date().toISOString(),
    draftDate: (req.world.config && req.world.config.draft_date) || '2026-08-22',
    health: health,
  });
  res.render('admin/dashboard', { model: model, hasFiles: !!(statusText && decText) });
}));

// ---------- SLOT PICKER (private, Cory-only) ----------
// A live tool while draft-spot claims land on the shared /draft page: for every
// still-open slot, Cory's resulting pick numbers + Bowers-class survival + turn
// structure, ranked. READ-ONLY — it never writes the claim doc and never touches
// the shared /draft page (which stays exactly as-is for every other owner). The
// whole /admin router is already requireCommissioner (Cory is the sole
// commissioner); the explicit owner guard below is defense-in-depth so this can
// never render for anyone else even if a second commissioner is ever added.
function requireCory(req, res, next) {
  const me = req.owner || {};
  if (me.is_commissioner === true) return next();
  return res.status(403).send('Not available.');
}

async function slotPickerModel(req) {
  const fs = require('fs');
  const path = require('path');
  const slotpicker = require('../slotpicker');
  const season = H.currentSeason(req.world.seasons);
  let artifact = {};
  try {
    artifact = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
  } catch (e) { artifact = {}; }
  const doc = await getDoc(`draft:${season.year}`, { order: [] });
  const owners = req.world.owners;
  const nameOf = id => (H.ownerById(owners, id) || {}).name || ('Owner ' + id);
  // Keeper rounds for MY seat: from the artifact's forfeited count for my keepers
  // (Cory keeps 3 → rounds 1-3). Falls back to 3.
  const forfeited = ((artifact.pick_order || {}).forfeited || []);
  const myForfeits = forfeited.length ? Math.max.apply(null, forfeited.map(f => Number(f.cost_round) || 0)) : 3;
  return slotpicker.analyze({
    artifact: artifact,
    claimOrder: doc.order || [],
    myOwnerId: req.owner.id,
    keeperRounds: myForfeits || 3,
    ownerName: nameOf,
    season: season.year,
  });
}

router.get('/slot-picker', requireCory, aw(async (req, res) => {
  const model = await slotPickerModel(req);
  // Claim-correction panel data: the raw order with names, and the open pool.
  const season = H.currentSeason(req.world.seasons);
  const doc = await getDoc(`draft:${season.year}`, { order: [] });
  const cf = require('../claimfix');
  const claims = (doc.order || []).map(e => ({
    pos: e.pos, owner_id: e.owner_id, slot: e.slot,
    name: (H.ownerById(req.world.owners, e.owner_id) || {}).name || ('Owner ' + e.owner_id),
  }));
  res.render('admin/slot-picker', { model, claims, openSlots: cf.openSlots(doc),
    fixed: req.query.fixed || null, fixerr: req.query.fixerr || null });
}));

// Polled by the page so it re-ranks live as claims land — same model, JSON.
router.get('/slot-picker/state.json', requireCory, aw(async (req, res) => {
  const model = await slotPickerModel(req);
  res.json(model);
}));

// ---------- CLAIM CORRECTION (commissioner-only, live during selection) ----
// The fat-finger fix: reassign or void any owner's slot claim mid-process.
// Atomic at the document level (one read-modify-write of the ONE claim doc),
// and downstream-safe by construction: the /draft pool, the slot-picker model
// and the war room's claimed-slot provenance all DERIVE from this doc, so
// correcting it corrects every surface on their next read/poll. If the
// correction changes whose turn it is, that owner gets the turn notification.
const claimfix = require('../claimfix');

router.post('/draft/claim-fix', requireCory, aw(async (req, res) => {
  const world = req.world;
  const season = H.currentSeason(world.seasons);
  const doc = await getDoc(`draft:${season.year}`, { order: [] });
  try {
    const out = claimfix.applyCorrection(doc, {
      owner_id: req.body.owner_id,
      action: req.body.action,
      slot: req.body.slot,
      by: req.owner.id,
      at: now(),
    });
    await setDoc(`draft:${season.year}`, out.doc);
    // Whoever is now on the clock hears about it — a voided claim puts the
    // cleared owner back on turn; everyone later waits for them.
    if (out.next_owner_id != null) {
      const nxt = H.ownerById(world.owners, out.next_owner_id);
      if (nxt) notify.draftTurn(nxt).catch(() => {});
    }
    res.redirect('/admin/slot-picker?fixed=' + encodeURIComponent(
      (H.ownerById(world.owners, out.change.owner_id) || {}).name
      + ': ' + (out.change.from == null ? 'unclaimed' : 'slot ' + out.change.from)
      + ' → ' + (out.change.to == null ? 'unclaimed (re-picks)' : 'slot ' + out.change.to)));
  } catch (e) {
    res.redirect('/admin/slot-picker?fixerr=' + encodeURIComponent(String(e.message || e)));
  }
}));

// ---------- Module 0 confirmation screen ----------
// The pipeline writes league_config.json from Sleeper, but nobody should trust
// an import they have not eyeballed. Overrides live in Blobs so a correction
// takes effect on the board immediately, and the same screen emits the file to
// commit so the next pipeline run agrees with what you see.
/* The keeper slate: edit it, see the consequence, lock it.
 *
 * Its own screen rather than a panel in the War Room, because it is used at a
 * different moment — the days before the draft, when keepers are still moving —
 * and because it has to be somewhere you can hand to a co-commissioner without
 * also handing over the board.
 *
 * The slate itself lives in localStorage on the client, deliberately: it is
 * edited minutes before a draft on the one device that matters, and a round
 * trip is a thing that can fail at exactly the wrong time. The server's job
 * here is only to name the seats, so the screen says "Richard" rather than
 * "Seat 7" when somebody is scanning it under time pressure.
 */
router.get('/keepers', aw(async (req, res) => {
  const season = H.currentSeason(req.world.seasons);
  const overrides = await getDoc('draft-config-overrides', {});
  const ownersBySlot = {};
  try {
    const draft = await H.draftState(season.year, req.world.owners);
    (draft.picks || []).forEach(p => {
      if (p.slot != null && p.owner_id) {
        const o = req.world.owners.find(x => x.id === p.owner_id);
        if (o) ownersBySlot[String(p.slot)] = o.display_name || o.name;
      }
    });
  } catch (e) {
    // No draft order claimed yet is normal preseason; seats stay numbered.
  }
  res.render('admin/keepers', { season, config: req.world.config, overrides, ownersBySlot });
}));

router.get('/draft-config', aw(async (req, res) => {
  const overrides = await getDoc('draft-config-overrides', {});
  res.render('admin/draft-config', { overrides, config: req.world.config });
}));

// ---------- Prediction ledger (Phase L1 — the Learning Seed) ----------
// Append-only, written AT DECISION TIME from the War Room. The contamination
// rule is architectural: this POST is the ONLY write path, and it stamps the
// decision time from the SERVER clock, so a prediction cannot be backdated to
// fit an outcome. Grading reads via GET and never writes.
const predledger = require('../predledger');

router.post('/api/ledger/predict', aw(async (req, res) => {
  const body = req.body || {};
  const season = body.season || H.currentSeason(req.world.seasons).year;
  try {
    const entry = await predledger.append(store, {
      kind: body.kind,
      method: body.method || null,
      season,
      pick: body.pick,
      build_at: body.build_at || null,
      client_at: body.client_at || null,
      payload: body.payload || {},
    });
    res.json({ ok: true, entry });
  } catch (e) {
    // Fail loudly: a rejected prediction is a bug to see, not to swallow.
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
}));

router.get('/api/ledger/predict', aw(async (req, res) => {
  const season = req.query.season || H.currentSeason(req.world.seasons).year;
  const entries = await predledger.readAll(store, season);
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, season: String(season), count: entries.length, entries });
}));

// ---------- A-1: personal draft prefs, synced across devices ----------
// One document per owner (targets/never/queue, sliders, overrides, rail-acks),
// same durable store as the ledger; localStorage is only the offline cache.
// Last-write-wins whole-document — the merge lives in src/prefs.js so tests
// and the client agree on who won.
const prefs = require('../prefs');

router.get('/api/prefs', aw(async (req, res) => {
  const d = await prefs.load(store, req.owner.id);
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, doc: d });
}));

router.post('/api/prefs', aw(async (req, res) => {
  const body = req.body || {};
  if (!body.updated_at) return res.status(400).json({ ok: false, error: 'updated_at required' });
  try {
    const winner = await prefs.save(store, req.owner.id, {
      prefs: body.prefs || {}, updated_at: String(body.updated_at),
      device: body.device || '',
    });
    res.json({ ok: true, doc: winner });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
}));

// ---------- Raw-forever archive (Phase L2 — the Learning Seed) ----------
// Immutable, append-only snapshots of what actually happened: the full Sleeper
// pick stream (all teams, timestamped), the board build the draft ran on, the
// final draft. Features recompute; raw is permanent. Content-hash deduped so a
// re-sync that changed nothing does not duplicate.
const rawarchive = require('../rawarchive');

router.post('/api/archive', aw(async (req, res) => {
  const body = req.body || {};
  const season = body.season || H.currentSeason(req.world.seasons).year;
  try {
    const result = await rawarchive.snapshot(store, {
      kind: body.kind, season, source_at: body.source_at || null, payload: body.payload || {},
    });
    res.json({ ok: true, deduped: result.deduped, seq: result.seq,
      snapshot: result.snapshot ? { id: result.snapshot.id, seq: result.snapshot.seq,
        kind: result.snapshot.kind, archived_at: result.snapshot.archived_at, hash: result.snapshot.hash } : null });
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e.message || e) });
  }
}));

router.get('/api/archive', aw(async (req, res) => {
  const season = req.query.season || H.currentSeason(req.world.seasons).year;
  res.set('Cache-Control', 'no-store');
  if (req.query.kind) {
    const rows = await rawarchive.readAll(store, season, req.query.kind);
    return res.json({ ok: true, season: String(season), kind: req.query.kind, count: rows.length, snapshots: rows });
  }
  // Default: a manifest of what raw data exists (cheap, no payloads).
  const manifest = await rawarchive.manifest(store, season);
  res.json({ ok: true, season: String(season), manifest });
}));

router.post('/draft-config', aw(async (req, res) => {
  const prev = await getDoc('draft-config-overrides', {});
  const next = Object.assign({}, prev);

  // Scoring + roster slot corrections arrive as scoring[key] / slot[key].
  const scoring = {}, slots = {};
  for (const [k, v] of Object.entries(req.body)) {
    const ms = k.match(/^scoring\[(.+)\]$/);
    const ml = k.match(/^slot\[(.+)\]$/);
    if (ms && v !== '') scoring[ms[1]] = parseFloat(v);
    if (ml && v !== '') slots[ml[1]] = parseInt(v, 10);
  }
  if (Object.keys(scoring).length) next.scoring = scoring;
  if (Object.keys(slots).length) next.roster_slots = slots;

  const num = (k, parse) => { const v = parse(req.body[k]); return Number.isFinite(v) ? v : undefined; };
  const teams = num('teams', x => parseInt(x, 10));
  const slot = num('my_draft_slot', x => parseInt(x, 10));
  if (teams) next.teams = teams;
  if (slot) next.my_draft_slot = slot;
  if (['snake', 'linear', 'third_round_reversal'].includes(req.body.draft_type)) next.draft_type = req.body.draft_type;

  // Keeper house rules — Sleeper never knows these.
  next.keepers = {
    count: parseInt(req.body.keeper_count, 10) || 3,
    // top_picks_flat is the model this league actually plays (K0): the k-th
    // keeper forfeits round k. It MUST be in this allow-list, or a re-confirm on
    // this screen silently reverts the board to original_round and every
    // forfeited-round number goes wrong.
    cost_model: ['original_round', 'fixed_round', 'escalator', 'no_cost', 'top_picks_flat'].includes(req.body.cost_model)
      ? req.body.cost_model : 'top_picks_flat',
    fixed_round: parseInt(req.body.fixed_round, 10) || undefined,
    escalator_rounds: parseInt(req.body.escalator_rounds, 10) || undefined,
    max_years: parseInt(req.body.max_years, 10) || 3,
    undrafted_rule: req.body.undrafted_rule === 'ineligible' ? 'ineligible' : 'assigned_round',
    undrafted_round: parseInt(req.body.undrafted_round, 10) || 10,
  };
  next.confirmed = true;
  next.confirmed_at = now();
  next.confirmed_by = req.owner.name;
  await setDoc('draft-config-overrides', next);
  res.redirect('/admin/draft-config?saved=1');
}));

// The corrected config as a file to commit, so the offline pipeline and the
// browser never disagree about the league's rules.
router.get('/draft-config.json', aw(async (req, res) => {
  const overrides = await getDoc('draft-config-overrides', {});
  res.setHeader('Content-Disposition', 'attachment; filename="league_config_overrides.json"');
  res.json(overrides);
}));

// Same-origin proxy for Sleeper, used only if the browser's direct call is
// blocked by CORS. Strictly allow-listed: read-only Sleeper GETs, nothing else.
const SLEEPER_PROXY_OK = /^\/(draft\/[\w-]+\/picks|draft\/[\w-]+|league\/[\w-]+\/drafts|state\/nfl)$/;
router.get('/sleeper-proxy', aw(async (req, res) => {
  const path = String(req.query.path || '');
  if (!SLEEPER_PROXY_OK.test(path)) {
    // This is US refusing, not Sleeper. Say so, because the old message
    // ("path not allowed") surfaced in the War Room as "Sleeper unreachable"
    // and sent somebody hunting Sleeper's status page for our own validation.
    const id = (path.match(/^\/draft\/([^/]*)/) || [])[1];
    console.warn('sleeper-proxy refused path:', path);
    return res.status(400).json({
      error: id
        ? `that draft ID doesn't look right ("${String(id).slice(0, 40)}") — paste just the number from sleeper.com/draft/nfl/<number>`
        : 'this site only proxies the draft endpoints, and that was not one of them',
    });
  }
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const upstream = await fetch(`https://api.sleeper.app/v1${path}`, {
      headers: { accept: 'application/json' }, signal: ac.signal,
    });
    clearTimeout(t);
    if (!upstream.ok) return res.status(upstream.status).json({ error: `sleeper ${upstream.status}` });
    res.setHeader('Cache-Control', 'no-store');
    res.json(await upstream.json());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
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
