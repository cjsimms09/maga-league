'use strict';
// PICK'EM — the engine (pure grading/aggregation) and the HTTP surface
// (save, lock, split-after-lock, and the accuracy boards) over the real app.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pickem-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const PE = require(path.join(ROOT, 'src', 'routes', 'pickem'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

// ── owners for the pure tests ──────────────────────────────────────────────────
const O = [{ id: 1, name: 'Cory' }, { id: 2, name: 'Rich' }, { id: 3, name: 'Mike' }, { id: 4, name: 'Dave' }];
const bundle = (week, pairs) => ({
  week, state: { week }, users: [], rosters: [],
  // pairs: [[rosterA, rosterB, ptsA, ptsB], ...]
  matchups: pairs.flatMap(([ra, rb, pa, pb], i) => ([
    { roster_id: ra, matchup_id: i + 1, points: pa },
    { roster_id: rb, matchup_id: i + 1, points: pb },
  ])),
});
const MAP = { '1': 1, '2': 2, '3': 3, '4': 4 };   // roster_id -> owner_id

(async function () {
  // ═══════════════ PURE ENGINE ═══════════════
  // gameId is stable regardless of argument order.
  ck('gameId low-first & order-independent', PE.gameId(3, 1) === '1:3' && PE.gameId(1, 3) === '1:3', PE.gameId(3, 1));

  // weekGames pairs matchups → owner games, drops byes/unmapped, orders by low id.
  const g = PE.weekGames(bundle(1, [[3, 1, 0, 0], [2, 4, 0, 0]]), MAP, O);
  ck('weekGames returns both games', g.length === 2, g.length);
  ck('weekGames orders by lower owner id', g[0].id === '1:3' && g[1].id === '2:4', g.map(x => x.id).join());
  ck('weekGames a is the lower owner', g[0].a.id === 1 && g[0].b.id === 3);
  const gBye = PE.weekGames({ week: 1, matchups: [{ roster_id: 1, matchup_id: 1, points: 0 }] }, MAP, O);
  ck('weekGames drops a lone (bye) roster', gBye.length === 0, gBye.length);
  const gUnmapped = PE.weekGames(bundle(1, [[1, 9, 0, 0]]), MAP, O);
  ck('weekGames drops a game with an unmapped team', gUnmapped.length === 0, gUnmapped.length);

  // locking: any points on the board locks it; otherwise the scheduled kickoff.
  ck('anyScoreOnBoard true when a game has points', PE.anyScoreOnBoard(bundle(1, [[1, 3, 88, 0]])) === true);
  ck('anyScoreOnBoard false at 0-0', PE.anyScoreOnBoard(bundle(1, [[1, 3, 0, 0]])) === false);
  ck('isLocked when points on board', PE.isLocked({ week: 1, at: new Date('2020-01-01'), anyScore: true }) === true);
  ck('isLocked before kickoff, no score, is false', PE.isLocked({ week: 1, seasonStart: '2099-09-10', at: new Date('2099-08-01'), anyScore: false }) === false);
  ck('isLocked after kickoff is true', PE.isLocked({ week: 1, seasonStart: '2020-09-10', at: new Date('2020-12-01'), anyScore: false }) === true);

  // grading one game
  const game = { id: '1:3', a: { id: 1, name: 'Cory' }, b: { id: 3, name: 'Mike' } };
  ck('gameResult winner', PE.gameResult(game, { '1': 120, '3': 100 }).winner === 1);
  ck('gameResult tie', PE.gameResult(game, { '1': 100, '3': 100 }).winner === 'tie');
  ck('gameResult pending when a score is missing', PE.gameResult(game, { '1': 100 }) === null);

  // scoreWeek: correct / graded / pending / missed
  const games2 = [game, { id: '2:4', a: { id: 2, name: 'Rich' }, b: { id: 4, name: 'Dave' } }];
  const wp = { '1': 120, '3': 100, '2': 90, '4': 110 };  // winners: 1 and 4
  ck('scoreWeek all correct', JSON.stringify(PE.scoreWeek({ '1:3': 1, '2:4': 4 }, games2, wp)) ===
    JSON.stringify({ correct: 2, graded: 2, total: 2, pending: 0, missed: 0 }));
  ck('scoreWeek one wrong', PE.scoreWeek({ '1:3': 3, '2:4': 4 }, games2, wp).correct === 1);
  ck('scoreWeek a missed pick is not graded', PE.scoreWeek({ '1:3': 1 }, games2, wp).missed === 1);
  ck('scoreWeek pending when week not final', PE.scoreWeek({ '1:3': 1 }, games2, null).pending === 2);
  const tieWp = { '1': 100, '3': 100, '2': 90, '4': 110 };
  ck('scoreWeek a tie counts for nobody', PE.scoreWeek({ '1:3': 1, '2:4': 4 }, games2, tieWp).graded === 1);

  // split + who backed whom
  const allPicks = [
    { owner_id: 1, picks: { '1:3': 1 } }, { owner_id: 2, picks: { '1:3': 1 } },
    { owner_id: 3, picks: { '1:3': 3 } }, { owner_id: 4, picks: { '1:3': 1 } },
  ];
  const sp = PE.gameSplit(game, allPicks);
  ck('gameSplit counts each side', sp.a === 3 && sp.b === 1 && sp.total === 4, JSON.stringify(sp));
  const line = PE.splitLine(game, allPicks, id => O.find(o => o.id === id).name);
  ck('splitLine reads "3 of 4 took Cory"', /3 of 4 took Cory/.test(line), line);
  const backers = PE.backedAgainst(game, 1, allPicks, id => O.find(o => o.id === id).name);
  ck('backedAgainst lists who took my opponent', backers.length === 1 && backers[0] === 'Mike', backers.join());

  // rankBoard: ordering, eligibility floor, the single worst seat
  const rows = [
    { owner_id: 1, name: 'Cory', correct: 8, graded: 10 },
    { owner_id: 2, name: 'Rich', correct: 2, graded: 10 },
    { owner_id: 3, name: 'Mike', correct: 6, graded: 10 },
    { owner_id: 4, name: 'Dave', correct: 1, graded: 1 },   // below the floor
  ];
  const board = PE.rankBoard(rows, 2);
  ck('rankBoard sorts by accuracy', board[0].owner_id === 1 && board[1].owner_id === 3, board.map(r => r.owner_id).join());
  ck('rankBoard worst is lowest ELIGIBLE (not the tiny sample)', board.find(r => r.worst).owner_id === 2, (board.find(r => r.worst) || {}).owner_id);
  ck('rankBoard tiny sample is ineligible', board.find(r => r.owner_id === 4).eligible === false);
  ck('rankBoard pct computed', Math.round(board[0].pct * 100) === 80);

  // accumulate merges weeks per owner
  const acc = PE.accumulate([
    { owner_id: 1, name: 'Cory', correct: 3, graded: 5 },
    { owner_id: 1, name: 'Cory', correct: 4, graded: 5 },
    { owner_id: 2, name: 'Rich', correct: 0, graded: 0 },
  ]);
  const c1 = acc.find(r => r.owner_id === 1);
  ck('accumulate sums a picker across weeks', c1.correct === 7 && c1.graded === 10 && c1.weeks === 2, JSON.stringify(c1));

  // ═══════════════ HTTP SURFACE ═══════════════
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const rich = owners.find(o => o.name === 'Richard');
  const oid = { cory: cory.id, rich: rich.id };
  // Map the four Sleeper rosters used by the fixture onto real seeded owners.
  const others = owners.filter(o => o.id !== cory.id && o.id !== rich.id).slice(0, 2);
  const smap = { '1': cory.id, '2': rich.id, '3': others[0].id, '4': others[1].id };
  for (const o of [cory, rich, ...others]) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  const cfg = (await store.get('config')) || {};
  cfg.sleeper_league_id = 'TESTLEAGUE'; cfg.sleeper_map = smap; cfg.season_start = '2099-09-10';
  await store.set('config', cfg);

  // Season year the app will use for keys.
  const seasons = await store.get('seasons');
  const seasonYear = Number(Object.values(seasons).find(s => s.status === 'active')?.year
    || Object.keys(seasons).sort().pop());

  // ── seed a FINAL past week (week 1) so the season board has something to grade.
  // slate: two games (cory v other0, rich v other1); cory nails both, rich misses both.
  await store.set(`pickem-slate:${seasonYear}:1`, {
    season: seasonYear, week: 1, locked: true, games: [
      { id: PE.gameId(cory.id, others[0].id), a: { id: Math.min(cory.id, others[0].id), name: 'a' }, b: { id: Math.max(cory.id, others[0].id), name: 'b' } },
      { id: PE.gameId(rich.id, others[1].id), a: { id: Math.min(rich.id, others[1].id), name: 'a' }, b: { id: Math.max(rich.id, others[1].id), name: 'b' } },
    ],
  });
  const gA = PE.gameId(cory.id, others[0].id), gB = PE.gameId(rich.id, others[1].id);
  // week-1 final points: cory beats other0; other1 beats rich.
  const wpts = {}; wpts[String(cory.id)] = 130; wpts[String(others[0].id)] = 100;
  wpts[String(rich.id)] = 90; wpts[String(others[1].id)] = 115;
  await store.set(`weekpoints:TESTLEAGUE:1`, { fetched_at: Date.now(), points: wpts });
  await store.set(`pickem:${seasonYear}:1:${cory.id}`, { season: seasonYear, week: 1, owner_id: cory.id, picks: { [gA]: cory.id, [gB]: others[1].id } }); // both right
  await store.set(`pickem:${seasonYear}:1:${rich.id}`, { season: seasonYear, week: 1, owner_id: rich.id, picks: { [gA]: others[0].id, [gB]: rich.id } });   // both wrong

  // ── current week (week 3), UNLOCKED (0-0 on the board, kickoff in the future).
  await store.set('sleeper-cache', {
    league_id: 'TESTLEAGUE', fetched_at: Date.now(),
    data: bundleReal(3, cory.id, rich.id, others, smap, false),
  });

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' }));
  const cc = await login('cory'), rc = await login(rich.username);
  const get = async (p, ck) => { const r = await fetch(b + p, { headers: { Cookie: ck }, redirect: 'manual' }); return { status: r.status, body: r.status === 200 ? await r.text() : '', loc: r.headers.get('location') }; };
  const post = async (p, ck, body) => { const r = await fetch(b + p, { method: 'POST', headers: { Cookie: ck, 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual' }); return { status: r.status, loc: r.headers.get('location') }; };

  // page renders, boards present
  const page = await get('/pickem', cc);
  ck('GET /pickem renders', page.status === 200, page.status);
  ck('page shows the accuracy leaderboard', /Accuracy/.test(page.body));
  ck('week-1 grade is in the season board (Cory 100%)', /100%/.test(page.body), 'no 100% cell');
  ck('the worst picker is named (Hall of Shame)', /worst picker in the league/.test(page.body));

  // current week (week 3) is unlocked → the split is hidden
  ck('pre-lock, picks are hidden', /hidden until kickoff/.test(page.body));

  // Cory posts week-3 picks (unlocked) and they save
  const gid3 = PE.gameId(cory.id, rich.id);   // week3 fixture pairs cory v rich
  const other3 = PE.gameId(others[0].id, others[1].id);
  const saveR = await post('/pickem', cc, `pick_${gid3}=${cory.id}&pick_${other3}=${others[0].id}`);
  ck('POST /pickem redirects to saved', saveR.status === 302 && /saved=1/.test(saveR.loc || ''), saveR.loc);
  const saved = await store.get(`pickem:${seasonYear}:3:${cory.id}`);
  ck('picks persisted for the current week', saved && Number(saved.picks[gid3]) === cory.id, JSON.stringify(saved && saved.picks));

  // ── now LOCK week 3 (points on the board) and re-render: split becomes public
  await store.set('sleeper-cache', {
    league_id: 'TESTLEAGUE', fetched_at: Date.now(),
    data: bundleReal(3, cory.id, rich.id, others, smap, true),
  });
  // rich also picks (against cory) so the split has two sides — but it's locked,
  // so the POST must be REFUSED.
  const lateR = await post('/pickem', rc, `pick_${gid3}=${rich.id}`);
  ck('POST after lock is refused (redirect late)', lateR.status === 302 && /late=1/.test(lateR.loc || ''), lateR.loc);
  const richWk3 = await store.get(`pickem:${seasonYear}:3:${rich.id}`);
  ck('a locked week saved nothing', !richWk3, richWk3 ? 'saved anyway' : 'ok');

  const locked = await get('/pickem', cc);
  ck('post-lock, the split line shows', /took /.test(locked.body), 'no split line');
  ck('post-lock, "your pick" is marked', /your pick/.test(locked.body));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

// A fuller fake bundle with users/rosters so teamName() etc. don't choke, and
// real owner→roster mapping. `scored` puts points on the board (→ locked).
function bundleReal(week, coryId, richId, others, smap, scored) {
  const inv = {}; for (const [rid, oid] of Object.entries(smap)) inv[oid] = rid;
  const rosters = Object.entries(smap).map(([rid, oid]) => ({ roster_id: Number(rid), owner_id: 'u' + oid, settings: {} }));
  const users = Object.entries(smap).map(([rid, oid]) => ({ user_id: 'u' + oid, display_name: 'own' + oid, metadata: {} }));
  // week 3 games: cory v rich, other0 v other1
  const pairs = [
    [Number(inv[coryId]), Number(inv[richId]), scored ? 101 : 0, scored ? 88 : 0],
    [Number(inv[others[0].id]), Number(inv[others[1].id]), scored ? 95 : 0, scored ? 97 : 0],
  ];
  return {
    week, state: { week }, league: {}, users, rosters,
    matchups: pairs.flatMap(([ra, rb, pa, pb], i) => ([
      { roster_id: ra, matchup_id: i + 1, points: pa },
      { roster_id: rb, matchup_id: i + 1, points: pb },
    ])),
  };
}
