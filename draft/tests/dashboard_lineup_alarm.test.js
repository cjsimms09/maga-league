/* THE EMPTY-SLOT ALARM (redesign catalog 15, 2026-08-24) — a dead starter
 * lands at the TOP of NEEDS YOU, cueing straight to Sleeper. Real app, real
 * render, fixtured Sleeper cache (the dispatch.test.js pattern) — positive
 * arm (empty slot + OUT starter) and negative arm (healthy lineup, no row).
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'lineupalarm-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app'));
const data = require(path.join(ROOT, 'src', 'data'));
const store = require(path.join(ROOT, 'src', 'store'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + '  -> ' + JSON.stringify(d))); };

function bundle(owners, myStarters) {
  const smap = {}; owners.forEach((o, i) => { smap[String(i + 1)] = o.id; });
  const rosters = owners.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + o.id,
    players: myStarters.filter(p => p !== '0'),
    settings: { wins: 1, losses: 1, fpts: 100, fpts_decimal: 0 } }));
  const users = owners.map(o => ({ user_id: 'u' + o.id, display_name: o.name,
    metadata: { team_name: o.name + ' FC' } }));
  const matchups = [
    { matchup_id: 1, roster_id: 1, starters: myStarters, players: myStarters.filter(p => p !== '0'),
      points: 0, players_points: {} },
    { matchup_id: 1, roster_id: 2, starters: ['q1', 'q2', 'q3', 'q4'], players: ['q1', 'q2', 'q3', 'q4'],
      points: 0, players_points: {} },
  ];
  return { smap, data: { week: 3, state: { week: 3, season: '2026', season_type: 'regular' },
    league: { total_rosters: owners.length, roster_positions: ['QB', 'RB', 'WR', 'FLEX'],
      settings: { playoff_teams: 4 } },
    users, rosters, matchups } };
}

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  for (const o of owners) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  await store.set('players-cache', { fetched_at: Date.now(), data: { players: {
    p1: { name: 'Hurt Guy', pos: 'QB', team: 'CIN', rank: 5, inj: 'Out' },
    p2: { name: 'Fine Back', pos: 'RB', team: 'DET', rank: 8, inj: null },
    p3: { name: 'Fine Wideout', pos: 'WR', team: 'MIA', rank: 9, inj: null },
    p4: { name: 'Healthy QB', pos: 'QB', team: 'BUF', rank: 3, inj: null },
    p5: { name: 'Flex Man', pos: 'WR', team: 'KC', rank: 20, inj: null },
    q1: { name: 'Opp QB', pos: 'QB', team: 'NYJ', rank: 12, inj: null },
    q2: { name: 'Opp RB', pos: 'RB', team: 'LV', rank: 13, inj: null },
    q3: { name: 'Opp WR', pos: 'WR', team: 'NE', rank: 14, inj: null },
    q4: { name: 'Opp Flex', pos: 'WR', team: 'SEA', rank: 15, inj: null },
  }, count: 9 } });

  // POSITIVE ARM: an OUT starter at QB and an empty FLEX slot.
  const bad = bundle(owners, ['p1', 'p2', 'p3', '0']);
  const cfg = (await store.get('config')) || {};
  cfg.sleeper_league_id = 'ALARMTEST'; cfg.sleeper_map = bad.smap;
  await store.set('config', cfg);
  await store.set('sleeper-cache', { league_id: 'ALARMTEST', fetched_at: Date.now(), data: bad.data });

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const cc = cookieFrom(await fetch(b + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=cory&password=pw', redirect: 'manual' }));

  const home = await (await fetch(b + '/', { headers: { Cookie: cc } })).text();
  ck('the alarm row renders in NEEDS YOU', /🚨/.test(home) && /Lineup problem:/.test(home), 'no alarm row');
  ck('…naming the OUT starter', /Hurt Guy \(Out\)/.test(home), 'OUT starter not named');
  ck('…and the empty slot', /empty FLEX slot/.test(home), 'empty slot not named');
  ck('…cueing straight to Sleeper', /sleeper\.com\/leagues\/ALARMTEST\/team/.test(home)
    && /fix on Sleeper/.test(home), 'sleeper cue missing');
  // Order is asserted INSIDE the card region — the page-top alert strip also
  // mentions votes, which is exactly the wrong-position match the first cut of
  // this check made (rule 3f, caught by its own first run).
  const card = home.slice(home.indexOf('aria-label="Needs you"'));
  const alarmPos = card.indexOf('Lineup problem:');
  const nextRow = card.indexOf('🗳') >= 0 ? card.indexOf('🗳') : card.indexOf('🤝');
  ck('…at the TOP of the card (before every other needs-you row)',
    alarmPos > 0 && (nextRow < 0 || alarmPos < nextRow), { alarmPos, nextRow });

  // NEGATIVE ARM: all healthy, all slots filled — no alarm.
  const good = bundle(owners, ['p4', 'p2', 'p3', 'p5']);
  await store.set('sleeper-cache', { league_id: 'ALARMTEST', fetched_at: Date.now(), data: good.data });
  const home2 = await (await fetch(b + '/', { headers: { Cookie: cc } })).text();
  ck('a healthy lineup shows NO alarm (negative arm)', !/Lineup problem:/.test(home2), 'false alarm');

  server.close();
  console.log(`\n${pass}/${pass + fail} lineup-alarm checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
