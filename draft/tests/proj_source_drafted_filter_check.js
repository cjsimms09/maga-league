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

  // Mark the current top player as drafted by clicking the real "Gone"
  // button, the way a user would -- not the recordManualPick hook, which is
  // for OFF-BOARD names, not existing board players (my first pass called it
  // wrong and it silently no-op'd, per its own `if (!slot) return`).
  const draftedId = await page.evaluate(() => window.__warroom.state.board[0].player_id);
  await page.evaluate((id) => {
    const btn = document.querySelector(`[data-draft-other="${id}"]`);
    if (btn) { btn.scrollIntoView(); btn.click(); }
    else { console.error('BUTTON NOT FOUND for', id); }
  }, draftedId);
  await page.waitForTimeout(800);

  const check = async (label) => {
    const info = await page.evaluate((id) => {
      const st = window.__warroom.state;
      const stillOnBoard = (st.board || []).some(p => String(p.player_id) === String(id));
      return { boardLen: (st.board || []).length, stillOnBoard, projSource: st.projSource };
    }, draftedId);
    console.log(`${label}: boardLen=${info.boardLen} draftedPlayerStillOnBoard=${info.stillOnBoard} (should be false) source=${info.projSource}`);
    return info;
  };

  await check('blend, right after drafting');

  await page.evaluate(() => window.__setProjSource('ds'));
  await page.waitForTimeout(1500);
  await check('after toggling to Draft Sharks');

  await page.evaluate(() => window.__setProjSource('sleeper'));
  await page.waitForTimeout(1500);
  await check('after toggling to Sleeper');

  await page.evaluate(() => window.__setProjSource('blend'));
  await page.waitForTimeout(1000);
  await check('back to blend');

  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
