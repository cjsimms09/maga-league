// E, 2026-08-20: checking a NEW suspected collision found by static reading
// after merging origin/main: public/js/draft/app.js:19-33 (position-boards'
// own loadProjSource()/setProjSource(), key 'mfga.draft.projsource') and
// app.js:5090-5222 (the main war-room source-rerank toggle, key
// 'wr_proj_source') both read/write the SAME `state.projSource` field.
// position-boards' loadProjSource() runs first in init() and defaults to
// 'ds' when nothing is saved -- on paper this means the main toggle panel
// would render Draft Sharks as bold/active on a first-ever page load, while
// state.board (set later, from draft_data.json in bootFrom) stays the blend.
// Verifying live before filing, per Rule 3e -- this must NOT be assumed from
// source reading alone.
const { launchChromium } = require('./rehearsal-browser');
const BASE = process.env.WR_BASE || 'http://localhost:8925';

(async () => {
  const b = await launchChromium();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();

  // Clear any localStorage first so this is a genuine first-ever visit.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.fill('input[name=username]', process.env.WR_USER || 'cory');
  await page.fill('input[name=password]', process.env.WR_PASS || 'pw');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  await page.goto(`${BASE}/admin/warroom`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  const info = await page.evaluate(() => {
    const st = window.__warroom.state;
    const top = (st.board || [])[0];
    return {
      localStorage_mfga: localStorage.getItem('mfga.draft.projsource'),
      localStorage_wr: localStorage.getItem('wr_proj_source'),
      state_projSource: st.projSource,
      board_len: (st.board || []).length,
      top_player_vorp: top ? top.vorp : null,
      top_player_proj_ds: top ? top.proj_ds : null,
      top_player_proj_mean: top ? top.proj_mean : null,
    };
  });
  console.log('FIRST-EVER-VISIT STATE:', JSON.stringify(info, null, 2));

  // Now render the main toggle panel HTML and check which button is bold/active.
  const panelHtml = await page.evaluate(() => {
    const el = document.querySelector('[id*="proj-source"], [id*="projSource"]');
    return el ? el.outerHTML.slice(0, 2000) : 'NOT FOUND via selector guess';
  });
  console.log('PANEL HTML SNIPPET:', panelHtml);

  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
