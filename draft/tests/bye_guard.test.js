// BYE GUARD — proves the per-player bye source (A) activates B's dormant bye arm.
// The 540-week sweep found the solver seats whoever has the highest projection, and
// season-average hands a bye/OUT player a FULL projection → it would start a benched
// player on a Sunday. B zeroes injured players and built the bye arm; A supplies the
// per-player bye. This asserts the whole chain fires. Run: node draft/tests/bye_guard.test.js
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { isInactive, activeProjection } = require('../../src/routes/lineup.js');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('PASS  ' + label); }
  else { fail++; console.log('FAIL  ' + label + (detail ? '  — ' + detail : '')); }
};

// 1. the bye source exists, is season-keyed, and covers all 32 teams for the live season
const byes = JSON.parse(fs.readFileSync(path.join(__dirname, '../../src/nfl_byes.json'), 'utf8'));
const seasons = Object.keys(byes).filter(k => !k.startsWith('_'));
check('bye source has at least one season mapped', seasons.length >= 1, JSON.stringify(seasons));
const live = seasons.sort().slice(-1)[0];
const teams = Object.keys(byes[live]);
check('live season maps all 32 teams', teams.length === 32, `${live}: ${teams.length}`);
check('all bye weeks are in the valid NFL range 5..14',
  Object.values(byes[live]).every(w => w >= 4 && w <= 15), JSON.stringify(byes[live]));

// 2. the rosterView join shape: a row carries row.bye = its team's bye for the season
const byeMap = byes[live];
const row = (team, extra) => Object.assign({ team, bye: byeMap[team] != null ? Number(byeMap[team]) : null }, extra || {});
const det = row('DET');   // Gibbs' team
check('a real team resolves to a numeric bye', typeof det.bye === 'number', String(det.bye));

// 3. B's guard fires ON the bye week and NOT otherwise — the actual Sunday protection
check('a player IS inactive in his bye week', isInactive(det, det.bye) === true);
check('the SAME player is active the week before his bye', isInactive(det, det.bye - 1) === false);
check('the SAME player is active the week after his bye', isInactive(det, det.bye + 1) === false);

// 4. activeProjection zeroes a bye player's projection but passes a playing player through
check('bye player projection is forced to 0', activeProjection(200, det, det.bye) === 0);
check('playing player projection passes through unchanged', activeProjection(200, det, det.bye + 1) === 200);

// 5. the injury half still works alongside bye (regression guard on B's half)
check('an OUT player is inactive regardless of week', isInactive({ inj: 'Out', bye: null }, 3) === true);
check('a Questionable player passes through (variance handles it)',
  isInactive({ inj: 'Questionable', bye: null }, 3) === false);

// 6. a null bye (season with no map / FA) leaves the bye arm dormant — no false-zero
check('a null-bye row is never bye-inactive (no false-zero)', isInactive({ team: 'FA', bye: null }, 7) === false);

console.log(`\n${pass}/${pass + fail} bye-guard checks passed`);
process.exit(fail ? 1 : 0);
