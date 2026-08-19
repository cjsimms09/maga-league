'use strict';
// Manual dress rehearsal, laptop viewport, against the seeded rehearsal server.
// Checks: banner, board load, the 4e caption, pick flow (reason prompt), the
// restore panel's weight diff, dispersionCaveat, and /analyzer.
const { launchChromium } = require('./rehearsal-browser');

const BASE = 'http://localhost:8925';
const results = [];
const ck = (n, c, d) => { results.push({ n, c, d }); console.log((c ? 'PASS ' : 'FAIL ') + n + (d !== undefined && !c ? ' -- ' + d : '')); };

(async () => {
  const browser = await launchChromium({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });

  await page.goto(BASE + '/login');
  await page.fill('input[name=username]', 'cory');
  await page.fill('input[name=password]', 'pw');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);

  await page.goto(BASE + '/admin/warroom', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  ck('war room loaded (no page errors on load)', pageErrors.length === 0, pageErrors.join(' | '));

  const recsHtml = await page.locator('#recs').innerHTML().catch(() => '');
  ck('#recs has content', recsHtml.length > 200, 'len=' + recsHtml.length);

  const orderNoteText = await page.locator('.rec-order-note').first().textContent().catch(() => null);
  ck('4e caption (.rec-order-note) is visible on the real rendered page',
    !!orderNoteText && /composite score/i.test(orderNoteText), orderNoteText);

  const recScoreText = await page.locator('.rec-score').first().textContent().catch(() => null);
  ck('.rec-score still shows a bare number next to the caption (nothing hidden/replaced)',
    !!recScoreText && /^\d/.test(recScoreText.trim()), recScoreText);

  await page.screenshot({ path: '/tmp/wr_recs.png', clip: { x: 0, y: 0, width: 1440, height: 900 } }).catch(() => {});

  // Restore panel — the weights diff (register 5g option 3)
  const restoreHtml = await page.locator('#baseline-restore').innerHTML().catch(() => '');
  ck('#baseline-restore panel renders', restoreHtml.length > 20, 'len=' + restoreHtml.length);
  ck('restore panel either names a diff or says weights match (5g option 3 is live)',
    /will change|matches your live weights/i.test(restoreHtml), restoreHtml.slice(0, 300));

  // "Why?" dossier / dispersionCaveat, via the native alert()
  const whyBtn = page.locator('[data-why]').first();
  const whyCount = await page.locator('[data-why]').count();
  ck('at least one "Why?" button is on the board', whyCount > 0, whyCount);
  if (whyCount > 0) {
    await whyBtn.click();
    await page.waitForTimeout(300);
  }
  const whyText = dialogs[dialogs.length - 1] || '';
  ck('the Why? dialog fired and carries a projection line', /Projection \d/.test(whyText), whyText.slice(0, 200));
  ck('dispersionCaveat text is present in the dialog (not silently empty)',
    /floor\/ceiling|band|dispersion|no per-player/i.test(whyText) || whyText.length > 400,
    whyText.slice(whyText.indexOf('Projection'), whyText.indexOf('Projection') + 300));

  // Pick flow — take the top recommendation, watch for a page error and for
  // the override-reason toast machinery not throwing. Scoped to #recs and to
  // a real player id: the clock's own "Take him" button shares the same
  // data-draft-me attribute but empty, and is hidden off the clock's own state.
  const takeBtn = page.locator('#recs [data-draft-me]').first();
  const takeCount = await page.locator('#recs [data-draft-me]').count();
  ck('at least one draftable "I took him" button is on the board', takeCount > 0, takeCount);
  if (takeCount > 0) {
    await takeBtn.click();
    await page.waitForTimeout(800);
  }
  ck('no page errors after making a pick', pageErrors.length === 0, pageErrors.join(' | '));

  // /analyzer
  await page.goto(BASE + '/analyzer', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(500);
  const analyzerStatus = await page.evaluate(() => document.title || document.body.innerText.slice(0, 80)).catch(() => null);
  ck('/analyzer responded with a real page (not blank/error)', !!analyzerStatus && analyzerStatus.length > 0, analyzerStatus);
  ck('no page errors on /analyzer', pageErrors.length === 0, pageErrors.join(' | '));

  await browser.close();

  const fails = results.filter(r => !r.c);
  console.log('\n' + (results.length - fails.length) + '/' + results.length + ' checks passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
