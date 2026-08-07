const express = require('express');
const router = express.Router();
const H = require('../helpers');
const L = require('../ledger');
const sleeper = require('../sleeper');
const notify = require('../notify');
const crypto = require('crypto');
const { getDoc, setDoc, newId, now } = require('../data');
const { hashPassword, verifyPassword, requireLogin, aw } = require('../auth');
const { RULES, SCORING, ROSTER } = require('../seed-data');

// ---------- auth ----------
router.get('/login', (req, res) => {
  if (req.owner) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', aw(async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const owner = req.world.owners.find(o => (o.username === username || (o.email || '').toLowerCase() === username) && o.active);
  if (!owner || !verifyPassword(password, owner.password_hash)) {
    return res.status(401).render('login', { error: 'Wrong username or password. FAKE CREDENTIALS!' });
  }
  req.session.ownerId = owner.id;
  res.redirect(owner.must_change_password ? '/password' : '/');
}));

// ---------- self-service password reset (needs email configured) ----------
router.get('/forgot', (req, res) => {
  res.render('forgot', { sent: req.query.sent || null, error: null, emailOn: notify.configured() });
});

router.post('/forgot', aw(async (req, res) => {
  const who = String(req.body.username || '').trim().toLowerCase();
  const owner = req.world.owners.find(o => o.active && (o.username === who || (o.email || '').toLowerCase() === who));
  // Always report the same thing — never confirm whether an account exists.
  if (owner && owner.email && notify.configured()) {
    const token = crypto.randomBytes(24).toString('hex');
    await setDoc(`reset:${token}`, { owner_id: owner.id, expires: Date.now() + 60 * 60 * 1000 });
    await notify.passwordReset(owner, token);
  }
  res.redirect('/forgot?sent=1');
}));

router.get('/reset', aw(async (req, res) => {
  const rec = await getDoc(`reset:${req.query.token}`, null);
  if (!rec || rec.expires < Date.now()) {
    return res.status(400).render('forgot', { sent: null, emailOn: notify.configured(), error: 'That reset link is expired or invalid. Request a new one.' });
  }
  res.render('reset', { token: req.query.token, error: null });
}));

router.post('/reset', aw(async (req, res) => {
  const token = String(req.body.token || '');
  const rec = await getDoc(`reset:${token}`, null);
  if (!rec || rec.expires < Date.now()) {
    return res.status(400).render('forgot', { sent: null, emailOn: notify.configured(), error: 'That reset link is expired or invalid. Request a new one.' });
  }
  const pw = String(req.body.next || '');
  if (pw.length < 8 || pw !== req.body.confirm) {
    return res.status(400).render('reset', { token, error: 'Passwords must match and be at least 8 characters.' });
  }
  const owners = await getDoc('owners', []);
  const me = owners.find(o => o.id === rec.owner_id);
  if (me) {
    me.password_hash = hashPassword(pw);
    me.must_change_password = false;
    await setDoc('owners', owners);
  }
  await H.store.del(`reset:${token}`);
  res.redirect('/login');
}));

router.post('/logout', (req, res) => { req.session = null; res.redirect('/login'); });

router.get('/password', (req, res) => {
  if (!req.owner) return res.redirect('/login');
  res.render('password', { error: null, forced: !!req.owner.must_change_password, saved: req.query.saved || null });
});

router.post('/profile', aw(async (req, res) => {
  if (!req.owner) return res.redirect('/login');
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).render('password', { error: 'That email does not look right.', forced: false });
  }
  const owners = await getDoc('owners', []);
  const me = owners.find(o => o.id === req.owner.id);
  me.email = email;
  await setDoc('owners', owners);
  res.redirect('/password?saved=1');
}));

router.post('/password', aw(async (req, res) => {
  if (!req.owner) return res.redirect('/login');
  const { current, next: newPw, confirm } = req.body;
  const forced = !!req.owner.must_change_password;
  // On a forced first-login change the user proved the starter password
  // seconds ago at login — re-verifying it here only creates lockouts when
  // storage replicas lag, so it's skipped.
  if (!forced && !verifyPassword(String(current || ''), req.owner.password_hash)) {
    return res.status(400).render('password', { error: 'Current password is wrong.', forced });
  }
  if (!newPw || String(newPw).length < 8) {
    return res.status(400).render('password', { error: 'New password must be at least 8 characters.', forced });
  }
  if (newPw !== confirm) {
    return res.status(400).render('password', { error: 'New passwords do not match.', forced });
  }
  const owners = await getDoc('owners', []);
  const me = owners.find(o => o.id === req.owner.id);
  me.password_hash = hashPassword(String(newPw));
  me.must_change_password = false;
  await setDoc('owners', owners);
  res.redirect('/');
}));

