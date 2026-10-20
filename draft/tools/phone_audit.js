'use strict';
/* PHONE AUDIT — what is actually crowded, measured at a real phone width.
 *
 * Cory, 2026-10-20: "we need to review site again.. its very busy, edges are
 * very crowded on my phone.. it needs to look better, specifically on phone"
 *
 * "Busy" and "crowded" are judgements, but they have measurable causes, and
 * guessing at them is how a redesign fixes the wrong thing. This reports, per
 * page, at 390x844 (iPhone 14/15 CSS pixels):
 *
 *   * HORIZONTAL OVERFLOW — documentElement.scrollWidth > clientWidth, plus
 *     the specific elements sticking out past the viewport. This is the one
 *     that makes a page feel broken rather than dense: it lets the whole page
 *     slide sideways.
 *   * THE SIDE GUTTER — the smallest left inset and largest right edge across
 *     visible text. A gutter under ~14px is the literal "edges are crowded".
 *   * TEXT TOO SMALL to read on a phone (< 12px computed).
 *   * TAP TARGETS under 44x44 (Apple's HIG minimum), and how many sit within
 *     8px of another one.
 *   * DENSITY — visible elements and text nodes per screen of height, which is
 *     the closest honest proxy for "busy".
 *
 * It CHANGES NOTHING. Output is a report plus screenshots, so the fixes that
 * follow are aimed at measured problems and can be re-measured after.
 *
 * Run: node draft/tools/phone_audit.js [--out DIR] [--width 390]
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const { launchChromium } = require(path.join(ROOT, 'draft', 'tests', 'rehearsal-browser.js'));

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const WIDTH = parseInt(argOf('--width', '390'), 10);
const HEIGHT = parseInt(argOf('--height', '844'), 10);
const OUT = argOf('--out', path.join(os.tmpdir(), 'phone-audit'));

//: The pages Cory actually uses on a phone, in the order he hits them.
const PAGES = [
  { path: '/', name: 'home' },
  { path: '/bank', name: 'bank' },
  { path: '/bank?section=sidebets', name: 'bank-sidebets' },
  { path: '/waivers', name: 'waivers' },
  { path: '/lineup', name: 'lineup' },
  { path: '/standings', name: 'standings' },
  { path: '/history', name: 'history' },
];

//: Apple HIG minimum tap target; the gutter floor is the artifact-design
//: convention (16px side gutter) minus a little slack for borders.
const TAP_MIN = 44;
const GUTTER_MIN = 14;
const TEXT_MIN = 12;

/* Everything below runs INSIDE the page. Kept as one function so the measured
 * definitions live in one place rather than being re-derived per metric. */
