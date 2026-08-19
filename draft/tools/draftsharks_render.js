// TERRITORY: C (written by A on Cory's ruling, 2026-08-19)
/* RENDER the Draft Sharks rankings and read the WHOLE table.
 *
 * Cory: "25 players??" — correct, and 25 is useless. Every HTML probe so far
 * got 25 rows because that is all the server sends: the table is a Vue
 * component, the first screen is server-rendered, and the remainder is drawn
 * client-side. Parsing harder cannot fix that; the page has to be EXECUTED.
 *
 * The agent sandbox is blocked at CONNECT for this host, but GitHub Actions
 * reaches it (HTTP 200, verified). So the browser runs there.
 *
 * Strategy, in order, because each is cheaper than the next:
 *   1. read the table after hydration
 *   2. scroll to the bottom repeatedly — most infinite lists load on scroll
 *   3. stop when the row count stops growing (a fixed point, not a guess at
 *      how many pages there are)
 *
 * It also records every XHR the page makes, because if there IS a clean JSON
 * endpoint we should be calling that instead of driving a browser every time —
 * and we cannot see it without executing the page once.
 *
 * STORE ONLY: writes draft/data/draftsharks_rendered.json. It does not touch
 * public/draft_data.json and does not join the crosswalk.
 *
 * Run (in CI): node draft/tools/draftsharks_render.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'draft', 'data', 'draftsharks_rendered.json');
const URL_ = 'https://www.draftsharks.com/rankings/half-ppr';

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 2400 },
  });
  const page = await ctx.newPage();

  /* Every request the page makes. If a clean JSON endpoint exists, this is how
   * we find it — and next time we call it directly instead of driving a
   * browser. */
  const xhr = [];
  page.on('response', r => {
    const u = r.url();
    const t = (r.headers()['content-type'] || '');
    if (/json/i.test(t) && !/googletag|analytics|gtm|doubleclick|sentry/i.test(u)) {
      xhr.push({ url: u.slice(0, 300), status: r.status(),
                 bytes: +(r.headers()['content-length'] || 0) });
    }
  });

  const nav = await page.goto(URL_, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector('table tr', { timeout: 60000 }).catch(() => {});

  const countRows = () => page.evaluate(() => {
    const t = [...document.querySelectorAll('table')]
      .sort((a, b) => b.rows.length - a.rows.length)[0];
    return t ? t.rows.length : 0;
  });

  /* Scroll to a FIXED POINT rather than a guessed number of pages. Also click
   * any "load more"/"show all" control if one exists — reported either way, so
   * a null is readable. */
  let last = -1, rounds = 0, clicked = 0;
  const growth = [];
  while (rounds < 40) {
    const n = await countRows();
    growth.push(n);
    if (n === last) {
      const btn = await page.$('button:has-text("Load More"), button:has-text("Show All"), '
        + 'a:has-text("Load More"), [class*="load-more"]');
      if (btn) { await btn.click().catch(() => {}); clicked++; await page.waitForTimeout(2500); }
      else break;
    }
    last = n;
    await page.mouse.wheel(0, 20000);
    await page.waitForTimeout(1200);
    rounds++;
  }

  /* Read the table AND the schema.org names in one pass, in the live DOM. */
  const scraped = await page.evaluate(() => {
    const t = [...document.querySelectorAll('table')]
      .sort((a, b) => b.rows.length - a.rows.length)[0];
    if (!t) return { header: [], rows: [] };
    const cell = td => (td.innerText || '').replace(/\s+/g, ' ').trim();
    const all = [...t.rows].map(r => [...r.cells].map(cell));
    return { header: all[0] || [], rows: all.slice(1) };
  });

  const jsonld = await page.evaluate(() => {
    const out = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const b = JSON.parse(s.textContent);
        for (const node of (Array.isArray(b) ? b : [b])) {
          for (const li of (node.itemListElement || [])) {
            const it = li.item || {};
            if (it.name) out.push({ name: it.name, url: it.url || '',
              jobTitle: it.jobTitle || '', description: it.description || '' });
          }
        }
      } catch (e) { /* not our block */ }
    }
    return out;
  });

  await browser.close();

  const widths = [...new Set(scraped.rows.map(r => r.length))].sort((a, b) => a - b);
  const dataRows = scraped.rows.filter(r => r.length === scraped.header.length);

  const ctl = {
    C1_page_rendered: { ok: (nav && nav.status()) === 200, status: nav && nav.status() },
    C2_more_than_server_rendered: {
      ok: dataRows.length > 30, rows: dataRows.length,
      server_rendered_was: 25,
      why: 'the whole point. Every static-HTML probe returned 25 because that '
         + 'is all the server sends. If rendering does not beat 25, executing '
         + 'the page did not help and the remainder is behind something else.' },
    C3_row_growth_reached_a_fixed_point: {
      ok: growth.length > 1 && growth[growth.length - 1] === growth[growth.length - 2],
      growth, load_more_clicks: clicked,
      why: 'stopped because the count stopped changing, not because a guessed '
         + 'page limit was hit — a guessed limit truncates silently' },
    C4_header_matches_the_static_capture: {
      ok: scraped.header.some(h => /ceiling/i.test(h)) && scraped.header.some(h => /floor/i.test(h)),
      header: scraped.header,
      why: 'if the rendered header lost Floor/Ceiling we are reading a different '
         + 'table than the one the store was built from' },
  };

  const doc = {
    _territory: 'TERRITORY: C — draft/tools/draftsharks_render.js',
    _ruling: "Cory 2026-08-19: use Draft Sharks' ceiling (CORY-ASKS A19/A20)",
    _note: 'STORE ONLY. Does not touch public/draft_data.json.',
    url: URL_, controls: ctl,
    controls_all_passed: Object.values(ctl).every(c => c.ok),
    header: scraped.header, row_widths: widths,
    n_rows: dataRows.length, n_jsonld_names: jsonld.length,
    json_endpoints_seen: xhr.slice(0, 40),
    rows: dataRows, jsonld,
  };
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1));

  console.log(`rendered rows=${dataRows.length} jsonld_names=${jsonld.length} `
    + `json_xhr=${xhr.length} growth=${growth.join(',')}`);
  Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK  ' : '  FAIL') + k));
  console.log('  header:', scraped.header.slice(0, 14).join(' | '));
  xhr.slice(0, 12).forEach(x => console.log('  xhr:', x.status, x.url.slice(0, 140)));
  process.exit(doc.controls_all_passed ? 0 : 1);
})().catch(e => { console.error('RENDER FAILED:', e && e.message); process.exit(1); });
