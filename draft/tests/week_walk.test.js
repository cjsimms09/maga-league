'use strict';
// WALKING A WEEK, NOT READING THE CODE.
//
// The optimizer had a correctness sweep and a design pass and nobody had ever
// walked a simulated WEEK through it with a real roster. These three came out of
// that walk, in a browser, and none of them is visible from reading the module.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const LO = require(path.join(ROOT, 'src', 'routes', 'lineup.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 240) : ''))); };
const strip = h => h.replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ');

// FAIL BY NAME, NEVER CRASH. Written after this file did exactly that on its
// first run against the pre-fix code: `LO.typicalTeamScore` did not exist, the
// top-level block threw, and the run printed NOTHING — so a regression that
// removed the derivation would produce a stack trace instead of "the opponent
// model is gone". Same lesson as scope_agreement, and I still had to relearn it.
const need = (obj, name, what) => {
  if (obj && typeof obj[name] === 'function') return obj[name].bind(obj);
  ck(`${what} is exported (${name})`, false, 'missing — the derivation it guards is gone');
  return () => ({ median: 0, mean: 0, sd: 0, n: 0, samples: [] });
};
const SEASON = '2026';
const SQUAD = [
  ['p1', 'Josh Allen', 'QB', 'BUF', 21.4], ['p2', 'Bijan Robinson', 'RB', 'ATL', 16.2],
  ['p3', 'Breece Hall', 'RB', 'NYJ', 14.1], ["p4", "Ja'Marr Chase", 'WR', 'CIN', 17.8],
  ['p5', 'Puka Nacua', 'WR', 'LAR', 15.3], ['p6', 'Sam LaPorta', 'TE', 'DET', 11.2],
  ['p7', 'Jahmyr Gibbs', 'RB', 'DET', 13.6], ['p8', 'Harrison Butker', 'K', 'KC', 8.4],
  ['p9', 'Ravens D/ST', 'DEF', 'BAL', 7.9], ['p10', 'Garrett Wilson', 'WR', 'NYJ', 12.7],
  ['p11', 'Tony Pollard', 'RB', 'TEN', 10.4], ['p14', 'Baker Mayfield', 'QB', 'TB', 17.1],
];

