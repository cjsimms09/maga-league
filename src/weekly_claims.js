// TERRITORY: A
/* WEEKLY GRADEABLE CLAIMS — the payloads and their resolutions, not the cron.
 *
 * THE GAP, MEASURED. The forecast rail is real and enforced: `predledger`
 * refuses a forecast without a key, an ftype, a value and a stated resolution
 * rule, and `grade-cron` grades what lands there every week. NOTHING EMITS A
 * WEEKLY FORECAST INTO IT. The only `PredLedger.forecast` caller is the draft
 * client, which fires on draft night and then never again. So the rail runs all
 * season with nothing on it, and January grades a handful of draft calls instead
 * of dozens of weekly ones.
 *
 * That is the cheapest real gain available and it needs no external data —
 * everything below is computed from the league's own weekly results.
 *
 * WHY PURE FUNCTIONS AND NOT A SCHEDULED FUNCTION. Same reason waiverClaimRecord
 * is a payload builder: the hard part is not the ledger call, it is the claim
 * and its resolution rule. Those are testable here with real numbers; a cron is
 * not. The cron becomes one call per claim.
 *
 * THE RULE THAT MAKES A CLAIM GRADEABLE, and it is stated BEFORE the outcome so
 * a null cannot be reinterpreted afterwards:
 *
 *   ftype            what reality returns          how it is graded
 *   probability      the event happened or not     Brier + reliability bin
 *   point            a number                      signed error + |error|
 *   categorical      a label                       hit / miss
 *
 * TWO CLAIMS TO START, DELIBERATELY, and the choice is about RESOLVABILITY
 * rather than interest:
 *
 *   · MATCHUP WIN PROBABILITY — one per matchup per week, ~5 a week in a
 *     ten-team league, ~70 a season. Resolution is the final score, which is
 *     unambiguous and arrives the same week.
 *   · THE WEEKLY HIGH — one a week, categorical. Same property.
 *
 * POSTURE CLASSIFICATION AND STACK PERFORMANCE ARE NOT HERE, and that is an
 * argument rather than an omission. "Was this team correctly called desperate"
 * has no resolution rule that exists before the outcome — desperate is a label
 * we assign, so grading it against a later label grades us against ourselves.
 * It needs a rule stated in terms of something reality returns (made the
 * playoffs, finished bottom three) before it can be a forecast at all. Emitting
 * it now would fill the ledger with entries January cannot settle, which is the
 * failure this file exists to avoid, not repeat.
 */
'use strict';

/* A STABLE KEY, because the resolution joins on it and the emitter runs weekly.
 * Deterministic from (season, week, subject) so a re-run cannot create a second
 * forecast for the same claim — the ledger dedupes forecasts by key, and a key
 * carrying a timestamp would defeat that silently. */
function matchupKey(season, week, a, b) {
  const pair = [String(a), String(b)].sort();
  return `wk|${season}|${week}|matchup|${pair[0]}|${pair[1]}`;
}
function weeklyHighKey(season, week) {
  return `wk|${season}|${week}|weekly_high`;
}

/* P(home beats away) for one matchup, from the SAME winProb the playoff odds
 * use. Injected rather than imported: this module must not become a second
 * implementation of a probability the site already computes, which is the
 * disease the shared-valuation module exists to cure. */
function matchupForecast(opts) {
  const o = opts || {};
  const need = ['season', 'week', 'home', 'away', 'p_home'];
  for (const k of need) {
    if (o[k] === undefined || o[k] === null) {
      throw new Error(`matchupForecast: \`${k}\` is required and has no default. `
        + 'A forecast with a guessed input is not a measurement of anything.');
    }
  }
  const p = Number(o.p_home);
  if (!(p >= 0 && p <= 1)) throw new Error('matchupForecast: p_home must be in [0,1]');
  return {
    key: matchupKey(o.season, o.week, o.home, o.away),
    ftype: 'probability',
    value: p,
    // STATED BEFORE THE RESULT. "Home wins" is decided by the final score, and
    // a tie is named explicitly rather than left to whoever reads it later —
    // an unstated tie rule is exactly the freedom a forward prediction removes.
    resolution_rule: 'P(home owner scores more than away owner in this week\'s '
      + 'head-to-head). Resolved from the final weekly scores. An exact tie '
      + 'resolves as NOT a home win.',
    subject: { week: Number(o.week), home: String(o.home), away: String(o.away) },
    method_inputs: o.inputs || null,
  };
}

function weeklyHighForecast(opts) {
  const o = opts || {};
  if (o.season == null || o.week == null || o.pick == null) {
    throw new Error('weeklyHighForecast: season, week and pick are required');
  }
  return {
    key: weeklyHighKey(o.season, o.week),
    ftype: 'categorical',
    value: String(o.pick),
    resolution_rule: 'The owner with the HIGHEST total points in this week, from '
      + 'the final weekly scores. A tie at the top resolves to the tied owner '
      + 'with the higher season points-for.',
    subject: { week: Number(o.week) },
    // The field it was chosen from. Without it a hit is unreadable: picking the
    // top scorer out of two is not the same claim as picking out of ten.
    field_size: o.field_size == null ? null : Number(o.field_size),
  };
}

/* ── RESOLUTIONS ────────────────────────────────────────────────────────────
 *
 * Written as a SEPARATE append joined by key, never by editing the forecast.
 * The ledger is append-only for the reason this whole rail exists: a prediction
 * you can revise after the outcome is not a prediction.
 */
function resolveMatchup(forecast, scores) {
  const s = scores || {};
  const subj = (forecast || {}).subject || {};
  const home = s[subj.home], away = s[subj.away];
  if (home == null || away == null) return null;   // not played yet — NOT a miss
  return {
    forecast_key: forecast.key,
    // The rule above, applied literally: a tie is not a home win.
    outcome: Number(home) > Number(away) ? 1 : 0,
    realized: { home: Number(home), away: Number(away) },
  };
}

function resolveWeeklyHigh(forecast, scores, seasonPF) {
  const s = scores || {};
  const ids = Object.keys(s);
  if (!ids.length) return null;
  let best = null;
  for (const id of ids) {
    if (best === null) { best = id; continue; }
    const d = Number(s[id]) - Number(s[best]);
    if (d > 0) best = id;
    else if (d === 0) {
      // The stated tiebreak, applied rather than re-decided.
      const pf = seasonPF || {};
      if (Number(pf[id] || 0) > Number(pf[best] || 0)) best = id;
    }
  }
  return {
    forecast_key: forecast.key,
    outcome: String(best),
    realized: { winner: String(best), points: Number(s[best]) },
    hit: String(best) === String(forecast.value),
  };
}

/* Every claim for one week, ready to append. Pure over its inputs, so a test
 * can hand it a week and read back exactly what the season will contain. */
function weekClaims(opts) {
  const o = opts || {};
  const out = [];
  for (const m of o.matchups || []) {
    out.push(matchupForecast({
      season: o.season, week: o.week, home: m.home, away: m.away,
      p_home: m.p_home, inputs: m.inputs,
    }));
  }
  if (o.weekly_high_pick != null) {
    out.push(weeklyHighForecast({
      season: o.season, week: o.week, pick: o.weekly_high_pick,
      field_size: (o.matchups || []).length * 2 || null,
    }));
  }
  return out;
}

module.exports = {
  matchupKey, weeklyHighKey,
  matchupForecast, weeklyHighForecast,
  resolveMatchup, resolveWeeklyHigh,
  weekClaims,
};
