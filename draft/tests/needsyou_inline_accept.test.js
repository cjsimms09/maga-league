/* NEEDS YOU, INLINE ACCEPT (redesign catalog 26) — "An incoming offer
 * whispers... visible only as a hint inside /bank... NEEDS YOU on home
 * carries it with the Accept inline." A straight bet needs nothing else to
 * accept, so it gets a real button on the home page, no tap-through first
 * (Rule 4: actions live on the thing). A pool bet's accept also assigns
 * franchise draft positions, which has no home in this row, so it keeps the
 * tap-through instead of silently accepting with no positions chosen.
 * Real app, real routes.
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'needsyou-accept-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app'));
const data = require(path.join(ROOT, 'src', 'data'));
const store = require(path.join(ROOT, 'src', 'store'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + '  -> ' + JSON.stringify(d))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  for (const o of owners) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);
  const cory = owners.find(o => o.username === 'cory');
  const richard = owners.find(o => o.username === 'richard') || owners.find(o => o.id !== cory.id);

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${u}&password=pw`, redirect: 'manual' }));
  const richardCk = await login(richard.username), coryCk = await login('cory');
  const post = (ck2, url, body) => fetch(b + url, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: ck2 },
    body: body || '', redirect: 'manual' });
  const findBet = async terms => {
    const keys = await store.listKeys('sidebet:');
    const docs = await store.getMany(keys);
    return docs.filter(Boolean).find(v => v.terms === terms) || null;
  };

  // ── 1. A straight bet: Richard sends Cory a prop bet. ───────────────────
  const nonce = 'needsyou-' + Date.now();
  await post(richardCk, '/sidebets',
    `party=${cory.id}&stake=25&terms=${encodeURIComponent(nonce)}&format=prop`);
  const bet = await findBet(nonce);
  ck('the straight bet exists, proposed', bet && bet.status === 'proposed', bet);

  let home = await (await fetch(b + '/', { headers: { Cookie: coryCk } })).text();
  ck('Cory sees the offer in NEEDS YOU', home.includes(`sent you a $25 bet`), 'row missing');
  ck('a real inline Accept button posts straight to the accept route',
    new RegExp(`action="/sidebets/${bet.id}/accept"[\\s\\S]{0,200}✓ Accept`).test(home),
    home.slice(home.indexOf('sent you a $25 bet') - 50, home.indexOf('sent you a $25 bet') + 500));
  ck('the tap-through link is deep-anchored to the specific bet card',
    home.includes(`/bank?section=sidebets#bet-${bet.id}`), 'no deep link');

  // Tap it — the home page's own button, not the /bank page.
  await post(coryCk, `/sidebets/${bet.id}/accept`);
  const accepted = await store.get(`sidebet:${bet.id}`);
  ck('accepting from the home button actually accepts the bet',
    accepted && accepted.status !== 'proposed', accepted);
  home = await (await fetch(b + '/', { headers: { Cookie: coryCk } })).text();
  ck('the accepted offer no longer needs him', !home.includes(nonce));

  // ── 2. CONTROL — a pool bet offers no inline button, tap-through only. ──
  const poolNonce = 'needsyou-pool-' + Date.now();
  await post(richardCk, '/sidebets',
    `party=${cory.id}&stake=25&terms=${encodeURIComponent(poolNonce)}&format=pool`);
  const poolBet = await findBet(poolNonce);
  ck('the pool bet exists, proposed', poolBet && poolBet.format === 'pool', poolBet);
  home = await (await fetch(b + '/', { headers: { Cookie: coryCk } })).text();
  ck('CONTROL — no inline Accept button for a pool bet (needs the position picker)',
    !new RegExp(`action="/sidebets/${poolBet.id}/accept"`).test(home),
    'button rendered for a pool bet');
  ck('CONTROL — the pool offer still deep-links through to /bank',
    home.includes(`/bank?section=sidebets#bet-${poolBet.id}`), 'no deep link');

  server.close();
  console.log(`\n${pass}/${pass + fail} needsyou-inline-accept checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
