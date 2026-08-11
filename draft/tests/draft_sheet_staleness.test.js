'use strict';
// THE STALE FLAG ON THE PRINTED DRAFT SHEET, AT ITS BOUNDARY.
//
// The sheet is the artifact that has to be trustworthy at a table with no wifi,
// and its only defence against being drafted off a stale board is one warning
// tied to a 6-hour threshold. That threshold was decided by a ROUNDED age:
//
//     const hrs = Math.round((Date.now() - d.getTime()) / 3.6e6);
//     ... if (hrs > 6) { rebuild before you draft off it }
//
// Math.round(6.2) is 6, and 6 > 6 is false. So the flag did not actually fire
// at six hours — it fired at six and a HALF, and in between the sheet printed
// "6h ago" with nothing to say the board was stale.
//
// draft_sheet.test.js already checks the flag against the real artifact's age,
// which is what caught this. But that check only lands on the broken half-hour
// if the suite happens to run inside it — the artifact is a committed file, so
// for most of its life the age is well clear of the boundary and the check
// passes on both sides of a threshold that is in the wrong place. This renders
// the template directly at ages chosen to sit either side of six hours, so the
// boundary is exercised every run instead of when the clock cooperates.
const fs = require('fs'), path = require('path'), ejs = require('ejs');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 240) : ''))); };

const tp = path.join(ROOT, 'views', 'admin', 'draft-sheet.ejs');
const tpl = fs.readFileSync(tp, 'utf8');

// The locals the route passes (src/routes/admin.js), with the board itself
// empty — nothing below depends on its contents, only on the age stamp.
const render = hoursAgo => ejs.render(tpl, {
  rows: [], byPos: { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] },
  builtAt: hoursAgo == null ? null : new Date(Date.now() - hoursAgo * 3.6e6).toISOString(),
  seasonYear: 2026, rounds: 15, teams: 10,
  rule: 'Best available within startable need — QB and DEF deferred — never over-draft a filled position.',
}, { filename: tp });

const warned = h => /rebuild before you draft off it/.test(render(h));
const shownAge = h => (render(h).match(/\((\d+)h ago\)/) || [])[1];

ck('the sheet renders at all', /MFGA Draft Sheet/.test(render(1)));

// ── Either side of the threshold, including the half-hour the old code missed.
ck('a board just under six hours old is not flagged', !warned(5.9), { age: 5.9 });
ck('a board just over six hours old IS flagged', warned(6.1), { age: 6.1 });
ck('  and so is one at 6.4, which used to round DOWN to six and pass silently',
  warned(6.4), { age: 6.4, shown: shownAge(6.4) });
ck('  fixture check: 6.4 hours really does still display as "6h ago"',
  shownAge(6.4) === '6', { shown: shownAge(6.4) });
ck('a clearly stale board is flagged', warned(30), { age: 30 });
ck('a fresh board is not', !warned(0.2), { age: 0.2 });

// ── The rounding that is still there is only ever a display.
ck('the age shown is the rounded hours', shownAge(3.4) === '3' && shownAge(3.6) === '4',
  { at_3_4: shownAge(3.4), at_3_6: shownAge(3.6) });

// ── No stamp at all is its own state, and must not read as fresh.
{
  const none = render(null);
  ck('a board with no age stamp says so rather than passing as current',
    /board age unknown/.test(none) && !/board built/.test(none));
}

// ── The line the sheet exists for.
ck('the paper fallback is still on the sheet', /Print the night before/.test(render(1)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
