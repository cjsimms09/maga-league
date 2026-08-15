/* WAR-ROOM SCREENSHOT HARNESS — the visual acceptance gate's camera.
 *
 * Cory's own acceptance order (docs/queued/warroom-v2-visual-design.md):
 * visual review PRECEDES mechanical verification. This produces the full-page
 * captures that review runs on — phone (390×844, draft night) and desktop
 * (1440px, the second screen) — into draft/audit/screens/.
 *
 * Not in the default suite: needs a dev server + the pre-installed Chromium.
 *
 * Run:
 *   PORT=8931 node dev-server.js &
 *   WR_BASE=http://localhost:8931 SHOT_TAG=before node draft/tests/shots-warroom.js
 */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.WR_BASE || 'http://localhost:8931';
const TAG = process.env.SHOT_TAG || 'shot';
const OUT = path.join(__dirname, '..', 'audit', 'screens');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errs = [];
  async function capture(viewport, label) {
    const ctx = await b.newContext({ viewport });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(label + ': ' + e.message));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      if (/Failed to load resource/.test(m.text())) return; // net noise, classified elsewhere
      // Dev store has no ledger endpoint: predledger PARKS records for replay and
      // says so via console.error. That is designed offline behavior, not a page
      // fault — classified by its exact prefix, so anything else still fails.
      if (/^\[predledger\] \d+ record\(s\) UNSENT and parked for replay/.test(m.text())) return;
      errs.push(label + ' console: ' + m.text());
    });
    // Login (dev seed: cory / imabitch, forced password change on first login).
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name=username]', process.env.WR_USER || 'cory');
    await page.fill('input[name=password]', process.env.WR_PASS || 'imabitch');
    await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
    if (page.url().indexOf('/password') >= 0) {
      // Forced first-login change has no #current field.
      if (await page.$('#current')) await page.fill('#current', process.env.WR_PASS || 'imabitch');
      await page.fill('#next', 'imabitch');
      await page.fill('#confirm', 'imabitch');
      await Promise.all([page.waitForNavigation(),
        page.click('form[action="/password"] button[type=submit]')]);
    }
    await page.goto(BASE + '/admin/warroom', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const file = path.join(OUT, TAG + '-' + label + '.png');
    await page.screenshot({ path: file, fullPage: true });
    console.log('saved', file);
    // Open the depth layers for a second capture so the dense zones are reviewable.
    await page.evaluate(() => {
      const l2 = document.getElementById('layer-2'); if (l2) l2.open = true;
      const l3 = document.getElementById('layer-3'); if (l3) l3.open = true;
    });
    await page.waitForTimeout(800);
    const file2 = path.join(OUT, TAG + '-' + label + '-depth.png');
    await page.screenshot({ path: file2, fullPage: true });
    console.log('saved', file2);
    await ctx.close();
  }
  await capture({ width: 390, height: 844 }, 'phone');
  await capture({ width: 1440, height: 950 }, 'desktop');
  await b.close();
  if (errs.length) { console.log('CONSOLE/PAGE ERRORS:'); errs.forEach(e => console.log('  ' + e)); process.exit(1); }
  console.log('zero console errors');
})().catch(e => { console.error(e); process.exit(1); });
