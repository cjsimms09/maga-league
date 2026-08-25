// TERRITORY: B (Little Things Catalog item 19, 2026-08-24)
/* "NEEDS YOU badge = the truth [small] — the More button badge count equals
 * exactly: bets waiting + ballots uncast + debts unconfirmed + lineup holes.
 * Nothing else, ever."
 *
 * Rule 5 of the redesign spec names "money you owe" explicitly as one of the
 * three things that earns a badge, alongside bets waiting and open ballots.
 * Bets and votes each already carried a live nav badge (betsWaiting,
 * votesWaiting) visible from every page. Money owed did NOT — it only
 * appeared inside the dashboard's NEEDS YOU card, which means it went
 * invisible the moment you left the home page. This checks the SAME ledger
 * balance the dashboard already reads (src/ledger.js's balances(), no new
 * math per Rule 11) is now folded into the Finances tab's persistent badge.
 *
 * Run: node draft/tests/nav_badge_dues_owed.test.js
 */
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-dues-'));

const store = require(path.join(ROOT, 'src', 'store'));
store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
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
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const port = srv.address().port;
  const post = (p, formBody, cookie) => new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    if (cookie) headers.Cookie = cookie;
    const req = http.request({ host: 'localhost', port, path: p, method: 'POST', headers }, r => {
      let body = ''; r.on('data', c => body += c); r.on('end', () => resolve({ status: r.statusCode, body, headers: r.headers }));
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

  // ── CONTROL: clean slate, zero balance, no dues badge anywhere. ─────────
  const home0 = await get('/', cookie);
  ck('CONTROL — with no ledger entries, the Finances tab carries no badge',
    !/League Finances[\s\S]{0,40}<span class="nav-badge">/.test(home0.body)
      && !/💰[\s\S]{0,10}<span class="tb-badge">/.test(home0.body));

  // ── Seed a negative balance (money owed), same shape ledger.balances() reads. ──
  await store.set('ledger', [
    { owner_id: cory.id, amount: -75, settled: false, type: 'buy_in', year: 2026, note: 'buy-in' },
  ]);

  const home1 = await get('/', cookie);
  ck('the dashboard NEEDS YOU card still shows the debt (pre-existing behavior, unchanged)',
    /You owe \$75/.test(home1.body), home1.body.match(/You owe[^<]*/));
  ck('the Finances tab now carries a badge for the SAME debt, visible sitewide',
    /League Finances<\/a>|Finances<\/span>/.test(home1.body)
      && /"nav-badge">1<\/span>|"tb-badge">1<\/span>/.test(
        home1.body.slice(home1.body.indexOf('/bank'), home1.body.indexOf('/bank') + 400)),
    home1.body.slice(home1.body.indexOf('/bank'), home1.body.indexOf('/bank') + 200));

  // ── The badge persists off the home page — a page other than / must still show it. ──
  const team1 = await get('/team', cookie);
  ck('the Finances badge shows on a page OTHER than home, not just the dashboard card',
    /"nav-badge">1<\/span>|"tb-badge">1<\/span>/.test(
      team1.body.slice(team1.body.indexOf('/bank'), team1.body.indexOf('/bank') + 400)),
    team1.body.slice(0, 0));

  // ── Settling the debt clears the badge (not stuck on forever). ──────────
  await store.set('ledger', [
    { owner_id: cory.id, amount: -75, settled: true, type: 'buy_in', year: 2026, note: 'buy-in, paid' },
  ]);
  const home2 = await get('/', cookie);
  ck('a SETTLED entry does not count as owed — the badge clears',
    !/You owe/.test(home2.body)
      && !/"nav-badge">1<\/span>|"tb-badge">1<\/span>/.test(
        home2.body.slice(home2.body.indexOf('/bank'), home2.body.indexOf('/bank') + 400)));

  // ── A positive balance (league owes YOU) is not "you owe" — no badge. ───
  await store.set('ledger', [
    { owner_id: cory.id, amount: 40, settled: false, type: 'payout', year: 2026, note: 'winnings' },
  ]);
  const home3 = await get('/', cookie);
  ck('CONTROL — a positive balance (you are OWED money) does not trip the "you owe" badge',
    !/You owe/.test(home3.body)
      && !/"nav-badge">1<\/span>|"tb-badge">1<\/span>/.test(
        home3.body.slice(home3.body.indexOf('/bank'), home3.body.indexOf('/bank') + 400)));

  srv.close();
  console.log(`\n${pass}/${pass + fail} nav-badge-dues-owed checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
