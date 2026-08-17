'use strict';
// TERRITORY: B
//
// ── IN-SEASON DECISION ACCURACY WAS COMPUTED AND NEVER SHOWN ────────────────
//
// grade-cron's `decisions.inseason` block (forecast_grade.gradeDecisions())
// has answered "is the tool beating the modelled counterfactual on start/sit,
// waiver and streaming calls, and is the human beating the tool on overrides"
// since 2026-08-15, tie-safe by construction — a tie counts toward `scored`
// and neither win column. Nothing on the accuracy page ever read it; the
// draft-only "Graded decisions" card above it even said in words that
// "nothing else in the system measures" the same question.
//
// Drives the real route with a real cron-shaped snapshot, the same rig
// accuracy_wiring.test.js uses so the fixture shape stays honest.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'insdr-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '  — ' + JSON.stringify(d).slice(0, 300) : ''))); };

// One row per decision, the shape gradeDecisions().inseason.rows actually
// produces (forecast_grade.js:222 onward): kind, edge (null = not yet
// resolved), counterfactual_missing.
const row = (kind, edge) => ({ kind, edge, counterfactual_missing: false });
function fixtureRows() {
  const rows = [];
  // 12 lineup_call: 8 tool wins, 4 counterfactual wins, 2 exact ties.
  for (let i = 0; i < 8; i++) rows.push(row('lineup_call', 1.5));
  for (let i = 0; i < 4; i++) rows.push(row('lineup_call', -0.5));
  for (let i = 0; i < 2; i++) rows.push(row('lineup_call', 0));
  // 5 waiver_claim, all tool wins — below the 10-decided read threshold on
  // its own, but pooled into the SAME tool-side bucket as lineup_call.
  for (let i = 0; i < 5; i++) rows.push(row('waiver_claim', 2));
  // 3 stream_call not yet resolved.
  for (let i = 0; i < 3; i++) rows.push(row('stream_call', null));
  // 11 inseason_override: 9 human wins, 2 tool wins — its own bucket, never
  // pooled with the tool-side kinds above (chosen means the opposite thing).
  for (let i = 0; i < 9; i++) rows.push(row('inseason_override', 3));
  for (let i = 0; i < 2; i++) rows.push(row('inseason_override', -1));
  return rows;
}

const snap = (at, inseasonRows) => ({
  graded_at: at,
  rules_era: 'era-1',
  forecasts: { n_forecasts: 3, n_resolved: 3, n_graded: 3, n_pending: 0, n_disqualified: 0,
    probability: { n: 3, brier: 0.2, reliability: [] }, point: { n: 0 }, categorical: { n: 0 },
    graded: [] },
  decisions: { n_decisions: 0, overridden: 0, scored: 0, cory_beat_model: 0,
    inseason: { n: inseasonRows.length, rows: inseasonRows } },
});

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  const H = require(path.join(ROOT, 'src', 'helpers'));
  const seasons = await store.get('seasons');
  const season = String(H.currentSeason(seasons).year);

  await store.set(`calibration:${season}:2026-09-08T12:00:00.000Z`,
    snap('2026-09-08T12:00:00.000Z', fixtureRows()));

  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = cookieFrom(await fetch(base + '/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=cory&password=pw', redirect: 'manual' }));
  const html = await (await fetch(base + '/lineup/accuracy', { headers: { Cookie: cookie } })).text();

  ck('no template error', !/ReferenceError|is not defined|Cannot read/.test(html));
  ck('the in-season card renders', /In-season decisions/i.test(html));
  // 13 tool-side wins / 17 decided = 76%; 9 human wins / 11 decided = 82%
  // (hand-summed from the fixture, not re-derived from the code under test).
  ck('the tool-side rate is the hand-summed 76%, over the DECIDED subset '
    + '(17 = 12 lineup + 5 waiver, the 2 ties excluded from the denominator)',
    /\b76%/.test(html), html.match(/\b\d{1,3}%/g));
  ck('the override-side rate is the hand-summed 82%, in ITS OWN bucket — never '
    + 'pooled with the tool-side kinds (chosen means the opposite thing there)',
    /\b82%/.test(html));
  ck('the 3 unresolved stream_call rows are named as still waiting, not silently '
    + 'dropped from the logged count', /3 more await/i.test(html) || /\b34\b/.test(html));
  ck('by-kind breakdown lists the override bucket under its own label, not the '
    + 'raw ledger kind string', /Overrides</.test(html) && !/>inseason_override</.test(html));

  // ── RULE 10: a tie MUST NOT read as a loss ──────────────────────────────
  // All-ties fixture: 6 lineup_call rows, edge 0 throughout. If a tie were
  // silently counted as a loss (the exact defect this surface exists to
  // avoid), this would render some non-null rate below 50%. Correct behavior:
  // 0 decided, unreadable, no percentage printed for the tool side.
  const store2 = require(path.join(ROOT, 'src', 'store'));
  await store2.set(`calibration:${season}:2026-09-22T12:00:00.000Z`,
    snap('2026-09-22T12:00:00.000Z', Array.from({ length: 6 }, () => row('lineup_call', 0))));
  const html2 = await (await fetch(base + '/lineup/accuracy', { headers: { Cookie: cookie } })).text();
  const idBlock = (html2.match(/In-season decisions[\s\S]{0,900}/) || [''])[0];
  ck('RULE 10 — an all-tie run shows NO tool-side percentage rather than a '
    + 'false rate born of ties miscounted as losses',
    !/tool beat the alternative[\s\S]{0,40}\d+%/.test(idBlock), idBlock.slice(0, 400));
  ck('  and says the sample is too small to read, by name',
    /too few decided/i.test(idBlock));

  await server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log('FAILED'); process.exit(1); }
})();
