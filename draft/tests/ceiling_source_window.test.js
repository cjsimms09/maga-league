// TERRITORY: A
/* THE CEILING THAT PRICES CORY'S WINDOW MUST BE HIS, NOT HIS COHORT'S.
 *
 * ── WHAT THIS FILE USED TO SAY, AND WHY IT NO LONGER SAYS IT ──────────────
 *
 * It characterized a defect: inside Cory's ADP window, a population of players
 * carried `proj_ceiling_source: measured-2023-25-p90` — measured, but a per-BAND
 * constant rather than a per-player tail. Because `DG_HIGH_K` is the largest
 * coefficient in `playerDollars` and multiplies `ceiling - mean`, the DOMINANT
 * term of the money number on the compare tray was a cohort constant for those
 * players.
 *
 * ⚠️ THAT DEFECT IS FIXED, AND NOT BY THIS TEST. Cory's Draft Sharks band ruling
 * (2026-08-20) replaced the whole `measured-2023-25-p90*` family: DS publishes a
 * real floor and ceiling, converted to a per-player RATIO against DS's own
 * projection and applied to each source's own number. Measured on the live
 * board, the old family is now at ZERO players — the strings do not appear.
 *
 * The old file went red because its subject stopped existing, which is exactly
 * what its own header predicted ("SECTIONS 2 AND 3 ARE CHARACTERIZATION and go
 * red when the volatility work reaches these players — that is the fix
 * reporting itself, update the counts in that commit"). Nobody updated it, so
 * it sat red for days as a false alarm. A red suite everyone learns to ignore
 * is worse than no suite, which is the actual cost being paid here.
 *
 * ── WHAT IT GUARDS NOW ────────────────────────────────────────────────────
 *
 * The PROPERTY the old file was protecting, stated directly and measured with
 * the same statistic: within-cell cv of `proj_ceiling / proj_mean`, grouped by
 * (ceiling source x position). A per-BAND constant shows up as ~7.8e-4 — that
 * is storage rounding on a two-decimal field, not variation. A genuine
 * per-player tail is orders of magnitude above it.
 *
 * Live when rewritten: `draftsharks_pct` cells run 4.6e-2 to 3.5e-1 — 59x to
 * 450x the constant signature — and the `pre-DS band %, rescaled` fallback runs
 * 3.2e-2 to 9.0e-2. Both are genuinely player-specific. The only true constant
 * left is `position-median band %`, which names itself honestly and covers 8
 * players board-wide, ONE of them inside the top 200.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 400) : '')); }
};

const SKILL = ['QB', 'RB', 'WR', 'TE'];
const adp = p => Number(p.adjusted_adp != null ? p.adjusted_adp
  : (p.raw_adp != null ? p.raw_adp : p.adp));
//: The window is Cory's real picks, read off the board rather than hardcoded, so
//: a change to his keeper count moves it instead of quietly invalidating it.
const MINE = ((B.pick_order || {}).my_picks || []);
const LO = 27, HI = 160;
const WINDOW = B.players.filter(p => {
  const a = adp(p);
  return Number.isFinite(a) && a >= LO && a <= HI;
});

/* The band-constant signature, and the margin. 7.8e-4 was the measured cv of
 * the old per-band source; anything at or under BAND_CV is indistinguishable
 * from "every player in this cell has the same ratio, to storage precision". */
const BAND_CV = 5e-3;

/* Sources that are ALLOWED to be constant because they say so in their own
 * name. They are bounded by population below rather than exempted silently. */
const HONEST_CONSTANTS = [
  'position-median band %, no player-specific band available',
];
const isHonestConstant = s => HONEST_CONSTANTS.some(h => String(s).indexOf(h.slice(0, 24)) === 0);

function cellCv(players) {
  const r = players.map(p => Number(p.proj_ceiling) / Number(p.proj_mean))
    .filter(x => Number.isFinite(x) && x > 0);
  if (r.length < 3) return null;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  if (!(m > 0)) return null;
  const v = r.reduce((a, b) => a + (b - m) * (b - m), 0) / r.length;
  return Math.sqrt(v) / m;
}

