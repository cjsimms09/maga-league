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

  // Apply a manual downgrade override directly to state (same effect a UI
  // action would have) on the current top player, then check it survives
  // a source round trip.
  const targetId = await page.evaluate(() => {
    const st = window.__warroom.state;
    const id = String(st.board[0].player_id);
    st.playerOverrides = st.playerOverrides || {};
    st.playerOverrides[id] = { kind: 'downgrade', pct: 20 };
    // applyOverrides is only called from inside applySourceBoard/renderAll;
    // trigger a render to apply it now, the way the real UI does after a
    // slider change.
    if (typeof window.__warroom.buildSheet === 'function') { /* noop, just checking export surface */ }
    return id;
  });

  // Force a re-render by toggling to the SAME source (blend), which is the
  // cheapest real trigger of applyOverrides without a dedicated hook.
  await page.evaluate(() => window.__setProjSource('blend'));
  await page.waitForTimeout(1000);

  const readOverride = async (label) => {
    const info = await page.evaluate((id) => {
      const st = window.__warroom.state;
      const p = (st.board || []).find(x => String(x.player_id) === id);
      return {
        hasOverride: !!(st.playerOverrides && st.playerOverrides[id]),
        overrideOnPlayerObj: p ? !!p.override : null,
        proj_mean: p ? p.proj_mean : null,
      };
    }, targetId);
    console.log(`${label}:`, JSON.stringify(info));
    return info;
  };

  await readOverride('blend, override just applied');
  await page.evaluate(() => window.__setProjSource('ds'));
  await page.waitForTimeout(1500);
  await readOverride('after toggling to Draft Sharks');
  await page.evaluate(() => window.__setProjSource('blend'));
  await page.waitForTimeout(1000);
  await readOverride('back to blend');

  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
