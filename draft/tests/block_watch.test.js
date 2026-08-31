/* BLOCK WATCH (Cory's 08-24 adversarial-waivers mandate) — the waivers page
 * flags the best available player at a position a rival has a startable hole
 * at, NAMES the rival, and states its own limits (P331 trial). Same fixture
 * discipline as waiver_stream_surface.test.js: scratch artifact via
 * DRAFT_DATA_PATH, seeded sleeper caches, real route render.
 *
 * Arms: (1) a rival with a K hole -> the wire's best K is flagged naming that
 * rival; (2) all rosters full -> the card is ABSENT (no manufactured advice);
 * (3) the P331 honesty line renders with the card.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'blockwatch-'));

const ROOT = path.join(__dirname, '..', '..');
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

const MINE = [
  ['m1', 'Josh Allen', 'QB', 300], ['m2', 'Bijan Robinson', 'RB', 240],
  ['m3', 'Breece Hall', 'RB', 220], ['m4', "Ja'Marr Chase", 'WR', 230],
  ['m5', 'Puka Nacua', 'WR', 210], ['m6', 'Sam LaPorta', 'TE', 180],
  ['m7', 'Jahmyr Gibbs', 'RB', 175], ['m8', 'Solid Kicker', 'K', 140],
  ['m9', 'Solid D/ST', 'DEF', 130], ['m10', 'Bench Scrub', 'WR', 120],
];
// The wire's best K — low value to me (my K is fine), gold to a K-less rival.
const WIRE = [['f1', 'Block Target K', 'K', 120], ['f2', 'Wire Scrub', 'WR', 90]];

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const active = owners.filter(o => o.active).slice(0, 10);
  active.forEach(o => { o.password_hash = hashPassword('pw'); o.must_change_password = false; });
  cory.is_commissioner = true;
  await store.set('owners', owners);
  const cfg = await store.get('config');
  const lid = cfg.sleeper_league_id || 'TESTLEAGUE';
  cfg.sleeper_league_id = lid;
  cfg.sleeper_map = {}; active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', cfg);
  const myRid = Object.keys(cfg.sleeper_map).find(k => Number(cfg.sleeper_map[k]) === Number(cory.id));
  const holeRid = Object.keys(cfg.sleeper_map).find(k => String(k) !== String(myRid));
  const holeOwnerName = (H.ownerById(owners, Number(cfg.sleeper_map[holeRid])) || {}).name;
  const SEASON = String(H.currentSeason(await store.get('seasons')).year);

  const artifactPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bw-art-')), 'draft_data.json');
  process.env.DRAFT_DATA_PATH = artifactPath;
  const seed = async ({ holeAtK }) => {
    fs.writeFileSync(artifactPath, JSON.stringify({
      players: [...MINE, ...WIRE].map(([id, name, pos, proj]) => ({
        player_id: id, name, position: pos, proj_mean: proj, vorp: Math.round(proj * 0.4), bye: null })),
    }));
    const slim = {};
    for (const [id, name, pos] of [...MINE, ...WIRE]) slim[id] = { name, pos, team: 'XXX', rank: 1, inj: null };
    await store.set('players-cache', { fetched_at: Date.now(), data: { players: slim, count: MINE.length + WIRE.length } });
    await store.set('sleeper-cache', {
      league_id: lid, fetched_at: Date.now(),
      data: { state: { week: 5, season: SEASON },
        league: { name: 'MFGA', season: SEASON, total_rosters: 10,
          roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN'],
          settings: { playoff_week_start: 15 } },
        users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
        rosters: active.map((o, i) => {
          const rid = String(i + 1);
          let players = MINE.map(p => p[0]);
          if (holeAtK && rid === String(holeRid)) players = players.filter(pid => pid !== 'm8'); // no K
          return { roster_id: i + 1, owner_id: 'u' + i, players,
            settings: { wins: 4, losses: 3, fpts: 700 } };
        }),
        matchups: [], week: 5 } });
  };

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const cookie = (await fetch(base + '/login', {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `username=${cory.username}&password=pw`,
  }).then(r => r.headers.getSetCookie())).map(x => x.split(';')[0]).join('; ');
  const rawPage = async () => (await fetch(base + '/waivers', { headers: { cookie }, redirect: 'manual' })).text();

  try {
    await seed({ holeAtK: true });
    let html = await rawPage();
    ck('a rival with a K hole surfaces Block Watch', /Block Watch/.test(html),
      (html.match(/.{0,60}Block.{0,60}/) || ['no Block text'])[0]);
    ck('  flagging the wire\'s best K by name', /Block Target K/.test(html));
    ck('  and NAMING the rival it denies', new RegExp('fills a startable hole for.*' + holeOwnerName).test(html.replace(/\n/g, ' ')), holeOwnerName);
    ck('  honest about what is not measured (the P331 trial line)',
      /whether they'?d actually spend their priority|that&#39;s on trial \(P331\)/.test(html) || /P331/.test(html),
      (html.match(/.{0,80}P331.{0,40}/) || ['no honesty line'])[0]);

    await seed({ holeAtK: false });
    html = await rawPage();
    ck('with every roster full, Block Watch is ABSENT — no manufactured advice',
      !/Block Watch/.test(html), (html.match(/.{0,60}Block Watch.{0,60}/) || [''])[0]);
  } finally {
    delete process.env.DRAFT_DATA_PATH;
    srv.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
