// E, 2026-08-20: full panel survey for the widened Friday audit
// (draft/audit/warroom-draft-value-audit-2026-08-21.md). Drives to a
// realistic mid-draft state (Cory's real keepers, ~32 real picks pushed
// through, on the clock at his pick 33) and enumerates every visually
// distinct card/panel with a screenshot plus its rendered text content,
// so the KEEP/FIX/CUT table is built from what's actually on screen.
const { launchChromium } = require('./rehearsal-browser');
const BASE = process.env.WR_BASE || 'http://localhost:8925';

(async () => {
  const b = await launchChromium();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=username]', process.env.WR_USER || 'cory');
  await page.fill('input[name=password]', process.env.WR_PASS || 'pw');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  await page.goto(`${BASE}/admin/warroom`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  const cards = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.card, [id$="-card"], [id$="-strip"]').forEach(el => {
      if (!el.id) return;
      const rect = el.getBoundingClientRect();
      const text = (el.innerText || '').trim();
      out.push({
        id: el.id,
        visible: rect.width > 0 && rect.height > 0 && text.length > 0,
        top: Math.round(rect.top),
        height: Math.round(rect.height),
        textLen: text.length,
        heading: text.split('\n')[0].slice(0, 80),
      });
    });
    return out;
  });
  console.log('=== CARD/PANEL INVENTORY (id, visible, top, height, heading) ===');
  cards
    .filter(c => c.visible)
    .sort((a, b) => a.top - b.top)
    .forEach(c => console.log(`  ${c.id.padEnd(28)} top=${String(c.top).padStart(5)} h=${String(c.height).padStart(4)}  "${c.heading}"`));

  console.log(`\n${cards.filter(c => !c.visible).length} cards present in DOM but not visible (0 size or empty):`);
  cards.filter(c => !c.visible).forEach(c => console.log(`  ${c.id}`));

  await page.screenshot({ path: '/tmp/claude-0/-home-user-maga-league/5afb9b48-77b2-5419-87c9-388d6ff29a39/scratchpad/warroom_full.png', fullPage: true });
  console.log('\nFull-page screenshot saved.');

  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
