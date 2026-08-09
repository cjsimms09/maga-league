'use strict';
// SEASON FORM — payout structure is variable-length, not a hardcoded 2 reg + 4
// playoff. The data model (H.payoutTable, applyVoteEffect) always handled an
// array of any length; the admin form was the only thing pinning the shape. A
// new season landing (or a vote) can change how many places pay straight from
// the form: CSV of percentages, stored as fractions. Legacy numbered fields
// (reg_1…/playoff_1…) stay readable so an old cached form keeps working, and an
// empty edit keeps the season's current shape. Boots the real app over HTTP.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'season-form-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);

  const s = createApp().listen(0);
  await new Promise(r => s.once('listening', r));
  const b = `http://127.0.0.1:${s.address().port}`;
  const li = await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' });
  const cookie = (li.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const post = body => fetch(b + '/admin/season', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie }, body, redirect: 'manual' });
  const readSeason = async y => (await store.get('seasons'))[y];
  const eq = (a, x) => JSON.stringify(a) === JSON.stringify(x);

  // 1. a non-2+4 shape: 3 reg prizes, 3 playoff prizes, entered as a CSV of %.
  await post('year=2099&buy_in=100&weeks=15&weekly_payout=50&status=upcoming&reg_pcts=15,10,5&playoff_pcts=40,20,10');
  let s99 = await readSeason(2099);
  ck('CSV: 3 reg prizes stored as fractions', eq(s99.payouts.reg, [0.15, 0.10, 0.05]), s99.payouts.reg);
  ck('CSV: 3 playoff prizes stored as fractions', eq(s99.payouts.playoff, [0.40, 0.20, 0.10]), s99.payouts.playoff);

  // 2. legacy numbered fields still work (old cached form / A's tooling).
  await post('year=2098&buy_in=100&weeks=15&weekly_payout=50&status=upcoming&reg_1=10&reg_2=5&playoff_1=50&playoff_2=30&playoff_3=15&playoff_4=5');
  let s98 = await readSeason(2098);
  ck('legacy numbered reg -> [0.10,0.05]', eq(s98.payouts.reg, [0.10, 0.05]), s98.payouts.reg);
  ck('legacy numbered playoff -> [0.50,0.30,0.15,0.05]', eq(s98.payouts.playoff, [0.50, 0.30, 0.15, 0.05]), s98.payouts.playoff);

  // 3. shrink playoff payout to top two only.
  await post('year=2097&buy_in=100&weeks=15&weekly_payout=50&status=upcoming&reg_pcts=10,5&playoff_pcts=60,25');
  ck('CSV: playoff can shrink to 2 places', eq((await readSeason(2097)).payouts.playoff, [0.60, 0.25]));

  // 4. editing an existing season with EMPTY payout fields keeps the prior shape
  //    (so a save that only touches the buy-in doesn't silently wipe payouts).
  await post('year=2099&buy_in=120&weeks=15&weekly_payout=50&status=upcoming&reg_pcts=&playoff_pcts=');
  let s99b = await readSeason(2099);
  ck('empty CSV on edit keeps prior reg shape', eq(s99b.payouts.reg, [0.15, 0.10, 0.05]), s99b.payouts.reg);
  ck('empty CSV on edit keeps prior playoff shape', eq(s99b.payouts.playoff, [0.40, 0.20, 0.10]), s99b.payouts.playoff);
  ck('buy_in still updated on that empty-payout edit', s99b.buy_in === 120, s99b.buy_in);

  // 5. whitespace and a trailing comma are tolerated.
  await post('year=2096&buy_in=100&weeks=15&weekly_payout=50&status=upcoming&reg_pcts=%2010%20,%205%20,&playoff_pcts=50,%2030,15,5');
  ck('whitespace/trailing comma tolerated', eq((await readSeason(2096)).payouts.reg, [0.10, 0.05]));

  s.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
