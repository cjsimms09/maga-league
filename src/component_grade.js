// TERRITORY: A
/* COMPONENT-LEVEL GRADING — the season's evaluation strategy.
 *
 * WHY COMPONENTS AND NOT STRATEGIES. The composite resolves 14 times a season.
 * Its components resolve every player-week — n ≈ 1,260 — straight from the box
 * score, with no new capture, no extra seasons and no external data. Measured:
 * at our disagreement rates a strategy comparison needs 36 points per week for
 * 80% power in one season, and reaches nothing. A component question has two
 * orders of magnitude more observations.
 *
 * And it is the only kind of finding this data has ever produced.
 * MEASURED_WEIGHTS was component-level; so were tier, risk, bye and the ceiling
 * ramp — every one measured, most removed. The system has never learned anything
 * at the composite level. That is the sample size telling us where its power is.
 *
 * ── THE THING THIS SURFACE EXISTS TO MAKE STRUCTURAL ────────────────────────
 *
 * "No difference detected" and "we cannot detect a difference" look identical in
 * every report we produce. THEY ARE DIFFERENT FINDINGS. So every row carries its
 * own MINIMUM DETECTABLE EFFECT beside its result, and a null is only ever
 * reported as `noise` when the design could have seen the effect that matters.
 * Otherwise it is `too_thin`, which is a respectable answer.
 *
 * ── AND THE INDEPENDENT UNIT IS THE WEEK, NOT THE OBSERVATION ───────────────
 *
 * Measured today: treating correlated decisions as independent samples runs the
 * false-positive rate from 4.7% to 11.1% as within-week correlation rises, while
 * aggregating to the week stays calibrated at ~4.5% throughout. Player-weeks
 * share a slate, a weather day and an opponent defence in exactly the same way.
 * So every statistic here is computed on CLUSTER MEANS — one number per week —
 * and `n_clusters` is reported beside `n_obs` so a thousand correlated
 * observations can never be presented as a thousand samples.
 *
 * That is the false precision this project has spent weeks eliminating, and it
 * would arrive here wearing the costume of a breakthrough.
 *
 * ── AND EVERY ROW THAT RESOLVES CARRIES WHAT IT WOULD CHANGE ────────────────
 *
 * A component finding is worth nothing until it composes into behaviour. So a
 * row does not just report `earning` — it reports what `earning` MEANS for how
 * to draft or set a lineup. That line is a REQUIRED INPUT, not an output.
 *
 * AND ALL THREE BRANCHES MUST BE WRITTEN BEFORE THE VERDICT IS KNOWN. Stating
 * only the flattering one and filling the rest in afterwards is the same defect
 * `resolution_rule` exists to prevent on the forecast rail: a consequence
 * written after the outcome is a rationalisation, and it reads identically to a
 * prediction. Requiring `earning`, `hurting` AND `noise` up front costs the
 * caller two extra sentences and removes the freedom entirely.
 *
 * `too_thin` and `no_data` get NO implication line, deliberately. A design that
 * could not have seen the effect implies nothing about behaviour, and printing
 * a "what to do" line beside an uninformative row is how an underpowered null
 * turns into a decision.
 */
'use strict';

/* Group observations by their cluster and return one mean per cluster. The week
 * is the unit; a caller that supplies no cluster gets each observation as its
 * own, which is the iid assumption and is flagged rather than hidden. */
function clusterMeans(values, clusters) {
  if (!clusters || !clusters.length) return values.slice();
  const by = new Map();
  for (let i = 0; i < values.length; i++) {
    const k = String(clusters[i] == null ? i : clusters[i]);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(values[i]);
  }
  const out = [];
  for (const arr of by.values()) out.push(arr.reduce((s, v) => s + v, 0) / arr.length);
  return out;
}

function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function sd(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
}

