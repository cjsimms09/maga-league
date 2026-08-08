const express = require('express');
const router = express.Router();
const H = require('../helpers');
const HIST = require('./history-data');   // the MFGA Archive — chronicle data engine
const L = require('../ledger');
const SB = require('../sidebets');
const BL = require('../betlogic');
const V = require('../venmo');
const sleeper = require('../sleeper');
const notify = require('../notify');
const crypto = require('crypto');
const { store, getDoc, setDoc, newId, now } = require('../data');
const { hashPassword, verifyPassword, requireLogin, aw } = require('../auth');
const { RULES, SCORING, ROSTER } = require('../seed-data');

// ---------- public: deploy health, NO league data ----------
// Everything CI's deploy verification and the pre-draft checklist need to trust
// the live site, and NOTHING that requires a login or leaks league data. Netlify
// injects COMMIT_REF at build time; storage_backend declares whether prod is on
// DURABLE Blobs (it must be — 'file' would mean ephemeral storage and silent
// data loss on redeploy). Public on purpose: credentials must never gate a
// health check. /api/version kept as an alias so an older poller keeps working.
function healthPayload() {
  return {
    ok: true,
    commit: process.env.COMMIT_REF || process.env.HEAD || null,
    branch: process.env.BRANCH || null,
    deploy_id: process.env.DEPLOY_ID || null,
    context: process.env.CONTEXT || null,         // 'production' on the live site
    build_at: process.env.BUILD_TIME || process.env.DEPLOY_TIME || null,
    storage_backend: store.backend(),             // 'blobs' (durable) | 'file' | 'uninitialized'
    now: now(),
  };
}
router.get('/api/health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(healthPayload());
});
router.get('/api/version', (req, res) => {        // alias — same public payload
  res.set('Cache-Control', 'no-store');
  res.json(healthPayload());
});

// ---------- public: the authoritative draft-config status ----------
// The build pipeline runs in CI off a committed league_config.json file, which
// is only ever a CACHE of what the commissioner confirmed on this site. The
// authority is the Blob written by the League Setup screen. This read-only,
// unauthenticated endpoint exposes just the confirmed flag (nothing sensitive)
// so the pipeline can fetch the real value at build time and stamp it into the
// artifact's provenance — the file copy can then never masquerade as authority.
router.get('/api/draft-config-status', aw(async (req, res) => {
  const o = await getDoc('draft-config-overrides', {});
  res.set('Cache-Control', 'no-store');
  res.json({
    confirmed: !!o.confirmed,
    confirmed_at: o.confirmed_at || null,
    cost_model: (o.keepers && o.keepers.cost_model) || null,
    keeper_count: (o.keepers && o.keepers.count) != null ? o.keepers.count : null,
    source: 'blob',
    served_at: now(),
  });
}));

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

// How many locker-room messages the home page carries. Enough to prove a
// conversation is happening; few enough that the chat does not become the page.
const CHAT_ON_HOME = 5;

