'use strict';
// "IS THE LIVE DATA ACTUALLY LIVE?" — the Sunday-afternoon failure nobody sees.
//
// sleeper.bundle() is well built for an outage: it caches, remembers a failure so
// the next render doesn't pay five timeouts, and serves the last-known-good bundle
// instead of breaking. But it returns that stale bundle with NO signal, and
// `failed_at` was surfaced only on the admin console — so if Sleeper went down
// mid-Sunday, every live surface kept showing old scores AS IF LIVE. Not broken,
// just quietly wrong, on the pages whose whole point is live.
//
// Asserts both directions: silent when there is nothing stale to warn about
// (a warning people learn to ignore is worse than none), loud when we are
// actually rendering stale numbers.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lstale-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
const PAGES = ['/', '/matchup?opp=2', '/watch?preview=1', '/scoreboard'];
(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  // The cache is keyed by league id — a fixture with the wrong id is silently
  // discarded by bundle(), which would make this test pass for the wrong reason.
  const LID = (await H.loadWorld()).config.sleeper_league_id;
  ck('the seeded league has a Sleeper id to key the cache on', !!LID);

  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const c = cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' }));
  const hits = async () => {
    const out = [];
    for (const p of PAGES) {
      const html = await (await fetch(b + p, { headers: { Cookie: c } })).text();
      if (/live-stale/.test(html)) out.push(p);
    }
    return out;
  };

  // A) Sleeper unreachable but we have NOTHING cached (off-season, never
  // connected, fresh install): the pages already say "no live scoreboard" in
  // their own words, so the banner must stay quiet.
  await data.setDoc('sleeper-cache', { league_id: LID, fetched_at: 0, failed_at: Date.now(), data: null });
  ck('no cached bundle -> the stale banner stays SILENT (no duplicate noise)', (await hits()).length === 0);

  // B) We ARE rendering stale numbers: warn on every live surface, and say when.
  await data.setDoc('sleeper-cache', {
    league_id: LID, fetched_at: Date.now() - 23 * 60000, failed_at: Date.now(),
    data: { week: 3, matchups: [], rosters: [], users: [], state: { season: '2026', week: 3 }, league: { settings: {} } },
  });
  const shown = await hits();
  ck('serving stale data -> warns on EVERY live surface', shown.length === PAGES.length,
    `${shown.length}/${PAGES.length}: ${shown.join(',')}`);

  const html = await (await fetch(b + '/scoreboard', { headers: { Cookie: c } })).text();
  ck('  it names the last good read', /last good read, from <b>/.test(html));
  ck('  it says the numbers are NOT live', /not live/.test(html));
  ck('  it states how stale, in minutes', /\(23 min ago\)/.test(html));
  ck('  it tells you it retries by itself', /retries by itself/.test(html));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