// ---------- everything below requires login ----------
router.use(requireLogin);

router.get('/', aw(async (req, res) => {
  const world = req.world;
  const season = H.currentSeason(world.seasons);
  const owners = H.activeOwners(world.owners);
  const bal = L.balances(world.ledger, owners);

  // Buy-in status straight from the ledger.
  const buyins = owners.map(o => {
    const e = world.ledger.find(x => x.owner_id === o.id && x.type === 'buy_in' && x.year === season.year);
    return { owner: o, entry: e || null, paid: e ? e.settled : false, balance: bal[o.id] ? bal[o.id].balance : 0 };
  }).sort((a, b) => a.owner.name.localeCompare(b.owner.name));

  const weekly = L.weeklyForYear(world.ledger, season.year)
    .map(e => ({ ...e, name: (H.ownerById(owners, e.owner_id) || {}).name || '?' }));
  const awards = L.awardsForYear(world.ledger, season.year)
    .map(e => ({ ...e, name: (H.ownerById(owners, e.owner_id) || {}).name || '?' }));
  const standings = (season.standings || []).map((oid, i) => ({ rank: i + 1, name: (H.ownerById(owners, oid) || {}).name || '?' }));
  const draft = await H.draftState(season.year, owners);
  const openVotes = (await H.allVotes(owners, H.voteThreshold(world.config))).filter(v => v.status === 'open')
    .map(v => ({ ...v, myChoice: (v.ballots.find(b => b.owner_id === req.owner.id) || {}).choice || null }));

  // Sleeper live data (site works fine when unconfigured/unreachable).
  const sData = await sleeper.bundle(world.config.sleeper_league_id);
  if (sData && !Object.keys(world.config.sleeper_map || {}).length) {
    const auto = sleeper.autoMap(sData, owners);
    if (Object.keys(auto).length) {
      world.config.sleeper_map = auto;
      await setDoc('config', world.config);
    }
  }
  const sStandings = sleeper.standings(sData, world.config.sleeper_map || {}, owners);
  const sBoard = sleeper.scoreboard(sData);
  // Last completed week's mini-awards + the transaction wire.
  let review = null, reviewWeek = null, wireRows = [];
  if (sData) {
    reviewWeek = (sData.week || 1) - 1;
    if (reviewWeek >= 1) {
      const rm = await sleeper.matchupsForWeek(world.config.sleeper_league_id, reviewWeek);
      review = sleeper.weekReview(rm, sData);
    }
    const playersDb = await sleeper.players();
    wireRows = await sleeper.wire(world.config.sleeper_league_id, sData.week || 1, sData, playersDb);
  }
  const playoffTeams = (sData && sData.league.settings && sData.league.settings.playoff_teams) || 4;
  let roast = null;
  if (sStandings.length >= 4) {
    const last = sStandings[sStandings.length - 1];
    if (last.wins + last.losses >= 3) {
      roast = H.pickRandom(H.ROASTS).replace('{name}', last.owner_name || last.team);
    }
  }

  const chatLatest = (await H.chatFeed(owners, 3));
  const myBalance = bal[req.owner.id] ? bal[req.owner.id].balance : 0;
  res.render('dashboard', {
    season, payouts: H.payoutTable(season), buyins, weekly, awards, standings, draft,
    openVotes, CATEGORY_LABELS: H.CATEGORY_LABELS, myBalance,
    sleeperData: sData, sleeperStandings: sStandings, sleeperBoard: sBoard, roast,
    review, reviewWeek, wireRows, playoffTeams, chatLatest,
  });
}));

// ---------- league history: money, owners, record book ----------
// These were three tabs reading the same helpers and answering one question.
// /owners and /records now redirect into the merged page so old links, phone
// bookmarks and anything shared in the group chat keep working.
router.get('/owners', (req, res) => res.redirect('/history?section=owners'));
router.get('/records', (req, res) => res.redirect('/history?section=records'));