// ── 1) THE PHANTOM OPPONENT — engine-level, so it is checkable without a browser.
// Before the opponent's score exists (Tue→Sun morning, the whole window in which
// a lineup is set) the route fed `weeklyHighBand().median` as the opponent's
// mean. That band is the median of the score that WINS the week outright.
{
  const high = LO.weeklyHighBand();
  const typical = need(LO, 'typicalTeamScore', 'the typical-opponent model')();
  ck('the weekly-HIGH band and a TYPICAL team score are different quantities',
    high.median - typical.median > 25, { high: high.median, typical: typical.median });
  ck('  typicalTeamScore samples every team-week, not the winner of each',
    typical.n > high.n * 5, { typical_n: typical.n, high_n: high.n });

  const roster = [
    { id: 'q', name: 'QB', pos: 'QB', proj: 17.1 }, { id: 'r1', name: 'RB1', pos: 'RB', proj: 16.2 },
    { id: 'r2', name: 'RB2', pos: 'RB', proj: 14.1 }, { id: 'w1', name: 'WR1', pos: 'WR', proj: 17.8 },
    { id: 'w2', name: 'WR2', pos: 'WR', proj: 15.3 }, { id: 't', name: 'TE', pos: 'TE', proj: 11.2 },
    { id: 'k', name: 'K', pos: 'K', proj: 8.4 }, { id: 'd', name: 'DEF', pos: 'DEF', proj: 7.9 },
    { id: 'f', name: 'FLEX', pos: 'RB', proj: 13.6 },
    { id: 'b', name: 'BoomWR', pos: 'WR', proj: 12.9, sd: 14 },
  ];
  const run = opp => {
    const res = LO.optimize(roster, { band: high, sigmaByPos: LO.positionSigmas(), oppMean: opp });
    return { res, posture: LO.weeklyPosture(res, high) };
  };
  const phantom = run(high.median), real = run(typical.median);
  // The defect was never "P(win) is a bit low" — it CHANGED THE RECOMMENDATION.
  ck('modelling the opponent as the week WINNER flips the posture to chase',
    phantom.posture.mode === 'chase' && /long shot/i.test(phantom.posture.headline),
    phantom.posture);
  ck('  and manufactures a start/sit call that a real opponent does not',
    phantom.res.calls.length > 0 && real.res.calls.length === 0,
    { phantom_calls: phantom.res.calls.length, real_calls: real.res.calls.length });
  ck('  against a typical opponent the same roster is a favourite, and PROTECT',
    real.res.ev.pWin > 0.5 && real.posture.mode === 'protect',
    { pWin: real.res.ev.pWin, mode: real.posture.mode });
}

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  const active = owners.filter(o => o.active).slice(0, 10);
  const cfg = await store.get('config');
  const lid = cfg.sleeper_league_id || 'TESTLEAGUE';
  cfg.sleeper_league_id = lid;
  cfg.sleeper_map = {}; active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', cfg);
  const myRid = Object.keys(cfg.sleeper_map).find(k => cfg.sleeper_map[k] === cory.id);

  const seed = async ({ inj = {}, failed = false, week = 7 } = {}) => {
    const slim = {};
    for (const [id, name, pos, team] of SQUAD) slim[id] = { name, pos, team, rank: 1 + Number(id.slice(1)), inj: inj[id] || null };
    await store.set('players-cache', { fetched_at: Date.now(), data: { players: slim, count: SQUAD.length } });
    const seas = {}, wk = {};
    for (const [id, , , , proj] of SQUAD) { seas[id] = { pts_half_ppr: proj * 6, gp: 6 }; wk[id] = { pts_half_ppr: proj }; }
    await store.set(`stats-cache:${SEASON}:season`, { fetched_at: Date.now(), data: seas });
    await store.set(`stats-cache:${SEASON}:${week - 1}`, { fetched_at: Date.now(), data: wk });
    await store.set('sleeper-cache', {
      league_id: lid, fetched_at: Date.now(), cached: new Date().toISOString(),
      ...(failed ? { failed_at: Date.now() } : {}),
      data: {
        state: { week, season: SEASON }, league: { name: 'MFGA', season: SEASON, total_rosters: 10 },
        users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
        rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
          players: String(i + 1) === String(myRid) ? SQUAD.map(p => p[0]) : [],
          starters: String(i + 1) === String(myRid) ? SQUAD.slice(0, 9).map(p => p[0]) : [],
          settings: { wins: 4, losses: 2, fpts: 700 + i } })),
        matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: 0 })),
        week,
      },
    });
  };

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const get = async r => (await fetch(base + r, { headers: { cookie } })).text();

  // ── 2) A QUESTIONABLE STARTER MUST BE NAMED.
  // The page listed the players it ZEROED (bye/out) and said nothing about the
  // ones it kept at full projection while carrying a Q or Doubtful tag — on a
  // Thursday, the only player whose status is actually in question.
  await seed({ inj: { p5: 'Questionable' } });
  {
    const t = strip(await get('/lineup'));
    ck('the optimizer page renders with a real roster', /LINEUP OPTIMIZER|Lineup Optimizer/i.test(t) && /PLAY THIS|Play This/i.test(t));
    ck('a Questionable STARTER is named on the optimizer', /Puka Nacua/.test(t) && /tagged/i.test(t),
      (t.match(/(Started at full projection but tagged|Not eligible)[^.]*\./) || ['(absent)'])[0]);
    ck('  and it says the projection still stands rather than implying a sit',
      /projection stands/.test(t));
    // The bye guard is the one that ZEROES; both must be present and distinct.
    ck('  a bye player is still reported separately as not eligible',
      /Not eligible this week/.test(t) && /bye/i.test(t),
      (t.match(/Not eligible this week[^.]*\./) || ['(absent)'])[0]);
  }
  // A clean week names nobody — the flag must not be permanent furniture.
  await seed({});
  ck('a week with no tagged starter shows no tag line',
    !/Started at full projection but tagged/.test(strip(await get('/lineup'))));

  // ── 3) THE STALENESS BANNER ON THE PAGE THAT PRICES THE DATA.
  // dashboard, matchup, watch and scoreboard all carried it. /lineup — the one
  // page that turns the feed into a dollar recommendation — did not.
  await seed({ failed: true });
  for (const r of ['/lineup', '/matchup', '/scoreboard', '/watch']) {
    ck(`${r} warns when Sleeper has failed`, /Sleeper isn't responding/.test(await get(r)));
  }
  await seed({ failed: false });
  for (const r of ['/lineup', '/matchup']) {
    ck(`  ${r} is silent when the feed is healthy`, !/Sleeper isn't responding/.test(await get(r)));
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
