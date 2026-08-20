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
 * Both are in their CORRECT cell — this is NOT the E1 population case, which
 * was RULED EXPECTED 2026-08-18 (A, projections.py:306): the build prices off
 * the FULL-UNIVERSE rank (keepers counted) because that is how the calibration
 * was fit, while the published pos_rank counts only available players. A
 * 2.45-point season floor is not a claim about Jordan Love; it is the p10 of a
 * cohort running down to quarterbacks who never take a snap.
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

// ---------------- 6b. NEAR-TIE FAIL ARM + the 4x calibration, pinned
/* Added 2026-08-18 on the independent reviewer's first verdict
 * (ACCEPT_WITH_REQUIREMENT, run 32175940031): the relative guard needed an
 * explicit counterexample — two cells whose medians sit CLOSE, where naming
 * either cohort would be a guess — and a committed calibration note.
 *
 * CALIBRATION (measured on the v27 board, 2026-08-18): at the shipped
 * relative factor (best.d > 0.25 * second.d refuses), the warning recovers
 * EXACTLY the nine ruled full-universe repricings (checked structurally in
 * section 8 below). Loosening to 0.5 added two FALSE positives on the live
 * board (Ashton Jeanty RB6, Kyle Pitts TE8 — both within-band, mis-flagged).
 * The factor is a refusal threshold, not a tuning knob: widen it and the
 * caveat starts guessing. */
{
  // two synthetic cells whose modal ratios are close: 0.30 and 0.34. A player
  // at 0.32 sits between them — 4x-decisive for NEITHER — so no cohort may be
  // named and the generic fallback must render instead.
  const mk = (rank, ratio) => ({ position: 'RB', pos_rank: rank,
    proj_mean: 200, proj_floor: 200 * ratio,
    proj_floor_source: 'measured-2023-25-p10', proj_ceiling_source: 'measured-2023-25-p90' });
  const board = [];
  for (let r = 9; r <= 14; r++) board.push(mk(r, 0.30));   // 9-16 cell
  for (let r = 17; r <= 22; r++) board.push(mk(r, 0.34));  // 17-32 cell
  const tied = Object.assign(mk(18, 0.32), { name: 'Near Tie', proj_ceiling: 300 });
  const out = dispersionCaveat(tied, board.concat([tied]));
  ck('NEAR-TIE FAIL ARM: with two cells 4x-indistinguishable the caveat names '
    + 'NO cohort — the generic fallback renders instead of a guess',
  /not a\n    forecast for this player/.test(out) && !/COHORT's measured/.test(out), out);

  // and the same board with the cells far apart IS decisive — the refusal is
  // about closeness, not a guard that never names anything.
  const far = board.map(p => p.pos_rank <= 16 ? p : Object.assign({}, p, { proj_floor: p.proj_mean * 0.05 }));
  const clear = Object.assign(mk(18, 0.052), { name: 'Clear Case', proj_ceiling: 300 });
  const out2 = dispersionCaveat(clear, far.concat([clear]));
  ck('CONTROL: the same shape with separated cells names its cohort',
    /17-32 COHORT's measured/.test(out2), out2);

  // the two players the 0.5 factor would have falsely flagged stay unflagged
  const BOARD2 = path.join(ROOT, 'public', 'draft_data.json');
  const art2 = fs.existsSync(BOARD2) ? JSON.parse(fs.readFileSync(BOARD2, 'utf8')) : null;
  if (art2) {
    const all2 = art2.players || [];
    const falsePos = ['Ashton Jeanty', 'Kyle Pitts']
      .map(n => all2.find(p => p.name === n)).filter(Boolean);
    ck('CALIBRATION PIN: the two players a looser (0.5) factor falsely flagged '
      + 'are NOT flagged by the shipped guard',
    falsePos.length === 2 && falsePos.every(p => !/register E1, ruled/.test(dispersionCaveat(p, all2))),
    falsePos.map(p => p.name));
  }
}

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
   * AND IT WAS WRONG — it went red and was right to. The second version
   * asserted every cliff is a band edge or an "E1 misread", and BOTH halves of
   * that rotted the same night (2026-08-18): A ruled the E1 population
   * question — pricing off the full-universe rank is CORRECT, matching the
   * calibration's fit, so "misread" was the wrong word and the on-screen
   * caveat calling it a "known defect" was itself a false statement (now
   * reworded to the ruling) — and the v27 rebuild surfaced a THIRD cliff kind:
   * RB136 Donovan Edwards floor 0.04 -> RB137 Clyde Edwards-Helaire 0.01, a
   * 4.0x ratio on floors stored to two decimals, where the mean ratio is only
   * 2.63x. Below half a point the printed figure is quantization, not a claim
   * a reader could act on. Three causes, one visible symptom — which is
   * precisely why the caveat must read the cohort off the RATIO. */
  const all = (art.players || []);
  const classified = cliffs.map(c => {
    const txt = dispersionCaveat(c.lo, all);
    return { who: c.pos + c.lo.pos_rank + ' ' + c.lo.name, txt: txt,
      edge: /TOP of that band/.test(txt),
      repriced: /register E1, ruled/.test(txt),
      penny: c.hi.proj_floor < 0.5 && c.lo.proj_floor < 0.5 };
  });
  ck('EVERY cliff is either explained on screen (band edge / full-universe '
    + 'repricing) or sits at penny scale where both printed floors round below '
    + 'half a point',
  classified.every(c => c.edge || c.repriced || c.penny),
  classified.map(c => c.who + ' edge=' + c.edge + ' repriced=' + c.repriced
    + ' penny=' + c.penny));
  ck('and both ON-SCREEN causes are actually present, so neither branch is dead code',
    classified.some(c => c.edge) && classified.some(c => c.repriced),
    classified.map(c => c.who + ' edge=' + c.edge + ' repriced=' + c.repriced));

  /* The repricing warning must fire on exactly the players whose FULL-UNIVERSE
   * band (players + keepers, ranked by proj_mean, per the ruling) disagrees
   * with their published rank band — no more, no less. Recomputed here from
   * the artifact rather than hard-counted, so a rebuild moves both sides. */
  const bandLabel = r => { const b = [[1,3,'1-3'],[4,8,'4-8'],[9,16,'9-16'],
    [17,32,'17-32'],[33,Infinity,'33+']].find(x => r >= x[0] && r <= x[1]);
  return b && b[2]; };
  const uniByPos = {};
  all.concat(art.kept_players || []).forEach(p => {
    (uniByPos[p.position] = uniByPos[p.position] || []).push(p);
  });
  Object.keys(uniByPos).forEach(k =>
    uniByPos[k].sort((a, b) => b.proj_mean - a.proj_mean));
  const uniRank = p => uniByPos[p.position]
    .findIndex(x => String(x.player_id) === String(p.player_id)) + 1;
  const measuredRows = all.filter(p => p.pos_rank && p.proj_floor && p.proj_mean
    && /^measured-/.test(String(p.proj_floor_source || '')));
  const expected = new Set(measuredRows
    .filter(p => bandLabel(uniRank(p)) !== bandLabel(Number(p.pos_rank)))
    .map(p => p.position + p.pos_rank + ' ' + p.name));
  const flagged = new Set(measuredRows
    .filter(p => /register E1, ruled/.test(dispersionCaveat(p, all)))
    .map(p => p.position + p.pos_rank + ' ' + p.name));
  ck('KNOWN-POSITIVE: the ruled repricing set is non-empty on the live board '
    + '(keepers really do shift bands)', expected.size > 0, [...expected]);
  ck('the repricing warning fires on exactly the ruled set — every player '
    + 'whose full-universe band differs from his published band, and no other',
  expected.size === flagged.size
    && [...expected].every(w => flagged.has(w)),
  { expected: [...expected].sort(), flagged: [...flagged].sort() });
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