async function ownersSection(req) {
  const world = req.world;
  const list = H.activeOwners(world.owners);
  const grid = H.winningsGrid(world);
  const totals = H.careerTotals(grid, list);
  const { champs, bowls } = H.accolades(world);
  const ranked = [...list].sort((a, b) => totals[b.id] - totals[a.id]);
  // Sleeper team name per owner (cached bundle; fails soft).
  const teams = {};
  const sData = await sleeper.bundle(world.config.sleeper_league_id);
  if (sData) {
    for (const [rosterId, oid] of Object.entries(world.config.sleeper_map || {})) {
      teams[oid] = sleeper.teamName(sData.users, sData.rosters, Number(rosterId));
    }
  }
  // Career W-L: frozen pre-Sleeper baseline + live Sleeper era (when synced).
  const uMap = sleeper.userMap(sData, world.config.sleeper_map || {});
  const recs = await sleeper.records(world.config.sleeper_league_id, uMap, list);
  const era = H.sleeperEraByOwner(recs, uMap);
  const records = {};
  for (const o of list) records[o.id] = H.careerRecord(o, era[o.id]);
  return { list: ranked, grid, years: H.gridYears(grid), champs, bowls, totals, teams, records };
}

async function recordsSection(req) {
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const sData = await sleeper.bundle(world.config.sleeper_league_id);
  const uMap = sleeper.userMap(sData, world.config.sleeper_map || {});
  const recs = await sleeper.records(world.config.sleeper_league_id, uMap, owners);
  return { recs, configured: !!world.config.sleeper_league_id };
}

async function moneySection(req) {
  const world = req.world;
  const owners = world.owners;
  const list = H.activeOwners(owners);
  const grid = H.winningsGrid(world);
  const totals = H.careerTotals(grid, list);
  const ranked = [...list].sort((a, b) => totals[b.id] - totals[a.id]);
  const years = H.gridYears(grid);
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);

  const nameOf = id => (H.ownerById(owners, id) || {}).name || '?';
  const seasonsSorted = Object.values(world.seasons).sort((a, b) => b.year - a.year);
  const details = [];
  for (const s of seasonsSorted) {
    const y = s.year;
    const legacyAwards = world.history.awards[y];
    const awards = legacyAwards
      ? legacyAwards.map(a => ({ category: a.category, name: nameOf(a.owner_id), amount: a.amount, note: a.note }))
      : L.awardsForYear(world.ledger, y).map(e => ({ category: e.category, name: nameOf(e.owner_id), amount: e.amount, note: '' }));
    const legacyWeekly = world.history.weekly[y];
    const weekly = legacyWeekly
      ? legacyWeekly.map((oid, i) => ({ week: i + 1, name: nameOf(oid), amount: 100 }))
      : L.weeklyForYear(world.ledger, y).map(e => ({ week: e.week, name: nameOf(e.owner_id), amount: e.amount }));
    const standings = (s.standings || []).map((oid, i) => ({ rank: i + 1, name: nameOf(oid) }));
    const draftDoc = await getDoc(`draft:${y}`, { order: [] });
    const picks = draftDoc.order.filter(p => p.slot != null).map(p => ({ slot: p.slot, name: nameOf(p.owner_id) }))
      .sort((a, b) => a.slot - b.slot);
    details.push({ season: s, awards, weekly, standings, picks });
  }

  // Wall of Shame: last-place finishers (they bought the plaque).
  const shame = seasonsSorted
    .filter(s => s.status === 'complete' && (s.standings || []).length)
    .map(s => ({ year: s.year, name: nameOf(s.standings[s.standings.length - 1]) }));

  return { details, list: ranked, grid, years, totals, grand, shame, CATEGORY_LABELS: H.CATEGORY_LABELS };
}

router.get('/history', aw(async (req, res) => {
  const section = ['money', 'owners', 'records'].includes(req.query.section)
    ? req.query.section : 'money';
  // Only build what is being shown. The record book walks the whole Sleeper
  // history, which is not a call worth making to render the money grid.
  const data = section === 'owners' ? await ownersSection(req)
    : section === 'records' ? await recordsSection(req)
    : await moneySection(req);
  res.render('history', Object.assign({ section }, data));
}));

