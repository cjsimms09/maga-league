'use strict';
// THE DRAFT-DAY ALERT HAS TO END.
//
// The pinned site-wide alert and the front-page countdown banner are two
// renderings of one fact. The banner hid itself once the date passed; the ALERT
// never did — both the self-heal and the retire were gated on `!passed`, so the
// day after the draft the code simply stopped touching it. What stayed up was a
// red `level: 'urgent'` alert at the top of EVERY page, for the rest of the
// season, telling ten people to show up to a draft that already happened — and
// showing the stale hand-typed text ("08/22/26 at 5:00 PM", no place), because
// the healing was gated the same way and had nothing left to correct it.
//
// The quiet element self-corrected and the loud one didn't, which is why nobody
// would have caught it until September. Found by driving the front page as a
// MEMBER with the draft date three weeks in the past.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dal-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 200) : ''))); };
const dayOffset = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const mem = owners.find(o => o.active && o.username && o.username !== 'cory');
  mem.password_hash = hashPassword('pw'); mem.must_change_password = false; mem.is_commissioner = false;
  await store.set('owners', owners);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `username=${mem.username}&password=pw` });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const get = async r => (await fetch(base + r, { headers: { cookie } })).text();

  const setDraft = async date => {
    const cfg = await store.get('config');
    cfg.draft_date = date; cfg.draft_time = '6:00 PM'; cfg.draft_location = "Cory's House";
    await store.set('config', cfg);
  };
  const draftAlerts = async () => (await store.get('alerts') || [])
    .filter(a => a.id === 'draftday2026' || /^DRAFT DAY/i.test(a.message || ''));

  // ── BEFORE: it must be up, urgent, and carrying the DERIVED text. This is the
  // half that must not regress while fixing the other one.
  await setDraft(dayOffset(12));
  let html = await get('/');
  ck('12 days out: the pinned alert is up', /DRAFT DAY/.test(html));
  ck('  it carries the derived line (time AND place), not the hand-typed one',
    /6:00 PM/.test(html) && /Cory&#39;s House|Cory's House/.test(html),
    (html.match(/DRAFT DAY[^<]{0,90}/) || [])[0]);
  ck('  and the countdown banner is up too', /class="draft-banner/.test(html));
  ck('  the stored alert is active', (await draftAlerts()).some(a => a.active === true));

  // ── DAY OF: still up. Retiring a day early is its own failure.
  await setDraft(dayOffset(0));
  html = await get('/');
  ck('on the day itself the alert is STILL up', /DRAFT DAY/.test(html));
  ck('  and the banner says it is today', /it&#39;s today|it's today|TODAY/.test(html));

  // ── AFTER: gone from every page, not just the front one.
  await setDraft(dayOffset(-1));
  for (const r of ['/', '/team', '/bank', '/history']) {
    const h = await get(r);
    ck(`the day after, ${r} no longer carries the alert`, !/DRAFT DAY/.test(h),
      (h.match(/DRAFT DAY[^<]{0,80}/) || [])[0]);
  }
  ck('  the countdown banner is gone as well', !/class="draft-banner/.test(await get('/')));
  ck('  and it is retired in the store, not merely hidden in one render',
    (await draftAlerts()).every(a => a.active === false), await draftAlerts());
  ck('  RETIRED, NOT DELETED — the text survives so it can be re-activated',
    (await draftAlerts()).every(a => /DRAFT DAY/i.test(a.message || '')), await draftAlerts());

  // ── Three weeks later it is still gone (and nothing has re-pinned it).
  await setDraft(dayOffset(-21));
  ck('three weeks later it is still gone', !/DRAFT DAY/.test(await get('/')));

  // ── And a re-scheduled draft brings it back: retirement must not be terminal.
  {
    const alerts = await store.get('alerts');
    const a = alerts.find(x => /^DRAFT DAY/i.test(x.message || ''));
    a.active = true; await store.set('alerts', alerts);      // the commissioner re-activates
    await setDraft(dayOffset(5));
    const h = await get('/');
    ck('a re-scheduled draft can bring the alert back', /DRAFT DAY/.test(h));
    ck('  and it re-heals to the new derived line', /6:00 PM/.test(h));
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
