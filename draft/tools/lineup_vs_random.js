#!/usr/bin/env node
'use strict';
/* TERRITORY: D
 * THE START/SIT DECISION, SCORED AGAINST A CONSTRUCTED NULL — for the ARM,
 * not for the owners.
 *
 * `GRADING-POLICY.md` requirement 2 names the null for a start/sit decision:
 * "a random legal lineup from the roster held that week". A's
 * `start_sit_vs_random.py` builds it and grades OWNERS with it — but it
 * chooses AND scores from one `pts` dict, so it cannot score a projection-fed
 * arm at all. `lineup_edge_backtest.js` does choose on projections and score
 * on actuals, and already computes the perfect-hindsight ceiling, but before
 * 2026-08-21 it had ZERO mentions of `random`: it compared the tool to the
 * HUMANS, which is the outcome-vs-owners shape the 08-21 policy replaces, and
 * which P143 failed its NULL requirement for.
 *
 * This closes that gap once for both rows that need it — P298 (the frozen
 * no-learning baseline's arm and the learning arm must score against the SAME
 * null, so the cross-propagation question becomes the difference of their
 * margins) and P314 (P143's successor).
 *
 * THE NULL, and how it is drawn. `bestLineup()` is fed RANDOM scores instead
 * of projections. The solver then returns the legal assignment that maximises
 * those random scores — a legal lineup chosen at random, using the SOLVER'S
 * OWN legality rules rather than a second implementation of them (Rule 11: a
 * hand-rolled "legal" that drifts from the solver's would silently grade the
 * arm against lineups it was never allowed to pick). ⚠️ DECLARED, because it
 * matters: this is NOT uniform over legal lineups. It is a random draw with
 * full support, and the known-negative control below is what certifies it
 * behaves like a null — an agent choosing at random must land at its centre.
 *
 * THE CONTROLS (requirement 3), and they gate the exit code:
 *   known-NEGATIVE — an agent choosing at random must land at the null's
 *     centre. ⚠️ DRAWN FROM AN INDEPENDENT RNG STREAM, never from the sample
 *     it is scored against. The policy records why in its own words: the
 *     first version of A's start/sit known-negative scored an element drawn
 *     FROM the null AGAINST that null, which is 0.5 by construction, cannot
 *     fail, and was caught by the external auditor rather than by us.
 *   known-POSITIVE — perfect hindsight must land at the extreme.
 *   NON-DEGENERATE NULL — the null draws must actually spread. A null whose
 *     draws are all identical makes every percentile meaningless while
 *     looking entirely normal from outside, and neither control above would
 *     notice: the oracle still tops it and a random agent still ties at the
 *     centre. This is the third check register 198's boom-baseline break
 *     argued for.
 *
 * THE MARGIN (requirement 4): points left against perfect hindsight FIRST —
 * the unit that pays — and the percentile only after. Beating random is a low
 * bar; random benches your stars.
 *
 * Deterministic: fixed seed AND fixed iteration order, per the policy's rule.
 * Zero-network, report-only. Nothing here ships to the board.
 *
 * Run:  node draft/tools/lineup_vs_random.js
 * Test: node draft/tests/lineup_vs_random.test.js
 */
const path = require('path');
const fs = require('fs');
const LO = require(path.join(__dirname, '..', '..', 'src', 'routes', 'lineup.js'));
const EB = require(path.join(__dirname, 'lineup_edge_backtest.js'));

const N_DRAWS = 200;
const SEED_NULL = 20260821;
const SEED_NEGATIVE = 987654321;   // a DIFFERENT stream — see the header
const CENTRE_TOLERANCE = 0.03;     // the known-negative's band around 0.50
/* Points are summed in a different order for the oracle than for a draw, so
 * two identical lineups can differ by ~1e-14. Measured, not guessed: 26 draws
 * of 84,000 read as "strictly above" the oracle with a max excess of
 * 5.7e-14. */
const EPS = 1e-9;

/* mulberry32 — small, seeded, and reproducible across node versions. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One legal lineup drawn at random from `ids`, using the solver's own rules. */
function randomLegalLineup(ids, pos, slots, rand) {
  const scores = {};
  for (const pid of ids) scores[pid] = rand();     // fixed iteration order
  return LO.bestLineup(scores, pos, ids, slots);
}