// ---------- contact directory (contact-directory.md) ----------
// One record per owner — Venmo + email + phone — rendered by the shared card
// wherever a person appears. "Complete" means all three are on file.
function contactOf(o) {
  return { id: o.id, name: o.name, team_name: o.team_name || '',
    venmo: o.venmo || '', email: o.email || '', phone: o.phone || '' };
}
function contactMissingFields(o) {
  const m = [];
  if (!o || !o.venmo) m.push('Venmo');
  if (!o || !o.email) m.push('email');
  if (!o || !o.phone) m.push('phone');
  return m;
}

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

  // The locker room lives at the bottom of this page now. A tab nobody opens is
  // a tab nobody posts in; putting the last few messages under the standings —
  // with a box to reply — is the difference between a chat and a ghost town.
  const chatLatest = (await H.chatFeed(owners, CHAT_ON_HOME));
  const myBalance = bal[req.owner.id] ? bal[req.owner.id].balance : 0;
  // Which teams have side-bet money riding on them, so the standings can say so.
  const betMoney = SB.moneyOnTeams(await SB.all(), req.owner.id,
    id => (H.ownerById(owners, id) || {}).name || '?');
  res.render('dashboard', {
    season, payouts: H.payoutTable(season), buyins, weekly, awards, standings, draft,
    openVotes, CATEGORY_LABELS: H.CATEGORY_LABELS, myBalance,
    sleeperData: sData, sleeperStandings: sStandings, sleeperBoard: sBoard, roast,
    review, reviewWeek, wireRows, playoffTeams, chatLatest, betMoney, owners,
    // Venmo nag (venmo-handles.md §2): fires for a logged-in owner with no
    // handle; the commissioner also sees who is still missing theirs.
    venmoNag: V.needsNag(req.owner && world.owners.find(o => o.id === req.owner.id)),
    venmoMissing: (req.owner && req.owner.is_commissioner) ? V.missing(world.owners) : [],
    // Contact directory: the shared card's data source (login-gated), this
    // owner's own record + what's missing, and the commissioner's at-a-glance
    // incomplete list. Superset of the Venmo nag — covers email and phone too.
    contacts: owners.map(contactOf),
    myContact: contactOf(world.owners.find(o => o.id === req.owner.id) || req.owner),
    // Each owner is nagged for their OWN data only. The commissioner's aggregate
    // view lives in the Commissioner Console, not on the home page.
    contactNag: contactMissingFields(world.owners.find(o => o.id === req.owner.id)),
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

  // Side bets, all time. Shown here because it is funny, kept apart from the
  // winnings grid because it is not league money.
  const sbBets = await SB.all();
  const sbTallies = SB.tallies(sbBets, list);
  const sbSettled = sbBets.filter(b => b.status === 'settled');
  const sbTotal = sbSettled.reduce((n, b) => n + b.stake * (b.parties.length - b.winner_ids.length), 0);

  return { details, list: ranked, grid, years, totals, grand, shame,
           CATEGORY_LABELS: H.CATEGORY_LABELS,
           sbTallies, sbCount: sbBets.length, sbSettledCount: sbSettled.length, sbTotal };
}

// Which seasons have a written chapter committed under views/history/chapters/.
// Prose is generated once and reviewed for voice before it ships — this set is
// the switch that turns a chapter on. Add a year here when its chapter lands.
const CHAPTERS = new Set([2024]);

// Safe access to the archive engine: a data problem should render a readable
// error, not crash the request. Memoised inside history-data.build().
function archive() {
  return HIST.build();
}

// The History tab is now THE CHRONICLE. The old money/owners/records tabs still
// answer to ?section= so bookmarks, the /owners and /records redirects, and
// anything shared in the group chat keep working — they just aren't the front
// door anymore.
router.get('/history', aw(async (req, res) => {
  const legacy = ['money', 'owners', 'records'];
  if (legacy.includes(req.query.section)) {
    const section = req.query.section;
    const data = section === 'owners' ? await ownersSection(req)
      : section === 'records' ? await recordsSection(req)
      : await moneySection(req);
    return res.render('history', Object.assign({ section }, data));
  }
  const A = archive();
  res.render('history/index', { A, chapters: CHAPTERS });
}));

// A single season chapter — prose (when written) plus the season's whole record:
// standings + money, the weekly-high ledger, the bracket, the draft, superlatives.
router.get('/history/season/:year', aw(async (req, res) => {
  const A = archive();
  const year = Number(req.params.year);
  const season = A.byYear[year];
  if (!season) {
    return res.status(404).render('error', { title: 'No such season',
      message: `The ${req.params.year} chapter has not been written into the archive.` });
  }
  const chapterInclude = CHAPTERS.has(year) ? `history/chapters/${year}` : null;
  // required cast (§2) computed from the all-play instrument, plus the champion.
  const cast = seasonCast(season);
  res.render('history/season', { A, season, chapterInclude, cast, chapters: CHAPTERS });
}));

// The All-Time Records Book (the crown jewel).
router.get('/history/records', aw(async (req, res) => {
  res.render('history/records', { A: archive() });
}));

// The Money Board — all-time career earnings, ranked. The table that settles it.
router.get('/history/money', aw(async (req, res) => {
  res.render('history/money', { A: archive() });
}));

// The Amendments — the league's constitution: name lineage, buy-in ladder,
// payout revisions, the Rolls, and matters presently before the league.
// Reference material, moved off the /history doorway.
router.get('/history/amendments', aw(async (req, res) => {
  res.render('history/amendments', { A: archive() });
}));

// The Bad Beats Hall of Fame — auto-detected tragedies.
router.get('/history/badbeats', aw(async (req, res) => {
  res.render('history/badbeats', { A: archive() });
}));

// The Absurdity & Miracle Catalogue — every box score mined, organised by
// category, so the chapters have material waiting. A working reference page.
router.get('/history/catalogue', aw(async (req, res) => {
  res.render('history/catalogue', { A: archive() });
}));

// A franchise page — one owner, all time.
router.get('/history/franchise/:name', aw(async (req, res) => {
  const A = archive();
  const name = Object.keys(A.owners).find(n => n.toLowerCase() === String(req.params.name).toLowerCase());
  if (!name) {
    return res.status(404).render('error', { title: 'No such franchise',
      message: 'There is no owner by that name in the archive. The same ten men, a decade — check the spelling.' });
  }
  res.render('history/franchise', { A, owner: A.owners[name] });
}));

// The required cast for a modern season — champion + fraud/robbed/lucky/collapse,
// each from the honest instrument (all-play gap) so the roast is traceable (§2).
function seasonCast(season) {
  const aps = Object.values(season.allPlay);
  const byGap = [...aps].sort((a, b) => b.gap - a.gap);      // fraud first
  const fraud = byGap[0];
  const robbed = byGap[byGap.length - 1];
  const champRid = season.bracket && season.bracket.placements ? season.bracket.placements[1] : null;
  const champion = season.standings.find(s => s.roster_id === champRid) || null;
  const last = season.standings.find(s => s.rank === season.standings.length) || null;
  const streak = season.superlatives.streaks;
  return { fraud, robbed, champion, last, longestSkid: streak && streak.loss };
}

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
      // Summarised by entry TYPE, not by sign — see L.seasonSummary. Doing it
      // here means the chart and any future view share one definition.
      return { owner: o, balance: bal[o.id].balance, open: bal[o.id].open, entries,
               summary: L.seasonSummary(entries, season.year) };
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

  // Side bets live on this page but in their own section, because they are
  // finance-adjacent and emphatically not league money.
  const section = req.query.section === 'sidebets' ? 'sidebets' : 'money';
  const bets = await SB.all();
  const betNames = id => nameOf(id);
  const tallies = SB.tallies(bets, owners);
  // The ledger is the point: every bet you are in, chronological, with a
  // running net. A W-L record cannot tell a season-long \$200 bet from four \$20s.
  const sbLedger = SB.ledgerFor(bets, req.owner.id, nameOf);
  // THE TRACKER (side-bet-tracker.md): the owners x years grid, plus the three
  // drill-down axes — name (a career ledger), cell (owner+year), year (league-
  // wide). All three reuse the same derived layer; the view just picks which.
  const sbGrid = SB.gridByYear(bets, owners);
  const sbView = ['name', 'cell', 'year'].includes(req.query.sbview) ? req.query.sbview : null;
  const sbDrill = (() => {
    if (!sbView) return null;
    const oid = Number(req.query.owner) || null;
    const yr = Number(req.query.year) || null;
    if (sbView === 'name' && oid) {
      return { kind: 'name', owner_id: oid, name: nameOf(oid),
               ledger: SB.ledgerFor(bets, oid, nameOf) };
    }
    if (sbView === 'cell' && oid && yr) {
      return { kind: 'cell', owner_id: oid, name: nameOf(oid), year: yr,
               ledger: SB.ledgerFor(bets, oid, nameOf, { year: yr }) };
    }
    if (sbView === 'year' && yr) {
      return { kind: 'year', year: yr, league: SB.leagueLedgerForYear(bets, yr, nameOf) };
    }
    return null;
  })();
  // Who still owes whom, netted per person. This is the number that gets money
  // to actually move, so it sits on the owner card next to the league balance.
  const sbOwed = SB.settlementsFor(bets, viewCard ? viewCard.owner.id : req.owner.id, nameOf);
  // The side-bet tab is always about YOU, even if you are looking at somebody
  // else's ledger card on the money tab. Two different questions, two objects.
  const sbOwedMine = viewCard && viewCard.owner.id !== req.owner.id
    ? SB.settlementsFor(bets, req.owner.id, nameOf) : sbOwed;
  // The pool board wants the live standings order so "who picked whom" reads
  // as a standings table with the picks marked, not an arbitrary list.
  const { verdicts, order: liveOrder } = await gradeBets(bets, world, owners, nameOf);
  // When each open bet stops being acceptable. Shown on every proposal so the
  // person deciding can see the clock, not just discover it when they're late.
  const sBundle = await sleeper.bundle(world.config.sleeper_league_id);
  const gateCtx = {
    seasonStart: world.config.season_start,
    playoffWeek: sBundle && sBundle.league && sBundle.league.settings
      ? sBundle.league.settings.playoff_week_start : null,
  };
  const deadlines = {};
  for (const b of bets) deadlines[b.id] = BL.acceptDeadline(b, gateCtx);

  res.render('bank', {
    cards, season, totalOwedToLeague, totalLeagueOwes, viewCard, leagueEntries,
    TYPE_LABELS: L.TYPE_LABELS,
    section, bets, tallies, owners, betNames, sbLedger, sbOwed, sbOwedMine, verdicts, liveOrder,
    sbGrid, sbView, sbDrill,
    deadlines, late: req.query.late === '1',
    currentWeek: (await sleeper.bundle(world.config.sleeper_league_id) || {}).week || 1,
    BL, payDirectory: owners.filter(o => o.venmo || o.paypal || o.cashapp || o.zelle),
    V, ownerById: id => owners.find(o => o.id === Number(id)),
    // Contact directory: shared card data + this owner's own record for the edit
    // form. Same one-record store the home page reads.
    contacts: owners.map(contactOf), myContact: contactOf(world.owners.find(o => o.id === req.owner.id) || req.owner),
  });
}));

