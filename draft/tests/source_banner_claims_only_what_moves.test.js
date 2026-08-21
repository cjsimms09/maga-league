// TERRITORY: A
/* THE BANNER IS THE ONLY THING TELLING CORY WHICH NUMBERS TO TRUST.
 *
 * E drove five sources in a real browser on 2026-08-21 and measured, across
 * Blend / Sleeper / ESPN / CBS / Draft Sharks:
 *
 *     VONA          4 distinct value-sets of 5   ✅ follows the toggle
 *     strike strip  1 of 5                       ❌ frozen
 *     cliff lines   1 of 5                       ❌ frozen
 *     +N wire       1 of 5                       ❌ frozen
 *
 * VONA moving in those same reads is the control: "frozen" is a property of the
 * field, not of the probe.
 *
 * Meanwhile the banner said "VONA, TIERS and the recommended player on THIS
 * ENTIRE PAGE now reflect only this source", while the cliff lines two inches
 * away read "next tier drops 10 / 16 / 3 / 21 / 12 / 6 pts" byte-identical under
 * every source. On ESPN that put an RB VONA chip of 56.6 beside a strike strip
 * reading "costs 35" — same question, same units, different answers — with the
 * banner vouching for both.
 *
 * ⚠️ AND THE DIVERGENCE WAS CREATED BY THE VONA FIX. Before it, all four of
 * these were equally frozen and agreed with each other. Draft Sharks and Blend
 * still agree to 0.1, which is exactly why it went unnoticed: it only bites on
 * the three sources where VONA actually moved.
 *
 * SO THIS FILE GUARDS THE HONESTY OF THE CLAIM, NOT THE FREEZE. Making the
 * cliffs and strike peaks per-source is a signature change and is filed
 * (registers 216, 226). Until that lands, the banner must not claim a scope it
 * does not have, and must NAME what stays on Draft Sharks.
 *
 * Run: node draft/tests/source_banner_claims_only_what_moves.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + String(d).slice(0, 300) : '')); }
};

/* The banner block, located by its own marker rather than by line number. */
const i = APP.indexOf('rs-warn');
ck('CONTROL — the source banner is findable in app.js at all, so the checks '
  + 'below are reading the real thing', i !== -1);
const banner = APP.slice(Math.max(0, i - 400), i + 1600);

// ── 1. IT NO LONGER CLAIMS THE FROZEN FIELDS ────────────────────────────────
ck('the banner no longer says "tiers" follow the source — the cliff lines say '
  + '"tier" and are byte-identical under every source',
!/VONA, tiers and the recommended player/.test(banner), 'the old claim is still there');

ck('and it no longer claims THIS ENTIRE PAGE, which was false for three of the '
  + 'four numbers E measured',
!/THIS ENTIRE PAGE/.test(banner), 'the page-wide claim is still there');

// ── 2. IT STILL CLAIMS WHAT IS TRUE ─────────────────────────────────────────
ck('it still says VONA follows the source — that IS true (4 distinct '
  + 'value-sets of 5) and dropping it would under-claim',
/VONA/.test(banner));
ck('and it still says the recommended player follows',
  /recommended player/.test(banner));
ck('and it still reports how many players the source does not cover, which is '
  + 'the other thing a reader cannot see for themselves',
/does not cover are OFF the board/.test(banner));

// ── 3. IT NAMES THE FROZEN FIELDS, RATHER THAN LEAVING THEM TO BE FOUND ─────
ck('the banner NAMES the tier-cliff lines as still Draft Sharks',
  /tier-cliff lines/i.test(banner), banner.slice(0, 200));
ck('...and the strike strip', /strike strip/i.test(banner));
ck('...and the "+N wire" chip', /\+N wire/.test(banner));
ck('...and says which one to believe when two disagree, because that is the '
  + 'decision a reader actually has to make mid-pick',
/the VONA chip is the/i.test(banner));

// ── 4. FAIL ARM — the check can distinguish a banner that overclaims ────────
{
  const overclaiming = 'VONA, tiers and the recommended player on THIS ENTIRE PAGE now reflect only this source';
  ck('FAIL ARM: the two assertions above really do reject the old wording, so '
    + 'they are testing the text rather than passing on anything',
  /VONA, tiers and the recommended player/.test(overclaiming)
    && /THIS ENTIRE PAGE/.test(overclaiming));
}

console.log('\n' + pass + '/' + (pass + fail) + ' banner-honesty checks passed');
process.exit(fail ? 1 : 0);
