// TERRITORY: A
/* CONDITIONAL-VALUE WIRING — the acceptance camera (Cory's ruling 2026-08-17).
 *
 * Captures the wired surfaces at desktop 1440×950 into draft/audit/screens/:
 *   stack-wired-cockpit.png        DRAFT tab, shortlist + best-avail QB detail
 *                                  (the premium chips beside board value)
 *   stack-wired-drill-burrow.png   drill-down: the full stack readout
 *   stack-wired-drill-handcuff.png drill-down: the handcuff readout (Hill)
 *   stack-wired-drill-johnson.png  drill-down: Walker's cuff with the
 *                                  market-vs-depth-chart flag
 *
 * Same login + console-error discipline as shots-warroom.js. Not in the
 * default suite: needs a dev server + the pre-installed Chromium.
 *
 * Run:
 *   rm -rf data && PORT=8944 node dev-server.js &
 *   WR_BASE=http://localhost:8944 node draft/tests/shots-conditional-value.js
 */
'use strict';
const { launchChromium } = require('./rehearsal-browser');
const path = require('path');
const fs = require('fs');

const BASE = process.env.WR_BASE || 'http://localhost:8944';
const OUT = path.join(__dirname, '..', 'audit', 'screens');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await launchChromium();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push('page: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text())) return;
    if (/^\[predledger\] \d+ record\(s\) UNSENT and parked for replay/.test(m.text())) return;
    errs.push('console: ' + m.text());
  });

  // login (dev seed, same as shots-warroom.js)
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=username]', process.env.WR_USER || 'cory');
  await page.fill('input[name=password]', process.env.WR_PASS || 'imabitch');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  if (page.url().indexOf('/password') >= 0) {
    if (await page.$('#current')) await page.fill('#current', process.env.WR_PASS || 'imabitch');
    await page.fill('#next', 'imabitch');
    await page.fill('#confirm', 'imabitch');
    await Promise.all([page.waitForNavigation(),
      page.click('form[action="/password"] button[type=submit]')]);
  }

  await page.goto(BASE + '/admin/warroom', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // PROOF THE ARTIFACT LOADED — a screenshot of the degraded state would
  // "pass" visually while showing nothing; refuse instead.
  const loaded = await page.evaluate(() =>
    !!(window.CondValue && document.querySelectorAll('.cv-chip').length >= 0));
  if (!loaded) { console.error('CondValue module absent — nothing to photograph'); process.exit(1); }

  // 1. the cockpit with the chips in view: pick QB in the best-available
  // detail so Burrow's chip renders even when he is outside the top-10 list.
  await page.selectOption('#pos-recs', 'QB');
  await page.waitForTimeout(600);
  const chips = await page.evaluate(() => document.querySelectorAll('.cv-chip').length);
  if (!chips) { console.error('no .cv-chip rendered — the wiring did not paint'); process.exit(1); }
  // the chip IN view, at the ruled viewport — scroll the first one to center
  // and shoot the 1440×950 window, not the full page (a chip below the fold
  // would make this capture a picture of nothing).
  await page.evaluate(() => document.querySelector('.cv-chip')
    .scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'stack-wired-cockpit.png'), fullPage: false });
  console.log('saved stack-wired-cockpit.png (' + chips + ' chips on the page)');
  // and the best-available-by-position detail (Burrow's chip beside his score)
  await page.evaluate(() => document.querySelector('#pos-recs-out .cv-chip')
    .scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'stack-wired-posrecs.png'), fullPage: false });
  console.log('saved stack-wired-posrecs.png');

  // 2–4. the drill-downs, through the cockpit's own openDrill path.
  async function drill(pid, label, mustContain) {
    await page.evaluate(id => window.WarRoomCockpit.openDrill(id), pid);
    await page.waitForTimeout(400);
    const ok = await page.evaluate(sel =>
      !!document.querySelector('#wr-drill .cv-drill'), mustContain);
    if (!ok) { console.error(label + ': drill rendered WITHOUT the conditional readout'); process.exit(1); }
    const txt = await page.evaluate(() => document.querySelector('#wr-drill').textContent);
    if (mustContain && txt.indexOf(mustContain) < 0) {
      console.error(label + ': drill readout missing "' + mustContain + '"'); process.exit(1);
    }
    await page.screenshot({ path: path.join(OUT, label + '.png'), fullPage: false });
    console.log('saved ' + label + '.png');
    await page.evaluate(() => window.WarRoomCockpit.closeDrill());
  }
  await drill('6770', 'stack-wired-drill-burrow', 'r=0.52');
  await drill('5995', 'stack-wired-drill-handcuff', 'round 15 or wire');
  await drill('13337', 'stack-wired-drill-johnson', 'follows the ROLE');

  await ctx.close();
  await b.close();
  if (errs.length) { console.log('CONSOLE/PAGE ERRORS:'); errs.forEach(e => console.log('  ' + e)); process.exit(1); }
  console.log('zero console errors');
})().catch(e => { console.error(e); process.exit(1); });
