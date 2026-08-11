'use strict';
// DID THE SCHEDULED THINGS ACTUALLY HAPPEN?
//
// Three jobs now send mail on the league's behalf, and their only visible output
// was a GitHub Actions annotation. That is the failure this project keeps
// hitting — a weekly job that dies silently — and I rebuilt it twice today with
// better error reporting pointed at nobody who reads it.
//
// THE CLAIM THIS PANEL HAS TO EARN is not "the last run worked". Reporting the
// most recent SUCCESS is exactly how a job that stopped three weeks ago still
// looks fine. It has to do the arithmetic and say the number out loud.
//
// The arithmetic is off-by-one-prone, which is the point of pinning it here:
// state.week 9 means week 9 is IN PROGRESS, so the last recappable week is 8.
// Last sent week 6 → weeks 7 and 8 missed → TWO, not three. I wrote three first.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { setDoc } = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 240) : ''))); };
const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('127.0.0.1')) return realFetch(url, opts);
  return { ok: false, status: 500, text: async () => '' };
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
  const YEAR = String(H.currentSeason(await store.get('seasons')).year);

  const seedLive = async (week, opts = {}) => {
    if (!week) { await store.set('sleeper-cache', null); return; }
    await store.set('sleeper-cache', Object.assign({
      league_id: lid, fetched_at: Date.now(),
      data: { state: { week, season: YEAR },
        league: { name: 'MFGA', season: YEAR, total_rosters: 10, settings: { playoff_week_start: 15 } },
        users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
        rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i, players: [], settings: {} })),
        matchups: [], week },
    }, opts.failed ? { failed_at: Date.now() } : {}));
  };

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const console_ = async () => strip(await (await fetch(base + '/admin', { headers: { cookie } })).text());

  // ── THE HEADLINE CASE: a recap that stopped two weeks ago ────────────────
  process.env.RESEND_API_KEY = 'test-key';
  await seedLive(9);
  await setDoc(`weekly-recap-sent:${YEAR}:6`, { at: '2026-10-13T13:31:00Z', week: 6 });
  // Pin the boundary explicitly: live week 9 → week 8 recappable → 7 and 8 missed.
  {
    const t = await console_();
    ck('the console names the missed weeks', /2 weeks MISSED/.test(t),
      (t.match(/.{0,80}MISSED.{0,80}/) || [''])[0]);
    ck('  it says what the last one was', /last sent was week 6/.test(t), (t.match(/.{0,120}last sent.{0,60}/) || [''])[0]);
    ck('  and what is due now', /week 8 is due/.test(t), (t.match(/.{0,60}is due.{0,40}/) || [''])[0]);
    ck('  it is LOUD, not folded away', /the automation is not doing/.test(t),
      (t.match(/.{0,140}automation is not doing.{0,60}/) || [''])[0]);
  }

  // ── UP TO DATE: it must NOT cry wolf ─────────────────────────────────────
  await setDoc(`weekly-recap-sent:${YEAR}:8`, { at: '2026-10-27T13:31:00Z', week: 8 });
  {
    const t = await console_();
    ck('when the recap is current there is no alarm',
      !/the automation is not doing/.test(t), (t.match(/.{0,140}automation is not doing.{0,60}/) || [''])[0]);
    ck('  and it still reports when the last one went', /week 8 sent 2026-10-27/.test(t),
      (t.match(/.{0,80}week 8 sent.{0,40}/) || [''])[0]);
  }

  // ── THE SUNDAY ALERT IS ALLOWED TO BE QUIET ──────────────────────────────
  // It only sends when there is something to do — about one week in nine. A
  // status panel that flags the EXPECTED result as a fault is the same
  // overstatement the alert itself was fixed for.
  {
    const t = await console_();
    ck('a Sunday alert that has never fired is NOT reported as broken',
      /has not fired yet this season/.test(t) && !/the automation is not doing/.test(t),
      (t.match(/.{0,120}has not fired.{0,120}/) || [''])[0]);
    ck('  and it says why that is expected', /one week in nine/.test(t),
      (t.match(/.{0,80}week in nine.{0,40}/) || [''])[0]);
  }

  // ── THE SLEEPER FEED ─────────────────────────────────────────────────────
  await seedLive(9, { failed: true });
  {
    const t = await console_();
    ck('a FAILING Sleeper feed is reported', /the last fetch FAILED/.test(t),
      (t.match(/.{0,100}fetch FAILED.{0,60}/) || [''])[0]);
    ck('  and it says what that costs', /stale data/.test(t), (t.match(/.{0,60}stale data.{0,20}/) || [''])[0]);
    ck('  loudly', /the automation is not doing/.test(t));
  }
  await seedLive(9);

  // ── NO EMAIL PROVIDER ────────────────────────────────────────────────────
  {
    delete process.env.RESEND_API_KEY;
    const t = await console_();
    ck('no email provider is reported as a fault', /RESEND_API_KEY is not set/.test(t),
      (t.match(/.{0,100}RESEND_API_KEY.{0,60}/) || [''])[0]);
    process.env.RESEND_API_KEY = 'test-key';
  }
  {
    const t = await console_();
    ck('a configured provider does not claim deliverability it cannot know',
      /only provable by pressing send/.test(t), (t.match(/.{0,120}provable.{0,60}/) || [''])[0]);
  }

  // ── OFF-SEASON: nothing is due, so nothing is wrong ──────────────────────
  await seedLive(null);
  {
    const t = await console_();
    ck('off-season reports nothing due rather than everything missed',
      /off-season — nothing due/.test(t) && !/MISSED/.test(t),
      (t.match(/.{0,80}off-season.{0,60}/) || [''])[0]);
  }

  // ── IT IS THE COMMISSIONER'S ─────────────────────────────────────────────
  {
    const anon = await fetch(base + '/admin', { redirect: 'manual' });
    ck('a logged-out visitor cannot read it', anon.status >= 300, anon.status);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
