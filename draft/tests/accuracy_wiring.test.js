'use strict';
// THE LEARNING LOOP MUST BE VISIBLE — the accuracy page is where Cory finds out
// whether any of this works, so it has to read what the grader ACTUALLY writes.
//
// It didn't. grade-cron writes an append-only ledger at
// `calibration:<season>:<ISO>`; the route read a flat `calibration:<season>` that
// NOTHING EVER WRITES. The page would have sat at "nothing graded yet" forever,
// with the whole loop invisible. This test writes snapshots in the cron's exact
// shape and fails if the page can't see them.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'accw-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

// A snapshot in grade-cron's EXACT shape (runGrade -> ERA.stamp{graded_at, forecasts, decisions}).
const snap = (at, nGraded, brier, decisions) => ({
  graded_at: at,
  rules_era: 'era-1',
  forecasts: {
    n_forecasts: nGraded + 3, n_resolved: nGraded + 1, n_graded: nGraded,
    n_pending: 3, n_disqualified: 0,
    probability: { n: nGraded, brier,
      reliability: [{ predicted_mid: 0.75, n: nGraded, observed_rate: 0.7 }] },
    point: { n: 2, bias: -1.4, mae: 3.2 },
    categorical: { n: 1, accuracy: 1 },
    graded: Array.from({ length: nGraded }, (_, i) => ({
      key: 'k' + i, ftype: 'probability', forecast_at: at, week: 3,
      claim: 'p=0.7', outcome: i % 2 === 0, brier: brier, label: 'call ' + i,
    })),
  },
  decisions,
});

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  // The route keys off the CURRENT season, so derive it the same way it does.
  const H = require(path.join(ROOT, 'src', 'helpers'));
  const seasons = await store.get('seasons');
  const season = String(H.currentSeason(seasons).year);

  // Two grading runs, improving — exactly what the cron appends over a season.
  await store.set(`calibration:${season}:2026-09-08T12:00:00.000Z`,
    snap('2026-09-08T12:00:00.000Z', 4, 0.22, { n_decisions: 6, overridden: 3, scored: 0, cory_beat_model: 0 }));
  await store.set(`calibration:${season}:2026-09-15T12:00:00.000Z`,
    snap('2026-09-15T12:00:00.000Z', 9, 0.17, { n_decisions: 11, overridden: 5, scored: 4, cory_beat_model: 3 }));

  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const c = cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' }));
  const html = await (await fetch(b + '/lineup/accuracy', { headers: { Cookie: c } })).text();

  ck('the page reads the grader\'s append-only ledger (not a flat key nothing writes)',
    !/nothing graded yet|no grades yet/i.test(html) || /9/.test(html));
  ck('it shows the LATEST snapshot\'s graded count (9, not the earlier 4)', /\b9\b/.test(html));
  ck('calibration renders once grades exist', /Calibration/.test(html) && /0\.17|\.17/.test(html));

  // Calibration OVER TIME — the series across runs.
  ck('renders calibration over time across grading runs', /Calibration over time/i.test(html));
  ck('the series plots a point per run', (html.match(/class="acc-bar"/g) || []).length === 2,
    (html.match(/class="acc-bar"/g) || []).length);

  // THE OVERRIDE RECORD — already graded by the cron, previously rendered nowhere.
  ck('surfaces the override record', /Your overrides/i.test(html));
  ck('  counts decisions and overrides', /\b11\b/.test(html) && /\b5\b/.test(html));
  ck('  reports the scored win rate (3 of 4 = 75%)', /75%/.test(html));
  ck('  flags a small sample honestly rather than reading it as a verdict',
    /too few to read as a verdict/i.test(html));

  ck('no template error', !/ReferenceError|is not defined|Cannot read/.test(html));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
