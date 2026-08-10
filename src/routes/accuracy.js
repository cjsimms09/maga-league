'use strict';
// MODEL ACCURACY — the display half of the learning loop (Cory).
//
// A grades every prediction as it resolves and appends to a calibration ledger;
// THIS module is where that data goes. It is PURE and READ-ONLY: it never grades
// (that is A's lane, forecast_grade.py) — it takes A's already-graded output and
// shapes it for the page, degrading HONESTLY before there is data ("not yet
// graded, N resolved") rather than drawing an empty chart that implies zero skill.
//
// THE SHAPES IT READS (the interface coordinated with A — see PARKED.md):
//
//   calibration doc  getDoc('calibration:<season>')  — the scorecard, in exactly
//     the shape draft/backtest/forecast_grade.py grade() already returns, plus a
//     couple of optional roll-ups A can add cheaply:
//       { generated_at, week,
//         n_forecasts, n_resolved, n_graded, n_pending, n_disqualified,
//         probability:{ n, brier, reliability:[{predicted_mid,n,observed_rate}] },
//         point:{ n, bias, mae },
//         categorical:{ n, accuracy },
//         graded:[{ key, ftype, claim, value, outcome, method, forecast_at,
//                   week?, kind?, brier?|error?|abs_error?|hit? }],
//         by_kind?:{ <kind>:{ n, brier?, accuracy?, mae? } },   // optional
//         by_week?:[{ week, n_graded, brier?, accuracy? }] }     // optional
//
//   attribution doc  getDoc('attribution:<season>')  — the component table that
//     fills in as the season grades things:
//       { generated_at,
//         components:[{ key, label, realized, ci_low, ci_high, n, measured, note }] }
//
// Both may be null (A hasn't run yet) — every section then renders its own
// honest empty state, keyed off rawCount (how many prediction records exist,
// counted from the store by the route so we can say "N logged, 0 graded").

// ---- prediction KINDS we group by, in display order, with human labels. The
// keys match src/predledger.js kinds / forecast key prefixes A grades under. ----
const KIND_LABELS = [
  ['survival', 'Survival calls'],
  ['lineup_call', 'Start/sit calls'],
  ['waiver_claim', 'Waiver calls'],
  ['stream_call', 'Streaming calls'],
  ['forecast', 'The forecast slate'],
  ['room_seat', 'Room-seat forecasts'],
  ['trade_eval', 'Trade evaluations'],
];

function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

// A one-line, plain-English read of a single graded record — what was claimed,
// what happened, and whether it was right. Used by "recently graded" + "misses".
function gradedLine(g) {
  const claim = g.claim || g.key || '(prediction)';
  if (g.ftype === 'probability') {
    const p = num(g.value), o = num(g.outcome);
    const said = p == null ? '?' : Math.round(p * 100) + '%';
    const happened = o == null ? '?' : (o >= 0.5 ? 'happened' : 'did not happen');
    return { claim, said, happened, metric: g.brier != null ? 'Brier ' + g.brier : null, hit: o != null ? (p >= 0.5) === (o >= 0.5) : null };
  }
  if (g.ftype === 'point') {
    return { claim, said: String(g.value), happened: String(g.outcome),
      metric: g.abs_error != null ? 'off by ' + g.abs_error : null,
      hit: g.abs_error != null ? g.abs_error < 1e-9 : null };
  }
  // categorical
  return { claim, said: String(g.value), happened: String(g.outcome),
    metric: null, hit: typeof g.hit === 'boolean' ? g.hit : (String(g.value) === String(g.outcome)) };
}

// Rank the worst calls so the failure modes are visible, not just an aggregate.
// probability: highest Brier (most confident + wrong); point: biggest |error|;
// categorical: misses first. Returns up to `n` with a human line + a magnitude.
function biggestMisses(graded, n) {
  // Rank on a COMPARABLE 0–1 "badness" so a small point miss can't outrank a
  // confident-and-wrong probability call: probability uses Brier (0–1),
  // categorical is 1 for a miss, and a point error is scaled RELATIVE to its size
  // (|error| / the larger of value/outcome) so 9 points off a 150 total is minor,
  // not "bigger" than a 90%-sure call that flopped.
  const scored = (graded || []).map(g => {
    let mag = 0;
    if (g.ftype === 'probability' && g.brier != null) mag = g.brier;
    else if (g.ftype === 'point' && g.abs_error != null) {
      const scale = Math.max(Math.abs(num(g.outcome) || 0), Math.abs(num(g.value) || 0), 1);
      mag = g.abs_error / scale;
    } else if (g.ftype === 'categorical') {
      // A wrong label, but with no stated confidence to have been "confidently"
      // wrong — weight it as a solid miss (0.5), below a high-confidence Brier
      // flop (>0.5) and above a small point error, so the headline failure mode
      // is a call the model was SURE about and got wrong.
      mag = (g.hit === false || String(g.value) !== String(g.outcome)) ? 0.5 : 0;
    }
    return { g, mag, line: gradedLine(g) };
  }).filter(x => x.mag > 0);
  scored.sort((a, b) => b.mag - a.mag);
  return scored.slice(0, n || 8);
}