// ---------- The Tab (money) ----------
router.get('/bank', aw(async (req, res) => {
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const season = H.currentSeason(world.seasons);
  const bal = L.balances(world.ledger, owners);
  const cards = owners
    .map(o => {
      const entries = world.ledger.filter(e => e.owner_id === o.id)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return { owner: o, balance: bal[o.id].balance, open: bal[o.id].open, entries };
    })
    .sort((a, b) => (b.owner.id === req.owner.id) - (a.owner.id === req.owner.id) || a.owner.name.localeCompare(b.owner.name));
  const totalOwedToLeague = cards.reduce((s, c) => s + Math.min(c.balance, 0), 0);
  const totalLeagueOwes = cards.reduce((s, c) => s + Math.max(c.balance, 0), 0);

  // Whose ledger sits at the top. Yours by default; clicking a name in the
  // league ledger below swaps it, which is how you get from "who owes what" to
  // "why does he owe that" without a separate page.
  const viewId = parseInt(req.query.owner, 10) || req.owner.id;
  const viewCard = cards.find(c => c.owner.id === viewId) || cards.find(c => c.owner.id === req.owner.id);

  // The league ledger: every transaction this season, all ten owners, one
  // chronological list. This is the view of the books, and it is what the
  // per-owner cards are a filter of — not the other way round.
  const nameOf = id => (H.ownerById(world.owners, id) || {}).name || '?';
  const leagueEntries = world.ledger
    .filter(e => Number(e.year) === Number(season.year))
    .map(e => ({ ...e, owner_name: nameOf(e.owner_id) }))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  res.render('bank', {
    cards, season, totalOwedToLeague, totalLeagueOwes, viewCard, leagueEntries,
    TYPE_LABELS: L.TYPE_LABELS,
  });
}));

// ---------- draft ----------
router.get('/draft', aw(async (req, res) => {
  const world = req.world;
  const season = H.currentSeason(world.seasons);
  const owners = H.activeOwners(world.owners);
  const draft = await H.draftState(season.year, owners);
  const mine = await getDoc(`keepers:${season.year}:${req.owner.id}`, { players: [] });
  const myKeepers = mine.players.map((p, i) => ({ player_name: p, round: i + 1 }));
  const allKeepers = await H.keepersForYear(season.year, owners);
  res.render('draft', { season, draft, myKeepers, allKeepers, error: req.query.error || null });
}));

router.post('/draft/pick', aw(async (req, res) => {
  const world = req.world;
  const season = H.currentSeason(world.seasons);
  if (!season.draft_open) return res.redirect('/draft?error=' + encodeURIComponent('The draft room is closed.'));
  const doc = await getDoc(`draft:${season.year}`, { order: [] });
  const current = doc.order.find(p => p.slot == null);
  if (!current) return res.redirect('/draft?error=' + encodeURIComponent('All spots are taken.'));
  if (current.owner_id !== req.owner.id) {
    const who = (H.ownerById(world.owners, current.owner_id) || {}).name || 'someone else';
    return res.redirect('/draft?error=' + encodeURIComponent(`It is ${who}'s turn to pick, not yours.`));
  }
  const slot = parseInt(req.body.slot, 10);
  const taken = new Set(doc.order.filter(p => p.slot != null).map(p => p.slot));
  if (!(slot >= 1 && slot <= doc.order.length) || taken.has(slot)) {
    return res.redirect('/draft?error=' + encodeURIComponent('That draft spot is not available.'));
  }
  current.slot = slot;
  await setDoc(`draft:${season.year}`, doc);
  const next = doc.order.find(p => p.slot == null);
  if (next) {
    const nextOwner = H.ownerById(world.owners, next.owner_id);
    if (nextOwner) notify.draftTurn(nextOwner).catch(() => {});
  }
  res.redirect('/draft');
}));

router.post('/draft/keepers', aw(async (req, res) => {
  const season = H.currentSeason(req.world.seasons);
  if (season.keepers_locked) return res.redirect('/draft?error=' + encodeURIComponent('Keepers are locked for this season.'));
  const players = [req.body.k1, req.body.k2, req.body.k3]
    .map(p => String(p || '').trim()).filter(Boolean).slice(0, 3);
  await setDoc(`keepers:${season.year}:${req.owner.id}`, { players });
  res.redirect('/draft');
}));

