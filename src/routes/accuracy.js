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
// TWO VOCABULARIES IN ONE LIST, and only one of them can reach this table.
// `kindOf` derives a forecast KEY NAMESPACE (`survival:`, `room_seat:`) because
// grading covers `kind === 'forecast'` records only. The ledger KINDS below —
// lineup_call, waiver_claim, stream_call, trade_eval — are never a forecast key
// prefix, so those four labels cannot currently fire. They are kept, not
// deleted, because they go live the day A's decision join covers the in-season
// kinds (parked). PENDING_KINDS names them so the table cannot quietly look
// like it covers decisions it does not, and so a guard can check the claim.
const PENDING_KINDS = ['lineup_call', 'waiver_claim', 'stream_call', 'trade_eval'];

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
    if (g.ftype === 'probability' && g.brier != null) {
      // ONLY ACTUAL MISSES. Ranking every graded call by Brier put SUCCESSES in
      // the failure-modes list — "said 90% → happened (Brier 0.01)" was showing
      // up under "where it was most wrong", and with a small sample the list was
      // more right answers than wrong ones. A probability call fails when the
      // side it favoured is not the side that happened; a 55% call that hit is a
      // mild call, not a failure mode. p == 0.5 favours neither, so it can't miss.
      const p = num(g.value), o = num(g.outcome);
      const wrong = p != null && o != null && p !== 0.5 && ((p > 0.5) !== (o >= 0.5));
      mag = wrong ? g.brier : 0;
    } else if (g.ftype === 'point' && g.abs_error != null) {
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
  const out = scored.slice(0, n || 8);
  // HOW MANY WERE THERE. A top-N list that does not say what N is out of reads
  // as "these are the misses" rather than "these are the worst of many" — the
  // silent-truncation shape. Invisible on a small fixture, where N was never
  // reached; at a real draft's volume the list shows 8 of dozens.
  out.total = scored.length;
  return out;
}

// The kind of a graded record. `by_kind` is an OPTIONAL roll-up in the interface
// and the grader does not emit one — so the "By prediction type" table never
// rendered, on real data as much as on none. The kind is already in the record:
// every forecast key is namespaced (`survival:<pid>@pick12`, `room_seat:r1p4`),
// and `method` ("survival-forecast-v1") is the fallback. Derive it here rather
// than asking A to add a roll-up whose inputs we already hold.
function kindOf(g) {
  const k = String(g.key || '');
  const i = k.indexOf(':');
  if (i > 0) return k.slice(0, i);
  const m = String(g.method || '');
  if (m) return m.replace(/-v\d+$/, '').replace(/-forecast$/, '').replace(/-/g, '_');
  return g.ftype || 'other';
}

const meanOf = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

function deriveByKind(graded) {
  const buckets = new Map();
  for (const g of graded || []) {
    const k = kindOf(g);
    if (!buckets.has(k)) buckets.set(k, { n: 0, brier: [], hits: 0, catN: 0, abs: [] });
    const b = buckets.get(k);
    b.n += 1;
    if (g.ftype === 'probability' && num(g.brier) != null) {
      b.brier.push(g.brier);
      // A probability call "hit" when the side it favoured is the side that happened.
      const p = num(g.value), o = num(g.outcome);
      if (p != null && o != null) { b.catN += 1; if ((p >= 0.5) === (o >= 0.5)) b.hits += 1; }
    } else if (g.ftype === 'point' && num(g.abs_error) != null) {
      b.abs.push(g.abs_error);
    } else if (g.ftype === 'categorical') {
      b.catN += 1;
      if (g.hit === true || (g.hit == null && String(g.value) === String(g.outcome))) b.hits += 1;
    }
  }
  const out = {};
  for (const [k, b] of buckets) {
    out[k] = { n: b.n, brier: meanOf(b.brier), accuracy: b.catN ? b.hits / b.catN : null, mae: meanOf(b.abs) };
  }
  return out;
}

