// E, 2026-08-20: Cory asked "board is still showing players who are already
// gone during a mock -- is it a Sleeper sync error or something else." Read
// public/js/draft/position_boards_view.js and app.js's renderPositionBoardsPanel
// and found this panel looks up a pick-number entry in a STATIC, precomputed
// public/position_boards.json (an offline ADP-drain simulation) with no
// cross-check against state.drafted anywhere in the render path -- unlike the
// main board, which re-filters state.board on every Sleeper sync. Verifying
// live before reporting, per Rule 3e -- this must not be filed on source
// reading alone.
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

  // Read the position-boards panel's raw data + what's rendered for the
  // CURRENT pick, then mark a player who appears in it as drafted via the
  // real "Gone" button (same as a live pick would), and check whether the
  // panel still lists him afterward.
  const before = await page.evaluate(() => {
    const d = window.__warroom.state.positionBoards;
    const pbPanel = document.getElementById('position-boards');
    const hasPanel = !!pbPanel;
    const hasView = typeof window.PositionBoardsView !== 'undefined';
    let firstEntry = null, firstPlayerId = null, firstPlayerName = null;
    if (d && d.picks && d.picks.length) {
      const entry = d.picks[0];
      firstEntry = entry ? entry.pick : null;
      const posLists = entry && entry.positions;
      if (posLists) {
        for (const pos of Object.keys(posLists)) {
          const block = posLists[pos];
          const list = block && block.players;
          if (list && list.length) {
            firstPlayerId = String(list[0].player_id);
            firstPlayerName = list[0].name;
            break;
          }
        }
      }
    }
    return { hasPanel, hasView, dataLoaded: !!d, firstEntry, firstPlayerId, firstPlayerName };
  });
  console.log('BEFORE:', JSON.stringify(before, null, 2));

  if (!before.firstPlayerId) {
    console.log('No player id found in position-boards data for this pick -- cannot continue check.');
    await b.close();
    return;
  }

  // Mark that exact player as drafted via the real board button, same path
  // a live sync/manual pick uses.
  const draftResult = await page.evaluate((id) => {
    const btn = document.querySelector(`[data-draft-other="${id}"]`);
    if (btn) { btn.scrollIntoView(); btn.click(); return 'clicked-real-button'; }
    // Fallback: the player may not be visible on the main board (different
    // source list) -- mark drafted directly the same way the sync path does.
    window.__warroom.state.drafted.add(String(id));
    window.__warroom.state.board = (window.__warroom.state.board || [])
      .filter(p => String(p.player_id) !== String(id));
    return 'marked-directly-not-on-board';
  }, before.firstPlayerId);
  console.log('DRAFT ACTION:', draftResult);
  await page.waitForTimeout(900);

  // Force a re-render of the panel the way a real pick / render cycle would.
  await page.evaluate(() => {
    if (typeof window.__warroom.renderAll === 'function') window.__warroom.renderAll();
  });
  await page.waitForTimeout(500);

  const after = await page.evaluate((id) => {
    const panelHtml = document.getElementById('position-boards');
    const html = panelHtml ? panelHtml.innerHTML : '';
    const stillListedInPanelHtml = html.includes(id);
    const inDraftedSet = window.__warroom.state.drafted.has(String(id));
    const stillOnMainBoard = (window.__warroom.state.board || [])
      .some(p => String(p.player_id) === String(id));
    return { stillListedInPanelHtml, inDraftedSet, stillOnMainBoard };
  }, before.firstPlayerId);
  console.log('AFTER marking', before.firstPlayerName, '(' + before.firstPlayerId + ') drafted:');
  console.log(JSON.stringify(after, null, 2));
  console.log(after.stillListedInPanelHtml
    ? '*** REPRODUCED: player still appears in the position-boards panel HTML after being marked drafted. ***'
    : 'NOT reproduced this way -- panel HTML no longer contains the id (may render by name only, checking name too is worth a follow-up if this prints).');

  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
