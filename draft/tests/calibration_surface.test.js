'use strict';
// THE CALIBRATION SURFACE, END TO END — real predictions through the REAL grader
// onto the REAL page.
//
// /lineup/accuracy is where Cory finds out whether any of this works, and it had
// never had data behind it: every previous test either fed the display engine a
// hand-built calibration doc, or exercised the grader with no page attached. So
// a mismatch anywhere along the seam — ledger shape → grade-cron snapshot →
// route adapter → view — was invisible. (One already was: the route read a flat
// `calibration:<season>` key that nothing writes, so the page sat on "grading
// hasn't run yet" all season.)
//
// This test writes prediction ledger entries the way the client does, runs
// grade-cron's own runGrade(), stores the snapshot exactly as the cron does, then
// GETs the page and asserts REAL NUMBERS render — and, just as importantly, that
// the empty states are gone. Two runs, so calibration-over-time and "newly
// graded" have something to measure.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'calib-surface-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const GC = require(path.join(ROOT, 'netlify', 'functions', 'grade-cron'));
const ACC = require(path.join(ROOT, 'src', 'routes', 'accuracy'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 220) : ''))); };

// A ledger entry in the shape src/predledger.js writes.
let seq = 0;
const entry = (kind, payload, at, method) => ({
  kind, payload, at, decision_at: at, method: method || `${kind}-v0`, seq: ++seq,
});

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  const seasons = await store.get('seasons');
  const years = Object.values(seasons);
  const season = String((years.find(y => y.status !== 'complete') || years[years.length - 1]).year);

  // ── Round one: two survival calls and a room-seat call, all resolved. The keys
  // are namespaced exactly as public/js/draft/forecast.js emits them.
  const T0 = '2026-08-22T22:00:00.000Z', T1 = '2026-08-22T23:00:00.000Z';
  const round1 = [
    // said 90% he survives — he did. Confident and right.
    entry('forecast', { key: 'survival:p1@pick12', ftype: 'probability', value: 0.9,
      claim: 'Player 1 still on the board at pick 12', resolution: 'draft board at pick 12' }, T0, 'survival-forecast-v1'),
    entry('forecast_resolution', { forecast_key: 'survival:p1@pick12', outcome: 1 }, T1),
    // said 80% he survives — he did NOT. Confident and wrong: the headline miss.
    entry('forecast', { key: 'survival:p2@pick12', ftype: 'probability', value: 0.8,
      claim: 'Player 2 still on the board at pick 12', resolution: 'draft board at pick 12' }, T0, 'survival-forecast-v1'),
    entry('forecast_resolution', { forecast_key: 'survival:p2@pick12', outcome: 0 }, T1),
    // room seat: a point call, off by 3.
    entry('forecast', { key: 'room_seat:r1p4', ftype: 'point', value: 21,
      claim: 'Seat 4 takes the 21st-ranked player', resolution: 'completed draft' }, T0, 'room-seat-forecast-v1'),
    entry('forecast_resolution', { forecast_key: 'room_seat:r1p4', outcome: 24 }, T1),
    // one forecast with no resolution — must show as PENDING, not graded.
    entry('forecast', { key: 'survival:p9@pick30', ftype: 'probability', value: 0.55,
      claim: 'Player 9 still there at 30', resolution: 'draft board at pick 30' }, T0, 'survival-forecast-v1'),
  ];
  for (const e of round1) await store.set(`pred:${season}:${String(e.seq).padStart(6, '0')}`, e);

  const rules = { payouts: null, scoring: null, starters: null, roster_slots: null, teams: 10, season: Number(season) };
  const readAll = async () => {
    const keys = (await store.listKeys(`pred:${season}:`)).sort();
    const out = []; for (const k of keys) { const e = await store.get(k); if (e) out.push(e); }
    return out;
  };
  const runAt = async iso => {
    const priorKeys = (await store.listKeys(`calibration:${season}:`)).sort();
    const prior = []; for (const k of priorKeys) { const s = await store.get(k); if (s) prior.push(s); }
    const { snapshot } = GC.runGrade(await readAll(), rules, prior, iso);
    await store.set(`calibration:${season}:${iso}`, snapshot);
    return snapshot;
  };

  const snap1 = await runAt('2026-08-23T06:00:00.000Z');
  ck('the real grader grades the real ledger', snap1.forecasts.n_graded === 3, snap1.forecasts);
  ck('  and holds the unresolved one as pending, not graded', snap1.forecasts.n_pending === 1);

  // ── Round two: one more resolution lands, so "newly graded" has a delta and
  // calibration-over-time has a second point.
  const more = [
    entry('forecast_resolution', { forecast_key: 'survival:p9@pick30', outcome: 1 }, '2026-08-24T01:00:00.000Z'),
  ];
  for (const e of more) await store.set(`pred:${season}:${String(e.seq).padStart(6, '0')}`, e);
  const snap2 = await runAt('2026-08-24T06:00:00.000Z');
  ck('a second run picks up the newly resolved forecast', snap2.forecasts.n_graded === 4, snap2.forecasts.n_graded);

  // ── THE PAGE.
  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const res = await fetch(base + '/lineup/accuracy', { headers: { cookie } });
  const html = await res.text();

  ck('the accuracy page renders', res.status === 200, res.status);
  ck('  with no template error', !/ReferenceError|is not defined|Cannot read propert/.test(html));
  // ANCHOR FIRST. Every assertion below is a NEGATIVE ("the empty state is
  // gone"), and a negative passes on any page that isn't this one — the first
  // run of this test passed four of them against the LOGIN page, because the
  // session cookie hadn't been captured. Prove we are on the accuracy page
  // before believing anything absent from it means anything.
  ck('  and it IS the accuracy page (not a login redirect)',
    /Model Accuracy/.test(html) && /predictions logged/.test(html),
    html.slice(0, 160));

  // THE EMPTY STATES MUST BE GONE. This is the assertion that would have caught
  // the dead-key bug: the page rendered fine, it just said "nothing" forever.
  ck('the page is NOT still claiming grading has never run',
    !/Grading hasn't run yet/.test(html));
  ck('  the calibration card is NOT still empty', !/Not yet graded — 0 predictions resolved/.test(html));
  ck('  the graded list is NOT still empty', !/Nothing graded yet\./.test(html));
  ck('  the misses list is NOT still empty', !/No graded misses yet/.test(html));

  // REAL NUMBERS.
  ck('the pipeline counts are real', /\b4\b[\s\S]{0,80}graded/.test(html), (html.match(/acc-num[\s\S]{0,240}/) || [])[0]);
  ck('"what got graded this week" is answered from the run ledger',
    /1 newly graded<\/b> in the latest run/.test(html), (html.match(/newly graded[^<]*/) || [])[0]);
  ck('calibration over time draws once there are two runs', /Calibration over time/.test(html));
  ck('the reliability curve renders said-vs-happened', /said ~/.test(html) && /happened/.test(html));

  // THE BY-KIND TABLE. `by_kind` is optional in the interface and the grader does
  // not emit one, so this table never rendered — on real data as much as on none.
  // It is now derived from the namespaced keys the records already carry.
  ck('the by-prediction-type table fills in', /By prediction type/.test(html));
  ck('  and names the kinds from the record keys', /Survival calls/.test(html) && /Room-seat forecasts/.test(html),
    ((html.match(/By prediction type[\s\S]{0,700}/) || [])[0] || '(section absent)').replace(/\s+/g, ' ').slice(0, 400));

  // THE BIGGEST MISS must be the confident-and-wrong call, not the point error.
  const missBlock = (html.match(/Where it was most wrong[\s\S]{0,1400}/) || [''])[0];
  ck('the headline miss is the confident-and-wrong call, not a small point error',
    missBlock.indexOf('Player 2') > 0 && (missBlock.indexOf('Player 2') < missBlock.indexOf('Seat 4') || missBlock.indexOf('Seat 4') < 0),
    missBlock.replace(/\s+/g, ' ').slice(0, 300));
  // ...and it must not be padded with SUCCESSES. Ranking every graded call by
  // Brier put "said 90% → happened (Brier 0.01)" in the failure-modes list; on a
  // small sample the list was more right answers than wrong ones.
  ck('  the misses list contains no calls the model got RIGHT',
    !/Player 1 still on the board/.test(missBlock) && !/Player 9 still there/.test(missBlock),
    missBlock.replace(/\s+/g, ' ').slice(0, 400));

  // Two runs is a record, not a trend — the copy must not claim direction yet.
  ck('a two-run series does not claim a trend',
    /Too few runs to read as a trend/.test(html) && !/Falling bars mean the model is learning/.test(html));

  // ATTRIBUTION has no writer yet — it must say so rather than draw a blank table.
  ck('attribution states honestly that nothing is measured yet',
    /Nothing measured yet/.test(html));

  srv.close();

  // ── UNIT: the kind derivation itself, including the fallbacks.
  const rows = ACC.byKindRows({ graded: [
    { key: 'survival:x@pick3', ftype: 'probability', value: 0.9, outcome: 1, brier: 0.01 },
    { key: 'survival:y@pick3', ftype: 'probability', value: 0.8, outcome: 0, brier: 0.64 },
    { key: 'lineup_call:wk3', ftype: 'categorical', value: 'start', outcome: 'start', hit: true },
    { method: 'trade-eval-v2', ftype: 'point', value: 10, outcome: 13, abs_error: 3 },
  ] });
  const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
  ck('derived by-kind buckets by key namespace', byKey.survival && byKey.survival.n === 2, rows);
  ck('  averages Brier within the bucket', Math.abs(byKey.survival.brier - 0.325) < 1e-6, byKey.survival.brier);
  ck('  and reads a probability hit as the side it favoured', byKey.survival.accuracy === 0.5, byKey.survival.accuracy);
  ck('  categorical kinds carry accuracy', byKey.lineup_call && byKey.lineup_call.accuracy === 1);
  ck('  a record with no namespaced key falls back to its method',
    !!byKey.trade_eval && byKey.trade_eval.mae === 3, rows.map(r => r.key));
  ck('  rows are flagged as derived, not reported by the grader', rows.every(r => r.derived === true));
  // A's roll-up, when it exists, must win over ours.
  const authored = ACC.byKindRows({ by_kind: { survival: { n: 99, brier: 0.1 } },
    graded: [{ key: 'survival:z@pick1', ftype: 'probability', brier: 0.9, value: 1, outcome: 0 }] });
  ck("the grader's own roll-up wins when it exists",
    authored[0].n === 99 && authored[0].derived === false, authored);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
