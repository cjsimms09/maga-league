// TERRITORY: B — register 427's Tier-0 copy fix (the wiring itself is Tier-2
// and stays with Cory; only the copy is touched here).
/* "AND THE COPY MAKES A PROMISE NOTHING CAN KEEP." Sleeper's player feed
 * (src/sleeper.js:players()) carries no per-week `proj` field at all, so
 * liveOptimizeFor()'s `sleeper` branch never fires and the lineup page runs
 * on realized points (season-avg or last-week) all season. The old copy said
 * "live projections drop in when Sleeper supplies them" and "a stopgap until
 * projections land" -- a promise that can never be kept, because nothing
 * ever asks Sleeper for a projection. This is the season's actual basis
 * unless Cory personally rules to wire the board's own projection feed in
 * (LEARNING-CONSTITUTION.md: that wiring is Tier-2, no silent default).
 *
 * Real app, real /lineup route, fixtured Sleeper cache -- not a template
 * read, since the whole point is what actually reaches the page.
 *
 * Run: node draft/tests/lineup_projection_copy_is_honest.test.js
 */
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lineup-copy-'));

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
  const opp = owners.find(o => o.id !== cory.id);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);

  const LID = 'COPYHONESTY';
  const cfg = await store.get('config');
  cfg.sleeper_league_id = LID; cfg.sleeper_map = { 1: cory.id, 2: opp.id };
  await store.set('config', cfg);

  const PLAYERS = { p1: { name: 'QB One', pos: 'QB', team: 'KC' }, p2: { name: 'RB One', pos: 'RB', team: 'SF' } };
  await store.set('players-cache', { fetched_at: Date.now(), data: { players: PLAYERS, count: 2 } });
  // Last week's real points -- the season-avg/last-week fallback this page
  // actually runs on, since players() never supplies a `proj` field.
  await store.set('stats-cache:2026:2', {
    fetched_at: Date.now(), data: { p1: { pts_half_ppr: 20 }, p2: { pts_half_ppr: 15 } },
  });
  await store.set('sleeper-cache', {
    league_id: LID, fetched_at: Date.now(),
    data: {
      state: { week: 3, season: '2026' },
      league: { name: 'x', season: '2026', total_rosters: 10, roster_positions: ['QB', 'RB', 'BN'] },
      users: [{ user_id: 'u0', display_name: cory.name }, { user_id: 'u1', display_name: opp.name }],
      rosters: [
        { roster_id: 1, owner_id: 'u0', players: ['p1', 'p2'], starters: ['p1', 'p2'], settings: { wins: 1, losses: 1, fpts: 100 } },
        { roster_id: 2, owner_id: 'u1', players: [], starters: [], settings: { wins: 1, losses: 1, fpts: 100 } },
      ],
      matchups: [
        { roster_id: 1, matchup_id: 1, points: 40, starters: ['p1', 'p2'] },
        { roster_id: 2, matchup_id: 1, points: 0, starters: [] },
      ],
      week: 3,
    },
  });

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const port = srv.address().port;
  const post = (p, body) => new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port, path: p, method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' } }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => resolve({ headers: r.headers, body: b }));
    });
    req.end(body); req.on('error', reject);
  });
  const get = (p, cookie) => new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port, path: p, headers: { Cookie: cookie } }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => resolve(b));
    }).on('error', reject);
  });

  const loginRes = await post('/login', 'username=cory&password=pw');
  const cookie = (loginRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const html = await get('/lineup', cookie);

  ck('the page really is on the last-week fallback (proving this exercises the real bug, not a guess)',
    /Projections: last week/.test(html), (html.match(/Projections:[^<]*/) || [])[0]);
  ck('the old false promise ("drop in when Sleeper supplies them") is GONE',
    !/drop in when Sleeper/.test(html));
  ck('the old false promise ("a stopgap until projections land") is GONE',
    !/stopgap until projections land/.test(html));
  ck('the old false promise ("directional... until live projections land") is GONE',
    !/until live projections land/.test(html));
  ck('the copy is honest instead: realized points, not a forecast',
    /realized points, not a forecast/.test(html));
  ck('the "directional, not precise" caution still shows (that part was true and stays)',
    /Treat the dollar figures as directional, not precise/.test(html));

  srv.close();
  console.log(`\n${pass}/${pass + fail} lineup-projection-copy-is-honest checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
