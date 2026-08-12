// TERRITORY: A
/* THE ANALYZER'S GRADEABLE CLAIMS — the emission it has never had.
 *
 * THE GAP, VERIFIED RATHER THAN ASSUMED. `routes/standings.js` computes a
 * playoff probability, an expected win total and a seed distribution for every
 * team, every time the page renders, and **writes none of it anywhere**. It
 * `require`s exactly two modules (`lineup`, `playoffs`) — no `predledger`, no
 * forecast, no ledger. So the analyzer's probabilities exist for the duration of
 * one HTTP response and are then gone. Its only grading is
 * `validateStandings()`, which is RETROSPECTIVE: it re-derives 2023-25
 * predictions today and scores them. Nothing it says about the season now in
 * front of us can ever be graded, because nothing records it.
 *
 * That is the same shape as the weekly-claims gap — a real rail, enforced, with
 * nothing on it — one tool over.
 *
 * ── WHAT IS EMITTED, AND WHAT IS REFUSED ───────────────────────────────────
 *
 * EMITTED — both resolve from the final regular-season standings, unambiguously,
 * with the rule written before the outcome:
 *
 *   · PLAYOFF PROBABILITY, one per team per checkpoint. ftype `probability`,
 *     graded on Brier plus a reliability bin.
 *   · EXPECTED WINS, one per team per checkpoint. ftype `point`, graded on
 *     signed and absolute error. Emitted BESIDE the probability deliberately:
 *     it is the quantity the cross-tool coherence check compares, so grading it
 *     tells us which surface was wrong when they disagree, instead of only that
 *     they did.
 *
 * REFUSED, and the refusals are the honest part:
 *
 *   · CHAMPIONSHIP PROBABILITY — **the analyzer does not compute one.** Its
 *     simulation stops at the seed: it counts who finishes in the top `spots`
 *     and never plays the bracket. There is no number here to emit, and
 *     manufacturing one from `seed_dist` would mean inventing a bracket model
 *     inside a claims file and grading the league against it.
 *   · EXPECTED DOLLARS — **also absent, and worse than absent.** The module
 *     docstring says the simulator builds "each team's win distribution, playoff
 *     odds, seed distribution and expected payoff." Grep the file: `payoff`
 *     occurs once, in that sentence. **Nothing computes it.** A comment
 *     describing an implementation reads exactly like the implementation
 *     (rule 11e), and this one has been read as a feature.
 *
 * Emitting a placeholder for either would fill the ledger with entries January
 * cannot settle — the failure `weekly_claims.js` was written to avoid, and the
 * reason posture classification is excluded there too.
 */
'use strict';

/* STABLE KEYS. Deterministic from (season, checkpoint, subject) so a re-run
 * cannot create a second forecast for the same claim — the ledger dedupes on
 * key, and a key carrying a timestamp would defeat that silently. The checkpoint
 * is IN the key because the analyzer legitimately makes a new claim each week
 * and those are different forecasts, not revisions of one. */
function playoffKey(season, throughWeek, rid) {
  return `an|${season}|wk${throughWeek}|playoff|${rid}`;
}
function winsKey(season, throughWeek, rid) {
  return `an|${season}|wk${throughWeek}|exp_wins|${rid}`;
}

function playoffForecast(opts) {
  const o = opts || {};
  for (const k of ['season', 'throughWeek', 'rid', 'playoff_prob', 'spots']) {
    if (o[k] === undefined || o[k] === null) {
      throw new Error(`analyzer_claims.playoffForecast: \`${k}\` is required and has `
        + 'no default. A forecast with a guessed input is not a measurement.');
    }
  }
  const p = Number(o.playoff_prob);
  if (!(p >= 0 && p <= 1)) throw new Error('playoffForecast: playoff_prob must be in [0,1]');
  return {
    key: playoffKey(o.season, o.throughWeek, o.rid),
    ftype: 'probability',
    value: p,
    /* THE CUT IS IN THE RULE, not implied. The league can change
     * `playoff_teams`, and a rule reading "makes the playoffs" would silently
     * mean something different the year it does — grading this season's claim
     * against next season's cut. */
    resolution_rule: `P(this roster finishes in the top ${o.spots} of the FINAL `
      + 'regular-season standings, seeded by wins then points-for). Resolved from '
      + 'the final regular-season results. The cut is fixed at the '
      + `${o.spots} in force when the claim was made, not whatever it is at `
      + 'resolution time.',
    subject: { through_week: Number(o.throughWeek), rid: String(o.rid),
      spots: Number(o.spots) },
    method_inputs: o.inputs || null,
  };
}

