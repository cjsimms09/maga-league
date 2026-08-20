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

  const dump = async (label) => {
    const info = await page.evaluate(() => {
      const st = (window.__warroom && window.__warroom.state) || {};
      const clock = st.lastClock;
      const top = clock && clock.scored && clock.scored[0];
      const player = top && top.player;
      return {
        topScoredKeys: top ? Object.keys(top) : null,
        components: top && top.components,
        playerVonaLike: player ? Object.keys(player).filter(k => /vona|vor/i.test(k))
          .reduce((o, k) => (o[k] = player[k], o), {}) : null,
        topName: player && player.name,
        topScore: top && top.score,
      };
    });
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(info, null, 2));
  };

  await dump('BLEND');
  await page.evaluate(() => window.__setProjSource('ds'));
  await page.waitForTimeout(1500);
  await dump('DRAFT SHARKS');

  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
