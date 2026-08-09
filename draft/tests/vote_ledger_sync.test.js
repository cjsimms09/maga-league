'use strict';
// VOTE → LEDGER SYNC — the Annual-audit money hole: enacting a passed BUY-IN
// vote raised the pot + payout table in the season config, but every owner's tab
// (and the settlement invoice that derives from it) stayed at the OLD buy-in,
// because only the season form re-synced the ledger, never the enact path. So a
// passed "raise buy-in to $500" left the bank showing −$400 tabs. This asserts
// the enact path now re-charges unpaid tabs to the enacted amount. Boots the app.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vls-'));
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
  const active = owners.filter(o => o.active);

  const s = createApp().listen(0);
  await new Promise(r => s.once('listening', r));
  const b = `http://127.0.0.1:${s.address().port}`;
  const li = await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' });
  const ck2 = (li.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const post = (p, body) => fetch(b + p, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck2 }, body, redirect: 'manual' });

  // 1. create season 2099 at $400 — charges every active owner a −400 tab.
  await post('/admin/season', 'year=2099&buy_in=400&weeks=15&weekly_payout=100&status=upcoming&reg_pcts=10,5&playoff_pcts=50,30,15,5');
  const ledger0 = await store.get('ledger');
  const tabs2099 = ledger0.filter(e => e.type === 'buy_in' && e.year === 2099);
  ck('season created charges −400 tabs to all active', tabs2099.length === active.length && tabs2099.every(e => e.amount === -400), tabs2099.map(e => e.amount));

  // 2. seed a PASSED vote ("raise buy-in to $500") — 6 yes ballots clears the default threshold.
  await store.set('vote:testv', { id: 'testv', proposer_id: cory.id, text: 'Raise the buy-in to $500', created_at: new Date().toISOString() });
  for (const o of active.slice(0, 6)) await store.set(`ballot:testv:${o.id}`, { choice: 'yes' });

  // 3. enact it against 2099 as a buy_in change to 500.
  await post('/admin/votes/testv/enact', 'effect_type=buy_in&value=500&effect_season=2099');

  // 4. config AND ledger both follow.
  const seasons = await store.get('seasons');
  ck('enact raised the config buy-in to 500', seasons[2099] && seasons[2099].buy_in === 500, seasons[2099] && seasons[2099].buy_in);
  ck('enact raised the pot to 500 × active', seasons[2099] && seasons[2099].total_pot === 500 * active.length, seasons[2099] && seasons[2099].total_pot);

  const ledger1 = await store.get('ledger');
  const tabs1 = ledger1.filter(e => e.type === 'buy_in' && e.year === 2099);
  ck('THE FIX: every unpaid 2099 tab re-charged to −500', tabs1.length === active.length && tabs1.every(e => e.amount === -500), tabs1.map(e => e.amount));

  // 5. a SETTLED tab must NOT be rewritten (someone who already paid the old amount).
  const ledgerP = await store.get('ledger');
  const one = ledgerP.find(e => e.type === 'buy_in' && e.year === 2099);
  one.settled = true; one.amount = -400; await store.set('ledger', ledgerP);
  await store.set('vote:testv2', { id: 'testv2', proposer_id: cory.id, text: 'Raise the buy-in to $600', created_at: new Date().toISOString() });
  for (const o of active.slice(0, 6)) await store.set(`ballot:testv2:${o.id}`, { choice: 'yes' });
  await post('/admin/votes/testv2/enact', 'effect_type=buy_in&value=600&effect_season=2099');
  const ledger2 = await store.get('ledger');
  const settledTab = ledger2.find(e => e.type === 'buy_in' && e.year === 2099 && e.settled);
  ck('a SETTLED tab is left alone (already paid)', settledTab && settledTab.amount === -400, settledTab && settledTab.amount);
  const unpaid2 = ledger2.filter(e => e.type === 'buy_in' && e.year === 2099 && !e.settled);
  ck('unpaid tabs follow to −600', unpaid2.every(e => e.amount === -600), unpaid2.map(e => e.amount));

  s.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