// ---------- votes & rule-change proposals ----------
router.get('/votes', aw(async (req, res) => {
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const threshold = H.voteThreshold(world.config);
  const votes = (await H.allVotes(owners, threshold)).map(v => ({
    ...v, myChoice: (v.ballots.find(b => b.owner_id === req.owner.id) || {}).choice || null,
  }));
  const punishments = await H.punishmentWall(owners, req.owner.id);
  res.render('votes', {
    open: votes.filter(v => v.status === 'open'),
    closed: votes.filter(v => v.status === 'closed'),
    electorate: owners.length, threshold,
    proposed: req.query.proposed || null,
    punishments, punishmentsLocked: !!req.world.config.punishments_locked,
  });
}));

// Anyone in the league can put a measure on the ballot.
router.post('/votes/propose', aw(async (req, res) => {
  const question = String(req.body.question || '').trim().slice(0, 200);
  const description = String(req.body.description || '').trim().slice(0, 1000);
  if (!question) return res.redirect('/votes');
  const id = newId();
  const vote = { id, question, description, proposer_id: req.owner.id, status: 'open', created_at: now(), closed_at: null };
  await setDoc(`vote:${id}`, vote);
  notify.newVote(req.world.owners, vote, req.owner.name).catch(() => {});
  res.redirect('/votes?proposed=1');
}));

// ---------- punishment wall ----------
router.post('/punishments', aw(async (req, res) => {
  if (req.world.config.punishments_locked) return res.redirect('/votes#punishments');
  const text = String(req.body.text || '').trim().slice(0, 300);
  if (text) {
    const id = newId();
    await setDoc(`punish:${id}`, { id, text, proposer_id: req.owner.id, created_at: now() });
  }
  res.redirect('/votes#punishments');
}));

router.post('/punishments/:id/vote', aw(async (req, res) => {
  if (req.world.config.punishments_locked) return res.redirect('/votes#punishments');
  const idea = await getDoc(`punish:${req.params.id}`, null);
  if (idea) await setDoc(`pvote:${req.owner.id}`, { punishment_id: idea.id, cast_at: now() });
  res.redirect('/votes#punishments');
}));

// Trash talk on the record: comments on any measure, open or closed.
router.post('/votes/:id/comment', aw(async (req, res) => {
  const vote = await getDoc(`vote:${req.params.id}`, null);
  const text = String(req.body.text || '').trim().slice(0, 500);
  if (vote && text) {
    await setDoc(`vcomment:${vote.id}:${newId()}`, { owner_id: req.owner.id, text, created_at: now() });
  }
  res.redirect('/votes#vote-' + req.params.id);
}));

router.post('/votes/:id/ballot', aw(async (req, res) => {
  const vote = await getDoc(`vote:${req.params.id}`, null);
  const choice = req.body.choice;
  if (vote && vote.status === 'open' && (choice === 'yes' || choice === 'no')) {
    await setDoc(`ballot:${vote.id}:${req.owner.id}`, { choice, cast_at: now() });
  }
  res.redirect('/votes');
}));

// ---------- my team (live roster + stats from Sleeper) ----------
router.get('/team', aw(async (req, res) => {
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const viewId = parseInt(req.query.owner, 10) || req.owner.id;
  const viewOwner = H.ownerById(owners, viewId) || req.owner;
  const sData = await sleeper.bundle(world.config.sleeper_league_id);
  const roster = await sleeper.rosterView(sData, world.config.sleeper_map || {}, viewOwner.id);
  res.render('team', { viewOwner, owners, roster, configured: !!world.config.sleeper_league_id });
}));

// ---------- the locker room ----------
router.get('/chat', aw(async (req, res) => {
  const owners = H.activeOwners(req.world.owners);
  const feed = await H.chatFeed(owners);
  await setDoc(`chat-seen:${req.owner.id}`, { at: now() });
  res.render('chat', { feed });
}));

router.post('/chat', aw(async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 500);
  if (text) await setDoc(`chat:${newId()}`, { owner_id: req.owner.id, text, created_at: now() });
  res.redirect('/chat#end');
}));

router.get('/rules', aw(async (req, res) => {
  const season = H.currentSeason(req.world.seasons);
  res.render('rules', { RULES, SCORING, ROSTER, season, payouts: H.payoutTable(season) });
}));

module.exports = router;