function expectedWinsForecast(opts) {
  const o = opts || {};
  for (const k of ['season', 'throughWeek', 'rid', 'exp_wins']) {
    if (o[k] === undefined || o[k] === null) {
      throw new Error(`analyzer_claims.expectedWinsForecast: \`${k}\` is required `
        + 'and has no default.');
    }
  }
  return {
    key: winsKey(o.season, o.throughWeek, o.rid),
    ftype: 'point',
    value: Number(o.exp_wins),
    resolution_rule: 'The roster\'s FINAL regular-season win total. Resolved from '
      + 'the head-to-head results. A tied game counts as no win for either side, '
      + 'matching how the standings themselves are computed.',
    subject: { through_week: Number(o.throughWeek), rid: String(o.rid) },
    method_inputs: o.inputs || null,
  };
}

/* ── RESOLUTIONS — a separate append joined by key, never an edit ───────────
 *
 * Same discipline as the weekly rail: a prediction you can revise after the
 * outcome is not a prediction.
 */
function resolvePlayoff(forecast, finalPlayoffRids) {
  if (!Array.isArray(finalPlayoffRids)) return null;   // season not final — NOT a miss
  const rid = String(((forecast || {}).subject || {}).rid);
  return {
    forecast_key: forecast.key,
    outcome: finalPlayoffRids.map(String).includes(rid) ? 1 : 0,
    realized: { playoff_rids: finalPlayoffRids.map(String) },
  };
}

function resolveExpectedWins(forecast, finalWinsByRid) {
  const w = (finalWinsByRid || {})[String(((forecast || {}).subject || {}).rid)];
  if (w == null) return null;
  const err = Number(w) - Number(forecast.value);
  return {
    forecast_key: forecast.key,
    outcome: Number(w),
    realized: { final_wins: Number(w) },
    signed_error: Number(err.toFixed(3)),
    abs_error: Number(Math.abs(err).toFixed(3)),
  };
}

/* Every claim for one analyzer run. Pure over its inputs, so a test can hand it
 * a projection and read back exactly what the season will contain.
 *
 * ⚠️ Takes the OUTPUT of projectStandings rather than calling it — this module
 * must not become a second place the analyzer's model lives. */
function analyzerClaims(projection) {
  const p = projection || {};
  for (const k of ['season', 'throughWeek', 'spots', 'projections']) {
    if (p[k] === undefined || p[k] === null) {
      throw new Error(`analyzerClaims: the projection is missing \`${k}\`. Pass the `
        + 'object projectStandings returned, unmodified.');
    }
  }
  const out = [];
  for (const row of p.projections) {
    out.push(playoffForecast({
      season: p.season, throughWeek: p.throughWeek, rid: row.rid,
      playoff_prob: row.playoff_prob, spots: p.spots,
      inputs: { strength_mean: row.strength_mean, posture: row.posture },
    }));
    out.push(expectedWinsForecast({
      season: p.season, throughWeek: p.throughWeek, rid: row.rid,
      exp_wins: row.exp_wins,
      inputs: { strength_mean: row.strength_mean },
    }));
  }
  return out;
}

/* WHAT THE ANALYZER CANNOT YET CLAIM, as data rather than as a comment, so the
 * gap is readable by a consumer and by the standing check instead of living only
 * in prose that nothing reads. */
const NOT_EMITTED = {
  championship_probability: {
    reason: 'the analyzer simulates to the SEED and stops — it never plays the '
      + 'bracket, so no championship probability exists to emit',
    would_need: 'a bracket simulation over seed_dist (the money layer has one in '
      + 'Python: money_grade.simulate_bracket)',
    do_not: 'derive it from seed_dist inside a claims file — that invents a '
      + 'bracket model in the wrong place and grades the league against it',
  },
  expected_dollars: {
    reason: 'NOT COMPUTED ANYWHERE, despite routes/standings.js line 19 saying '
      + 'the simulator builds it. `payoff` appears once in that file, in that '
      + 'sentence (rule 11e — a comment describing an implementation reads '
      + 'exactly like one)',
    would_need: 'championship probability first, since the playoff pot is 53% of '
      + 'the money and cannot be priced from a seed alone',
  },
};

module.exports = {
  playoffKey, winsKey, playoffForecast, expectedWinsForecast,
  resolvePlayoff, resolveExpectedWins, analyzerClaims, NOT_EMITTED,
};
