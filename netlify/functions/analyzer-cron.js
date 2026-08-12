// TERRITORY: A
/* THE ANALYZER CHECKPOINT CRON — record what the analyzer believed, weekly.
 *
 * WHY IT EXISTS, AND WHY IT HAS A DATE. The analyzer computes a playoff
 * probability and an expected win total for every team on every render and
 * writes NONE of it: `routes/standings.js` requires `lineup` and `playoffs` and
 * nothing else. Its beliefs live for one HTTP response. Its only grading is
 * `validateStandings()`, which re-derives 2023-25 predictions today — a
 * backtest, not a forward record.
 *
 * **A week-4 checkpoint cannot be recorded in week 12.** The whole rest of this
 * system is built on capturing what cannot be reconstructed; the analyzer's own
 * beliefs are exactly that, and nothing has ever captured them.
 *
 * SUNDAY MORNING, BEFORE KICKOFF, on the same reasoning as `claims-cron`: a
 * belief committed after the games is not a prediction.
 *
 * ⚠️ THE CHECKPOINT IS week-1, NOT week. `sData.week` is the week IN PROGRESS.
 * `teamStrength` reads weeks 1..throughWeek, so passing the live week would feed
 * it a week whose scores are zero (or worse, partial) and quietly weaken every
 * team's estimated strength by one week of nothing. The claim is "given
 * everything COMPLETE, here is the rest of the season", so the checkpoint is the
 * last completed week.
 *
 * IT WRITES NOTHING IT CANNOT JUSTIFY. No live season in the history, no
 * completed week, no projection -> no entry. An absent week must stay absent
 * rather than becoming an empty claim.
 *
 * AND IT DOES NOT GRADE WHAT IT WRITES. Resolutions are a separate pass over
 * forecasts written on EARLIER runs, and only once the regular season is final.
 * A job that emitted and resolved in one pass could settle a forecast it had
 * just made, which is the shape of every self-confirming result this project has
 * caught.
 */
const store = require('../../src/store');
const AC = require('../../src/analyzer_claims');
const ST = require('../../src/routes/standings');
const LO = require('../../src/routes/lineup');
const PO = require('../../src/routes/playoffs');
const predledger = require('../../src/predledger');

/* THE PURE CORE, exported for the test — no store, no egress.
 *
 * Given a season object, the checkpoint and the cut, produce the forecasts to
 * append. Returns [] rather than throwing when the season cannot be projected:
 * a preseason run is a clean skip, not a failure. A job that is red by design
 * until September is a job nobody reads, and then the first real failure looks
 * like the twentieth expected one.
 */
function buildCheckpoint(seasonObj, throughWeek, spots, seed) {
  if (!seasonObj || !(throughWeek >= 1)) return [];
  const proj = ST.projectStandings(seasonObj, {
    throughWeek: throughWeek, sims: 3000,
    // FIXED seed derived from the checkpoint, so a re-run at the same week
    // reproduces the same numbers and the ledger's dedupe-by-key is honest
    // rather than hiding a second, different answer under the first key.
    seed: (seed == null ? 4242 : seed) + throughWeek,
    spots: spots,
  });
  if (!proj || !(proj.projections || []).length) return [];
  return AC.analyzerClaims(proj);
}

/* Resolutions for a FINAL regular season. Returns only what CAN be resolved —
 * an unfinished season yields nothing rather than a pile of misses. */
function buildCheckpointResolutions(forecasts, finalPlayoffRids, finalWinsByRid) {
  const out = [];
  for (const f of forecasts || []) {
    if (!f || !f.key) continue;
    const r = f.ftype === 'probability'
      ? AC.resolvePlayoff(f, finalPlayoffRids)
      : AC.resolveExpectedWins(f, finalWinsByRid);
    if (r) out.push(r);
  }
  return out;
}

exports.buildCheckpoint = buildCheckpoint;
exports.buildCheckpointResolutions = buildCheckpointResolutions;

exports.handler = async (event) => {
  store.initBlobs(event);
  const qs = (event && event.queryStringParameters) || {};
  const isManual = qs.key !== undefined;
  if (isManual && process.env.CLAIMS_CRON_KEY && qs.key !== process.env.CLAIMS_CRON_KEY) {
    return { statusCode: 403, body: JSON.stringify({ ok: false, error: 'bad key' }) };
  }
  try {
    const sleeper = require('../../src/sleeper');
    const cfg = (await store.get('config')) || {};
    const leagueId = cfg.sleeper_league_id;
    const sData = await sleeper.bundle(leagueId);
    const season = String((sData && sData.state && sData.state.season) || '');
    const liveWeek = Number(sData && sData.week);
    if (!season || !(liveWeek >= 2)) {
      // Week 1 has no completed week to project FROM, which is not a failure.
      return { statusCode: 200, body: JSON.stringify({ ok: true,
        skipped: 'no completed week yet' }) };
    }
    const throughWeek = liveWeek - 1;

    const history = LO.harvest();
    const seasonObj = LO.seasonOf(history, season);
    if (!seasonObj) {
      return { statusCode: 200, body: JSON.stringify({ ok: true,
        skipped: `season ${season} not in the harvested history yet` }) };
    }
    const spots = PO.playoffCut((sData && sData.league) || {});
    const claims = buildCheckpoint(seasonObj, throughWeek, spots);

    const emitted = [];
    for (const c of claims) {
      await predledger.append(store, { kind: 'forecast', method: 'analyzer-checkpoint-v1',
        season, payload: c });
      emitted.push(c.key);
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, season,
      through_week: throughWeek, spots, emitted: emitted.length,
      /* NAMED IN THE RESPONSE so a reader of the run log sees the refusals
       * rather than assuming the analyzer emitted everything it computes. */
      not_emitted: Object.keys(AC.NOT_EMITTED) }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message) }) };
  }
};
