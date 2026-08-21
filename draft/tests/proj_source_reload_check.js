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

  // Toggle to Draft Sharks, confirm it's really active.
  await page.evaluate(() => window.__setProjSource('ds'));
  await page.waitForTimeout(1500);
  const beforeReload = await page.evaluate(() => {
    const st = (window.__warroom && window.__warroom.state) || {};
    return {
      projSource: st.projSource,
      boardLen: (st.board || []).length,
      firstRankVorp: st.board && st.board[0] && st.board[0].vorp,
      localStorage: localStorage.getItem('wr_proj_source'),
    };
  });
  console.log('=== BEFORE RELOAD (just toggled to DS) ===');
  console.log(JSON.stringify(beforeReload, null, 2));

  // Now reload the page -- simulates a fresh page load with localStorage
  // already carrying 'ds' from the prior session.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  const afterReload = await page.evaluate(() => {
    const st = (window.__warroom && window.__warroom.state) || {};
    const buttons = Array.from(document.querySelectorAll('#proj-source button'))
      .map(b => ({ text: b.textContent.trim(), bold: b.style.fontWeight === '700' }));
    return {
      projSource: st.projSource,
      boardLen: (st.board || []).length,
      firstRankVorp: st.board && st.board[0] && st.board[0].vorp,
      localStorage: localStorage.getItem('wr_proj_source'),
      buttons,
    };
  });
  console.log('\n=== AFTER RELOAD (fresh page, localStorage says ds) ===');
  console.log(JSON.stringify(afterReload, null, 2));

  console.log('\n=== VERDICT ===');
  console.log('board length after reload:', afterReload.boardLen,
    '(683 = still on blend/all players, 247 = actually loaded DS)');
  console.log('button highlighted as bold (active):',
    afterReload.buttons.filter(b => b.bold).map(b => b.text));

  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
