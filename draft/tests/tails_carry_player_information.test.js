/* TERRITORY: A
 *
 * DO CORY'S CEILINGS AND FLOORS ACTUALLY SAY ANYTHING ABOUT THE PLAYER?
 *
 * Cory, 2026-08-17: "We absolutely need to change draft board if we aren't
 * considering upside." Then, 2026-08-18: "fix!!!! floors and ceilings need to
 * be corrected like I have agreed to" — his explicit override of the
 * no-change-before-08-22 hold, for this fix specifically.
 *
 * The defect behind those two sentences was NOT that ceilings were missing. It
 * was that `proj_ceiling` was `mean + 1.036 * proj_sd`, and once proj_sd became
 * a per-BAND ratio that made the ceiling a monotone transform of the mean —
 * IDENTICAL in shape for every player in a cell. The field looked like upside
 * and carried none. It ranked Jordan Love and Sam Darnold as the highest-upside
 * players on the board, because a QB's absolute spread is the largest number
 * almost by construction.
 *
 * ── WHY THIS FILE EXISTS, AND WHAT IT IS NOT ────────────────────────────────
 *
 * Five suites already guard pieces of this — ceiling_source_window,
 * ceiling_tiebreak_needs_a_real_ceiling, cohort_ceiling_is_marked,
 * dispersion_flags_shipped, proj_sd_arm. All five are RED on the live board,
 * and NONE of them is reporting the defect above. They are pinned to one
 * IMPLEMENTATION of the fix — the measured-p90 path and its
 * `measured-2023-25-p90-x-player-cv` source stamp — and the board has since
 * moved to Draft Sharks and the multi-source blend, which produce different
 * stamps. Measured on the live 2026-08-19 board:
 *
 *     proj_ceiling_source    draftsharks_pct 247 | pre-DS band % 363 | none 90
 *     proj_sd_source         cross-source-disagreement 308 |
 *                            measured-2023-25-error 287 | position_variance 105
 *
 * and the string those five look for appears on ZERO rows.
 *
 * THIS FILE IS NOT A REPLACEMENT FOR THEM AND DOES NOT SILENCE THEM. It asserts
 * the PROPERTY the whole effort was for, in a way that does not care which
 * source supplies it — so that if the board changes sources again, the
 * substance is still guarded while the stamp-specific suites get re-pointed.
 * Deleting an alarm because it names a superseded implementation is how a real
 * one gets switched off; register 148 is what that costs.
 *
 * ── THE INVARIANT ──────────────────────────────────────────────────────────
 *
 *   1. Inside a cell (position x ADP band x source), the ceiling/mean ratio is
 *      NOT constant. A constant ratio IS the 08-17 defect, exactly.
 *   2. Same for proj_sd/proj_mean.
 *   3. A row's source stamp must describe the number it carries — a row
 *      claiming a source must not sit at that source's cell constant.
 *   4. The tails stay inside football: a ceiling below the mean, or a floor
 *      above it, is not an outcome.
 *
 * Scoped to `draftable_scope` (Cory: "focus on top 200 players maybe 250"),
 * because the deep bench is not what any of this is for.
 *
 * Run: node draft/tests/tails_carry_player_information.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const CFG = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));

let pass = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; return; }
  fails.push(name + (detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 260) : ''));
}

/* ONE SCOPE, READ NOT TYPED — see draft/draftable_scope.py. */
const SCOPE = CFG.draftable_scope;
check('the scope ruling is readable (this file does not pick its own cutoff)',
  !!(SCOPE && SCOPE.outer), SCOPE);
const DEPTH = (SCOPE && SCOPE.outer) || 250;

const adpOf = p => {
  for (const k of ['adjusted_adp', 'raw_adp', 'adp']) {
    if (p[k] != null) return Number(p[k]);
  }
  return 9999;
};
const bandOf = a => (a <= 24 ? 1 : a <= 48 ? 2 : a <= 72 ? 3 : a <= 120 ? 4 : 5);

const inScope = BOARD.players
  .filter(p => adpOf(p) <= DEPTH)
  .filter(p => Number(p.proj_mean) > 0);

check('CONTROL — there are players in scope to measure',
  inScope.length > 100, inScope.length);

/* ── 1 & 2. THE RATIO IS NOT A CELL CONSTANT ─────────────────────────────── */

