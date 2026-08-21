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

  const readBoard = async (label) => {
    const info = await page.evaluate(() => {
      const tbody = document.getElementById('board-body');
      const rows = tbody ? Array.from(tbody.querySelectorAll('tr')).slice(0, 5)
        .map(tr => tr.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)) : [];
      // Is the "re-ranked" warning visible anywhere ON SCREEN right now, or
      // only inside a panel that could be scrolled away?
      const board = document.getElementById('board');
      const proj = document.getElementById('proj-source');
      const boardTop = board ? board.getBoundingClientRect().top : null;
      const projRect = proj ? proj.getBoundingClientRect() : null;
      const warningInProjPanel = proj ? /RE-RANKED ON/.test(proj.textContent) : false;
      const warningNearBoard = board ? /RE-RANKED ON/.test(board.parentElement.textContent) : false;
      return { rows, boardTop, projBottom: projRect ? projRect.bottom : null,
        warningInProjPanel, warningNearBoard };
    });
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(info, null, 2));
    return info;
  };

  const before = await readBoard('BLEND — big board table, first 5 rows');
  await page.evaluate(() => window.__setProjSource('ds'));
  await page.waitForTimeout(1500);
  const after = await readBoard('DRAFT SHARKS — big board table, first 5 rows');

  console.log('\n=== DID THE RENDERED TABLE ROWS ACTUALLY CHANGE? ===');
  console.log('row 0 changed:', before.rows[0] !== after.rows[0]);
  console.log('any row changed:', JSON.stringify(before.rows) !== JSON.stringify(after.rows));
  console.log('\ngap between proj-source panel bottom and board table top (px):',
    after.boardTop - after.projBottom, '-- if large, the warning banner can scroll off screen '
    + 'while the board is still visible');

  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
