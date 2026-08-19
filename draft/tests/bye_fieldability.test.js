// TERRITORY: B
/* BYE-WEEK FIELDABILITY WARNING — register 59 item (4) (ROUTES.md 08-19):
 * "if the roster cannot fill a starting slot in some week once byes are
 * applied, say so on screen." Built directly off tonight's item-(1)
 * reproduction — a 10-seed realistic-opponent simulation at Cory's real
 * schedule/keepers found 10 of 10 rosters had at least one such week, week 6
 * in all ten (Ja'Marr Chase's own bye colliding with the engine's single
 * rostered QB, whose bye lands on 6 in 9 of 10 seeds).
 *
 * Run: node draft/tests/bye_fieldability.test.js
 */
'use strict';
const B = require('../../public/js/draft/bye_fieldability.js');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };
const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
const STARTERS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 };

// ── the exact regression this feature exists to catch ───────────────────────
{
  // A realistic 15-man roster from tonight's register-59 reproduction (seed 2):
  // Chase (WR, bye 6) and the lone QB (bye 6) collide on week 6.
  const roster = [
    { position: 'WR', bye: 6, name: 'Chase' }, { position: 'RB', bye: 13, name: 'Henry' },
    { position: 'RB', bye: 5, name: 'Walker' }, { position: 'TE', bye: 10, name: 'Loveland' },
    { position: 'RB', bye: 10, name: 'Swift' }, { position: 'RB', bye: 7, name: 'Tuten' },
    { position: 'RB', bye: 11, name: 'Stevenson' }, { position: 'WR', bye: 7, name: 'Washington' },
    { position: 'RB', bye: 10, name: 'Monangai' }, { position: 'RB', bye: 6, name: 'Mason' },
    { position: 'WR', bye: 11, name: 'Reed' }, { position: 'QB', bye: 6, name: 'Goff' },
    { position: 'RB', bye: 7, name: 'Rodriguez' }, { position: 'DEF', bye: 11, name: 'Patriots' },
    { position: 'K', bye: 7, name: 'Little' },
  ];
  ck('KNOWN-POSITIVE, from a real simulated roster: week 6 (Chase + the lone QB '
    + 'both on bye) IS flagged',
    B.unfieldableWeeks(roster, STARTERS).indexOf(6) >= 0, B.unfieldableWeeks(roster, STARTERS));
  ck('...and the warning renders it, plainly',
    /Unfieldable week/.test(B.warningHtml(roster, STARTERS, esc))
    && /week 6/.test(B.warningHtml(roster, STARTERS, esc)));
}

// ── a healthy roster renders nothing ────────────────────────────────────────
{
  // 2 QB, 4 RB, 4 WR, 2 TE, all different byes -> comfortably fieldable every week.
  const byes = [1, 2, 3, 4, 5, 7, 8, 9, 10, 12, 13, 14];
  const roster = [
    { position: 'QB', bye: byes[0] }, { position: 'QB', bye: byes[1] },
    { position: 'RB', bye: byes[2] }, { position: 'RB', bye: byes[3] },
    { position: 'RB', bye: byes[4] }, { position: 'RB', bye: byes[5] },
    { position: 'WR', bye: byes[6] }, { position: 'WR', bye: byes[7] },
    { position: 'WR', bye: byes[8] }, { position: 'WR', bye: byes[9] },
    { position: 'TE', bye: byes[10] }, { position: 'TE', bye: byes[11] },
  ];
  ck('a roster with real bench depth and staggered byes is fieldable every week',
    B.unfieldableWeeks(roster, STARTERS).length === 0, B.unfieldableWeeks(roster, STARTERS));
  ck('...so the warning is empty, not an empty shell', B.warningHtml(roster, STARTERS, esc) === '');
}

// ── FLEX pooling: dedicated depth beyond the starting slot covers FLEX ──────
{
  const roster = [
    { position: 'QB', bye: 6 },
    { position: 'RB', bye: 6 }, { position: 'RB', bye: 7 }, { position: 'RB', bye: 8 }, // 1 spare for flex
    { position: 'WR', bye: 9 }, { position: 'WR', bye: 10 },
    { position: 'TE', bye: 11 },
  ];
  ck('a 3rd RB beyond the 2 dedicated RB slots covers FLEX on a week nobody else is out',
    B.unfieldableWeeks(roster, STARTERS).indexOf(1) < 0);
  ck('but week 6 still fails — QB has no backup, and losing him costs the dedicated QB slot',
    B.unfieldableWeeks(roster, STARTERS).indexOf(6) >= 0);
}

// ── scope: K/DEF are excluded (streamable by design, matches legality.js) ──
{
  const roster = [
    { position: 'QB', bye: 1 }, { position: 'RB', bye: 1 }, { position: 'RB', bye: 1 },
    { position: 'WR', bye: 1 }, { position: 'WR', bye: 1 }, { position: 'TE', bye: 1 },
    { position: 'RB', bye: 1 },   // flex cover
    { position: 'K', bye: 6 }, { position: 'DEF', bye: 6 },  // both out week 6, nobody cares
  ];
  ck('a solo K and DEF both on bye the SAME week does NOT flag — streamed, not drafted depth',
    B.unfieldableWeeks(roster, STARTERS).indexOf(6) < 0, B.unfieldableWeeks(roster, STARTERS));
}

// ── degrade paths ────────────────────────────────────────────────────────────
ck('unfieldableWeeks on an empty roster: every week flagged (nothing to field), not a throw '
  + '— this is the RAW check; the gate below is what keeps it off the screen early',
  B.unfieldableWeeks([], STARTERS).length === 18);
