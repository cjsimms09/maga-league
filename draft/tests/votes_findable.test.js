/* VOTES ARE FINDABLE — Cory, 2026-08-22: "Not very convenient to get to votes
 * tab, we need to make things easier to find on the website. needs to be
 * more clear."
 *
 * Before this, Voting Booth lived only in the "More" panel (desktop nav-more
 * / mobile more-sheet) — two taps, no badge, nothing telling you a ballot was
 * waiting unless you happened to open More and scan it. This pins the fix:
 *
 *   1. Voting Booth is now a PRIMARY nav item — one tap, on both the desktop
 *      navbar and the mobile tab bar, not buried in More.
 *   2. It carries a live badge — the count of open votes THIS owner has not
 *      cast a ballot on — same treatment as Finances (side bets) and Locker
 *      (chat unread).
 *   3. An open ballot also surfaces as a top-of-page banner on every OTHER
 *      page (same mechanism as the side-bet banner), and is suppressed on
 *      /votes itself so it isn't redundant with the page you're already on.
 *   4. The count is computed in exactly ONE place (helpers.votesAwaiting) —
 *      the dashboard's pre-existing "Needs you" strip and the new global nav
 *      badge/banner both read it, so they cannot silently disagree (Rule 11:
 *      this used to be two separate filters, one per file).
 *
 * Run: node draft/tests/votes_findable.test.js
 */
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + JSON.stringify(d) : '')); } };

const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'votes-findable-'));

const store = require(path.join(ROOT, 'src', 'store'));
store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const http = require('http');

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw');
  cory.must_change_password = false;
  await store.set('owners', owners);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const port = srv.address().port;

  const get = (p, cookie) => new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port, path: p, headers: { Cookie: cookie } }, r => {
      let body = ''; r.on('data', c => body += c); r.on('end', () => resolve({ status: r.statusCode, body }));
    }).on('error', reject);
  });
  const post = (p, formBody, cookie) => new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    if (cookie) headers.Cookie = cookie;
    const req = http.request({ host: 'localhost', port, path: p, method: 'POST', headers }, r => {
      let body = ''; r.on('data', c => body += c); r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body }));
    });
    req.end(formBody);
    req.on('error', reject);
  });

  const loginRes = await post('/login', 'username=cory&password=pw');
  const cookie = (loginRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

  const home = await get('/', cookie);
  const dashMatch = home.body.match(/🗳 (\d+) votes? you haven't cast/);
  check('CONTROL — the dashboard "Needs you" strip names a real, non-zero unvoted count',
    dashMatch && Number(dashMatch[1]) > 0, dashMatch);
  const dashCount = dashMatch ? Number(dashMatch[1]) : null;

  const bank = await get('/bank', cookie);
  /* ⚠️ PLACEMENT SUPERSEDED, Cory 08-23 from his phone: "Nav is a little
   * crammed at bottom" — seven tabs truncated their own labels, so Votes
   * moved to the More panel in the nav de-cram (interim of the redesign
   * spec's map). THE INTENT of the 08-22 ruling survives and is what this
   * now pins: an open ballot's count is visible ON THE TAB BAR without
   * opening anything (the More button carries the aggregated badge), and
   * the Votes row inside More still carries its own exact count. */
  const moreBadge = bank.body.match(/aria-label="More pages"[\s\S]{0,400}?tb-badge">(\d+)</);
  check('the ballot count is visible on the tab bar (More button badge covers it)',
    moreBadge && Number(moreBadge[1]) >= dashCount, { moreBadge, dashCount });

  const moreRow = bank.body.match(/more-links[\s\S]*?href="\/votes"[\s\S]{0,120}?(\d+)/);
  check('the Votes row in More carries the exact ballot count',
    moreRow && Number(moreRow[1]) === dashCount, { moreRow, dashCount });

  const navBadgeDesktop = bank.body.match(/href="\/votes"[^>]*>Voting Booth<span class="nav-badge">(\d+)</);
  check('the desktop navbar badge on Voting Booth matches the dashboard count exactly',
    navBadgeDesktop && Number(navBadgeDesktop[1]) === dashCount, { navBadgeDesktop, dashCount });
  check('Voting Booth is in the PRIMARY desktop navbar (not only in nav-more)',
    /class="navbar"[\s\S]*?<a href="\/votes"[^>]*>Voting Booth/.test(bank.body));

  check('a non-/votes page (here, /bank) carries a top-of-page banner naming the open ballot(s)',
    /vote.*open and waiting on your ballot/.test(bank.body));

  const votesPage = await get('/votes', cookie);
  check('/votes itself does NOT repeat the banner (would be redundant with the page you are on)',
    !/vote.*open and waiting on your ballot/.test(votesPage.body));

  srv.close();
  console.log(`\n${pass}/${pass + fail} votes-findable checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
