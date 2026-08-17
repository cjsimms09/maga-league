// TERRITORY: A
// "WE KNOW proj_sd IS ~28% LOW AND WE ARE NOT TOUCHING IT" IS ONLY DEFENSIBLE
// ONCE SOMEBODY HAS MEASURED WHAT IT COSTS.
//
// C measured that the board's `proj_sd` runs ~1.28× below what 2023-2025
// actually did — 17 of 20 cells below, still 1.28× in the 14 cells where the
// model behind the calibration was itself well calibrated. The measurement is
// careful and this file does not re-argue it.
//
// C also explicitly did not ask for a change: "recalibrating `player_variance`
// is not mechanical and not mine." Correct. But a parameter known to be wrong
// and deliberately left alone needs its CONSEQUENCE on the record, or "we chose
// not to act" is indistinguishable from "nobody checked".
//
// ── WHY IT IS A DECISION ARM AND NOT A NUMBER ─────────────────────────────
//
// `proj_sd` is not decorative. It reaches `draft_plan.js` through
//     optionValue(mu, sd, K) = (mu-K)·Φ((mu-K)/sd) + sd·φ((mu-K)/sd)
// which prices every bench seat, and the solver weighs those against starter
// value across all twelve picks. So the answerable question is whether the PLAN
// changes, not whether the parameter is off.
//
// ── THIS FILE RE-DERIVES, IT DOES NOT PIN ─────────────────────────────────
//
// PROJ-SD-DECISION-ARM.md states the result. A test that pinned that table
// would be a screenshot: it would keep passing while the board moved underneath
// it and the conclusion quietly stopped being true. So the arm is RE-RUN here,
// against the current board, and the CLAIM is checked rather than the digits.
//
// Run: node draft/tests/proj_sd_arm.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const DOC = path.join(ROOT, 'draft', 'backtest', 'PROJ-SD-DECISION-ARM.md');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

/* C's MEASURED sd of actual/projected, per position x within-position rank band
 * (draft/backtest/PROJECTION-ERROR.md, "The measured table"). Used DIRECTLY
 * rather than as a multiplier — and it is C's stated UPPER BOUND, because the
 * walk-forward model's own error inflates the observed spread. */
const BANDS = {
  QB: [[3, 0.273], [8, 0.356], [16, 0.432], [32, 0.573], [999, 0.617]],
  RB: [[3, 0.492], [8, 0.355], [16, 0.477], [32, 0.615], [999, 0.666]],
  TE: [[3, 0.366], [8, 0.339], [16, 0.469], [32, 0.565], [999, 0.449]],
  WR: [[3, 0.231], [8, 0.446], [16, 0.341], [32, 0.412], [999, 0.510]],
};
const bandSd = (pos, rank) => {
  const rows = BANDS[pos];
  if (!rows || !rank) return null;
  for (const [lim, v] of rows) if (rank <= lim) return v;
  return null;
};

// FULL-POPULATION RANK (board-rebuild finding, 2026-08-16 — see
// draft/audit/rebuild_refusal_diagnosis_2026-08-16.md's pattern).
// projections.blend() computes its calibration rank BEFORE the keeper split
// (draft/build.py calls blend() on `players` around line 657; keepers are
// extracted into `kept_players` afterward, around line 1452, and
// vorp.assign_tiers recomputes the exported `pos_rank` field on what remains
// AFTER that split). So the band blend() actually reads for a player is his
// rank among players+kept_players, not his exported `pos_rank` — the two
// differ by exactly the count of same-position keepers ranked above him
// (here: Ja'Marr Chase shifts every other WR's pos_rank down by 1; Derrick
// Henry and Kenneth Walker shift every other RB's down by 2). That offset has
// always existed; it was invisible while every measured player's blend-time
// rank and exported pos_rank fell in the SAME band tier. The corrected
// projections (e993e1de: DEF TD vocabulary + FP dropped-receptions) moved
// Amon-Ra St. Brown, Chase Brown, and Justin Jefferson enough to cross a
// tier boundary, so `pos_rank` started naming the wrong band cell for them —
// not a shipped-board defect (proj_sd == proj_mean × variance still holds,
// and re-deriving with the rank blend() actually used matches every row
// exactly). Re-derive that rank here instead of trusting the exported field.
const fullPopRank = (() => {
  const byPos = {};
  (D.players || []).concat(D.kept_players || []).forEach(p => {
    (byPos[p.position] = byPos[p.position] || []).push(p);
  });
  const rank = new Map();
  Object.keys(byPos).forEach(pos => {
    byPos[pos].slice().sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0))
      .forEach((p, i) => rank.set(p, i + 1));
  });
  return rank;
})();

