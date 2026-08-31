'use strict';
/* TERRITORY: E (red team), REPORT-ONLY. Does the lineup optimizer's PRIMARY
 * projection source exist?
 *
 * member.js's liveOptimizeFor() prices every start/sit decision from a cascade:
 *     r.proj  ->  seasonPts/gp  ->  wkPts  ->  0
 *      'sleeper'  'season-avg'   'last-week'  'none'
 * and views/lineup.ejs labels the fallbacks with a PROMISE:
 *   season-avg -> "live projections drop in when Sleeper supplies them"
 *   last-week  -> "last week's points (a stopgap until projections land)"
 *
 * Register 320 leans on that first step to argue the wire is the broken
 * surface: "member.js builds the START/SIT projection from a proper live
 * cascade -- Sleeper's weekly r.proj FIRST ... The codebase already knows how
 * to price a player in-season."
 *
 * This drives the REAL /lineup route to find out which branch actually runs.
 *
 * TWO-SIDED, because a one-sided null here is worthless (rule 3e):
 *   K1 KNOWN-POSITIVE  seed players-cache WITH a `proj` field -> the page must
 *                      report "live projections". Proves the branch is
 *                      reachable AND that this probe can observe it.
 *   K2 PRODUCTION SHAPE seed players-cache exactly as src/sleeper.js players()
 *                      builds it ({name,pos,team,rank,inj}) -> what does it say?
 *   K3 PRODUCER SEARCH  does anything in src/ ever fetch or assign a projection?
 *
 * Run: node draft/audit/lineup_projection_source_probe.js
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'projsrc-'));

const store = require(path.join(ROOT, 'src', 'store'));
store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

const LID = 'PROJSRCLEAGUE';
const BASE = {
  p1: { name: 'QB One', pos: 'QB', team: 'KC', rank: 10, inj: null },
  p2: { name: 'RB One', pos: 'RB', team: 'SF', rank: 20, inj: null },
  p3: { name: 'RB Two', pos: 'RB', team: 'DAL', rank: 30, inj: null },
  p4: { name: 'WR One', pos: 'WR', team: 'MIA', rank: 40, inj: null },
  p5: { name: 'WR Two', pos: 'WR', team: 'BUF', rank: 50, inj: null },
  p6: { name: 'TE One', pos: 'TE', team: 'DET', rank: 60, inj: null },
  p7: { name: 'FLEX Guy', pos: 'WR', team: 'CIN', rank: 70, inj: null },
  p8: { name: 'K One', pos: 'K', team: 'PHI', rank: 80, inj: null },
  p9: { name: 'DEF One', pos: 'DEF', team: 'BAL', rank: 90, inj: null },
};
const PROJ = { p1: 21, p2: 15, p3: 12, p4: 14, p5: 10, p6: 9, p7: 11, p8: 8, p9: 7 };
const WKPTS = { p1: 22, p2: 14, p3: 11, p4: 16, p5: 9, p6: 8, p7: 12, p8: 7, p9: 6 };

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('  PASS  ' + n))
  : (fail++, console.log('  FAIL  ' + n + (d !== undefined ? '\n          -> ' + JSON.stringify(d).slice(0,200) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const opp = owners.find(o => o.id !== cory.id);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);
  const cfg = await store.get('config');
  cfg.sleeper_league_id = LID;
  cfg.sleeper_map = { 1: cory.id, 2: opp.id };
  await store.set('config', cfg);

  const starters = Object.keys(BASE);
  async function seed({ withProj, week }) {
    const players = {};
    for (const [id, p] of Object.entries(BASE)) {
      players[id] = withProj ? { ...p, proj: PROJ[id] } : { ...p };
    }
    await store.set('players-cache', { fetched_at: Date.now(),
      data: { players, count: Object.keys(players).length } });
    // stats for the week the code will ask for: lastWeek = max(1, week-1)
    const lastWeek = Math.max(1, week - 1);
    const stats = {};
    for (const id of starters) stats[id] = { pts_half_ppr: WKPTS[id] };
    await store.set(`stats-cache:2026:${lastWeek}`, { fetched_at: Date.now(), data: stats });
    await store.set('sleeper-cache', {
      league_id: LID, fetched_at: Date.now(),
      data: {
        state: { week, season: '2026' },
        league: { name: 'ProjSrc', season: '2026', total_rosters: 10,
          roster_positions: ['QB','RB','RB','WR','WR','TE','FLEX','K','DEF','BN'] },
        users: [{ user_id: 'u0', display_name: cory.name }, { user_id: 'u1', display_name: opp.name }],
        rosters: [
          { roster_id: 1, owner_id: 'u0', players: starters, starters, settings: { wins: 1, losses: 1, fpts: 100 } },
          { roster_id: 2, owner_id: 'u1', players: [], starters: [], settings: { wins: 1, losses: 1, fpts: 100 } },
        ],
        matchups: [ { roster_id: 1, matchup_id: 1, points: 0, starters },
                    { roster_id: 2, matchup_id: 1, points: 0, starters: [] } ],
        week,
      },
    });
  }

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const port = srv.address().port;
  const post = (p, b) => new Promise((res, rej) => {
    const rq = http.request({ host: 'localhost', port, path: p, method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' } },
      r => { let s=''; r.on('data',c=>s+=c); r.on('end',()=>res({ status:r.statusCode, headers:r.headers })); });
    rq.end(b); rq.on('error', rej);
  });
  const get = (p, ck2) => new Promise((res, rej) => {
    http.get({ host: 'localhost', port, path: p, headers: { Cookie: ck2 } },
      r => { let s=''; r.on('data',c=>s+=c); r.on('end',()=>res(s)); }).on('error', rej);
  });
  const login = await post('/login', 'username=cory&password=pw');
  const cookie = (login.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  const srcLine = html => {
    const m = html.match(/Projections:\s*([^<.]*)/);
    return m ? m[1].trim() : '(no Projections line found)';
  };

  console.log('='.repeat(74));
  console.log("THE LINEUP OPTIMIZER'S PRIMARY PROJECTION SOURCE — does it exist?");
  console.log('='.repeat(74));

  console.log('\nK1 KNOWN-POSITIVE — players-cache seeded WITH a `proj` field');
  await seed({ withProj: true, week: 3 });
  const withP = srcLine(await get('/lineup', cookie));
  console.log(`     page says: "${withP}"`);
  ck('the `sleeper` branch is REACHABLE and this probe can observe it',
     /live projections/.test(withP), withP);

  console.log('\nK2 PRODUCTION SHAPE — seeded exactly as src/sleeper.js players() builds it');
  console.log('     (slim[id] = { name, pos, team, rank, inj } — no proj)');
  await seed({ withProj: false, week: 3 });
  const noP = srcLine(await get('/lineup', cookie));
  console.log(`     page says: "${noP}"`);
  ck('production does NOT reach the `sleeper` branch', !/live projections/.test(noP), noP);

  console.log('\nK3 PRODUCER SEARCH — is a producer wired to the SERVING PATH?');
  console.log('     ⚠️ My first version of this check asked "does any producer exist in src/"');
  console.log('     and FAILED, correctly: src/proj_feed.js exists and is exactly that');
  console.log('     producer. The claim it rescued me from was too broad. The real');
  console.log('     question is narrower and is the one below.');
  const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) {
    const fp = path.join(d, f);
    if (fs.statSync(fp).isDirectory()) walk(fp);
    else if (f.endsWith('.js')) files.push(fp);
  } })(path.join(ROOT, 'src'));
  const endpoint = files.filter(f => /\/projections\//.test(fs.readFileSync(f, 'utf8')));
  const assigns = [];
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    // an assignment that would put `proj` onto a roster row
    if (/\bproj\s*:/.test(t) || /\.proj\s*=/.test(t)) assigns.push(path.relative(ROOT, f));
  }
  const memberSrc = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'member.js'), 'utf8');
  const mwSrc = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'memberweek.js'), 'utf8');
  const sleeperSrc = fs.readFileSync(path.join(ROOT, 'src', 'sleeper.js'), 'utf8');
  const memberUses = /require\(['"][^'"]*proj_feed/.test(memberSrc);
  const mwUses = /require\(['"][^'"]*proj_feed/.test(mwSrc);
  const sleeperEmits = /\bproj\s*:/.test(sleeperSrc);
  console.log(`     files scanned: ${files.length}`);
  console.log(`     a producer EXISTS: src/proj_feed.js (+ src/weekly_player_projection.js)`);
  console.log(`     memberweek.js (scoreboard odds) requires proj_feed : ${mwUses}`);
  console.log(`     member.js     (THE LINEUP PAGE)  requires proj_feed : ${memberUses}`);
  console.log(`     sleeper.js rosterView emits a \`proj\` field        : ${sleeperEmits}`);
  ck('the producer exists but is NOT wired to the lineup page — built and disconnected',
     mwUses && !memberUses && !sleeperEmits, { mwUses, memberUses, sleeperEmits });

  console.log('\n' + '='.repeat(74));
  console.log('THE WEEK-1 COLD START — the week that happens next');
  console.log('='.repeat(74));
  console.log('  rosterView: lastWeek = Math.max(1, state.week - 1). In week 1 that is');
  console.log('  week 1 ITSELF, and before kickoff week-1 stats are empty. seasonPts is');
  console.log('  empty too (no games played). So the cascade falls all the way to 0.');
  // week 1, and NO prior stats seeded at all
  await store.set('players-cache', { fetched_at: Date.now(),
    data: { players: JSON.parse(JSON.stringify(BASE)), count: 9 } });
  await store.set('stats-cache:2026:1', { fetched_at: Date.now(), data: {} });
  await store.set('sleeper-cache', { league_id: LID, fetched_at: Date.now(),
    data: { state: { week: 1, season: '2026' },
      league: { name: 'ProjSrc', season: '2026', total_rosters: 10,
        roster_positions: ['QB','RB','RB','WR','WR','TE','FLEX','K','DEF','BN'] },
      users: [{ user_id: 'u0', display_name: cory.name }, { user_id: 'u1', display_name: opp.name }],
      rosters: [ { roster_id: 1, owner_id: 'u0', players: starters, starters, settings: { wins: 0, losses: 0, fpts: 0 } },
                 { roster_id: 2, owner_id: 'u1', players: [], starters: [], settings: { wins: 0, losses: 0, fpts: 0 } } ],
      matchups: [ { roster_id: 1, matchup_id: 1, points: 0, starters },
                  { roster_id: 2, matchup_id: 1, points: 0, starters: [] } ],
      week: 1 } });
  const wk1html = await get('/lineup', cookie);
  const wk1 = srcLine(wk1html);
  console.log(`\n     page says: "${wk1}"`);
  const pending = /projections pending|pending/i.test(wk1html);
  console.log(`     shows a "pending" state rather than a false ranking: ${pending}`);
  ck('week 1 pre-kick: the optimizer has NO basis to rank a lineup',
     /no projection data yet/.test(wk1) || pending, wk1);
  console.log('\n  MEANWHILE proj_feed.weekly() would return proj_mean/17 for every one of');
  console.log('  these players from the committed board — a full ranking, available today.');
  console.log('  It is required by memberweek.js (the scoreboard odds) and NOT by member.js.');

  console.log('\n' + '='.repeat(74));
  console.log('WHAT THE PAGE PROMISES CORY, from views/lineup.ejs:11');
  console.log('='.repeat(74));
  console.log('  season-avg -> "live projections drop in when Sleeper supplies them"');
  console.log('  last-week  -> "last week\'s points (a stopgap until projections land)"');
  console.log('  and line 115 adds: "directional, not precise, UNTIL LIVE PROJECTIONS LAND."');
  console.log(`\n  Observed source in production shape: "${noP}"`);
  console.log('  Both labels describe the present state as TEMPORARY. K3 says nothing');
  console.log('  in src/ can ever end it.');

  console.log(`\n${pass}/${pass + fail} checks passed`);
  srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