/**
 * Grade every locked bet the engine can reach an opinion on.
 *
 * The verdict is never applied — it is shown to the parties with its working,
 * and somebody presses the button. Sleeper corrects stats for days after a
 * game; a bet auto-settled on a number that later moves is precisely the
 * argument this feature exists to prevent.
 *
 * Cost control: only weeks referenced by LOCKED bets are fetched, deduped and
 * capped by betlogic.CFG.MAX_WEEK_FETCH, and each completed week is cached
 * permanently. A page with no live conditional bets makes no extra requests.
 */
async function gradeBets(bets, world, owners, nameOf) {
  const out = {};
  const gradeable = bets.filter(b => b.status === SB.STATUS.LOCKED);
  const hasPool = bets.some(b => b.format === 'pool' && b.status !== SB.STATUS.DECLINED);
  if (!gradeable.length && !hasPool) return { verdicts: out, order: [] };

  const leagueId = world.config.sleeper_league_id;
  const sMap = world.config.sleeper_map || {};
  const season = H.currentSeason(world.seasons);
  let sData = null, liveRows = [], weekNow = 1;
  try {
    sData = await sleeper.bundle(leagueId);
    if (sData) {
      liveRows = sleeper.standings(sData, sMap, owners);
      weekNow = sData.week || 1;
    }
  } catch (e) {
    console.error('bet grading: sleeper unreachable —', e.message);
  }

  const weekPoints = {};
  for (const wk of BL.weeksNeeded(gradeable, weekNow)) {
    try {
      const pts = await sleeper.weekPointsByOwner(leagueId, wk, sMap);
      if (pts) weekPoints[wk] = pts;
    } catch (e) { /* a missing week grades as "can't tell", which is honest */ }
  }

  // A shared title is a real outcome — 2022 split the trophy — and a pool where
  // each side held one of the co-champions is a push, not a tiebreak. Awards
  // are where that fact lives, same as the record book reads it.
  const champions = [];
  for (const a of L.awardsForYear(world.ledger, season.year)) {
    if (a.category === 'playoff_1'
        || (a.category === 'playoff_2' && /^Co-champion/i.test(a.desc || ''))) {
      champions.push(Number(a.owner_id));
    }
  }
  const ctx = BL.makeContext({
    season, liveRows, weekPoints, weekNow, owners,
    champions, seasonStart: world.config.season_start,
    weeklyHigh: (world.history.weekly || {})[String(season.year)] || [],
  });
  for (const b of gradeable) {
    try {
      out[b.id] = BL.evaluate(b, ctx, nameOf);
    } catch (e) {
      // A bet the engine chokes on must say so on the card, not vanish.
      out[b.id] = { decided: false, winner_ids: [], push: false,
        headline: 'The site could not grade this one — settle it by hand.',
        lines: [e.message] };
    }
  }
  return { verdicts: out, order: ctx.finalStandings || ctx.liveOrder };
}

