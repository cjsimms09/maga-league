'use strict';
// THE VAULT — de-orphans the trash-talk + dispatch archives. Those store
// permanently and have archiveForSeason/getArchive functions, but until now NO
// surface called them ("an archive nothing reads is the same as a deletion").
// /history/vault/:year reads both, un-gated on the harvest, so the current
// season's record and every past week survive. Boots the real app.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'));
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
  const a = owners.filter(o => o.active)[0], b = owners.filter(o => o.active)[1];

  // seed a season's archive: two trash posts across two weeks + a dispatch.
  await store.set('trash:2026:3:g1:p1', { id: 'p1', season: 2026, week: 3, game_id: 'g1', owner_id: a.id, body: 'you got absolutely smoked', created_at: '2026-09-20T18:00:00Z' });
  await store.set('trash:2026:5:g2:p2', { id: 'p2', season: 2026, week: 5, game_id: 'g2', owner_id: b.id, body: 'scoreboard, pal', created_at: '2026-10-04T18:00:00Z' });
  await store.set('dispatch:d1', { key: 'd1', kind: 'award', icon: '👑', season: 2026, week: 2, title: 'Week 2 — the $100', body: 'took the week and the money' });
  await store.set('dispatch-index:2026', ['d1']);

  const s = createApp().listen(0);
  await new Promise(r => s.once('listening', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  const li = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' });
  const cookie = (li.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const get = p => fetch(base + p, { headers: { Cookie: cookie }, redirect: 'manual' }).then(async r => ({ status: r.status, html: await r.text() }));

  const v = await get('/history/vault/2026');
  ck('vault renders 200', v.status === 200, v.status);
  ck('vault reads the trash archive (both posts)', /absolutely smoked/.test(v.html) && /scoreboard, pal/.test(v.html));
  ck('vault reads the dispatch archive', /Week 2 — the \$100/.test(v.html) && /took the week and the money/.test(v.html));
  ck('vault groups trash by week (newest first)', v.html.indexOf('Week 5') < v.html.indexOf('Week 3'));
  ck('vault attributes posts to owners', v.html.includes(a.name) && v.html.includes(b.name));

  const empty = await get('/history/vault/2099');
  ck('empty vault renders honestly (no crash)', empty.status === 200 && /Nothing in the vault/.test(empty.html), empty.status);

  // the hub offers the vault link
  const hub = await get('/history');
  ck('history hub links the vault', /\/history\/vault\//.test(hub.html));

  s.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
