// FORWARD-PREDICTION + DECISION GRADER (JS live path).
//
// The one score no backtest can produce: a forecast committed in writing, timestamped
// BEFORE the outcome exists, carries no researcher degree of freedom. This is the JS
// port of draft/backtest/forecast_grade.py (kept as the reference implementation) so the
// whole weekly loop lives in ONE runtime with direct Blobs access — no cross-runtime
// handoff. PURE: takes plain ledger dicts, returns a scorecard; never writes back into
// the ledger it reads (the contamination rule).
//
// THE FORWARD GUARANTEE, enforced not assumed: a forecast grades ONLY if its decision_at
// is strictly before its resolution's decision_at. A "forecast" written after reality is
// DISQUALIFIED, listed by key, so a backdated claim can never inflate the score.
//
// Grading:
//   probability  — Brier (p-outcome)^2 + a reliability table (the calibration curve)
//   point        — signed error + |error| (bias = mean signed)
//   categorical  — hit/miss (accuracy)
//   DECISIONS (#6) — recommendation vs pick (was the tool overridden?) and, where an
//     outcome is known, whether the override/recommendation won or lost. "Where Cory beat
//     the model" and "which recommendations lost money" — the most useful thing a season
//     teaches and the easiest to lose. Captured by predledger; graded here.

'use strict';

function ts(e) { return e && e.decision_at; }

function isForward(fc, res) {
  const a = ts(fc), b = ts(res);
  return Boolean(a) && Boolean(b) && a < b;   // fail closed: missing stamp => not forward
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Join forecasts to resolutions by key. Keep the EARLIEST commitment per key (a later
// re-commit can never move the stamp closer to reality). Returns {pairs, pending, orphans}.
function pair(forecasts, resolutions) {
  const byKey = {};
  for (const f of forecasts) {
    const k = (f.payload || {}).key;
    if (!k) continue;
    const prev = byKey[k];
    if (!prev || (f.decision_at || '') < (prev.decision_at || '')) byKey[k] = f;
  }
  const resByKey = {};
  for (const r of resolutions) {
    const k = (r.payload || {}).forecast_key;
    if (k && !(k in resByKey)) resByKey[k] = r;   // first resolution wins (append-only)
  }
  const pairs = [], orphans = [];
  for (const [k, r] of Object.entries(resByKey)) {
    if (k in byKey) pairs.push([byKey[k], r]); else orphans.push(k);
  }
  const pending = Object.keys(byKey).filter(k => !(k in resByKey));
  return { pairs, pending, orphans };
}

function reliabilityTable(probPoints, bins = 10) {
  const buckets = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, hits: 0 }));
  for (const [p, o] of probPoints) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(p * bins)));
    buckets[idx].n += 1;
    buckets[idx].hits += o >= 0.5 ? 1 : 0;
  }
  return buckets.map(b => {
    const mid = Math.round(((b.lo + b.hi) / 2) * 100) / 100;
    const rate = b.n ? Math.round((b.hits / b.n) * 1000) / 1000 : null;
    return {
      bucket: `${Math.round(b.lo * 100)}-${Math.round(b.hi * 100)}%`,
      predicted_mid: mid, n: b.n, observed_rate: rate,
      error: rate === null ? null : Math.round((rate - mid) * 1000) / 1000,  // + = too pessimistic
    };
  });
}

const mean = xs => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1e4) / 1e4 : null);

// Grade forecast/forecast_resolution entries. Mirrors forecast_grade.py:grade().
function gradeForecasts(entries) {
  const forecasts = entries.filter(e => e.kind === 'forecast');
  const resolutions = entries.filter(e => e.kind === 'forecast_resolution');
  const { pairs, pending, orphans } = pair(forecasts, resolutions);

  const graded = [], disqualified = [];
  const probPoints = [], brierTerms = [], pointSigned = [], pointAbs = [];
  let catHits = 0, catN = 0;

  for (const [fc, res] of pairs) {
    if (!isForward(fc, res)) {
      disqualified.push({ key: (fc.payload || {}).key, reason: 'not forward: decision_at not strictly before resolution', forecast_at: ts(fc), resolved_at: ts(res) });
      continue;
    }
    const p = fc.payload || {};
    const outcome = (res.payload || {}).outcome;
    const rec = { key: p.key, ftype: p.ftype, claim: p.claim, value: p.value, outcome, method: fc.method, forecast_at: ts(fc) };
    if (p.ftype === 'probability') {
      const pv = num(p.value), ov = num(outcome);
      if (pv === null || ov === null) { disqualified.push({ key: p.key, reason: 'non-numeric probability/outcome' }); continue; }
      const o01 = ov >= 0.5 ? 1 : 0;
      const brier = (pv - o01) ** 2;
      rec.brier = Math.round(brier * 1e4) / 1e4; brierTerms.push(brier); probPoints.push([pv, o01]);
    } else if (p.ftype === 'point') {
      const pv = num(p.value), ov = num(outcome);
      if (pv === null || ov === null) { disqualified.push({ key: p.key, reason: 'non-numeric point/outcome' }); continue; }
      const err = pv - ov;
      rec.error = Math.round(err * 1e3) / 1e3; rec.abs_error = Math.round(Math.abs(err) * 1e3) / 1e3;
      pointSigned.push(err); pointAbs.push(Math.abs(err));
    } else if (p.ftype === 'categorical') {
      const hit = String(p.value) === String(outcome) ? 1 : 0;
      rec.hit = Boolean(hit); catHits += hit; catN += 1;
    } else {
      disqualified.push({ key: p.key, reason: `unknown ftype ${JSON.stringify(p.ftype)}` }); continue;
    }
    graded.push(rec);
  }

  return {
    n_forecasts: forecasts.length, n_resolved: pairs.length, n_graded: graded.length,
    n_pending: pending.length, n_disqualified: disqualified.length,
    pending_keys: pending, orphan_resolution_keys: orphans, disqualified,
    probability: { n: probPoints.length, brier: mean(brierTerms), reliability: probPoints.length ? reliabilityTable(probPoints) : [] },
    point: { n: pointSigned.length, bias: mean(pointSigned), mae: mean(pointAbs) },
    categorical: { n: catN, accuracy: catN ? Math.round((catHits / catN) * 1000) / 1000 : null },
    graded,
  };
}