// ---------- side bets ----------
// A separate set of books on purpose: see src/sidebets.js. Anyone can propose,
// everyone named has to accept, and none of it touches league money.
/**
 * Read the condition rows out of a submitted form.
 *
 * The builder posts parallel arrays (cond_test[], cond_subject[], …) because
 * that is what a plain HTML form with repeatable rows gives you without a
 * client-side framework, and this site deliberately has no build step. Rows
 * with no test selected are dropped — an empty row is somebody who opened the
 * builder and changed their mind, not an error worth refusing the whole bet
 * over.
 */
function parseConditions(body) {
  const arr = k => [].concat(body[k] || []);
  const tests = arr('cond_test');
  const out = [];
  for (let i = 0; i < tests.length; i++) {
    const test = String(tests[i] || '');
    if (!BL.TESTS[test]) continue;
    const spec = BL.TESTS[test];
    const when = spec.when.includes(String(arr('cond_when')[i])) ? String(arr('cond_when')[i]) : spec.when[0];
    const c = {
      id: 'c' + i,
      test,
      subject_id: Number(arr('cond_subject')[i]) || 0,
      when,
      week: Number(arr('cond_week')[i]) || null,
    };
    if (!c.subject_id) continue;
    if (spec.target === 'owner') {
      c.target_id = Number(arr('cond_target_owner')[i]) || 0;
      if (!c.target_id || c.target_id === c.subject_id) continue;   // a team cannot outscore itself
    } else if (spec.target === 'number') {
      c.target_number = parseFloat(arr('cond_target_number')[i]);
      if (!Number.isFinite(c.target_number)) continue;
    } else if (spec.target === 'place') {
      c.target_place = String(arr('cond_target_place')[i] || '');
      if (!BL.PLACES[c.target_place]) continue;
    }
    // A weekly test with no week is not a condition, it is half of one.
    if (c.when === 'week' && !c.week) continue;
    out.push(c);
  }
  return out;
}