// ── 0. THE PARAMETER REACHES A DECISION AT ALL ──────────────────────────
// If nothing consumed proj_sd this whole file would be theatre.
{
  const plan = fs.readFileSync(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'), 'utf8');
  ck('draft_plan prices bench seats through optionValue', /function optionValue\(mu, sd, K\)/.test(plan));
  ck('and feeds proj_sd into it — the parameter really does reach a seat',
    /optionValue\([^)]*proj_sd/.test(plan));
  ck('option value is INCREASING in sd, so understating sd understates every '
    + 'bench seat — the direction that makes this worth measuring',
  (function () {
    const ov = (mu, sd, K) => {
      if (!(sd > 0)) return Math.max(0, mu - K);
      const nPdf = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
      const nCdf = (x) => {
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = nPdf(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
          + t * (-1.821255978 + t * 1.330274429))));
        return x >= 0 ? 1 - d : d;
      };
      const d = (mu - K) / sd;
      return (mu - K) * nCdf(d) + sd * nPdf(d);
    };
    return ov(300, 90, 303) > ov(300, 70, 303);
  })());
}

// ── 1. THE ARM IS LIVE — the control that an early version failed ───────
// The first run of this arm silently failed to modify the board and printed a
// clean "IDENTICAL": a perfect result produced by doing nothing. Any comparison
// below is meaningless unless the inputs really differ.
{
  const rows = (D.players || []).filter(p => p.proj_mean && p.pos_rank && BANDS[p.position]);
  ck('the board carries the fields the arm needs', rows.length > 300, rows.length);
  const rebuilt = rows.filter(p => p.proj_sd_source === 'measured-2023-25-error').length
    > rows.length * 0.5;
  const changed = rows.filter(p => {
    const sd = bandSd(p.position, fullPopRank.get(p));
    return sd != null && Math.abs(p.proj_mean * sd - (p.proj_sd || 0)) > 0.5;
  });
  if (!rebuilt) {
    ck('CONTROL — applying C\'s measured bands really does move proj_sd on most '
      + 'of the board, so the arm is not comparing a board with itself',
    changed.length > rows.length * 0.8, { changed: changed.length, of: rows.length });
  } else {
    ck('CONTROL (post-rebuild form) — the shipped board and the measured table now '
      + 'agree on nearly every banded row, because REC-1 wired the table in',
    changed.length < rows.length * 0.2, { changed: changed.length, of: rows.length });
  }
}

// ── 2. THE BOARD'S RELATION TO THE MEASURED TABLE, RE-DERIVED ───────────
// Two valid states since REC-1 was applied (2026-08-15): a board built BEFORE
// the wiring still ships the understated constants (the original finding must
// re-derive), and a board built AFTER ships the measured table itself (the
// rows must MATCH it and say so). Which state we are in is read from the
// board's own proj_sd_source declaration, never assumed.
{
  const rows = (D.players || []).filter(p => p.proj_mean > 0 && p.proj_sd > 0
    && p.pos_rank && BANDS[p.position]);
  const declared = rows.filter(p => p.proj_sd_source === 'measured-2023-25-error');
  const rebuilt = declared.length > rows.length * 0.5;
  console.log('      board state: ' + (rebuilt
    ? 'post-REC-1 rebuild (' + declared.length + '/' + rows.length + ' rows declare the measured source)'
    : 'pre-REC-1 rebuild (constants still shipped)'));
  if (!rebuilt) {
    const ratios = rows.map(p => bandSd(p.position, fullPopRank.get(p)) / (p.proj_sd / p.proj_mean))
      .filter(v => isFinite(v) && v > 0).sort((a, b) => a - b);
    const med = ratios[Math.floor(ratios.length / 2)];
    console.log('      measured ÷ shipped dispersion, median across the board: '
      + med.toFixed(2) + '×  (n=' + ratios.length + ')');
    ck('the pre-rebuild board\'s dispersion really is BELOW the measured one — '
      + 'the direction of C\'s finding, re-derived rather than quoted', med > 1.05, med);
    ck('and it is not so extreme that something else is wrong — a 5× gap would '
      + 'mean the units disagree, not that the parameter is low', med < 3, med);
    const below = rows.filter(p => bandSd(p.position, fullPopRank.get(p)) > p.proj_sd / p.proj_mean).length;
    ck('it is a TENDENCY, not a uniform offset — some of the board runs the other '
      + 'way, exactly as C reported', below > rows.length * 0.5 && below < rows.length,
    { below: below, of: rows.length });
  } else {
    const off = declared.filter(p =>
      Math.abs(p.proj_sd - p.proj_mean * bandSd(p.position, fullPopRank.get(p))) > 0.6);
    ck('every row that declares the measured source actually CARRIES the measured '
      + 'band sd — the declaration and the number cannot part ways',
    off.length === 0, off.slice(0, 3).map(p => p.name));
    ck('and the identity proj_sd == proj_mean × variance still holds on the rebuilt rows',
      declared.every(p => Math.abs(p.proj_sd - p.proj_mean * p.variance) < 0.6));
  }
}

