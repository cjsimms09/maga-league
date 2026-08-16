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
 *
 * ── THE RESOLUTION PASS (2026-08-15 — the arc that had both ends and no
 *    middle). resolvePlayoff / resolveExpectedWins existed, buildCheckpoint-
 *    Resolutions existed, and NOTHING EVER CALLED THEM on a schedule: every
 *    checkpoint would have sat pending forever while grade-cron faithfully
 *    Brier-scored an empty join — the exact class the loop-closure audit
 *    named (an emitter, a grader, and no scheduled middle). The pass below
 *    runs on every scheduled invocation:
 *      · NOT FINAL YET → resolves nothing, reports the pending count by name
 *        ("N pending, resolvable when the regular season is final ~Jan");
 *      · FINAL (every regular-season week scored in the harvested history,
 *        AND the live week is past playoff_week_start) → resolves the two
 *        kinds over UNRESOLVED analyzer-checkpoint forecasts only — the same
 *        forecast_key dedupe discipline claims-cron uses — so a re-run
 *        appends nothing twice. Keys emitted by THIS run are excluded by
 *        construction (a job must never settle a forecast it just made);
 *        they are also unresolvable-by-timing, and both guards are stated.
 *      · The playoff cut is read from each forecast's own subject.spots —
 *        the rule pinned when the claim was made, exactly as its
 *        resolution_rule promises — never the cut in force at resolution
 *        time.
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

/* ── the resolution pass's pure cores, exported for the test ──────────────── */

/* Is the regular season FINAL in the harvested history? True iff EVERY
 * regular-season week (1 .. playoff_week_start-1) carries scores. A missing
 * week means "not final", never "assume final" — resolving early scores real
 * forecasts against a standings table that can still move. */
function seasonIsFinal(seasonObj) {
  if (!seasonObj) return false;
  const pw = Number((seasonObj.settings || {}).playoff_week_start || 15);
  const scored = new Set(LO.regularSeasonWeeks(seasonObj));
  for (let w = 1; w < pw; w++) {
    if (!scored.has(w)) return false;
  }
  return pw > 1;
}

/* The unresolved analyzer-checkpoint forecasts in a ledger — the SAME dedupe
 * join the rest of the rail uses (forecast_key), so a re-run after resolution
 * finds nothing pending and appends nothing twice. */
function pendingAnalyzerForecasts(entries) {
  const resolved = new Set();
  for (const e of entries || []) {
    if (e && e.kind === 'forecast_resolution' && e.payload && e.payload.forecast_key) {
      resolved.add(String(e.payload.forecast_key));
    }
  }
  return (entries || [])
    .filter(e => e && e.kind === 'forecast' && e.method === 'analyzer-checkpoint-v1'
      && e.payload && e.payload.key && !resolved.has(String(e.payload.key)))
    .map(e => e.payload);
}

/* Resolutions for a FINAL season, per-forecast pinned cut. Each probability
 * forecast resolves against the top `subject.spots` of the final standings —
 * the cut in force WHEN THE CLAIM WAS MADE, as its resolution_rule promises —
 * so a mid-season change to playoff_teams cannot regrade old claims. */
function buildFinalResolutions(pending, seasonObj) {
  const rec = ST.actualStandings(seasonObj);
  const order = ST.seedOrder(Object.values(rec));
  const winsByRid = {};
  for (const r of Object.values(rec)) winsByRid[String(r.rid)] = r.wins;
  const out = [];
  for (const f of pending || []) {
    if (!f || !f.key) continue;
    let r = null;
    if (f.ftype === 'probability') {
      const spots = Number((f.subject || {}).spots);
      if (!(spots >= 1)) continue;   // no pinned cut, no resolution — never guess one
      r = AC.resolvePlayoff(f, order.slice(0, spots).map(String));
    } else if (f.ftype === 'point') {
      r = AC.resolveExpectedWins(f, winsByRid);
    }
    if (r) out.push(r);
  }
  return out;
}

exports.buildCheckpoint = buildCheckpoint;
exports.buildCheckpointResolutions = buildCheckpointResolutions;
exports.seasonIsFinal = seasonIsFinal;
exports.pendingAnalyzerForecasts = pendingAnalyzerForecasts;
exports.buildFinalResolutions = buildFinalResolutions;

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

    /* ── THE RESOLUTION PASS — see the header. Runs every scheduled Sunday:
     * counts pending until the regular season is final, then resolves the
     * unresolved checkpoints ONCE (forecast_key dedupe; this run's own
     * emissions excluded by construction). */
    const emittedNow = new Set(emitted);
    const ledgerKeys = (await store.listKeys(`pred:${season}:`)).sort();
    const entries = [];
    for (const k of ledgerKeys) {
      const e = await store.get(k);
      if (e) entries.push(e);
    }
    const pending = pendingAnalyzerForecasts(entries)
      .filter(f => !emittedNow.has(f.key));
    const pw = Number((seasonObj.settings || {}).playoff_week_start || 15);
    // Belt and braces: the harvested history must show every regular week
    // scored AND Sleeper's live week must be past the regular season — a
    // half-harvested final week must not read as final.
    const finalNow = seasonIsFinal(seasonObj) && liveWeek >= pw;
    const resolvedKeys = [];
    if (finalNow && pending.length) {
      for (const r of buildFinalResolutions(pending, seasonObj)) {
        await predledger.append(store, { kind: 'forecast_resolution',
          method: 'analyzer-checkpoint-v1', season, payload: r });
        resolvedKeys.push(r.forecast_key);
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, season,
      through_week: throughWeek, spots, emitted: emitted.length,
      /* NAMED IN THE RESPONSE so a reader of the run log sees the refusals
       * rather than assuming the analyzer emitted everything it computes. */
      not_emitted: Object.keys(AC.NOT_EMITTED),
      analyzer_resolution: finalNow
        ? { season_final: true, resolved: resolvedKeys.length,
            pending_after: pending.length - resolvedKeys.length }
        : { season_final: false, pending: pending.length,
            note: `analyzer checkpoints: ${pending.length} pending, resolvable `
              + 'when the regular season is final (~Jan)' } }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message) }) };
  }
};