function pointsOf(lineup, pts) {
  return lineup.starters.reduce((a, st) => a + (pts[st.pid] || 0), 0);
}

/** Fraction of null draws the value beats, ties counted as half. */
function percentile(value, draws) {
  if (!draws.length) return null;
  let below = 0, tied = 0;
  for (const d of draws) { if (d < value) below++; else if (d === value) tied++; }
  return (below + tied / 2) / draws.length;
}

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}

/**
 * Score every graded owner-week. Returns per-week records carrying the arm's
 * percentile, the two controls' percentiles, and the points-left margin.
 */
function grade(seasons, projectFn) {
  const weeks = [];
  const nullStream = rng(SEED_NULL);
  const negStream = rng(SEED_NEGATIVE);

  EB.backtest(seasons, projectFn, (w) => {
    const ids = w.rosterIds.slice().sort();          // fixed iteration order
    const draws = [];
    for (let i = 0; i < N_DRAWS; i++) {
      draws.push(pointsOf(randomLegalLineup(ids, w.pos, w.slots, nullStream), w.pts));
    }
    // The known-negative: an INDEPENDENT random agent, not one of `draws`.
    const negPoints = pointsOf(randomLegalLineup(ids, w.pos, w.slots, negStream), w.pts);
    // The known-positive: perfect hindsight, the same solver on real results.
    const oracle = LO.bestLineup(w.pts, w.pos, ids, w.slots);
    const oraclePoints = pointsOf(oracle, w.pts);

    weeks.push({
      season: w.season, roster_id: w.roster_id, week: w.week,
      arm_points: w.toolPoints,
      human_points: w.actualPoints,
      oracle_points: Math.round(oraclePoints * 100) / 100,
      arm_percentile: percentile(w.toolPoints, draws),
      human_percentile: percentile(w.actualPoints, draws),
      negative_percentile: percentile(negPoints, draws),
      oracle_percentile: percentile(oraclePoints, draws),
      // requirement 4: the unit that pays, FIRST.
      arm_points_left: Math.round((oraclePoints - w.toolPoints) * 100) / 100,
      human_points_left: Math.round((oraclePoints - w.actualPoints) * 100) / 100,
      null_mean: Math.round(mean(draws) * 100) / 100,
      null_sd: Math.round(sd(draws) * 1000) / 1000,
      oracle_tops_every_draw: draws.every(d => d <= oraclePoints + EPS),
    });
  });
  return weeks;
}

function controls(weeks) {
  const checks = [];
  if (!weeks.length) {
    return { ok: false, checks: [{ control: 'fixture', case: 'any graded weeks at all',
      want: '> 0', got: 0, ok: false }] };
  }
  const negMean = mean(weeks.map(w => w.negative_percentile));
  checks.push({
    control: 'known-negative',
    case: 'an INDEPENDENTLY drawn random agent lands at the null centre',
    want: `0.50 +/- ${CENTRE_TOLERANCE}`, got: Math.round(negMean * 10000) / 10000,
    ok: Math.abs(negMean - 0.5) <= CENTRE_TOLERANCE,
  });
  /* ⚠️ THIS CONTROL FAILED ON ITS FIRST RUN AND THE FIRST VERSION OF IT WAS
   * WRONG, NOT THE ARM. It asserted `oracleMean === 1` — perfect hindsight
   * sits at percentile 1.0. Measured instead of argued with: in 133 of 420
   * owner-weeks (31.7%) at least one random legal lineup TIES the oracle,
   * because a roster with few legal permutations lets a blind draw stumble
   * onto the optimum. `percentile()` counts ties as half, so hindsight
   * legitimately scores below 1.0 in a third of weeks. The assertion encoded
   * an assumption about the data that the data does not hold.
   *
   * What replaces it still fails for every real reason the old one would
   * have: invert the percentile and (b) collapses; align the oracle to the
   * wrong week's points, or break the solver's optimality, or draw the null
   * from a different roster, and (a) or (c) goes red. */
  const beaten = weeks.filter(w => !w.oracle_tops_every_draw).length;
  checks.push({
    control: 'known-positive', case: '(a) no null draw beats perfect hindsight, any week',
    want: 0, got: beaten, ok: beaten === 0,
  });
  const oracleMean = mean(weeks.map(w => w.oracle_percentile));
  checks.push({
    control: 'known-positive', case: '(b) hindsight sits at the top of the null',
    want: '>= 0.99', got: Math.round(oracleMean * 10000) / 10000, ok: oracleMean >= 0.99,
  });
  const dominatesBoth = weeks.every(w =>
    w.oracle_points >= w.arm_points - EPS && w.oracle_points >= w.human_points - EPS);
  checks.push({
    control: 'known-positive', case: '(c) hindsight is >= both the arm and the human, every week',
    want: true, got: dominatesBoth, ok: dominatesBoth,
  });
  // The vacuity guard: a null with no spread makes every percentile above
  // meaningless, and NEITHER control on its own would notice.
  const flat = weeks.filter(w => w.null_sd === 0).length;
  checks.push({
    control: 'non-degenerate null', case: 'weeks whose null draws are all identical',
    want: 0, got: flat, ok: flat === 0,
  });
  return { ok: checks.every(c => c.ok), checks };
}