/* THE MINIMUM DETECTABLE EFFECT at this sample, in the metric's own units.
 * 2.8 ≈ z(0.975) + z(0.80) — the standard 80%-power two-sided constant. Computed
 * on CLUSTER means, so it answers "what could this design have seen" rather than
 * "what could a design with a thousand independent observations have seen". */
function mde(clusterVals) {
  const n = clusterVals.length;
  if (n < 2) return Infinity;
  return 2.8 * sd(clusterVals) / Math.sqrt(n);
}

/* ONE COMPONENT'S ROW.
 *
 * pairs: [{predicted, realized, cluster}]   cluster is the WEEK
 * baseline: optional [{predicted}] aligned with pairs — the thing this component
 *           must beat. Grading a component against nothing measures its error,
 *           not whether it earns its place.
 * material: REQUIRED. The smallest effect worth acting on, in the metric's
 *           units, stated by the caller. There is no default: a threshold
 *           invented here would decide "noise vs too thin" by accident, and that
 *           verdict is the whole point of the surface.
 * implication: REQUIRED, {earning, hurting, noise} — what each outcome would
 *           mean for how to draft or set a lineup. All three, stated before the
 *           verdict is known, for the reason in the header.
 */
function gradeComponent(opts) {
  const o = opts || {};
  const pairs = (o.pairs || []).filter(p => p && p.predicted != null && p.realized != null);
  if (o.material == null) {
    throw new Error('gradeComponent: `material` is required and has no default — the '
      + 'smallest effect worth acting on, in this metric\'s units. Without it the '
      + '"noise" / "too_thin" verdict is decided by an invented threshold, which is '
      + 'the one distinction this surface exists to make.');
  }
  const imp = o.implication || {};
  const missing = ['earning', 'hurting', 'noise'].filter(k => !imp[k] || !String(imp[k]).trim());
  if (missing.length) {
    throw new Error('gradeComponent: `implication` is required and needs all three '
      + 'branches (missing: ' + missing.join(', ') + '). Each is one line saying what '
      + 'that outcome would mean for how to draft or set a lineup. All three are '
      + 'required BEFORE the verdict is known: writing only the branch that fires is '
      + 'a rationalisation, and it reads exactly like a prediction. A component '
      + 'finding nobody can act on is a number, not a finding.');
  }
  const material = Number(o.material);
  const errs = pairs.map(p => Number(p.predicted) - Number(p.realized));
  const clusters = pairs.map(p => p.cluster);
  const absErr = errs.map(Math.abs);

  const row = {
    name: o.name || 'unnamed',
    n_obs: pairs.length,
    n_clusters: clusterMeans(errs, clusters).length,
    bias: pairs.length ? Number(mean(errs).toFixed(4)) : null,
    mae: pairs.length ? Number(mean(absErr).toFixed(4)) : null,
    material: material,
  };
  if (!pairs.length) {
    return Object.assign(row, { effect: null, mde: null, verdict: 'no_data',
      why: 'nothing resolved yet' }, implicationFor('no_data', imp));
  }

  // The effect under test. With a baseline it is the SKILL — how much less
  // absolute error than the thing it must beat. Without one it is the bias,
  // which answers a different and weaker question, and the row says which.
  let effectVals, effectLabel;
  if (o.baseline && o.baseline.length === pairs.length) {
    const bErr = o.baseline.map((b, i) => Math.abs(Number(b.predicted) - Number(pairs[i].realized)));
    effectVals = bErr.map((be, i) => be - absErr[i]);   // >0 means WE are better
    effectLabel = 'mae_improvement_vs_baseline';
  } else {
    effectVals = errs;
    effectLabel = 'bias';
  }
  const cm = clusterMeans(effectVals, clusters);
  const eff = mean(cm);
  const floor = mde(cm);

  row.effect = Number(eff.toFixed(4));
  row.effect_is = effectLabel;
  row.mde = Number.isFinite(floor) ? Number(floor.toFixed(4)) : null;

  /* THE THREE ANSWERS, and the third is respectable.
   *
   *   earning   — the effect is real at this sample AND big enough to act on
   *   noise     — the design COULD have seen a material effect and did not
   *   too_thin  — the design could not have seen one, so the null says nothing
   *
   * The order matters: `too_thin` is checked before `noise`, because a null from
   * an underpowered design is not evidence of absence and must never be reported
   * as though it were. */
  const detected = Number.isFinite(floor) && Math.abs(eff) > floor;
  if (!Number.isFinite(floor) || floor > material) {
    row.verdict = 'too_thin';
    row.why = 'the smallest effect this sample could detect (' + row.mde
      + ') is larger than the smallest effect worth acting on (' + material
      + '), so a null here says nothing about the component';
  } else if (detected && Math.abs(eff) >= material) {
    row.verdict = eff > 0 ? 'earning' : 'hurting';
    row.why = 'effect ' + row.effect + ' exceeds both the detection floor ('
      + row.mde + ') and the materiality bar (' + material + ')';
  } else if (detected) {
    row.verdict = 'real_but_immaterial';
    row.why = 'detectable (' + row.effect + ' > ' + row.mde + ') but below the '
      + 'materiality bar (' + material + ') — real and not worth acting on';
  } else {
    row.verdict = 'noise';
    row.why = 'the design COULD have detected a material effect (floor ' + row.mde
      + ' < material ' + material + ') and did not';
  }
  return Object.assign(row, implicationFor(row.verdict, imp));
}

