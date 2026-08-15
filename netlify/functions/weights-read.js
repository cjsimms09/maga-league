// EVIDENCE WEIGHTS, READ-ONLY (REC-4's read side — loop closure, 2026-08-15).
//
// grade-cron writes `evidence_weights:current` every Tuesday and, until today,
// NOTHING read it — the one artifact designed to feed measured calibration back
// into the model terminated in the store (model_update_recommendations REC-4).
// This function is the missing read side: a GET that returns the current
// weights doc (rules_era stamp included) plus how many calibration snapshots
// back it. draft/tools/weekly_grade_runner.js mirrors it weekly into
// draft/data/evidence_weights_latest.json, where learning_loop.py consumes it
// into the RECOMMENDATION artifact — deliberately not into a live parameter,
// which stays gated on a design ruling (REC-4's acceptance).
//
// READ-ONLY BY CONSTRUCTION: no store.set anywhere in this file. That is the
// difference from hitting grade-cron with its manual key, which RUNS a grading
// pass and double-writes the append-only ledger — the exact reason the weekly
// workflow was forbidden from curling the crons. Key-gated with the same
// GRADE_CRON_KEY policy anyway: this is league data, not a public API.

const store = require('../../src/store');

exports.handler = async (event) => {
  store.initBlobs(event);
  const qs = (event && event.queryStringParameters) || {};
  if (process.env.GRADE_CRON_KEY && qs.key !== process.env.GRADE_CRON_KEY) {
    return { statusCode: 403, body: JSON.stringify({ ok: false, error: 'bad key' }) };
  }
  try {
    const weights = await store.get('evidence_weights:current');
    let snapshots = 0;
    if (weights && weights.season) {
      snapshots = ((await store.listKeys(`calibration:${weights.season}:`)) || []).length;
    }
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        weights: weights || null,
        calibration_snapshots: snapshots,
        note: weights ? undefined
          : 'no evidence_weights:current in the store yet — grade-cron has not produced one',
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e && e.message }) };
  }
};
