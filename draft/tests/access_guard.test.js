'use strict';
// ACCESS GUARD — THE TOOLS ARE THE COMMISSIONER'S, THE HISTORY IS THE LEAGUE'S.
//
// The private list is the recommendation TOOLS, not the record. This asserts:
//  (a) the Lineup Optimizer (/lineup + /lineup/log) 403s a non-commissioner and
//      200s the commissioner — server-side gated, like the war room; and
//  (b) the HISTORY pages stay LEAGUE-VISIBLE, including analytical framings
//      (all-play, efficiency %, bench totals) — those describe what happened and
//      are league property. A regression that re-hides them fails here too.
//
// Rule (Cory, restated): anything that generates a recommendation FOR the
// commissioner is private; anything that describes what already happened —
// however it was computed — is the league's. Run: node draft/tests/access_guard.test.js
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = require('path').join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = res => res.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0; const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

(async function () {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const notComm = owners.find(o => !o.is_commissioner);
  notComm.password_hash = hashPassword('pw123456'); notComm.must_change_password = false;
  const comm = owners.find(o => o.is_commissioner);
  comm.password_hash = hashPassword('pw123456'); comm.must_change_password = false;
  await store.set('owners', owners);
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const loginAs = async u => cookieFrom(await fetch(b + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${u}&password=pw123456`, redirect: 'manual' }));
  const nc = await loginAs(notComm.username);
  const cc = await loginAs(comm.username);
  const get = async (p, cookie) => { const r = await fetch(b + p, { headers: { Cookie: cookie }, redirect: 'manual' }); return { status: r.status, body: r.status === 200 ? await r.text() : '' }; };

  // (a) THE TOOLS ARE PRIVATE — /lineup + /lineup/log commissioner-only.
  ck('/lineup 403 for a non-commissioner', (await get('/lineup', nc)).status === 403);
  ck('/lineup?tab=proof 403 for a non-commissioner', (await get('/lineup?tab=proof', nc)).status === 403);
  ck('/lineup 200 for the commissioner', (await get('/lineup', cc)).status === 200);
  const logNc = await fetch(b + '/lineup/log', { method: 'POST', headers: { Cookie: nc, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'counterfactual=%5B%5D&recommended=%5B%5D', redirect: 'manual' });
  ck('/lineup/log 403 for a non-commissioner', logNc.status === 403, String(logNc.status));

  // (b) THE HISTORY IS THE LEAGUE'S — analytical framings STAY league-visible.
  // (Viewed as a NON-commissioner; a regression that re-strips these fails here.)
  const money = await get('/history/money', nc);
  ck('/history/money is league-visible (200) and shows career dollars', money.status === 200 && /\$[0-9]/.test(money.body));
  const s24 = await get('/history/season/2024', nc);
  ck('/history/season/2024 renders all-play + efficiency to the league',
    s24.status === 200 && /all-play/i.test(s24.body) && /Eff%|efficiency/i.test(s24.body),
    'analytical history framings must stay league-visible');
  const hub = await get('/history', nc);
  ck('/history hub keeps its analytical framings (all-play/luck)', hub.status === 200 && /all-play/i.test(hub.body));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
