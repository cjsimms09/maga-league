// TERRITORY: A
/* CALIBRATION DRIFT — detected automatically, PROPOSED never applied.
 *
 * THE DOCUMENTED DEFECT THIS WATCHES. `survival_honesty.test.js` pins it in the
 * repo's own words: the survival model **over-predicts departures by 15% at best
 * and 57% at worst**, depending on the window. That is a KNOWN, MEASURED,
 * UNCORRECTED bias sitting under VONA, which is computed from survival, which is
 * the largest term in the draft-side composite.
 *
 * IT HAS BEEN KNOWN FOR WEEKS AND NOTHING WATCHES IT. The number lives in a test
 * assertion, so it fires only when somebody runs the suite and only tells them it
 * is still true. Nothing notices if it gets WORSE, and nothing proposes a
 * correction when enough graded observations exist to support one.
 *
 * ── WHY THIS PROPOSES AND NEVER APPLIES ─────────────────────────────────────
 *
 * Same rule as the graduation gate, for the same reason: an automatic correction
 * that quietly rewrote a calibration would be the two-places disease with a
 * faster clock. And the specific hazard here is sharper than usual — **a
 * self-correcting survival model would be fitting itself to its own residuals**,
 * which is how a model stops being able to be wrong. So this emits a PROPOSAL
 * carrying its evidence and its own detectable-effect floor, and a human decides.
 *
 * ── AND IT MUST NOT PROPOSE ON NOISE ────────────────────────────────────────
 *
 * The floor is the same discipline as the component rows: a drift smaller than
 * the design could resolve is not a drift, and a proposal built on one would
 * quietly repoint the board using sampling error. Below the floor it reports the
 * number and proposes NOTHING.
 */
'use strict';

/* The bias the repo has already measured and pinned, so a NEW reading has
 * something to be compared against rather than being read as absolute. Stated
 * here as data rather than left in a test assertion where nothing can read it. */
const KNOWN = {
  survival: {
    what: 'the survival model over-predicts DEPARTURES — players are taken less '
      + 'often than it says',
    range_pct: [15, 57],
    source: 'draft/tests/survival_honesty.test.js',
    // Drift is measured against the MIDPOINT of the known range, because the
    // range is window-dependent and a single reading is a single window.
    baseline_pct: 36,
  },
};

/* WORSE, BETTER, or WITHIN. A calibration that improves is as much a change as
 * one that degrades — if the bias halves, the correction somebody applied on the
 * old figure is now wrong in the other direction. */
function classify(observedPct, baselinePct, floorPct) {
  const d = observedPct - baselinePct;
  if (Math.abs(d) < floorPct) return 'within';
  return d > 0 ? 'worse' : 'better';
}

/* The smallest drift this many independent observations could resolve.
 *
 * CLUSTERED, and the unit is named by the caller — survival clusters by DRAFT,
 * not by forecast, because a run moves every forecast in a window together.
 * Returns null below two clusters, where the quantity does not exist rather than
 * being large.
 */
function floor(nClusters, sdPct) {
  if (!(nClusters >= 2)) return null;
  return Math.round((2.8 * (sdPct == null ? 20 : sdPct) / Math.sqrt(nClusters)) * 10) / 10;
}

/* ONE READING -> a proposal or a silence.
 *
 * `observed` is the measured over-prediction in percent. `n_clusters` is the
 * count in the unit the component declares. Everything else is declared by the
 * caller so nothing here invents a threshold.
 */
function assess(opts) {
  const o = opts || {};
  const known = KNOWN[o.component];
  if (!known) {
    throw new Error(`calibration_drift: no known baseline for "${o.component}". `
      + 'A drift reading with nothing to drift FROM is an absolute measurement '
      + 'wearing a comparison\'s clothes, and it would propose against a number '
      + 'nobody recorded.');
  }
  if (o.observed_pct == null || o.n_clusters == null) {
    throw new Error('calibration_drift: observed_pct and n_clusters are required '
      + 'and have no defaults — a drift with no sample size cannot be told from '
      + 'sampling error, which is the only thing that makes a proposal safe.');
  }
  const f = floor(Number(o.n_clusters), o.sd_pct);
  const observed = Number(o.observed_pct);
  const base = known.baseline_pct;

  if (f == null) {
    return { component: o.component, status: 'too_thin', observed_pct: observed,
      baseline_pct: base, n_clusters: Number(o.n_clusters), floor_pct: null,
      proposal: null,
      why: `${o.n_clusters} cluster(s) — below two there is no sampling `
        + 'distribution at all, so no reading here is distinguishable from noise' };
  }
  const state = classify(observed, base, f);
  if (state === 'within') {
    return { component: o.component, status: 'within_floor', observed_pct: observed,
      baseline_pct: base, n_clusters: Number(o.n_clusters), floor_pct: f,
      proposal: null,
      why: `drift of ${Math.round((observed - base) * 10) / 10}pp against a floor `
        + `of ${f}pp — smaller than this design can resolve, so it proposes nothing` };
  }
  return {
    component: o.component,
    status: state === 'worse' ? 'drifted_worse' : 'drifted_better',
    observed_pct: observed, baseline_pct: base,
    n_clusters: Number(o.n_clusters), floor_pct: f,
    drift_pp: Math.round((observed - base) * 10) / 10,
    /* THE PROPOSAL, and it is a PROPOSAL — a number to review, with the evidence
     * attached and no mechanism anywhere that applies it. */
    proposal: {
      action: 'RE-CALIBRATE ' + o.component,
      suggested_correction_pct: Math.round(observed * 10) / 10,
      applies_to: known.what,
      evidence: `observed ${observed}% against a recorded ${base}% `
        + `(range ${known.range_pct[0]}-${known.range_pct[1]}%, ${known.source}), `
        + `over ${o.n_clusters} clusters, floor ${f}pp`,
      /* NAMED BECAUSE IT IS THE HAZARD. */
      caution: 'a survival model corrected against its own residuals is fitting '
        + 'itself and can no longer be wrong. Any correction must be graded '
        + 'against observations that did not produce it.',
      applied: false,
      requires: 'human review — this file contains no code that applies it',
    },
    why: `${state === 'worse' ? 'worse' : 'better'} than recorded by `
      + `${Math.abs(Math.round((observed - base) * 10) / 10)}pp, which exceeds the `
      + `${f}pp floor`,
  };
}

module.exports = { KNOWN, assess, floor, classify };
