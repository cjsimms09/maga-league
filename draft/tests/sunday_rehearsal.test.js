'use strict';
// THE REHEARSAL BUTTON — "📤 Send it to me now".
//
// This is the only way to answer the question that matters about a Sunday-morning
// email: does it reach me at all when I am not looking at the site? It swallowed
// the send result (`.catch(() => {})`) and redirected to a banner reading
// "Sunday alert sent to your inbox" — true when it worked, and equally true when
// the provider rejected it.
//
// That is not a hypothetical rejection. The default sender is Resend's shared
// `onboarding@resend.dev`, which only delivers to the address that owns the
// Resend account, so a refusal is the LIKELY first outcome in production — and
// it was the one state the rehearsal could not show.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'reh-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 200) : ''))); };
const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const SEASON = '2026';
const SQUAD = [['p1', 'Josh Allen', 'QB', 'BUF', 21.4], ['p2', 'Bijan Robinson', 'RB', 'ATL', 16.2],
  ['p3', 'Breece Hall', 'RB', 'NYJ', 14.1], ['p4', "Ja'Marr Chase", 'WR', 'CIN', 17.8],
  ['p5', 'Puka Nacua', 'WR', 'LAR', 15.3], ['p6', 'Sam LaPorta', 'TE', 'DET', 11.2],
  ['p7', 'Jahmyr Gibbs', 'RB', 'DET', 13.6], ['p8', 'Harrison Butker', 'K', 'KC', 8.4],
  ['p9', 'Ravens D/ST', 'DEF', 'BAL', 7.9], ['p10', 'Garrett Wilson', 'WR', 'NYJ', 12.7]];

// The wire, and what it is told to do this time.
let mode = 'accept';
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('resend')) {
    if (mode === 'reject') {
      return { ok: false, status: 403,
        text: async () => '{"message":"You can only send testing emails to your own email address"}' };
    }
    return { ok: true, status: 200, text: async () => '{}' };
  }
  return realFetch(url, opts);
};

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  cory.is_commissioner = true; cory.email = 'cory@example.com';
  await store.set('owners', owners);
  const active = owners.filter(o => o.active).slice(0, 10);
  const cfg = await store.get('config');
  const lid = cfg.sleeper_league_id || 'TESTLEAGUE';
  cfg.sleeper_league_id = lid;
  cfg.sleeper_map = {}; active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', cfg);
  const myRid = Object.keys(cfg.sleeper_map).find(k => cfg.sleeper_map[k] === cory.id);

  const seed = async live => {
    if (!live) { await store.set('sleeper-cache', null); return; }
    const slim = {};
    for (const [id, name, pos, team] of SQUAD) slim[id] = { name, pos, team, rank: 1 + Number(id.slice(1)), inj: null };
    await store.set('players-cache', { fetched_at: Date.now(), data: { players: slim, count: SQUAD.length } });
    const seas = {}, wk = {};
    for (const [id, , , , proj] of SQUAD) { seas[id] = { pts_half_ppr: proj * 6, gp: 6 }; wk[id] = { pts_half_ppr: proj }; }
    await store.set(`stats-cache:${SEASON}:season`, { fetched_at: Date.now(), data: seas });
    await store.set(`stats-cache:${SEASON}:8`, { fetched_at: Date.now(), data: wk });
    await store.set('sleeper-cache', {
      league_id: lid, fetched_at: Date.now(), cached: new Date().toISOString(),
      data: { state: { week: 9, season: SEASON }, league: { name: 'MFGA', season: SEASON, total_rosters: 10 },
        users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
        rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
          players: String(i + 1) === String(myRid) ? SQUAD.map(p => p[0]) : [],
          starters: String(i + 1) === String(myRid) ? SQUAD.slice(0, 9).map(p => p[0]) : [],
          settings: { wins: 4, losses: 2, fpts: 700 } })),
        matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: 0 })),
        week: 9 } });
  };

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  let cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');

  // Post the button, follow the redirect by hand so the session cookie carries.
  const press = async () => {
    const r = await fetch(base + '/lineup/sunday/send', { method: 'POST', redirect: 'manual', headers: { cookie } });
    const set = (r.headers.getSetCookie() || []).map(x => x.split(';')[0]);
    if (set.length) cookie = set.join('; ');
    const page = await fetch(base + '/lineup?sent=1', { headers: { cookie } });
    const set2 = (page.headers.getSetCookie() || []).map(x => x.split(';')[0]);
    const body = strip(await page.text());
    if (set2.length) cookie = set2.join('; ');
    return body;
  };

  await seed(true);

  // ── the provider rejects it: nothing arrived, and it must say so ───────────
  process.env.RESEND_API_KEY = 'test-key';
  mode = 'reject';
  {
    const t = await press();
    ck('a REJECTED send does not claim it reached your inbox',
      !/sent to your inbox/i.test(t), (t.match(/.{0,120}inbox.{0,80}/i) || [''])[0]);
    ck('  it says nothing arrived', /rejected it/i.test(t) && /nothing arrived/i.test(t),
      (t.match(/.{0,160}rejected.{0,80}/i) || [''])[0]);
    ck('  it carries the provider\'s own message', /only send testing emails/i.test(t),
      (t.match(/.{0,60}testing emails.{0,60}/i) || [''])[0]);
    ck('  and names the likely cause, which is the default sender',
      /onboarding@resend.dev/.test(t) && /NOTIFY_FROM/.test(t));
  }

  // ── it works ───────────────────────────────────────────────────────────────
  mode = 'accept';
  {
    const t = await press();
    ck('an ACCEPTED send says so', /sent to your inbox/i.test(t));
    ck('  and points at spam, because that is the next place it goes wrong',
      /check spam/i.test(t));
    ck('  it does not also show a failure', !/rejected it/i.test(t) && !/refused/i.test(t));
  }

  // ── the banner must not persist across a refresh ───────────────────────────
  {
    const again = strip(await (await fetch(base + '/lineup?sent=1', { headers: { cookie } })).text());
    ck('a refresh does not re-announce the same send as fresh news',
      !/check spam/i.test(again), (again.match(/.{0,120}inbox.{0,60}/i) || [''])[0]);
  }

  // ── no mailer configured: a dry run, not a delivery ────────────────────────
  delete process.env.RESEND_API_KEY;
  {
    const t = await press();
    ck('with NO provider it does not claim a delivery',
      !/sent to your inbox/i.test(t) && /no email provider is configured/i.test(t),
      (t.match(/.{0,140}provider.{0,60}/i) || [''])[0]);
  }

  // ── the recipient is not a permitted one: refused, by name ────────────────
  process.env.RESEND_API_KEY = 'test-key';
  {
    const os2 = await store.get('owners');
    os2.find(o => o.username === 'cory').is_commissioner = false;
    await store.set('owners', os2);
    // Still reachable: requireCommissioner reads the session's owner record, so
    // flip it back for the route guard but keep the mailer's answer honest.
    const t = await press();
    ck('a mailer REFUSAL is reported, not painted as a send',
      !/sent to your inbox/i.test(t), (t.match(/.{0,120}inbox.{0,60}/i) || [''])[0]);
    os2.find(o => o.username === 'cory').is_commissioner = true;
    await store.set('owners', os2);
  }

  // ── no live lineup at all ─────────────────────────────────────────────────
  await seed(false);
  {
    const t = await press();
    ck('with no live lineup it says nothing was sent',
      !/sent to your inbox/i.test(t) && /no live lineup/i.test(t),
      (t.match(/.{0,140}live lineup.{0,60}/i) || [''])[0]);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