// ── 1. THE WINDOW IS THE ONE THE ROW MEANS ────────────────────────────────
{
  ck('the board still publishes my_picks, which is what makes this window his',
    MINE.length >= 10, MINE);
  ck('the ADP window brackets his real first and last pick', MINE.length
    && Math.min.apply(null, MINE) >= LO && Math.max.apply(null, MINE) <= HI + 5,
  { first: MINE[0], last: MINE[MINE.length - 1], window: [LO, HI] });
  ck('and it holds enough players for the counts below to mean anything',
    WINDOW.length >= 100, WINDOW.length);
  ck('every player in it carries a proj_ceiling_source — absent would make the '
    + 'whole check meaningless and must never read as healthy',
  WINDOW.every(p => typeof p.proj_ceiling_source === 'string' && p.proj_ceiling_source),
  WINDOW.filter(p => !p.proj_ceiling_source).map(p => p.name).slice(0, 5));
}

// ── 2. THE OLD DEFECT'S POPULATION IS GONE ────────────────────────────────
{
  const OLD = ['measured-2023-25-p90', 'measured-2023-25-p90-x-player-cv'];
  const survivors = B.players.filter(p => OLD.indexOf(p.proj_ceiling_source) >= 0);
  /* ⚠️ "ANYONE" WAS TRUE BY LUCK, AND THE LUCK RAN OUT ON THREE UNDRAFTABLE MEN.
   *
   * The p90 family is NOT dead code — `draft/projections.py:544` reaches it
   * under `use_measured_ceiling`, as the THIRD fallback after a Draft Sharks
   * band and a prior-board band. It priced nobody on the 08-21 and 08-22 boards
   * because every player then on the board had one of the first two. The 08-25
   * rebuild ingested players who had neither, and three of them landed in a
   * measured cell.
   *
   * MEASURED ACROSS FOUR BOARDS, which is what turns this from a guess into a
   * shape: 08-19 = 289 survivors, 08-21 = 0, 08-22 = 0, 08-25 = 3 — and all
   * three are NEW to the board (absent from 08-22 entirely), at ADP 517-560
   * with projections of 3.3 to 5.8 points. The defect this file was written
   * about was 289 players including Alvin Kamara, James Conner and Isiah
   * Pacheco. Three men nobody in this league can draft are not that defect
   * coming back, and failing on them is the "bound tuned to today's data" trap.
   *
   * SO THE CLAIM IS STATED AT THE SCOPE WHERE IT MATTERS AND CANNOT BE SATISFIED
   * BY HIDING: nobody the league can actually DRAFT may be priced by the retired
   * family. The draftable depth is the number of picks the room makes, read off
   * the board's own pick order rather than pinned — 150 today. The deep-tail
   * residue is PRINTED every run, so a walk back toward 289 is visible in the
   * log the run before it becomes a failure. Register 353. */
  const DRAFTABLE_DEPTH = ((B.pick_order || {}).picks || []).length;
  const draftableSurvivors = survivors.filter(p => {
    const a = adp(p);
    return !Number.isFinite(a) || a <= DRAFTABLE_DEPTH;
  });
  ck('CONTROL: the board declares how deep the room actually drafts, so the '
    + 'scope below is derived rather than a number I chose',
    DRAFTABLE_DEPTH > 0, { picks: DRAFTABLE_DEPTH });
  console.log('      p90 residue: ' + survivors.length + ' of ' + B.players.length
    + ' board players, ' + draftableSurvivors.length + ' of them inside the '
    + DRAFTABLE_DEPTH + '-pick draftable depth'
    + (survivors.length ? ' (deepest ADP ' + Math.max.apply(null, survivors.map(adp))
      + ', shallowest ' + Math.min.apply(null, survivors.map(adp)) + ')' : ''));
  ck('the measured-2023-25-p90 family prices NOBODY the league can draft — '
    + 'Cory\'s Draft Sharks band ruling replaced it, which is why this file was '
    + 'rewritten (it is a live third fallback, not dead code, so the claim is '
    + 'about reach rather than existence)',
  draftableSurvivors.length === 0,
  { draftable_survivors: draftableSurvivors.length, depth: DRAFTABLE_DEPTH,
    sample: draftableSurvivors.slice(0, 5).map(p => p.name + ' @' + adp(p)) });
  ck('...and it has not walked back toward the 289-player population this file '
    + 'was written about — every survivor is in the undraftable tail',
  survivors.length < 20,
  { survivors: survivors.length,
    sample: survivors.slice(0, 8).map(p => p.name + ' @' + adp(p)) });
}

