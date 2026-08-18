/* THE FLOOR AND THE CEILING ARE COHORT STATISTICS, AND THE WAR ROOM SAID THEY
 * WERE FORECASTS.
 *
 * Register E16. `showWhy` printed "Projection 323 (floor 2, ceiling 479)" with
 * nothing to say what those two numbers are. Since 2026-08-17 they are
 * `proj_mean x the measured p10/p90 ratio of the player's (position,
 * projection-rank band) CELL` — projections.py:423-437 via
 * projection_error.proj_floor_for / proj_ceiling_for. Every player in a cell
 * carries the SAME multiple, so the number is a band statistic under one man's
 * name.
 *
 * WHY IT MATTERS AT THE BAND EDGE, on the live board:
 *
 *     QB16  Jaxson Dart   proj 328.5   floor 87.29
 *     QB17  Jordan Love   proj 322.5   floor  2.45    35.6x on a 6.0-pt gap
 *
 * Both are in their CORRECT cell — this is NOT the E1 misread, which is a
 * separate open row about players who land in the wrong one. A 2.45-point season
 * floor is not a claim about Jordan Love; it is the p10 of a cohort running down
 * to quarterbacks who never take a snap.
 *
 * This file pins the LABEL, not the number. Nothing here asserts a floor should
 * change — that question is E16, owner A.
 *
 * Run: node draft/tests/floor_is_a_cohort_not_a_forecast.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

/* Lift the two helpers out of app.js rather than re-implementing them: a private
 * copy here would pass forever while the shipped ones rotted. */
function lift(name) {
  const at = SRC.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('helper not found in app.js: ' + name);
  let i = SRC.indexOf('{', at), depth = 0, end = -1;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') depth++;
    else if (SRC[j] === '}') { depth--; if (!depth) { end = j + 1; break; } }
  }
  return SRC.slice(at, end);
}
const BANDS = SRC.slice(SRC.indexOf('var DISP_BANDS'),
  SRC.indexOf(']];', SRC.indexOf('var DISP_BANDS')) + 3);
const dispersionCaveat = new Function('state',
  BANDS + '\n' + lift('dispersionBand') + '\n' + lift('cohortRatios') + '\n'
  + lift('appliedCohort') + '\n' + lift('dispersionCaveat')
  + '\nreturn dispersionCaveat;')({});

// ---------------------------------------------------------------- 1. the wiring
ck('showWhy calls dispersionCaveat on the projection line',
  /\+ dispersionCaveat\(p, state\.board\) \+/.test(SRC));

// -------------------------------------------- 2-4. it names the cohort, not him
const love = { name: 'Jordan Love', position: 'QB', pos_rank: 17, proj_mean: 322.5,
  proj_floor: 2.45, proj_ceiling: 478.7,
  proj_floor_source: 'measured-2023-25-p10', proj_ceiling_source: 'measured-2023-25-p90' };
const out = dispersionCaveat(love, [love]);
ck('it names the cohort band the figure came from', /QB 17-32/.test(out), out);
ck('it says outright the figure is NOT a forecast for this player',
  /NOT a forecast for this player/.test(out), out);
ck('it says every player in the band shares the multiple',
  /same multiple/.test(out), out);

// ------------------------------------------- 5. the edge warning fires for Love
ck('a player at the TOP of his band is told the figure is harshest there',
  /TOP of that band/.test(out), out);

// ----------------------------------- 6. and does NOT fire in the band's middle
const mid = Object.assign({}, love, { name: 'Sam Darnold', pos_rank: 25 });
ck('a player mid-band gets the cohort line but NOT the edge warning',
  /QB 17-32/.test(dispersionCaveat(mid, [mid])) && !/TOP of that band/.test(dispersionCaveat(mid, [mid])),
  dispersionCaveat(mid, [mid]));

// ------------------------------- 7. a Gaussian row is NOT called a cohort p10
const gauss = { position: 'K', pos_rank: 20, proj_mean: 120, proj_floor: 95,
  proj_ceiling: 155, proj_floor_source: 'gaussian_z', proj_ceiling_source: 'gaussian_z' };