function byKindRows(cal) {
  if (!cal) return [];
  // A's roll-up wins when present; otherwise derive it from the graded records.
  const src = cal.by_kind || ((cal.graded || []).length ? deriveByKind(cal.graded) : null);
  if (!src) return [];
  const round3 = n => n == null ? null : Math.round(n * 1000) / 1000;
  const out = [];
  for (const [key, label] of KIND_LABELS) {
    const r = src[key];
    if (!r) continue;
    out.push({ key, label,
      n: r.n || 0,
      brier: round3(num(r.brier)),
      accuracy: num(r.accuracy),
      mae: round3(num(r.mae)),
      derived: !cal.by_kind });
  }
  // include any kinds we didn't pre-label, so nothing is hidden
  for (const key of Object.keys(src)) {
    if (KIND_LABELS.some(k => k[0] === key)) continue;
    const r = src[key];
    out.push({ key, label: key, n: r.n || 0, brier: round3(num(r.brier)),
      accuracy: num(r.accuracy), mae: round3(num(r.mae)), derived: !cal.by_kind });
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
    // WHAT GOT GRADED IN THE LATEST RUN. "How many total" answers a different
    // question from "what landed this week", and only the second one tells you
    // the loop is still turning. The append-only ledger already has it: the
    // newest run's graded count minus the previous run's. Null on the first run,
    // where there is no "since" to measure from.
    newlyGraded: (() => {
      const s = (extra.series || []).filter(p => p && p.at);
      if (s.length < 2) return null;
      return Math.max(0, (s[s.length - 1].graded || 0) - (s[s.length - 2].graded || 0));
    })(),
    runs: (extra.series || []).filter(p => p && p.at).length,
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
    // Both lists are CAPPED. Ship the denominators so the page can say so.
    recentlyTotal: graded ? (cal.graded || []).length : 0,
    biggestMisses: graded ? biggestMisses(cal.graded, 8) : [],
    missesTotal: graded ? biggestMisses(cal.graded, 1e9).total : 0,
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

    // The same question answered from the raw ledger, for the season before the
    // grader's join covers the in-season kinds. Always shown when there is
    // anything to show; the graded half sits alongside it when it exists.
    captured: extra.captured || null,
  };
}

/**
 * The override record AS CAPTURED, straight off the prediction ledger.
 *
 * The grader's decision join reads the draft kinds (recommendation/pick/override)
 * and does not yet cover the in-season ones this site writes (`lineup_call`,
 * `inseason_override`) — that extension is A's, and is parked. Until it lands,
 * "how often did I override and what was the gap" is answerable from the raw
 * entries alone, and refusing to answer it would repeat exactly the failure the
 * override card exists to fix: a number produced every week and rendered nowhere.
 *
 * What this CANNOT say is how the overrides turned out — that needs outcomes
 * joined against the recommendation, which is the graded half. It says so.
 */
function capturedOverrides(ledger) {
  const overrides = [], follows = [];
  for (const e of ledger || []) {
    if (e.kind === 'inseason_override') overrides.push(e);
    else if (e.kind === 'lineup_call') follows.push(e);
  }
  const n = overrides.length + follows.length;
  if (!n) return null;
  const gaps = overrides.map(e => num((e.payload || {}).gap_dollars)).filter(g => g != null);
  const reasons = {};
  for (const e of overrides) {
    const r = String((e.payload || {}).reason || 'unstated');
    reasons[r] = (reasons[r] || 0) + 1;
  }
  return {
    decisions: n,
    overrides: overrides.length,
    followed: follows.length,
    rate: n ? Math.round((overrides.length / n) * 100) : null,
    contested: overrides.filter(e => (e.payload || {}).contested === true).length,
    // Total dollars the tool said were at stake in the weeks he went the other
    // way — the size of the disagreement, NOT a claim about who was right.
    gapTotal: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0)) : null,
    gapMax: gaps.length ? Math.round(Math.max(...gaps.map(Math.abs))) : null,
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count })),
    weeks: overrides.map(e => ({
      week: (e.payload || {}).week != null ? (e.payload || {}).week : null,
      gap: num((e.payload || {}).gap_dollars),
      contested: (e.payload || {}).contested === true,
      reason: String((e.payload || {}).reason || 'unstated'),
      at: e.at || e.decision_at || null,
    })).sort((a, b) => (b.week || 0) - (a.week || 0)).slice(0, 12),
  };
}

module.exports = { buildAccuracyView, biggestMisses, gradedLine, byKindRows, capturedOverrides,
                   KIND_LABELS, PENDING_KINDS };
