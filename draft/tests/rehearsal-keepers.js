// TERRITORY: A
/* KEEPER SLATE DRESS REHEARSAL — a real browser drives guardFixture().
 *
 * Found 2026-08-15 (see PARKED.md's "config-screen.js / keeperui.js HAVE ZERO
 * TEST COVERAGE" entry): keeperui.js is a DOM-only IIFE with no module.exports,
 * so it can't be required and unit-tested the way every other module in this
 * project is. Closing that gap looked like it needed jsdom — new test
 * infrastructure, flagged as not worth adding under a draft-week clock without
 * checking first.
 *
 * IT DIDN'T NEED NEW INFRASTRUCTURE. draft/tests/rehearsal-mock3.js already
 * proves this exact pattern (Playwright + the pre-installed Chromium) is an
 * established, working part of this project — just not part of the default
 * `.test.js` glob, because it needs a real browser rather than being a pure
 * unit test. This file follows that SAME convention for the one function on
 * this screen most worth pinning: guardFixture(), which refuses to open the
 * keeper editor against synthetic/offline data so nobody edits keepers for
 * players who don't exist. keeperui.js's own comment says an hour of this
 * project's time went into diagnosing that failure mode once already — this
 * is the regression test that failure mode never got.
 *
 * UNLIKE rehearsal-mock3.js, this one is SELF-CONTAINED (boots its own
 * in-process server via createApp().listen(0), same as every draft/tests/
 * *.test.js file) rather than assuming an already-running dev-server.js — so
 * it can be run and verified the same way any other test here is, with
 * nothing to start by hand first.
 *
 * Run: node draft/tests/rehearsal-keepers.js
 */
'use strict';
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'keeper-rehearsal-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const { chromium } = require('playwright');

const R = [];
const check = (name, cond, detail) => R.push({ name, ok: !!cond, detail });

const artifactPath = path.join(ROOT, 'public', 'draft_data.json');
const realArtifact = fs.readFileSync(artifactPath);
const mkArt = adpSource => ({
  built_at: new Date().toISOString(),
  provenance: { adp: { adp_source: adpSource } },
  league: { teams: 10, my_draft_slot: 1, keeper_rules: { count: 3 } },
  pick_order: { picks: [], forfeited: [] },
  players: [{ player_id: '1', name: 'Real Guy', position: 'RB', proj_mean: 200, vorp: 80 }],
});

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;

  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  try {
    const ctx = await b.newContext();
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));

    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name=username]', 'cory');
    await page.fill('input[name=password]', 'pw');
    await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);

    // ── CASE 1: a FIXTURE board must be REFUSED, loudly, before anything
    // else renders — the exact failure mode keeperui.js's own comment
    // describes an hour being spent diagnosing, once, without a test to
    // catch it a second time. ─────────────────────────────────────────────
    fs.writeFileSync(artifactPath, JSON.stringify(mkArt('fixture')));
    await page.goto(`${base}/admin/keepers`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const fixtureState = await page.evaluate(() => ({
      loadingText: (document.getElementById('loading') || {}).innerText || '',
      keeperScreenShown: (() => {
        const e = document.getElementById('keeper-screen');
        return e ? window.getComputedStyle(e).display !== 'none' : null;
      })(),
    }));
    check('a fixture board (adp_source:"fixture") is refused, not silently rendered',
      /not real data/i.test(fixtureState.loadingText), fixtureState.loadingText.slice(0, 200));
    check('  it names the actual adp_source value, not a vague warning',
      /fixture/i.test(fixtureState.loadingText), fixtureState.loadingText.slice(0, 200));
    check('  and the editable keeper screen never opens on it',
      fixtureState.keeperScreenShown === false, fixtureState);

    // ── CASE 2: a board with NO adp_source at all is treated the same way
    // (guardFixture's condition is `src === 'fixture' || src == null` — the
    // null branch is a distinct code path and needs its own proof). ───────
    fs.writeFileSync(artifactPath, JSON.stringify(mkArt(undefined)));
    await page.goto(`${base}/admin/keepers`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const nullState = await page.evaluate(() => ({
      loadingText: (document.getElementById('loading') || {}).innerText || '',
      keeperScreenShown: (() => {
        const e = document.getElementById('keeper-screen');
        return e ? window.getComputedStyle(e).display !== 'none' : null;
      })(),
    }));
    check('a board with NO adp_source at all is ALSO refused (the null branch, not just the string branch)',
      /not real data/i.test(nullState.loadingText) && nullState.keeperScreenShown === false,
      nullState);

    // ── CASE 3: a REAL board (the common case) must open normally — a
    // guard that refuses everything is as broken as one that refuses
    // nothing, so the positive case is proof, not an afterthought. ────────
    fs.writeFileSync(artifactPath, JSON.stringify(mkArt('fantasypros')));
    await page.goto(`${base}/admin/keepers`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const realState = await page.evaluate(() => ({
      loadingShown: (() => {
        const e = document.getElementById('loading');
        return e ? window.getComputedStyle(e).display !== 'none' : null;
      })(),
      keeperScreenShown: (() => {
        const e = document.getElementById('keeper-screen');
        return e ? window.getComputedStyle(e).display !== 'none' : null;
      })(),
      hasRealPlayerName: document.body.innerText.includes('Real Guy')
        || !!document.querySelector('#ks-picks, #teams'),
    }));
    check('a real board (adp_source:"fantasypros") opens the editable slate',
      realState.keeperScreenShown === true && realState.loadingShown === false, realState);

    check('no page errors across the whole rehearsal', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    fs.writeFileSync(artifactPath, realArtifact);
    await b.close();
    srv.close();
  }

  console.log('\nKEEPER SLATE DRESS REHEARSAL (guardFixture)');
  console.log('='.repeat(72));
  let bad = 0;
  for (const r of R) {
    if (!r.ok) bad++;
    console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok || !r.detail ? '' : '\n        -> ' + JSON.stringify(r.detail).slice(0, 250)));
  }
  console.log('='.repeat(72));
  console.log(`${R.length - bad}/${R.length} rehearsal checks passed`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); try { fs.writeFileSync(artifactPath, realArtifact); } catch (e2) {} process.exit(1); });
