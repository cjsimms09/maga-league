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
    /* THE PLAYER-WEEK ARM TABLE rides along (loop review 2026-08-15): the
     * league-wide player loop's grades land in the calibration snapshot's
     * player_weeks block, and until this line NOTHING machine-read them —
     * the newest loop's consume arc terminated at a store key (the exact
     * "grades reach only a page" failure Cory's standard names, except no
     * page read this block either). Exposed here read-only, mirrored by the
     * weekly runner, consumed by learning_loop.py as REC-2's in-season
     * per-source evidence stream. */
    let playerWeeks = null;
    if (weights && weights.season) {
      const keys = ((await store.listKeys(`calibration:${weights.season}:`)) || []).sort();
      snapshots = keys.length;
      if (keys.length) {
        const latest = await store.get(keys[keys.length - 1]);
        if (latest && latest.player_weeks) playerWeeks = latest.player_weeks;
      }
    }
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        weights: weights || null,
        calibration_snapshots: snapshots,
        player_weeks: playerWeeks,
        note: weights ? undefined
          : 'no evidence_weights:current in the store yet — grade-cron has not produced one',
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e && e.message }) };
  }
};
