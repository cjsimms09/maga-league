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
const DB = require('./draftboard');        // the completed draft board as a grid (history click-through)
const TT = require('./trashtalk');         // trash talk attached to a specific game, permanent + archived
const WW = require('./whatwatch');         // what-to-watch — the Sunday/Monday sweat meter + what each owner needs
const OT = require('./oddstext');          // how a probability is printed — one definition for every surface
const MK = require('./marks');             // auto badges — GOAT on Mahomes' owner, Chiefs mark on KC players
const RIVN = require('./rivalries');       // named rivalries (German derby, Dylan-Sam, Bates-Richard)
const MU = require('../matchup');          // slot-aligned matchup starters (QB vs QB, not row-vs-row)
const DASH = require('../dashboard');      // dashboard model + the derived draft-day announcement
const SET = require('./settlement');       // the settlement report — who pays whom, with Venmo
const RD = require('./recap-data');        // the weekly recap: gather here, write in src/recap.js
const ACC = require('./accuracy');          // model-accuracy display — reads A's calibration/attribution output
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

// ---------- ONE WAY TO PRINT A PROBABILITY, on every member page ----------
// /matchup and /watch both state odds, and they had independently decided what
// to do at the extremes: /matchup printed bounds near zero but a flat 0% AT
// zero, /watch printed Math.round(p * 100) and so said "0%" about a game with
// the ball in the air. Handed to the views here so there is one answer and the
// next surface that prints a probability inherits it. See routes/oddstext.js
// for why a zero is only ever a fact when the caller can prove it.
router.use((req, res, next) => {
  res.locals.pctText = OT.pctText;
  res.locals.pctSpan = OT.pctSpan;
  res.locals.isBound = OT.isBound;
  next();
});

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
/* The cron trigger. Tuesday morning, after Monday night is settled.
 *
 * Same health contract as the Sunday alert, for the same reason: a weekly job
 * that dies silently is the failure this project keeps hitting. It records the
 * last successful send, refuses to send twice for one week, and reports WHY it
 * stayed quiet in a word the workflow can branch on — so "off-season" and
 * "the recap has not gone out in three weeks" are never the same green run.
 */
router.get('/api/weekly-recap', aw(async (req, res) => {
  const secret = process.env.WEEKLY_RECAP_KEY || process.env.SUNDAY_ALERT_KEY || process.env.CRON_SECRET;
  if (!secret || req.query.key !== secret) return res.status(403).json({ ok: false, error: 'forbidden' });
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const season = String(H.currentSeason(world.seasons).year || new Date().getUTCFullYear());
  const emailConfigured = notify.configured();

  const sData = await sleeper.bundle(world.config.sleeper_league_id);
  // OFF-SEASON: no live league at all. Quiet, and correctly so.
  if (!sData || !sData.week) {
    return res.json({ ok: true, sent: 0, quiet: true, emailConfigured,
      reason: 'off-season', note: 'no live league — nothing to recap' });
  }
  // The week to recap is the one that FINISHED, not the one in progress. Sleeper
  // rolls `state.week` forward on Tuesday, which is exactly when this runs.
  const weekNo = Math.max(1, Number(sData.week) - 1);

  const stampKey = `weekly-recap-sent:${season}:${weekNo}`;
  const already = await getDoc(stampKey, null);
  if (already) {
    return res.json({ ok: true, sent: 0, quiet: true, emailConfigured, week: weekNo,
      reason: 'already-sent', note: `week ${weekNo}'s recap went out at ${already.at}` });
  }

  const recap = await RD.buildWeeklyRecap(world, owners, weekNo, season);
  if (!recap.ready) {
    // NOT a quiet success. The week happened and we could not write about it —
    // if that repeats, the league silently stops getting an email.
    return res.json({ ok: true, sent: 0, quiet: false, emailConfigured, week: weekNo,
      reason: recap.reason, note: recap.note || 'the week is not final or the data is incomplete' });
  }
  if (!emailConfigured) {
    return res.json({ ok: true, sent: 0, quiet: false, emailConfigured: false, week: weekNo,
      reason: 'email-not-configured', note: 'a recap was written and there is no way to send it' });
  }
  const r = await notify.weeklyRecap(owners, recap).catch(e => ({ error: String((e && e.message) || e) }));
  const sent = (r && !r.skipped && !r.error) ? 1 : 0;
  if (sent) await setDoc(stampKey, { at: new Date().toISOString(), season, week: weekNo,
    recipients: owners.filter(o => o.email).length, thin: !!recap.thin });
  res.json({ ok: true, sent, quiet: false, emailConfigured, week: weekNo, thin: !!recap.thin,
    ...(sent ? {} : { reason: r && r.error ? 'send-failed' : 'send-skipped',
                      note: (r && (r.error || r.note)) || 'the mailer declined to send' }) });
}));

