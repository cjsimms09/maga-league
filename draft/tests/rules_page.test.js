'use strict';
/* THE RULES PAGE MUST AGREE WITH THE LEAGUE IT DESCRIBES.
 *
 * The page keeps hand-written LABELS on purpose — "25 yds = 1 pt" reads better
 * than "Passing yards (per yard) 0.04", and phrasing is B's call. What it may not
 * keep is its own NUMBERS. It had drifted from the imported Sleeper config in
 * four places at once (2026-08-10):
 *   - 28-34 points allowed showed 1; Sleeper says -1.0. A SIGN ERROR, so the page
 *     claimed a bad defensive week EARNED a point when it costs one.
 *   - the 21-27 bracket was missing (Sleeper: 0.0), leaving a visible hole.
 *   - the roster table omitted TE, an actual starting position.
 *   - it listed IR: 1, which this league does not have.
 *
 * Two copies of a fact are only safe when something forces them to agree. This is
 * that something: values are mapped to their Sleeper keys and compared. Labels are
 * free; numbers are not.
 *
 * Run: node draft/tests/rules_page.test.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SEED = require(path.join(ROOT, 'src', 'seed-data.js'));
const R = require(path.join(ROOT, 'src', 'rules-derived.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const cfg = R.loadConfig();
const sc = cfg.scoring || {};

/* Displayed DEF label -> the Sleeper key it claims to describe. Only rows whose
 * value is a bare number are checked; a row like "25 yds = 1 pt" is prose about a
 * rate and is checked separately below. */
const DEF_KEYS = {
  'TD': 'def_td',
  '0 points allowed': 'pts_allow_0',
  '1-6 points allowed': 'pts_allow_1_6',
  '7-13 points allowed': 'pts_allow_7_13',
  '14-20 points allowed': 'pts_allow_14_20',
  '21-27 points allowed': 'pts_allow_21_27',
  '28-34 points allowed': 'pts_allow_28_34',
  '35+ points allowed': 'pts_allow_35p',
  'Sack': 'sack',
  'Interception': 'int',
  'Fumble Recovery': 'fum_rec',
  'Safety': 'safe',
  'Blocked Kick': 'blk_kick',
};

const defRows = SEED.SCORING['Defense / ST'] || [];
Object.keys(DEF_KEYS).forEach(label => {
  const key = DEF_KEYS[label];
  if (!(key in sc)) return;                 // league does not score it
  const row = defRows.find(r => r[0] === label);
  ck('DEF "' + label + '" is on the page', !!row,
     'Sleeper scores ' + key + ' = ' + sc[key] + ' but the page never mentions it');
  if (row) {
    ck('DEF "' + label + '" matches Sleeper',
       Number(row[1]) === Number(sc[key]),
       'page ' + row[1] + ' vs Sleeper ' + sc[key]);
  }
});

// EVERY pts_allow bracket Sleeper defines must appear. A missing bracket reads as
// a gap in the league rules, which is how 21-27 went unnoticed.
Object.keys(sc).filter(k => k.startsWith('pts_allow_')).forEach(k => {
  const label = Object.keys(DEF_KEYS).find(l => DEF_KEYS[l] === k);
  ck('scoring bracket ' + k + ' is displayed',
     !!(label && defRows.find(r => r[0] === label)),
     'Sleeper defines it at ' + sc[k] + ' — the page must not silently omit a bracket');
});

// Simple scalar checks for the other groups where the page shows a bare number.
[['Passing', 'Passing TD', 'pass_td'], ['Passing', 'Interception', 'pass_int'],
 ['Rushing', 'Rushing TD', 'rush_td'], ['Rushing', 'Fumble Lost', 'fum_lost'],
 ['Receiving', 'Reception', 'rec'], ['Receiving', 'Receiving TD', 'rec_td'],
].forEach(t => {
  const rows = SEED.SCORING[t[0]] || [];
  const row = rows.find(r => r[0] === t[1]);
  if (!row || !(t[2] in sc)) return;
  ck(t[0] + ' "' + t[1] + '" matches Sleeper',
     Number(row[1]) === Number(sc[t[2]]),
     'page ' + row[1] + ' vs Sleeper ' + sc[t[2]]);
});

// ── ROSTER: the shape must be the league's shape ────────────────────────────
const derivedRoster = R.rosterTable(cfg);
const seedRoster = SEED.ROSTER;
ck('the roster table matches the derived Sleeper shape exactly',
   JSON.stringify(seedRoster) === JSON.stringify(derivedRoster),
   'page ' + JSON.stringify(seedRoster) + '\n           derived ' + JSON.stringify(derivedRoster));

// And say the specific thing that was wrong, so a regression names itself.
const starters = cfg.starters || {};
Object.keys(starters).forEach(pos => {
  if (!starters[pos]) return;
  const shown = seedRoster.some(r => r[0] === pos || r[0].indexOf(pos) === 0
    || (pos === 'FLEX' && /Flex/.test(r[0])));
  ck('starting position ' + pos + ' appears in the roster table', shown,
     'a STARTING position missing from the list of starting positions');
});

console.log('\n' + pass + '/' + (pass + fail) + ' rules-page checks passed');
process.exit(fail ? 1 : 0);
