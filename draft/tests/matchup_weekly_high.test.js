'use strict';
// THE MATCHUP WEEKLY-HIGH PANEL — used to sit dark waiting on A's live band.
// Now it renders the harvested $100 target (a league-visible RESULT) on its own,
// so the manager sees the bar on the page where they're thinking about the week.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'muwh-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const other = owners.find(o => o.username !== 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const c = cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' }));
  const html = await (await fetch(b + '/matchup?opp=' + other.id, { headers: { Cookie: c } })).text();

  ck('matchup page renders the Weekly High panel', /The Weekly High/.test(html));
  ck('panel shows the harvested $100 target (not a dark parked slot)', /wins it — range|short of that bar|typically/i.test(html));
  ck('panel names the $100', /\$100/.test(html));
  ck('no unresolved template error', !/whBand is not defined|ReferenceError|Cannot read/.test(html));

  // Guard the "results, not tools" line: this is a TARGET (what it takes to win
  // the pool), not per-owner efficiency analysis — no commissioner-only leakage.
  ck('no per-owner efficiency analysis leaked onto this league page', !/efficiency|bench points left|luck-adjusted/i.test(html));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
