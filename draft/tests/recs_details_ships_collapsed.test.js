// TERRITORY: B
/* "THE PICK" WAS 3476PX TALL AND BURIED SIX PANELS BELOW IT — E's war-room
 * draft-value audit, finding 1, 2026-08-21: "everything the card explains
 * BELOW that — reasoning detail, alternates, breakdowns — is what's pushing
 * the page length out... this is squarely B's rendering territory and a
 * design call." Cory, 2026-08-21: "fix it."
 *
 * THE ACTUAL DEFECT: app.js's own initDisclosures() (2026-08-17) documents
 * the intended default in its own comment — "The ranked list... ship
 * COLLAPSED — the fold belongs to the one answer... Default stays the
 * shell's (collapsed); only a recorded choice differs." The EJS markup for
 * #recs-details had `open` hardcoded, contradicting the JS that assumes it.
 * Measured live before the fix: #recs-details alone was 1659 of #recs-card's
 * 2995px (55%). Fixed by removing `open`; live-verified after: #recs-card
 * drops to 1374px and #model-compare-card moves 1621px closer to the fold.
 *
 * Run: node draft/tests/recs_details_ships_collapsed.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const EJS = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

const i = EJS.indexOf('id="recs-details"');
ck('CONTROL — #recs-details is findable in warroom.ejs at all', i >= 0);

const tagStart = EJS.lastIndexOf('<details', i);
const tagEnd = EJS.indexOf('>', i);
const tag = EJS.slice(tagStart, tagEnd + 1);
ck('#recs-details does NOT hardcode `open` — it ships collapsed, agreeing '
   + 'with initDisclosures()\'s own stated default rather than fighting it',
  !/\bopen\b/.test(tag), tag);

ck('the summary still names what is being collapsed, so a reader knows '
   + 'there is more without opening it',
  /<summary>Ranked shortlist/.test(EJS));

// The tier-cliff disclosure was ALREADY correct (measured 31px, i.e.
// collapsed) — pinned here too so a future edit cannot regress it silently
// alongside recs-details.
const tcStart = EJS.indexOf('id="tier-cliff-wrap"');
const tcTagStart = EJS.lastIndexOf('<details', tcStart);
const tcTagEnd = EJS.indexOf('>', tcStart);
const tcTag = EJS.slice(tcTagStart, tcTagEnd + 1);
ck('#tier-cliff-wrap (the sibling disclosure initDisclosures() also names) '
   + 'stays collapsed too',
  tcTagStart >= 0 && !/\bopen\b/.test(tcTag), tcTag);

// initDisclosures() must still be the mechanism that can OPEN it back up —
// this fix must not have accidentally made the disclosure permanently inert.
const idI = APP.indexOf('function initDisclosures()');
const idJ = APP.indexOf('\n  }', idI);
const idBody = APP.slice(idI, idJ);
ck('initDisclosures() still wires #recs-details into the persisted-choice '
   + 'mechanism (a tap must still be able to reopen it and have that stick)',
  /'recs-details'/.test(idBody) && /el\.open = !!saved\[id\]/.test(idBody)
    && /addEventListener\('toggle'/.test(idBody));

console.log(`\n${pass}/${pass + fail} recs-details-ships-collapsed checks passed`);
if (fail) process.exit(1);
