// TERRITORY: B renders · relay measures
// HOW MANY PLAYERS IN CORY'S ACTUAL PICK WINDOW HAVE A CEILING THAT SAYS
// NOTHING ABOUT THEM — AND THE COUNT I GOT WRONG BY READING ONE FIELD LAZILY.
//
// Register row 4v. Written because I annotated that row this morning with
// *"the remaining 9 are all K and DEF — not one skill player in his range is
// affected"* and *"EVERY SKILL PLAYER IN CORY'S DRAFT RANGE NOW CARRIES A
// MEASURED, PLAYER-SPECIFIC CEILING"*, and both are false. **The error pointed
// toward not doing the fix**, which is the worst direction available.
//
// ── THE MISTAKE, EXACTLY ──────────────────────────────────────────────────
//
// `proj_ceiling_source` has THREE values, not two:
//
//   measured-2023-25-p90-x-player-cv   a per-player volatility tail — real
//   measured-2023-25-p90               MEASURED, but a per-BAND constant
//   gaussian_z                         no calibration cell at all (K/DEF)
//
// I read `gaussian_z` as the whole non-per-player population. The middle row is
// measured and is still a cohort constant — which is precisely what 4v's own
// headline complains about. Skipping it turned 25 into 9 and 15 skill players
// into zero.
//
// ── WHY THE MIDDLE ROW IS A CONSTANT, IN THE STATISTIC E2 USED ────────────
//
// Within-cell cv of `proj_ceiling / proj_mean`:
//
//   measured-2023-25-p90          7.79e-4 WORST over 5 cells (n>=3)
//   measured-2023-25-p90-x-cv     2.06e-2 BEST over 20 cells — 26x larger
//
// The first is storage rounding: `proj_ceiling` is written to two decimals and
// `engine.js:2477` already says so in as many words. E2's original signature for
// the same defect was "within-cell cv 6.3e-04 worst". Same order, same meaning.
//
// ── WHY IT MATTERS MORE AFTER TODAY ───────────────────────────────────────
//
// `DG_HIGH_K` (0.22) is the LARGEST coefficient in `playerDollars` and it
// multiplies `ceiling - mean`. So for these players the DOMINANT term of the
// money number on the compare tray, the doctrine banner and the paths badge
// (register 5e) is a cohort constant.
//
// ⚠️ SECTIONS 2 AND 3 ARE CHARACTERIZATION and go red when B marks the display
// or the volatility work reaches these players. That is the fix reporting
// itself — update the counts in that commit, do not widen the ratchet to hide
// a regression.
//
// Run: node draft/tests/ceiling_source_window.test.js
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

const PER_PLAYER = 'measured-2023-25-p90-x-player-cv';
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
    + 'whole count meaningless and must never read as healthy',
  WINDOW.every(p => typeof p.proj_ceiling_source === 'string' && p.proj_ceiling_source),
  WINDOW.filter(p => !p.proj_ceiling_source).map(p => p.name).slice(0, 5));
}

// ── 2. THE COUNT I GOT WRONG. ⚠️ CHARACTERIZATION. ────────────────────────
{
  const nonPer = WINDOW.filter(p => p.proj_ceiling_source !== PER_PLAYER);
  const skill = nonPer.filter(p => SKILL.indexOf(p.position) >= 0);
  const byPos = {};
  nonPer.forEach(p => { byPos[p.position] = (byPos[p.position] || 0) + 1; });

  ck('DEFECT: players in the window whose ceiling is NOT per-player is well '
    + 'above the "9, all K/DEF" I reported this morning',
  nonPer.length >= 20, { non_per_player: nonPer.length, of_window: WINDOW.length,
    by_position: byPos });

  ck('DEFECT: and SKILL players are affected — the claim "not one skill player '
    + 'in his range" was the specific thing that was false',
  skill.length >= 10, { skill_affected: skill.length,
    names: skill.sort((a, b) => adp(a) - adp(b))
      .map(p => `${p.name} (${p.position}, ADP ${adp(p).toFixed(1)})`) });

  /* The one that decides whether this is worth B's time four days out: a name
   * inside the first two rounds of his board, not a deep flier. */
  const early = skill.filter(p => adp(p) <= 60).sort((a, b) => adp(a) - adp(b));
  ck('DEFECT: at least one of them sits inside ADP 60 — near enough to his '
    + 'first pick that a ceiling is what he would use to justify taking them',
  early.length >= 1, early.map(p => `${p.name} (${p.position}, ADP ${adp(p).toFixed(1)})`));

  /* CONTROL — the field discriminates. If everything read non-per-player the
   * counts above would be trivially true and would say nothing. */
  const per = WINDOW.filter(p => p.proj_ceiling_source === PER_PLAYER);
  ck('CONTROL: the per-player tail DOES cover most of the window, so this is a '
    + 'remainder and not a claim that the volatility work failed',
  per.length > nonPer.length * 2, { per_player: per.length, non_per: nonPer.length });
}

