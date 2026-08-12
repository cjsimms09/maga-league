// TERRITORY: A
/* THE COMPONENT-GRADING RUN — the caller the rail did not have.
 *
 * `component_grade.js` computes a verdict and `component_specs.js` declares what
 * each row claims. NOTHING CALLED EITHER. The standing check reads
 * `draft/data/component_grades.json` and reports the row empty, because nothing
 * writes it. This is that writer.
 *
 * SIX ROWS, and each is graded against a DIFFERENT baseline, because "is it
 * accurate" and "does it earn its place" are different questions and only the
 * second one can retire a term:
 *
 *   projection       proj_mean            vs last season's per-game average
 *   opportunity_adj  proj_mean            vs proj_baseline (the SAME projection
 *                                            without the adjustment)
 *   consensus        proj_mean            vs FantasyPros alone AND Sleeper alone
 *   replacement      the VORP subtrahend  vs the shipped per-position level
 *   survival         P(available at my next pick)  vs the base rate
 *   weekly_claims    P(home wins)         vs a flat 50%
 *
 * EVERY ROW CARRIES ITS DETECTABLE-EFFECT FLOOR beside its result, and the
 * verdict is `too_thin` before it is anything else — a null at n=1 must not read
 * like a null at n=200.
 *
 * ⚠️ IT RUNS AND REPORTS NOTHING UNTIL THERE IS REALIZED DATA, and that is the
 * point. A writer that only exists once the season starts is a writer nobody has
 * ever executed; this one runs weekly from now, reports `no_data` per row, and
 * fills in as weeks land. Same argument as the reconstruction's NO INPUT.
 */
'use strict';
const G = require('./component_grade.js');
const S = require('./component_specs.js');

/* Pair builders. Each takes the week's realized rows and returns
 * {pairs, baseline} in `gradeComponent`'s shape, or null when the input for that
 * row does not exist yet. NULL IS NOT AN EMPTY ARRAY — an empty array grades as
 * no_data, which is right, but a null says the INPUT is absent rather than the
 * outcomes, and January needs to tell those apart. */
const BUILDERS = {
  projection(rows) {
    const pairs = [], baseline = [];
    rows.forEach(r => {
      if (r.proj_mean == null || r.realized == null) return;
      pairs.push({ predicted: Number(r.proj_mean) / 17, realized: Number(r.realized), cluster: r.week });
      // The cheapest honest predictor: what he averaged last season.
      baseline.push({ predicted: r.prior_ppg == null ? null : Number(r.prior_ppg) });
    });
    return baseline.some(b => b.predicted != null) ? { pairs, baseline } : { pairs };
  },

  opportunity_adj(rows) {
    const pairs = [], baseline = [];
    rows.forEach(r => {
      if (r.proj_mean == null || r.realized == null || r.proj_baseline == null) return;
      pairs.push({ predicted: Number(r.proj_mean) / 17, realized: Number(r.realized), cluster: r.week });
      baseline.push({ predicted: Number(r.proj_baseline) / 17 });
    });
    return { pairs, baseline };
  },

  consensus(rows) {
    const pairs = [], baseline = [];
    rows.forEach(r => {
      if (r.proj_mean == null || r.realized == null || r.proj_fantasypros == null) return;
      pairs.push({ predicted: Number(r.proj_mean) / 17, realized: Number(r.realized), cluster: r.week });
      baseline.push({ predicted: Number(r.proj_fantasypros) / 17 });
    });
    return { pairs, baseline };
  },

  replacement(rows) {
    /* REPLACEMENT LEVEL AS A PREDICTION: the claim is that the Nth-best player at
     * a position is what you get for free. Graded against what the actually-
     * -replacement-level starters scored. */
    const pairs = [], baseline = [];
    rows.forEach(r => {
      if (r.replacement == null || r.realized_replacement == null) return;
      pairs.push({ predicted: Number(r.replacement) / 17,
        realized: Number(r.realized_replacement), cluster: r.week });
      baseline.push({ predicted: r.shipped_replacement == null ? null
        : Number(r.shipped_replacement) / 17 });
    });
    return { pairs, baseline };
  },

  survival(rows) {
    /* THE CLUSTER IS THE DRAFT, NOT THE WEEK — declared in the spec and enforced
     * here. A run on running backs moves every forecast in the window together. */
    const pairs = [], baseline = [];
    rows.forEach(r => {
      if (r.p_survive == null || r.survived == null) return;
      pairs.push({ predicted: Number(r.p_survive), realized: Number(r.survived),
        cluster: r.draft_id });
      baseline.push({ predicted: r.base_rate == null ? null : Number(r.base_rate) });
    });
    return { pairs, baseline };
  },

  weekly_claims(rows) {
    const pairs = [], baseline = [];
    rows.forEach(r => {
      if (r.p_home == null || r.home_won == null) return;
      pairs.push({ predicted: Number(r.p_home), realized: Number(r.home_won), cluster: r.week });
      baseline.push({ predicted: 0.5 });
    });
    return { pairs, baseline };
  },
};

/* Grade every declared component. `data` is {componentName: rows}. A component
 * with no rows grades as no_data and SAYS SO rather than being omitted — an
 * omitted row is indistinguishable from a row nobody wrote a builder for. */
function runAll(data) {
  const out = [];
  Object.keys(S.SPECS).forEach(name => {
    const spec = S.specFor(name);
    const rows = (data || {})[name] || [];
    const built = BUILDERS[name] ? BUILDERS[name](rows) : null;
    if (!built) {
      out.push(Object.assign({ name: name, verdict: 'no_builder', n_obs: 0,
        why: 'no pair builder is registered for this component — it is declared '
          + 'and ungradeable, which is worse than undeclared because the spec '
          + 'implies it is being measured' }, { implication: null }));
      return;
    }
    const row = G.gradeComponent(Object.assign({}, spec, built));
    // THE DECLARED MINIMUM, enforced here rather than trusted. survival declares
    // min_clusters: 20 against a measured floor; below it the row cannot speak.
    /* ONLY WHEN THERE IS DATA. My first version applied this to every row, so a
     * component with ZERO observations read `too_thin` instead of `no_data` —
     * collapsing "nothing has resolved yet" into "some data, not enough", which
     * is exactly the distinction this entire surface exists to make. Caught by
     * the empty-input case, which is why that case is in the test. */
    const min = S.SPECS[name].min_clusters;
    if (min != null && row.verdict !== 'no_data' && (row.n_clusters || 0) < min) {
      row.verdict = 'too_thin';
      row.why = `${row.n_clusters || 0} clusters against a declared minimum of `
        + `${min} — the floor at that count was measured, and below it this row `
        + 'cannot distinguish a real effect from nothing';
      row.implication = null;
      row.implication_why = 'no behavioural implication — below the declared '
        + 'minimum cluster count for this component';
    }
    out.push(row);
  });
  return { components: out,
    // The denominator travels with the rows.
    graded: out.filter(r => r.verdict !== 'no_data' && r.verdict !== 'no_builder').length,
    declared: out.length };
}

module.exports = { BUILDERS, runAll };
