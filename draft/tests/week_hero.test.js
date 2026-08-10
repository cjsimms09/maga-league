'use strict';
// THE IN-SEASON HERO — during a season week the home page leads with YOUR game:
// score, opponent, who's leading, and a lineup problem when there's a real one.
// Sleeper is unreachable in CI, so this stubs a synthetic live bundle and drives
// the REAL route + view end to end (route_smoke only covers the off-season null
// path). Guards against the "renders on a branch, breaks live" family.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'whero-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { getDoc, setDoc } = data;
const sleeper = require(path.join(ROOT, 'src', 'sleeper'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const opp = owners.find(o => o.username !== 'cory' && o.active);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);

  // Map roster 1 → Cory, roster 2 → the opponent.
  const cfg = await getDoc('config', {});
  cfg.sleeper_map = { '1': cory.id, '2': opp.id };
  await setDoc('config', cfg);

  // A synthetic LIVE bundle: Cory (80.5) leads the opponent (72.0) in week 3,
  // and Cory is starting a player ruled OUT — so the lineup flag must fire.
  const starters = ['s_qb', 's_rb1', 's_rb2', 's_wr1', 's_wr2', 's_te', 's_flex', 's_k', 's_def'];
  const oppStart = ['o_qb', 'o_rb1', 'o_rb2', 'o_wr1', 'o_wr2', 'o_te', 'o_flex', 'o_k', 'o_def'];
  const mkPts = ids => Object.fromEntries(ids.map((id, i) => [id, 10 - i * 0.5]));
  const bundle = {
    state: { season: '2026', week: 3 }, week: 3,
    league: { roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN'], settings: {} },
    users: [
      { user_id: 'u1', display_name: 'Cory', metadata: { team_name: 'Cory Machine' } },
      { user_id: 'u2', display_name: 'Opp', metadata: { team_name: 'Opp Squad' } },
    ],
    rosters: [
      { roster_id: 1, owner_id: 'u1', settings: { wins: 2, losses: 1, fpts: 300 }, starters, players: starters },
      { roster_id: 2, owner_id: 'u2', settings: { wins: 1, losses: 2, fpts: 250 }, starters: oppStart, players: oppStart },
    ],
    matchups: [
      { roster_id: 1, matchup_id: 7, points: 80.5, starters, players_points: mkPts(starters) },
      { roster_id: 2, matchup_id: 7, points: 72.0, starters: oppStart, players_points: mkPts(oppStart) },
    ],
  };
  const playersDb = { players: {} };
  starters.concat(oppStart).forEach(id => { playersDb.players[id] = { name: id.toUpperCase(), pos: 'RB', team: 'X', inj: null }; });
  playersDb.players.s_qb = { name: 'My QB', pos: 'QB', team: 'X', inj: null };
  playersDb.players.s_rb1 = { name: 'Hurt Guy', pos: 'RB', team: 'X', inj: 'OUT' };   // the lineup problem

  // Override the network-touching sleeper calls with the synthetic data.
  const orig = {};
  for (const k of ['bundle', 'players', 'wire', 'matchupsForWeek', 'weekReview']) orig[k] = sleeper[k];
  sleeper.bundle = async () => bundle;
  sleeper.players = async () => playersDb;
  sleeper.wire = async () => [];
  sleeper.matchupsForWeek = async () => null;
  sleeper.weekReview = () => null;

  try {
    const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
    const b = `http://127.0.0.1:${server.address().port}`;
    const c = cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' }));
    const html = await (await fetch(b + '/', { headers: { Cookie: c } })).text();

    ck('the in-season hero renders on the home page', /class="week-hero/.test(html));
    ck('hero leads with the week + "your game"', /Week 3 — your game/.test(html));
    ck('hero shows both live scores', /80\.5/.test(html) && /72\.0/.test(html));
    ck('hero shows the opponent name', new RegExp(opp.name).test(html));
    ck('hero says you lead (by the right margin, 8.5)', /you lead by 8\.5/.test(html));
    ck('hero flags the OUT starter as a lineup problem', /Lineup problem/.test(html) && /Hurt Guy/.test(html) && /OUT/.test(html));
    ck('hero taps through to the matchup', /class="week-hero[^"]*" href="\/matchup"/.test(html));
    ck('no template error', !/ReferenceError|is not defined|Cannot read/.test(html));

    server.close();
  } finally {
    Object.assign(sleeper, orig);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
