/* THE WAR ROOM IS DARK; A HARDCODED LIGHT-THEME INK LITERAL IS INVISIBLE ON IT.
 *
 * THE DEFECT, found live 2026-08-19 by actually looking at the page, not by
 * reading the code: `.ss-seat { color: #17263a; }` (system-strip's "seat 8"
 * text) rendered as dark-navy-on-dark-navy — a real screenshot at Cory's own
 * 1680px viewport showed "seat 8" essentially unreadable next to the MANUAL
 * badge. `body.warroom-page` redefines `--ink` to a light color for exactly
 * this reason (`#e9eef6` — see warroom.css's own `:root` override), but 45
 * separate rules across style.css spelled the LIGHT-THEME ink value out as
 * the literal `#17263a` instead of `var(--ink)`, so none of them picked up
 * the dark-theme override. Fixed by replacing every one with `var(--ink)`
 * (verified live via Playwright on four war-room tabs afterward — every
 * affected selector's computed color moved from rgb(23,38,58) to
 * rgb(233,238,246) — and confirmed unchanged on the light-themed home page,
 * where `--ink` resolves to the same dark navy the literal used to hardcode).
 *
 * WHAT THIS GUARDS: the literal never creeps back in — a new rule copy-pasted
 * from an old one, or written against the light theme without noticing the
 * page it will actually render on is dark.
 *
 * Run: node draft/tests/warroom_dark_ink.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

/* Case-insensitive, tolerant of the property being multi-line or having other
 * declarations on the same line before/after — matches the exact bug shape:
 * a `color:` declaration whose value is a bare light-theme hex literal
 * instead of a theme-aware token. */
const HARDCODED_INK_RE = /color\s*:\s*#17263a\b/gi;

const STYLE_CSS = path.join(ROOT, 'public', 'css', 'style.css');
const WARROOM_CSS = path.join(ROOT, 'public', 'css', 'warroom.css');

// ── FAIL ARM FIRST (rule 3e/3f): prove the detector can catch a real
// positive before trusting it found none in the live files ─────────────────
{
  const bad = '.some-rule { font-weight: 700; color: #17263a; margin: 0; }';
  const good = '.some-rule { font-weight: 700; color: var(--ink); margin: 0; }';
  ck('FAIL ARM — the detector DOES catch the exact defect shape in a synthetic snippet',
    HARDCODED_INK_RE.test(bad));
  HARDCODED_INK_RE.lastIndex = 0;
  ck('CONTROL — the theme-aware replacement does NOT trip the detector',
    !HARDCODED_INK_RE.test(good));
  HARDCODED_INK_RE.lastIndex = 0;
}

// ── the real files, now ──────────────────────────────────────────────────
{
  const css = fs.readFileSync(STYLE_CSS, 'utf8');
  const hits = css.match(HARDCODED_INK_RE) || [];
  ck('style.css carries no hardcoded #17263a ink literal — every one is var(--ink) now',
    hits.length === 0, hits.length);
}
{
  const css = fs.readFileSync(WARROOM_CSS, 'utf8');
  const hits = css.match(HARDCODED_INK_RE) || [];
  ck('warroom.css carries no hardcoded #17263a ink literal either',
    hits.length === 0, hits.length);
}

// ── the mechanism the fix relies on: --ink really is redefined for dark ────
{
  const css = fs.readFileSync(WARROOM_CSS, 'utf8');
  const m = /body\.warroom-page\s*\{[^}]*--ink:\s*([^;]+);/.exec(css);
  ck('body.warroom-page still redefines --ink (the override var(--ink) now depends on)',
    !!m, css.slice(0, 0));
  if (m) {
    ck('  ...to something that is NOT the light-theme literal (still a real override, not a no-op)',
      m[1].trim().toLowerCase() !== '#17263a');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