const picksFrom = body => [].concat(body.picks || []).map(Number).filter(Boolean);

router.post('/sidebets', aw(async (req, res) => {
  const ids = [].concat(req.body.party || []).map(Number).filter(Boolean);
  const stake = parseFloat(req.body.stake);
  const format = req.body.format === 'pool' ? 'pool' : 'prop';
  const conditions = format === 'prop' ? parseConditions(req.body) : [];
  // A conditional bet writes its own terms if you did not — the sentence the
  // builder shows IS the bet, and retyping it in prose is busywork.
  const owners = H.activeOwners(req.world.owners);
  const nameOf = id => (H.ownerById(owners, id) || {}).name || '?';
  let terms = String(req.body.terms || '').trim();
  const openSlots = Number(req.body.open_slots) || 0;
  if (!terms) {
    terms = BL.betText({ format, conditions, logic: req.body.logic,
      pool_outcome: req.body.pool_outcome, terms: '' }, nameOf);
  }
  if (terms && Number.isFinite(stake) && stake > 0 && (ids.length || openSlots)) {
    try {
      const bet = await SB.propose({
        proposer_id: req.owner.id, party_ids: ids, terms, stake,
        position: String(req.body.position || '').trim(),
        picks: picksFrom(req.body),
        resolves: String(req.body.resolves || '').trim(),
        format, conditions, logic: req.body.logic, kind: String(req.body.kind || ''),
        // Ordered: the first rule that separates the field wins, the rest are
        // tiebreakers. Order in the form is order of evaluation.
        pool_rules: [].concat(req.body.pool_rules || []).map(String).filter(Boolean),
        picks_required: Number(req.body.picks_required) || 0,
        open_slots: openSlots,
      });
      // Nobody checks a website for a bet they do not know exists.
      const targets = owners.filter(o => ids.includes(o.id));
      notify.sideBetProposed(targets, bet, req.owner.name, terms).catch(() => {});
    } catch (e) { /* needs someone on the other side; the form enforces it too */ }
  }
  res.redirect('/bank?section=sidebets');
}));

