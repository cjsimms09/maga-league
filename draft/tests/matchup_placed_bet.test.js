'use strict';
// MATCHUP already-placed bet — the page shows the standing wager on this game
// instead of only offering to create another, and hides the create-form so you
// can't double-bet the same matchup.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mbet-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const other = owners.find(o => o.username !== 'cory' && o.active);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);

  // Place a matchup bet: Cory bets `other` $20 on week 1, proposed (awaiting them).
  await SB.propose({ proposer_id: cory.id, party_ids: [other.id], stake: 20,
    kind: 'matchup', week: 1, resolves: 'end of week 1', terms: 'outscore' });

  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const c = cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' }));
  const html = await (await fetch(b + '/matchup?opp=' + other.id, { headers: { Cookie: c } })).text();

  ck('the standing bet shows on the matchup page', /mu-bet-standing/.test(html));
  ck('it says you bet them and are waiting on acceptance', /bet .*\$20 on this game — waiting on them to accept/.test(html));
  ck('it links to the side-bet tab', /class="mu-bet-standing[^"]*" href="\/bank\?section=sidebets"/.test(html));
  ck('the create-a-bet form is suppressed while one is active', !/Send it to /.test(html));
  ck('no template error', !/matchupBet is not defined|ReferenceError|Cannot read/.test(html));

  // A DIFFERENT opponent with no bet shows NO standing banner (the create form
  // vs the closed-window message depends on the live bet window, which is closed
  // off-season in the sandbox — so we assert the banner is absent, not the form).
  const third = owners.find(o => o.active && o.id !== cory.id && o.id !== other.id);
  const html2 = await (await fetch(b + '/matchup?opp=' + third.id, { headers: { Cookie: c } })).text();
  ck('an opponent with no standing bet shows no standing banner', !/mu-bet-standing/.test(html2));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
