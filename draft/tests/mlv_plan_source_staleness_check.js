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

  const readPanels = async (label) => {
    const info = await page.evaluate(() => {
      const st = (window.__warroom && window.__warroom.state) || {};
      const rb = document.getElementById('roster-builder');
      const mp = document.getElementById('mlv-plan');
      return {
        projSource: st.projSource,
        rosterBuilderFirstLine: rb ? rb.querySelector('li') && rb.querySelector('li').textContent.trim() : null,
        mlvPlanFirstRow: mp ? (mp.querySelector('tbody tr') || mp.querySelector('tr')) &&
          (mp.querySelector('tbody tr') || mp.querySelector('tr')).textContent.trim() : null,
        mlvPlanStateRef: !!st.mlvPlan,
      };
    });
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(info, null, 2));
    return info;
  };

  const before = await readPanels('BLEND');
  await page.evaluate(() => window.__setProjSource('ds'));
  await page.waitForTimeout(1500);
  const after = await readPanels('DRAFT SHARKS');

  console.log('\n=== COMPARISON ===');
  console.log('roster-builder panel changed:', before.rosterBuilderFirstLine !== after.rosterBuilderFirstLine);
  console.log('mlv-plan panel changed:', before.mlvPlanFirstRow !== after.mlvPlanFirstRow,
    before.mlvPlanFirstRow === after.mlvPlanFirstRow ? '<<< STALE if identical' : '');

  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
