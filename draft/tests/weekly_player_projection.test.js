// TERRITORY: A
/* WEEKLY PLAYER PROJECTIONS — the arithmetic the league-wide player loop runs on.
 *
 * What must hold before a single live forecast is emitted:
 *   - bye/inactive zeroing (both arms — a zero that means "not playing" must
 *     say so, and a Sleeper number must not survive our cannot-play guard);
 *   - the prior-to-realized blend (prior as 3 pseudo-weeks, exact arithmetic);
 *   - refusal on absent inputs (no board prior + thin history = NO row);
 *   - strictly-prior appearances (week w never sees week w);
 *   - deterministic keys + re-run dedupe;
 *   - TNF-late stamping and its EXCLUSION from grading, both arms;
 *   - the resolution join at players_points grain;
 *   - the per-arm per-position grade table the learning loop consumes;
 *   - predledger.appendBatch's seq-block reservation (crash-safety direction).
 *
 * Run: node draft/tests/weekly_player_projection.test.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const W = require(path.join(ROOT, 'src', 'weekly_player_projection.js'));
const PL = require(path.join(ROOT, 'src', 'predledger.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ── zeroing, both arms ──────────────────────────────────────────────────────
{
  const onBye = { proj_mean: 170, bye: 7, injury_status: null };
  const a = W.armOurs(onBye, { week: 7, realized: [10, 12] });
  ck('arm ours: a player on bye projects 0', a.value === 0 && a.status === 'zeroed');
  ck('  ...and says why', a.zeroed_because === 'bye');

  const out = { proj_mean: 170, bye: 7, injury_status: 'Out' };
  const b = W.armOurs(out, { week: 3, realized: [] });
  ck('arm ours: an OUT player projects 0 with the injury named',
    b.value === 0 && b.zeroed_because === 'injury:Out');

  const q = W.armOurs({ proj_mean: 170, bye: 7, injury_status: 'Questionable' }, { week: 3, realized: [] });
  ck('arm ours: Questionable is NOT zeroed (a game-time decision still has an expectation)',
    q.status === 'priced');

  const sb = W.armSleeper(onBye, { week: 7, sleeperRow: { pts_half_ppr: 14.2 } });
  ck('arm sleeper: our bye guard beats their number', sb.value === 0 && sb.status === 'zeroed');
  ck('  ...and the basis says the zero is OUR guard, not their line',
    sb.basis === 'zeroed(guard-over-sleeper)' && sb.zeroed_because === 'bye');
}

// ── the blend ───────────────────────────────────────────────────────────────
{
  const p = { proj_mean: 170, bye: 9, injury_status: null };   // prior = 10/wk
  const w1 = W.armOurs(p, { week: 1, realized: [] });
  ck('week 1, no realized: the projection IS the per-week prior', w1.value === 10);
  ck('  basis names the construction', w1.basis === 'blend:prior3w+realized0w');

  const w4 = W.armOurs(p, { week: 4, realized: [20, 20, 20] });
  // (3*10 + 60) / (3 + 3) = 15 — halfway at n=3 pseudo-weeks, by construction
  ck('blend arithmetic: (3*prior + sum)/(3+n) exactly', w4.value === 15, w4);

  const w15 = W.armOurs(p, { week: 15, realized: Array(12).fill(20) });
  ck('realized takes over as weeks accumulate (n=12 -> 18, past the midpoint)',
    w15.value === 18, w15.value);

  const noPrior = { proj_mean: null, bye: 9, injury_status: null };
  ck('no prior + 3 appearances: pure realized mean',
    W.armOurs(noPrior, { week: 5, realized: [8, 10, 12] }).value === 10);
  const thin = W.armOurs(noPrior, { week: 3, realized: [22, 30] });
  ck('no prior + thin history REFUSES — absent, never an invented number',
    thin.status === 'absent' && thin.value === null);
}

// ── arm sleeper pricing ─────────────────────────────────────────────────────
{
  const p = { proj_mean: null, bye: 9, injury_status: null };
  ck('sleeper arm reads pts_half_ppr first',
    W.armSleeper(p, { week: 3, sleeperRow: { pts_half_ppr: 11.3, pts_ppr: 13 } }).value === 11.3);
  ck('sleeper arm handles the {stats:{...}} row shape',
    W.armSleeper(p, { week: 3, sleeperRow: { stats: { pts_ppr: 13 } } }).value === 13);
  ck('no sleeper row -> absent (never a fake second source)',
    W.armSleeper(p, { week: 3, sleeperRow: undefined }).status === 'absent');
}

// ── strictly-prior appearances ──────────────────────────────────────────────
{
  const hist = { 1: { p1: 10 }, 2: { p1: 0 }, 3: { p1: 14 }, 4: { p1: 8 }, 5: { p1: 99 } };
  ck('appearances are strictly prior (week 5 never sees week 5)',
    JSON.stringify(W.appearances(hist, 'p1', 5, null)) === JSON.stringify([10, 14, 8]));
  ck('the bye week is not a game',
    JSON.stringify(W.appearances(hist, 'p1', 5, 3)) === JSON.stringify([10, 8]));
  ck('a 0.0 week is DNP-indistinguishable and dropped (declared assumption)',
    W.appearances(hist, 'p1', 5, null).indexOf(0) === -1);
}

// ── keys + dedupe ───────────────────────────────────────────────────────────
{
  const k = W.playerKey('2026', 3, '9221', 'ours');
  ck('keys are deterministic', k === 'wk|2026|3|player|9221|ours');
  ck('arms get distinct keys', k !== W.playerKey('2026', 3, '9221', 'sleeper'));
  ck('isPlayerKey recognises the shape and rejects the matchup shape',
    W.isPlayerKey(k) && !W.isPlayerKey('wk|2026|3|matchup|a|b'));
  ck('armOfKey reads the arm back', W.armOfKey(k) === 'ours');
  const fresh = W.dedupeAgainstMarker(
    [{ key: k }, { key: 'wk|2026|3|player|1|ours' }], { keys: [k] });
  ck('a re-run emits only what the marker has not seen', fresh.length === 1 && fresh[0].key !== k);
}

// ── the timing guard ────────────────────────────────────────────────────────
{
  const wk1 = W.lateCutoffUtc('2026-09-03', 1);
  ck('week-1 cutoff is the opening Thursday 22:00 UTC',
    wk1 === Date.parse('2026-09-03T22:00:00Z'));
  ck('week-3 cutoff advances exactly 14 days',
    W.lateCutoffUtc('2026-09-03', 3) === wk1 + 14 * 86400000);
  ck('no start date -> null (unknown timing is NOT "on time")',
    W.lateCutoffUtc(null, 3) === null);
}

// ── buildWeekForecasts: the whole slate ─────────────────────────────────────
const league = () => ({
  season: '2026', week: 7,
  rosters: [
    { roster_id: 1, players: ['qb1', 'rb1', 'byeguy', 'noproj'], starters: ['qb1', 'rb1', 'byeguy'] },
    { roster_id: 2, players: ['qb2'], starters: ['qb2'] },
  ],
  sleeperMap: { 1: '11', 2: '22' },
  boardById: {
    qb1: { player_id: 'qb1', proj_mean: 340, position: 'QB', team: 'BUF', injury_status: null },
    rb1: { player_id: 'rb1', proj_mean: 170, position: 'RB', team: 'DET', injury_status: null },
    byeguy: { player_id: 'byeguy', proj_mean: 204, position: 'WR', team: 'KC', injury_status: null },
    qb2: { player_id: 'qb2', proj_mean: 255, position: 'QB', team: 'DAL', injury_status: null },
  },
  playersDb: {},
  byes: { KC: 7, BUF: 9, DET: 10, DAL: 12 },
  history: { 1: { qb1: 20 }, 2: { qb1: 22 } },
  sleeperProj: { qb1: { pts_half_ppr: 19.5 }, byeguy: { pts_half_ppr: 0 } },
  now: Date.parse('2026-10-15T10:00:00Z'),
  lateCutoff: Date.parse('2026-10-15T22:00:00Z'),
});
{
  const out = W.buildWeekForecasts(league());
  const keys = out.forecasts.map(f => f.key);
  ck('every rostered player with inputs gets an ours row; absent gets none',
    keys.filter(k => k.endsWith('|ours')).length === 4,     // qb1 rb1 byeguy qb2; noproj refused
    keys);
  ck('the sleeper arm only prices players Sleeper priced',
    keys.filter(k => k.endsWith('|sleeper')).length === 2);
  const byeRow = out.forecasts.find(f => f.key.includes('byeguy') && f.arm === 'ours');
  ck('the bye row is a zero WITH its reason, in the emitted payload',
    byeRow.value === 0 && byeRow.zeroed_because === 'bye');
  const qb1row = out.forecasts.find(f => f.key.includes('|qb1|ours'));
  // prior 20/wk, realized [20,22] -> (3*20 + 42)/5 = 20.4
  ck('the emitted value is the blend', qb1row.value === 20.4, qb1row.value);
  ck('rows carry position/owner/starter for the grade table',
    qb1row.subject.position === 'QB' && qb1row.subject.owner_id === '11' && qb1row.subject.starter === true);
  ck('emitted BEFORE the cutoff -> emitted_late false on every row',
    out.forecasts.every(f => f.emitted_late === false));
  ck('coverage counts the refusal', out.coverage.ours_absent === 1);

  // team sums: owner 11 starters = qb1 (20.4) + rb1 (10) + byeguy (0) = 30.4
  const t = out.team_sums['11'];
  ck('team sum is the bye-aware starter total under arm ours',
    t.total === 30.4 && t.complete === true && t.zeroed === 1, t);

  const lateOut = W.buildWeekForecasts(Object.assign(league(),
    { now: Date.parse('2026-10-15T23:00:00Z') }));
  ck('emitted AT/AFTER the cutoff -> every row emitted_late true, both arms',
    lateOut.forecasts.every(f => f.emitted_late === true));
  const unknown = W.buildWeekForecasts(Object.assign(league(), { lateCutoff: null }));
  ck('unknown cutoff -> emitted_late null (named, never assumed on time)',
    unknown.forecasts.every(f => f.emitted_late === null));

  const partial = league();
  partial.rosters[0].starters = ['qb1', 'rb1', 'noproj'];
  const p = W.buildWeekForecasts(partial);
  ck('a starter with NO number makes the team total null, not smaller',
    p.team_sums['11'].total === null && p.team_sums['11'].complete === false);
}

// ── resolution join ─────────────────────────────────────────────────────────
{
  const fcs = W.buildWeekForecasts(league()).forecasts;
  const rows = W.resolvePlayerForecasts(fcs, { qb1: 27.3, rb1: 4.1 });
  ck('resolution joins per forecast key (both arms of qb1 + rb1 ours = 3 rows)',
    rows.length === 3, rows.map(r => r.forecast_key));
  ck('outcome is the realized points',
    rows.find(r => r.forecast_key.includes('|qb1|ours')).outcome === 27.3);
  ck('a player with no realized entry resolves NOTHING (pending, not a miss)',
    rows.every(r => !r.forecast_key.includes('byeguy')));
  ck('players_points from an all-zero week is null, not a week of zeros',
    W.playersPointsFromMatchups([{ players_points: { a: 0, b: 0 } }]) === null);
  ck('players_points reads every rostered player',
    W.playersPointsFromMatchups([{ players_points: { a: 10.5 } }, { players_points: { b: 3 } }]).b === 3);
}

// ── grading: the per-arm per-position table ─────────────────────────────────
{
  const mk = (key, value, payloadExtra, at) => ({
    kind: 'forecast', method: W.METHOD, decision_at: at || '2026-10-15T10:00:00Z',
    payload: Object.assign({ key, ftype: 'point', value, emitted_late: false }, payloadExtra),
  });
  const rs = (key, outcome, at) => ({
    kind: 'forecast_resolution', method: W.METHOD, decision_at: at || '2026-10-18T13:00:00Z',
    payload: { forecast_key: key, outcome },
  });
  const entries = [];
  for (let i = 0; i < 12; i++) {
    const ko = `wk|2026|1|player|p${i}|ours`, ks = `wk|2026|1|player|p${i}|sleeper`;
    const actual = 10 + i;
    entries.push(mk(ko, actual + 1, { arm: 'ours', subject: { week: 1, player_id: `p${i}`, position: 'QB' } }));
    entries.push(rs(ko, actual));
    entries.push(mk(ks, actual + 3, { arm: 'sleeper', subject: { week: 1, player_id: `p${i}`, position: 'QB' } }));
    entries.push(rs(ks, actual));
  }
  // one late row and one backdated row, both of which must NOT be graded
  entries.push(mk('wk|2026|1|player|late|ours', 9,
    { arm: 'ours', emitted_late: true, subject: { week: 1, player_id: 'late', position: 'QB' } }));
  entries.push(rs('wk|2026|1|player|late|ours', 12));
  entries.push(mk('wk|2026|1|player|back|ours', 9,
    { arm: 'ours', subject: { week: 1, player_id: 'back', position: 'QB' } }, '2026-10-19T00:00:00Z'));
  entries.push(rs('wk|2026|1|player|back|ours', 12, '2026-10-18T13:00:00Z'));

  const g = W.gradePlayerWeeks(entries);
  ck('graded rows exclude late and backdated', g.n_graded === 24);
  ck('a late row is counted, never silently graded', g.excluded_late_or_unknown_timing === 1);
  ck('a backdated "forecast" is disqualified (forward guarantee)', g.disqualified === 1);
  const qb = g.by_position.QB;
  ck('per-arm MAE is exact (ours err +1, sleeper err +3)',
    qb.ours.mae === 1 && qb.sleeper.mae === 3, qb);
  ck('bias is signed (+ = projected high)', qb.ours.bias === 1 && qb.sleeper.bias === 3);
  ck('the skill table names the better arm once both have real sample',
    qb.better_arm === 'ours');
  ck('rank corr is computed per arm (perfect ordering here)',
    g.rank_corr.ours === 1 && g.rank_corr.sleeper === 1);
  ck('by_week carries the same aggregates at week grain',
    g.by_week['1'].ours.n === 12);

  const thin = W.gradePlayerWeeks(entries.slice(0, 8));
  ck('under n=10 per arm the winner is null — a coin is not a verdict',
    thin.by_position.QB.better_arm === null);
}

// ── partition: player-week rows never blur the generic point stats ──────────
{
  const a = { kind: 'forecast', method: W.METHOD, payload: {} };
  const b = { kind: 'forecast', method: 'weekly-claims-v1', payload: {} };
  const c = { kind: 'forecast_resolution', method: W.METHOD, payload: {} };
  const s = W.partitionLedger([a, b, c]);
  ck('partitionLedger splits by method, both kinds',
    s.playerWeek.length === 2 && s.rest.length === 1 && s.rest[0] === b);
}

// ── the empty-payload trap on the sleeper fetch ─────────────────────────────
{
  const good = {};
  for (let i = 0; i < 60; i++) good['p' + i] = { pts_half_ppr: i };
  ck('a payload with priced rows normalises (dict shape)',
    W.normalizeProjectionPayload(good) !== null);
  const hollow = {};
  for (let i = 0; i < 60; i++) hollow['p' + i] = { gp: 1 };
  ck('a well-formed payload with EMPTY stat lines is refused (the zeroes-board trap)',
    W.normalizeProjectionPayload(hollow) === null);
  const list = [];
  for (let i = 0; i < 60; i++) list.push({ player_id: 'p' + i, stats: { pts_ppr: i } });
  ck('the list shape normalises to {player_id: stats}',
    W.normalizeProjectionPayload(list)['p3'].pts_ppr === 3);
}

// ── predledger.appendBatch ──────────────────────────────────────────────────
function mockStore(seed) {
  const docs = Object.assign({}, seed || {});
  return {
    docs,
    async get(k) { return k in docs ? docs[k] : null; },
    async set(k, v) { docs[k] = v; },
    async listKeys(prefix) { return Object.keys(docs).filter(k => k.startsWith(prefix)); },
  };
}
(async () => {
  {
    const st = mockStore();
    const raws = [1, 2, 3].map(i => ({ kind: 'forecast', method: W.METHOD, season: '2026',
      payload: { key: 'k' + i, ftype: 'point', value: i, resolution_rule: 'r' } }));
    const out = await PL.appendBatch(st, raws, { now: '2026-10-15T10:00:00Z' });
    ck('appendBatch writes every entry with sequential seqs',
      out.length === 3 && out[2].seq === 3 && st.docs['pred:2026:000000003']);
    ck('the counter is advanced to the block end', st.docs['pred-seq:2026'] === 3);
    const more = await PL.appendBatch(st, raws.slice(0, 1));
    ck('a second batch continues the stream', more[0].seq === 4);
  }
  {
    // Crash-safety direction: the counter is reserved BEFORE entries land, so a
    // partial batch leaves a seq GAP, never a counter behind the max key (which
    // would make every later append collide and refuse forever).
    const st = mockStore();
    const seen = [];
    const origSet = st.set.bind(st);
    st.set = async (k, v) => { seen.push(k); return origSet(k, v); };
    await PL.appendBatch(st, [{ kind: 'forecast', method: W.METHOD, season: '2026',
      payload: { key: 'k', ftype: 'point', value: 1, resolution_rule: 'r' } }]);
    ck('the seq block is reserved before any entry is written',
      seen[0] === 'pred-seq:2026' && seen[1].startsWith('pred:2026:'));
  }
  {
    const st = mockStore();
    let threw = false;
    try {
      await PL.appendBatch(st, [
        { kind: 'forecast', method: W.METHOD, season: '2026',
          payload: { key: 'a', ftype: 'point', value: 1, resolution_rule: 'r' } },
        { kind: 'forecast', method: W.METHOD, season: '2025',
          payload: { key: 'b', ftype: 'point', value: 1, resolution_rule: 'r' } }]);
    } catch (e) { threw = true; }
    ck('mixed seasons in one batch refuse (two counters, one stream)', threw);
    ck('a refused batch reserves nothing', !('pred-seq:2026' in st.docs));
  }
  {
    const st = mockStore();
    let threw = false;
    try {
      await PL.appendBatch(st, [{ kind: 'forecast', method: W.METHOD, season: '2026',
        payload: { key: 'a', ftype: 'point', value: 1 } }]);   // no resolution_rule
    } catch (e) { threw = true; }
    ck('validation runs BEFORE reservation — an ungradeable row burns no seq',
      threw && !('pred-seq:2026' in st.docs));
  }

  // ── wiring: the APIs the crons call must exist (claims_cron.test.js lesson) ──
  {
    const cron = require(path.join(ROOT, 'netlify', 'functions', 'player-projection-cron.js'));
    ck('player-projection-cron exports a handler', typeof cron.handler === 'function');
    ck('boardIndex keys the board by sleeper player_id',
      cron.boardIndex({ players: [{ player_id: '9221', proj_mean: 344.88 }] })['9221'].proj_mean === 344.88);
    const S = require(path.join(ROOT, 'src', 'sleeper.js'));
    ck('sleeper.matchupsForWeek exists (the resolution read)', typeof S.matchupsForWeek === 'function');
    ck('sleeper.players exists (live injury status)', typeof S.players === 'function');
    ck('predledger.appendBatch exists', typeof PL.appendBatch === 'function');
    ck('the grade partition + grader exist for grade-cron',
      typeof W.partitionLedger === 'function' && typeof W.gradePlayerWeeks === 'function');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