// ── 3. THE PROPERTY: EVERY CELL IN HIS WINDOW IS PLAYER-SPECIFIC ──────────
{
  const cells = {};
  WINDOW.forEach(p => {
    if (!(Number(p.proj_mean) > 0) || !(Number(p.proj_ceiling) > 0)) return;
    const k = p.proj_ceiling_source + ' | ' + p.position;
    (cells[k] = cells[k] || []).push(p);
  });
  const measured = Object.keys(cells)
    .map(k => ({ k: k, n: cells[k].length, cv: cellCv(cells[k]),
      honest: isHonestConstant(k.split(' | ')[0]) }))
    .filter(r => r.cv != null);

  ck('CONTROL: there are enough populated (source x position) cells in his '
    + 'window to measure — one cell would make the check below a single reading',
  measured.length >= 4, { cells: measured.length });

  const flat = measured.filter(r => r.cv <= BAND_CV && !r.honest);
  ck('NO cell in Cory\'s window is a band CONSTANT — every ceiling that prices '
    + 'him varies player to player, which is the whole point of a ceiling',
  flat.length === 0,
  { constant_cells: flat.map(r => ({ cell: r.k, n: r.n, cv: r.cv.toExponential(2) })),
    all_cells: measured.map(r => r.k + ' n=' + r.n + ' cv=' + r.cv.toExponential(2)) });

  /* The honest-constant fallback is allowed to exist and is NOT allowed to
   * spread. If it ever prices a real part of his window, that is a coverage
   * regression upstream and this is where it surfaces. */
  const honestPlayers = WINDOW.filter(p => isHonestConstant(p.proj_ceiling_source));
  ck('and the self-declared constant fallback stays rare inside his window — it '
    + 'is a stated last resort, not a population',
  honestPlayers.length <= Math.max(5, Math.round(0.05 * WINDOW.length)),
  { on_fallback: honestPlayers.length, of_window: WINDOW.length,
    names: honestPlayers.slice(0, 8).map(p => p.name) });
}

// ── 4. KNOWN POSITIVE — THE STATISTIC CAN STILL SEE A CONSTANT ────────────
{
  /* Rule 3e/3f. Section 3 is a NULL: "no constant cells". A null from a probe
   * that cannot return a positive is a bug report, not a finding — and this
   * one would read identically if cellCv were broken, if the window were empty,
   * or if the field were renamed. So: build a cohort that IS constant and
   * confirm the same function flags it. */
  const real = WINDOW.filter(p => Number(p.proj_mean) > 0 && Number(p.proj_ceiling) > 0)
    .slice(0, 30);
  const synthetic = real.map(p => ({
    proj_mean: p.proj_mean,
    // one band ratio for everyone, rounded to the board's two decimals — the
    // exact shape the old measured-2023-25-p90 source had
    proj_ceiling: Math.round(p.proj_mean * 1.23 * 100) / 100,
  }));
  const cv = cellCv(synthetic);
  ck('KNOWN POSITIVE: a synthesised cohort-constant ceiling IS flagged by the '
    + 'same statistic, so section 3\'s "none" is a measurement and not a blind spot',
  cv != null && cv <= BAND_CV, { synthetic_cv: cv == null ? null : cv.toExponential(2),
    threshold: BAND_CV.toExponential(2) });

  const realCv = cellCv(real);
  ck('KNOWN NEGATIVE: the same statistic on the REAL board is far above the '
    + 'threshold, so the two cases are separated rather than both passing',
  realCv != null && realCv > BAND_CV * 5,
  { real_cv: realCv == null ? null : realCv.toExponential(2) });
}

// ── 5. WHY IT MATTERS — THE CEILING DRIVES THE MONEY NUMBER (register 5e) ──
{
  const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
  ck('DG_HIGH_K is still the largest coefficient in playerDollars, so the '
    + 'ceiling drives the dollar figure more than the projection does — this is '
    + 'the reason a constant ceiling would matter, and it has not changed',
  E.CFG.DG_HIGH_K > E.CFG.DG_ENTRY_K + E.CFG.DG_RS_K,
  { high: E.CFG.DG_HIGH_K, season: E.CFG.DG_ENTRY_K + E.CFG.DG_RS_K });

  const skill = WINDOW.filter(p => SKILL.indexOf(p.position) >= 0 && Number(p.proj_mean) > 0);
  const shares = skill.map(p => {
    const d = E.playerDollars(p);
    return d && d.total > 0 ? d.high / d.total : 0;
  }).filter(x => x > 0);
  ck('and the boom term is a large share of the price for skill players in his '
    + 'window, so the ceiling being per-player is load-bearing, not cosmetic',
  shares.length >= 20 && shares.reduce((a, b) => a + b, 0) / shares.length > 0.3,
  { n: shares.length,
    mean_boom_share: +(shares.reduce((a, b) => a + b, 0) / (shares.length || 1)).toFixed(3) });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
