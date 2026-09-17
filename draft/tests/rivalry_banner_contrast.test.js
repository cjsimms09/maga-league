'use strict';
// THE RIVALRY BANNER MUST BE READABLE — measured, not eyeballed.
//
// Cory, 2026-09-17: "Font on rivalry game on home page needs fixed.. can't read
// it." He could not. The site flipped from a dark theme to a light one, an
// override layer converted the chrome that had been hardcoded for dark, and
// this banner was missed: white text on a #f2f1ec panel.
//
//     .riv-banner-name      #ffffff  1.13:1
//     .riv-banner-blurb     #dfe6f5  1.11:1
//     tone-friendship name  #9bf0c0  1.19:1   <- live that week
//
// WCAG AA wants 4.5:1 for body text and 3:1 for large. Everything was under the
// large-text floor, so "can't read it" was literal rather than a preference.
//
// ⚠️ THIS PARSES THE REAL STYLESHEET AND COMPUTES THE REAL RATIO. A test that
// asserted "the colour is #12294a" would pin today's answer and pass forever
// while the PANEL moved underneath it — which is exactly how a dark-theme colour
// survived a theme change. What must hold is the RELATIONSHIP.
//
// Run: node draft/tests/rivalry_banner_contrast.test.js

const fs = require('fs');
const path = require('path');
const RAW = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'css', 'style.css'), 'utf8');
// ⚠️ COMMENTS ARE STRIPPED BEFORE ANY RULE IS PARSED, and this too was a live
// false negative: every rule here documents its measured ratio in a trailing
// `/* 15.50:1 */`, and that comment sits between the previous `}` and the next
// selector — so an exact selector match saw "/* 7.93:1 */ .riv-banner-record"
// and reported the rule ABSENT. Four of six lines came back null against a
// stylesheet that declares all six.
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
                            : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : ''))); };