function measure({ vw, TAP_MIN, GUTTER_MIN, TEXT_MIN }) {
  // ⚠️ ONE ARGUMENT. page.evaluate(fn, arg) passes exactly one value;
  // a second is silently dropped, and the first version destructured it
  // from `undefined` and threw on every page.
  const de = document.documentElement;
  const vis = el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const all = [...document.querySelectorAll('body *')].filter(vis);

  // --- overflow: who actually sticks out, named so it can be fixed ---
  const over = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      // report the OUTERMOST offender, not every descendant of it
      if (!over.some(o => o.el.contains(el))) {
        over.push({ el, right: Math.round(r.right), left: Math.round(r.left),
          w: Math.round(r.width) });
      }
    }
  }
  const sig = el => el.tagName.toLowerCase()
    + (el.id ? '#' + el.id : '')
    + (el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');

  // --- gutter: measured on TEXT, because that is what reads as crowded ---
  // ⚠️ MEASURED INSIDE CONTENT CONTAINERS, NOT ANY WIDE TEXT. The first
  // version took the minimum left edge of every text block wider than half the
  // viewport, which is dominated by FULL-BLEED CHROME — the announcement strip
  // and the sticky bottom nav legitimately run edge to edge. It therefore
  // reported `gutter 0px` on all seven pages INCLUDING A 404, and the
  // screenshots flatly contradict it: /bank's cards sit on a ~24px gutter.
  // That is a number that fit the story it was asked to confirm (rule 3i), and
  // the 404 scoring identically is what gave it away.
  const containers = [...document.querySelectorAll('main, .card, .wrap, .container, article')]
    .filter(vis);
  let minLeft = Infinity, maxRight = 0, gutterWorst = null;
  const textEls = all.filter(el =>
    [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1));
  const inContent = el => containers.some(c => c.contains(el));
  for (const el of textEls) {
    if (!inContent(el)) continue;       // skip chrome
    const r = el.getBoundingClientRect();
    if (r.width > vw * 0.5) {           // only full-width-ish blocks
      if (r.left < minLeft) { minLeft = r.left; gutterWorst = el; }
      if (r.right > maxRight) maxRight = r.right;
    }
  }

  // --- small text ---
  const tiny = [];
  for (const el of textEls) {
    const fs_ = parseFloat(getComputedStyle(el).fontSize);
    if (fs_ && fs_ < TEXT_MIN) tiny.push({ s: sig(el), px: Math.round(fs_ * 10) / 10 });
  }

  // --- tap targets ---
  // Chrome (nav, skip-link) is on EVERY page and swamped the per-page signal —
  // the same four offenders appeared on all seven, 404 included. Split it out.
  const CHROME = 'nav, header, footer, .bottom-nav, .tabbar, .skip-link';
  const isChrome = el => el.closest(CHROME) !== null;
  const tappableAll = all.filter(el =>
    ['a', 'button', 'input', 'select', 'textarea'].includes(el.tagName.toLowerCase()));
  const tappable = tappableAll.filter(el => !isChrome(el));
  const small = [];
  for (const el of tappable) {
    const r = el.getBoundingClientRect();
    if (r.height < TAP_MIN || r.width < TAP_MIN) {
      small.push({ s: sig(el), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  // crowded pairs: tappables whose rects are within 8px of each other
  let crowdedPairs = 0;
  const rects = tappable.map(el => el.getBoundingClientRect());
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
      const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
      if (dx < 8 && dy < 8) crowdedPairs++;
    }
  }

  return {
    scrollWidth: de.scrollWidth,
    clientWidth: de.clientWidth,
    overflows: de.scrollWidth > de.clientWidth + 1,
    overflow_px: de.scrollWidth - de.clientWidth,
    offenders: over.slice(0, 8).map(o => ({ s: sig(o.el), right: o.right, left: o.left, w: o.w })),
    gutter_left: Number.isFinite(minLeft) ? Math.round(minLeft) : null,
    gutter_right: maxRight ? Math.round(vw - maxRight) : null,
    gutter_worst: gutterWorst ? sig(gutterWorst) : null,
    chrome_taps: tappableAll.length - tappable.length,
    tiny_text: tiny.slice(0, 8),
    tiny_text_count: tiny.length,
    small_taps: small.slice(0, 8),
    small_taps_count: small.length,
    crowded_pairs: crowdedPairs,
    page_height: de.scrollHeight,
    elements: all.length,
    density_per_screen: Math.round(all.length / Math.max(1, de.scrollHeight / 844) * 10) / 10,
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // Boot the real app against a temp store, same shape the route tests use.
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-audit-'));
  const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
  const data = require(path.join(ROOT, 'src', 'data'));
  const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
  const { createApp } = require(path.join(ROOT, 'server-app'));
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory') || owners[0];
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  cory.is_commissioner = true;
  await store.set('owners', owners);

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await launchChromium({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 '
      + '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();

  // log in through the real form so every page is the authed one
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=username]', cory.username);
  await page.fill('input[name=password]', 'pw');
  await page.click('button[type=submit], input[type=submit]');
  await page.waitForLoadState('domcontentloaded');

  const results = [];
  for (const p of PAGES) {
    try {
      const resp = await page.goto(base + p.path, { waitUntil: 'networkidle', timeout: 30000 });
      const status = resp ? resp.status() : 0;
      const m = await page.evaluate(measure, { vw: WIDTH, TAP_MIN, GUTTER_MIN, TEXT_MIN });
      const shot = path.join(OUT, `${p.name}.png`);
      await page.screenshot({ path: shot, fullPage: false });
      const shotFull = path.join(OUT, `${p.name}-full.png`);
      await page.screenshot({ path: shotFull, fullPage: true });
      results.push({ ...p, status, ...m, shot });
    } catch (e) {
      results.push({ ...p, error: `${e.name}: ${e.message}`.slice(0, 160) });
    }
  }

  await browser.close();
  server.close();

  // ── report ───────────────────────────────────────────────────────────────
  const line = '='.repeat(78);
  console.log(line);
  console.log(`PHONE AUDIT — ${WIDTH}x${HEIGHT} (iPhone CSS px), real app, logged in as commissioner`);
  console.log(`gutter floor ${GUTTER_MIN}px · text floor ${TEXT_MIN}px · tap floor ${TAP_MIN}px`);
  console.log(line);
  for (const r of results) {
    if (r.error) { console.log(`\n🔴 ${r.name.padEnd(16)} ERROR ${r.error}`); continue; }
    const flags = [];
    if (r.overflows) flags.push(`OVERFLOW +${r.overflow_px}px`);
    if (r.gutter_left != null && r.gutter_left < GUTTER_MIN) flags.push(`gutter L ${r.gutter_left}px`);
    if (r.gutter_right != null && r.gutter_right < GUTTER_MIN) flags.push(`gutter R ${r.gutter_right}px`);
    if (r.tiny_text_count) flags.push(`${r.tiny_text_count} tiny text`);
    if (r.small_taps_count) flags.push(`${r.small_taps_count} small taps`);
    if (r.crowded_pairs) flags.push(`${r.crowded_pairs} crowded pairs`);
    const mark = flags.length ? '🔴' : '✅';
    console.log(`\n${mark} ${r.name}  (${r.path}, HTTP ${r.status})`);
    console.log(`     ${flags.length ? flags.join(' · ') : 'no measured problems'}`);
    console.log(`     gutters L${r.gutter_left}/R${r.gutter_right}  height ${r.page_height}px  `
      + `${r.elements} visible els  density ${r.density_per_screen}/screen`);
    if (r.overflows && r.offenders.length) {
      console.log('     sticking out past the viewport:');
      for (const o of r.offenders) console.log(`       - ${o.s}  left ${o.left} right ${o.right} (w ${o.w})`);
    }
    if (r.tiny_text_count) {
      console.log('     smallest text: ' + r.tiny_text.map(t => `${t.px}px ${t.s}`).slice(0, 4).join(' · '));
    }
    if (r.small_taps_count) {
      console.log('     small tap targets: ' + r.small_taps.map(t => `${t.w}x${t.h} ${t.s}`).slice(0, 4).join(' · '));
    }
  }
  console.log(`\n${line}`);
  console.log(`screenshots in ${OUT}`);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 1));
  const bad = results.filter(r => r.error || r.overflows
    || (r.gutter_left != null && r.gutter_left < GUTTER_MIN));
  console.log(bad.length
    ? `🔴 ${bad.length} page(s) with overflow, a crowded edge, or an error — fix these first.`
    : '✅ no page overflows and every gutter clears the floor.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