ck('null roster -> no throw, degrades to the empty-roster case',
  B.unfieldableWeeks(null, STARTERS).length === 18);
ck('missing starters -> no throw (nothing required, nothing fails)',
  B.unfieldableWeeks([{ position: 'QB', bye: 1 }], null).length === 0);
ck('warningHtml on a clean roster/no starters -> empty string', B.warningHtml([], {}, esc) === '');

// ── the completeness gate: an early/incomplete roster must render NOTHING ──
{
  ck('a roster still missing a mandatory position (only keepers: WR+2RB, no QB/TE yet) '
    + 'is NOT complete',
    B.isRosterComplete(
      [{ position: 'WR' }, { position: 'RB' }, { position: 'RB' }], STARTERS) === false);
  ck('...so warningHtml renders NOTHING even though the raw check would flag every week — '
    + 'a fresh keeper-only roster is not a finding, it is "the draft is not done"',
    B.warningHtml(
      [{ position: 'WR', bye: 6 }, { position: 'RB', bye: 13 }, { position: 'RB', bye: 5 }],
      STARTERS, esc) === '');
  ck('an empty roster is also NOT complete (the extreme case of the same rule)',
    B.isRosterComplete([], STARTERS) === false);
  ck('once every dedicated position has at least one player, the roster reads complete',
    B.isRosterComplete(
      [{ position: 'QB' }, { position: 'RB' }, { position: 'WR' }, { position: 'TE' }],
      STARTERS) === true);
  ck('a position with a 0-count starter requirement is not required for completeness '
    + '(no QB slot in this league -> a QB-less roster still reads complete)',
    B.isRosterComplete(
      [{ position: 'RB' }, { position: 'WR' }, { position: 'TE' }],
      { QB: 0, RB: 1, WR: 1, TE: 1 }) === true);
}

// ── CORRECTED 08-19: the matcher moved to fieldable.js (shared with A's ────
// fieldability_probe.js, Rule 11) after this exact scenario exposed the bug
// in the first cut — a spare QB falsely covering FLEX, which this league's
// FLEX (RB/WR/TE only) does not accept.
{
  const roster = [
    { position: 'QB', bye: 1 }, { position: 'QB', bye: 2 }, // 1 spare QB
    { position: 'RB', bye: 3 }, { position: 'RB', bye: 4 }, // exactly the 2 needed, no spare
    { position: 'WR', bye: 5 }, { position: 'WR', bye: 6 }, // exactly the 2 needed, no spare
    { position: 'TE', bye: 7 },                              // exactly the 1 needed, no spare
  ];
  // Week 10: nobody on bye, every dedicated slot fillable — but FLEX has
  // nothing left except the spare QB, which is not FLEX-eligible here.
  ck('KNOWN-POSITIVE regression: a spare QB with zero real RB/WR/TE depth beyond '
    + 'dedicated need must NOT be counted as covering FLEX',
    B.unfieldableWeeks(roster, STARTERS).indexOf(10) >= 0, B.unfieldableWeeks(roster, STARTERS));
  ck('...the OLD counting matcher would have missed this (spare QB pooled into FLEX '
    + 'capacity it cannot legally fill) — this is the case that caught it',
    /week 10/.test(B.warningHtml(roster, STARTERS, esc)));
}

// ── the shared matcher is actually shared, not a second copy ───────────────
{
  const fs = require('fs');
  const path = require('path');
  const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'bye_fieldability.js'), 'utf8');
  ck('bye_fieldability.js calls the shared Fieldable matcher rather than its own count-based logic',
    /Fieldable\.fieldable|require\(.\.\/fieldable\.js.\)/.test(SRC));
  const PROBE = fs.readFileSync(path.join(__dirname, '..', 'tools', 'fieldability_probe.js'), 'utf8');
  ck('fieldability_probe.js delegates to the same shared module (Rule 11: one matcher)',
    /require\([^)]*fieldable\.js[^)]*\)/.test(PROBE));
}

// ── HTML safety ──────────────────────────────────────────────────────────────
ck('the warning HTML is built through the passed esc() (no raw injection point for player-derived strings)',
  typeof B.warningHtml([{ position: 'QB', bye: 1 }], STARTERS, esc) === 'string');

// ── wiring: app.js actually calls this near the legality strip ──────────────
{
  const fs = require('fs');
  const path = require('path');
  const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('app.js calls ByeFieldability.warningHtml, guarded against the module being absent',
    /ByeFieldability\.warningHtml/.test(SRC) && /typeof ByeFieldability !== 'undefined'/.test(SRC));
  ck('it reads the same roster/starters renderLegality() already computes, not a re-derivation',
    /renderLegality/.test(SRC));

  const SCRIPTS = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'admin', '_warroom_scripts.ejs'), 'utf8');
  ck('the module is actually loaded on the war-room page, before app.js',
    SCRIPTS.indexOf('bye_fieldability.js') > -1
    && SCRIPTS.indexOf('bye_fieldability.js') < SCRIPTS.indexOf('src="/js/draft/app.js"'));
  ck('fieldable.js (the shared matcher) loads before bye_fieldability.js, which calls it',
    SCRIPTS.indexOf('src="/js/draft/fieldable.js"') > -1
    && SCRIPTS.indexOf('src="/js/draft/fieldable.js"') < SCRIPTS.indexOf('src="/js/draft/bye_fieldability.js"'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
