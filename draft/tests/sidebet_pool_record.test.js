/* RECORD-MODE POOLS — Cory, 08-23, from his own bet with Richard: "we
 * shouldn't have to draft on the site.. we picked them. Should've been able
 * to just select the teams each of us picked." Filled checkboxes = the deal
 * is recorded and accepting confirms it; empty = the live snake draft opens
 * on accept exactly as before. Controls: overlap refused, count mismatch
 * refused, and the legacy live-draft path proven untouched. */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app.js'));
const data = require(path.join(ROOT, 'src', 'data.js'));
const store = require(path.join(ROOT, 'src', 'store.js'));
const SB = require(path.join(ROOT, 'src', 'sidebets.js'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const rich = owners.find(o => /rich/i.test(o.username)) || owners[1];
  const cory = owners.find(o => o.is_commissioner);
  for (const o of [rich, cory]) { o.password_hash = hashPassword('pw123456'); o.must_change_password = false; }
  await store.set('owners', owners);
  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const b = 'http://127.0.0.1:' + srv.address().port;
  const login = async u => (await fetch(b + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${u}&password=pw123456`, redirect: 'manual',
  })).headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  const post = (p2, cookie, body) => fetch(b + p2, { method: 'POST', redirect: 'manual',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const rc = await login(rich.username);
  const cc = await login(cory.username);
  const others = owners.filter(o => ![rich.id, cory.id].includes(o.id)).map(o => o.id);
  // A NONCE IN THE TERMS — the store persists across runs, so a finder that
  // matches on shape alone finds LAST run's bets (this test's own first red).
  const nonce = 'run' + Date.now();
  const base = `ticket=pool&format=pool&stake=50&party=${cory.id}&picks_required=2`
    + `&terms=${encodeURIComponent('Pool ' + nonce + ': our picks, winner take all')}`;
  const found = async () => (await SB.all()).find(x => x.format === 'pool'
    && (x.terms || '').includes(nonce));

  // CONTROL — a team on both sides is refused and nothing is written.
  let r = await post('/sidebets', rc, base + `&picks=${others[0]}&picks=${others[1]}&picks_theirs=${others[1]}&picks_theirs=${others[2]}`);
  ck('CONTROL — overlap refused', /betfail=rejected%3Arecord-overlap/.test(r.headers.get('location') || ''), r.headers.get('location'));
  ck('CONTROL — nothing written on overlap', !(await found()));

  // CONTROL — mismatched counts refused.
  r = await post('/sidebets', rc, base + `&picks=${others[0]}&picks_theirs=${others[1]}&picks_theirs=${others[2]}`);
  ck('CONTROL — count mismatch refused', /record-count/.test(r.headers.get('location') || ''));

  // The real thing: record the done deal.
  await post('/sidebets', rc, base + `&picks=${others[0]}&picks=${others[1]}&picks_theirs=${others[2]}&picks_theirs=${others[3]}`);
  const bet = await found();
  ck('recorded pool created, marked recorded', !!bet && bet.pool && bet.pool.recorded === true);
  ck('both sides carry their picks from the form',
    JSON.stringify((bet.parties.find(p => p.owner_id === rich.id) || {}).picks) === JSON.stringify([others[0], others[1]])
    && JSON.stringify((bet.parties.find(p => p.owner_id === cory.id) || {}).picks) === JSON.stringify([others[2], others[3]]),
    bet.parties.map(p => p.picks));

  await post(`/sidebets/${bet.id}/accept`, cc, 'terms_version=1');
  const locked = await SB.get(bet.id);
  ck('accept CONFIRMS the split — locked, and NO franchise draft opened',
    locked.status === 'locked' && !locked.draft, { status: locked.status, draft: !!locked.draft });

  // CONTROL — the legacy path is untouched: empty picks still opens the draft.
  await post('/sidebets', cc, `ticket=pool&format=pool&stake=10&party=${rich.id}&picks_required=2`
    + `&terms=${encodeURIComponent('Live-draft pool ' + nonce + ', legacy path')}`);
  const legacy = (await SB.all()).find(x => x.format === 'pool'
    && (x.terms || '').includes(nonce) && (x.terms || '').includes('legacy'));
  ck('legacy pool: not marked recorded', legacy && legacy.pool && !legacy.pool.recorded);
  await post(`/sidebets/${legacy.id}/accept`, rc, 'terms_version=1');
  const legacyLocked = await SB.get(legacy.id);
  ck('CONTROL — legacy accept still opens the snake draft',
    legacyLocked.status === 'locked' && !!legacyLocked.draft, { draft: !!legacyLocked.draft });

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
