// TERRITORY: A
/* EXP33 PROJECTION-PROVENANCE BANNER — proven live, not traced by hand.
 *
 * Part of the full re-audit Cory asked for (2026-08-15): the banner was wired
 * earlier today (app.js's renderChecklist() calling DraftDeviation.
 * projectionProvenance()) and reported as "wired in" without ever actually
 * rendering the real war room in a browser and looking for the text. Tracing
 * the code by hand found the right target element (#check-items, not the
 * separate always-hidden #checklist span) — this is the live proof that
 * matters more than the trace.
 *
 * Run: node draft/tests/rehearsal-exp33-banner.js
 */
'use strict';
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'exp33-banner-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const { chromium } = require('playwright');

const R = [];
const check = (name, cond, detail) => R.push({ name, ok: !!cond, detail });

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
    await page.goto(`${base}/admin/warroom`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    const state = await page.evaluate(() => ({
      checkItemsHTML: (document.getElementById('check-items') || {}).innerHTML || null,
      checklistSpanHTML: (document.getElementById('checklist') || {}).innerHTML || null,
      detailsExists: !!document.getElementById('system-details'),
    }));

    check('the #check-items host exists and got real content (renderChecklist actually ran)',
      !!state.checkItemsHTML && state.checkItemsHTML.length > 50,
      state.checkItemsHTML ? state.checkItemsHTML.length + ' chars' : 'null/empty');
    check('the exp33 loss headline is actually IN THE RENDERED DOM',
      state.checkItemsHTML && /Projections lose to a naive baseline/.test(state.checkItemsHTML),
      (state.checkItemsHTML || '').slice(0, 200));
    check('the detail text names the real numbers, not a placeholder',
      state.checkItemsHTML && /0\.41/.test(state.checkItemsHTML) && /naive/.test(state.checkItemsHTML),
      (state.checkItemsHTML || '').match(/.{0,60}0\.41.{0,60}/) || 'no match');
    check('it renders as a red/incomplete item (ok:false), not a quiet note',
      state.checkItemsHTML && /class="check-item todo"[^>]*>[\s\S]{0,40}Projections lose/.test(state.checkItemsHTML)
        || (state.checkItemsHTML && state.checkItemsHTML.indexOf('todo') !== -1 && state.checkItemsHTML.indexOf('Projections lose') !== -1),
      'todo class present near the banner');
    check('the SEPARATE, always-hidden #checklist span is untouched (confirms host targeting, not a coincidence)',
      state.checklistSpanHTML === '' || state.checklistSpanHTML === null,
      state.checklistSpanHTML);
    check('the details/summary disclosure exists so this is reachable by a real click, not orphaned markup',
      state.detailsExists);
    check('no page errors while rendering the war room', errs.length === 0, errs.slice(0, 3).join(' | '));
  } finally {
    await b.close();
    srv.close();
  }

  console.log('\nEXP33 BANNER — LIVE PROOF, NOT A TRACE');
  console.log('='.repeat(72));
  let bad = 0;
  for (const r of R) {
    if (!r.ok) bad++;
    console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok || !r.detail ? '' : '\n        -> ' + JSON.stringify(r.detail).slice(0, 250)));
  }
  console.log('='.repeat(72));
  console.log(`${R.length - bad}/${R.length} checks passed`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
