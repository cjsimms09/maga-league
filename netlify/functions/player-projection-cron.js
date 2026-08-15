// TERRITORY: A
/* THE PLAYER-PROJECTION CRON — emit this week's per-player forecasts, league-wide.
 *
 * WHY A SEPARATE FUNCTION AND NOT A claims-cron ADDITION: claims-cron runs
 * Sunday 13:00 UTC, which is AFTER Thursday Night Football — a TNF player's
 * "projection" emitted Sunday is post-hoc, and a rail that quietly grades
 * post-hoc rows teaches the model that hindsight is skill. Thursday 10:00 UTC
 * is ~14 hours before the earliest possible kickoff of the same week, so the
 * WHOLE slate is a prediction. The schedule is part of this job's correctness,
 * same reasoning stated on claims-cron's schedule comment.
 *
 * EMIT ONLY. Resolution of these rows happens in claims-cron's Sunday pass
 * (the players_points data is already in hand there), and grading happens in
 * grade-cron on Tuesday — producing a claim, resolving it and grading it stay
 * in three separate jobs, so no run can settle a row it just wrote.
 *
 * IT WRITES NOTHING IT CANNOT JUSTIFY. A player with no board prior and under
 * three appearances gets NO row (status 'absent' — refusal, not zero). If
 * Sleeper's projection feed is unreachable, arm 'ours' ships alone and the
 * response names it — a faked second source would grade our own arm against
 * itself wearing a different key.
 *
 * BELT AND BRACES ON RE-RUNS: deterministic keys mean the grader keeps the
 * earliest row per key even if duplicates land; the emitted-marker doc keeps
 * duplicates from landing at all.
 */
const store = require('../../src/store');
const predledger = require('../../src/predledger');
const WPP = require('../../src/weekly_player_projection');
const NFL_BYES = require('../../src/nfl_byes.json');
const BOARD = require('../../public/draft_data.json');   // esbuild inlines JSON

/* The board list, indexed once by Sleeper player_id. The board is THE source
 * of proj_mean (already scored under our table — one scorer, one source of
 * truth, proj_feed's argument), so this function inherits its vintage: the
 * board is rebuilt nightly and shipped at deploy time. */
function boardIndex(board) {
  const out = {};
  for (const p of (board && board.players) || []) {
    if (p && p.player_id != null) out[String(p.player_id)] = p;
  }
  return out;
}

exports.boardIndex = boardIndex;

exports.handler = async (event) => {
  store.initBlobs(event);
  const qs = (event && event.queryStringParameters) || {};
  const isManual = qs.key !== undefined;
  if (isManual && process.env.PLAYERPROJ_CRON_KEY && qs.key !== process.env.PLAYERPROJ_CRON_KEY) {
    return { statusCode: 403, body: JSON.stringify({ ok: false, error: 'bad key' }) };
  }
  try {
    const sleeper = require('../../src/sleeper');
    const cfg = (await store.get('config')) || {};
    const leagueId = cfg.sleeper_league_id;
    const sData = await sleeper.bundle(leagueId);
    const season = String((sData && sData.state && sData.state.season) || '');
    const week = Number(sData && sData.week);
    // Preseason is a clean skip, not a failure (claims-cron's lesson verbatim).
    if (!season || !week) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'no live week yet' }) };
    }
    const sleeperMap = (sData && sData.sleeper_map) || cfg.sleeper_map || {};
    if (!Object.keys(sleeperMap).length) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'no sleeper_map — rows would key to nobody' }) };
    }

    // Strictly-prior realized history: weeks 1..week-1, at player grain.
    // Completed weeks cache forever, so a season's history costs one fetch each.
    const history = {};
    for (let w = 1; w < week; w++) {
      const pts = await WPP.playersPointsForWeek(sleeper, leagueId, w).catch(() => null);
      if (pts) history[w] = pts;
    }

    const playersDb = await sleeper.players().catch(() => null);
    const proj = await WPP.fetchWeekProjections(season, week);
    const startDate = sData && sData.state && sData.state.season_start_date;
    const built = WPP.buildWeekForecasts({
      season, week,
      rosters: (sData && sData.rosters) || [],
      sleeperMap,
      boardById: boardIndex(BOARD),
      playersDb: (playersDb && playersDb.players) || {},
      byes: NFL_BYES[season] || {},
      history,
      sleeperProj: proj.rows,
      now: Date.now(),
      lateCutoff: WPP.lateCutoffUtc(startDate, week),
    });

    // Dedupe against what an earlier run of THIS week already emitted.
    const markerKey = `playerproj:emitted:${season}:${week}`;
    const marker = (await store.get(markerKey)) || { keys: [] };
    const fresh = WPP.dedupeAgainstMarker(built.forecasts, marker);
    const appended = await predledger.appendBatch(store,
      fresh.map(f => ({ kind: 'forecast', method: WPP.METHOD, season, payload: f })));
    await store.set(markerKey, {
      keys: marker.keys.concat(fresh.map(f => f.key)),
      updated_at: new Date().toISOString(),
    });

    /* The per-team bye-aware sums — the per-matchup projected-points input the
     * analyzer prior consumes (its backtest runs on history; THIS is its
     * forward feed). Written under a stable key per week; a re-run overwrites
     * with the same construction, which is idempotent, not append-only —
     * these are derived aggregates, not ledger claims. */
    await store.set(`playerproj:teamsums:${season}:${week}`, {
      season, week, method: WPP.METHOD,
      built_at: new Date().toISOString(),
      arm: 'ours',
      team_sums: built.team_sums,
      coverage: built.coverage,
      sleeper_arm_status: proj.status,
    });

    return { statusCode: 200, body: JSON.stringify({
      ok: true, season, week,
      emitted: appended.length, deduped: built.forecasts.length - fresh.length,
      coverage: built.coverage, sleeper_arm_status: proj.status,
      emitted_late: built.forecasts.length && built.forecasts[0].emitted_late,
    }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) };
  }
};
