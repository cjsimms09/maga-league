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

// The strongest form of "nothing fixed covers a control": the war room hides the
// fixed bottom tab bar entirely, so it can never sit over the Take button (it did,
// at 804px) or the arm alert. This lives OUTSIDE a media block (specificity beats
// the ≤700px .tabbar{display:flex}); assert against the whole sheet.
ck('the war room hides the fixed bottom tab bar',
  /body\.warroom-page\s+\.tabbar\s*\{[^}]*display:\s*none/.test(css),
  'tab bar not hidden on warroom — a fixed element can cover a control again');

// Hiding both chrome bars is only safe if a way out remains: the shell must carry
// an always-visible exit link (not buried in the collapsed Details section).
const shell = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
ck('the war-room shell keeps an always-visible exit link',
  /class="wr-exit"[^>]*href="\/"|href="\/"[^>]*class="wr-exit"/.test(shell),
  'no wr-exit link — hiding the chrome would strand a standalone PWA user');

// app.js unhides #search-tail before it knows whether there's anything to add, so
// an available-player search leaves a blank box. It must collapse when empty.
ck('#search-tail collapses when it has no content',
  /#search-tail:empty\s*\{[^}]*display:\s*none/.test(css),
  'empty search tail not collapsed — a blank box shows on an available-player search');

// DECLUTTER GUARD (Cory "too busy"): the recommendation must sit ABOVE THE PLAN
// and WATCH in the flex order — a future shell edit that pushes it back down
// (rec was buried 416px on main) fails here. Parse the .wr-zone1 > #X { order: N }.
const orderOf = id => { const m = css.match(new RegExp('\\.wr-zone1\\s*>\\s*#' + id + '\\s*\\{[^}]*order:\\s*(\\d+)')); return m ? Number(m[1]) : null; };
const recOrd = orderOf('recs-card'), planOrd = orderOf('doctrine-banner'), watchOrd = orderOf('legality-strip');
ck('the recommendation is ordered ABOVE THE PLAN and WATCH (rec-to-top)',
  recOrd != null && planOrd != null && watchOrd != null && recOrd < planOrd && recOrd < watchOrd,
  `recs:${recOrd} plan:${planOrd} watch:${watchOrd} — rec must be the smallest`);

// The duplicate MVS surface stays hidden on the war room (it restated four other
// surfaces; 302px of noise Cory flagged).
ck('the duplicate MVS surface is hidden on the war room',
  /body\.warroom-page\s+#mvs\s*\{[^}]*display:\s*none/.test(css),
  'MVS no longer hidden — the 302px duplicate is back on the decide surface');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