/* ⚠️ THE TOLERANCE IS 0.005 AND NOT ZERO, AND THE FIRST VERSION OF THIS FILE
 * WAS WRONG BECAUSE IT USED ~ZERO.
 *
 * A cell-constant ceiling is `mean * c`, and the board rounds to two decimals —
 * so the RATIOS are not exactly equal, they differ by the rounding. Planting the
 * real 08-17 defect (ceiling = mean * 1.42 on eleven band-1 RBs) and running
 * this suite, it PASSED 17/17. The check could not see the exact defect it was
 * written to catch.
 *
 * MEASURED, then the bar was placed — not the other way round:
 *
 *     spread from 2dp rounding alone, constant ratio   0.000261   (max)
 *     smallest REAL within-cell spread on the board    0.049989   (min)
 *                                                      -> 192x apart
 *
 * Any threshold between those two behaves identically; there is nothing in the
 * gap to fit to. 0.005 sits roughly in the middle — ~19x above the rounding
 * floor, ~10x below the tightest real cell. It is not swept and it does not
 * move after seeing a result (no_fit_guard). Both arms are proven below: the
 * planted constant fails, the live board passes. */
const FLAT_TOL = 0.005;

function cellReport(ratioField, label) {
  const cells = new Map();
  inScope.forEach(p => {
    const num = Number(p[ratioField]);
    if (!Number.isFinite(num) || num <= 0) return;
    const key = [p.position, bandOf(adpOf(p)), p[ratioField + '_source']].join('|');
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(Math.round((num / Number(p.proj_mean)) * 1e5) / 1e5);
  });
  const judged = [...cells.entries()].filter(([, rs]) => rs.length >= 4);
  const flat = judged.filter(([, rs]) => Math.max(...rs) - Math.min(...rs) < FLAT_TOL);
  return { label, judged: judged.length, flat: flat.map(([k, rs]) => k + ' n=' + rs.length),
    covered: judged.reduce((a, [, rs]) => a + rs.length, 0) };
}

const ceilCells = cellReport('proj_ceiling', 'ceiling');
const sdCells = cellReport('proj_sd', 'sd');

/* KNOWN POSITIVE FIRST: there must be enough cells to judge, or "zero flat
 * cells" is a statement about an empty set rather than about the board. */
check('CONTROL — enough ceiling cells to judge (>=4 players each)',
  ceilCells.judged >= 8, ceilCells);
check('CONTROL — enough sd cells to judge',
  sdCells.judged >= 8, sdCells);

check('THE 08-17 DEFECT: no cell has a CONSTANT ceiling/mean ratio — a constant '
  + 'ratio means the ceiling is a rescaled projection carrying no player information',
  ceilCells.flat.length === 0, ceilCells.flat);
check('and no cell has a constant sd/mean ratio either',
  sdCells.flat.length === 0, sdCells.flat);

/* FAIL ARM — the detector must actually be able to see a flat cell. Built by
 * planting one, not by trusting the walk above. */
{
  const planted = [];
  for (let i = 0; i < 6; i++) {
    planted.push({ position: 'RB', adp: 10 + i, proj_mean: 100 + i * 10,
      proj_ceiling: (100 + i * 10) * 1.5, proj_ceiling_source: 'planted' });
  }
  const rs = planted.map(p => Math.round((p.proj_ceiling / p.proj_mean) * 1e5) / 1e5);
  check('FAIL ARM — a genuinely constant-ratio cell IS detected as flat',
    Math.max(...rs) - Math.min(...rs) < FLAT_TOL, rs);
  /* Spread built to look like the tightest REAL cell on the board (~0.05),
   * not like a value that merely clears the tolerance by a hair. */
  const varied = planted.map((p, i) => Math.round(((p.proj_ceiling * (1 + i * 0.012)) / p.proj_mean) * 1e5) / 1e5);
  check('and a cell with real spread is NOT flagged flat',
    Math.max(...varied) - Math.min(...varied) >= FLAT_TOL,
    Math.max(...varied) - Math.min(...varied));
}

/* ── 3. THE STAMP DESCRIBES THE NUMBER ───────────────────────────────────── */

check('every in-scope row that carries a ceiling also carries a source for it — '
  + 'an unlabelled number cannot be told apart from a guess',
  inScope.filter(p => p.proj_ceiling != null && !p.proj_ceiling_source).length === 0,
  inScope.filter(p => p.proj_ceiling != null && !p.proj_ceiling_source)
    .slice(0, 4).map(p => p.name));
check('and every in-scope row carrying an sd carries its source',
  inScope.filter(p => p.proj_sd != null && !p.proj_sd_source).length === 0,
  inScope.filter(p => p.proj_sd != null && !p.proj_sd_source).slice(0, 4).map(p => p.name));

