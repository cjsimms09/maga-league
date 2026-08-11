'use strict';
// TWO THINGS THE ANALYZER GOT WRONG QUIETLY.
//
// 1. `world` was never declared in the /analyzer route. The line
//    `sleeper.bundle(world.config.sleeper_league_id)` threw a ReferenceError on
//    every single call, and the catch around it swallowed the throw as
//    "offline: fall through to the checkpoint". So the live-week default —
//    documented in a comment directly above, explaining that defaulting to the
//    final week is degenerate because the simulator has nothing left to run —
//    HAS NEVER ONCE FIRED. A catch whose comment names a cause it cannot
//    distinguish will hide every other cause forever.
//
// 2. The playoff cut was a private `const PLAYOFF_SPOTS = 4`, exported straight
//    to the page as the cut line. Seven copies of that rule were unified into
//    routes/playoffs.playoffCut earlier; this file and history-data kept theirs,
//    agreeing by coincidence. It is now the DEFAULT only, and the live season is
//    simulated with the league's own cut — with the engine REPORTING the number
//    it used, so the line the page draws and the odds beside it can never
//    describe different playoff fields.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'acw-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const LO = require(path.join(ROOT, 'src', 'routes', 'lineup'));
const ST = require(path.join(ROOT, 'src', 'routes', 'standings'));
const PO = require(path.join(ROOT, 'src', 'routes', 'playoffs'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 300) : ''))); };
const flat = h => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  const cfg = await store.get('config');
  const lid = cfg.sleeper_league_id || 'TESTLEAGUE';
  cfg.sleeper_league_id = lid;
  await store.set('config', cfg);

  // The season the analyzer defaults to, and a week well away from both the
  // final week and the 60% checkpoint it used to fall back on.
  const history = LO.harvest();
  const seasons = LO.defaultSeasons(history);
  const year = String(seasons[seasons.length - 1]);
  const seasonObj = LO.seasonOf(history, year);
  const weeks = LO.regularSeasonWeeks(seasonObj);
  const lastWeek = weeks[weeks.length - 1];
  const checkpoint = Math.max(1, Math.min(lastWeek - 1, Math.round(lastWeek * 0.6)));
  const LIVE_WEEK = Math.max(1, Math.min(lastWeek, checkpoint + 3));
  ck('fixture check: the live week differs from the checkpoint it fell back to',
    LIVE_WEEK !== checkpoint, { live: LIVE_WEEK, checkpoint, lastWeek });

  const putBundle = async spots => store.set('sleeper-cache', {
    league_id: lid, fetched_at: Date.now(),
    data: { state: { week: LIVE_WEEK, season: year },
      league: { name: 'MFGA', season: year, total_rosters: 10, settings: { playoff_teams: spots } },
      users: [], rosters: [], matchups: [], week: LIVE_WEEK } });

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const get = async r => flat(await (await fetch(base + r, { headers: { cookie } })).text());

  // ── 1) THE LIVE WEEK. With a live bundle for this season, the analyzer must
  // default to the week actually being played.
  {
    await putBundle(4);
    const t = await get('/analyzer');
    ck('the analyzer renders', /Projected rest-of-season/.test(t), t.slice(0, 140));
    const through = Number((t.match(/through week (\d+)/) || [])[1]);
    ck('  it defaults to the LIVE week, not the fallback checkpoint',
      through === LIVE_WEEK, { shown: through, live: LIVE_WEEK, checkpoint });
  }

  // ── 2) THE CUT. The league says six; the page must say six, and it must be
  // the number the simulation ran with.
  {
    await putBundle(6);
    const t = await get('/analyzer');
    ck('the cut line follows the league\'s playoff_teams',
      /top 6 make the playoffs/.test(t), (t.match(/top \d+ make the playoffs/) || [])[0]);
    ck('  and the line drawn in the table is the same number',
      /playoff line \(top 6\)/.test(t), (t.match(/playoff line \(top \d+\)/) || [])[0]);
    // The engine must REPORT it, or the page is quoting a constant beside odds
    // computed from a different one.
    const proj = ST.projectStandings(seasonObj, { throughWeek: LIVE_WEEK, sims: 200, seed: 1, spots: 6 });
    ck('  the engine reports the cut it simulated with', proj.spots === 6, proj.spots);
    ck('  and a different cut really does change the odds it produces',
      JSON.stringify(ST.projectStandings(seasonObj, { throughWeek: LIVE_WEEK, sims: 200, seed: 1, spots: 4 })
        .projections.map(p => p.playoff_prob))
      !== JSON.stringify(proj.projections.map(p => p.playoff_prob)));
  }

  // ── 3) An explicit ?week= still wins, and a past season is untouched.
  {
    const t = await get('/analyzer?week=3');
    ck('an explicit week overrides the live default', /through week 3/.test(t),
      (t.match(/through week \d+/) || [])[0]);
  }

  // ── 4) ONE DEFINITION. The rule itself may live in exactly one file.
  {
    const files = ['src/routes/standings.js', 'src/routes/history-data.js',
      'src/routes/member.js', 'src/routes/recap-data.js'];
    const offenders = files.filter(f => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
        .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      return /settings\s*&&\s*\S*\.playoff_teams|\.playoff_teams\s*\)?\s*\|\|\s*\d/.test(src);
    });
    ck('nobody re-derives the playoff cut for themselves', offenders.length === 0, offenders);
    ck('  and the default in the engine comes from that one definition',
      ST.PLAYOFF_SPOTS === PO.playoffCut({}), { engine: ST.PLAYOFF_SPOTS, one: PO.playoffCut({}) });
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