// ── 3. IT IS A BAND CONSTANT, IN THE STATISTIC E2 USED ────────────────────
{
  const bandOf = r => (r <= 3 ? '1-3' : r <= 8 ? '4-8' : r <= 16 ? '9-16'
    : r <= 32 ? '17-32' : '33+');
  const cvByCell = src => {
    const g = {};
    B.players.filter(p => p.proj_ceiling_source === src
      && Number(p.proj_mean) > 0 && p.proj_ceiling != null).forEach(p => {
      const k = p.position + '|' + bandOf(Number(p.pos_rank));
      (g[k] = g[k] || []).push(p.proj_ceiling / p.proj_mean);
    });
    return Object.keys(g).filter(k => g[k].length >= 3).map(k => {
      const v = g[k], m = v.reduce((a, b) => a + b, 0) / v.length;
      return { cell: k, n: v.length,
        cv: Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length) / m };
    });
  };
  const flat = cvByCell('measured-2023-25-p90');
  const real = cvByCell(PER_PLAYER);
  ck('both sources have enough populated cells to compare',
    flat.length >= 3 && real.length >= 10, { flat: flat.length, per_player: real.length });

  const worstFlat = Math.max.apply(null, flat.map(c => c.cv));
  const bestReal = Math.min.apply(null, real.map(c => c.cv));
  ck('measured-2023-25-p90 is FLAT within every cell — worst cv is rounding-'
    + 'sized, the same signature register E2 named (6.3e-04)',
  worstFlat < 2e-3, flat.sort((a, b) => b.cv - a.cv).slice(0, 3));
  ck('CONTROL: the per-player source is NOT flat in any cell — its BEST cell is '
    + 'an order of magnitude above the flat source\'s WORST',
  bestReal > worstFlat * 10, { worst_flat: worstFlat, best_per_player: bestReal });

  /* The rounding explanation, asserted: `proj_ceiling` is stored to 2dp, so a
   * ratio inherits ~0.01/mean of pure noise. If the flat cells' spread were
   * larger than that, "storage rounding" would be a story rather than a cause. */
  const flatPlayers = B.players.filter(p => p.proj_ceiling_source === 'measured-2023-25-p90'
    && Number(p.proj_mean) > 0);
  ck('and the residual spread is no larger than two-decimal storage explains, '
    + 'so "rounding" is a cause rather than a story about one',
  flatPlayers.every(p => Math.abs(p.proj_ceiling * 100 - Math.round(p.proj_ceiling * 100)) < 1e-6),
  flatPlayers.filter(p => Math.abs(p.proj_ceiling * 100 - Math.round(p.proj_ceiling * 100)) >= 1e-6)
    .slice(0, 3).map(p => `${p.name} ${p.proj_ceiling}`));
}

// ── 4. WHY IT REACHES THE MONEY NUMBER (register 5e) ──────────────────────
{
  const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
  ck('DG_HIGH_K is the largest coefficient in playerDollars, so the ceiling '
    + 'drives the dollar figure more than the projection does',
  E.CFG.DG_HIGH_K > E.CFG.DG_ENTRY_K + E.CFG.DG_RS_K,
  { high: E.CFG.DG_HIGH_K, season: E.CFG.DG_ENTRY_K + E.CFG.DG_RS_K });

  const nonPerSkill = WINDOW.filter(p => p.proj_ceiling_source !== PER_PLAYER
    && SKILL.indexOf(p.position) >= 0 && Number(p.proj_mean) > 0);
  const boomShare = p => {
    const d = E.playerDollars(p);
    return d.total > 0 ? d.high / d.total : 0;
  };
  const shares = nonPerSkill.map(boomShare).filter(x => x > 0);
  ck('and for the affected skill players the boom term is a large share of '
    + 'their price, so the constant is not a rounding detail',
  shares.length && shares.reduce((a, b) => a + b, 0) / shares.length > 0.4,
  { n: shares.length,
    mean_boom_share: +(shares.reduce((a, b) => a + b, 0) / (shares.length || 1)).toFixed(3) });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