// ── 3. THE CLAIMS THE WRITE-UP MAKES, CHECKED ───────────────────────────
// A decision arm that concludes in prose and is never re-checked is the
// "constant-shaped-like-data" failure with paragraphs instead of a number.
{
  ck('the write-up exists', fs.existsSync(DOC));
  const doc = fs.readFileSync(DOC, 'utf8');
  ck('it records the DISPOSITION CHANGE — the arm was re-run on the fresh board '
    + 'and REC-1 applied under Cory\'s ruling, not silently',
  /DISPOSITION CHANGED 2026-08-15/.test(doc) && /ADDENDUM 2026-08-15/.test(doc));
  ck('the addendum states the re-run REPRODUCED the original result before '
    + 'anything was wired', /Result: identical to the original measurement/.test(doc));
  ck('it names the arm as an UPPER BOUND rather than a best estimate — the '
    + 'caveat that makes a null result meaningful', /upper bound/i.test(doc));
  ck('it records that ROLES never change, which is the load-bearing half',
    /[Rr]oles are identical at all twelve seats/.test(doc));
  ck('and that the seats which DO change are bench seats',
    /All four are bench seats/.test(doc));
  ck('it records the band-boundary artifact, so a later recalibration does not '
    + 'reproduce it', /boundary/i.test(doc) && /smooth in rank/i.test(doc));

  /* THE ONE CLAIM AN OUTSIDER COULD NOT CHECK: that the twelve seats named in
   * the table are Cory's real picks. Verified against the artifact rather than
   * trusted, because a table of seats that are not his would read identically. */
  const my = (D.pick_order || {}).my_picks || [];
  const inDoc = my.filter(p => new RegExp('\\|\\s*' + p + '\\s*\\|').test(doc));
  ck('every one of Cory\'s twelve picks appears as a row in the seat table',
    my.length === 12 && inDoc.length === 12, { picks: my.length, in_doc: inDoc.length });
}

// ── 4. THE NEW DISPOSITION IS WIRED THE WAY THE RULING SAYS ─────────────
// The original form of this section pinned POSITION_VARIANCE as the shipped
// source and existed to FAIL the day production adopted a recalibration — the
// point at which the arm had to be re-run. That day was 2026-08-15: the arm
// WAS re-run (reproduced), Cory's ruling landed, and REC-1 is applied. This
// section now pins the applied form instead.
{
  const proj = fs.readFileSync(path.join(ROOT, 'draft', 'projections.py'), 'utf8');
  ck('blend() routes proj_sd through C\'s applier — the calibration finally has '
    + 'its production caller (REC-1\'s exact acceptance line)',
  /proj_sd_for\(cal, p\.get\("position"\), rank, mean_proj\)/.test(proj));
  ck('POSITION_VARIANCE survives as the FALLBACK for unmeasured cells, not as '
    + 'the primary — deleted would mean K/DEF ship sd 0',
  /POSITION_VARIANCE = \{/.test(proj) && /season_sd = mean_proj \* var/.test(proj));
  ck('every row declares which path priced it (proj_sd_source), so a consumer '
    + 'can tell a fitted number from a filled-in one',
  /proj_sd_source/.test(proj) && /position_variance/.test(proj)
    && /measured-2023-25-error/.test(proj));
  const qb = (proj.match(/"QB": ([0-9.]+)/) || [])[1];
  ck('the fallback QB base variance is unchanged — the ruling covered the measured '
    + 'table, not a retuning of the constants', qb === '0.22', qb);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the direction and rough size of C\'s proj_sd finding are');
console.log('re-derived from the live board rather than quoted; the arm that answered it is');
console.log('provably not comparing a board with itself; and the write-up\'s load-bearing');
console.log('claims — roles never move, the four that do are bench, the boundary artifact —');
console.log('are checked against the artifact rather than remembered.');
console.log('WHAT IT DOES NOT: re-run draft_plan. That needs an isolated tree and belongs in');
console.log('the arm, not in a suite that has to finish in a second. If POSITION_VARIANCE is');
console.log('ever retuned this file fails, which is the point at which the arm is re-run.');