// #6 — grade the DECISION kinds. predledger stamps `recommendation` (what the tool said),
// `pick` (what was actually taken, a separate later entry joined by key), and `override`
// (an explicit "I went another way"). This computes, per decision key: was the tool
// followed or OVERRIDDEN, and — where an outcome entry exists — did the taken choice beat
// the recommended one (so "where Cory beat the model" and "recs that lost money" are real,
// not anecdotal). Outcome join is by payload.key -> a resolution/outcome carrying `realized`.
/* ── THE IN-SEASON KINDS JOIN DIFFERENTLY, AND THAT IS THE WHOLE EXTENSION ──
 *
 * `src/routes/accuracy.js` has carried the read side for these since it was
 * written, with its labels deliberately inert and a `PENDING_KINDS` list so the
 * table "cannot quietly look like it covers decisions it does not". Its comment
 * names the blocker: *"that extension is A's, and is parked."* This is it.
 *
 * A DRAFT decision is a PAIR — `recommendation` says one thing, `pick` records
 * another, and the join discovers whether they differed. An IN-SEASON decision
 * is a SINGLE entry that already contains both sides, because `predledger`
 * REFUSES to store one without `payload.counterfactual` ("what I would plausibly
 * have done without the tool"). So they need no pairing, and pretending they do
 * would drop every one of them for lacking a partner that cannot exist.
 *
 * ⚠ COUNTED SEPARATELY, DELIBERATELY. `override_rate` today means "of the DRAFT
 * decisions, how often did Cory go another way". Folding start/sit calls into
 * the same numerator would leave the name unchanged while the quantity became
 * something else — the defect this project keeps finding. In-season decisions
 * get their own counts, and a reader can add them up on purpose if they want to.
 */
const INSEASON_DECISION_KINDS = ['lineup_call', 'waiver_claim', 'stream_call',
                                 'trade_eval', 'inseason_override'];

