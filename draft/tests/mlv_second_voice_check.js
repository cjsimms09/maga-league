/* E's ad-hoc check for Cory's job (3): "does MLV as a second voice ever
 * contradict the composite recommendation in a way that would confuse Cory
 * at 8 seconds a pick? Name the screens."
 *
 * Not a permanent suite -- a one-off browser drive against the rehearsal
 * server (draft/tests/rehearsal-serve.js), reusing its login pattern.
 *
 * Run:
 *   node draft/tests/rehearsal-serve.js &
 *   WR_USER=cory WR_PASS=pw node draft/tests/mlv_second_voice_check.js
 */
const { launchChromium } = require('./rehearsal-browser');
const BASE = process.env.WR_BASE || 'http://localhost:8925';

(async () => {
  const b = await launchChromium();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=username]', process.env.WR_USER || 'cory');
  await page.fill('input[name=password]', process.env.WR_PASS || 'pw');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  await page.goto(`${BASE}/admin/warroom`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  const info = await page.evaluate(() => {
    const host = document.getElementById('roster-builder');
    const items = host ? Array.from(host.querySelectorAll('ol > li')).map(li => li.textContent.trim()) : [];
    const verdictP = host ? host.querySelector('p.muted') : null;
    const verdict = verdictP ? verdictP.textContent.trim() : null;

    const recsEl = document.getElementById('recs');
    const recsText = recsEl ? recsEl.textContent.trim().slice(0, 400) : null;
    const recsHtml = recsEl ? recsEl.innerHTML.slice(0, 1200) : null;

    const clockEl = document.querySelector('[data-clock], .clock, #clock');
    const pickInfo = document.body.textContent.match(/[Pp]ick\s*#?\s*\d+/);

    const myRoster = (window.state && window.state.myRoster) || [];
    const rosterSummary = myRoster.map(p => p.position);

    return {
      mlvTop3: items,
      verdict,
      recsText,
      recsHtml,
      pickMatch: pickInfo ? pickInfo[0] : null,
      rosterSummary,
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
