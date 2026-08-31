// TERRITORY: B (Little Things Catalog item 16, 2026-08-24)
/* "Injury chips on every player name, site-wide — the board carries the
 * status; show Q/OUT/IR beside every rendered name, one component."
 *
 * team.ejs's roster table used to have its own ad-hoc Status column: raw
 * r.inj text in a money-semantic "badge owes" class, and "healthy" for
 * anyone with no injury_status -- including a player on BYE, which is a
 * different (wrong) answer to "can I count on him" than the correct one.
 *
 * This does NOT re-test injuryFlag()'s own classification (already covered
 * by scope_agreement.test.js) -- it tests the WIRING: does /team actually
 * call it, does the chip land beside the name, is the old redundant column
 * gone, and does a healthy player correctly show nothing (silence, not
 * "healthy" — same "no empty furniture" principle the rest of the site uses).
 *
 * Run: node draft/tests/team_injury_chips.test.js
 */
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'team-inj-'));

const store = require(path.join(ROOT, 'src', 'store'));
store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const http = require('http');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);

  const LID = 'INJLEAGUE';
  const cfg = await store.get('config');
  cfg.sleeper_league_id = LID; cfg.sleeper_map = { 1: cory.id };
  await store.set('config', cfg);

  // Three players: one OUT, one QUESTIONABLE, one healthy. IDs/positions are
  // arbitrary; what matters is the .inj value each carries.
  await store.set('players-cache', {
    fetched_at: Date.now(),
    data: {
      players: {
        p1: { name: 'Out Guy', pos: 'RB', team: 'KC', rank: 20, inj: 'OUT' },
        p2: { name: 'Iffy Guy', pos: 'WR', team: 'SF', rank: 30, inj: 'QUESTIONABLE' },
        p3: { name: 'Fine Guy', pos: 'TE', team: 'DAL', rank: 40, inj: null },
      },
      count: 3,
    },
  });

  await store.set('sleeper-cache', {
    league_id: LID, fetched_at: Date.now(),
    data: {
      state: { week: 3 },
      league: { name: 'MFGA', season: '2026', total_rosters: 10 },
      users: [{ user_id: 'u0', display_name: cory.name }],
      rosters: [{ roster_id: 1, owner_id: 'u0',
        players: ['p1', 'p2', 'p3'], starters: ['p1', 'p2'],
        settings: { wins: 1, losses: 1, fpts: 100 } }],
      matchups: [],
      week: 3,
    },
  });

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const port = srv.address().port;
  const post = (p, formBody, cookie) => new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    if (cookie) headers.Cookie = cookie;
    const req = http.request({ host: 'localhost', port, path: p, method: 'POST', headers }, r => {
      let body = ''; r.on('data', c => body += c); r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body }));
    });
    req.end(formBody); req.on('error', reject);
  });
  const get = (p, cookie) => new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port, path: p, headers: { Cookie: cookie } }, r => {
      let body = ''; r.on('data', c => body += c); r.on('end', () => resolve({ status: r.statusCode, body }));
    }).on('error', reject);
  });

  const loginRes = await post('/login', 'username=cory&password=pw');
  const cookie = (loginRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const page = await get('/team', cookie);

  ck('the page renders without template errors', !/ReferenceError|Cannot read|is not defined/.test(page.body));
  ck('the roster actually loaded (not the empty-roster fallback)', page.body.includes('Out Guy'));

  ck('OUT shows the red .mu-flag.out chip beside the name',
    /Out Guy<\/b> <span class="mu-flag out">OUT<\/span>/.test(page.body));
  ck('QUESTIONABLE shows the amber .mu-flag.q chip with the short "Q" text',
    /Iffy Guy<\/b> <span class="mu-flag q">Q<\/span>/.test(page.body));
  ck('a healthy player shows NO chip beside the name (silence, not furniture)',
    /Fine Guy<\/b>(?! <span class="mu-flag)/.test(page.body));
  ck('  and the word "healthy" is gone from the page entirely',
    !/>healthy</.test(page.body));

  ck('the old redundant Status column header is gone',
    !/<th>Status<\/th>/.test(page.body));
  ck('the old money-semantic "badge owes" injury styling is gone from the roster',
    !/badge owes/.test(page.body));

  srv.close();
  console.log(`\n${pass}/${pass + fail} team-injury-chips checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
