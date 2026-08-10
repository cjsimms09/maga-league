const express = require('express');
const router = express.Router();
const H = require('../helpers');
const HIST = require('./history-data');   // the MFGA Archive — chronicle data engine
const H2H = require('./h2h');              // all-time head-to-head, from the box scores
const CHAMPS = require('../champs');       // the crown — defending champion, derived
const RIV = require('../rivalries');       // rivalry game-of-the-week billing (+ German egg)
const LO = require('./lineup');            // the lineup optimizer engine (validated vs L0)
const MOVE = require('./standings-movement'); // week-over-week rank arrows (dormant pre-season)
const PE = require('./pickem');            // league pick'em — pick every game, tracked forever
const DISPATCH = require('./dispatch');    // transient popups — awards / power poll / this-week-in-history
const PO = require('./playoffs');          // folded columns — playoff odds/movement, clinch/elim, matchup leverage
const TT = require('./trashtalk');         // trash talk attached to a specific game, permanent + archived
const WW = require('./whatwatch');         // what-to-watch — the Sunday/Monday sweat meter + what each owner needs
const MK = require('./marks');             // auto badges — GOAT on Mahomes' owner, Chiefs mark on KC players
const RIVN = require('./rivalries');       // named rivalries (German derby, Dylan-Sam, Bates-Richard)
const SET = require('./settlement');       // the settlement report — who pays whom, with Venmo
const L = require('../ledger');
const SB = require('../sidebets');
const BL = require('../betlogic');
const V = require('../venmo');
const sleeper = require('../sleeper');
const notify = require('../notify');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { store, getDoc, setDoc, newId, now } = require('../data');
const { hashPassword, verifyPassword, requireLogin, requireCommissioner, aw } = require('../auth');
const { RULES, SCORING, ROSTER } = require('../seed-data');

// ---------- home-screen PWA: rendered pages must never be pinned ----------
// The installed iOS app is chromeless — no address bar, no pull-to-refresh — so
// there is no user gesture that can force a reload. iOS WebKit HEURISTICALLY
// caches any 200 text/html that carries no Cache-Control and reuses it, which
// pins the standalone app to whatever build it first loaded. That is the
// reported "seeing old versions / not working": every page here rendered with
// NO Cache-Control, so the phone cached the HTML and never came back for the new
// deploy. Declaring the pages uncacheable makes the browser revalidate on every
// launch, so a fresh deploy reaches the installed instance. Static assets
// (icons, css, manifest) are served by the CDN under netlify.toml's own
// long-cache rules and never reach this router, so they keep their caching. The
// JSON /api/* routes below set 'no-store' explicitly AFTER this runs, so they
// stay stricter — this only supplies the default the HTML pages were missing.
router.use((req, res, next) => { res.set('Cache-Control', 'no-cache, must-revalidate'); next(); });

// ---------- THE CROWN — defending champion on every league-visible page ----------
// Derived from the champions roll (never hand-set; transfers on its own in January).
// Injected here on the MEMBER router only, so it lights the crown across standings,
// matchup, money board, franchise, locker room and the trophy — and never in the
// war room, which hangs off the /admin router. Templates read `defendingChamps`
// (names wearing the crown), `titleCounts` (dynasty), and `viewerIsChamp` (the
// logged-in owner's own-screen flourish); the _owner_badges partial renders them.
router.use((req, res, next) => {
  try {
    const defs = CHAMPS.defendingChampions();
    res.locals.defendingChamps = defs;
    res.locals.titleCounts = CHAMPS.titleCounts();
    res.locals.reigningYear = CHAMPS.reigningYear();
    res.locals.viewerIsChamp = !!(req.owner && req.owner.name && defs.includes(req.owner.name));
  } catch (e) {
    res.locals.defendingChamps = []; res.locals.titleCounts = {};
    res.locals.reigningYear = null; res.locals.viewerIsChamp = false;
  }
  next();
});

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