/**
 * The deadline check, applied to every way of joining a bet.
 *
 * Kept in one function because there are two doors — accepting a named bet and
 * taking one off the board — and a rule enforced at one of them is not enforced
 * at all.
 */
async function tooLate(bet, req) {
  if (!bet) return null;
  const world = req.world;
  const sB = await sleeper.bundle(world.config.sleeper_league_id);
  const gate = BL.acceptDeadline(bet, {
    seasonStart: world.config.season_start,
    playoffWeek: sB && sB.league && sB.league.settings ? sB.league.settings.playoff_week_start : null,
  });
  if (!gate.open) return gate.reason;

  // The calendar is an approximation; points on the board are the fact. Any bet
  // that turns on THIS week dies the moment somebody scores in it — which is
  // what "expires when the first point is scored" actually means, and it is
  // earlier than kickoff+something in every case that matters.
  const weeks = (bet.conditions || [])
    .filter(c => c.when === 'week' && c.week).map(c => Number(c.week));
  if (bet.kind === 'matchup' && bet.week) weeks.push(Number(bet.week));
  if (!weeks.length) return null;

  const sData = await sleeper.bundle(world.config.sleeper_league_id);
  const nowWeek = (sData && sData.week) || 0;
  const earliest = Math.min(...weeks);
  // A week already behind us is closed by the deadline above; only the live one
  // needs the scoreboard consulted.
  if (earliest !== nowWeek) return null;
  // Anybody scoring anywhere means the week is under way. Not just this
  // matchup — a bet between two people whose players all play Sunday is still
  // a bet on a week that started on Thursday.
  const anyScore = (sData && Array.isArray(sData.matchups))
    && sData.matchups.some(m => (m.points || 0) > 0);
  if (anyScore && !(bet.created_at && new Date(bet.created_at) > BL.kickoffOf(earliest, world.config.season_start))) {
    return `Week ${earliest} is under way — there are points on the board. This one had to be accepted before anybody scored.`;
  }
  return null;
}

router.post('/sidebets/:id/accept', aw(async (req, res) => {
  const bet = await SB.get(req.params.id);
  const late = await tooLate(bet, req);
  if (late) {
    return res.redirect(req.body.back === 'team'
      ? '/team?late=1' : '/bank?section=sidebets&late=1');
  }
  await SB.accept(req.params.id, req.owner.id, req.owner.name, {
    position: String(req.body.position || '').trim(),
    picks: picksFrom(req.body),
  });
  res.redirect(req.body.back === 'team' ? '/team' : '/bank?section=sidebets');
}));

// Take the other side of a bet somebody posted to the market. Taking IS the
// handshake — the person who posted it gave theirs by posting.
router.post('/sidebets/:id/take', aw(async (req, res) => {
  const bet = await SB.get(req.params.id);
  const late = await tooLate(bet, req);
  if (late) return res.redirect('/bank?section=sidebets&late=1');
  await SB.take(req.params.id, req.owner.id, req.owner.name, {
    position: String(req.body.position || '').trim(),
    picks: picksFrom(req.body),
  });
  res.redirect('/bank?section=sidebets');
}));

// Your own side of a bet — picks, teams, the number you took. Yours only.
router.post('/sidebets/:id/position', aw(async (req, res) => {
  await SB.setPosition(req.params.id, req.owner.id,
    req.body.position != null ? String(req.body.position).trim() : null,
    req.body.picks != null ? picksFrom(req.body) : null);
  res.redirect('/bank?section=sidebets');
}));

// Tick off one loser→winner payment. Either side of that leg can mark it, which
// is the same trust model as the bet itself.
router.post('/sidebets/:id/leg/:legId', aw(async (req, res) => {
  await SB.markLeg(req.params.id, req.params.legId, req.owner.id, req.owner.name,
    req.body.paid !== '0');
  res.redirect(req.body.back === 'money' ? '/bank#top' : '/bank?section=sidebets');
}));

