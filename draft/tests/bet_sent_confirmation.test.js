// TERRITORY: B (Little Things Catalog item 17, 2026-08-24)
/* "Confirmation toasts that say the thing — 'Bet sent to Rich · $25' not
 * 'Saved.' Every POST already knows what it did."
 *
 * Proposing a bet from /bank previously redirected with NO confirmation at
 * all on success — `res.render('bank', {...})`'s locals never included a
 * `sent` flag, even though the SAME propose route already built one for the
 * matchup destination (`/matchup?sent=1`), whose own comment records the
 * discipline this reuses: never confirm a bet that didn't actually happen.
 *
 * This drives the real /sidebets POST and checks the ACTUAL rendered banner
 * text on both return destinations (bank and matchup), and pins the two
 * failure-shaped controls: a REFUSED proposal must never show "Bet sent",
 * and the banner must not appear on an unrelated page load.
 *
 * Run: node draft/tests/bet_sent_confirmation.test.js
 */
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sent-confirm-'));

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
  const rich = owners.find(o => o.id !== cory.id);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const port = srv.address().port;
  const post = (p, formBody, cookie, follow) => new Promise((resolve, reject) => {
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

  // ── 1. A real proposal, back to /bank (the default door). ────────────────
  const proposeRes = await post('/sidebets',
    `party=${rich.id}&stake=25&terms=${encodeURIComponent('Confirmation test bet')}`, cookie);
  ck('the propose POST redirects (not a 500)', proposeRes.status === 302, proposeRes.status);
  const loc = proposeRes.headers.location || '';
  ck('the redirect carries sent=1 and the specifics, not a bare flag',
    /[?&]sent=1/.test(loc) && /sent_to=/.test(loc) && /sent_amt=25/.test(loc), loc);

  const bankPage = await get(loc, cookie);
  ck('the /bank page renders the confirmation with the recipient\'s name',
    new RegExp('Bet sent[\\s\\S]{0,40}<b>' + rich.name + '</b>').test(bankPage.body), rich.name);
  ck('  and the exact stake', /Bet sent[\s\S]{0,120}\$25/.test(bankPage.body));

  // ── 2. Same route, back=matchup — the door that already had ?sent=1, now
  // with the amount too. ────────────────────────────────────────────────
  const proposeRes2 = await post('/sidebets',
    `party=${rich.id}&stake=40&terms=${encodeURIComponent('Confirmation test bet 2')}&back=matchup`, cookie);
  const loc2 = proposeRes2.headers.location || '';
  ck('the matchup-bound redirect also carries the amount now',
    /[?&]sent=1/.test(loc2) && /sent_amt=40/.test(loc2), loc2);
  const matchupPage = await get(loc2, cookie);
  ck('the /matchup confirmation shows the amount alongside the existing name',
    /Bet sent[\s\S]{0,80}\$40/.test(matchupPage.body));

  // ── 3. CONTROL — a REFUSED proposal must never say "Bet sent". ───────────
  const badRes = await post('/sidebets', 'party=&stake=25&terms=nobody+on+the+other+side', cookie);
  const badLoc = badRes.headers.location || '';
  ck('CONTROL — a refused proposal carries betfail, not sent=1',
    /betfail=/.test(badLoc) && !/sent=1/.test(badLoc), badLoc);
  const badPage = await get(badLoc, cookie);
  ck('CONTROL — the refused page does not claim a bet was sent',
    !/Bet sent to/.test(badPage.body));

  // ── 4. CONTROL — a normal page load (no ?sent=1) shows no confirmation. ──
  const plainPage = await get('/bank?section=sidebets', cookie);
  ck('CONTROL — /bank without ?sent=1 shows no "Bet sent" banner',
    !/Bet sent to/.test(plainPage.body));

  srv.close();
  console.log(`\n${pass}/${pass + fail} bet-sent-confirmation checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
