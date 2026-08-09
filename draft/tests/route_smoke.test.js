'use strict';
// ROUTE SMOKE — boots the real app and GETs every major surface as the
// commissioner (and the commissioner-only ones as a member), asserting no 500 and
// no template ReferenceError. This class of bug — a view referencing a local the
// route forgot to pass — renders fine in the tests that touch a page directly but
// 500s in production; this catches it across the WHOLE surface in one pass. (It
// caught /admin?tab=votes throwing `threshold is not defined`.)
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'route-smoke-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : ''))); };
const ERR = /Something went wrong|ReferenceError|is not defined|Cannot read propert/;

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  const mem = owners.find(o => o.active && o.username && o.username !== 'cory');
  if (mem) { mem.password_hash = hashPassword('pw'); mem.must_change_password = false; mem.is_commissioner = false; }
  await store.set('owners', owners);
  const others = owners.filter(o => o.active && o.id !== cory.id);

  const s = createApp().listen(0);
  await new Promise(r => s.once('listening', r));
  const b = `http://127.0.0.1:${s.address().port}`;
  const login = async u => {
    const r = await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' });
    return (r.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  };
  const cck = await login('cory');

  const routes = [
    '/', '/standalone', '/team', '/matchup', `/matchup?a=${others[0].id}&b=${others[1].id}`,
    '/pickem', '/watch', '/scoreboard', '/bank', '/chat', '/draft', '/votes',
    '/history', '/history/records', '/history/money', '/history/amendments', '/history/badbeats',
    '/history/early', '/history/season/2024', '/history/vault/2026', '/rules',
    '/lineup', '/lineup/accuracy', '/admin', '/admin/warroom',
    '/admin?tab=season', '/admin?tab=votes', '/admin?tab=sleeper', '/admin?tab=owners', '/admin?tab=ledger',
    '/api/health',
  ];
  let bad = [];
  for (const p of routes) {
    const r = await fetch(b + p, { headers: { Cookie: cck }, redirect: 'manual' });
    let t = ''; try { t = await r.text(); } catch (e) {}
    const ok = (r.status >= 200 && r.status < 400) && !ERR.test(t);
    if (!ok) bad.push(`${p} [${r.status}${ERR.test(t) ? ' template-error' : ''}]`);
  }
  ck(`all ${routes.length} commissioner routes render (no 500 / template error)`, bad.length === 0, bad);

  // commissioner-only routes must 403 a member — never 500, never leak.
  if (mem) {
    const mck = await login(mem.username);
    let leaks = [];
    for (const p of ['/lineup', '/lineup/accuracy', '/admin', '/admin/warroom']) {
      const r = await fetch(b + p, { headers: { Cookie: mck }, redirect: 'manual' });
      if (r.status !== 403) leaks.push(`${p} [${r.status}]`);
    }
    ck('member is 403d on every commissioner route', leaks.length === 0, leaks);

    let mbad = [];
    for (const p of ['/', '/pickem', '/scoreboard', '/bank', '/history', '/history/vault/2026', '/matchup']) {
      const r = await fetch(b + p, { headers: { Cookie: mck }, redirect: 'manual' });
      let t = ''; try { t = await r.text(); } catch (e) {}
      if (!((r.status >= 200 && r.status < 400) && !ERR.test(t))) mbad.push(`${p} [${r.status}]`);
    }
    ck('member league routes render', mbad.length === 0, mbad);
  }

  s.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
