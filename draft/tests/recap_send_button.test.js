'use strict';
// THE BUTTON THAT EMAILS NINE PEOPLE.
//
// recap_wiring.test.js drives the cron and the preview page. It does not press
// `POST /admin/recap/send`, which is the highest-consequence route on the whole
// site: one click, nine inboxes, no undo, no reply. It had never been executed.
//
// Everything here is a property that only fails ONCE, in public:
//   • it must not send a week that is not finished, even when asked directly;
//   • it must not send twice, or send a week the cron already covered without
//     that being a deliberate act;
//   • it must go to the LEAGUE, not to the commissioner alone;
//   • a member must not be able to press it;
//   • and it must report what actually happened rather than redirecting to a
//     success page — the same defect already found on the Sunday rehearsal
//     button, which said "sent to your inbox" whether or not it sent.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rsb-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { getDoc } = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 240) : ''))); };
const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const SEASON_POOL = [
  ['q1', 'Josh Allen', 'QB'], ['r1', 'Bijan Robinson', 'RB'], ['r2', 'Breece Hall', 'RB'],
  ['w1', "Ja'Marr Chase", 'WR'], ['w2', 'Puka Nacua', 'WR'], ['t1', 'Sam LaPorta', 'TE'],
  ['r3', 'Jahmyr Gibbs', 'RB'], ['k1', 'Harrison Butker', 'K'], ['d1', 'Ravens D/ST', 'DEF'],
  ['w3', 'Garrett Wilson', 'WR'],
];

const wire = [];
const realFetch = global.fetch;
let providerRejects = false;
global.fetch = async (url, opts) => {
  if (String(url).includes('resend')) {
    if (providerRejects) return { ok: false, status: 403, text: async () => '{"message":"nope"}' };
    let b = {}; try { b = JSON.parse(opts.body); } catch (e) { /* raw */ }
    wire.push({ to: [].concat(b.to || []), subject: b.subject });
    return { ok: true, status: 200, text: async () => '{}' };
  }
  if (String(url).includes('127.0.0.1')) return realFetch(url, opts);
  return { ok: false, status: 500, text: async () => '' };
};

