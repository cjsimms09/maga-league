'use strict';
// WHAT-TO-WATCH ROWS ARE TAP-THROUGH — same rule as the scoreboard: your own
// game opens your full matchup (?opp=), any other opens the read-only spectator
// view (?a=&b=). Dead rows among clickable siblings read as unfinished.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wclick-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const c = cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' }));
  // Preview mode renders the sample slate without Sleeper (unreachable in CI).
  const html = await (await fetch(b + '/watch?preview=1', { headers: { Cookie: c } })).text();

  const links = [...html.matchAll(/<a class="wtw-row[^"]*"[^>]*href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
  ck('watch rows render as clickable anchors', links.length > 0, links.length);
  ck('every sample game is a matchup deep-link', links.every(l => l.startsWith('/matchup')), JSON.stringify(links.slice(0, 3)));
  ck('the viewer\'s own game opens the participant view (?opp=)', links.some(l => /^\/matchup\?opp=\d+$/.test(l)));
  ck('other games open the spectator view (?a=&b=)', links.some(l => /^\/matchup\?a=\d+&b=\d+$/.test(l)), JSON.stringify(links));
  ck('no dead /matchup with no target', !links.some(l => l === '/matchup?a=&b=' || /=(&|$)/.test(l.replace('/matchup', ''))));
  ck('no template error', !/ReferenceError|is not defined|Cannot read/.test(html));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
