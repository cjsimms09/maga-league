'use strict';
// MATCHUP SPECTATOR — opening a game you're NOT in from the scoreboard shows a
// read-only view of THAT pairing (its all-time head-to-head, score, trash
// thread), not the old bug where a viewer-relative ?opp= silently reframed
// someone else's game as "you vs one of them." When the viewer IS a party they
// still get the full participant matchup (bet, trash post, starters). Boots the
// real app over HTTP.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'spectator-'));
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
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);
  const active = owners.filter(o => o.active);
  const others = active.filter(o => o.id !== cory.id);
  const X = others[0], Y = others[1];

  const s = createApp().listen(0);
  await new Promise(r => s.once('listening', r));
  const b = `http://127.0.0.1:${s.address().port}`;
  const li = await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' });
  const cookie = (li.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const get = p => fetch(b + p, { headers: { Cookie: cookie }, redirect: 'manual' }).then(async r => ({ status: r.status, html: await r.text() }));

  // spectator: two owners who are NOT the viewer
  const sp = await get(`/matchup?a=${X.id}&b=${Y.id}`);
  ck('spectator renders 200', sp.status === 200, sp.status);
  ck('spectator shows both owners', sp.html.includes(X.name) && sp.html.includes(Y.name));
  ck("spectator framed as watching", /you're watching/.test(sp.html));
  ck('spectator offers NO side bet', !/Send it to/.test(sp.html));
  ck('spectator offers NO trash POST form', !/action="\/matchup\/trash"/.test(sp.html));
  ck('spectator carries NO one-tap bet machinery', !/cond_target_owner/.test(sp.html));
  ck('spectator head-to-head is neutral (no "You lead")', !/You lead/.test(sp.html));

  // participant: viewer is one of the pair -> full matchup with the post form
  const pa = await get(`/matchup?a=${cory.id}&b=${X.id}`);
  ck('participant renders 200', pa.status === 200, pa.status);
  ck('participant names the opponent', pa.html.includes(X.name));
  ck('participant KEEPS the trash post form', /action="\/matchup\/trash"/.test(pa.html));

  // a malformed pair (same id) must not 500 — falls back to the normal page
  const bad = await get(`/matchup?a=${X.id}&b=${X.id}`);
  ck('same-id pair does not crash', bad.status === 200, bad.status);

  // the scoreboard still renders (its deep links are exercised live; offseason
  // there are no games because Sleeper is unreachable in CI)
  const sb = await get('/scoreboard');
  ck('scoreboard renders 200', sb.status === 200, sb.status);

  s.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