// ── colour maths (WCAG 2.x relative luminance) ──────────────────────────────
function hex(h) {
  h = h.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function lum(h) {
  const [r, g, b] = hex(h).map(v => v / 255).map(c =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// CONTROL: the maths must reproduce known WCAG values before any verdict below
// is worth anything (rule 3e — a checker that has never returned a known answer
// has not been tested, only run).
ck('CONTROL: black on white is 21:1', Math.abs(ratio('#000000', '#ffffff') - 21) < 0.01);
ck('CONTROL: white on white is 1:1', Math.abs(ratio('#ffffff', '#ffffff') - 1) < 0.01);
ck('CONTROL: #767676 on white is the documented 4.54:1',
   Math.abs(ratio('#767676', '#ffffff') - 4.54) < 0.02, ratio('#767676', '#ffffff'));

// ── read the palette and the banner rules OUT OF THE FILE ───────────────────
function cssVar(name) {
  const m = CSS.match(new RegExp('--' + name + '\\s*:\\s*(#[0-9a-fA-F]{3,6})'));
  return m ? m[1] : null;
}
const PANEL_SOFT = cssVar('panel-soft');
ck('the banner ground --panel-soft is readable from the stylesheet', !!PANEL_SOFT, PANEL_SOFT);

/** resolve `var(--x)` or a literal hex from a declaration's value */
function resolve(v) {
  const varM = v.match(/var\(--([a-z-]+)\)/);
  if (varM) return cssVar(varM[1]);
  const hexM = v.match(/#[0-9a-fA-F]{3,6}/);
  return hexM ? hexM[0] : null;
}
/**
 * The LAST `color:` declared for a selector EXACTLY (later rules win).
 *
 * ⚠️ THIS IS THE SECOND VERSION AND THE FIRST ONE FAILED THE BOARD.
 * v1 matched the selector as a SUBSTRING, so `.riv-banner-name` also matched
 * `.riv-banner.tone-german .riv-banner-name` — a tone-scoped override that sits
 * on a dark flag and is CORRECTLY white. The test reported seven failures
 * against a stylesheet that was already fixed. Rule 3f: the probe written to
 * answer a question returned confident, plausible, wrong output.
 *
 * So: split the rule's selector LIST on commas and require an exact match. A
 * descendant rule is a different rule and is checked separately, on its own
 * ground.
 */
function colorOf(selector, css = CSS) {
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m, found = null;
  while ((m = re.exec(css))) {
    if (!m[1].split(',').some(s => s.trim() === selector)) continue;
    const c = m[2].match(/(?:^|;)\s*color\s*:\s*([^;]+)/);
    if (c) found = resolve(c[1]);
  }
  return found;
}

// CONTROL (rule 3f) — the parser answers three cases whose answers are known
// BEFORE it is allowed to judge the real stylesheet. The middle one is the bug
// that shipped in v1 of this file; the last one is the behaviour that bug was
// trying to have.
const FIXTURE = `
  .a { color: #111111; }
  .a { color: #222222; }
  .wrap .a { color: #ffffff; }
  .b, .a { color: #333333; }
  .c { background: #444444; }
  .d { color: #555555; }  /* a trailing ratio comment, as every real rule has */
  .e { color: #666666; }
`.replace(/\/\*[\s\S]*?\*\//g, '');
ck('CONTROL: parser takes the LAST matching declaration',
   colorOf('.a', FIXTURE) === '#333333', colorOf('.a', FIXTURE));
ck('CONTROL: parser IGNORES a descendant-scoped override (the v1 bug)',
   colorOf('.a', FIXTURE) !== '#ffffff', colorOf('.a', FIXTURE));
ck('CONTROL: parser honours a selector inside a comma LIST',
   colorOf('.b', FIXTURE) === '#333333', colorOf('.b', FIXTURE));
ck('CONTROL: a rule with no color: yields null, not a background',
   colorOf('.c', FIXTURE) === null, colorOf('.c', FIXTURE));
ck('CONTROL: a rule FOLLOWING a trailing comment is still found (the v2 bug)',
   colorOf('.e', FIXTURE) === '#666666', colorOf('.e', FIXTURE));

// Body text needs 4.5; the name is 1.55rem/900 which is "large" -> 3.0.
const CASES = [
  ['.riv-banner-name', 3.0],
  ['.riv-banner-tag', 4.5],
  ['.riv-banner-record', 4.5],
  ['.riv-banner-note', 4.5],
  ['.riv-banner-blurb', 4.5],
  ['.riv-banner-link', 4.5],
];
for (const [sel, need] of CASES) {
  const c = colorOf(sel);
  ck(`${sel} resolves to a colour`, !!c, c);
  if (!c) continue;
  const r = ratio(c, PANEL_SOFT);
  ck(`${sel} is readable on the panel (${r.toFixed(2)}:1, needs ${need})`, r >= need, { color: c, ratio: +r.toFixed(2) });
}

// Per-tone headline colours — the one that was live when Cory complained is in here.
const TONES = ['grudge', 'lovehate', 'friendship', 'rivalry'];
for (const tone of TONES) {
  const m = CSS.match(new RegExp('\\.riv-banner\\.tone-' + tone + '\\s+\\.riv-banner-name\\s*\\{([^}]*)\\}'));
  ck(`tone-${tone} declares a headline colour`, !!m, tone);
  if (!m) continue;
  const c = resolve((m[1].match(/color\s*:\s*([^;]+)/) || [])[1] || '');
  const r = c ? ratio(c, PANEL_SOFT) : 0;
  ck(`tone-${tone} headline is readable (${r.toFixed(2)}:1, needs 3.0)`, r >= 3.0, { color: c, ratio: +r.toFixed(2) });
}

// ── the German tone is the exception, and it has to earn it ─────────────────
// Its ground really is dark, so white text is correct there — but the bottom of
// the flag is GOLD, and that is where the blurb and link sit. The overlay's
// lower stop is what makes it legible; if someone lightens it back, this fails.
const german = CSS.match(/\.riv-banner\.tone-german\s*\{([^}]*)\}/);
ck('tone-german declares its flag background', !!german);
if (german) {
  const stops = [...german[1].matchAll(/rgba\(0,\s*0,\s*0,\s*\.(\d+)\)/g)].map(m => Number('0.' + m[1]));
  ck('tone-german has two black-overlay stops', stops.length === 2, stops);
  const bottom = stops[stops.length - 1];
  // gold #f5c445 under `bottom` black, white text on top
  const eff = hex('#f5c445').map(v => Math.round(v * (1 - bottom)));
  const effHex = '#' + eff.map(v => v.toString(16).padStart(2, '0')).join('');
  const r = ratio('#ffffff', effHex);
  ck(`tone-german: white over the GOLD band is readable (${r.toFixed(2)}:1, needs 4.5)`,
     r >= 4.5, { bottomOverlay: bottom, effective: effHex, ratio: +r.toFixed(2) });
  // its gold accents (eyebrow/tag/link) sit on the same band and are not white
  const accent = colorOf('.riv-banner.tone-german .riv-banner-link');
  const ra = accent ? ratio(accent, effHex) : 0;
  ck(`tone-german: the gold accent is readable over the band (${ra.toFixed(2)}:1, needs 4.5)`,
     ra >= 4.5, { color: accent, ratio: +ra.toFixed(2) });
}

// ── the regression this whole file exists for ───────────────────────────────
// Scoped to the BASE rules: `.riv-banner.tone-german .riv-banner-name` is white
// on purpose, because its ground really is dark. Only an unscoped rule is a bug.
const baseWhite = (css) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(m =>
  m[1].split(',').some(s => /^\.riv-banner-(name|record|note|blurb|tag)$/.test(s.trim()))
  && /color:\s*#(fff|ffffff|dfe6f5|c6cfe0)\b/.test(m[2])).map(m => m[1].trim());

// CONTROL (rule 3e) — this asserts an ABSENCE, and an absence from a detector
// that cannot detect is worth nothing. Show it firing on the exact CSS that was
// live when Cory said he could not read it, and staying quiet on the German
// rule that is white for a reason.
ck('CONTROL: the white-text detector FIRES on the pre-fix stylesheet',
   baseWhite('.riv-banner-name { color: #fff; }').length === 1);
ck('CONTROL: … and does NOT fire on the legitimate tone-german override',
   baseWhite('.riv-banner.tone-german .riv-banner-name { color: #fff; }').length === 0);

ck('NO unscoped banner rule still carries a bare white/near-white text colour',
   baseWhite(CSS).length === 0, baseWhite(CSS));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
