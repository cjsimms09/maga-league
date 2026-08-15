/* LEAGUE SETUP CONFIRMATION SCREEN, DRESS REHEARSAL — a real browser drives
 * config-screen.js, same convention as rehearsal-keepers.js right above it.
 *
 * Found 2026-08-15 alongside keeperui.js: also zero test coverage, also a
 * DOM-only IIFE. Lower stakes than guardFixture() (no fixture-board refusal
 * here — this screen has no equivalent guard at all, see below), but the
 * page's own copy states the actual risk plainly: "a single wrong scoring
 * value silently corrupts every projection in the tool." The ★ CRITICAL
 * highlighting exists specifically so Cory catches that before confirming —
 * a bug that broke the highlighting would defeat the page's whole purpose
 * while looking completely normal, exactly the failure class this project
 * keeps finding (dead flags, unwired banners, double-escaped forms). This
 * pins that it actually works, plus the override-wins-over-import behavior
 * the module's own header comment describes as the whole design.
 *
 * Run: node draft/tests/rehearsal-config-screen.js
 */
'use strict';
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgscreen-rehearsal-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const { chromium } = require('playwright');

const R = [];
const check = (name, cond, detail) => R.push({ name, ok: !!cond, detail });

const artifactPath = path.join(ROOT, 'public', 'draft_data.json');
const realArtifact = fs.readFileSync(artifactPath);
const BOARD = {
  built_at: '2026-08-14T09:15:36Z',
  league: {
    name: 'MFGA', season: '2026', teams: 10, my_draft_slot: 4, draft_type: 'snake',
    roster_slots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1, BN: 6 },
    scoring: { rec: 0.5, pass_td: 6, pass_yd: 0.04, rush_yd: 0.1, sack: 1, xpm: 1 },
    keeper_rules: { count: 3, cost_model: 'top_picks_flat', max_years: 3, undrafted_round: 10 },
  },
  players: [{ player_id: '1', name: 'X', position: 'RB', proj_mean: 100 }],
  notes: { profiles_from_drafts: 3 },
};

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

    // ── CASE 1: a real board renders the import correctly, including the
    // ★ CRITICAL scoring highlight the page exists to make visible. ───────
    fs.writeFileSync(artifactPath, JSON.stringify(BOARD));
    await page.goto(`${base}/admin/draft-config`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const imported = await page.evaluate(() => ({
      teams: document.getElementById('f-teams').value,
      slot: document.getElementById('f-slot').value,
      type: document.getElementById('f-type').value,
      kcount: document.getElementById('f-kcount').value,
      recValue: (() => {
        const row = [...document.querySelectorAll('#f-scoring tr')].find(r => r.textContent.includes('Reception'));
        return row ? row.querySelector('input').value : null;
      })(),
      recStarred: (() => {
        const row = [...document.querySelectorAll('#f-scoring tr')].find(r => r.textContent.includes('Reception'));
        return row ? row.textContent.trim().startsWith('★') : null;
      })(),
      passYdStarred: (() => {
        const row = [...document.querySelectorAll('#f-scoring tr')].find(r => /Passing yards/.test(r.textContent));
        return row ? row.textContent.trim().startsWith('★') : null;
      })(),
      xpmNotStarred: (() => {
        const row = [...document.querySelectorAll('#f-scoring tr')].find(r => /Extra point/.test(r.textContent) && !/missed/.test(r.textContent));
        return row ? !row.textContent.trim().startsWith('★') : null;
      })(),
      slotCount: document.querySelectorAll('#f-slots tr').length,
      formShown: window.getComputedStyle(document.getElementById('cfg-form')).display !== 'none',
    }));
    check('the imported league basics populate the form fields',
      imported.teams === '10' && imported.slot === '4' && imported.type === 'snake', imported);
    check('  and the keeper rules', imported.kcount === '3', imported);
    check('  and the scoring table, by value', imported.recValue === '0.5', imported);
    check('a CRITICAL scoring key (reception) is starred — the safety signal the page exists for',
      imported.recStarred === true, imported);
    check('  a second CRITICAL key (passing yards) is starred too, not a one-off match',
      imported.passYdStarred === true, imported);
    check('  a NON-critical key (extra point) is NOT starred — the highlight discriminates, it does not just decorate everything',
      imported.xpmNotStarred === true, imported);
    check('  the roster slots table renders one row per slot', imported.slotCount === 8, imported);
    check('the form is shown and the loading placeholder is gone', imported.formShown === true, imported);

    // ── CASE 2: a saved override WINS over the imported value — the design
    // this module's own header comment describes as the whole point
    // ("overrides win wherever they disagree"). ────────────────────────────
    const overrides = require(path.join(ROOT, 'src', 'store'));
    await overrides.set('draft-config-overrides', {
      confirmed: true, confirmed_by: 'cory', confirmed_at: '2026-08-10T00:00:00Z',
      teams: 12, scoring: { rec: 1.0 },
    });
    await page.goto(`${base}/admin/draft-config`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const overridden = await page.evaluate(() => ({
      teams: document.getElementById('f-teams').value,
      recValue: (() => {
        const row = [...document.querySelectorAll('#f-scoring tr')].find(r => r.textContent.includes('Reception'));
        return row ? row.querySelector('input').value : null;
      })(),
      confirmedBanner: document.body.innerText.includes('Confirmed by cory'),
    }));
    check('a saved override REPLACES the imported team count (12, not the board\'s 10)',
      overridden.teams === '12', overridden);
    check('  and an overridden scoring value wins too (1.0, not the board\'s 0.5)',
      overridden.recValue === '1', overridden);
    check('  the confirmed banner reflects who confirmed it', overridden.confirmedBanner === true, overridden);

    // ── CASE 3: no board built yet — a real, distinguishable message, not a
    // blank screen or a silent stall. ───────────────────────────────────────
    fs.writeFileSync(artifactPath, JSON.stringify({ __not_a_real_board: true }));
    fs.unlinkSync(artifactPath); // simulate "pipeline never ran" — 404 on the static file
    await page.goto(`${base}/admin/draft-config`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const missing = await page.evaluate(() => (document.getElementById('cfg-loading') || {}).innerText || '');
    check('with no board built at all, the page says so plainly rather than hanging blank',
      /Nothing to confirm yet/i.test(missing), missing.slice(0, 200));

    check('no page errors across the whole rehearsal', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    fs.writeFileSync(artifactPath, realArtifact);
    await b.close();
    srv.close();
  }

  console.log('\nLEAGUE SETUP CONFIRMATION SCREEN DRESS REHEARSAL');
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
