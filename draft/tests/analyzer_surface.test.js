'use strict';
// THE ANALYZER SURFACE (C3, 4th tool) — B's view over A's standings engine.
// Asserts: it renders A's projection (never a second one), states the measured
// caveat honestly, carries the raw sanity-check number alongside the modelled
// odds, exposes the postures the other tools consume, and is commissioner-only.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'azt-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const member = owners.find(o => o.username !== 'cory' && o.active);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  member.password_hash = hashPassword('pw'); member.must_change_password = false; member.is_commissioner = false;
  await store.set('owners', owners);
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' }));

  const cc = await login('cory');
  const res = await fetch(b + '/analyzer', { headers: { Cookie: cc } });
  const html = await res.text();
  ck('renders 200 for the commissioner', res.status === 200);
  ck('no template error', !/ReferenceError|is not defined|Cannot read/.test(html));

  // A row per team, with the playoff line drawn at the cut.
  const probs = [...html.matchAll(/az-prob">(\d+)%/g)].map(m => Number(m[1]));
  ck('renders a projection row per team', probs.length >= 8, probs.length);
  ck('draws the playoff line', /playoff line/i.test(html));

  // THE DEGENERATE-DEFAULT GUARD. Defaulting to the final week leaves the
  // simulator nothing to simulate: every probability collapses to 100/0 and the
  // table looks confident while saying nothing. Found by driving the page.
  ck('the default week is NOT degenerate (probabilities are not all 0/100)',
    !probs.every(p => p === 0 || p === 100), probs.join(','));

  // The honest caveat, stated ON the page (A's validation: ~78% vs ~75% naive).
  ck('states the measured edge vs the naive baseline', /\d+%[\s\S]{0,80}?\d+%/.test(html) && /reading the current standings/i.test(html));
  ck('warns not to read the top four as sharp', /don.t read the top four as sharp/i.test(html));
  ck('says the value is the calibrated probabilities', /calibrated probabilit/i.test(html));

  // C3: the raw, unmodelled number alongside the modelled odds, labelled honestly.
  ck('carries the raw sanity-check number, labelled not-our-valuation',
    /realized weekly average/i.test(html) && /not our valuation/i.test(html));

  // The postures the other tools consume.
  const postures = [...html.matchAll(/az-posture (\w+)"/g)].map(m => m[1]);
  ck('exposes the posture vocabulary', ['lock', 'contender', 'desperate', 'chasing_high'].every(p => postures.includes(p)),
    [...new Set(postures)].join(','));
  ck('explains what each posture means in plain words', /will overpay to swing it/i.test(html) && /only live money/i.test(html));

  // ACCESS RULE: in-season recommendation surfaces are commissioner-only.
  const mc = await login(member.username);
  const mres = await fetch(b + '/analyzer', { headers: { Cookie: mc }, redirect: 'manual' });
  ck('a plain member cannot reach it (tools are commissioner-only)', mres.status === 403 || mres.status === 302);

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
