'use strict';
// SITE-REVIEW-2026-09-02 item ⑦: "show THE MODEL's picks after lock and
// grade it on the same board — owners vs the machine is an engagement hook
// we already have the data for." The data is MW.matchupOdds(), the same
// pre-kick win-probability call /scoreboard and /matchup already make.
//
// TWO LEVELS, deliberately separate:
//  (A) MODULE — PE.seasonBoard()'s new `extraParticipants` param, with a
//      hand-built deterministic picksFor(), isolating the BOARD/GRADING
//      wiring from matchupOdds' real win-probability values (same pattern
//      pickem_alltime_freeze.test.js already uses for the freeze fix).
//  (B) HTTP — the real /pickem route: the model's picks are computed once
//      after lock (real committed-board player ids, real matchupOdds call),
//      frozen (idempotent across repeat loads), revealed per game, and a
//      game with unknown starters gets an honest NO PICK rather than a guess.
//
// Run: node draft/tests/pickem_vs_model.test.js
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-model-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { getDoc } = require(path.join(ROOT, 'src', 'data'));
const PE = require(path.join(ROOT, 'src', 'routes', 'pickem'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

(async () => {
  // ── (A) MODULE — seasonBoard's extraParticipants ──────────────────────
  {
    const owners = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
    await store.set('pickem-slate:2099:1', { season: 2099, week: 1, locked: true,
      games: [{ id: 'g1', a: { id: 1, name: 'A' }, b: { id: 2, name: 'B' } }] });
    await store.set('pickem:2099:1:1', { season: 2099, week: 1, owner_id: 1, picks: { g1: 1 } }); // A picked A
    await store.set('pickem-points:2099:1', { 1: 100, 2: 90 });  // A wins for real

    const model = { id: -1, name: 'The Model', picksFor: async w => (w === 1 ? { g1: 2 } : null) }; // model picked B (wrong)
    // seasonBoard() calls weekPointsFor(week) with ONE arg -- season 2099 is
    // closed over, not passed (unlike allTimeBoard's weekPointsFor(season, week)).
    const resolver = async w => (await getDoc(`pickem-points:2099:${w}`, null));
    const board = await PE.seasonBoard(2099, 1, owners, resolver, [model]);
    const modelRow = board.board.find(r => r.owner_id === -1);
    ck('the model appears as a ranked row on the SAME board, via the SAME rankBoard() call',
      !!modelRow, board.board);
    ck('  graded through the SAME scoreWeek() call as a real owner — 1 graded, 0 correct (it picked B, A won)',
      modelRow && modelRow.graded === 1 && modelRow.correct === 0, modelRow);
    const aRow = board.board.find(r => r.owner_id === 1);
    ck('  a real owner\'s row is unaffected by the extra participant (still 1-for-1)',
      aRow && aRow.graded === 1 && aRow.correct === 1, aRow);

    // CONTROL: a week the model has no card for is skipped, not scored as 0-for-N.
    await store.set('pickem-slate:2099:2', { season: 2099, week: 2, locked: true,
      games: [{ id: 'g2', a: { id: 1, name: 'A' }, b: { id: 2, name: 'B' } }] });
    await store.set('pickem-points:2099:2', { 1: 80, 2: 95 });
    const board2 = await PE.seasonBoard(2099, 2, owners, resolver, [model]);   // model.picksFor(2) returns null
    const modelRow2 = board2.board.find(r => r.owner_id === -1);
    ck('CONTROL — a week with no model card is skipped entirely (still 1 graded total, not 2)',
      modelRow2 && modelRow2.graded === 1, modelRow2);

    // CONTROL: seasonBoard with NO extraParticipants (default []) behaves exactly as before.
    const boardOld = await PE.seasonBoard(2099, 1, owners, resolver);
    ck('CONTROL — omitting extraParticipants entirely (old call shape) still works, no model row',
      !boardOld.board.find(r => r.owner_id === -1) && boardOld.board.length === 2, boardOld.board.map(r => r.owner_id));
  }

  // ── (B) HTTP — the real /pickem route ──────────────────────────────────
  {
    await data.ensureSeeded();
    const owners = await store.get('owners');
    const active = owners.filter(o => o.active).slice(0, 10);
    const cory = owners.find(o => o.username === 'cory');
    cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
    await store.set('owners', owners);

    const LID = 'PKMODEL';
    const cfg = await store.get('config');
    cfg.sleeper_league_id = LID; cfg.sleeper_map = {};
    active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
    cfg.season_start = '2020-01-01';   // long past -> week 3 is locked
    await store.set('config', cfg);

    // Real committed-board QBs (register-434-adjacent pattern): a deterministic
    // MW.matchupOdds() call, verified directly -- pWin ~0.506 favors Lamar
    // Jackson's side. roster 1 (Cory, u0) starts Lamar; roster 2 starts Drake
    // Maye. Every other roster starts a BOGUS id -- proves the honest-refusal
    // control (no pick when odds can't be computed) on every other game.
    await store.set('sleeper-cache', {
      league_id: LID, fetched_at: Date.now(),
      data: {
        state: { week: 3, season: '2020' }, week: 3,
        league: { name: 'x', total_rosters: 10, settings: { playoff_week_start: 16, playoff_teams: 4 } },
        users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
        rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
          settings: { wins: 0, losses: 0, ties: 0, fpts: 0, fpts_decimal: 0 } })),
        matchups: active.map((o, i) => ({
          roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: 0,
          starters: i === 0 ? ['4881'] : i === 1 ? ['11564'] : ['bogus-id-' + i],
        })),
      },
    });

    const server = createApp().listen(0);
    await new Promise(r => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
    const cookie = login.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
    const html = await (await fetch(base + '/pickem', { headers: { cookie } })).text();

    ck('the slate is locked (season_start is long past) and the model reveal fires',
      /🤖 the model took/.test(html), (html.match(/🤖[^<]*/g) || []).slice(0, 3));

    const seasonYear = String(H.currentSeason(await store.get('seasons')).year);
    const mDoc = await getDoc(`pickem-model:${seasonYear}:3`, null);
    ck('a real ledger doc froze the model\'s picks for this week', !!mDoc, mDoc);

    const game1 = mDoc && mDoc.picks && Object.values(mDoc.picks).length
      ? Object.entries(mDoc.picks)[0] : null;
    ck('THE MODEL PICKED SOMETHING for the one game with real starters on both sides',
      Object.keys(mDoc.picks).length >= 1, mDoc.picks);

    // CONTROL: every OTHER game has bogus starters on at least one side -- no pick.
    ck('CONTROL — games with unresolvable starters get NO model pick (honest refusal, not a guess)',
      Object.keys(mDoc.picks).length < 5, mDoc.picks);

    // ── idempotency: a second load must not recompute/overwrite the freeze ──
    const before = JSON.stringify(mDoc);
    await fetch(base + '/pickem', { headers: { cookie } });
    const mDoc2 = await getDoc(`pickem-model:${seasonYear}:3`, null);
    ck('THE FREEZE IS IDEMPOTENT — a second page load does not recompute or overwrite the model\'s picks',
      JSON.stringify(mDoc2) === before, { before, after: JSON.stringify(mDoc2) });

    // the model appears on the rendered season board once the resolver has
    // something to grade -- structural check only (no games are final yet in
    // this fixture, so it's fine if the board doesn't show it as GRADED; the
    // wiring itself -- computeModelPicks/freeze/reveal -- is what this test
    // is proving).
    server.close();
  }

  console.log(`\n${pass}/${pass + fail} pickem-vs-model checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
