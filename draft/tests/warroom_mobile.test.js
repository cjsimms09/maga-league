'use strict';
// WAR-ROOM MOBILE FURNITURE — a source guard for the rule Cory set after the
// pick bar floated mid-screen and the arm button covered the nav (3rd report):
// on a phone (≤700px, where the fixed bottom tab bar exists) nothing in the war
// room may float over content or the nav. The pinned strips must drop to normal
// document flow, and the arm button must be in-flow too. This can't run a real
// browser in CI, so it asserts the CSS invariant at the source: a regression
// that makes these fixed/sticky again on mobile fails here instead of on a phone.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

// Pull the bodies of every `@media (max-width: <=700px)` block — that's where the
// tab bar exists and where the anti-collision overrides must live.
function mobileBlocks() {
  const out = [];
  const re = /@media\s*\(max-width:\s*(\d+)px\)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    if (Number(m[1]) > 700) continue;
    // balance braces from the block open to find its body
    let i = m.index + m[0].length, depth = 1, start = i;
    for (; i < css.length && depth; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    out.push(css.slice(start, i - 1));
  }
  return out;
}
const mobile = mobileBlocks().join('\n');

// Each pinned strip must be forced to static in a mobile block.
for (const sel of ['.wr-statusbar', '.doctrine-banner', '.doctrine-switch', '.legality-strip']) {
  const re = new RegExp(sel.replace('.', '\\.') + '[^{}]*(,[^{}]*)*\\{[^}]*position:\\s*static', '');
  ck(`${sel} is static (normal flow) on mobile`, re.test(mobile), 'not forced static in a ≤700px block');
}

// The arm button must be in normal flow on mobile (not a floating FAB).
ck('.wr-arm is static (in-flow) on mobile',
  /\.wr-arm[^{}]*\{[^}]*position:\s*static/.test(mobile), 'still floating on mobile');

// And it must NOT be left position:fixed inside a mobile block (the old bug).
ck('.wr-arm is not position:fixed inside any mobile block',
  !/\.wr-arm[^{}]*\{[^}]*position:\s*fixed/.test(mobile));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
