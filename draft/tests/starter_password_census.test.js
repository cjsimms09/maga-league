// TERRITORY: A
'use strict';
// 🟠 AUDIT FINDING 6 (external persistence audit, 2026-08-16): STARTER-PASSWORD
// CENSUS.
//
// Every seeded account starts on the shared starter password with
// must_change_password=true, and nothing anywhere told the commissioner WHO is
// still on it. Before draft day that is an operational check Cory should be
// able to READ: the census is now a line in the /admin automation panel
// (an existing surface — no new page), commissioner-only by the router's own
// requireCommissioner gate. It is a CENSUS, not an alarm: it never joins the
// red "automation is not doing" banner, because members not having logged in
// yet is not a broken job.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'census-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 220) : ''))); };
const strip = h => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('127.0.0.1')) return realFetch(url, opts);
  return { ok: false, status: 500, text: async () => '' };
};

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  const pending = owners.filter(o => o.active && o.must_change_password);
  ck('fixture: everyone but the commissioner is still on the starter password', pending.length === owners.filter(o => o.active).length - 1);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = login.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const page = async () => strip(await (await fetch(base + '/admin', { headers: { Cookie: cookie } })).text());

  // ── the census names everyone still on the starter password ───────────────
  {
    const t = await page();
    ck('the /admin panel carries a starter-password census line', /[Ss]tarter password/.test(t),
      (t.match(/.{0,80}[Ss]tarter password.{0,80}/) || ['no census line'])[0]);
    ck('  it counts the pending accounts', new RegExp(`${pending.length} account`).test(t),
      (t.match(/.{0,60}account.{0,120}/) || [''])[0]);
    // The names must be IN THE CENSUS LINE, not merely elsewhere on the admin
    // page (owner names appear all over it — an anywhere-match is vacuous).
    const line = (t.match(/still on the starter password:?\s*([^.]{0,500})/i) || ['', ''])[1];
    const named = pending.filter(o => line.includes(o.name)).length;
    ck('  and NAMES every one of them in that line', named === pending.length,
      { named, of: pending.length, line: line.slice(0, 200) });
    // The census must never appear INSIDE the red "not doing" banner (whose
    // item list runs from the banner text to the folded panel's summary) —
    // other rows may legitimately be red in this sealed-network environment.
    const banner = (t.match(/the automation is not doing\.(.*?)Automation —/s) || ['', ''])[1];
    ck('  as a census, not a red automation alarm', !/[Ss]tarter password/.test(banner),
      banner.slice(0, 200));
  }

  // ── all clear once everyone has set their own ─────────────────────────────
  {
    const os2 = await store.get('owners');
    os2.forEach(o => { o.must_change_password = false; });
    await store.set('owners', os2);
    const t = await page();
    ck('with everyone migrated the census reads all-clear',
      /every active account has set its own password/.test(t),
      (t.match(/.{0,60}[Ss]tarter password.{0,120}/) || [''])[0]);
  }

  // ── an INACTIVE account on the starter password is not nagged ─────────────
  {
    const os3 = await store.get('owners');
    const ghost = os3.find(o => o.id !== cory.id);
    ghost.active = false; ghost.must_change_password = true;
    await store.set('owners', os3);
    const t = await page();
    ck('an inactive account does not appear in the census',
      /every active account has set its own password/.test(t),
      (t.match(/.{0,60}[Ss]tarter password.{0,120}/) || [''])[0]);
    ghost.active = true; ghost.must_change_password = false;
    await store.set('owners', os3);
  }

  // ── commissioner-only, by the router's own gate ───────────────────────────
  {
    const anon = await fetch(base + '/admin', { redirect: 'manual' });
    ck('a logged-out visitor cannot read the census page', anon.status >= 300, anon.status);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