function byKindRows(cal) {
  if (!cal || !cal.by_kind) return [];
  const out = [];
  for (const [key, label] of KIND_LABELS) {
    const r = cal.by_kind[key];
    if (!r) continue;
    out.push({ key, label,
      n: r.n || 0,
      brier: num(r.brier),
      accuracy: num(r.accuracy),
      mae: num(r.mae) });
  }
  // include any kinds A reports that we didn't pre-label, so nothing is hidden
  for (const key of Object.keys(cal.by_kind)) {
    if (KIND_LABELS.some(k => k[0] === key)) continue;
    const r = cal.by_kind[key];
    out.push({ key, label: key, n: r.n || 0, brier: num(r.brier), accuracy: num(r.accuracy), mae: num(r.mae) });
  }
  return out;
}

/**
 * Build the whole view model. Pure.
 * @param calibration  A's calibration doc, or null.
 * @param attribution  A's attribution doc, or null.
 * @param rawCount     number of prediction records logged (store key count).
 */
function buildAccuracyView(calibration, attribution, rawCount, extra) {
  const cal = calibration || null;
  const graded = !!(cal && (cal.n_graded || 0) > 0);
  rawCount = rawCount || 0;
  extra = extra || {};

  const summary = {
    // Prefer A's numbers; fall back to the raw count so "nothing graded yet"
    // still shows the pipeline is live and how much is waiting.
    forecasts: cal && cal.n_forecasts != null ? cal.n_forecasts : rawCount,
    resolved: cal && cal.n_resolved != null ? cal.n_resolved : 0,
    graded: cal ? (cal.n_graded || 0) : 0,
    pending: cal && cal.n_pending != null ? cal.n_pending : rawCount,
    disqualified: cal ? (cal.n_disqualified || 0) : 0,
    throughWeek: cal ? (cal.week != null ? cal.week : null) : null,
    generatedAt: cal ? (cal.generated_at || null) : null,
    rawCount,
    everRun: !!cal,
  };

  const prob = (cal && cal.probability) || null;
  const point = (cal && cal.point) || null;
  const cat = (cal && cal.categorical) || null;

  const recently = graded
    ? [...(cal.graded || [])]
        .sort((a, b) => String(b.forecast_at || '').localeCompare(String(a.forecast_at || '')))
        .slice(0, 12)
        .map(g => ({ ...gradedLine(g), ftype: g.ftype, week: g.week != null ? g.week : null }))
    : [];

  const attr = attribution ? {
    generatedAt: attribution.generated_at || null,
    components: (attribution.components || []).map(c => ({
      key: c.key, label: c.label || c.key,
      realized: num(c.realized), ciLow: num(c.ci_low), ciHigh: num(c.ci_high),
      n: c.n || 0, measured: !!c.measured, note: c.note || '',
    })),
  } : null;
  if (attr) {
    attr.measuredN = attr.components.filter(c => c.measured).length;
    attr.unmeasuredN = attr.components.filter(c => !c.measured).length;
  }

  return {
    graded,
    summary,
    calibration: graded ? {
      probability: prob ? { n: prob.n || 0, brier: num(prob.brier),
        reliability: (prob.reliability || []).map(b => ({
          mid: num(b.predicted_mid), n: b.n || 0, observed: num(b.observed_rate) })) } : { n: 0, reliability: [] },
      point: point ? { n: point.n || 0, bias: num(point.bias), mae: num(point.mae) } : { n: 0 },
      categorical: cat ? { n: cat.n || 0, accuracy: num(cat.accuracy) } : { n: 0 },
    } : null,
    byKind: byKindRows(cal),
    byWeek: (cal && cal.by_week) || [],
    recently,
    biggestMisses: graded ? biggestMisses(cal.graded, 8) : [],
    attribution: attr,

    // CALIBRATION OVER TIME — one point per grading run, from the append-only
    // ledger. A single snapshot says "how calibrated am I now"; the series says
    // "is it improving", which is the actual question the learning loop asks.
    series: (extra.series || []).filter(p => p && p.at).map(p => ({
      at: p.at, graded: p.graded || 0, brier: num(p.brier),
    })),

    // THE OVERRIDE RECORD — how often the human went against the tool and how it
    // turned out. grade-cron has been computing this all along (snapshot.decisions)
    // and nothing rendered it. `cory_beat_model` is the count of overrides that
    // BEAT the recommendation; the rest is the honest denominator.
    decisions: extra.decisions ? {
      n: extra.decisions.n_decisions || 0,
      overridden: extra.decisions.overridden || 0,
      scored: extra.decisions.scored || 0,
      humanWon: extra.decisions.cory_beat_model || 0,
      // Only meaningful once something has actually been scored.
      rate: (extra.decisions.scored || 0) > 0
        ? Math.round(((extra.decisions.cory_beat_model || 0) / extra.decisions.scored) * 100) : null,
    } : null,
  };
}

module.exports = { buildAccuracyView, biggestMisses, gradedLine, byKindRows, KIND_LABELS };
