// TERRITORY: A
'use strict';
// THE EDGE REPORT ON /bank — the wiring, not just the module. Boots the real
// app with a stubbed Sleeper bundle (mid-season standings, week 8) so
// member.js's commissioner block actually builds the pricing context and the
// box actually renders — the betedge module's 13 unit checks can all pass
// while the page shows nothing, and this is the test that would catch that.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bedge-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));
const sleeper = require(path.join(ROOT, 'src', 'sleeper'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const active = owners.filter(o => o.active).slice(0, 10);
  const cory = owners.find(o => o.username === 'cory');
  const strong = active.find(o => o.id !== cory.id);
  const weak = active.find(o => o.id !== cory.id && o.id !== strong.id);
  for (const o of [cory, strong]) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  // Wire a sleeper_map so standings rows join to league owners, then stub the
  // bundle: week 8, `strong` running hot, `weak` running cold, the rest level.
  const config = await store.get('config');
  config.sleeper_map = {};
  active.forEach((o, i) => { config.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', config);
  sleeper.bundle = async () => ({
    week: 8,
    league: { settings: { playoff_week_start: 16, playoff_teams: 4 } },
    users: [],
    matchups: [],
    rosters: active.map((o, i) => {
      const mean = o.id === strong.id ? 132 : o.id === weak.id ? 90 : 111;
      const wins = o.id === strong.id ? 6 : o.id === weak.id ? 1 : 3;
      return { roster_id: i + 1, settings: { wins, losses: 7 - wins, ties: 0, fpts: Math.round(mean * 7), fpts_decimal: 0 } };
    }),
  });
  sleeper.weekPointsByOwner = async () => null;

  // An OPEN market bet posted by `weak`, claiming the WEAK team outscores the
  // STRONG one in week 9 — taking the other side should price ADVANTAGEOUS for
  // Cory. Plus a free-text proposal to Cory, which must be absent from the
  // report (unpriceable, never guessed).
  const open = await SB.propose({ proposer_id: weak.id, open_slots: 1, stake: 25,
    terms: 'my guys outscore yours in week 9', week: 9,
    conditions: [{ test: 'outscores', when: 'week', week: 9, subject_id: weak.id, target_id: strong.id }] });
  await SB.propose({ proposer_id: strong.id, party_ids: [cory.id], stake: 50,
    terms: 'loser brings the cooler all season' });

  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' }));

  const html = await (await fetch(b + '/bank?section=sidebets', { headers: { Cookie: await login('cory') } })).text();
  ck('the edge report renders for the commissioner', /Your edges/.test(html));
  ck('taking the weak side of the open bet is flagged worth it', /Worth it/.test(html) && /my guys outscore yours/.test(html));
  ck('the price and EV are on the card', /Your side wins <b>\d+%/.test(html) && /EV <b/.test(html));
  ck('the derivation is shown, not just the verdict', /how it was priced/.test(html) && /weekly sd/.test(html));
  ck('exactly one bet priced — the free-text proposal is absent (unpriceable, never guessed)',
    (html.match(/how it was priced/g) || []).length === 1);
  ck('no template error', !/ReferenceError|Cannot read|is not defined/.test(html));

  const html2 = await (await fetch(b + '/bank?section=sidebets', { headers: { Cookie: await login(strong.username) } })).text();
  ck('a non-commissioner never sees the edge report', !/Your edges/.test(html2));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
