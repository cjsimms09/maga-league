const { launchChromium } = require('./rehearsal-browser');
const BASE = process.env.WR_BASE || 'http://localhost:8925';
const IDS = process.argv.slice(2);

(async () => {
  const b = await launchChromium();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=username]', 'cory');
  await page.fill('input[name=password]', 'pw');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  await page.goto(`${BASE}/admin/warroom`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  for (const id of IDS) {
    const text = await page.evaluate((id) => {
      const el = document.getElementById(id);
      return el ? el.innerText : 'NOT FOUND';
    }, id);
    console.log(`\n===== ${id} =====`);
    console.log((text || '').slice(0, 1500));
  }
  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
