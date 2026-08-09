'use strict';
// PWA ENTRY POINT — the home-screen app launches at start_url "/" with an empty
// cookie jar (iOS gives standalone apps their own), so the first launch is
// unauthenticated. iOS standalone sits on the navy background_color splash
// forever if the launch URL REDIRECTS instead of rendering — the "solid navy
// screen" report. So "/" MUST return a rendered 200 (the login form) when signed
// out, not a 302 to /login. This guards that: a regression back to redirecting
// the entry point is exactly the bug, and it's invisible until someone launches
// the installed app. Also asserts the self-contained /standalone diagnostic
// renders with no external CSS/JS dependency.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-entry-'));
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

  const s = createApp().listen(0);
  await new Promise(r => s.once('listening', r));
  const b = `http://127.0.0.1:${s.address().port}`;

  // THE regression: cold launch of the installed app — no cookie — must RENDER,
  // not redirect. A 302 here is the navy-screen bug.
  const cold = await fetch(b + '/', { redirect: 'manual' });
  const coldHtml = await cold.text();
  ck('cold "/" (unauthenticated) returns 200, not a redirect', cold.status === 200, cold.status);
  ck('cold "/" renders the login form', /type="password"/.test(coldHtml));

  // The self-contained diagnostic renders even if styles/scripts fail.
  const diag = await fetch(b + '/standalone', { redirect: 'manual' });
  const diagHtml = await diag.text();
  ck('/standalone returns 200', diag.status === 200, diag.status);
  ck('/standalone shows the shell-loaded marker', /app shell loaded/.test(diagHtml));
  ck('/standalone is self-contained (no external css/js link)',
    !/href="\/css\//.test(diagHtml) && !/src="\/js\//.test(diagHtml));

  // Signed in, "/" is the dashboard (the entry-point handler falls through).
  const li = await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' });
  const cookie = (li.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const authed = await fetch(b + '/', { headers: { Cookie: cookie }, redirect: 'manual' });
  const authedHtml = await authed.text();
  ck('authenticated "/" returns 200', authed.status === 200, authed.status);
  ck('authenticated "/" is the dashboard, not the login form', !/type="password"/.test(authedHtml));

  s.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