function summarize(weeks) {
  const armPct = weeks.map(w => w.arm_percentile);
  const humanLeft = weeks.map(w => w.human_points_left);
  const armLeft = weeks.map(w => w.arm_points_left);
  return {
    n_owner_weeks: weeks.length,
    n_draws_per_week: N_DRAWS,
    // requirement 4: points first.
    arm_points_left_per_week: Math.round(mean(armLeft) * 100) / 100,
    human_points_left_per_week: Math.round(mean(humanLeft) * 100) / 100,
    arm_minus_human_points: Math.round((mean(humanLeft) - mean(armLeft)) * 100) / 100,
    arm_mean_percentile: Math.round(mean(armPct) * 10000) / 10000,
    /* The owners' own percentile on the SAME null. A's `start_sit_vs_random.py`
     * measures this independently in Python over its own population (530
     * owner-weeks, mean 0.8497). Two implementations that share no code
     * landing in the same place is a cross-check neither could give alone —
     * and if they diverge, one of them is wrong and we find out here rather
     * than in a conclusion. */
    human_mean_percentile: Math.round(mean(weeks.map(w => w.human_percentile)) * 10000) / 10000,
    null_centre: 0.5,
    seasons: [...new Set(weeks.map(w => w.season))].sort(),
  };
}

function printControls(res) {
  const bad = res.checks.filter(c => !c.ok);
  console.log(`  controls: ${res.checks.length - bad.length}/${res.checks.length} pass`);
  for (const c of bad) {
    console.log(`    RED  ${c.control} — ${c.case}: want ${c.want}, got ${c.got}`);
  }
}

function cli() {
  const weeks = grade();
  const res = controls(weeks);
  printControls(res);
  if (!res.ok) {
    console.log('\n  ⛔ REFUSING: a control failed, so the numbers below are not '
      + 'evidence of anything. Artifact NOT written.');
    return 1;
  }
  const s = summarize(weeks);
  const out = path.join(__dirname, '..', 'backtest', 'lineup_vs_random.json');
  fs.writeFileSync(out, JSON.stringify({
    _territory: 'TERRITORY: D — produced by draft/tools/lineup_vs_random.js',
    _note: 'The start/sit decision scored against a constructed null of legal '
      + 'alternatives, for the ARM. GRADING-POLICY.md requirements 1-4. Report only.',
    seed_null: SEED_NULL, seed_negative: SEED_NEGATIVE,
    controls: res, summary: s, weeks,
  }, null, 2));
  console.log(`\n  ${s.n_owner_weeks} owner-weeks, ${N_DRAWS} null draws each`);
  console.log(`  POINTS LEFT vs perfect hindsight (the unit that pays):`);
  console.log(`    arm    ${s.arm_points_left_per_week}/wk`);
  console.log(`    humans ${s.human_points_left_per_week}/wk`);
  console.log(`    arm - humans: ${s.arm_minus_human_points >= 0 ? '+' : ''}${s.arm_minus_human_points} pts/wk`);
  console.log(`  and only then the percentile: arm ${s.arm_mean_percentile} vs a null centre of 0.5`);
  console.log(`  wrote ${path.relative(process.cwd(), out)}`);
  return 0;
}

module.exports = {
  grade, controls, summarize, randomLegalLineup, percentile, rng, cli,
  N_DRAWS, SEED_NULL, SEED_NEGATIVE, CENTRE_TOLERANCE,
};

if (require.main === module) process.exit(cli());
