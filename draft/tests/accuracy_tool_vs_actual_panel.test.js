'use strict';
// TERRITORY: B — register 466 (A, 09-01/09-02): surface FG.toolVsActualSummary(
// ledger) on /lineup/accuracy beside capturedOverrides, and relabel the
// existing override rate as a LOWER BOUND on disagreement (it counts clicks
// only). forecast_grade.js (A's file, TERRITORY: A) already computes this
// every week with no button; nothing rendered it until now.
//
// Real app, real route, real predledger writes -- the exact rows
// buildInseasonResolutions() emits (register 466's own worked shape,
// draft/tests/tool_vs_actual_lineup.test.js), not a template-only fixture,
// since the whole point is what reaches the page through the real read path
// (member.js's /lineup/accuracy -> ACC.buildAccuracyView -> accuracy.ejs).
//
// Run: node draft/tests/accuracy_tool_vs_actual_panel.test.js
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tva-panel-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const PL = require(path.join(ROOT, 'src', 'predledger'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  const years = Object.values(await store.get('seasons'));
  const season = String((years.find(y => y.status !== 'complete') || years[years.length - 1]).year);

  // ── Seed the exact row shapes forecast_grade.buildInseasonResolutions()
  // emits (register 466), skipping the auto-derivation itself since that is
  // A's territory and already tested (tool_vs_actual_{lineup,waiver,stream}.test.js).
  // This test is about the READ side: does the page surface what's in the ledger.
  const row = (payload) => PL.append(store, { season, kind: 'forecast_resolution',
    method: 'inseason-resolution-vs-actual-v1', payload });

  // Lineup: two weeks, tool ahead one, behind the other -- exercises both signs
  // and the mean/SE arithmetic, not just a single point.
  await row({ forecast_key: 'lineup_auto|w1|7|vs_actual', week: 1,
    realized_chosen: 100, realized_counterfactual: 90, outcome: 10,
    disagreement: { n: 1, tool_only: ['a'], human_only: ['b'] } });
  await row({ forecast_key: 'lineup_auto|w2|7|vs_actual', week: 2,
    realized_chosen: 80, realized_counterfactual: 84, outcome: -4,
    disagreement: { n: 2, tool_only: ['c', 'd'], human_only: ['e', 'f'] } });

  // A single FOLLOWED lineup_call (no override) so `captured` (the "Your
  // overrides" card, whose rate this test is checking for the LOWER BOUND
  // relabel) is non-null -- it returns null with zero decisions logged.
  await PL.append(store, { season, kind: 'lineup_call', method: 'lineup-auto-v1',
    payload: { key: 'lineup_auto|w1|7', week: 1, counterfactual: [{ id: 'a' }] } });

  // Waiver: one week held (no add), the honest zero-counterfactual case.
  await row({ forecast_key: 'waiver_auto|w2|7|vs_actual', week: 2, decision_kind: 'waiver_claim',
    realized_chosen: 12, realized_counterfactual: 0, outcome: 12,
    human_add: null, human_adds_that_week: [], held: true,
    disagreement: { n: 1, tool_only: ['g'], human_only: [] } });

  // Stream: one week with the human's slot actually filled (not empty).
  await row({ forecast_key: 'stream_auto|w2|7|vs_actual', week: 2, decision_kind: 'stream_call',
    realized_chosen: 6, realized_counterfactual: 9, outcome: -3, position: 'K',
    human_started: 'h1', slot_empty: false,
    disagreement: { n: 1, tool_only: ['k1'], human_only: ['h1'] } });

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const html = await (await fetch(base + '/lineup/accuracy', { headers: { cookie } })).text();

  ck('the panel renders at all', /Tool vs\. what you actually did/.test(html));
  ck('lineup: 2 weeks paired', /2<\/span><span class="acc-ov-lbl">weeks paired/.test(html), (html.match(/weeks paired[\s\S]{0,10}/) || [])[0]);
  ck('lineup: mean tool-minus-human is +3.00 ((10 + -4) / 2), shown with the + sign',
    /\+3\.00<\/span><span class="acc-ov-lbl">tool . you, pts\/wk/.test(html), (html.match(/tool . you, pts\/wk[\s\S]{0,5}/) || (html.match(/wr-num pos">[^<]*/g) || []))[0]);
  ck('lineup: tool-you-tied reads 1-1-0 (one week each way, no ties)',
    /1–1–0<\/span><span class="acc-ov-lbl">tool–you–tied/.test(html), (html.match(/tool–you–tied[\s\S]{0,5}/) || [])[0]);
  ck('lineup: mean players disagreed is 1.5 ((1 + 2) / 2)',
    /1\.5<\/span><span class="acc-ov-lbl">players disagreed/.test(html));

  ck('waiver sub-panel renders with its own label', /<b>Waiver<\/b>/.test(html));
  ck('waiver: "1 of 1 week you held" note renders (register 466\'s weeks_human_held)',
    /1 of 1 week you held \(no add\)/.test(html));

  ck('stream sub-panel renders with its own label', /<b>Stream<\/b>/.test(html));
  ck('stream: "0 of 1 week" the slot sat empty (it was filled here)',
    /0 of 1 week the slot sat empty/.test(html));

  ck('THE RELABEL — the existing override rate is now explicitly framed as a LOWER BOUND',
    /is a LOWER BOUND on how often you actually went against the tool/.test(html));

  srv.close();
  console.log(`\n${pass}/${pass + fail} accuracy-tool-vs-actual-panel checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
