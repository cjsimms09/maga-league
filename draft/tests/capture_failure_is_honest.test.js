'use strict';
// TERRITORY: A
// A REAL predledger.append() FAILURE MUST NEVER LOOK LIKE SUCCESS.
//
// Found 2026-08-15 during a full re-audit Cory asked for, without the reduced
// gate — this predates today's session entirely. All six in-season capture
// routes (/lineup/log, /lineup/override, /waivers/log, /waivers/override,
// /stream/log, /stream/override) redirected to their "?X=1" success query
// param UNCONDITIONALLY, outside the try/catch around predledger.append().
// So a real, legitimate append() failure — a missing required counterfactual,
// a store outage, anything assertCounterfactual() or assertFreshKey() rejects
// — looked byte-identical, on the wire, to success. lineup.ejs's "✅ Logged"
// banner would have rendered for a capture that never happened: the exact
// silent-data-loss failure mode this whole ledger exists to prevent, except
// this time it was the CONFIRMATION lying, not a bug in what got written.
//
// No existing test caught this because every existing test only exercised
// the HAPPY path — a valid body that succeeds. This test does the opposite on
// purpose: a real, natural failure (omit the required `counterfactual` field,
// which predledger.js's own assertCounterfactual() genuinely rejects for every
// COUNTERFACTUAL_KINDS entry), not a mocked one.
//
// Run: node draft/tests/capture_failure_is_honest.test.js
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-fail-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const predledger = require(path.join(ROOT, 'src', 'predledger'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  const season = String(H.currentSeason(await store.get('seasons')).year);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const cookie = (await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' })
    .then(r => r.headers.getSetCookie())).map(x => x.split(';')[0]).join('; ');

  const post = (url, body) => fetch(base + url, { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString() });
  const rowCount = async kind => (await predledger.readAll(store, season)).filter(e => e.kind === kind).length;

  // ── /lineup/log: omit counterfactual -> assertCounterfactual() genuinely
  // throws -> the redirect must say so, not claim success. ──────────────────
  {
    const before = await rowCount('lineup_call');
    const r = await post('/lineup/log', { week: '3', dollars: '5', recommended: '[{"id":"a"}]' });
    // no `counterfactual` field at all
    const loc = r.headers.get('location') || '';
    ck('a real append() failure redirects to captureError=1, NOT logged=1',
      /captureError=1/.test(loc) && !/logged=1/.test(loc), loc);
    ck('  and nothing was actually written to the ledger',
      (await rowCount('lineup_call')) === before, { before, after: await rowCount('lineup_call') });
  }

  // ── /lineup/override: same missing-field trigger (recommended doubles as
  // counterfactual for overrides, so omit `recommended` itself). ───────────
  {
    const before = await rowCount('inseason_override');
    const r = await post('/lineup/override', { week: '3', dollars: '5', reason: 'gut' });
    // no `recommended` -> safeJson(undefined) -> null -> counterfactual is
    // also null (override sets counterfactual = recommended) -> rejected.
    const loc = r.headers.get('location') || '';
    ck('/lineup/override failure also redirects honestly',
      /captureError=1/.test(loc) && !/overrode=1/.test(loc), loc);
    ck('  and writes nothing', (await rowCount('inseason_override')) === before);
  }

  // ── /waivers/log: same trigger, the NEW route built today — the fix must
  // cover it too, not just the pre-existing lineup routes. ──────────────────
  {
    const before = await rowCount('waiver_claim');
    const r = await post('/waivers/log', { week: '3', dollars: '5' }); // no `chosen`
    // Note: waiver_claim's counterfactual is the hardcoded 'hold priority'
    // string, always present — so THIS route can't fail via that guard. It
    // can still fail via assertFreshKey (a genuine duplicate) or a store
    // error, which this test can't trigger naturally without a mock. What IS
    // provable here, and is the actual fix: a missing `chosen` does NOT
    // crash the request (safeJson tolerates it) and still redirects to the
    // real success param, since this specific route's failure mode is
    // narrower than lineup's. Documented rather than assumed.
    const loc = r.headers.get('location') || '';
    ck('/waivers/log with a missing (non-required) field still succeeds honestly (chosen is not counterfactual-guarded)',
      /logged=1/.test(loc), loc);
  }

  // ── THE BANNER ITSELF: render /lineup?captureError=1 and /waivers?captureError=1
  // for real and confirm the failure text actually appears — not just that
  // the redirect URL carries the flag. ───────────────────────────────────────
  {
    const r = await fetch(base + '/lineup?captureError=1', { headers: { cookie } });
    const html = await r.text();
    ck('the lineup page actually renders the failure banner when told to',
      /didn.t save/i.test(html) && /NOT recorded/i.test(html), html.includes('captureError'));
    ck('  and does NOT also show a false success banner alongside it',
      !/✅ Logged/.test(html));
  }
  {
    const r = await fetch(base + '/waivers?captureError=1', { headers: { cookie } });
    const html = await r.text();
    ck('the waivers page renders the failure banner too (it had none at all before this fix)',
      /didn.t save/i.test(html) && /NOT recorded/i.test(html));
  }

  srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