router.get('/api/sunday-alert', aw(async (req, res) => {
  const secret = process.env.SUNDAY_ALERT_KEY || process.env.CRON_SECRET;
  if (!secret || req.query.key !== secret) return res.status(403).json({ ok: false, error: 'forbidden' });
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  // THE COMMISSIONER IS RESOLVED ONCE, BY THE MAILER. This used to re-derive
  // `o.is_commissioner && o.active` here, a second copy of a rule notify.js
  // already owns — rule 11's third requirement, in two files that agreed today
  // and had nothing comparing them. The lookup that remains is only to decide
  // WHOSE lineup to optimize, and the send is handed the whole list.
  const emailConfigured = notify.configured();
  const commish = world.owners.find(o => o.is_commissioner && o.active);
  if (!commish) return res.json({ ok: true, sent: 0, quiet: true, emailConfigured,
    reason: 'no-commissioner', note: 'no active commissioner on the roster' });
  // WHY NOTHING WENT OUT, not just that nothing did.
  //
  // The scheduler asserted `"ok":true` and nothing else, so THREE different
  // Sundays were indistinguishable and all green: the off-season no-op (correct),
  // Sleeper being down mid-season (an outage nobody hears about), and the email
  // provider being unconfigured in production (the alert never arrives, all
  // season, silently). `quiet` separates "there was nothing to send" from
  // "there was something to send and it did not go", which is the only
  // distinction the caller needs to decide whether a green run is good news.
  const { live, band, weekNo } = await liveOptimizeFor(world, owners, commish);
  if (!live) {
    return res.json({ ok: true, sent: 0, quiet: true, emailConfigured,
      reason: 'no-live-lineup',
      note: 'no live lineup (off-season, or Sleeper unreachable) — nothing to send' });
  }
  if (!emailConfigured) {
    // There WAS something to send. Not quiet — a misconfiguration.
    return res.json({ ok: true, sent: 0, quiet: false, emailConfigured: false,
      reason: 'email-not-configured', week: weekNo,
      note: 'a live lineup exists but no email provider is configured — the alert cannot be delivered' });
  }
  const alert = LO.sundayAlert(live, { week: weekNo, band });

  // ── IT USED TO FIRE EVERY TIME IT WAS ASKED ────────────────────────────────
  //
  // Driven across eight firings, eight emails went out, all eight of them
  // "nothing to change" — including three back-to-back firings of the identical
  // state, week 18 with the season over, and a week with no matchup scheduled.
  // The only condition was "a live lineup exists".
  //
  // A weekly email that says nothing needs changing is the same overstatement as
  // the optimizer manufacturing a puzzle on a week where there isn't one: A
  // measured that the dual objective deviates from "start your best projections"
  // in about 11% of weeks. Fifteen of seventeen alerts would have been noise,
  // and noise is what teaches you to stop opening the one that matters.
  //
  // So the alert now sends when there is something to DO — a priced start/sit
  // call, or a player in the current lineup who cannot score. The RUN still
  // happens every Sunday and still reports itself; the workflow reads `quiet`
  // and its `reason`, so the heartbeat lives in the Actions log where a heartbeat
  // belongs, not in the inbox.
  if (!alert.actionable) {
    return res.json({ ok: true, sent: 0, quiet: true, emailConfigured, week: weekNo,
      hasCalls: false,
      reason: live.projPending ? 'projections-pending' : 'nothing-to-act-on',
      note: live.projPending
        ? 'no projections have landed yet — there is nothing to recommend'
        : 'the current lineup is already dollar-optimal and no starter is out — nothing worth an email' });
  }

  // ── AND IT FIRED AS OFTEN AS IT WAS ASKED ──────────────────────────────────
  // The cron, a workflow_dispatch retry, and the manual "send" button on
  // /lineup all hit this. Three firings, three identical emails. One alert per
  // week, stamped on success only, so a failed send is retried rather than
  // swallowed. The manual button (POST /lineup/sunday/send) deliberately does
  // NOT check the stamp: an explicit click is a request, not a schedule.
  const season = String(H.currentSeason(world.seasons).year || new Date().getUTCFullYear());
  const stampKey = `sunday-alert-sent:${season}:${weekNo}`;
  const already = await getDoc(stampKey, null);
  if (already) {
    return res.json({ ok: true, sent: 0, quiet: true, emailConfigured, week: weekNo,
      reason: 'already-sent-this-week', note: `week ${weekNo}'s alert already went out at ${already.at}` });
  }

  const r = await notify.sundayAlert(world.owners, alert).catch(e => ({ error: String((e && e.message) || e) }));
  const sent = (r && !r.skipped && !r.error) ? 1 : 0;
  if (sent) await setDoc(stampKey, { at: new Date().toISOString(), calls: alert.calls.length, dead: alert.dead.length });
  res.json({ ok: true, sent, quiet: false, emailConfigured, week: weekNo,
    hasCalls: alert.hasCalls, dead: alert.dead.length,
    changes: alert.changes.length, lineupKnown: alert.lineupKnown,
    ...(sent ? {} : { reason: r && r.error ? 'send-failed' : 'send-skipped',
                      note: (r && r.error) || 'the mailer declined to send' }) });
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
  //
  // A password reset is ONE OF THE THREE things that may reach a member
  // (policy, 2026-08-11), so this path works for everyone again — but it asks
  // the mailer FIRST rather than assuming, because the answer is still no when
  // there is no provider configured or no address on file, and minting a token
  // for a link that will not arrive leaves a dead record on disk and a page
  // making a promise it cannot keep. One rule, asked at its source, never a
  // second copy here that can drift from it.
  if (owner && await notify.mayEmail(owner.email, 'password-reset')) {
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

/* IS THE LIVE DATA ACTUALLY LIVE?
 *
 * `sleeper.bundle()` is well built for an outage: it caches, it remembers a
 * failure so the next render doesn't pay five timeouts, and it serves the
 * last-known-good bundle instead of breaking. But it returns that stale bundle
 * with NO signal, and `failed_at` was surfaced only on the admin console — so if
 * Sleeper went down mid-Sunday every page kept showing old scores AS IF LIVE.
 * That is the worst version of the failure class this project keeps finding:
 * not broken, just quietly wrong, on the surfaces whose whole point is live.
 *
 * B can't change sleeper.js (A's lane), but the cache is a plain doc — so read it
 * and tell the truth. Returns null when the data is fresh (render nothing).
 */
async function liveFreshness() {
  try {
    const c = await getDoc('sleeper-cache', null);
    if (!c || !c.failed_at) return null;                 // never failed → fresh
    // ONLY warn when we are actually SHOWING stale numbers. With no cached bundle
    // at all (off-season, never-connected, a fresh install) the pages already say
    // "no live scoreboard" in their own words — a second banner repeating it every
    // page load is noise, and a warning people learn to ignore is worse than none.
    if (!c.data || !c.fetched_at) return null;
    const ageMin = c.fetched_at ? Math.round((Date.now() - c.fetched_at) / 60000) : null;
    return {
      unreachable: true,
      since: c.fetched_at ? new Date(c.fetched_at).toLocaleTimeString('en-US',
        { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET' : null,
      ageMin,
    };
  } catch (e) { return null; }
}

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

  // THE DRAFT-DAY ANNOUNCEMENT — derived from config (date/time/place) so it's
  // one source of truth for the front-page banner AND the pinned site-wide alert.
  // The pinned alert's text was hand-typed and had gone stale ("5:00 PM", no
  // place); self-heal it to the derived line so the banner and the alert can never
  // disagree. Only writes when the stored text actually differs (no churn).
  //
  // AND IT RETIRES ITSELF. Both halves used to be gated on `!passed`, so the day
  // after the draft the code simply stopped touching the alert — leaving it
  // pinned, `active: true`, `level: 'urgent'`, at the top of EVERY page for the
  // rest of the season, telling ten people to show up to a draft that already
  // happened. It also stranded the stale hand-typed text, because healing was
  // gated the same way: what stayed up was "DRAFT DAY IS SET: 08/22/26 at 5:00
  // PM" — wrong time, no place — with nothing left to correct it. The countdown
  // banner did hide itself, which is what made this invisible: the loud element
  // was the one that stayed. Found by driving the front page as a member with
  // the draft date three weeks in the past.
  const isDraftAlert = a => a.id === 'draftday2026' || /^DRAFT DAY/i.test(a.message || '');
  const draftInfo = DASH.draftAnnouncement(world.config, new Date().toISOString(), season && season.year);
  if (draftInfo.configured && draftInfo.message) {
    try {
      const alerts = await getDoc('alerts', []);
      const pinned = alerts.find(isDraftAlert);
      if (pinned && draftInfo.passed) {
        // The draft happened. Retire it — reversibly: the commissioner can
        // re-activate it from the alerts admin, and the text is left intact so
        // there is something to re-activate.
        if (pinned.active) {
          pinned.active = false;
          await setDoc('alerts', alerts);
        }
        // Drop it from this request too, so it goes the moment the day turns.
        if (Array.isArray(res.locals.alerts)) {
          res.locals.alerts = res.locals.alerts.filter(a => !isDraftAlert(a));
        }
      } else if (pinned && pinned.message !== draftInfo.message) {
        pinned.message = draftInfo.message; pinned.level = 'urgent'; pinned.active = true;
        await setDoc('alerts', alerts);
        // Patch this request's already-computed alert region so the fix shows now.
        for (const a of (res.locals.alerts || [])) {
          if (isDraftAlert(a)) a.message = draftInfo.message;
        }
      }
    } catch (e) { /* the banner still renders even if the alert heal fails */ }
  }

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
  // Attach owner ids to each team on the mini-scoreboard so the dashboard can
  // deep-link every game to its matchup — the same tap-through the full
  // scoreboard page has (a dead row among clickable siblings reads as unfinished).
  if (sBoard.length) {
    const _smap = world.config.sleeper_map || {};
    for (const game of sBoard) for (const t of game) t.owner_id = Number(_smap[String(t.roster_id)]) || null;
  }
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
  // THE IN-SEASON HERO — during a season week, the most important thing on the
  // home page is YOUR game: your score, your opponent, and whether your lineup
  // has a problem. It belongs at the very top, above the money tiles. Silent
  // off-season / pre-draft (no live matchup), so it never crowds the pre-season
  // page. Tap → your full matchup.
  let weekHero = null;
  if (sData && Array.isArray(sData.matchups)) {
    const myGame = sleeper.myMatchup(sData, world.config.sleeper_map || {}, req.owner.id, owners);
    if (myGame && myGame.opp) {
      const mePts = myGame.me.points, oppPts = myGame.opp.points;
      const anyScore = (mePts || 0) > 0 || (oppPts || 0) > 0;
      // Lineup problem: a starter who is OUT or a slot left empty. Deliberately
      // NARROW — the optimizer deviates from "start your best" only ~11% of weeks
      // (A's finding), so a hero that cried "fix your lineup" every week would
      // overstate it. Only a genuine can't-score problem lights the flag; bye
      // detection waits on the per-player bye source (flagged to A).
      let lineupWarn = null;
      try {
        const myRow = sData.matchups.find(m => Number(m.roster_id) === Number(myGame.me.roster_id));
        if (myRow && (myRow.starters || []).length) {
          const playersDb = await sleeper.players();
          const rp = (sData.league && sData.league.roster_positions) || null;
          const byeOpts = { byeMap: MU.byeMapFor(sData.state && sData.state.season), weekNo: myGame.week || sData.week };
          const paired = MU.pairStarters(myRow, null, rp, playersDb, null, byeOpts);
          const problems = [];
          for (const row of (paired ? paired.rows : [])) {
            const c = row.me;
            if (c.empty) problems.push({ slot: row.slot, why: 'empty', text: 'empty ' + row.slot + ' slot' });
            else if (c.onBye) problems.push({ slot: row.slot, why: 'bye', text: c.name + ' (bye)' });
            else if (['OUT', 'IR', 'SUS', 'PUP', 'DNR', 'NA', 'DOUBTFUL'].includes((c.inj || '').toUpperCase())) {
              problems.push({ slot: row.slot, why: 'out', text: c.name + ' (' + c.inj + ')' });
            }
          }
          if (problems.length) lineupWarn = { count: problems.length, items: problems.slice(0, 3) };
        }
      } catch (e) { /* the hero renders without the warning */ }
      weekHero = {
        weekNo: myGame.week || sData.week,
        meTeam: myGame.me.team, mePts,
        oppName: (myGame.opp.owner && myGame.opp.owner.name) || myGame.opp.team,
        oppId: (myGame.opp.owner && myGame.opp.owner.id) || null,
        oppTeam: myGame.opp.team, oppPts,
        live: anyScore,
        leading: anyScore ? (mePts > oppPts ? 'you' : oppPts > mePts ? 'them' : 'even') : null,
        margin: anyScore ? Math.abs(Math.round((mePts - oppPts) * 10) / 10) : null,
        lineupWarn,
      };
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
  const playoffTeams = PO.playoffCut(sData && sData.league);

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
    openVotes, CATEGORY_LABELS: H.CATEGORY_LABELS, myBalance, draftInfo, weekHero,
    liveStale: await liveFreshness(),
    // The money scoreboard: banked dollars + rank this season, from the ledger.
    moneyBoard: L.moneyStandings(world.ledger, owners, season), meId: req.owner.id,
    sleeperData: sData, sleeperStandings: sStandings, sleeperBoard: sBoard, roast,
    whBand, whRace, rivalryOfWeek, rivalryMore,
    review, reviewWeek, wireRows, playoffTeams, chatLatest, betMoney, owners, rankMoves, dispatches, playoffPicture,
    // Venmo nag (venmo-handles.md §2): fires for a logged-in owner with no
    // handle; the commissioner also sees who is still missing theirs.
    venmoNag: V.needsNag(req.owner && world.owners.find(o => o.id === req.owner.id)),
    // Contact directory: the shared card's data source (login-gated), this
    // owner's own record + what's missing, and the commissioner's at-a-glance
    // incomplete list. Superset of the Venmo nag — covers email and phone too.
    contacts: owners.map(contactOf),
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
  // Does this season have a vault (trash + dispatches) worth linking to? Cheap
  // existence check so the season page only offers the link when there's something.
  let hasVault = false;
  try {
    const [tk, di] = await Promise.all([
      store.listKeys(`trash:${year}:`),
      getDoc(`dispatch-index:${year}`, []),
    ]);
    hasVault = (tk && tk.length > 0) || (di && di.length > 0);
  } catch (e) { /* the link is a bonus */ }
  // Same cheap existence check for the draft board — offer the click-through
  // only for years that actually have one archived.
  let hasBoard = false;
  try { hasBoard = (await draftBoardSnapshots(year)).picks.length > 0; } catch (e) { /* bonus */ }
  res.render('history/season', { A, season, chapterInclude, cast, chapters: chapterYears(), hasVault, hasBoard });
}));

// THE DRAFT BOARD — that year's completed board as a grid, owners across the
// top and rounds down the side, the way it looked on the wall.
//
// Behind a click-through from the season page rather than on it: a 10×16 grid is
// the largest single object in the archive and would crowd out everything else
// on the year page, but it is also the artifact people actually want to look
// back at. Reads the raw-forever archive — `draft_complete` first (the
// server-side capture of the finished draft), falling back to the war room's
// live `draft_picks` stream, so a year captured by only one path still renders.
router.get('/history/board/:year', aw(async (req, res) => {
  const year = Number(req.params.year);
  if (!Number.isFinite(year)) {
    return res.status(404).render('error', { title: 'No such season', message: 'That year is not a season.' });
  }
  const owners = req.world.owners;
  const snaps = await draftBoardSnapshots(year);
  const grid = snaps.picks.length
    ? DB.buildGrid(snaps.picks, snaps.map || req.world.config.sleeper_map || {}, owners)
    : { rounds: 0, slots: 0, columns: [], grid: [] };
  res.render('history/board', { year, grid, source: snaps.source, capturedAt: snaps.capturedAt,
    count: snaps.picks.length });
}));

// Newest snapshot of the completed draft, preferring the server-side capture.
// The sleeper_map is read from the snapshot when it carries one — roster ids
// only mean anything against the mapping in force at the time, so resolving them
// against today's map would silently reattribute every pick of an old draft.
async function draftBoardSnapshots(year) {
  const rawarchive = require('../rawarchive');
  const pick = async kind => {
    try {
      const rows = await rawarchive.readAll(store, String(year), kind);
      return (rows && rows.length) ? rows[rows.length - 1] : null;
    } catch (e) { return null; }
  };
  const complete = await pick('draft_complete');
  if (complete && complete.payload && (complete.payload.picks || []).length) {
    return { picks: complete.payload.picks, map: complete.payload.sleeper_map,
      source: 'complete', capturedAt: complete.archived_at || null };
  }
  const stream = await pick('draft_picks');
  if (stream && stream.payload && (stream.payload.picks || []).length) {
    return { picks: stream.payload.picks, map: null,
      source: 'stream', capturedAt: stream.archived_at || null };
  }
  return { picks: [], map: null, source: null, capturedAt: null };
}

// THE VAULT — a season's trash talk + dispatches, the permanent record that
// nothing read until now (the archive functions existed but no surface called
// them — "an archive nothing reads is the same as a deletion"). Un-gated on the
// harvest, so the CURRENT season's vault is reachable too, and every week's
// thread survives (the matchup page only ever showed the current week).
router.get('/history/vault/:year', aw(async (req, res) => {
  const year = Number(req.params.year);
  if (!Number.isFinite(year)) {
    return res.status(404).render('error', { title: 'No such season', message: 'That year is not a season.' });
  }
  const owners = req.world.owners;
  const nameOf = id => (H.ownerById(owners, id) || {}).name || '?';
  let dispatches = [], trash = [];
  try { dispatches = await DISPATCH.getArchive(year); } catch (e) { /* best-effort */ }
  try { trash = await TT.archiveForSeason(year); } catch (e) { /* best-effort */ }
  // Group trash by week so a season reads as a timeline, newest week first.
  const byWeek = {};
  for (const p of trash) { (byWeek[p.week] = byWeek[p.week] || []).push(p); }
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => b - a)
    .map(w => ({ week: w, posts: byWeek[w] }));
  res.render('history/vault', {
    year, dispatches, weeks, nameOf,
    total: trash.length,
    currentYear: (H.currentSeason(req.world.seasons) || {}).year || null,
  });
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
  // Route LEAGUE money through the commissioner (the bank): every debtor pays
  // Cory, Cory pays every creditor — never peer-to-peer. Side bets are separate
  // and stay peer-to-peer (SB.settlementsFor below). Hub is DERIVED (the
  // commissioner flag), so it follows if the commissioner ever changes.
  const bankId = (owners.find(o => o.is_commissioner) || {}).id;
  const settlement = SET.settlementReport(
    owners.map(o => ({ owner_id: o.id, name: o.name, net: bal[o.id] ? bal[o.id].balance : 0 })),
    id => { const o = H.ownerById(owners, id); const h = o && V.handle(o); return h ? { handle: h, url: `https://venmo.com/u/${h}` } : null; },
    bankId != null ? bankId : null);

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

  // CAREER MONEY — cumulative banked total + all-time rank. The page shows this
  // season's tab in detail but never answered "how much have I actually won here,
  // ever, and where does that put me". Derived from the SAME winningsGrid /
  // careerTotals the history page uses, so the two can't disagree.
  let career = null;
  try {
    const grid = H.winningsGrid(world);
    const totals = H.careerTotals(grid, owners);
    const ranked = owners
      .map(o => ({ owner_id: o.id, name: o.name, won: Math.round((totals[o.id] || 0) * 100) / 100 }))
      .sort((a, b) => b.won - a.won || a.name.localeCompare(b.name));
    // Standard competition ranking ("1224"), matching moneyStandings.
    let rk = 0, prev = null;
    ranked.forEach((r, i) => { if (prev === null || r.won !== prev) rk = i + 1; r.rank = rk; prev = r.won; });
    const mine = ranked.find(r => r.owner_id === req.owner.id) || null;
    // THE DENOMINATOR IS SEASONS IN THE MONEY, NOT SEASONS PLAYED. This was
    // named seasonsPlayed and commented "a denominator, so per season is
    // honest" — but winningsGrid only ever holds years where money changed
    // hands (there is not one zero-valued key in it across ten seasons), so a
    // year you played and won nothing is not counted. Sam has two of those keys
    // and Justin one: Sam's average read $625 a season off a $1,250 career.
    // Seasons actually played is not recorded ANYWHERE — history carries
    // winnings, awards and weekly, all money-keyed, and owners carry no
    // membership span — so it cannot be computed rather than merely being
    // missed here. The number is kept and the label now says what it counts.
    const seasonsInTheMoney = Object.keys(grid[req.owner.id] || {}).length;
    career = {
      mine, ranked, of: ranked.length, seasonsInTheMoney,
      perSeason: mine && seasonsInTheMoney ? Math.round((mine.won / seasonsInTheMoney) * 100) / 100 : null,
      leader: ranked[0] || null,
    };
  } catch (e) { career = null; /* reference numbers are a bonus, never break the page */ }

  res.render('bank', {
    poolAdvice, career,
    // Propose-from-anywhere: a ?betvs=<id> link (matchup, standings, franchise)
    // pre-selects that opponent in the bet builder.
    prefillParty: Number(req.query.betvs) || null,
    cards, season, totalOwedToLeague, totalLeagueOwes, viewCard, leagueEntries, settlement,
    TYPE_LABELS: L.TYPE_LABELS,
    section, bets, tallies, owners, betNames, sbLedger, sbOwed, sbOwedMine, verdicts, liveOrder,
    sbGrid, sbView, sbDrill,
    deadlines, late: req.query.late === '1',
    betFail: betFailMessage(req.query.betfail),
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

// Turn a refusal code into the sentence the proposer needs. Anything we don't
// recognise still says SOMETHING — "no reason given" is the failure being fixed,
// so the default must never be silence.
function betFailMessage(code) {
  const c = String(code || '');
  if (!c) return null;
  if (c === 'terms') return "That bet has no terms. Pick a bet type and fill it in, or write the terms yourself — otherwise there's nothing to settle later.";
  if (c === 'stake-missing') return 'That bet has no stake. Put a dollar amount on it.';
  if (c === 'stake-zero') return 'A stake has to be more than $0.';
  if (c === 'nobody') return "Nobody's on the other side. Name at least one opponent, or post it to the board with open slots so someone can take it.";
  if (c.startsWith('rejected:')) return 'The bet was refused: ' + c.slice(9) + '. Nothing was written — fix it and send again.';
  return 'That bet was not created (' + c + '). Nothing was written — fix it and send again.';
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
  // WHY THIS SAYS WHY IT REFUSED.
  //
  // This used to be one silent `if`: fail the guard and control fell straight
  // through to the redirect at the bottom, so pressing "Send it" reloaded the
  // page with no bet, no error, and no reason. The catch below did the same for
  // anything SB.propose threw, on the reasoning that "the form enforces it too"
  // — which is the whole problem, because a client-side `required` is not a
  // guarantee and the one time it doesn't hold is the one time you need to be
  // told. Found by driving the builder as a member: the bet was never written
  // and the page said nothing about it.
  const why = !terms ? 'terms'
    : !Number.isFinite(stake) ? 'stake-missing'
    : stake <= 0 ? 'stake-zero'
    : !(ids.length || openSlots) ? 'nobody'
    : null;
  let failed = why;
  if (!why) {
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
      // NO EMAIL. Not one of the three (policy, 2026-08-11) — and checked before
      // removing rather than assumed: server-app.js already banners "N side bets
      // waiting on you" at the top of EVERY page plus a nav badge, which is
      // louder than the email was.
    } catch (e) {
      // Carry the reason, don't swallow it. Truncated and query-escaped; the
      // page renders it as text, never as markup.
      failed = 'rejected:' + String(e && e.message || 'unknown').slice(0, 120);
    }
  }
  // The matchup page sends people back to it, not the finance page — the bet was
  // made in the flow of "who am I playing", so that is where the confirmation lands.
  if (req.body.back === 'matchup') {
    // NEVER `sent=1` on a failure. This path used to redirect to "✅ Bet sent"
    // whether or not a bet existed — a confirmation for something that never
    // happened, which is worse than saying nothing at all.
    const opp = req.body.party ? '&opp=' + Number(req.body.party) : '';
    return res.redirect(failed
      ? '/matchup?betfail=' + encodeURIComponent(failed) + opp
      : '/matchup?sent=1' + opp);
  }
  res.redirect('/bank?section=sidebets' + (failed ? '&betfail=' + encodeURIComponent(failed) : ''));
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
  // Two-stage guard: if the draft was opened before the bracket was recorded, the
  // playoff four sit in the order as PENDING (their reverse-bracket order isn't
  // decided yet). Nobody is on the clock until it is — recording the playoff
  // results resolves their order. Prevents a pending seat claiming out of turn.
  if (current.pending) {
    return res.redirect('/draft?error=' + encodeURIComponent('The playoff four choose once the bracket is decided — record the playoff results to set their order.'));
  }
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
  // NO EMAIL. Not one of the three (policy, 2026-08-11). The dashboard's "Needs
  // you" strip counts the votes you have not cast, on the page you land on.
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

  // An already-placed bet on THIS game, so the page shows the standing wager
  // instead of only offering to create another. A matchup bet between the two of
  // you, this week — newest first if there's more than one. Defensive: a failed
  // lookup just hides the panel, never breaks the page.
  let matchupBet = null;
  if (opp) {
    try {
      const _bets = await SB.all();
      matchupBet = _bets
        .filter(b => b.kind === 'matchup' && Number(b.week) === Number(weekNo)
          && SB.isParty(b, me.id) && SB.isParty(b, opp.id))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] || null;
    } catch (e) { matchupBet = null; }
  }

  // owner -> stable Sleeper user_id. Live bundle is authoritative when present;
  // the harvest-backed name map is the offline fallback (both proven to agree).
  let invUserMap = null;
  if (sData) {
    const um = sleeper.userMap(sData, world.config.sleeper_map || {});   // { user_id: owner_id }
    invUserMap = {};
    for (const [uid, oid] of Object.entries(um)) invUserMap[oid] = uid;
  }
  // ...but authoritative only if the ARCHIVE HAS EVER SEEN THAT ID. The live id
  // and the harvest id are the same in production and were assumed to be so
  // here, and when they are not the failure is silent and confident: uidOf
  // returned a perfectly well-formed user_id that matches nothing, headToHead
  // faithfully reported played:0, and /matchup printed "No games on record
  // against Marian yet — this is your first meeting since the box scores begin"
  // for a pair with FIVE meetings that /rivalry, reading the same archive by
  // name, listed in full. An id that resolves to nothing is not a record of
  // nothing.
  const archiveIds = new Set(Object.values(H2H.handleUserIds() || {}));
  const uidOf = (o) => {
    const live = invUserMap && invUserMap[o.id];
    if (live && archiveIds.has(live)) return live;
    return H2H.userIdForName(o.name, o.alias) || live || null;
  };
  // Whether we could place BOTH owners in the archive at all. A zero record from
  // an id the archive never knew is not the same claim as "they have never
  // played", and the page must not make the second one on the strength of the
  // first.
  const inArchive = (o) => { const u = uidOf(o); return !!(u && archiveIds.has(u)); };

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
  const recordKnown = opp ? (inArchive(me) && inArchive(opp)) : true;

  // RIVALRY GAME OF THE WEEK — bill the matchup when these two have a real history.
  // The record is already computed (A-side = me), so the billing facts come free.
  let rivalry = null;
  if (opp) {
    const riv = RIV.billingFor(me.name, opp.name);
    if (riv) rivalry = Object.assign({}, riv, { notable: RIV.notableFrom(record, me.name, opp.name) });
  }

  // A-lane data, read defensively: present => render; absent => a labelled slot.
  const proj = (liveMatchup && liveMatchup.proj) || null;           // A supplies (per-player projections, optional)
  const highBand = (liveMatchup && liveMatchup.highBand) || null;   // A supplies (richer, live projections)

  // THE STARTERS CARD — assembled here, in B's lane, from the raw Sleeper matchup
  // rows so the two lineups are aligned BY LINEUP SLOT (QB vs QB, FLEX vs FLEX),
  // not by an independently-sorted row index. See src/matchup.js for why the old
  // index pairing was wrong. Needs the live bundle (starters + points) and the
  // player name DB; absent either, the card stays folded rather than half-drawn.
  let starters = null, bench = null;
  if (opp && live && sData && Array.isArray(sData.matchups) && liveMatchup && liveMatchup.me) {
    const myRid = liveMatchup.me.roster_id;
    const oppRid = liveMatchup.opp && liveMatchup.opp.roster_id;
    const myRow = sData.matchups.find(m => Number(m.roster_id) === Number(myRid)) || null;
    const oppRow = oppRid != null ? (sData.matchups.find(m => Number(m.roster_id) === Number(oppRid)) || null) : null;
    if (myRow) {
      try {
        const playersDb = await sleeper.players();
        const rosterPositions = (sData.league && sData.league.roster_positions)
          || (H.currentSeason(world.seasons) || {}).roster_positions || null;
        // Bye flags derived in-repo (nfl_byes.json) — no wait on A's feed.
        const byeOpts = { byeMap: MU.byeMapFor(sData.state && sData.state.season), weekNo };
        starters = MU.pairStarters(myRow, oppRow, rosterPositions, playersDb, proj, byeOpts);
        bench = MU.benchRows(myRow, oppRow, playersDb, byeOpts);
      } catch (e) { starters = null; bench = null; /* the card is a bonus — never break the page */ }
    }
  }

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
      const cut = PO.playoffCut(sData.league);
      const lev = PO.matchupLeverage(rows, gamesLeft, cut, me.id);
      if (lev) stakes = lev;
    }
  } catch (e) { /* leverage is a bonus */ }

  const liveStale = await liveFreshness();
  res.render('matchup', {
    liveStale,
    me, owners, opp, live, weekNo, matchup: liveMatchup, betWindow, record, recordKnown, rivalry,
    starters, bench, matchupBet, proj, highBand, whBand, whRace, pickem, stakes, trash,     // The availability badge is derived from the optimizer's INACTIVE_INJURY set
    // (src/matchup.js), not from a second ladder in the template.
    injuryFlag: MU.injuryFlag,
    goatId: MK.goatOwnerId(sData, world.config.sleeper_map || {}),
    configured: !!world.config.sleeper_league_id,
    late: req.query.late === '1', sent: req.query.sent === '1',
    betFail: betFailMessage(req.query.betfail),
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
  //
  // FREEZE-ON-READ (Annual audit fix): a finalized week's points are stored under
  // pickem-points:<season>:<week> the first time they're read. Without this the
  // all-time board silently DROPPED every completed season at rollover — a new
  // Sleeper league id can't refetch a PAST season's scores, so the resolver
  // returned null and the "never resets" board zeroed prior years. Freezing as
  // weeks finalize means the current season is fully captured by the time it
  // rolls, and the all-time board reads frozen points for every season.
  const frozenKey = (s, w) => `pickem-points:${s}:${w}`;
  const finalOnly = async w => {
    if (!(w <= weekNo - BL.CFG.GRADE_WEEK_LAG)) return null;
    const cached = await getDoc(frozenKey(seasonYear, w), null);
    if (cached && Object.keys(cached).length) return cached;
    const wp = await sleeper.weekPointsByOwner(leagueId, w, map);
    if (wp && Object.keys(wp).length) { try { await setDoc(frozenKey(seasonYear, w), wp); } catch (e) { /* freeze is best-effort */ } }
    return wp;
  };
  const sb = await PE.seasonBoard(seasonYear, weekNo, owners, finalOnly);

  // All-time: every season with pick'em data, summed forever. The resolver reads
  // FROZEN points for any season (so prior years survive the rollover), falling
  // back to a live fetch only for the current season's not-yet-frozen weeks.
  const slateKeys = await store.listKeys('pickem-slate:');
  const seasonsWithData = [...new Set(slateKeys.map(k => Number(k.split(':')[1])).filter(Boolean))].sort();
  const at = await PE.allTimeBoard(seasonsWithData, owners,
    async (s, w) => {
      const frozen = await getDoc(frozenKey(s, w), null);
      if (frozen && Object.keys(frozen).length) return frozen;
      return s === seasonYear ? await finalOnly(w) : null;
    },
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
    entries.push({ owner_id: (o[g.a] || {}).id, opp_id: (o[g.b] || {}).id, name: nm(g.a), oppName: nm(g.b), live: g.live, oppLive: g.oppLive, remain: g.remain, oppRemain: g.oppRemain });
    entries.push({ owner_id: (o[g.b] || {}).id, opp_id: (o[g.a] || {}).id, name: nm(g.b), oppName: nm(g.a), live: g.oppLive, oppLive: g.live, remain: g.oppRemain, oppRemain: g.remain });
  }
  return entries;
}
// Live entries from the scoreboard. Live scores are real; the "remaining
// players + projections" that sharpen the sweat come from A's per-player data
// when present (flagged in PARKED) — until then we have NO view of who is still
// to play, and `remainKnown: false` says so. It used to send a bare `remain: []`,
// which the engine could not tell apart from "the week is finished": zero
// variance, so every live game rendered a 100%/0% certainty and "Done — nothing
// left on the field" while the ball was in the air. Declaring the gap makes the
// panel fall back to the score, and it upgrades to the real sweat meter by
// itself the moment the feed exists.
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
    entries.push({ owner_id: a.oid, opp_id: b.oid, name: nameOf(a.oid), oppName: nameOf(b.oid), live: a.pts, oppLive: b.pts, remain: [], oppRemain: [], remainKnown: false });
    entries.push({ owner_id: b.oid, opp_id: a.oid, name: nameOf(b.oid), oppName: nameOf(a.oid), live: b.pts, oppLive: a.pts, remain: [], oppRemain: [], remainKnown: false });
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
  if (preview) { rows = WW.panelRows(pvEntries(owners), bandSamples, req.owner.id); source = 'preview'; }
  else if (inWindow && sData) {
    const anyScore = PE.anyScoreOnBoard(sData);
    if (anyScore) { rows = WW.panelRows(liveWatchEntries(sData, world.config.sleeper_map || {}, owners), bandSamples, req.owner.id); source = 'live'; }
  }
  res.render('watch', { me: req.owner, rows, source, inWindow, weekNo, band, preview,
    liveStale: await liveFreshness() });
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
  // The only catch in the route layer that stated no reason, and a reason is
  // the whole difference between a swallow you can review and one you cannot:
  // to satisfy myself this was safe I had to trace the consumer. So, written
  // down — an unreadable pick store leaves this empty, gameSplit then reports
  // total 0, and the scoreboard drops the split chip rather than printing a
  // split of nothing. That is an omission, not a wrong number, which is the
  // only reason it is allowed to pass quietly.
  if (locked) { try { allPicks = await PE.allPicksForWeek(seasonYear, weekNo); } catch (e) { /* see above: the chip is dropped, never faked */ } }

  // playoff picture (odds + clinch/elim) + per-game leverage, when there's a race
  let picture = null, gamesLeft = 0, cut = PO.playoffCut(sData && sData.league);
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
    // the live sweat line (Sun/Mon, undecided) — basic from live margin.
    // remainKnown:false for the same reason as the /watch panel: without the
    // per-player feed we cannot see who is still to play, so the icon must be
    // the neutral 🏈 rather than a 🟢/🔴 verdict on a one-point game.
    let sweat = null;
    if (primetime && hasScore && aPts != null && bPts != null) {
      const s = WW.sweat({ live: aPts, oppLive: bPts, remain: [], oppRemain: [], remainKnown: false });
      sweat = { ...WW.sweatLabel(s.pWin), leader: leader ? leader.name : null, margin: Math.abs(Math.round((aPts - bPts) * 10) / 10) };
    }
    return { g, aPts, bPts, hasScore, leader, split, riv, inWHRace, po, worth, sweat };
  });

  const liveStale = await liveFreshness();
  res.render('scoreboard', {
    liveStale,
    me, owners, weekNo, cards, locked, whRace, whBand,
    moneyBoard: L.moneyStandings(world.ledger, owners, season), meId: me.id,
    live: !!(livePts && Object.values(livePts).some(p => p > 0)),
    configured: !!world.config.sleeper_league_id,
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
    const wk = (matchup && matchup.week) || (sData && sData.state && sData.state.week) || null;
    const inactive = [];   // players the guard zeroed — surfaced so an absence is explained
    const questionable = [];  // players kept at full projection while tagged Q/DBT
    const rosterIn = roster.rows.filter(r => r.pos && r.pos !== '?').map(r => {
      let proj = null, src = null;
      if (r.proj != null) { proj = Number(r.proj); src = 'sleeper'; }
      else if (r.seasonPts != null && r.gp) { proj = Number(r.seasonPts) / Number(r.gp); src = 'season-avg'; }
      else if (r.wkPts != null) { proj = Number(r.wkPts); src = 'last-week'; }
      else { proj = 0; src = 'none'; }
      if (src === 'sleeper') projSource = 'sleeper';
      else if (projSource !== 'sleeper') projSource = src;
      // A player ruled OUT (or on bye once A exposes it) cannot score — force the
      // projection to zero so the solver never seats him. Without this, the
      // season-avg/last-week fallbacks above hand a benched player a full
      // projection and the tool would recommend starting him.
      const guarded = LO.activeProjection(Math.round(proj * 10) / 10, r, wk);
      if (LO.isInactive(r, wk)) {
        const onBye = wk != null && r.bye != null && Number(r.bye) === Number(wk);
        // `starter` matters more than the rest of the row: a zeroed BENCH player
        // is a note, a zeroed player who is CURRENTLY IN YOUR LINEUP is a dead
        // slot you have to fix before kickoff. The Sunday alert fires on that
        // distinction, so it is carried rather than re-derived downstream.
        inactive.push({ name: r.name, pos: r.pos, starter: !!r.starter,
          reason: onBye ? ('bye ' + r.bye) : (String(r.inj || 'out').trim()) });
      } else {
        // PLAYING THROUGH SOMETHING. The page named the players it ZEROED and
        // said nothing about the ones it kept at full projection while carrying
        // a Questionable or Doubtful tag — which on a Thursday is the only
        // player whose status is actually in question. The tool that exists to
        // tell you what to start was silent about the one uncertain starter.
        // Same MAYBE_INJURY set the matchup card badges from, not a third list.
        const tag = String(r.inj || '').toUpperCase().replace(/[^A-Z]/g, '');
        if (tag && MU.MAYBE_INJURY[tag]) {
          questionable.push({ name: r.name, pos: r.pos, starter: !!r.starter,
            tag: MU.MAYBE_INJURY[tag], raw: tag });
        }
      }
      return { id: r.id, name: r.name, pos: r.pos, proj: guarded, sd: r.sd };
    });
    // THE OPPONENT WE HAVE NOT SEEN YET. This used to fall back to
    // `band.median` — the WEEKLY-HIGH band, i.e. the median of the score that
    // WINS the week outright (148.5). A real opponent scores 110. So from
    // Tuesday to Sunday morning, the whole window in which a lineup is actually
    // set, the tool modelled the opponent as the week's top scorer, and that did
    // not merely make P(win) pessimistic — it flipped the RECOMMENDATION.
    // Measured on one ordinary roster: 148.5 gives P(win) 22%, a $1.64 edge, one
    // start/sit call and the posture "swing for the $100, the matchup is a long
    // shot"; 110 gives P(win) 64%, no edge, no calls, "protect the matchup". The
    // matchup term is P(win) x value, so a crushed P(win) suppresses it and the
    // solver over-chases the weekly high — manufacturing a puzzle on a week you
    // are a 64% favourite. Now: a typical TEAM score, with the FIELD's spread,
    // which is what an unknown opponent's uncertainty actually is.
    let oppMean = 0, oppKnown = false, oppSd;
    if (matchup && matchup.opp && matchup.opp.points > 0) { oppMean = matchup.opp.points; oppKnown = true; }
    else {
      const typical = LO.typicalTeamScore();
      oppMean = typical.median || band.median;
      oppSd = typical.sd || undefined;
    }
    // matchupValue omitted -> optimize() uses its derived playoff-equity default
    // ($110, draft/backtest/matchup_value.py). NOT a side bet (Cory, 2026-08-10).
    // THE LINEUP YOU ACTUALLY HAVE SET. Without it the solver compares its
    // recommendation to the projection-optimal lineup and never to yours, so
    // "nothing to change" meant "the two optima agree", not "you are fine".
    const currentIds = roster.rows.filter(r => r.starter && r.pos && r.pos !== '?').map(r => r.id);
    live = LO.optimize(rosterIn, { band, sigmaByPos, oppMean, oppSd, current: currentIds });
    live.oppKnown = oppKnown;
    live.inactive = inactive;
    live.questionable = questionable;
    // No live/season/last-week points anywhere yet (post-draft, pre-week-1): every
    // projection fell to the zero fallback, so the probabilities are meaningless.
    // Flag it so the view shows a calm "projections pending" state instead of a
    // 0%-to-win doom read off an all-zero board.
    live.projPending = projSource === 'none' || Number(live.ev.mean || 0) < 1;
  }
  const weekNo = (matchup && matchup.week) || (sData && sData.week) || 1;
  return { live, roster, matchup, projSource, band, weekNo };
}

/* ── THE WAIVER TOOL ─────────────────────────────────────────────────────────
 *
 * Commissioner-only (ACCESS-RULE.md: a recommendation surface). The engine has
 * existed for weeks in src/routes/waivers.js with no caller — "pure functions,
 * live wiring is the caller's job" — so this is the caller.
 *
 * ── WHAT THIS PAGE MUST REFUSE TO IMPLY ─────────────────────────────────────
 *
 * OUR LEAGUE RUNS PRIORITY WAIVERS, NOT FAAB. Priority is a DEPLETING resource:
 * one good claim and you drop to the bottom. So the decision is never "is this
 * player good", it is "is he worth spending my CURRENT POSITION on, or do I hold
 * for something better" — a stopping problem, conditional on the week, the order
 * position, and what is likely to appear later.
 *
 * THE ENGINE DOES NOT MODEL ANY OF THAT. It answers "what does this claim add to
 * my starting lineup, and what is that worth", which is the numerator of the
 * stopping rule and not the rule. `whoElseNeeds` derives the one input a stopping
 * rule would need — who else is short at the position — and the valuation throws
 * it away.
 *
 * So the page states the gap rather than papering over it. A ranked list
 * presented as the answer would be answering a question nobody asked, and the
 * one thing worse than a tool that cannot decide is a tool that looks like it
 * did.
 */
router.get('/waivers', requireCommissioner, aw(async (req, res) => {
  const world = req.world;
  const owners = H.activeOwners(world.owners);
  const me = req.owner;
  const season = String(H.currentSeason(world.seasons).year || new Date().getUTCFullYear());
  const W = require('./waivers');

  let claims = [], drop = null, perPoint = 0, weekNo = null, err = null, live = false;
  try {
    const sData = await sleeper.bundle(world.config.sleeper_league_id);
    if (sData && Array.isArray(sData.rosters) && sData.rosters.length) {
      weekNo = sData.week || (sData.state && sData.state.week) || null;
      const map = world.config.sleeper_map || {};
      const myRid = Object.keys(map).find(rid => Number(map[rid]) === Number(me.id));
      const playersDb = await sleeper.players();
      let artifact = {};
      try {
        artifact = JSON.parse(fs.readFileSync(
          path.join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
      } catch (e) { artifact = {}; }
      const inputs = W.waiverInputsFromBundle(sData, playersDb, artifact, myRid);
      if (inputs && inputs.myRoster.length) {
        live = true;
        const band = LO.weeklyHighBand();
        // The league's own slot template, not a default — a wrong template
        // prices every claim against a lineup we do not play.
        const template = (sData.league && sData.league.roster_positions) || null;
        const league = { teams: (sData.league && sData.league.total_rosters) || owners.length,
                         starters: template ? LO.slotsFromTemplate(template) : LO.DEFAULT_SLOTS };
        // Rank by what reaches the field, and only look at the top of the wire —
        // a full FA pool is thousands of names and the tail is all zeros.
        const typical = LO.typicalTeamScore();
        const res2 = W.evaluateClaims(inputs.freeAgents, inputs.myRoster, league, {
          band, lineupMean: typical.median, lineupSd: typical.sd, oppMean: typical.median,
          leagueRosters: Object.fromEntries((sData.rosters || [])
            .filter(r => String(r.roster_id) !== String(myRid))
            .map(r => [r.roster_id, (r.players || []).map(pid => {
              const info = (playersDb && playersDb.players && playersDb.players[pid]) || {};
              return { player_id: pid, position: info.pos, proj_mean: null };
            }).filter(p => p.position)])),
        });
        drop = res2.drop; perPoint = res2.dollars_per_point;
        claims = res2.claims.filter(c => c.net_value > 0).slice(0, 8);
      }
    }
  } catch (e) { err = String((e && e.message) || e); }

  res.render('waivers', {
    me, season, weekNo, live, err, claims, drop, perPoint,
    liveStale: await liveFreshness(),
  });
}));

// ── WAIVER CLAIM CAPTURE (2026-08-15) — the missing half of the in-season ledger.
//
// `waiver_claim` has been a registered, gradeable ledger kind since before the
// draft (src/predledger.js COUNTERFACTUAL_KINDS, graded by
// src/forecast_grade.js's INSEASON_DECISION_KINDS) and nothing ever wrote one.
// Found by re-running draft/tools/loop_closure.js after fixing two real bugs in
// it (see that commit) — lineup_call and inseason_override turned out to
// already be captured this exact way (POST /lineup/log, POST /lineup/override,
// both in this file); waiver_claim was the one of the three still genuinely
// missing that has a clean, unambiguous decision moment to hook.
//
// SAME PATTERN, DELIBERATELY. Two forms, matching /lineup/log + /lineup/override
// below: "Log this claim" preserves the tool's pick as the decision with a
// counterfactual; the reason chips record going another way, with the tool's
// pick AS the counterfactual this time — same shape, same reasoning, so a reader
// of one understands the other for free.
//
// THE COUNTERFACTUAL IS "hold priority", NOT A SPECIFIC ALTERNATIVE PLAYER. This
// page's own header (and its own text below) is explicit that the real decision
// is a stopping problem the engine does not model — spend your position now or
// wait for something better — so "I would have held" is the one alternative the
// page itself already commits to, not a guess about a substitute I might have
// claimed instead. A future page that DOES surface a #2 option can pass a real
// one; nothing here forecloses that, it just does not invent one today.
router.post('/waivers/log', requireCommissioner, aw(async (req, res) => {
  const season = String(H.currentSeason(req.world.seasons).year || new Date().getUTCFullYear());
  const predledger = require('../predledger');
  try {
    await predledger.append(store, {
      kind: 'waiver_claim',
      method: 'waiver-tool-v1',
      season,
      payload: {
        owner_id: req.owner.id,
        week: req.body.week ? Number(req.body.week) : null,
        chosen: safeJson(req.body.chosen),
        // REQUIRED: what I'd have done without the tool.
        counterfactual: 'hold priority',
        drop: safeJson(req.body.drop),
        dollars: req.body.dollars != null ? Number(req.body.dollars) : null,
        contested: req.body.contested === '1',
      },
    });
  } catch (e) { /* fail soft on the redirect; the API path surfaces errors */ }
  res.redirect('/waivers?logged=1');
}));

router.post('/waivers/override', requireCommissioner, aw(async (req, res) => {
  const season = String(H.currentSeason(req.world.seasons).year || new Date().getUTCFullYear());
  const predledger = require('../predledger');
  try {
    await predledger.append(store, {
      kind: 'inseason_override',
      method: 'waiver-override-v1',
      season,
      payload: {
        owner_id: req.owner.id,
        week: req.body.week ? Number(req.body.week) : null,
        // What I went against. For an override the tool's claim is BOTH the
        // thing overridden and the counterfactual — same convention as
        // /lineup/override immediately below.
        recommended: safeJson(req.body.recommended),
        counterfactual: safeJson(req.body.recommended),
        gap_dollars: req.body.dollars != null ? Number(req.body.dollars) : null,
        reason: String(req.body.reason || 'unstated').slice(0, 60),
      },
    });
  } catch (e) { /* fail soft on the redirect; the API path surfaces errors */ }
  res.redirect('/waivers?overrode=1');
}));

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

  let sendResult = null;
  if (req.query.sent === '1') { sendResult = req.session.sundaySend || null; delete req.session.sundaySend; }

  res.render('lineup', {
    me, owners, tab, season, band, live, projSource, roster, matchup, weekNo, alert,
    posture: live ? LO.weeklyPosture(live, band) : null,   // chase vs protect — the week's one real call
    proof, eff, myLeak: Math.round(myLeak), drill,
    configured: !!world.config.sleeper_league_id,
    logged: req.query.logged === '1',
    overrode: req.query.overrode === '1',
    // The optimizer converts this data into a dollar recommendation, so it needs
    // the staleness banner at least as much as the pages that only display it.
    liveStale: await liveFreshness(),
    sent: req.query.sent === '1',
    // Read once and cleared, so a refresh doesn't re-announce an hour-old send as
    // if it just happened. Cleared BEFORE the render — cookie-session writes its
    // Set-Cookie on res.end, so a delete after render never reaches the browser.
    sendResult,
  });
}));

// ---------- MODEL ACCURACY (commissioner-only — model internals, not results) ----------
// The display half of the learning loop. A's weekly grading writes a calibration
// ledger and an attribution table; this reads them and shows how well the model
// has predicted, what got graded, the attribution table filling in, and the
// biggest misses. Commissioner-only for the same reason as the optimizer: this is
// model internals, not league property. Degrades honestly before A has graded
// anything — the engine (accuracy.js) is pure; this is just the gather + render.
router.get('/lineup/accuracy', requireCommissioner, aw(async (req, res) => {
  const world = req.world;
  const season = String(H.currentSeason(world.seasons).year || new Date().getUTCFullYear());
  // THE GRADER WRITES AN APPEND-ONLY LEDGER, not a flat doc: grade-cron stores
  // `calibration:<season>:<ISO>` per run. This route used to read a flat
  // `calibration:<season>` that NOTHING EVER WRITES, so the page would have sat
  // at "nothing graded yet" forever — the whole learning loop invisible on the
  // one page that exists to show it. Read the ledger, newest snapshot wins, and
  // keep the series for calibration-over-time.
  let snapshots = [];
  try {
    const keys = (await store.listKeys(`calibration:${season}:`)).sort();   // ISO keys sort chronologically
    for (const k of keys) { const s = await store.get(k); if (s) snapshots.push(s); }
  } catch (e) { snapshots = []; }
  const latest = snapshots.length ? snapshots[snapshots.length - 1] : null;

  // Map the grader's nested snapshot onto the flat shape the view engine reads.
  // A owns the snapshot shape; B adapts at the seam rather than asking A to
  // reshape output that other consumers (evidence weights) already depend on.
  // Ledger first (what the cron writes); fall back to a flat doc if one is ever
  // present, so the page renders from whichever exists rather than depending on
  // one writer. A snapshot that is already flat is used as-is.
  const flat = await getDoc(`calibration:${season}`, null);
  const calibration = latest && latest.forecasts
    ? Object.assign({}, latest.forecasts, { generated_at: latest.graded_at || null })
    : (latest && latest.n_graded != null
        ? Object.assign({}, latest, { generated_at: latest.graded_at || latest.generated_at || null })
        : flat);
  // The decision/override half — already graded by the cron, never surfaced.
  const decisions = latest && latest.decisions ? latest.decisions : null;
  // Calibration OVER TIME: one point per grading run.
  const series = snapshots.map(s => ({
    at: s.graded_at || null,
    graded: (s.forecasts && s.forecasts.n_graded) || 0,
    brier: s.forecasts && s.forecasts.probability ? s.forecasts.probability.brier : null,
  })).filter(p => p.at);

  // No `attribution:<season>` writer exists yet (parked for A) — stays null, and
  // the view renders an honest "not yet" rather than an empty table.
  const attribution = await getDoc(`attribution:${season}`, null);
  let rawCount = 0;
  const ledger = [];
  try {
    const keys = (await store.listKeys(`pred:${season}:`)).sort();
    rawCount = keys.length;
    for (const k of keys) { const e = await store.get(k); if (e) ledger.push(e); }
  } catch (e) { /* count is a bonus */ }
  // THE OVERRIDES AS CAPTURED, not as graded. The grader's decision join reads
  // the DRAFT kinds (recommendation/pick/override); the in-season kinds this site
  // writes — lineup_call and inseason_override — aren't in that join yet (parked
  // for A). Without this the page would show nothing all season while the ledger
  // filled up, which is the same "measured but never surfaced" failure the
  // override card was built to fix. Read straight off the ledger and label it
  // honestly as awaiting grading.
  const captured = ACC.capturedOverrides(ledger);
  const view = ACC.buildAccuracyView(calibration, attribution, rawCount, { series, decisions, captured });
  res.render('accuracy', { me: req.owner, season, view });
}));

// THE ROSTER ANALYZER — league-wide projected rest-of-season: playoff odds,
// expected wins, seed distribution, and the POSTURE the other tools consume
// (lock / contender / desperate / chasing_high). Commissioner-only, same as the
// other in-season recommendation surfaces (ACCESS-RULE): "who is desperate" is
// analysis, not a league-visible result.
//
// Renders A's engine (src/routes/standings.js) — B builds the view, never a
// second projection. The engine takes a SEASON OBJECT (LO.seasonOf), not a year
// string: passing the bare string silently returns zero rows (its own comment
// warns of this), which is exactly the "looks fine, means nothing" failure mode.
router.get('/analyzer', requireCommissioner, aw(async (req, res) => {
  const ST = require('./standings');
  const history = LO.harvest();
  const seasons = LO.defaultSeasons(history);           // harvested seasons, newest last
  const wanted = String(req.query.season || seasons[seasons.length - 1] || '');
  const seasonObj = LO.seasonOf(history, wanted);
  const weeks = seasonObj ? LO.regularSeasonWeeks(seasonObj) : [];
  const lastWeek = weeks.length ? weeks[weeks.length - 1] : 0;
  const qWeek = parseInt(req.query.week, 10);
  // DEFAULT to the LIVE week when the season is in flight, else a mid-season
  // checkpoint. Defaulting to the final week is degenerate: with every game
  // played the simulator has nothing left to simulate and every probability
  // collapses to 100%/0% — a table that looks confident and says nothing.
  // `world` was never declared in this route. Every call threw a ReferenceError
  // on the line below, the catch swallowed it as "offline", and the live-week
  // default documented directly above HAS NEVER ONCE RUN — the analyzer always
  // fell through to the mid-season checkpoint, including during a live season.
  // A catch whose comment names a cause it cannot distinguish will hide any
  // other cause forever, so it is narrowed to the fetch it is there for.
  const world = req.world;
  let liveWeek = null, liveLeague = null;
  try {
    const sData = await sleeper.bundle(world.config.sleeper_league_id);
    if (sData && String(sData.state && sData.state.season) === String(wanted)) {
      liveWeek = sData.week;
      liveLeague = sData.league;      // only THIS season's cut applies to it
    }
  } catch (e) { /* Sleeper unreachable: fall through to the checkpoint */ }
  const defaultWeek = liveWeek && liveWeek <= lastWeek ? liveWeek
    : (lastWeek ? Math.max(1, Math.min(lastWeek - 1, Math.round(lastWeek * 0.6))) : 0);
  const throughWeek = Number.isFinite(qWeek) ? Math.max(1, Math.min(qWeek, lastWeek)) : defaultWeek;

  let rows = [], validation = null, err = null, projSpots = ST.PLAYOFF_SPOTS;
  if (seasonObj) {
    try {
      // The cut the analyzer simulates with is the league's own, from the same
      // definition /matchup and the standings column read — not the engine's
      // default. `proj.spots` is then what the page draws its line at, so the
      // line and the odds beside it can never describe different playoff fields.
      const proj = ST.projectStandings(seasonObj, { throughWeek, sims: 3000, seed: 4242,
        // A past season is graded on the engine's default; only the live
        // season gets the league's current cut.
        spots: liveLeague ? PO.playoffCut(liveLeague) : ST.PLAYOFF_SPOTS });
      const owners = seasonObj.owners || {};
      // C3: the raw projection alongside every dollar/odds figure, from the ONE
      // shared derivation. Here the team-level analogue is the strength mean —
      // labelled as what it is (realized weekly average), never as our valuation.
      rows = proj.projections.map(p => {
        const o = owners[String(p.rid)] || {};
        return {
          rid: p.rid,
          name: o.display_name || ('Roster ' + p.rid),
          team: o.team_name || '',
          expWins: Math.round(p.exp_wins * 10) / 10,
          playoffProb: p.playoff_prob,
          posture: p.posture,
          strengthMean: p.strength_mean == null ? null : Math.round(p.strength_mean * 10) / 10,
          topSeed: p.seed_dist && p.seed_dist['1'] != null ? p.seed_dist['1'] : null,
        };
      });
      projSpots = proj.spots;
    } catch (e) { err = e.message; }
  }
  try { validation = ST.validateStandings(); } catch (e) { /* the caveat is a bonus */ }

  res.render('analyzer', {
    me: req.owner, rows, seasons, season: wanted, throughWeek, lastWeek,
    validation, err, playoffSpots: projSpots,
  });
}));

// Send the Sunday alert to the commissioner now (rehearsal, and the manual fire).
// The weekly cron hits the same logic via /api/sunday-alert with a secret.
// THIS BUTTON IS HOW YOU FIND OUT WHETHER THE EMAIL REACHES YOU AT ALL, so it
// has to report what actually happened. It used to `.catch(() => {})` the send
// and redirect to a banner reading "Sunday alert sent to your inbox" — true when
// it worked, and equally true when Resend rejected it. The default sender is
// Resend's shared `onboarding@resend.dev`, which only delivers to the address
// that owns the Resend account, so a provider refusal is the LIKELY first
// outcome in production and it was the one state the rehearsal could not show.
// The provider's own message is the useful string here, so it is carried in the
// session rather than the URL.
router.post('/lineup/sunday/send', requireCommissioner, aw(async (req, res) => {
  const owners = H.activeOwners(req.world.owners);
  const { live, band, weekNo } = await liveOptimizeFor(req.world, owners, req.owner);
  let outcome = 'nolive', detail = null;
  if (live) {
    const alert = LO.sundayAlert(live, { week: weekNo, band });
    // The owner LIST, not req.owner. requireCommissioner already gates this
    // route, so passing the logged-in user is correct TODAY — and that is
    // precisely the kind of correctness that stops being true when a guard is
    // relaxed. The mailer resolves it either way.
    const r = await notify.sundayAlert(req.world.owners, alert)
      .catch(e => ({ error: String((e && e.message) || e) }));
    if (r && r.sent) outcome = 'ok';
    else if (r && r.error) { outcome = 'failed'; detail = r.error; }
    else if (!notify.configured()) outcome = 'noemail';
    else { outcome = 'refused'; detail = (r && (r.note || r.reason)) || null; }
  }
  // The session is a signed COOKIE — a long provider message would bloat it, so
  // the detail is capped rather than trusted to be short.
  req.session.sundaySend = { outcome, detail: detail ? String(detail).slice(0, 180) : null, week: weekNo };
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

// THE OVERRIDE CAPTURE — the other half, and the half that was missing.
//
// `inseason_override` has been a registered ledger kind with an enforced
// counterfactual since before the draft, and NOTHING EVER WROTE ONE. The page
// could only record agreement: press "Log this lineup" and the tool's call is
// preserved; go against it and there is no button, so the disagreement leaves no
// trace at all. That is the exact record the attribution question needs — "how
// often did the human override, and did it pay" is unanswerable from a ledger
// that only stores the weeks he agreed.
//
// ONE TAP, IN THE FLOW. Every field below is already on the page at the moment
// of the decision; nothing is asked of the user but the tap itself. The reason
// chips are submit buttons, so choosing a reason IS the tap rather than a step
// after it. Reconstructing an override afterwards loses most of its value, so
// the capture is never allowed to cost more than one press.
//
// WHAT IT DOES NOT CAPTURE, deliberately: the lineup actually played. That is
// recoverable from Sleeper after the fact. The tool's recommendation AT THE
// MOMENT is not recoverable from anything, which is why it is what gets written.
router.post('/lineup/override', requireCommissioner, aw(async (req, res) => {
  const season = String(H.currentSeason(req.world.seasons).year || new Date().getUTCFullYear());
  const predledger = require('../predledger');
  const gap = req.body.dollars != null ? Number(req.body.dollars) : null;
  try {
    await predledger.append(store, {
      kind: 'inseason_override',
      method: 'lineup-override-v1',
      season,
      payload: {
        owner_id: req.owner.id,
        week: req.body.week ? Number(req.body.week) : null,
        // What I went against. For an override the tool's lineup is BOTH the
        // thing overridden and the counterfactual — "what I would plausibly have
        // done otherwise" is precisely what the tool told me to do.
        recommended: safeJson(req.body.recommended),
        counterfactual: safeJson(req.body.recommended),
        // THE GAP, raw. Stored as the dollar figure rather than only as a
        // contested/not flag, so a threshold can be re-drawn later without
        // having thrown away the number it was drawn from.
        gap_dollars: gap,
        // CONTESTED = the model was close to indifferent, so going the other way
        // costs almost nothing and should not be scored against the human. The
        // threshold is stated here rather than implied: under $2 of edge is
        // inside the week-to-week noise of the projections it is computed from.
        contested: gap != null ? Math.abs(gap) < 2 : null,
        reason: String(req.body.reason || 'unstated').slice(0, 60),
        confidence: String(req.body.confidence || '').slice(0, 600),
      },
    });
  } catch (e) { /* fail soft on the redirect; the API path surfaces errors */ }
  res.redirect('/lineup?overrode=1');
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
  // THE CONSTITUTION MUST NOT DISAGREE WITH THE BALLOT.
  //
  // The vote threshold is live-settable (Commish → Season, 1–20), and /votes
  // renders it from `H.voteThreshold(config)` — but this page hardcoded "6", in
  // its subtitle and in the stored rules list. Change the threshold and the two
  // surfaces disagree about the rule that governs changing the rules, with the
  // wrong number on the page people actually cite in an argument.
  //
  // The stored list lives in seed-data (A's lane), so the substitution happens
  // here at the render seam. It is anchored on the exact sentence: if that rule
  // is ever reworded, this becomes a no-op rather than corrupting the text.
  const threshold = H.voteThreshold(req.world.config);
  const rules = RULES.map(r =>
    r.replace(/^All rule changes approved by \d+ votes$/i,
      `All rule changes approved by ${threshold} votes`));
  res.render('rules', { RULES: rules, SCORING, ROSTER, season, threshold,
    payouts: H.payoutTable(season) });
}));

module.exports = router;
