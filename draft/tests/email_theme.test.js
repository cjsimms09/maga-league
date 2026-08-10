'use strict';
// EMAIL LEGIBILITY — the Sunday alert (and every other notification) must stay
// readable in the one surface nobody can restyle: an inbox.
//
// The shell used to be DARK (#0b0e16 ground, pale #e7eaf3 text), left over from
// before the site flipped to light. That fails UNSAFELY: several clients drop or
// override container backgrounds, and when that happens pale text lands on the
// client's white default and disappears — the white-on-white failure again, in
// the surface that arrives unprompted on a Sunday morning. Every colour must
// therefore be legible on WHITE, not merely on our own background.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const src = fs.readFileSync(path.join(ROOT, 'src', 'notify.js'), 'utf8');
// Strip comments before scanning: the fix's own documentation NAMES the old dark
// values, and a guard that trips on its own rationale is a guard nobody keeps.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const lum = h => {
  const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const contrast = (a, b) => {
  const L1 = lum(a), L2 = lum(b);
  return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100;
};

// Every TEXT colour used anywhere in the email templates.
const textColors = [...new Set((code.match(/color:#[0-9a-fA-F]{6}/g) || [])
  .map(s => s.split(':')[1].toLowerCase()))];
ck('the email templates declare text colours', textColors.length > 0, textColors.join(','));

// White text is legitimate ONLY on the solid red CTA button; every other text
// colour has to survive landing on white.
const onButton = new Set(['#ffffff']);
const failures = textColors.filter(c => !onButton.has(c) && contrast(c, '#ffffff') < 4.5)
  .map(c => `${c} (${contrast(c, '#ffffff')}:1)`);
ck('every email text colour is AA-legible on WHITE (survives a stripped background)',
  failures.length === 0, failures.join(', '));

// The specific dark-theme values that used to be here must never come back.
const banned = ['#e7eaf3', '#c7cddd', '#4ade80', '#8a92a6', '#0b0e16', '#10141d', '#ff4655'];
const returned = banned.filter(b => code.toLowerCase().includes(b));
ck('no dark-theme email colours have crept back', returned.length === 0, returned.join(', '));

// The shell itself must be light: a light ground degrades safely, a dark one does not.
ck('the email shell uses the light paper ground', /background:#f7f6f2/.test(code));
ck('the email card is white', /background:#ffffff/.test(code));

// The CTA button keeps white-on-red (a solid background it paints itself).
ck('the CTA button is white on the brand red', /background:#d4242f;color:#ffffff/.test(code));

// Sanity: the Sunday alert still composes its dollar figure and posture.
ck('the Sunday alert still prices its calls', /\$\$\{Math\.round\(c\.dollars\)\}/.test(code));
ck('the Sunday alert still leads with the posture', /CHASE|PROTECT/.test(code));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
