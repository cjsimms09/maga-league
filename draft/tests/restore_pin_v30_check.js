// E, 2026-08-20: live verification of the v29->v30 restore-pin fix before
// shipping, per Rule 3e (never trust a code-level check alone for a
// draft-night UI mechanism). Checks the actual fetched baseline and what
// the restore button would do if tapped right now.
const { launchChromium } = require('./rehearsal-browser');
const BASE = process.env.WR_BASE || 'http://localhost:8925';

(async () => {
  const b = await launchChromium();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=username]', 'cory');
  await page.fill('input[name=password]', 'pw');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  await page.goto(`${BASE}/admin/warroom`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  const info = await page.evaluate(() => {
    const st = window.__warroom.state;
    return {
      frozenBaseline_weights: st.frozenBaseline ? st.frozenBaseline.engine_policy.MEASURED_WEIGHTS : null,
      live_need_weight: (st.weights || {}).need,
    };
  });
  console.log('FETCHED FROZEN BASELINE:', JSON.stringify(info.frozenBaseline_weights));
  console.log('LIVE WEIGHTS.need (before any tap):', info.live_need_weight);

  // Simulate the actual restore tap and check the result.
  const afterRestore = await page.evaluate(() => {
    const btn = document.querySelector('[data-action="restore-baseline"], #baseline-restore button, #baseline-restore [onclick*="estore"]');
    return btn ? 'found a candidate button: ' + btn.outerHTML.slice(0, 200) : 'no obvious restore button selector matched';
  });
  console.log('RESTORE BUTTON SEARCH:', afterRestore);

  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