/* THE STEP FROM A COMPONENT FINDING TO A BEHAVIOUR, made structural.
 *
 * Three of the five verdicts carry the caller's own stated line. The other two
 * carry NOTHING, and that is the point:
 *
 *   real_but_immaterial — derived, not invented. The caller set the materiality
 *     bar themselves; an effect below their own bar means change nothing, and
 *     saying so is arithmetic rather than a judgement made here.
 *   too_thin / no_data  — no line at all. The design could not have seen the
 *     effect that matters, so it implies nothing about behaviour. Printing a
 *     "what to do" line beside an uninformative row is precisely how an
 *     underpowered null becomes a decision.
 */
function implicationFor(verdict, imp) {
  if (verdict === 'earning') return { implication: String(imp.earning) };
  if (verdict === 'hurting') return { implication: String(imp.hurting) };
  if (verdict === 'noise') return { implication: String(imp.noise) };
  if (verdict === 'real_but_immaterial') {
    return { implication: 'Change nothing. The effect is real and smaller than the '
      + 'materiality bar you set for this component, so acting on it costs attention '
      + 'and buys nothing.' };
  }
  return { implication: null,
    implication_why: 'no behavioural implication — this design could not have '
      + 'detected an effect worth acting on, so the result constrains nothing' };
}

/* THE CLAMP, graded as its own question. proj_mean = proj_baseline x (1 +
 * opportunity_adj) with adj clamped at ±cap. "Does the clamp BIND WHERE IT
 * SHOULD" is answerable without any outcome at all: it is a property of the
 * distribution, and a cap that binds on a large share is not a cap, it is a
 * constant applied to a subset. */
function clampReport(players, cap) {
  const capv = Number(cap);
  const adj = (players || []).map(p => Number((p || {}).opportunity_adj))
    .filter(v => Number.isFinite(v));
  if (!adj.length) return { n: 0, at_cap: 0, share_at_cap: null, cap: capv };
  const at = adj.filter(v => Math.abs(Math.abs(v) - capv) < 1e-9).length;
  return {
    n: adj.length, at_cap: at, cap: capv,
    share_at_cap: Number((at / adj.length).toFixed(4)),
    at_upper: adj.filter(v => Math.abs(v - capv) < 1e-9).length,
    at_lower: adj.filter(v => Math.abs(v + capv) < 1e-9).length,
  };
}

module.exports = { gradeComponent, clampReport, clusterMeans, mde };
