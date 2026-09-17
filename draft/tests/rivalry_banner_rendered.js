'use strict';
// THE BANNER, AS A BROWSER ACTUALLY PAINTS IT — measured off the pixels.
//
// `rivalry_banner_contrast.test.js` parses the CSS and is what runs in CI: fast,
// no browser, catches the regression it was written for. But it reasons about
// the ground from the RULE (`--panel-soft`), and a rule is not a rendering.
// Cory's complaint was about pixels, so something here has to look at pixels.
//
// ⚠️ AND THE FIRST TWO VERSIONS OF THIS FILE GOT IT WRONG IN THE SAME WAY, which
// is why it no longer models compositing at all:
//
//   v1 read `background-color` up the ancestor chain — but the tones paint with
//      gradients, and a gradient's flat background-color is a lie.
//   v2 composited the gradient's colour stops in the order they appear. CSS
//      paints the FIRST background layer ON TOP; v2 stacked them backwards, so
//      the German banner's black overlay was painted UNDER its flag and
//      vanished, and the tool reported the gold band undimmed. It also treated
//      a gradient's stops as layers to composite when they are positions along
//      one — "darkest stop" is not a worst case for light text, it is the
//      opposite of one.
//
// So: screenshot the page with every glyph made transparent, load that plate
// back into a canvas, and read the REAL background pixels under each text box.
// Worst case is the pixel in that box with the least contrast against the text
// colour. No model of compositing can be wrong, because there is no model.
//
// This is an instrument, not a CI gate (it needs a browser). When it and the
// parser test disagree, believe this one — that disagreement is how the German
// tone's failure was found, after the parser test had passed it.
//
// Run: node draft/tests/rivalry_banner_rendered.js

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.SCRATCH || require('os').tmpdir();

const rivalries = require(path.join(ROOT, 'src', 'rivalries.js'));
const LIST = rivalries.RIVALRIES || rivalries.rivalries || rivalries.list || rivalries;
const all = Array.isArray(LIST) ? LIST : Object.values(LIST);

// One banner per TONE. The live one is whichever the week picks, and a fix that
// only covers this week's tone is the same miss that caused the bug.
const seen = new Set();
const picks = [];
for (const r of all) {
  if (!r || !r.tone || seen.has(r.tone)) continue;
  seen.add(r.tone);
  picks.push(r);
}
if (!seen.has('german') && picks[0]) picks.push({ ...picks[0], tone: 'german', name: 'SPIEL DER WOCHE' });

