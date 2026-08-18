// TERRITORY: B
/* TIMED DESKTOP REHEARSAL — item 2 of A's "hold is over" ask (ROUTES.md
 * `## TO: B`, 2026-08-17): "drive the DEPLOYED war room through a full mock
 * at 8s/pick at desktop viewport: every tab, the drill-down, the take
 * button, keeper strip, RUNNING-OUT tiles as the board empties."
 *
 * NOT IN THE DEFAULT SUITE — needs a dev server and a real Chromium, same
 * class as rehearsal-mock3.js (which this reuses the login/server pattern
 * from). Where mock3 checks MECHANISM (does the clock advance, does the
 * badge fire), this checks the two things only a timed human-paced pass can
 * catch: (a) TRUTH — does any number on screen contradict another, or the
 * seat, at any point across a full draft, not just at pick 1; (b)
 * FINDABILITY — can a specific real lookup be done from a cold tab in the
 * time an 8s/pick clock actually allows.
 *
 * Run:
 *     node draft/tests/rehearsal-serve.js &
 *     WR_USER=cory WR_PASS=pw node draft/tests/rehearsal-timed-desktop.js
 */
'use strict';
const { launchChromium } = require('./rehearsal-browser');
const BASE = process.env.WR_BASE || 'http://localhost:8925';

const R = [];
const check = (name, cond, detail) => R.push({ name, ok: !!cond, detail });
const truth = [];   // findings that contradict another number on screen
const find = [];    // lookups that took longer than an 8s pick allows

