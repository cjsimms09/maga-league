// WEEKLY GRADING CRON (the learning loop — task #17, September deadline, unrecoverable).
//
// The retention audit found the record compounds but the READER is missing: forecasts and
// decisions are captured in the ledger and never graded, so calibration, evidence-weight
// updates, and "where the model lost / where Cory beat it" never get produced. This is that
// reader. ONE runtime, ONE scheduled function, direct Blobs read+write — no cross-runtime
// handoff. It does all three so the system actually compounds rather than just reporting:
//   1. grade resolved FORECASTS -> append a calibration snapshot to the ledger      (#1,#4)
//   2. CONSUME that ledger into evidence weights (write evidence_weights:current)    (#5)
//   3. grade the DECISION kinds (recommendation/pick/override) against outcomes      (#6)
// Every snapshot is STAMPED with the rules era it was measured under, so a payout change
// cannot let a stale verdict mislead. Scheduled in netlify.toml; also manually invocable
// with ?key=GRADE_CRON_KEY so the path can be smoke-tested before its day (the API-key
// lesson: a path that has never run is a path that fails when it matters).

const store = require('../../src/store');
const FG = require('../../src/forecast_grade');
const EW = require('../../src/evidence_weight');
const ERA = require('../../src/rules_era');
const ACC = require('../../src/routes/accuracy');   // deriveByKind — one derivation, shared
const WPP = require('../../src/weekly_player_projection');

async function readLedger(season) {
  const keys = (await store.listKeys(`pred:${season}:`)).sort();
  const entries = [];
  for (const k of keys) {
    const e = await store.get(k);
    if (e) entries.push(e);
  }
  return entries;
}

async function currentRules() {
  // The money-bearing rules for the era stamp. config carries scoring/roster/teams;
  // payouts live under their own doc when present. Defensive: any missing piece just
  // makes the signature coarser, never throws.
  const cfg = (await store.get('config')) || {};
  let payouts = null;
  try { payouts = await store.get('payouts'); } catch (e) { /* optional */ }
  return {
    payouts, scoring: cfg.scoring || null, starters: cfg.starters || null,
    roster_slots: cfg.roster_slots || null, teams: cfg.teams,
    season: cfg.season || new Date().getUTCFullYear(),
  };
}

// The core, pure enough to unit-test: given the ledger entries + rules + prior calibration
// ledger, produce this run's stamped snapshot and the consumed evidence weights.
function runGrade(entries, rules, priorLedger, nowIso) {
  /* PLAYER-WEEK ROWS ARE PARTITIONED OUT before the generic grader sees them,
   * additively: `forecasts.point` has always meant the draft-time point claims,
   * and folding several hundred player-week residuals into the same numbers
   * would leave the name unchanged while the quantity became something else —
   * the defect this repo keeps finding. Player-week skill gets its OWN block
   * (per arm, per position — the table the source-weight machinery reads),
   * and every pre-existing snapshot field keeps meaning what it meant. */
  const split = WPP.partitionLedger(entries);
  const forecasts = FG.gradeForecasts(split.rest);
  const decisions = FG.gradeDecisions(split.rest);
  /* THE EDGE-IDENTIFICATION ROLL-UPS (2026-08-15). The accuracy page's
   * "By prediction type" table reads the calibration doc's `by_kind`; without
   * this merge the in-season decision kinds could never reach it — their
   * grades live under `decisions.inseason`, which byKindRows does not read.
   * Forecast kinds come from THE SAME deriveByKind the page falls back to
   * (imported, not re-implemented), so the numbers cannot drift between the
   * doc and the fallback; decision kinds come from the grader's own rows via
   * decisionByKind. Per-week lands beside it for the same reason: "is week 3's
   * edge holding up in week 8" is the question edge identification actually
   * asks, and a season total cannot answer it. */
  forecasts.by_kind = Object.assign({},
    ACC.deriveByKind(forecasts.graded), FG.decisionByKind(decisions));
  forecasts.by_week = FG.decisionByWeek(decisions);
  const snapshot = ERA.stamp({
    graded_at: nowIso,
    forecasts,
    decisions,
    player_weeks: WPP.gradePlayerWeeks(split.playerWeek),
  }, rules, rules.season);
  // #5 consume: fold this snapshot into the running ledger, derive league precision, and
  // recombine against the external prior (placeholder transferability until a source is
  // checked). Writes a weights object the model can read.
  const ledgerForConsume = (priorLedger || []).concat([snapshot]);
  const weights = EW.consumeCalibration(ledgerForConsume, { estimate: null, se: null, n: 0 });
  return { snapshot, weights };
}

exports.runGrade = runGrade;   // exported for the unit test (no store, no egress)

exports.handler = async (event) => {
  store.initBlobs(event);
  // Manual smoke gate: a scheduled invocation has no query; a human smoke test passes the
  // key. If GRADE_CRON_KEY is set, a keyless MANUAL hit is refused (don't expose grading
  // to the open web); the SCHEDULE always runs (it carries no query string).
  const qs = (event && event.queryStringParameters) || {};
  const isManual = qs.key !== undefined;
  if (isManual && process.env.GRADE_CRON_KEY && qs.key !== process.env.GRADE_CRON_KEY) {
    return { statusCode: 403, body: JSON.stringify({ ok: false, error: 'bad key' }) };
  }
  try {
    const rules = await currentRules();
    const season = rules.season;
    const entries = await readLedger(season);
    const priorKeys = (await store.listKeys(`calibration:${season}:`)).sort();
    const priorLedger = [];
    for (const k of priorKeys) { const s = await store.get(k); if (s) priorLedger.push(s); }

    const nowIso = new Date().toISOString();
    const { snapshot, weights } = runGrade(entries, rules, priorLedger, nowIso);

    // append-only calibration ledger + the current consumed weights
    await store.set(`calibration:${season}:${nowIso}`, snapshot);
    await store.set('evidence_weights:current', {
      updated_at: nowIso, season, graded_n: weights.graded_n, league_se: weights.league_se,
      combined: weights.combined, rules_era: snapshot.rules_era,
    });

    const summary = {
      ok: true, season, nowIso,
      forecasts: { resolved: snapshot.forecasts.n_resolved, graded: snapshot.forecasts.n_graded,
        pending: snapshot.forecasts.n_pending, brier: snapshot.forecasts.probability.brier },
      decisions: { n: snapshot.decisions.n_decisions, overridden: snapshot.decisions.overridden,
        scored: snapshot.decisions.scored, cory_beat_model: snapshot.decisions.cory_beat_model },
      evidence_weights: weights.combined.weights, league_se: weights.league_se, graded_n: weights.graded_n,
      rules_era: snapshot.rules_era,
    };
    console.log('grade-cron:', JSON.stringify(summary));
    return { statusCode: 200, body: JSON.stringify(summary) };
  } catch (e) {
    console.error('grade-cron failed:', e && e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e && e.message }) };
  }
};