(async () => {
  process.env.RESEND_API_KEY = 'test-key';
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  cory.is_commissioner = true;
  const active = owners.filter(o => o.active).slice(0, 10);
  active.forEach((o, i) => {
    o.email = `owner${i}@example.com`;
    o.password_hash = hashPassword('pw'); o.must_change_password = false;
  });
  const member = active.find(o => o.id !== cory.id && !o.is_commissioner);
  await store.set('owners', owners);
  const cfg = await store.get('config');
  const lid = cfg.sleeper_league_id || 'TESTLEAGUE';
  cfg.sleeper_league_id = lid;
  cfg.sleeper_map = {}; active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', cfg);
  const YEAR = String(H.currentSeason(await store.get('seasons')).year);

  const seed = async (stateWeek, scores) => {
    const slim = {};
    for (const [id, name, pos] of SEASON_POOL) slim[id] = { name, pos, team: 'XXX', rank: 1, inj: null };
    await store.set('players-cache', { fetched_at: Date.now(), data: { players: slim, count: SEASON_POOL.length } });
    const mus = active.map((o, i) => {
      const starters = SEASON_POOL.slice(0, 9).map(p => p[0]);
      const pp = {}; starters.forEach(id => { pp[id] = Math.round((scores[i] / 9) * 10) / 10; });
      SEASON_POOL.forEach(p => { if (pp[p[0]] == null) pp[p[0]] = 0; });
      return { roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: scores[i],
               starters, players: SEASON_POOL.map(p => p[0]), players_points: pp };
    });
    await store.set('sleeper-cache', {
      league_id: lid, fetched_at: Date.now(),
      data: { state: { week: stateWeek, season: YEAR },
        league: { name: 'MFGA', season: YEAR, total_rosters: 10, settings: { playoff_week_start: 15 } },
        users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
        rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
          players: SEASON_POOL.map(p => p[0]), settings: { wins: 4, losses: 3, fpts: 700 } })),
        matchups: mus, week: stateWeek } });
  };

  const FINAL = [151.2, 150.6, 128.0, 67.4, 119.9, 102.2, 111.0, 110.4, 96.6, 95.1];
  const UNPLAYED = [151.2, 0, 128.0, 67.4, 119.9, 102.2, 111.0, 110.4, 96.6, 95.1];

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const loginAs = async o => {
    const r = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(o.username)}&password=pw` });
    return (r.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  };
  const cook = await loginAs(cory);
  // Press the button and READ THE PAGE IT LANDS ON, not just the redirect —
  // a route that reports its outcome only in a query string it never renders
  // is the same defect as one that reports nothing.
  const press = async (week, cookie = cook) => {
    const before = wire.length;
    const r = await fetch(base + '/admin/recap/send', { method: 'POST', redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: `week=${week}` });
    const loc = r.headers.get('location') || '';
    const page = loc.startsWith('/') ? strip(await (await fetch(base + loc, { headers: { cookie } })).text()) : '';
    return { status: r.status, loc, page, sent: wire.slice(before) };
  };

  // ── A MEMBER CANNOT PRESS IT ─────────────────────────────────────────────
  {
    const mcook = await loginAs(member);
    const before = wire.length;
    const r = await fetch(base + '/admin/recap/send', { method: 'POST', redirect: 'manual',
      headers: { cookie: mcook, 'content-type': 'application/x-www-form-urlencoded' }, body: 'week=9' });
    ck('a member cannot send the recap', r.status >= 300 && !/^\/admin\/recap/.test(r.headers.get('location') || ''),
      { status: r.status, loc: r.headers.get('location') });
    ck('  and nothing went out', wire.length === before, wire.slice(before));
  }
  {
    const before = wire.length;
    const r = await fetch(base + '/admin/recap/send', { method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'week=9' });
    ck('a logged-out visitor cannot send it', r.status >= 300, r.status);
    ck('  and nothing went out', wire.length === before, wire.slice(before));
  }

  // ── AN UNFINISHED WEEK IS REFUSED EVEN WHEN ASKED DIRECTLY ───────────────
  // The cron refuses on its own. The BUTTON is the path where a human overrides
  // the schedule, and it must not also override the truth.
  await seed(10, UNPLAYED);
  {
    const r = await press(9);
    ck('an unfinished week is NOT sent, even by hand', r.sent.length === 0, r.sent);
    // ASSERT THE OUTCOME, NOT A WORD ON THE PAGE. The first version of this
    // checked /not finished/ against the rendered HTML and stayed GREEN when the
    // route's refusal was deleted — the preview panel below the banner carries
    // similar prose, so the page said the right thing for the wrong reason while
    // the route no longer refused anything. Rule 10 caught it; the fix is to read
    // the outcome the route actually reported.
    ck('  the ROUTE reports week-not-final, not merely a page that mentions it',
      /[?&]sent=week-not-final/.test(r.loc), r.loc);
    ck('  and the banner names it', /not finished/i.test(r.page),
      (r.page.match(/.{0,140}not finished.{0,80}/i) || [''])[0]);
    ck('  it does not report success', !/Sent to the league/i.test(r.page),
      (r.page.match(/.{0,80}Sent to the league.{0,40}/i) || [''])[0]);
  }

  // ── A FINISHED WEEK GOES, TO EVERYONE ────────────────────────────────────
  await seed(10, FINAL);
  {
    const r = await press(9);
    ck('a finished week sends', r.sent.length === 1, r.sent.length);
    ck('  to the whole league, not the commissioner alone',
      r.sent.length === 1 && r.sent[0].to.length === active.filter(o => o.email).length,
      r.sent[0] && r.sent[0].to.length);
    ck('  and the page confirms it', /Sent to the league/i.test(r.page),
      (r.page.match(/.{0,80}Sent.{0,60}/i) || [''])[0]);
    const stamp = await getDoc(`weekly-recap-sent:${YEAR}:9`, null);
    ck('  the send is stamped, so the cron will not repeat it', !!stamp, stamp);
    ck('  and stamped as a MANUAL send, distinguishable from the cron',
      stamp && stamp.manual === true, stamp);
  }

  // ── PRESSED AGAIN: an explicit click is a request, and it says so ─────────
  // The cron dedupes; the button deliberately does not, because a human asking
  // twice means it. What it must NOT do is pretend the second one was the first.
  {
    const r = await press(9);
    ck('a second press does send again — an explicit click is a request',
      r.sent.length === 1, r.sent.length);
    ck('  and the page still shows the week already went out once',
      /already went out/i.test(r.page), (r.page.match(/.{0,100}already went.{0,60}/i) || [''])[0]);
  }

  // ── THE PROVIDER REJECTS IT ──────────────────────────────────────────────
  // The Sunday rehearsal button had exactly this defect: it reported a send that
  // never happened. This one must not, and it must not stamp a failure as done.
  {
    providerRejects = true;
    const before = await getDoc(`weekly-recap-sent:${YEAR}:8`, null);
    const r = await press(8);
    ck('a REJECTED send does not claim success', !/Sent to the league/i.test(r.page),
      (r.page.match(/.{0,100}Sent to the league.{0,40}/i) || [''])[0]);
    ck('  it says the provider rejected it', /rejected it|Nothing arrived/i.test(r.page),
      (r.page.match(/.{0,120}rejected.{0,60}/i) || [''])[0]);
    const after = await getDoc(`weekly-recap-sent:${YEAR}:8`, null);
    ck('  and it does NOT stamp a failure as sent — the cron must still retry',
      after === before, { before, after });
    providerRejects = false;
  }

  // ── NO WEEK AT ALL ───────────────────────────────────────────────────────
  {
    const r = await press('');
    ck('an empty week sends nothing and says so',
      r.sent.length === 0 && /No week to send/i.test(r.page),
      (r.page.match(/.{0,80}No week.{0,40}/i) || [''])[0]);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
