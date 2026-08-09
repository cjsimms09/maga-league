'use strict';
// TRASH TALK — posts welded to a specific game (season+week+owner pair),
// permanent, archived. Pure engine + the HTTP round trip over the real app.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trash-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const TT = require(path.join(ROOT, 'src', 'routes', 'trashtalk'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

(async function () {
  // ═══════════════ ENGINE ═══════════════
  const gid = TT.gameId(4, 2);                       // low-first, same as pick'em
  ck('gameId matches pick\'em (low first)', gid === '2:4', gid);

  const p1 = await TT.post(2026, 3, gid, 2, '  you are getting run off the field  ');
  ck('post trims + stores', p1 && p1.body === 'you are getting run off the field' && p1.owner_id === 2);
  const empty = await TT.post(2026, 3, gid, 2, '   ');
  ck('empty body is rejected', empty === null);
  await TT.post(2026, 3, gid, 4, 'talk after you actually win one');

  const thread = await TT.forGame(2026, 3, gid);
  ck('forGame returns both posts', thread.length === 2, thread.length);
  ck('thread is oldest-first', thread[0].owner_id === 2 && thread[1].owner_id === 4);
  ck('concurrent posts both survive (per-post docs)', new Set(thread.map(p => p.id)).size === 2);
  ck('count matches', (await TT.countForGame(2026, 3, gid)) === 2);

  // a different game is isolated
  await TT.post(2026, 3, TT.gameId(1, 9), 1, 'unrelated');
  ck('posts are isolated per game', (await TT.forGame(2026, 3, gid)).length === 2);

  const arch = await TT.archiveForSeason(2026);
  ck('archiveForSeason gathers the whole season', arch.length === 3, arch.length);
  ck('long bodies are capped', (await TT.post(2026, 3, gid, 2, 'x'.repeat(999))).body.length === TT.CFG.MAX_LEN);

  // ═══════════════ HTTP ═══════════════
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const rich = owners.find(o => o.name === 'Richard');
  for (const o of [cory, rich]) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' }));
  const cc = await login('cory'), rc = await login(rich.username);
  const get = async (p, ck) => { const r = await fetch(b + p, { headers: { Cookie: ck }, redirect: 'manual' }); return { status: r.status, body: r.status === 200 ? await r.text() : '' }; };
  const post = async (p, ck, body) => { const r = await fetch(b + p, { method: 'POST', headers: { Cookie: ck, 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual' }); return { status: r.status, loc: r.headers.get('location') }; };

  // Cory talks trash on his game vs Richard
  const r1 = await post('/matchup/trash', cc, `opp=${rich.id}&week=1&body=${encodeURIComponent('hope you like losing, Richard')}`);
  ck('POST /matchup/trash redirects back to the game', r1.status === 302 && new RegExp('opp=' + rich.id).test(r1.loc || ''), r1.loc);

  // it shows on the matchup page for that game, attributed
  const page = await get(`/matchup?opp=${rich.id}`, cc);
  ck('the post renders on the matchup page', /hope you like losing, Richard/.test(page.body), 'missing');
  ck('Trash Talk section is present', /Trash Talk/.test(page.body));

  // Richard sees it too (league-visible) and can reply on the same game
  const richView = await get(`/matchup?opp=${cory.id}`, rc);
  ck('the other party sees the same thread (league-visible)', /hope you like losing, Richard/.test(richView.body));
  await post('/matchup/trash', rc, `opp=${cory.id}&week=1&body=${encodeURIComponent('big words for a benchwarmer')}`);
  const page2 = await get(`/matchup?opp=${rich.id}`, cc);
  ck('both sides of the thread persist on the one game', /hope you like losing/.test(page2.body) && /big words for a benchwarmer/.test(page2.body));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
