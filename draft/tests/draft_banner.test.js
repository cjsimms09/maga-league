'use strict';
// DRAFT-DAY BANNER + SELF-HEALING ALERT — the front-page draft announcement is
// DERIVED from config, so the banner, the countdown, and the pinned site-wide
// alert can never disagree. The pinned alert had gone stale ("5:00 PM", no
// place); the home route re-derives it and heals the stored text on load.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'draftban-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { getDoc, setDoc } = data;
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

  // Plant the OLD, stale pinned alert (the seed's wrong text) to prove the heal.
  await setDoc('alerts', [{ id: 'draftday2026', message: 'DRAFT DAY IS SET: 08/22/26 at 5:00 PM. Be there.',
    level: 'urgent', active: true, created_at: new Date('2026-01-01').toISOString() }]);

  // Pin the draft date ~30 days ahead of whatever the CI clock is, so the banner
  // reliably renders (passed=false) no matter when this runs. The exact 8/22 →
  // "Saturday" derivation is asserted under a fixed clock in dashboard.test.js.
  const future = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const cfg0 = await getDoc('config', {});
  cfg0.draft_date = future;
  await setDoc('config', cfg0);

  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const c = cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' }));
  const html = await (await fetch(b + '/', { headers: { Cookie: c } })).text();

  ck('home renders the draft-day banner', /draft-banner/.test(html) && /Draft Day/i.test(html));
  ck('banner names the place (Cory\'s House)', /Cory&#39;s House|Cory's House/.test(html));
  ck('banner shows 6:00 PM, not the stale 5:00 PM', /6:00 PM/.test(html) && !/5:00 PM/.test(html));
  ck('banner is a link to the board', /class="draft-banner[^"]*" href="\/draft"/.test(html));
  ck('no unresolved template error', !/draftInfo is not defined|ReferenceError|Cannot read/.test(html));

  // The stored alert should have been healed to the derived text.
  const alerts = await getDoc('alerts', []);
  const pinned = alerts.find(a => a.id === 'draftday2026');
  ck('stored pinned alert healed to the derived line', !!pinned && /6:00 PM/.test(pinned.message) && /Cory's House/.test(pinned.message));
  ck('stale 5:00 PM no longer in the stored alert', !!pinned && !/5:00 PM/.test(pinned.message));

  // Editing config moves the banner (derived, not hardcoded).
  const cfg = await getDoc('config', {});
  cfg.draft_time = '7:15 PM'; cfg.draft_location = 'The Sports Bar';
  await setDoc('config', cfg);
  const html2 = await (await fetch(b + '/', { headers: { Cookie: c } })).text();
  ck('editing config re-derives the banner (time + place move)', /7:15 PM/.test(html2) && /Sports Bar/.test(html2));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
