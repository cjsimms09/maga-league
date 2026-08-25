// TERRITORY: B (Little Things Catalog item 6, 2026-08-24)
/* HEAD-TO-HEAD — "on any opponent: lifetime W-L and net $ against them, one
 * tap from every bet card. The trash-talk stat."
 *
 * No new settlement math (Rule 11): h2hVs() in _side_bets.ejs filters
 * sbLedger.rows — the SAME per-bet deltas the ledger table and the hero P&L
 * already use — down to one-on-one bets against a single opponent. This
 * drives the real app over HTTP and checks the rendered record against
 * hand-computed wins/losses/net from bets this test itself creates and
 * settles, so the arithmetic is checked, not just the presence of a chip.
 *
 * Run: node draft/tests/bet_head_to_head.test.js
 */
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h2h-'));

const store = require(path.join(ROOT, 'src', 'store'));
store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const http = require('http');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const david = owners.find(o => o.id !== cory.id);
  const third = owners.find(o => o.id !== cory.id && o.id !== david.id);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);

  // Two settled 1-on-1 bets vs the opponent: cory wins $25, cory loses $40 -> net -$15, 1-1.
  const b1 = await SB.propose({ proposer_id: cory.id, party_ids: [david.id], stake: 25, terms: 'H2H test — cory wins this one' });
  await SB.accept(b1.id, david.id, david.name);
  await SB.settle(b1.id, [cory.id], cory.id, cory.name);
  const b2 = await SB.propose({ proposer_id: david.id, party_ids: [cory.id], stake: 40, terms: 'H2H test — david wins this one' });
  await SB.accept(b2.id, cory.id, cory.name);
  await SB.settle(b2.id, [david.id], david.id, david.name);
  // An OPEN (unsettled) bet vs David — must count toward the game list but
  // NOT the settled W-L or the net, and must not crash the record/push.
  const b3 = await SB.propose({ proposer_id: cory.id, party_ids: [david.id], stake: 10, terms: 'H2H test — still open' });
  await SB.accept(b3.id, david.id, david.name);
  // A 3-party pool bet including cory and david — must be EXCLUDED (not 1-on-1).
  const b4 = await SB.propose({ proposer_id: cory.id, party_ids: [david.id, third.id], stake: 30,
    terms: 'H2H test — three-way, must not count', format: 'pool', pool_rules: ['champion'],
    pool_teams: owners.slice(0, 3).map(o => o.id), pool_wins: 'holds the champion' });

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const port = srv.address().port;
  const post = (p, formBody, cookie) => new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    if (cookie) headers.Cookie = cookie;
    const req = http.request({ host: 'localhost', port, path: p, method: 'POST', headers }, r => {
      let body = ''; r.on('data', c => body += c); r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body }));
    });
    req.end(formBody); req.on('error', reject);
  });
  const get = (p, cookie) => new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port, path: p, headers: { Cookie: cookie } }, r => {
      let body = ''; r.on('data', c => body += c); r.on('end', () => resolve({ status: r.statusCode, body }));
    }).on('error', reject);
  });

  const loginRes = await post('/login', 'username=cory&password=pw');
  const cookie = (loginRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const bank = await get('/bank?section=sidebets', cookie);

  ck('the page renders without template errors', !/ReferenceError|Cannot read|is not defined/.test(bank.body));

  const idx = bank.body.indexOf('bc-h2h');
  ck('the head-to-head chip renders', idx >= 0);

  const summarySlice = bank.body.slice(idx, idx + 300);
  const recordRe = new RegExp('vs ' + david.name + ':.{0,20}<b>1-1</b>');
  ck('the record reads 1-1 (the settled bets only, not the open one)', recordRe.test(summarySlice), summarySlice);
  ck('the net reads -$15 (won $25, lost $40)', /−\$15/.test(summarySlice), summarySlice);

  const listSlice = bank.body.slice(idx, idx + 1400);
  ck('the click-in game list names the won bet with its delta', /H2H test — cory wins this one[\s\S]{0,80}\+\$25/.test(listSlice));
  ck('the click-in game list names the lost bet with its delta', /H2H test — david wins this one[\s\S]{0,80}−\$40/.test(listSlice));
  ck('the still-open bet appears in the list (all games) but did not move the settled record',
    /H2H test — still open/.test(listSlice));

  ck('the three-way pool bet is excluded entirely (not a 1-on-1 head-to-head)',
    !listSlice.includes('H2H test — three-way'));

  srv.close();
  console.log(`\n${pass}/${pass + fail} bet-head-to-head checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