router.post('/sidebets/:id/decline', aw(async (req, res) => {
  await SB.decline(req.params.id, req.owner.id, req.owner.name);
  res.redirect('/bank?section=sidebets');
}));

router.post('/sidebets/:id/settle', aw(async (req, res) => {
  const bet = await SB.get(req.params.id);
  // Only someone in the bet can record its result — or the commissioner, who
  // ends up adjudicating anyway.
  if (bet && (SB.isParty(bet, req.owner.id) || req.owner.is_commissioner)) {
    const winners = [].concat(req.body.winner || []).map(Number).filter(Boolean);
    await SB.settle(req.params.id, winners, req.owner.id, req.owner.name, {
      push: req.body.push === '1',
      why: String(req.body.why || '').trim(),
    });
  }
  res.redirect('/bank?section=sidebets');
}));

/**
 * Settle a bet the way the engine called it.
 *
 * This is the confirm half of "the engine never settles a bet". The verdict is
 * recomputed here rather than trusted from the form — otherwise the winner ids
 * would be attacker-supplied, and the button would be a way to award yourself
 * anybody's money.
 */
router.post('/sidebets/:id/settle-auto', aw(async (req, res) => {
  const bet = await SB.get(req.params.id);
  if (bet && (SB.isParty(bet, req.owner.id) || req.owner.is_commissioner)) {
    const world = req.world;
    const owners = H.activeOwners(world.owners);
    const nameOf = id => (H.ownerById(owners, id) || {}).name || '?';
    const { verdicts } = await gradeBets([bet], world, owners, nameOf);
    const v = verdicts[bet.id];
    if (v && v.decided) {
      await SB.settle(bet.id, v.winner_ids, req.owner.id, req.owner.name,
        { push: v.push, why: v.headline });
    }
  }
  res.redirect('/bank?section=sidebets');
}));

/**
 * Where to send people money. Yours to set, everyone's to see.
 *
 * Handles, not account numbers: a Venmo handle is already public to anyone who
 * can search for you, so this is a convenience directory rather than anything
 * that needs protecting. Nothing here is a credential.
 */
router.post('/profile/pay', aw(async (req, res) => {
  // TWO writers, ONE record (data-spine): the home-page banner posts venmo
  // alone; the Finances form posts all four. V.applyProfileUpdate touches only
  // fields PRESENT in the body, so a banner save can never wipe the paypal or
  // zelle entered on the other surface. Every reader (How to Pay, settlement,
  // side-bet rows, the commissioner nag) renders from this same owner record.
  const world = req.world;
  const owner = world.owners.find(o => o.id === req.owner.id);
  if (owner) {
    V.applyProfileUpdate(owner, req.body);
    await setDoc('owners', world.owners);
  }
  res.redirect(req.body.back === 'home' ? '/' : '/bank#pay-directory');
}));

/**
 * Contact directory write path (contact-directory.md).
 *
 * Email and phone live on the ONE owner record, alongside the Venmo handle, and
 * every surface that shows a person reads from here. This route has its OWN
 * explicit allow-list — email and phone only — deliberately NOT routed through
 * venmo.js's four-field payment allow-list, so neither path can widen the other
 * by accident. Phone/email are PII: they render only in login-gated views and
 * never in an unauthenticated response (health/site-check payloads exclude them).
 */
function cleanPhone(v) {
  // Keep the characters a phone number legitimately uses; drop the rest.
  return String(v == null ? '' : v).replace(/[^\d+().\-\s]/g, '').trim().slice(0, 30);
}
router.post('/profile/contact', aw(async (req, res) => {
  const world = req.world;
  const owner = world.owners.find(o => o.id === req.owner.id);
  if (owner) {
    // Venmo (and the other payment handles, if present) go through venmo.js's
    // own four-field allow-list — calling it, never widening it.
    V.applyProfileUpdate(owner, req.body);
    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      const email = String(req.body.email || '').trim().toLowerCase().slice(0, 120);
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.redirect((req.body.back === 'home' ? '/' : '/bank') + '?contact=bademail');
      }
      owner.email = email;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'phone')) {
      owner.phone = cleanPhone(req.body.phone);
    }
    await setDoc('owners', world.owners);
  }
  res.redirect(req.body.back === 'home' ? '/' : '/bank#pay-directory');
}));

