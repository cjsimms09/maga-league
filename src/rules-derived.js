'use strict';
/* THE RULES PAGE, DERIVED FROM THE IMPORTED SLEEPER CONFIG.
 *
 * WHY THIS EXISTS. The rules page carried a hand-maintained copy of the scoring
 * table and the roster shape, and it had drifted from the league it describes in
 * four places at once:
 *   - "28-34 points allowed: 1"  — Sleeper says -1.0. A SIGN ERROR, so the page
 *     told you a bad defensive week EARNED a point when it costs one.
 *   - the 21-27 bracket was missing entirely (Sleeper: 0.0), leaving a visible
 *     hole between 20 and 28 that reads as an oversight in the league rules.
 *   - the roster table omitted TE — an actual STARTING POSITION, absent from the
 *     list of starting positions.
 *   - it listed IR: 1, which this league does not have.
 *
 * None of those is exotic. They are what a second copy always does: the league
 * changed, the config was re-imported, and the hand-written table stayed where it
 * was. The tenth instance of the two-places disease this week.
 *
 * So the page no longer holds numbers. It holds a DERIVATION of the numbers from
 * `draft/config/league_config.json`, which is the object Sleeper actually
 * populates. A future rules change reaches the page by re-importing the config,
 * and if it does not, the test beside this file fails.
 *
 * DISPLAY DECISIONS STAY B'S. This module returns rows, labels and values — not
 * markup, ordering-for-aesthetics, or grouping choices beyond what the scoring
 * keys already imply.
 */
const fs = require('fs');
const path = require('path');

const CONFIG = path.join(__dirname, '..', 'draft', 'config', 'league_config.json');

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
}

/* Sleeper's scoring keys are terse and ordered by nothing in particular. This maps
 * the ones a human reads on a rules page to their label, in the order a human
 * expects to read them. A key ABSENT from this map is simply not displayed — it is
 * not dropped from scoring, it is just not one of the headline numbers. A key
 * absent from the CONFIG is skipped entirely rather than rendered as zero, because
 * "we do not score this" and "this scores 0" are different claims. */
const LABELS = {
  passing: [
    ['pass_yd', 'Passing yards (per yard)'],
    ['pass_td', 'Passing TD'],
    ['pass_int', 'Interception thrown'],
    ['pass_2pt', '2-point conversion (pass)'],
  ],
  rushing: [
    ['rush_yd', 'Rushing yards (per yard)'],
    ['rush_td', 'Rushing TD'],
    ['rush_2pt', '2-point conversion (rush)'],
  ],
  receiving: [
    ['rec', 'Reception'],
    ['rec_yd', 'Receiving yards (per yard)'],
    ['rec_td', 'Receiving TD'],
    ['rec_2pt', '2-point conversion (catch)'],
  ],
  misc: [
    ['fum_lost', 'Fumble lost'],
    ['fum_rec_td', 'Fumble recovery TD'],
  ],
  kicking: [
    ['fgm_0_19', 'FG made 0-19'], ['fgm_20_29', 'FG made 20-29'],
    ['fgm_30_39', 'FG made 30-39'], ['fgm_40_49', 'FG made 40-49'],
    ['fgm_50p', 'FG made 50+'], ['fgm', 'FG made'],
    ['xpm', 'Extra point made'], ['fgmiss', 'FG missed'], ['xpmiss', 'Extra point missed'],
  ],
  defense: [
    ['def_td', 'Defensive TD'], ['def_st_td', 'Special-teams TD'],
    ['pts_allow_0', '0 points allowed'],
    ['pts_allow_1_6', '1-6 points allowed'],
    ['pts_allow_7_13', '7-13 points allowed'],
    ['pts_allow_14_20', '14-20 points allowed'],
    // The bracket the hand-written table forgot. It scores ZERO, and showing a
    // zero is the point: a gap between 20 and 28 reads as a mistake in the rules.
    ['pts_allow_21_27', '21-27 points allowed'],
    ['pts_allow_28_34', '28-34 points allowed'],
    ['pts_allow_35p', '35+ points allowed'],
    ['sack', 'Sack'], ['int', 'Interception'], ['fum_rec', 'Fumble recovery'],
    ['safe', 'Safety'], ['blk_kick', 'Blocked kick'],
  ],
};

const GROUP_TITLES = {
  passing: 'Passing', rushing: 'Rushing', receiving: 'Receiving',
  misc: 'Miscellaneous', kicking: 'Kicking', defense: 'Defense / ST',
};

function fmt(v) {
  // Integers read as integers; a half-PPR 0.5 must not render as "1".
  return Number.isInteger(v) ? String(v) : String(v);
}

/** Scoring table as { 'Defense / ST': [[label, value], ...], ... }, derived. */
function scoringTable(cfg) {
  const sc = (cfg || loadConfig()).scoring || {};
  const out = {};
  Object.keys(LABELS).forEach(group => {
    const rows = [];
    LABELS[group].forEach(pair => {
      const key = pair[0], label = pair[1];
      if (!(key in sc)) return;              // not scored here — say nothing
      rows.push([label, fmt(sc[key])]);
    });
    if (rows.length) out[GROUP_TITLES[group]] = rows;
  });
  return out;
}

/* Roster table, derived from roster_slots. FLEX is spelled out because "FLEX"
 * alone does not say which positions are eligible, and that is the one roster
 * fact people actually ask about. */
const SLOT_LABELS = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DEF: 'DEF',
  FLEX: 'WR/RB/TE (Flex)', SUPER_FLEX: 'QB/WR/RB/TE (Superflex)',
  REC_FLEX: 'WR/TE (Flex)', BN: 'Bench', IR: 'IR', TAXI: 'Taxi',
};
const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'REC_FLEX', 'SUPER_FLEX',
                    'DEF', 'K', 'BN', 'IR', 'TAXI'];

/** Roster as [[label, count], ...] in reading order. Only slots this league has. */
function rosterTable(cfg) {
  const slots = (cfg || loadConfig()).roster_slots || {};
  const rows = [];
  SLOT_ORDER.forEach(k => {
    if (!slots[k]) return;                   // absent or zero -> not a slot we have
    rows.push([SLOT_LABELS[k] || k, slots[k]]);
  });
  // Anything Sleeper adds that this file has not met yet still shows, rather than
  // vanishing silently — an unknown slot is information, not noise.
  Object.keys(slots).sort().forEach(k => {
    if (SLOT_ORDER.indexOf(k) === -1 && slots[k]) rows.push([SLOT_LABELS[k] || k, slots[k]]);
  });
  return rows;
}

module.exports = { loadConfig, scoringTable, rosterTable, LABELS, SLOT_LABELS };