const tpl = fs.readFileSync(path.join(ROOT, 'views', 'partials', '_rivalry_banner.ejs'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');

const blocks = picks.map((r, i) => {
  const rivalry = { ...r, notable: { record: true, aWins: 7, bWins: 5, line: 'Decided by under a touchdown in three of the last four.' } };
  return ejs.render(tpl, { rivalry, aName: r.a || 'Team A', bName: r.b || 'Team B', rivalryRank: i === 0 ? 1 : 2 });
}).join('\n');

// A KNOWN-BAD BANNER, planted on purpose (rule 3e). Everything below reports an
// absence of failures, and an absence from a detector that cannot detect is
// worth nothing. This one is white on the paper panel — the exact 1.13:1 that
// Cory could not read — and the run FAILS if the instrument passes it.
const PLANT = `<div class="riv-banner tone-rivalry" id="planted-control">
  <div class="riv-banner-name" style="color:#ffffff">CONTROL: MUST BE FLAGGED</div></div>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body><div class="wrap">${blocks}${PLANT}</div></body></html>`;
const file = path.join(OUT, 'riv_banner_harness.html');
fs.writeFileSync(file, html);

const HIDE_TEXT = `*, *::before, *::after { color: transparent !important;
  text-shadow: none !important; -webkit-text-stroke: 0 !important; }`;

(async () => {
  // ⚠️ THROUGH THE HELPER, NEVER chromium.launch() DIRECTLY. The first draft of
  // this file hardcoded `executablePath: '/opt/pw-browsers/chromium'` — the
  // exact defect `rehearsal_browser_portability.test.js` was written to hold
  // down in August, reintroduced by someone (me) who had not read it. That path
  // is this container's symlink and exists on no CI runner. The guard caught it
  // in the sweep before the commit; that is the guard working, and the comment
  // stays so the next person reaches for the helper first.
  const { launchChromium } = require(path.join(__dirname, 'rehearsal-browser.js'));
  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await page.goto('file://' + file);

  // the text boxes and their colours, from the page as it really renders
  const targets = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[class*="riv-"]')) {
      const nodes = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
      const txt = nodes.map(n => n.textContent.trim()).join(' ').trim();
      if (!txt) continue;

      // ⚠️ GLYPH RECTS, NOT THE ELEMENT BOX — v3 used getBoundingClientRect and
      // produced two false failures out of 36. The eyebrow's box CONTAINS the
      // red "THE MARQUEE" pill (a child), so the pill's red was reported as the
      // eyebrow's ground; and the pill's own box includes its rounded-corner
      // antialiasing, where the pale panel shows through behind no glyph at
      // all. Neither pixel has text on it. A Range over the element's OWN text
      // nodes covers the line boxes and nothing else.
      const rects = [];
      for (const n of nodes) {
        const rg = document.createRange();
        rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) {
          // inset by 1px: the outermost row/column of a line box is where
          // antialiasing against whatever is outside it lands
          if (r.width > 3 && r.height > 3) {
            rects.push({ x: r.x + window.scrollX + 1, y: r.y + window.scrollY + 1,
                         w: r.width - 2, h: r.height - 2 });
          }
        }
      }
      if (!rects.length) continue;

      const cs = getComputedStyle(el);
      const px = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      out.push({
        tone: ((el.closest('.riv-banner') || { className: '' }).className
                .match(/tone-[a-z]+/) || ['?'])[0],
        sel: el.className, text: txt.slice(0, 40), color: cs.color,
        planted: !!el.closest('#planted-control'),
        // a text-shadow is a legitimate legibility aid on a busy ground, so
        // record it rather than silently crediting or ignoring it
        shadow: cs.textShadow !== 'none',
        rects, px, large: px >= 24 || (px >= 18.66 && bold),
      });
    }
    return out;
  });

  // THE PLATE: the same page with every glyph transparent, so what remains under
  // each text box is exactly the background the text is painted onto.
  await page.addStyleTag({ content: HIDE_TEXT });
  const shot = await page.screenshot({ fullPage: true });
  const dataUrl = 'data:image/png;base64,' + shot.toString('base64');

  const results = await page.evaluate(async ({ dataUrl, targets }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').drawImage(img, 0, 0);
    const ctx = cv.getContext('2d');

    const srgb = c => (c /= 255) <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const lum = (r, g, b) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
    const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const parse = s => (/rgba?\(([^)]+)\)/.exec(s || '') || [0, '0,0,0'])[1].split(',').map(Number);

    // CONTROL, inside the page and on the real canvas path: a synthetic white
    // plate and black text must read 21:1. If the canvas comes back blank or
    // the maths is wrong, every verdict below is void and we say so.
    let controlOk = false;
    {
      const t = document.createElement('canvas'); t.width = t.height = 4;
      const c2 = t.getContext('2d');
      c2.fillStyle = '#ffffff'; c2.fillRect(0, 0, 4, 4);
      const d = c2.getImageData(0, 0, 4, 4).data;
      controlOk = Math.abs(ratio(lum(0, 0, 0), lum(d[0], d[1], d[2])) - 21) < 0.01;
    }

    const out = [];
    for (const t of targets) {
      const [r, g, b] = parse(t.color);
      const fl = lum(r, g, b);
      let worst = Infinity, worstPx = null, n = 0;
      for (const box of t.rects) {
        const x = Math.max(0, Math.round(box.x)), y = Math.max(0, Math.round(box.y));
        const w = Math.min(Math.round(box.w), cv.width - x), h = Math.min(Math.round(box.h), cv.height - y);
        if (w <= 0 || h <= 0) continue;
        const d = ctx.getImageData(x, y, w, h).data;
        for (let i = 0; i < d.length; i += 4) {
          const rr = ratio(fl, lum(d[i], d[i + 1], d[i + 2]));
          n++;
          if (rr < worst) { worst = rr; worstPx = [d[i], d[i + 1], d[i + 2]]; }
        }
      }
      if (!n) continue;
      out.push({ ...t, ratio: +worst.toFixed(2), ground: 'rgb(' + worstPx.join(',') + ')',
                 pixels: n, need: t.large ? 3.0 : 4.5 });
    }
    return { controlOk, out };
  }, { dataUrl, targets });

  await browser.close();

  console.log(results.controlOk
    ? 'PASS CONTROL: canvas + contrast maths gives 21:1 for black on a white plate'
    : 'FAIL CONTROL: the canvas path is broken — every number below is void');
  if (!results.controlOk) process.exit(1);

  const planted = results.out.filter(r => r.planted);
  const real = results.out.filter(r => !r.planted);

  // The planted control is judged FIRST and inverted: it must be caught.
  let controlFailed = false;
  for (const p of planted) {
    const caught = p.ratio < p.need;
    console.log(`${caught ? 'PASS' : 'FAIL'} CONTROL: the planted 1.13:1 headline is `
      + `${caught ? 'CAUGHT' : 'MISSED'} (measured ${p.ratio}:1 on ${p.ground})`);
    if (!caught) controlFailed = true;
  }
  if (!planted.length) { console.log('FAIL CONTROL: the planted bad banner was never measured'); controlFailed = true; }
  if (controlFailed) { console.log('\nThe instrument cannot see a failure it was handed. Verdicts below are void.'); process.exit(1); }

  let bad = 0;
  for (const r of real) {
    const ok = r.ratio >= r.need;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${r.tone.padEnd(16)} ${String(r.sel).padEnd(20)} `
      + `${String(r.ratio).padStart(6)}:1 (needs ${r.need}) ${r.color} on worst pixel ${r.ground}`
      + `${r.shadow ? ' [has text-shadow]' : ''}  "${r.text}"`);
  }
  console.log(`\n${real.length} rendered text elements, ${bad} below WCAG AA`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