function gradeDecisions(entries) {
  const recs = {}, picks = {}, overrides = {}, outcomes = {};
  const inseason = [];
  for (const e of entries) {
    const p = e.payload || {};
    if (INSEASON_DECISION_KINDS.indexOf(e.kind) >= 0) inseason.push(e);
    // decision entries join on payload.key; outcome/resolution entries join on
    // payload.forecast_key (they carry no `key` of their own) — routing on kind first
    // so a resolution is never skipped for lacking a `key` (the bug this fixes).
    if (e.kind === 'recommendation') { if (p.key) recs[p.key] = e; }
    else if (e.kind === 'pick') { if (p.key) picks[p.key] = e; }
    else if (e.kind === 'override') { if (p.key) overrides[p.key] = e; }
    else if (e.kind === 'forecast_resolution' || p.realized !== undefined
             || p.realized_taken !== undefined) {
      const ok = p.forecast_key || p.key;
      if (ok) outcomes[ok] = e;
    }
  }
  const rows = [];
  let overridden = 0, followed = 0, cory_beat = 0, model_beat = 0, scored = 0;
  for (const k of Object.keys(recs)) {
    const rec = recs[k], pick = picks[k], ov = overrides[k];
    const recommended = (rec.payload || {}).value ?? (rec.payload || {}).recommended;
    const taken = pick ? ((pick.payload || {}).value ?? (pick.payload || {}).player_id) : undefined;
    const wasOverride = Boolean(ov) || (taken !== undefined && recommended !== undefined && String(taken) !== String(recommended));
    if (wasOverride) overridden += 1; else if (taken !== undefined) followed += 1;
    const row = { key: k, recommended, taken, overridden: wasOverride, decision_at: ts(rec) };
    // outcome scoring where reality is known: realized value of the taken vs the recommended
    const out = outcomes[k] && (outcomes[k].payload || {});
    if (out && out.realized_taken !== undefined && out.realized_recommended !== undefined) {
      const rt = num(out.realized_taken), rr = num(out.realized_recommended);
      if (rt !== null && rr !== null) {
        row.realized_taken = rt; row.realized_recommended = rr; row.edge = Math.round((rt - rr) * 100) / 100;
        scored += 1;
        if (wasOverride) { if (rt > rr) cory_beat += 1; else if (rr > rt) model_beat += 1; }
      }
    }
    rows.push(row);
  }
  /* ── IN-SEASON DECISIONS: one entry, both sides, outcome joined by key ──── */
  const inRows = [];
  let inScored = 0, inToolWon = 0, inCfWon = 0;
  const byKind = {};
  for (const e of inseason) {
    const p = e.payload || {};
    const k = p.key || null;
    const out = (k && outcomes[k] && (outcomes[k].payload || {})) || p;
    const row = {
      kind: e.kind, key: k, decision_at: ts(e),
      chosen: p.chosen ?? p.value ?? p.player_id ?? null,
      // The counterfactual is REQUIRED by predledger, so its absence here means
      // an entry got in before that guard existed — reported, not defaulted.
      counterfactual: p.counterfactual ?? null,
      counterfactual_missing: p.counterfactual === undefined || p.counterfactual === null,
    };
    // Outcome scoring, same shape as the draft side: realized value of what was
    // done against realized value of what we would have done instead.
    const rt = num(out.realized_chosen ?? out.realized_taken);
    const rc = num(out.realized_counterfactual ?? out.realized_recommended);
    if (rt !== null && rc !== null) {
      row.realized_chosen = rt; row.realized_counterfactual = rc;
      row.edge = Math.round((rt - rc) * 100) / 100;
      inScored += 1;
      if (rt > rc) inToolWon += 1; else if (rc > rt) inCfWon += 1;
    }
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    inRows.push(row);
  }

  return {
    n_decisions: Object.keys(recs).length, followed, overridden, scored,
    // among scored OVERRIDES: how often the human's different choice actually won
    cory_beat_model: cory_beat, model_beat_cory: model_beat,
    override_rate: (followed + overridden) ? Math.round((overridden / (followed + overridden)) * 1000) / 1000 : null,
    rows,
    /* SEPARATE BLOCK, SEPARATE NAMES. Nothing above changes value when in-season
     * rows arrive — `override_rate` still means what it has always meant. */
    inseason: {
      n: inRows.length, by_kind: byKind, scored: inScored,
      tool_won: inToolWon, counterfactual_won: inCfWon,
      // The edge only means something over the SCORED subset; reporting it over
      // all rows would silently treat "not yet resolved" as "no edge".
      mean_edge: inScored
        ? Math.round((inRows.filter(r => r.edge != null)
          .reduce((s, r) => s + r.edge, 0) / inScored) * 100) / 100 : null,
      missing_counterfactual: inRows.filter(r => r.counterfactual_missing).length,
      rows: inRows,
    },
  };
}

// Reused from forecast_grade.py:build_resolutions — draft-time forecasts resolve off the
// finished board. In-season resolutions come from the weekly score path (added there).
function buildDraftResolutions(forecasts, draft) {
  const picks = (draft && draft.picks) || [];
  const atOverall = {}, draftedBefore = {}, taken = new Set();
  for (const p of [...picks].sort((a, b) => (a.overall || 0) - (b.overall || 0))) {
    const ov = p.overall, pid = String(p.player_id);
    draftedBefore[ov] = new Set(taken); atOverall[ov] = pid; taken.add(pid);
  }
  const overalls = Object.keys(atOverall).map(Number);
  const maxOverall = overalls.length ? Math.max(...overalls) : 0;
  const out = [];
  for (const f of forecasts) {
    const key = (f.payload || {}).key || '';
    if (key.startsWith('room_seat:r1p')) {
      const seat = parseInt(key.split('r1p')[1], 10);
      if (Number.isFinite(seat) && atOverall[seat] !== undefined) {
        out.push({ kind: 'forecast_resolution', method: 'forecast-resolution-v1', payload: { forecast_key: key, outcome: atOverall[seat], source: 'completed draft' } });
      }
    } else if (key.startsWith('survival:') && key.includes('@pick')) {
      const [pid, tail] = key.slice('survival:'.length).split('@pick');
      const npk = parseInt(tail, 10);
      if (Number.isFinite(npk) && npk <= maxOverall) {
        const survived = !(draftedBefore[npk] && draftedBefore[npk].has(pid));
        out.push({ kind: 'forecast_resolution', method: 'forecast-resolution-v1', payload: { forecast_key: key, outcome: survived ? 1 : 0, source: 'completed draft' } });
      }
    }
  }
  return out;
}

module.exports = { gradeForecasts, gradeDecisions, INSEASON_DECISION_KINDS, buildDraftResolutions, pair, reliabilityTable, isForward };