const g = dispersionCaveat(gauss, [gauss]);
ck('an unmeasured band is called a Gaussian, not a measured cohort range',
  /SYMMETRIC GAUSSIAN/.test(g) && !/COHORT's measured/.test(g), g);

// ---------------------------------------------- 8. KNOWN-POSITIVE, on the BOARD
/* The controls above run on hand-built rows, so they would all pass while the
 * real board carried no such case at all. This one requires the defect the
 * caveat exists for to be PRESENT in the artifact Cory drafts from — if the
 * band cliff ever goes away, this test must be re-read, not silently kept. */
const BOARD = path.join(ROOT, 'public', 'draft_data.json');
if (!fs.existsSync(BOARD)) { console.log('SKIP  no built board'); }
else {
  const art = JSON.parse(fs.readFileSync(BOARD, 'utf8'));
  const byPos = {};
  (art.players || []).forEach(p => {
    if (p.pos_rank && p.proj_floor && /^measured-/.test(String(p.proj_floor_source || '')))
      (byPos[p.position] = byPos[p.position] || []).push(p);
  });
  const cliffs = [];
  Object.keys(byPos).forEach(pos => {
    const m = byPos[pos].sort((a, b) => a.pos_rank - b.pos_rank);
    for (let i = 1; i < m.length; i++) {
      const a = m[i - 1], b = m[i];
      if (b.pos_rank - a.pos_rank !== 1) continue;
      if (a.proj_floor / b.proj_floor > 3) cliffs.push({ pos: pos, hi: a, lo: b });
    }
  });
  ck('KNOWN-POSITIVE: the live board really does contain adjacent-rank floor cliffs',
    cliffs.length > 0, cliffs.map(c => c.pos + ': ' + c.hi.name + ' -> ' + c.lo.name));

  /* THE FIRST VERSION OF THIS CHECK ASSERTED EVERY CLIFF SITS ON A BAND EDGE,
   * AND IT WAS WRONG — it went red and was right to. Of the four cliffs on the
   * live board, only two are the band step (Jordan Love at QB17, Darnell
   * Washington at TE33). The other two are E1 MISREADS: Jordan Mason is
   * published RB31 and Alec Pierce WR32, both priced off the 33+ cohort. Two
   * different defects producing the same visible symptom, which is precisely
   * why the caveat must read the cohort off the RATIO rather than the rank. */
  const all = (art.players || []);
  const classified = cliffs.map(c => {
    const txt = dispersionCaveat(c.lo, all);
    return { who: c.pos + c.lo.pos_rank + ' ' + c.lo.name, txt: txt,
      edge: /TOP of that band/.test(txt), misread: /register E1/.test(txt) };
  });
  ck('EVERY cliff is explained on screen as one of the two — band edge or E1 misread',
    classified.every(c => c.edge || c.misread),
    classified.map(c => c.who + ' edge=' + c.edge + ' misread=' + c.misread));
  ck('and BOTH causes are actually present, so neither branch is dead code',
    classified.some(c => c.edge) && classified.some(c => c.misread),
    classified.map(c => c.who + ' edge=' + c.edge + ' misread=' + c.misread));

  /* The E1 branch must fire on exactly the players whose applied cohort
   * disagrees with their published rank band — no more, no less. */
  const flagged = all.filter(p => p.pos_rank && p.proj_floor && p.proj_mean
    && /^measured-/.test(String(p.proj_floor_source || ''))
    && /register E1/.test(dispersionCaveat(p, all)));
  ck('the E1 warning fires on the nine known misreads and nothing else',
    flagged.length === 9, flagged.map(p => p.position + p.pos_rank + ' ' + p.name));
}

// ------------------------------------------------------------- 9. THE FAIL ARM
/* A caveat that cannot fail is decoration. Restore the old line — the bare
 * "(floor 2, ceiling 479)" with no dispersionCaveat call — and check 1 must go
 * red. If this arm ever passes, the pin above is measuring nothing. */
const reverted = SRC.replace(/ \+ dispersionCaveat\(p, state\.board\) \+/, ' +');
ck('FAIL ARM: with the caveat removed, the wiring check goes red',
  !/\+ dispersionCaveat\(p, state\.board\) \+/.test(reverted));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