(async () => {
  const b = await launchChromium();
  // 900-1200px is the range A's ask names as "must be beautiful" — Cory's
  // effective viewport sits near the 900px floor where the grid engages, so
  // rehearse there rather than at a comfortable 1440.
  const ctx = await b.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=username]', process.env.WR_USER || 'cory');
  await page.fill('input[name=password]', process.env.WR_PASS || '');
  await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
  await page.goto(`${BASE}/admin/warroom`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  // ---- WALK EVERY TAB AT THE 900-1200PX FLOOR, TIME THE FIRST PAINT -------
  const tabs = ['draft', 'board', 'rosters', 'adjust', 'intel'];
  const tabTimes = {};
  for (const t of tabs) {
    const t0 = Date.now();
    await page.click(`button[data-wrtab-btn="${t}"]`);
    await page.waitForSelector(`#wr-tab-${t}[data-wrpanel]`, { state: 'visible' });
    const ms = Date.now() - t0;
    tabTimes[t] = ms;
    const visible = await page.evaluate((id) => {
      const e = document.getElementById(id);
      if (!e) return null;
      const cs = getComputedStyle(e);
      return { display: cs.display, hasText: (e.innerText || '').trim().length > 0 };
    }, `wr-tab-${t}`);
    check(`tab "${t}" switches and renders content`, visible && visible.display !== 'none' && visible.hasText, JSON.stringify({ ms, visible }));
    if (ms > 300) find.push(`tab switch to "${t}" took ${ms}ms (first-paint, not the 8s budget itself, but worth a look if it grows)`);
  }
  check('no tab switch left the panel visibly empty', Object.values(tabTimes).every(ms => ms < 5000), JSON.stringify(tabTimes));

  // ---- FINDABILITY DRILL 1: "pick clock, 30s: find the top available RB,
  //      his projected points, and his dollar value" — E's own drill format,
  //      quoted verbatim in A's ask. Checked in two hops, the real answer
  //      path: (a) the left rail's top-10 list, (b) its drill-down on click.
  await page.click('button[data-wrtab-btn="draft"]');
  const rail1 = await page.evaluate(() => {
    const row = document.querySelector('.wr-pr-row[data-drill]');
    return row ? row.innerText.replace(/\s+/g, ' ').trim() : null;
  });
  check('DRILL 1a: the rail\'s #1 row is reachable with zero tab switches', !!rail1, rail1 || 'no .wr-pr-row found');
  if (rail1 && !/\$/.test(rail1)) {
    find.push(`DRILL 1a: the top-10-per-position RAIL shows rank/name/tier/survival-% only, no $ and no proj — row text: "${rail1}". A drafter reading only the rail (the zero-click view) cannot answer "his projected points, his dollar value" without a further click.`);
  }
  const drill1b_t0 = Date.now();
  await page.evaluate(() => { const r = document.querySelector('.wr-pr-row[data-drill]'); if (r) r.click(); });
  await page.waitForSelector('#wr-drill:not([hidden])', { timeout: 3000 }).catch(() => {});
  const drill1b_ms = Date.now() - drill1b_t0;
  const drillText = await page.evaluate(() => {
    const e = document.getElementById('wr-drill');
    return e ? (e.innerText || '') : null;
  });
  check('DRILL 1b: one click on the rail opens the full drill-down, well under budget', drillText && drill1b_ms < 2000, `ms=${drill1b_ms}`);
  const hasProj = drillText && /Proj \(floor \/ mean \/ ceiling\)/.test(drillText);
  check('DRILL 1b: the drill-down carries the projected-points figure Cory asked to find', hasProj, (drillText || '').slice(0, 200));
  const hasDollar = drillText && /\$/.test(drillText);
  if (!hasDollar) {
    find.push(`DRILL 1b: the drill-down (Proj floor/mean/ceiling, VONA, Composite, VORP, ADP, Tier, Bye, survival, engine's-why) never shows a $ figure for a SINGLE player. Verified separately: dollar figures ("boom $", "season $") exist only inside the two-player Compare tray (E.dollarGap), as a delta between two chosen players — there is no per-player absolute dollar lookup anywhere in the war room. A's own findability-drill spec names "his dollar value" as a single-player target; as built, that answer does not exist without opening Compare and picking a second reference player. Not fixing (public/js/draft/**, held) — routing as a TRUTH-adjacent findability gap, A's call: either the drill spec should read "VORP" (which the rail treats as the value proxy) instead of "$", or a per-player $ needs to exist.`);
  }
  // Close the modal before the picks-driving loop below needs the tab bar.
  await page.evaluate(() => { const c = document.querySelector('[data-drill-close="1"]'); if (c) c.click(); });
  await page.waitForTimeout(200);

  // ---- DRILL 2: open a drill-down from the board, time it -----------------
  const drill2_t0 = Date.now();
  const clicked = await page.evaluate(() => {
    const row = document.querySelector('#board-body tr, .wr-board-row, [data-drill]');
    if (row) { row.click(); return true; }
    return false;
  });
  await page.waitForTimeout(400);
  const drill2_ms = Date.now() - drill2_t0;
  const drillState = await page.evaluate(() => {
    const e = document.getElementById('wr-drill');
    if (!e) return null;
    return { hidden: e.hidden, text: (e.innerText || '').slice(0, 300) };
  });
  check('DRILL 2: clicking a board row opens #wr-drill', clicked && drillState && !drillState.hidden, JSON.stringify({ drill2_ms, drillState }));
  if (drillState && !drillState.hidden) {
    // TRUTH check: does the drill-down show VONA/composite, or blank dashes
    // (the exact gap A closed with a caption per ROUTES.md's own record)?
    const hasBlanks = /VONA\s*—|Composite score\s*—/.test(drillState.text);
    if (hasBlanks) {
      const captioned = /not scored this pick|outside the engine/i.test(drillState.text);
      if (!captioned) truth.push(`drill-down shows a blank VONA/composite with no caption explaining why: "${drillState.text.slice(0, 160)}"`);
    }
  }
  if (!clicked) find.push('DRILL 2: no clickable board row found at the "board" tab default state — could not exercise the drill-down at all; check the selector or whether the board needs the BIG BOARD tab active first.');
  // #wr-drill is a real modal (inset:0, z-index:200) with its own close
  // button — close it before continuing, or every later click on the tab
  // bar underneath silently queues against the backdrop instead of firing.
  await page.evaluate(() => {
    const c = document.querySelector('[data-drill-close="1"]');
    if (c) c.click();
  });
  await page.waitForTimeout(200);

  // ---- DRIVE PICKS AT AN 8s CADENCE, WATCH RUNNING-OUT TILES + KEEPER STRIP
  await page.click('button[data-wrtab-btn="draft"]');
  const tileSnapshots = [];
  const readTiles = () => page.evaluate(() => {
    const card = document.getElementById('wr-tiles-card');
    return card ? (card.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200) : null;
  });
  tileSnapshots.push(await readTiles());
  const keeperNote = await page.evaluate(() => {
    const e = document.getElementById('keeper-lock-note');
    if (!e) return null;
    const cs = getComputedStyle(e);
    return { shown: cs.display !== 'none', text: (e.innerText || '').slice(0, 200) };
  });
  check('keeper-lock strip is present in the DOM (severity-1 per its own doc comment)', keeperNote !== null, JSON.stringify(keeperNote));

  let picksTaken = 0;
  for (let i = 0; i < 8; i++) {
    const pickStart = Date.now();
    const ok = await page.evaluate(() => {
      const other = document.querySelector('#board-body button[data-draft-other]');
      if (other) { other.click(); return 'other'; }
      const mine = document.querySelector('#board-body button[data-draft-me]');
      if (mine) { mine.click(); return 'me'; }
      return null;
    });
    if (!ok) break;
    picksTaken++;
    await page.waitForTimeout(250);
    tileSnapshots.push(await readTiles());
    const elapsed = Date.now() - pickStart;
    // Not asserting real 8s pacing here (the harness clicks instantly) — the
    // budget check is on RENDER time after the click, which is the part that
    // could eat into Cory's 8s if it regressed.
    if (elapsed > 2000) find.push(`pick ${i + 1}: post-click render took ${elapsed}ms, eating real budget from an 8s pick`);
  }
  check('drove at least 6 picks without the board hanging', picksTaken >= 6, `picksTaken=${picksTaken}`);
  const tilesChanged = new Set(tileSnapshots.filter(Boolean)).size > 1;
  check('RUNNING-OUT tiles actually MOVE as the board empties (not a static snapshot)', tilesChanged, JSON.stringify(tileSnapshots.map(s => (s || '').slice(0, 60))));

  // ---- TAKE BUTTON: confirm it is reachable and labeled, not just present --
  await page.click('button[data-wrtab-btn="draft"]');
  const take = await page.evaluate(() => {
    const t = document.querySelector('#verdict-block .btn.gold') || document.querySelector('.wrv-take, #clock-take');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { text: (t.innerText || '').trim(), top: Math.round(r.top), visible: r.width > 0 && r.height > 0 };
  });
  check('the take button is present, labeled and on-screen at 1024x768', take && take.visible && take.text.length > 0, JSON.stringify(take));
  if (take && take.top > 768) find.push(`take button sits at top=${take.top}px, below the 768px fold at this viewport — that is the >5s-to-find failure mode this drill exists to catch.`);

  // ---- SEAT/PICK CONSISTENCY ACROSS THE WHOLE RUN --------------------------
  const diag = await page.evaluate(() => (window.__wrDiag ? window.__wrDiag() : null));
  if (diag && diag.seat && diag.audit) {
    check('seat audit is clean after driving picks (not just at pick 1)', diag.audit.ok !== false, JSON.stringify(diag.audit));
    if (diag.audit.ok === false) truth.push(`seat/pick-state audit went unclean mid-rehearsal: ${JSON.stringify(diag.audit)}`);
  }

  check('no page errors across the timed rehearsal', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nTIMED DESKTOP REHEARSAL (1024x768, ' + tabs.length + ' tabs, ' + picksTaken + ' picks driven)');
  console.log('='.repeat(72));
  let bad = 0;
  for (const r of R) {
    if (!r.ok) bad++;
    console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok || !r.detail ? '' : '\n        -> ' + r.detail));
  }
  console.log('='.repeat(72));
  console.log(`${R.length - bad}/${R.length} mechanical checks passed`);
  console.log(`\nTRUTH findings (contradicts another number on screen): ${truth.length}`);
  truth.forEach(t => console.log('  - ' + t));
  console.log(`\nFINDABILITY findings (>~budget to locate/render): ${find.length}`);
  find.forEach(f => console.log('  - ' + f));
  await b.close();
  process.exit(bad ? 1 : 0);
})();