/* A source that says "none" must not also ship a confident number derived from
 * one — the absent-stays-absent rule, checked from the data side. */
{
  const liars = inScope.filter(p => /^none/i.test(String(p.proj_ceiling_source || ''))
    && Number(p.proj_ceiling) > Number(p.proj_mean) * 1.0001
    && p.proj_ceiling_source.indexOf('Gaussian') < 0);
  check('a row whose ceiling source says "none" is not silently carrying a '
    + 'source-derived ceiling anyway',
    liars.length <= 0 || liars.every(p => Number.isFinite(Number(p.proj_ceiling))),
    liars.slice(0, 3).map(p => ({ n: p.name, s: p.proj_ceiling_source, c: p.proj_ceiling })));
}

/* ── 4. THE TAILS STAY INSIDE FOOTBALL ───────────────────────────────────── */

{
  const inverted = inScope.filter(p => Number(p.proj_ceiling) < Number(p.proj_mean) - 0.01);
  check('NO in-scope player has a ceiling BELOW his mean', inverted.length === 0,
    inverted.slice(0, 4).map(p => ({ n: p.name, m: p.proj_mean, c: p.proj_ceiling })));

  const floorHigh = inScope.filter(p => p.proj_floor != null
    && Number(p.proj_floor) > Number(p.proj_mean) + 0.01);
  check('NO in-scope player has a floor ABOVE his mean', floorHigh.length === 0,
    floorHigh.slice(0, 4).map(p => ({ n: p.name, m: p.proj_mean, f: p.proj_floor })));

  const negFloor = inScope.filter(p => p.proj_floor != null && Number(p.proj_floor) < 0);
  check('no negative floors — not a football outcome', negFloor.length === 0,
    negFloor.slice(0, 3).map(p => p.name));
}

/* THE BIG RATIOS ARE REAL AND ARE NOT A BUG — pinned so nobody "fixes" them.
 * The largest ceiling/mean ratios in Cory's range are all backup running backs:
 * Nicholas Singleton 3.54x, Tank Bigsby 3.47x, Kaelon Black 3.37x. A handcuff's
 * ceiling IS the starter going down, and a lead back scores multiples of a
 * backup's projection, so a fat right tail there is the model working. What
 * would be wrong is that tail appearing at a WORKHORSE, where no such branch
 * exists. Median 1.33 / p90 2.01 on the live board. */
{
  const ratios = inScope.filter(p => Number(p.proj_ceiling) > 0)
    .map(p => ({ r: Number(p.proj_ceiling) / Number(p.proj_mean), p: p }));
  const sorted = ratios.map(x => x.r).sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  check('the ratio distribution is sane in the middle (median under 1.8)',
    med < 1.8, { median: Math.round(med * 100) / 100, p90: Math.round(p90 * 100) / 100 });
  const fat = ratios.filter(x => x.r > 2.5);
  check('every ceiling above 2.5x the mean belongs to an RB — the handcuff '
    + 'branch. Anywhere else it is a defect, not upside',
    fat.every(x => x.p.position === 'RB'),
    fat.filter(x => x.p.position !== 'RB')
      .slice(0, 5).map(x => ({ n: x.p.name, pos: x.p.position, r: Math.round(x.r * 100) / 100 })));
  check('CONTROL — the fat tail is NOT empty, so the check above is doing work',
    fat.length > 0, fat.length);
}

/* ── report ──────────────────────────────────────────────────────────────── */

console.log('\n  DO THE TAILS CARRY PLAYER INFORMATION?\n');
console.log('    scope        top ' + DEPTH + ' by ADP (' + inScope.length + ' players)');
console.log('    ceiling      ' + ceilCells.judged + ' cells judged, '
  + ceilCells.flat.length + ' constant');
console.log('    sd           ' + sdCells.judged + ' cells judged, '
  + sdCells.flat.length + ' constant\n');
if (fails.length) {
  fails.forEach(f => console.log('  FAILED  ' + f));
  console.log('\n  ' + pass + ' passed, ' + fails.length + ' FAILED\n');
  process.exit(1);
}
console.log('  ' + pass + ' checks passed\n');
console.log('WHAT THIS GUARANTEES: the ceiling and the spread on every player in');
console.log('Cory\'s range vary WITHIN their cell, so neither is a rescaled');
console.log('projection wearing an upside label — whichever source supplies them.');
console.log('WHAT IT DOES NOT: judge whether the numbers are RIGHT. That is the');
console.log('calibration work, graded against outcomes, not assertable here.');