// ---------- THE SUNDAY ALERT — cron fire (secret-gated, session-less) ----------
// The weekly workflow hits this before kickoff. Not login-gated (a cron has no
// session), but gated by SUNDAY_ALERT_KEY so only the scheduler can trigger it.
// It only EMAILS the commissioner their start/sit calls — it never returns the
// analysis, so the secret guards the trigger, not the content. No-ops off-season
// (no live lineup), so a year-round schedule is harmless.
router.get('/api/sunday-alert', aw(async (req, res) => {
  const secret = process.env.SUNDAY_ALERT_KEY || process.env.CRON_SECRET;
  if (!secret || req.query.key !== secret) return res.status(403).json({ ok: false, error: 'forbidden' });
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const commish = world.owners.find(o => o.is_commissioner && o.active);
  if (!commish) return res.json({ ok: true, sent: 0, note: 'no commissioner' });
  const { live, band, weekNo } = await liveOptimizeFor(world, owners, commish);
  if (!live) return res.json({ ok: true, sent: 0, note: 'no live lineup (off-season / Sleeper down)' });
  const alert = LO.sundayAlert(live, { week: weekNo, band });
  const r = await notify.sundayAlert(commish, alert).catch(() => ({ skipped: true }));
  res.json({ ok: true, sent: (r && !r.skipped) ? 1 : 0, week: weekNo, hasCalls: alert.hasCalls });
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

// THE PWA ENTRY POINT. The home-screen app launches at start_url "/" with an
// empty cookie jar (iOS gives standalone apps their own), so the very first
// launch is unauthenticated. iOS standalone sits on the navy background_color
// splash forever if the launch URL REDIRECTS instead of rendering — which is
// exactly the "solid navy screen" report: "/" was 302-ing to /login (via the
// requireLogin guard below), and the installed app never followed the redirect.
// So "/" must return a rendered 200 in BOTH states: the login form when signed
// out, the dashboard (the handler further down) when signed in. Signed-in →
// fall through. This sits ABOVE requireLogin so the signed-out case never hits
// the redirect.
router.get('/', (req, res, next) => {
  if (!req.owner) return res.render('login', { error: null });
  next();
});

// STANDALONE DIAGNOSTIC — a completely self-contained page: no login, no
// redirect, no external CSS/JS, so it renders even if everything else is broken.
// It's the "way to see the error" for the home-screen app: launch it (or add it
// to the home screen) and it proves the shell can load at all, and reports the
// display mode, whether the session cookie survived into the standalone cookie
// jar, and the running build. If THIS shows navy too, the failure is the shell
// load itself (network/cache), not auth or a redirect.
router.get('/standalone', (req, res) => {
  const build = process.env.COMMIT_REF || process.env.HEAD || 'dev';
  res.type('html').send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>MFGA — standalone check</title>
<style>
  html,body{margin:0;background:#0c1c36;color:#f7f6f2;font-family:system-ui,-apple-system,sans-serif}
  .wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:1.5rem;text-align:center}
  .ok{font-size:1.4rem;font-weight:800;color:#8ef0b6}
  .row{font-size:.95rem;opacity:.9} .row b{color:#ffd873}
  a.btn{display:inline-block;margin-top:.6rem;padding:.7rem 1.3rem;border-radius:10px;background:#f5c445;color:#0c1c36;font-weight:800;text-decoration:none}
</style></head><body><div class="wrap">
  <div class="ok">✅ MFGA app shell loaded</div>
  <div class="row">If you can read this in the installed app, the page renders — the problem is not the shell.</div>
  <div class="row">Display mode: <b id="dm">checking…</b></div>
  <div class="row">iOS standalone: <b id="ios">checking…</b></div>
  <div class="row">Session cookie present: <b id="ck">checking…</b></div>
  <div class="row">Build: <b>${build.slice(0, 12)}</b></div>
  <a class="btn" href="/">Go to the League Office →</a>
</div><script>
  try{
    var sa = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    document.getElementById('dm').textContent = sa ? 'standalone (home-screen app)' : 'browser tab';
    document.getElementById('ios').textContent = (('standalone' in navigator) ? (navigator.standalone ? 'yes' : 'no') : 'n/a');
    document.getElementById('ck').textContent = /(^|;\\s*)maga_league=/.test(document.cookie) ? 'yes' : 'no (first launch is normal)';
  }catch(e){ document.getElementById('dm').textContent = 'JS error: ' + e.message; }
</script></body></html>`);
});

// ---------- everything below requires login ----------
router.use(requireLogin);

// How many locker-room messages the home page carries. Enough to prove a
// conversation is happening; few enough that the chat does not become the page.
const CHAT_ON_HOME = 5;

// ---------- contact directory (contact-directory.md) ----------
// One record per owner — Venmo + email + phone — rendered by the shared card
// wherever a person appears. "Complete" means all three are on file.
// Nationality flag from ONE source — the engine's GERMAN set — never hardcoded
// per page. David and Marian are German; everyone else American.
function flagOf(name) { return HIST.GERMAN.has(name) ? '🇩🇪' : '🇺🇸'; }
function contactOf(o) {
  return { id: o.id, name: o.name, team_name: o.team_name || '',
    venmo: o.venmo || '', email: o.email || '', phone: o.phone || '',
    flag: flagOf(o.name) };
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
  // The weekly-high made visible: the harvested winning band (renders always),
  // and — once games are on — THIS week's live race for the $100.
  const whBand = LO.weeklyHighBand();
  let whRace = null;
  if (sData && Array.isArray(sData.matchups)) {
    const map = world.config.sleeper_map || {};
    const nameOfId = id => (H.ownerById(owners, id) || {}).name || '?';
    const scores = sData.matchups
      .map(m => ({ owner: Number(map[String(m.roster_id)]), pts: Number(m.points) || 0 }))
      .filter(s => s.owner);
    if (scores.some(s => s.pts > 0)) {
      const top = Math.max(...scores.map(s => s.pts));
      const leader = scores.find(s => s.pts === top);
      const mine = scores.find(s => s.owner === req.owner.id);
      whRace = { week: sData.week, top, leaderName: nameOfId(leader.owner),
        mine: mine ? mine.pts : null, iLead: mine && mine.pts === top };
    }
  }
  // Last completed week's mini-awards + the transaction wire.
  let review = null, reviewWeek = null, wireRows = [];
  // Rank-movement arrows: dormant until a previous week exists to compare, then
  // computed by subtracting the latest completed week from the cumulative
  // standings (no snapshot to keep in sync). { owner_id: {delta, prevRank, curRank} }
  let rankMoves = {};
  if (sData) {
    reviewWeek = (sData.week || 1) - 1;
    if (reviewWeek >= 1) {
      const rm = await sleeper.matchupsForWeek(world.config.sleeper_league_id, reviewWeek);
      review = sleeper.weekReview(rm, sData);
      rankMoves = MOVE.rankMovement(sStandings, rm);
    }
    const playersDb = await sleeper.players();
    wireRows = await sleeper.wire(world.config.sleeper_league_id, sData.week || 1, sData, playersDb);
  }
  const playoffTeams = (sData && sData.league.settings && sData.league.settings.playoff_teams) || 4;

  // THE FOLDED COLUMNS — the playoff picture, folded into the standings: odds
  // with week-over-week movement + clinch/elimination markers. Derived (a seeded
  // Monte-Carlo off records + points-for; labelled B's estimate, swaps for A's
  // champ model later) and DORMANT until the season produces records, so it
  // renders nothing pre-season. Odds are snapshotted per week to anchor the
  // movement arrow to a real week-over-week change. Defensive: never break home.
  let playoffPicture = null;
  try {
    const playedRows = sStandings.filter(r => r.owner_id != null
      && ((r.wins || 0) + (r.losses || 0) + (r.ties || 0)) > 0);
    if (sData && playedRows.length >= 4) {
      const rows = playedRows.map(r => ({ owner_id: r.owner_id, wins: r.wins, losses: r.losses, pf: r.pf }));
      const regWeeks = (sData.league.settings && sData.league.settings.playoff_week_start)
        ? sData.league.settings.playoff_week_start - 1 : (season.weeks || 14);
      const gamesLeft = PO.gamesRemaining(sData.week, regWeeks);
      const cut = playoffTeams;
      const odds = PO.simOdds(rows, gamesLeft, cut);
      // Latest-in-week snapshot; movement compares against last week's snapshot.
      await setDoc(`playoff-odds:${season.year}:${sData.week}`, { week: sData.week, odds, saved_at: now() });
      const prev = await getDoc(`playoff-odds:${season.year}:${sData.week - 1}`, null);
      playoffPicture = PO.picture(rows, gamesLeft, cut, prev ? prev.odds : null);
    }
  } catch (e) { /* the folded columns are a bonus; the standings render without them */ }

  let roast = null;
  if (sStandings.length >= 4) {
    const last = sStandings[sStandings.length - 1];
    if (last.wins + last.losses >= 3) {
      roast = H.pickRandom(H.ROASTS).replace('{name}', last.owner_name || last.team);
    }
  }

  // RIVALRY GAME OF THE WEEK — from this week's live pairings. Rank them (the
  // marquee grudge outranks the friendlies) and bill the top one on the home page.
  // Silent off-season / when Sleeper is unreachable; it lights up on its own.
  let rivalryOfWeek = null, rivalryMore = 0;
  if (sData && Array.isArray(sData.matchups)) {
    const map = world.config.sleeper_map || {};
    const nameOfRoster = rid => (H.ownerById(owners, Number(map[String(rid)])) || {}).name || null;
    const byGame = {};
    for (const m of sData.matchups) {
      if (m.matchup_id == null) continue;
      (byGame[m.matchup_id] = byGame[m.matchup_id] || []).push(nameOfRoster(m.roster_id));
    }
    const pairs = Object.values(byGame).filter(g => g.length === 2 && g[0] && g[1]).map(g => ({ a: g[0], b: g[1] }));
    const hits = RIV.billingForSlate(pairs);
    if (hits.length) {
      const top = hits[0];
      const rec = H2H.headToHead(H2H.userIdForName(top.pair.a), H2H.userIdForName(top.pair.b));
      rivalryOfWeek = Object.assign({}, top, { notable: RIV.notableFrom(rec, top.pair.a, top.pair.b) });
      rivalryMore = hits.length - 1;
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

  // THE DISPATCH — transient popups (weekly awards / power poll / this-week-in-
  // history). Generated from data already in hand (no extra network), archived
  // for the chronicle, then shown ONCE per owner and dismissed. Never persists on
  // the page: only this owner's undismissed items render, and dismissing clears
  // them for good. Wrapped defensively — a popup must never break the home page.
  let dispatches = [];
  try {
    const map = world.config.sleeper_map || {};
    const nameOfRoster = rid => (H.ownerById(owners, Number(map[String(rid)])) || {}).name || null;
    const weeklyHistory = {};
    for (const [yr, ids] of Object.entries((world.history && world.history.weekly) || {})) {
      weeklyHistory[yr] = (ids || []).map(id => (H.ownerById(owners, id) || {}).name || null);
    }
    const items = DISPATCH.generate({
      season: season.year, week: (sData && sData.week) || 1, reviewWeek, review,
      nameOfRoster, standings: sStandings, weeklyHistory,
    });
    for (const it of items) { try { await DISPATCH.archive(it); } catch (e) { /* archive is best-effort */ } }
    dispatches = DISPATCH.pending(items, await DISPATCH.getSeen(req.owner.id));
  } catch (e) { /* the dispatch is a bonus; the dashboard renders without it */ }
  res.render('dashboard', {
    season, payouts: H.payoutTable(season), buyins, weekly, awards, standings, draft,
    openVotes, CATEGORY_LABELS: H.CATEGORY_LABELS, myBalance,
    sleeperData: sData, sleeperStandings: sStandings, sleeperBoard: sBoard, roast,
    whBand, whRace, rivalryOfWeek, rivalryMore,
    review, reviewWeek, wireRows, playoffTeams, chatLatest, betMoney, owners, rankMoves, dispatches, playoffPicture,
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
    // Owner flags: nationality + the GOAT auto-folded onto whoever rosters
    // Mahomes (moves on its own as rosters change).
    flags: MK.ownerFlags(owners, flagOf, MK.goatOwnerId(sData, world.config.sleeper_map || {})),
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
// DERIVED FROM DISK, not a hardcoded list: a chapter turns on the moment its
// prose file (views/history/chapters/<year>.ejs) is committed — no second edit,
// nothing to forget when a season seals. A hardcoded [2023,2024,2025] was a
// silent-stale trap (and one the no-season-literals guard's patterns don't
// even catch, since a bare year in an array isn't an identifier/date/fallback).
// Memoised: the files are committed content, they don't appear at runtime.
let _chapterYears = null;
function chapterYears() {
  if (_chapterYears) return _chapterYears;
  const dirs = [
    path.join(__dirname, '..', '..', 'views', 'history', 'chapters'),
    path.join(process.cwd(), 'views', 'history', 'chapters'),
    '/var/task/views/history/chapters',
  ];
  const years = new Set();
  for (const d of dirs) {
    try {
      for (const f of fs.readdirSync(d)) {
        const m = /^(\d{4})\.ejs$/.exec(f);
        if (m) years.add(Number(m[1]));
      }
    } catch (e) { /* try the next candidate root */ }
    if (years.size) break;
  }
  // Only memoise a non-empty result: an empty read (e.g. views not yet resolved
  // on a cold function) must not pin the chapter switch permanently off.
  if (years.size) _chapterYears = years;
  return years;
}

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
  // Top of the chronicle timeline = the current season, derived (not a literal),
  // so a new season appears the moment it opens instead of waiting on an edit.
  const _season = H.currentSeason(req.world.seasons);
  const topYear = (_season && _season.year) || new Date().getUTCFullYear();
  res.render('history/index', { A, chapters: chapterYears(), topYear });
}));

// The Age Before Records — a single ceremonial chapter for the pre-Sleeper years
// (2016-2022). Money and champions only; no box scores survive, and the page
// says so rather than faking detail.
router.get('/history/early', aw(async (req, res) => {
  res.render('history/early', { A: archive() });
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
  const chapterInclude = chapterYears().has(year) ? `history/chapters/${year}` : null;
  // required cast (§2) computed from the all-play instrument, plus the champion.
  const cast = seasonCast(season);
  res.render('history/season', { A, season, chapterInclude, cast, chapters: chapterYears() });
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
  // Resolve the league owner_id so "bet him" from a franchise page can pre-fill
  // the opponent (propose-from-anywhere). Archive owners key on name only.
  const leagueOwners = H.activeOwners(req.world.owners);
  const leagueOwner = leagueOwners.find(o => o.name === name);
  res.render('history/franchise', { A, owner: A.owners[name],
    betOwnerId: (leagueOwner && leagueOwner.id !== req.owner.id) ? leagueOwner.id : null,
    betOwnerName: name });
}));

// A RIVALRY page — every game two owners ever played, the full head-to-head that
// the matchup card and the franchise grid both click through to. League-visible:
// this is the record of what happened (results), not a recommendation tool, so it
// sits behind the member login like the rest of the history, not the commish gate.
// Name-keyed (?a=Cory&b=David) so both entry points — one holding owner_ids, one
// holding names — reach the same page; names are the stable key across seasons.
router.get('/rivalry', aw(async (req, res) => {
  const A = archive();
  const canon = q => Object.keys(A.owners).find(n => n.toLowerCase() === String(q || '').toLowerCase()) || null;
  const aName = canon(req.query.a) || (req.owner && canon(req.owner.name));
  const bName = canon(req.query.b);
  if (!aName || !bName || aName === bName) {
    return res.status(404).render('error', { title: 'No such rivalry',
      message: 'Pick two different owners from the same ten men — e.g. /rivalry?a=Cory&b=David.' });
  }
  const rec = H2H.headToHead(H2H.userIdForName(aName), H2H.userIdForName(bName));
  const viewerIsA = !!(req.owner && req.owner.name && req.owner.name.toLowerCase() === aName.toLowerCase());
  // One-tap bet from the rivalry page: resolve b's league id when it isn't the viewer.
  const leagueOwners = H.activeOwners(req.world.owners);
  const bLeague = leagueOwners.find(o => o.name === bName);
  res.render('rivalry', {
    A, rec, aName, bName, oa: A.owners[aName], ob: A.owners[bName], viewerIsA,
    betOwnerId: (bLeague && req.owner && bLeague.id !== req.owner.id) ? bLeague.id : null,
  });
}));

// THE TROPHY — the league's cup, rendered, with every champion engraved below in
// order from 2016. League-visible (results, not analysis); tapping a plate opens
// that season (a written chapter from 2023, the Age-Before-Records page before).
router.get('/trophy', aw(async (req, res) => {
  const A = archive();
  res.render('trophy', { A, champions: A.champions || [] });
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

  // THE SETTLEMENT REPORT — minimal who-pays-whom to square everyone to zero,
  // computed from the same balances, with the payee's Venmo attached. The
  // machine that tracks the money writes the invoice. (The Annual emits this as
  // the sealed-season artifact; here it renders live off current balances.)
  const settlement = SET.settlementReport(
    owners.map(o => ({ owner_id: o.id, name: o.name, net: bal[o.id] ? bal[o.id].balance : 0 })),
    id => { const o = H.ownerById(owners, id); const h = o && V.handle(o); return h ? { handle: h, url: `https://venmo.com/u/${h}` } : null; });

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

  // COMMISSIONER-ONLY franchise-pool advisor (the tools rule: analysis is the
  // commissioner's). The VONA math is ready, but it needs A's MEASURED league-
  // championship probabilities. Cory (2026-08-09): do NOT show a placeholder that
  // looks authoritative — better "odds pending" than a number nobody measured. So
  // until a real champProb model is wired here, the advisor renders a PENDING
  // state, not fabricated percentages. When A ships it, replace `champModel` below.
  const poolAdvice = {};
  if (req.owner.is_commissioner) {
    const PA = require('./pooladvisor');
    const nameOfId = id => (H.ownerById(owners, id) || {}).name || '?';
    const champModel = null;   // ← A's measured { owner_id: p(win league) } goes here
    for (const b of bets) {
      if (b.format === 'pool' && b.draft && SB.isParty(b, req.owner.id)) {
        poolAdvice[b.id] = champModel
          ? PA.advise({ draft: b.draft, myId: req.owner.id, champProb: champModel, nameOf: nameOfId, source: 'model' })
          : { pending: true };
      }
    }
  }

  res.render('bank', {
    poolAdvice,
    // Propose-from-anywhere: a ?betvs=<id> link (matchup, standings, franchise)
    // pre-selects that opponent in the bet builder.
    prefillParty: Number(req.query.betvs) || null,
    cards, season, totalOwedToLeague, totalLeagueOwes, viewCard, leagueEntries, settlement,
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
    flags: MK.ownerFlags(owners, flagOf,
      MK.goatOwnerId(await sleeper.bundle(world.config.sleeper_league_id), world.config.sleeper_map || {})),
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
// Parse a JSON string from a form field without ever throwing (a bad body must
// never 500 the log write). Returns the parsed value, or the raw string, or null.
function safeJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch (e) { return String(v).slice(0, 2000); }
}

// Franchise-pool draft order: whoever finished HIGHER in the most recent
// completed season picks first (computed, not entered). Returns the ordered
// bettor ids and the human "why" the draft room shows.
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function poolDraftOrder(world, owners, aId, bId) {
  const nameOf = id => (H.ownerById(owners, id) || {}).name || '?';
  // The archive carries the real per-season standings (world.seasons.standings is
  // empty in the store). Use the most recent completed season with standings.
  let s = null;
  try {
    const A = HIST.build();
    const years = Object.keys(A.byYear || {}).map(Number).sort((x, y) => y - x);
    for (const y of years) { const ss = A.byYear[y]; if (ss && (ss.standings || []).length) { s = ss; break; } }
  } catch (e) { s = null; }
  const rankOf = name => { if (!s) return null; const row = (s.standings || []).find(r => r.name === name); return row ? row.rank : null; };
  const ra = rankOf(nameOf(aId)), rb = rankOf(nameOf(bId));
  let first = aId, second = bId, why;
  if (ra != null && rb != null) {
    if (rb < ra) { first = bId; second = aId; }
    why = `${nameOf(first)} picks first — finished ${ordinal(rankOf(nameOf(first)))} to ${nameOf(second)}'s ${ordinal(rankOf(nameOf(second)))} in ${s.year}.`;
  } else {
    why = `${nameOf(first)} picks first (proposer's edge — no prior-season standings to rank by).`;
  }
  return { order: [first, second], why };
}

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
      // A pool bet is a DRAFT: every league franchise is in play and NOBODY
      // picks at propose time — the alternating draft opens on accept. So the
      // teams-in-play are all active owners, and the proposer's picks are ignored.
      const poolTeams = format === 'pool' ? owners.map(o => o.id) : [];
      const poolWins = format === 'pool'
        ? (String(req.body.pool_outcome || '').trim() || 'holds the eventual league champion')
        : '';
      const bet = await SB.propose({
        proposer_id: req.owner.id, party_ids: ids, terms, stake,
        position: String(req.body.position || '').trim(),
        picks: format === 'pool' ? [] : picksFrom(req.body),
        resolves: String(req.body.resolves || '').trim(),
        format, conditions, logic: req.body.logic, kind: String(req.body.kind || ''),
        // Ordered: the first rule that separates the field wins, the rest are
        // tiebreakers. Order in the form is order of evaluation.
        pool_rules: [].concat(req.body.pool_rules || []).map(String).filter(Boolean),
        picks_required: Number(req.body.picks_required) || 0,
        open_slots: openSlots,
        pool_teams: poolTeams, pool_wins: poolWins,
      });
      // Nobody checks a website for a bet they do not know exists.
      const targets = owners.filter(o => ids.includes(o.id));
      notify.sideBetProposed(targets, bet, req.owner.name, terms).catch(() => {});
    } catch (e) { /* needs someone on the other side; the form enforces it too */ }
  }
  // The matchup page sends people back to it, not the finance page — the bet was
  // made in the flow of "who am I playing", so that is where the confirmation lands.
  if (req.body.back === 'matchup') {
    return res.redirect('/matchup?sent=1' + (req.body.party ? '&opp=' + Number(req.body.party) : ''));
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
  const accepted = await SB.accept(req.params.id, req.owner.id, req.owner.name, {
    position: String(req.body.position || '').trim(),
    picks: picksFrom(req.body),
  });
  // A pool bet is a DRAFT: the moment both are in, open the franchise draft with
  // the order computed from the prior season's finish (higher finisher first).
  if (accepted && accepted.format === 'pool' && accepted.status === SB.STATUS.LOCKED
      && !accepted.draft && accepted.parties.length >= 2) {
    const owners = H.activeOwners(req.world.owners);
    const [aId, bId] = accepted.parties.map(p => p.owner_id);
    const { order, why } = poolDraftOrder(req.world, owners, aId, bId);
    await SB.startPoolDraft(accepted.id, order, why);
  }
  res.redirect(req.body.back === 'team' ? '/team' : '/bank?section=sidebets');
}));

// One franchise-draft pick. Must be your turn; the team leaves the shared pool.
router.post('/sidebets/:id/draft-pick', aw(async (req, res) => {
  await SB.poolDraftPick(req.params.id, req.owner.id, Number(req.body.team));
  res.redirect('/bank?section=sidebets#bet-' + req.params.id);
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

// The bet's own back-link: a declare/confirm/dispute done from the matchup page
// returns there; everywhere else lands on the side-bet book.
function betBack(req) {
  return req.body.back === 'matchup' ? '/matchup' : (req.body.back === 'team' ? '/team' : '/bank?section=sidebets');
}

// ── DECLARE → CONFIRM → DISPUTE — the settling flow ──────────────────────────
// Either party declares the outcome; the OTHER confirms or disputes. Nothing
// moves money until a confirm, and a dispute is recorded, never adjudicated.
router.post('/sidebets/:id/declare', aw(async (req, res) => {
  const bet = await SB.get(req.params.id);
  if (bet && SB.isParty(bet, req.owner.id)) {
    const winners = [].concat(req.body.winner || []).map(Number).filter(Boolean);
    await SB.declareResult(req.params.id, req.owner.id, req.owner.name, {
      winner_ids: winners, push: req.body.push === '1', why: String(req.body.why || '').trim(),
    });
  }
  res.redirect(betBack(req));
}));

router.post('/sidebets/:id/confirm', aw(async (req, res) => {
  const bet = await SB.get(req.params.id);
  if (bet && SB.isParty(bet, req.owner.id)) {
    await SB.confirmResult(req.params.id, req.owner.id, req.owner.name);
  }
  res.redirect(betBack(req));
}));

router.post('/sidebets/:id/dispute', aw(async (req, res) => {
  const bet = await SB.get(req.params.id);
  if (bet && SB.isParty(bet, req.owner.id)) {
    await SB.disputeResult(req.params.id, req.owner.id, req.owner.name, String(req.body.why || '').trim());
  }
  res.redirect(betBack(req));
}));

/**
 * AUTO-SETTLE, redesigned: where Sleeper objectively decides the outcome, the
 * site OFFERS the verdict by DECLARING it — it does not settle. Both parties
 * still confirm. Never settle silently (Cory, side-bet §5). The verdict is
 * recomputed here, never trusted from the form, so the winner ids can't be
 * attacker-supplied. The commissioner keeps the direct /settle override for
 * adjudicating a dispute.
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
      // DECLARE the Sleeper verdict (source-tagged), then both parties confirm.
      await SB.declareResult(bet.id, req.owner.id, req.owner.name,
        { winner_ids: v.winner_ids, push: v.push, why: v.headline, source: 'sleeper' });
    }
  }
  res.redirect(betBack(req));
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

// ---------- the matchup, up close (dedicated page) ----------
// The team page answers "who am I playing" in passing; this page is that
// question and only that question: the opponent, the all-time head-to-head, and
// a one-tap bet against them — the bet lands in the side-bet ledger with both
// parties named and OPEN (unsettled), settled straight-up when the week ends.
//
// The per-player Sleeper points, the projections, and this week's high-point
// band are Session A's data (parked in sleeper.js). This page RESERVES their
// slots and renders cleanly without them, so A's numbers drop in with no reflow:
// `players`, `proj`, and `highBand` are read defensively and shown only when
// present — see views/matchup.ejs.
router.get('/matchup', aw(async (req, res) => {
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const me = req.owner;
  const sData = await sleeper.bundle(world.config.sleeper_league_id);
  const liveMatchup = sleeper.myMatchup(sData, world.config.sleeper_map || {}, me.id, owners);

  // Opponent: this week's live opponent when Sleeper is reachable; otherwise an
  // explicit ?opp= pick, so the page — and its head-to-head — works off-season,
  // before the season starts, and in the sandbox where Sleeper is unreachable.
  let opp = (liveMatchup && liveMatchup.opp && liveMatchup.opp.owner) ? liveMatchup.opp.owner : null;
  const live = !!opp;

  // A SPECIFIC game can be opened by pair (?a=&b=) — the scoreboard links every
  // card that way. If the viewer is one of the two, they get the full
  // participant view against the other side; if the viewer is NOT in that game,
  // they get a read-only SPECTATOR view of that exact pairing (its all-time
  // head-to-head + score + trash thread) instead of the old bug where a
  // viewer-relative ?opp= silently reframed it as "you vs one of them."
  const aParam = parseInt(req.query.a, 10) || null;
  const bParam = parseInt(req.query.b, 10) || null;
  let spectator = null, pairOtherId = null;
  if (aParam && bParam && aParam !== bParam && H.ownerById(owners, aParam) && H.ownerById(owners, bParam)) {
    if (me.id === aParam || me.id === bParam) pairOtherId = (me.id === aParam ? bParam : aParam);
    else spectator = { A: H.ownerById(owners, aParam), B: H.ownerById(owners, bParam) };
  }

  const oppParam = pairOtherId || parseInt(req.query.opp, 10) || null;
  if (!opp && oppParam && oppParam !== me.id) opp = H.ownerById(owners, oppParam) || null;

  const weekNo = (liveMatchup && liveMatchup.week) || (sData && sData.week) || 1;
  const betWindow = BL.matchupWindow(liveMatchup);

  // owner -> stable Sleeper user_id. Live bundle is authoritative when present;
  // the harvest-backed name map is the offline fallback (both proven to agree).
  let invUserMap = null;
  if (sData) {
    const um = sleeper.userMap(sData, world.config.sleeper_map || {});   // { user_id: owner_id }
    invUserMap = {};
    for (const [uid, oid] of Object.entries(um)) invUserMap[oid] = uid;
  }
  const uidOf = (o) => (invUserMap && invUserMap[o.id]) || H2H.userIdForName(o.name, o.alias);

  // SPECTATOR VIEW — a game the viewer isn't in, opened from the scoreboard.
  // Read-only: the two owners' live score, their all-time head-to-head, and the
  // trash thread welded to that game (visible but not postable — you can't talk
  // trash in a game you're not playing). None of the me-relative machinery (bet,
  // pick'em strip, stakes, starters, your weekly-high) applies, so we return
  // before computing any of it.
  if (spectator) {
    const { A, B } = spectator;
    const map = world.config.sleeper_map || {};
    let aPts = null, bPts = null;
    if (sData && Array.isArray(sData.matchups)) {
      for (const m of sData.matchups) {
        const oid = Number(map[String(m.roster_id)]);
        if (oid === A.id) aPts = Math.round((Number(m.points) || 0) * 100) / 100;
        if (oid === B.id) bPts = Math.round((Number(m.points) || 0) * 100) / 100;
      }
    }
    const specRecord = H2H.headToHead(uidOf(A), uidOf(B));
    const seasonY = (H.currentSeason(world.seasons) || {}).year || new Date().getFullYear();
    let specTrash = [];
    const specGameId = TT.gameId(A.id, B.id);
    try { specTrash = await TT.forGame(seasonY, weekNo, specGameId); } catch (e) { /* thread is a bonus */ }
    const nameOfS = id => (H.ownerById(owners, id) || {}).name || '?';
    return res.render('matchup-spectator', {
      me, A, B, aPts, bPts, record: specRecord, weekNo,
      live: (aPts != null || bPts != null),
      trash: specTrash, nameOf: nameOfS,
      goatId: MK.goatOwnerId(sData, map),
      configured: !!world.config.sleeper_league_id,
    });
  }

  const record = opp ? H2H.headToHead(uidOf(me), uidOf(opp)) : null;

  // RIVALRY GAME OF THE WEEK — bill the matchup when these two have a real history.
  // The record is already computed (A-side = me), so the billing facts come free.
  let rivalry = null;
  if (opp) {
    const riv = RIV.billingFor(me.name, opp.name);
    if (riv) rivalry = Object.assign({}, riv, { notable: RIV.notableFrom(record, me.name, opp.name) });
  }

  // A-lane data, read defensively: present => render; absent => a labelled slot.
  const perPlayer = (liveMatchup && liveMatchup.players) || null;   // A supplies
  const proj = (liveMatchup && liveMatchup.proj) || null;           // A supplies
  const highBand = (liveMatchup && liveMatchup.highBand) || null;   // A supplies (richer, live projections)

  // The weekly-high TARGET, served now from the harvested band (a RESULT: what it
  // has historically taken to win the $100 — the same band the home page shows),
  // plus THIS week's live race off the scoreboard. This lit the panel that used to
  // sit dark waiting on A's richer live band; when A's highBand lands it wins.
  const whBand = LO.weeklyHighBand();
  let whRace = null;
  if (sData && Array.isArray(sData.matchups)) {
    const map = world.config.sleeper_map || {};
    const nm = id => (H.ownerById(owners, id) || {}).name || '?';
    const scores = sData.matchups
      .map(m => ({ owner: Number(map[String(m.roster_id)]), pts: Number(m.points) || 0 }))
      .filter(s => s.owner);
    if (scores.some(s => s.pts > 0)) {
      const top = Math.max(...scores.map(s => s.pts));
      const leader = scores.find(s => s.pts === top);
      const mineS = scores.find(s => s.owner === me.id);
      whRace = { week: sData.week, top, leaderName: nm(leader.owner),
        mine: mineS ? mineS.pts : null, iLead: mineS && mineS.pts === top };
    }
  }

  const nameOf = id => (H.ownerById(owners, id) || {}).name || '?';

  // TRASH TALK — the thread welded to THIS game (season + week + owner pair),
  // permanent and archived. Loaded only when there's an opponent to talk about.
  let trash = [], trashGameId = null;
  if (opp) {
    const seasonY = (H.currentSeason(world.seasons) || {}).year || new Date().getFullYear();
    trashGameId = TT.gameId(me.id, opp.id);
    try { trash = await TT.forGame(seasonY, weekNo, trashGameId); } catch (e) { /* thread is a bonus */ }
  }

  // A compact pick'em hook — the matchup screen is where people already think
  // about the week, so it points them at the league-wide picks (boards skipped;
  // this is just the CTA + lock state, kept cheap).
  let pickem = null;
  try {
    const pc = await pickemContext(world, me, { wantBoards: false });
    pickem = { weekNo: pc.weekNo, locked: pc.locked, lockAt: pc.lockAt,
      games: pc.games.length, picksMade: pc.picksMade };
  } catch (e) { /* the strip is a bonus; never let it break the matchup page */ }

  // WHAT THIS MATCHUP IS WORTH — one line: how much your playoff odds swing on a
  // win vs a loss this week (the folded columns' leverage). Derived, dormant
  // until there are records to run; defensive so it never breaks the page.
  let stakes = null;
  try {
    const sStand = sleeper.standings(sData, world.config.sleeper_map || {}, owners)
      .filter(r => r.owner_id != null && ((r.wins || 0) + (r.losses || 0) + (r.ties || 0)) > 0);
    if (sData && sStand.length >= 4) {
      const rows = sStand.map(r => ({ owner_id: r.owner_id, wins: r.wins, losses: r.losses, pf: r.pf }));
      const regWeeks = (sData.league.settings && sData.league.settings.playoff_week_start)
        ? sData.league.settings.playoff_week_start - 1 : 14;
      const gamesLeft = PO.gamesRemaining(sData.week, regWeeks);
      const cut = (sData.league.settings && sData.league.settings.playoff_teams) || 4;
      const lev = PO.matchupLeverage(rows, gamesLeft, cut, me.id);
      if (lev) stakes = lev;
    }
  } catch (e) { /* leverage is a bonus */ }

  res.render('matchup', {
    me, owners, opp, live, weekNo, matchup: liveMatchup, betWindow, record, rivalry,
    perPlayer, proj, highBand, whBand, whRace, pickem, stakes, trash, trashGameId,
    goatId: MK.goatOwnerId(sData, world.config.sleeper_map || {}),
    configured: !!world.config.sleeper_league_id,
    late: req.query.late === '1', sent: req.query.sent === '1',
    nameOf,
  });
}));

// ---------- PICK'EM — pick every game, every week, remembered forever ----------
// League-visible (a pick is a RESULT, not a tool — ACCESS-RULE.md): everyone
// picks a winner for each of the week's five games, the picks LOCK at the first
// kickoff, the split goes public once locked ("7 of 10 took Michael"), and the
// season/all-time accuracy boards — including the Hall of Shame that names the
// worst picker — sit right here where the league already argues. The engine is
// src/routes/pickem.js; this is the HTTP surface, same split as the optimizer.

// Everything the pick'em pages need, gathered once. Shared by GET /pickem and
// the compact strip the matchup page shows.
async function pickemContext(world, me, { wantBoards = true } = {}) {
  const owners = H.activeOwners(world.owners);
  const season = H.currentSeason(world.seasons);
  const seasonYear = season ? season.year : new Date().getFullYear();
  const leagueId = world.config.sleeper_league_id;
  const map = world.config.sleeper_map || {};
  const seasonStart = world.config.season_start || null;

  const sData = await sleeper.bundle(leagueId);
  const weekNo = (sData && sData.week) || 1;
  const anyScore = PE.anyScoreOnBoard(sData);
  const locked = PE.isLocked({ week: weekNo, seasonStart, anyScore });
  const lockAt = PE.lockAt(weekNo, seasonStart);

  // Freeze (or refresh, while unlocked) this week's slate so scoring never has
  // to re-reach Sleeper and a late schedule change can't rewrite picked games.
  const liveGames = PE.weekGames(sData, map, owners);
  const games = await PE.ensureSlate(seasonYear, weekNo, liveGames, { locked });

  const myPicks = await PE.getMyPicks(seasonYear, weekNo, me.id);
  const nameOf = id => (H.ownerById(owners, id) || {}).name || `#${id}`;
  const myGame = games.find(g => g.a.id === me.id || g.b.id === me.id) || null;

  // Live points for THIS week, straight off the scoreboard — provisional game
  // leaders while the week is in play (final grading uses the cached week points).
  let livePts = null;
  if (sData && Array.isArray(sData.matchups)) {
    livePts = {};
    for (const m of sData.matchups) {
      const oid = map[String(m.roster_id)];
      if (oid != null) livePts[String(oid)] = Math.round((m.points || 0) * 100) / 100;
    }
  }

  // The split + who-backed-whom is public only after lock — before that a pick
  // is private, or the last picker just copies the crowd.
  let allPicks = [], splits = {}, backers = [], liveResults = {};
  if (locked) {
    allPicks = await PE.allPicksForWeek(seasonYear, weekNo);
    for (const g of games) {
      splits[g.id] = { ...PE.gameSplit(g, allPicks), line: PE.splitLine(g, allPicks, nameOf) };
      const res = livePts ? PE.gameResult(g, livePts) : null;
      if (res) liveResults[g.id] = res;
    }
    if (myGame) backers = PE.backedAgainst(myGame, me.id, allPicks, nameOf);
  }

  const ctx = {
    owners, seasonYear, weekNo, locked, lockAt, anyScore, seasonStart,
    games, myPicks, myGame, splits, backers, allPicks, liveResults, livePts,
    configured: !!leagueId, nameOf,
    picksMade: Object.keys(myPicks).length,
    goatId: MK.goatOwnerId(sData, map),
  };
  if (!wantBoards) return ctx;

  // Only weeks that are safely FINAL grade into the boards — same lag the
  // side-bet engine uses, so a Monday-night game never scores half a week.
  const finalOnly = async w =>
    (w <= weekNo - BL.CFG.GRADE_WEEK_LAG) ? await sleeper.weekPointsByOwner(leagueId, w, map) : null;
  const sb = await PE.seasonBoard(seasonYear, weekNo, owners, finalOnly);

  // All-time: every season with pick'em data, summed forever. Historical seasons
  // predate pick'em (2026 is year one), so today all-time == this season; the
  // resolver only knows this league's cache, which is exactly the season we have.
  const slateKeys = await store.listKeys('pickem-slate:');
  const seasonsWithData = [...new Set(slateKeys.map(k => Number(k.split(':')[1])).filter(Boolean))].sort();
  const at = await PE.allTimeBoard(seasonsWithData, owners,
    (s, w) => (s === seasonYear ? finalOnly(w) : Promise.resolve(null)),
    (season && season.weeks) || 18);

  ctx.seasonBoard = sb.board;
  ctx.weeksGraded = sb.weeksGraded;
  ctx.allTimeBoard = at.board;
  ctx.allTimeSeasons = at.seasons;
  ctx.worst = sb.board.find(r => r.worst) || at.board.find(r => r.worst) || null;
  return ctx;
}

router.get('/pickem', aw(async (req, res) => {
  const c = await pickemContext(req.world, req.owner, { wantBoards: true });
  res.render('pickem', {
    me: req.owner, ...c,
    saved: req.query.saved === '1', late: req.query.late === '1',
  });
}));

router.post('/pickem', aw(async (req, res) => {
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const season = H.currentSeason(world.seasons);
  const seasonYear = season ? season.year : new Date().getFullYear();
  const map = world.config.sleeper_map || {};
  const seasonStart = world.config.season_start || null;
  const sData = await sleeper.bundle(world.config.sleeper_league_id);
  const weekNo = (sData && sData.week) || 1;
  const anyScore = PE.anyScoreOnBoard(sData);

  // Server-side lock: picks in after kickoff are refused outright — the whole
  // point of the feature is that a pick means you didn't know the result yet.
  if (PE.isLocked({ week: weekNo, seasonStart, anyScore })) {
    return res.redirect('/pickem?late=1');
  }
  const liveGames = PE.weekGames(sData, map, owners);
  const games = await PE.ensureSlate(seasonYear, weekNo, liveGames, { locked: false });

  // The form posts pick_<gameId>=<ownerId> per game.
  const picks = {};
  for (const g of games) {
    const v = req.body['pick_' + g.id];
    if (v != null && v !== '') picks[g.id] = v;
  }
  await PE.savePicks(seasonYear, weekNo, req.owner.id, picks, games);
  res.redirect('/pickem?saved=1');
}));

// Trash talk on a specific game. Any logged-in owner can post to any game — it's
// league banter — attributed and timestamped, permanent, archived for the
// chapters. The game is derived from the two owners so the post welds to the
// actual matchup, not a roster id. Redirects back to that matchup view.
router.post('/matchup/trash', aw(async (req, res) => {
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const oppId = parseInt(req.body.opp, 10) || null;
  const week = parseInt(req.body.week, 10) || 1;
  const seasonY = (H.currentSeason(world.seasons) || {}).year || new Date().getFullYear();
  const opp = oppId ? H.ownerById(owners, oppId) : null;
  if (opp && oppId !== req.owner.id) {
    const gid = TT.gameId(req.owner.id, opp.id);
    await TT.post(seasonY, week, gid, req.owner.id, req.body.body);
  }
  res.redirect('/matchup' + (oppId ? '?opp=' + oppId : '') + '#trash');
}));

// WHAT TO WATCH — Sunday & Monday night: the sweat meter + what each owner
// needs + the weekly-hundred sweat. League-visible (the live race). Dormant off
// its window and without live data; ?preview=1 rehearses it on sample data so the
// first live Sunday is not the first time it has ever run.
function pvEntries(owners) {
  // A deterministic sample slate spanning the sweat states: a coin flip, a
  // comeback, a lock, a blowout loss, a late lead. Labelled REHEARSAL in the UI.
  const o = owners.slice(0, 10);
  const nm = i => (o[i] || { name: 'Team ' + i }).name;
  const P = (proj, sd = 7) => ({ proj, sd });
  const games = [
    { a: 0, b: 1, live: 88.4, oppLive: 87.9, remain: [P(11)], oppRemain: [P(12)] },   // 🔥 coin flip
    { a: 2, b: 3, live: 61.2, oppLive: 96.8, remain: [P(14), P(9)], oppRemain: [] },   // 🟡 comeback
    { a: 4, b: 5, live: 121.5, oppLive: 74.1, remain: [P(6)], oppRemain: [P(8)] },     // 🟢 in control
    { a: 6, b: 7, live: 58.0, oppLive: 118.3, remain: [P(7)], oppRemain: [] },          // 🔴 cooked
    { a: 8, b: 9, live: 103.6, oppLive: 99.2, remain: [P(4)], oppRemain: [P(13)] },     // 🟡 late lead
  ];
  const entries = [];
  for (const g of games) {
    entries.push({ owner_id: (o[g.a] || {}).id, name: nm(g.a), oppName: nm(g.b), live: g.live, oppLive: g.oppLive, remain: g.remain, oppRemain: g.oppRemain });
    entries.push({ owner_id: (o[g.b] || {}).id, name: nm(g.b), oppName: nm(g.a), live: g.oppLive, oppLive: g.live, remain: g.oppRemain, oppRemain: g.remain });
  }
  return entries;
}
// Live entries from the scoreboard. Live scores are real; the "remaining
// players + projections" that sharpen the sweat come from A's per-player data
// when present (flagged in PARKED) — until then the meter runs off the live
// scores, which is honest, just coarser, and improves automatically.
function liveWatchEntries(sData, map, owners) {
  if (!sData || !Array.isArray(sData.matchups)) return [];
  const nameOf = id => (H.ownerById(owners, id) || {}).name || '?';
  const byMatch = {};
  for (const m of sData.matchups) {
    const oid = Number(map[String(m.roster_id)]);
    if (!oid) continue;
    const key = m.matchup_id != null ? `m${m.matchup_id}` : `s${m.roster_id}`;
    (byMatch[key] ??= []).push({ oid, pts: Math.round((m.points || 0) * 100) / 100 });
  }
  const entries = [];
  for (const pair of Object.values(byMatch)) {
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    entries.push({ owner_id: a.oid, name: nameOf(a.oid), oppName: nameOf(b.oid), live: a.pts, oppLive: b.pts, remain: [], oppRemain: [] });
    entries.push({ owner_id: b.oid, name: nameOf(b.oid), oppName: nameOf(a.oid), live: b.pts, oppLive: a.pts, remain: [], oppRemain: [] });
  }
  return entries;
}
router.get('/watch', aw(async (req, res) => {
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const preview = req.query.preview === '1';
  const etDay = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
  const inWindow = etDay === 0 || etDay === 1;   // Sunday or Monday, ET
  const band = LO.weeklyHighBand();
  const bandSamples = (band && band.samples) || [];
  const sData = await sleeper.bundle(world.config.sleeper_league_id);
  const weekNo = (sData && sData.week) || 1;
  let rows = [], source = null;
  if (preview) { rows = WW.panelRows(pvEntries(owners), bandSamples); source = 'preview'; }
  else if (inWindow && sData) {
    const anyScore = PE.anyScoreOnBoard(sData);
    if (anyScore) { rows = WW.panelRows(liveWatchEntries(sData, world.config.sleeper_map || {}, owners), bandSamples); source = 'live'; }
  }
  res.render('watch', { me: req.owner, rows, source, inWindow, weekNo, band, preview });
}));

// A dispatch, dismissed. Marks it seen for THIS owner only, so it never shows
// again — the popup is gone but the archived copy lives on for the chronicle.
// Answers JSON to the fetch enhancement and redirects the no-JS form.
router.post('/dispatch/dismiss', aw(async (req, res) => {
  const key = req.body.key;
  if (key) await DISPATCH.markSeen(req.owner.id, String(key));
  if ((req.get('accept') || '').includes('application/json') || req.body.ajax) {
    return res.json({ ok: true });
  }
  res.redirect('/');
}));

// ---------- THE SUNDAY SCOREBOARD — all of the week's games at once ----------
// League-visible. Every game as a compact card with the interesting detail on
// its face (pick'em split, rivalry billing, weekly-high stakes, playoff swing,
// clinch/elim, the live sweat) and the depth one tap down (→ the full matchup).
// Mostly WIRING the engines already built (PE, PO, WW, LO, RIV) — the page Cory
// leaves open on a Sunday. The natural game-day landing.
router.get('/scoreboard', aw(async (req, res) => {
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const me = req.owner;
  const season = H.currentSeason(world.seasons);
  const seasonYear = season ? season.year : new Date().getUTCFullYear();
  const map = world.config.sleeper_map || {};
  const seasonStart = world.config.season_start || null;
  const sData = await sleeper.bundle(world.config.sleeper_league_id);
  const weekNo = (sData && sData.week) || 1;
  const nameOf = id => (H.ownerById(owners, id) || {}).name || '?';

  const games = PE.weekGames(sData, map, owners);
  const anyScore = PE.anyScoreOnBoard(sData);
  const locked = PE.isLocked({ week: weekNo, seasonStart, anyScore });

  // live points per owner (from the scoreboard)
  let livePts = null;
  if (sData && Array.isArray(sData.matchups)) {
    livePts = {};
    for (const m of sData.matchups) {
      const oid = map[String(m.roster_id)];
      if (oid != null) livePts[String(oid)] = Math.round((m.points || 0) * 100) / 100;
    }
  }

  // pick'em splits (public only after lock)
  let allPicks = [];
  if (locked) { try { allPicks = await PE.allPicksForWeek(seasonYear, weekNo); } catch (e) {} }

  // playoff picture (odds + clinch/elim) + per-game leverage, when there's a race
  let picture = null, gamesLeft = 0, cut = (sData && sData.league.settings && sData.league.settings.playoff_teams) || 4;
  try {
    const sStand = sleeper.standings(sData, map, owners).filter(r => r.owner_id != null && ((r.wins || 0) + (r.losses || 0) + (r.ties || 0)) > 0);
    if (sData && sStand.length >= 4) {
      const rows = sStand.map(r => ({ owner_id: r.owner_id, wins: r.wins, losses: r.losses, pf: r.pf }));
      const regWeeks = (sData.league.settings && sData.league.settings.playoff_week_start) ? sData.league.settings.playoff_week_start - 1 : (season.weeks || 14);
      gamesLeft = PO.gamesRemaining(weekNo, regWeeks);
      const prev = await getDoc(`playoff-odds:${seasonYear}:${weekNo - 1}`, null);
      picture = PO.picture(rows, gamesLeft, cut, prev ? prev.odds : null);
      picture._rows = rows;
    }
  } catch (e) { /* dormant pre-season */ }

  // this week's weekly-high race (the $100)
  const whBand = LO.weeklyHighBand();
  let whRace = null;
  if (livePts) {
    const scores = Object.entries(livePts).map(([oid, pts]) => ({ owner: Number(oid), pts })).filter(s => s.pts > 0);
    if (scores.length) {
      const top = Math.max(...scores.map(s => s.pts));
      const leader = scores.find(s => s.pts === top);
      whRace = { top, leaderName: nameOf(leader.owner), leaderId: leader.owner, band: whBand };
    }
  }

  // ET day → the what-to-watch line only lights up Sun/Mon nights
  const etDay = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
  const primetime = etDay === 0 || etDay === 1;

  const cards = games.map(g => {
    const aPts = livePts ? livePts[String(g.a.id)] : null;
    const bPts = livePts ? livePts[String(g.b.id)] : null;
    const hasScore = (aPts != null && aPts > 0) || (bPts != null && bPts > 0);
    const leader = (aPts != null && bPts != null) ? (aPts > bPts ? g.a : (bPts > aPts ? g.b : null)) : null;
    const split = locked ? { ...PE.gameSplit(g, allPicks), line: PE.splitLine(g, allPicks, nameOf) } : null;
    const riv = RIVN.rivalryFor(g.a.name, g.b.name);
    const inWHRace = whRace && (whRace.leaderId === g.a.id || whRace.leaderId === g.b.id);
    // playoff stakes: each owner's odds + status, and the game's swing for owner a
    const po = picture ? { a: picture[g.a.id], b: picture[g.b.id] } : null;
    let worth = null;
    if (picture && gamesLeft && cut < (picture._rows || []).length) {
      const lev = PO.matchupLeverage(picture._rows, gamesLeft, cut, g.a.id);
      if (lev && lev.swing > 0.005) worth = { name: g.a.name, swing: Math.round(lev.swing * 100) };
    }
    // the live sweat line (Sun/Mon, undecided) — basic from live margin
    let sweat = null;
    if (primetime && hasScore && aPts != null && bPts != null) {
      const s = WW.sweat({ live: aPts, oppLive: bPts, remain: [], oppRemain: [] });
      sweat = { ...WW.sweatLabel(s.pWin), leader: leader ? leader.name : null, margin: Math.abs(Math.round((aPts - bPts) * 10) / 10) };
    }
    return { g, aPts, bPts, hasScore, leader, split, riv, inWHRace, po, worth, sweat };
  });

  res.render('scoreboard', {
    me, owners, weekNo, cards, locked, whRace, whBand,
    live: !!(livePts && Object.values(livePts).some(p => p > 0)),
    configured: !!world.config.sleeper_league_id, primetime,
    goatId: MK.goatOwnerId(sData, map), nameOf,
  });
}));

// ---------- THE LINEUP OPTIMIZER (in-season, the measured leak) ----------
// The tool that attacks $445–595/team/season left on the bench. Two faces:
//   • LIVE: your roster + projections → the dollar-optimal lineup and priced
//     start/sit calls. Projections come from A's sleeper.js when they land; until
//     then it runs on this season's per-game average (labelled), so it works now.
//   • PROOF: the validation — reproduces the certified L0 leak to the dollar, and
//     a per-week drill-down of any real week's optimal-vs-actual. This is the
//     "proven before week 1" face; it works fully offline off the harvest.
// COMMISSIONER-ONLY, server-side (gated like the war room). This tab renders
// per-owner lineup efficiency and bench-points-left — the most competitively
// sensitive ANALYSIS in the system. STANDING RULE: results are league property,
// analysis is the commissioner's. requireCommissioner 403s every non-commissioner
// BEFORE the handler runs, so it can never leak by a stray link or open tab.
// Shared: build this week's live optimizer result for one owner. Used by the
// /lineup page, the Sunday-alert preview, the manual send, and the cron fire.
// Projections come from A's sleeper.js when present; a labelled season-average
// fallback until then, so it runs before A's projections land.
async function liveOptimizeFor(world, owners, me) {
  const band = LO.weeklyHighBand();
  const sigmaByPos = LO.positionSigmas();
  let live = null, projSource = null, roster = null, matchup = null;
  const sData = await sleeper.bundle(world.config.sleeper_league_id);
  if (sData) {
    roster = await sleeper.rosterView(sData, world.config.sleeper_map || {}, me.id);
    matchup = sleeper.myMatchup(sData, world.config.sleeper_map || {}, me.id, owners);
  }
  if (roster && roster.rows && roster.rows.length) {
    const rosterIn = roster.rows.filter(r => r.pos && r.pos !== '?').map(r => {
      let proj = null, src = null;
      if (r.proj != null) { proj = Number(r.proj); src = 'sleeper'; }
      else if (r.seasonPts != null && r.gp) { proj = Number(r.seasonPts) / Number(r.gp); src = 'season-avg'; }
      else if (r.wkPts != null) { proj = Number(r.wkPts); src = 'last-week'; }
      else { proj = 0; src = 'none'; }
      if (src === 'sleeper') projSource = 'sleeper';
      else if (projSource !== 'sleeper') projSource = src;
      return { id: r.id, name: r.name, pos: r.pos, proj: Math.round(proj * 10) / 10, sd: r.sd };
    });
    let oppMean = 0, oppKnown = false;
    if (matchup && matchup.opp && matchup.opp.points > 0) { oppMean = matchup.opp.points; oppKnown = true; }
    else { oppMean = band.median; }
    // matchupValue omitted -> optimize() uses its derived playoff-equity default
    // ($110, draft/backtest/matchup_value.py). NOT a side bet (Cory, 2026-08-10).
    live = LO.optimize(rosterIn, { band, sigmaByPos, oppMean });
    live.oppKnown = oppKnown;
  }
  const weekNo = (matchup && matchup.week) || (sData && sData.week) || 1;
  return { live, roster, matchup, projSource, band, weekNo };
}

router.get('/lineup', requireCommissioner, aw(async (req, res) => {
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const me = req.owner;
  const tab = req.query.tab === 'proof' ? 'proof' : 'live';
  const season = String(H.currentSeason(world.seasons).year || new Date().getUTCFullYear());

  const { live, roster, matchup, projSource, band, weekNo } = await liveOptimizeFor(world, owners, me);
  // The Sunday alert exactly as it would fire — so it can be rehearsed before week 1.
  const alert = live ? LO.sundayAlert(live, { week: weekNo, band }) : null;

  // PROOF face: L0 reproduction + a per-week drill-down.
  const proof = LO.ceilingLeak();                    // per-season leak (to the dollar)
  const eff = LO.replayEfficiency();                 // per-team efficiency
  // Cory's benched-points tragedy (the easter egg + the business case, one number).
  const myLeak = proof.reduce((a, s) => {
    const row = (s.teams || []).find(t => t.owner === 'coryjsimms');
    return a + (row ? row.totalLeak : 0);
  }, 0);

  // Optional week drill-down (?proof + replay=YEAR&week=W&owner=display_name).
  let drill = null;
  const dY = req.query.replay, dW = parseInt(req.query.week, 10);
  if (tab === 'proof' && dY && dW) drill = LO.weekDrill(String(dY), dW, req.query.owner || 'coryjsimms');

  res.render('lineup', {
    me, owners, tab, season, band, live, projSource, roster, matchup, weekNo, alert,
    proof, eff, myLeak: Math.round(myLeak), drill,
    configured: !!world.config.sleeper_league_id,
    logged: req.query.logged === '1',
    sent: req.query.sent === '1',
    emailOn: notify.configured(),
  });
}));

// Send the Sunday alert to the commissioner now (rehearsal, and the manual fire).
// The weekly cron hits the same logic via /api/sunday-alert with a secret.
router.post('/lineup/sunday/send', requireCommissioner, aw(async (req, res) => {
  const owners = H.activeOwners(req.world.owners);
  const { live, band, weekNo } = await liveOptimizeFor(req.world, owners, req.owner);
  if (live) {
    const alert = LO.sundayAlert(live, { week: weekNo, band });
    await notify.sundayAlert(req.owner, alert).catch(() => {});
  }
  res.redirect('/lineup?sent=1');
}));

// Decision-time write: log THIS lineup call with its counterfactual (the naive
// "start your studs" lineup) so January can grade what the tool recommended vs
// what would have happened otherwise. The predledger enforces the counterfactual.
router.post('/lineup/log', requireCommissioner, aw(async (req, res) => {
  const season = String(H.currentSeason(req.world.seasons).year || new Date().getUTCFullYear());
  const predledger = require('../predledger');
  try {
    await predledger.append(store, {
      kind: 'lineup_call',
      method: 'lineup-optimizer-v1',
      season,
      payload: {
        owner_id: req.owner.id,
        week: req.body.week ? Number(req.body.week) : null,
        recommended: safeJson(req.body.recommended),
        // REQUIRED: what I'd have played without the tool (start-your-studs).
        counterfactual: safeJson(req.body.counterfactual),
        dollars: req.body.dollars != null ? Number(req.body.dollars) : null,
        confidence: String(req.body.confidence || '').slice(0, 600),
        opp_mean: req.body.opp_mean != null ? Number(req.body.opp_mean) : null,
      },
    });
  } catch (e) { /* fail soft on the redirect; the API path surfaces errors */ }
  res.redirect('/lineup?logged=1');
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
