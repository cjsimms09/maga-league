'use strict';
// MODEL ACCURACY — the display half of the learning loop. Pure engine
// (buildAccuracyView reads A's graded output, never grades) + the commissioner-
// only HTTP surface, including the HONEST empty state before A has graded anything.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const ACC = require(path.join(ROOT, 'src', 'routes', 'accuracy'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : ''))); };

// ── pure engine ──────────────────────────────────────────────────────────────
(function () {
  // 1. degrade honestly before A runs: null calibration + raw count.
  const empty = ACC.buildAccuracyView(null, null, 7);
  ck('empty: not graded', empty.graded === false);
  ck('empty: pipeline count surfaced', empty.summary.rawCount === 7 && empty.summary.forecasts === 7);
  ck('empty: nothing graded/resolved', empty.summary.graded === 0 && empty.summary.resolved === 0);
  ck('empty: calibration/attribution null, no misses', empty.calibration === null && empty.attribution === null && empty.biggestMisses.length === 0);
  ck('empty: everRun false', empty.summary.everRun === false);

  // 2. a real calibration doc (forecast_grade.grade() shape) lights it up.
  const cal = {
    generated_at: '2026-10-01T12:00:00Z', week: 4,
    n_forecasts: 40, n_resolved: 22, n_graded: 20, n_pending: 18, n_disqualified: 2,
    probability: { n: 12, brier: 0.18, reliability: [
      { predicted_mid: 0.75, n: 8, observed_rate: 0.625 },
      { predicted_mid: 0.95, n: 4, observed_rate: 1.0 },
    ] },
    point: { n: 5, bias: 1.4, mae: 3.2 },
    categorical: { n: 3, accuracy: 0.667 },
    graded: [
      { key: 'survival:CMC@pick20', ftype: 'probability', claim: 'CMC survives to pick 20', value: 0.9, outcome: 0, brier: 0.81, forecast_at: '2026-09-30T10:00:00Z', week: 4, kind: 'survival' },
      { key: 'room_seat:r1p7', ftype: 'categorical', claim: 'seat 7 takes Nacua', value: 'Nacua', outcome: 'Gibbs', hit: false, forecast_at: '2026-09-29T10:00:00Z', week: 3 },
      { key: 'wh:wk4', ftype: 'point', claim: 'weekly high', value: 150, outcome: 141, error: 9, abs_error: 9, forecast_at: '2026-09-28T10:00:00Z', week: 4 },
      { key: 'survival:Bijan@pick8', ftype: 'probability', claim: 'Bijan survives to 8', value: 0.6, outcome: 1, brier: 0.16, forecast_at: '2026-09-27T10:00:00Z', week: 2 },
    ],
    by_kind: { survival: { n: 8, brier: 0.2 }, lineup_call: { n: 6, accuracy: 0.83 } },
    by_week: [{ week: 3, n_graded: 9, brier: 0.2 }, { week: 4, n_graded: 11, brier: 0.16 }],
  };
  const v = ACC.buildAccuracyView(cal, null, 40);
  ck('graded: flagged graded', v.graded === true);
  ck('graded: brier carried', v.calibration.probability.brier === 0.18);
  ck('graded: reliability rows mapped (mid/observed/n)',
    v.calibration.probability.reliability.length === 2 &&
    v.calibration.probability.reliability[0].mid === 0.75 &&
    v.calibration.probability.reliability[0].observed === 0.625);
  ck('graded: by-kind labelled', v.byKind.find(k => k.key === 'survival') && v.byKind.find(k => k.key === 'lineup_call').label === 'Start/sit calls');
  ck('graded: recently-graded sorted newest first', v.recently[0].claim === 'CMC survives to pick 20');
  ck('graded: recently-graded carries hit/right', v.recently.some(r => r.hit === false));

  // 3. biggest misses: the confident-and-wrong survival (Brier .81) ranks first.
  const misses = v.biggestMisses;
  ck('misses: worst is the .81-Brier survival call', misses.length > 0 && /CMC survives/.test(misses[0].line.claim), misses[0] && misses[0].line.claim);
  ck('misses: the correct .16 call is NOT ranked above the wrong one',
    misses.findIndex(m => /Bijan/.test(m.line.claim)) === -1 || misses.findIndex(m => /Bijan/.test(m.line.claim)) > 0);

  // 4. attribution: measured vs unmeasured split, unmeasured never gets a number.
  const attr = { generated_at: '2026-10-01T12:00:00Z', components: [
    { key: 'lineup', label: 'Start/sit', realized: 120, ci_low: 40, ci_high: 200, n: 15, measured: true },
    { key: 'waiver', label: 'Waivers', measured: false, note: 'no waiver engine in this window' },
  ] };
  const va = ACC.buildAccuracyView(cal, attr, 40);
  ck('attribution: measured/unmeasured counted', va.attribution.measuredN === 1 && va.attribution.unmeasuredN === 1);
  ck('attribution: unmeasured carries no realised number', va.attribution.components.find(c => c.key === 'waiver').realized === null);
})();

// ── HTTP surface (commissioner-only + honest empty state) ─────────────────────
(async function () {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'accuracy-'));
  const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
  const data = require(path.join(ROOT, 'src', 'data'));
  const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
  const { createApp } = require(path.join(ROOT, 'server-app'));

  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  const other = owners.find(o => o.username && o.username !== 'cory' && o.active);
  if (other) { other.password_hash = hashPassword('pw'); other.must_change_password = false; other.is_commissioner = false; }
  await store.set('owners', owners);

  const s = createApp().listen(0);
  await new Promise(r => s.once('listening', r));
  const b = `http://127.0.0.1:${s.address().port}`;
  const login = async u => {
    const r = await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' });
    return (r.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  };

  const cCk = await login('cory');
  const r1 = await fetch(b + '/lineup/accuracy', { headers: { Cookie: cCk } });
  const h1 = await r1.text();
  ck('http: commissioner gets 200', r1.status === 200, r1.status);
  ck('http: honest empty state before grading', /Grading hasn't run yet|Not yet graded/.test(h1));

  // non-commissioner is 403'd (model internals, not league property)
  if (other) {
    const oCk = await login(other.username);
    const r2 = await fetch(b + '/lineup/accuracy', { headers: { Cookie: oCk }, redirect: 'manual' });
    ck('http: non-commissioner is refused (403)', r2.status === 403, r2.status);
  }

  // with a calibration doc written (as A would), the page populates
  const season = String(new Date().getUTCFullYear());
  await store.set(`calibration:${season}`, {
    generated_at: '2026-10-01T12:00:00Z', week: 4, n_forecasts: 10, n_resolved: 6, n_graded: 6, n_pending: 4, n_disqualified: 0,
    probability: { n: 6, brier: 0.19, reliability: [{ predicted_mid: 0.75, n: 6, observed_rate: 0.67 }] },
    point: { n: 0 }, categorical: { n: 0 },
    graded: [{ key: 'survival:X@pick10', ftype: 'probability', claim: 'X survives to 10', value: 0.9, outcome: 0, brier: 0.81, forecast_at: '2026-09-30T10:00:00Z', week: 4 }],
  });
  const r3 = await fetch(b + '/lineup/accuracy', { headers: { Cookie: cCk } });
  const h3 = await r3.text();
  ck('http: populated page shows the reliability curve', /reliability curve|Calibration/.test(h3) && /happened/.test(h3));
  ck('http: populated page shows a graded miss', /X survives to 10/.test(h3));

  s.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