// ---------- buying out of a live bet ----------
// Re-offer a proposal whose ten days ran out. Proposer only.
router.post('/sidebets/:id/resend', aw(async (req, res) => {
  await SB.resend(req.params.id, req.owner.id, req.owner.name);
  res.redirect('/bank?section=sidebets');
}));

router.post('/sidebets/:id/buyout', aw(async (req, res) => {
  await SB.offerBuyout(req.params.id, req.owner.id, req.owner.name, {
    amount: req.body.amount,
    direction: req.body.direction === 'pay' ? 'pay' : 'receive',
    note: String(req.body.note || '').trim(),
  });
  res.redirect('/bank?section=sidebets');
}));

router.post('/sidebets/:id/buyout/accept', aw(async (req, res) => {
  await SB.acceptBuyout(req.params.id, req.owner.id, req.owner.name);
  res.redirect('/bank?section=sidebets');
}));

router.post('/sidebets/:id/buyout/clear', aw(async (req, res) => {
  await SB.clearBuyout(req.params.id, req.owner.id, req.owner.name);
  res.redirect('/bank?section=sidebets');
}));

router.post('/sidebets/:id/reopen', aw(async (req, res) => {
  const bet = await SB.get(req.params.id);
  if (bet && (SB.isParty(bet, req.owner.id) || req.owner.is_commissioner)) {
    await SB.reopen(req.params.id, req.owner.id, req.owner.name);
  }
  res.redirect('/bank?section=sidebets');
}));

router.post('/sidebets/:id/delete', aw(async (req, res) => {
  const bet = await SB.get(req.params.id);
  // Only the proposer (while nobody has accepted) or the commissioner.
  // The proposer can pull an offer back any time it is still just an offer —
  // that is what "rescind" means, and needing nobody to have accepted yet made
  // it impossible to withdraw exactly the bets worth withdrawing.
  const stillAnOffer = bet && [SB.STATUS.PROPOSED, SB.STATUS.OPEN].includes(bet.status);
  if (bet && (req.owner.is_commissioner
      || (bet.proposer_id === req.owner.id && stillAnOffer))) {
    await SB.remove(req.params.id);
  }
  res.redirect('/bank?section=sidebets');
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
  // This week's game, so the page answers "who am I playing" before it answers
  // "who is on my bench" — and so a bet against that opponent is one tap away.
  const matchup = sleeper.myMatchup(sData, world.config.sleeper_map || {}, viewOwner.id, owners);
  const betWindow = BL.matchupWindow(matchup);
  const nameOf = id => (H.ownerById(owners, id) || {}).name || '?';
  const allBets = await SB.all();
  // Bets your opponent has put in front of you for this week.
  const matchupPending = SB.awaiting(allBets, req.owner.id).filter(b => b.kind === 'matchup');
  // And what everyone else has riding on you, which you are not part of.
  const aboutMe = viewOwner.id === req.owner.id
    ? SB.betsAbout(allBets, req.owner.id, nameOf) : [];
  res.render('team', { viewOwner, owners, roster, matchup, betWindow,
    matchupPending, aboutMe, late: req.query.late === '1',
    // Roster is the default — it is what this page has always been, and it is
    // the half that works without a live matchup.
    section: req.query.section === 'week' ? 'week' : 'roster',
    weekNo: (matchup && matchup.week) || (sData && sData.week) || 1,
    configured: !!world.config.sleeper_league_id });
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
  // Posting from the home page returns you to the home page. Being teleported
  // into a different tab because you replied to a message is how people learn
  // not to reply.
  res.redirect(req.body.back === 'home' ? '/#locker' : '/chat#end');
}));

router.get('/rules', aw(async (req, res) => {
  const season = H.currentSeason(req.world.seasons);
  res.render('rules', { RULES, SCORING, ROSTER, season, payouts: H.payoutTable(season) });
}));

module.exports = router;
