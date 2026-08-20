/* E's audit of A's source-toggle work: does the board ACTUALLY re-rank when
 * the source changes, live in a browser? The existing test suite
 * (proj_source_panel.test.js) is 100% static regex-over-source-text -- it
 * never drives the page, so it cannot catch a runtime bug in the swap logic.
 *
 * Run:
 *   node draft/tests/rehearsal-serve.js &
 *   WR_USER=cory WR_PASS=pw node draft/tests/proj_source_toggle_live_check.js
 */
const { launchChromium } = require('./rehearsal-browser');
const BASE = process.env.WR_BASE || 'http://localhost:8925';

(async () => {
  const b = await launchChromium();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=username]', process.env.WR_USER || 'cory');
  await page.fill('input[name=password]', process.env.WR_PASS || 'pw');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  await page.goto(`${BASE}/admin/warroom`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  const readState = async (label) => {
    const info = await page.evaluate(() => {
      const st = (window.__warroom && window.__warroom.state) || {};
      const board = st.board || [];
      const top5 = board.slice(0, 5).map(p => ({
        id: p.player_id, name: p.name, overall_rank: p.overall_rank,
        vorp: p.vorp, tier: p.tier, proj_mean: p.proj_mean,
      }));
      // THE ACTUAL RECOMMENDATION, not the static tooltip text. renderRecommendations
      // stores its own output on state.lastClock every render.
      const clock = st.lastClock;
      const scoredTop5 = clock && Array.isArray(clock.scored)
        ? clock.scored.slice(0, 5).map(s => ({
            name: s.player && s.player.name, score: s.score,
            survival_to_next: s.survival_to_next,
          }))
        : null;
      // VONA specifically -- find it wherever the composite score's components
      // are recorded, if at all, on the top recommendation.
      const topScored = clock && clock.scored && clock.scored[0];
      const vona = topScored && (topScored.vona != null ? topScored.vona
        : (topScored.terms && topScored.terms.vona));
      const projSource = st.projSource;
      const myRoster = (st.myRoster || []).length;
      return { top5, scoredTop5, vona, projSource, boardLen: board.length, myRoster,
        hasLastClock: !!clock };
    });
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(info, null, 2));
    return info;
  };

  const before = await readState('BEFORE toggle (blend)');

  const switched = await page.evaluate(() => {
    if (typeof window.__setProjSource !== 'function') return 'NO __setProjSource FUNCTION';
    window.__setProjSource('ds');
    return 'called';
  });
  console.log('\nswitch call result:', switched);
  await page.waitForTimeout(1500);

  const after = await readState('AFTER toggle (Draft Sharks)');

  // Switch back to blend and confirm it restores exactly.
  await page.evaluate(() => window.__setProjSource('blend'));
  await page.waitForTimeout(1000);
  const restored = await readState('AFTER toggling BACK to blend');

  console.log('\n=== DID THE BOARD ACTUALLY CHANGE? ===');
  const sameTop5 = JSON.stringify(before.top5) === JSON.stringify(after.top5);
  console.log('top5 identical before/after DS toggle:', sameTop5, sameTop5 ? '<<< SUSPICIOUS if true' : 'changed, as expected');

  const restoredMatchesOriginal = JSON.stringify(before.top5) === JSON.stringify(restored.top5);
  console.log('top5 after switching BACK matches original blend:', restoredMatchesOriginal, restoredMatchesOriginal ? 'good' : '<<< BUG if false, state.pristine restore is broken');

  if (errs.length) {
    console.log('\n=== CONSOLE/PAGE ERRORS DURING THE WHOLE FLOW ===');
    errs.forEach(e => console.log(' ', e));
  } else {
    console.log('\nno console/page errors during the flow');
  }

  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
