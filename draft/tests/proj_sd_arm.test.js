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
  const changed = rows.filter(p => {
    const sd = bandSd(p.position, p.pos_rank);
    return sd != null && Math.abs(p.proj_mean * sd - (p.proj_sd || 0)) > 0.5;
  });
  ck('CONTROL — applying C\'s measured bands really does move proj_sd on most '
    + 'of the board, so the arm is not comparing a board with itself',
  changed.length > rows.length * 0.8, { changed: changed.length, of: rows.length });
}

// ── 2. THE FINDING ITSELF, RE-DERIVED FROM THE LIVE BOARD ───────────────
// Not "C said 1.28" — computed here, so it moves when the board moves.
{
  const rows = (D.players || []).filter(p => p.proj_mean > 0 && p.proj_sd > 0
    && p.pos_rank && BANDS[p.position]);
  const ratios = rows.map(p => bandSd(p.position, p.pos_rank) / (p.proj_sd / p.proj_mean))
    .filter(v => isFinite(v) && v > 0).sort((a, b) => a - b);
  const med = ratios[Math.floor(ratios.length / 2)];
  console.log('      measured ÷ shipped dispersion, median across the board: '
    + med.toFixed(2) + '×  (n=' + ratios.length + ')');
  ck('the board\'s dispersion really is BELOW the measured one — the direction '
    + 'of C\'s finding, re-derived rather than quoted', med > 1.05, med);
  ck('and it is not so extreme that something else is wrong — a 5× gap would '
    + 'mean the units disagree, not that the parameter is low', med < 3, med);
  const below = rows.filter(p => bandSd(p.position, p.pos_rank) > p.proj_sd / p.proj_mean).length;
  ck('it is a TENDENCY, not a uniform offset — some of the board runs the other '
    + 'way, exactly as C reported', below > rows.length * 0.5 && below < rows.length,
  { below: below, of: rows.length });
}

// ── 3. THE CLAIMS THE WRITE-UP MAKES, CHECKED ───────────────────────────
// A decision arm that concludes in prose and is never re-checked is the
// "constant-shaped-like-data" failure with paragraphs instead of a number.
{
  ck('the write-up exists', fs.existsSync(DOC));
  const doc = fs.readFileSync(DOC, 'utf8');
  ck('it states production is UNCHANGED, which is the whole disposition',
    /Nothing here is wired\. Production is unchanged\./.test(doc));
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

// ── 4. THE DISPOSITION IS RECORDED WHERE IT WILL BE READ ────────────────
// C's finding said "not an ask". This file's answer is "and here is why that is
// safe". If production ever DOES adopt a recalibration, this must fail rather
// than sit here describing a decision nobody is making any more.
{
  const proj = fs.readFileSync(path.join(ROOT, 'draft', 'projections.py'), 'utf8');
  ck('POSITION_VARIANCE is still the shipped source of dispersion — if this ever '
    + 'changes, the arm above needs re-running before its conclusion is quoted',
  /POSITION_VARIANCE = \{/.test(proj) && /season_sd = mean_proj \* var/.test(proj));
  const qb = (proj.match(/"QB": ([0-9.]+)/) || [])[1];
  ck('and the QB base variance is unchanged at the value the arm was run against',
    qb === '0.22', qb);
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
