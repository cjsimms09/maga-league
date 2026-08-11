// TERRITORY: A
/* THE WEEKLY CLAIMS CRON — emit this week's forecasts, resolve last week's.
 *
 * WHY IT EXISTS. The forecast rail is enforced (predledger refuses a forecast
 * without key/ftype/value/resolution_rule) and graded every Tuesday by
 * grade-cron. NOTHING EMITTED INTO IT: the only PredLedger.forecast caller is
 * the draft client, which fires on draft night and never again. So the rail ran
 * all season with nothing on it and January graded a handful of draft calls.
 *
 * src/weekly_claims.js was the pure half. THIS IS THE CALLER — without it that
 * module would have been the sixth produced-and-unread thing found this week,
 * and the first one that was mine.
 *
 * SUNDAY MORNING, BEFORE KICKOFF, and that is the whole design. A claim
 * committed after the games is not a prediction. 13:00 UTC is ~9am ET, ahead of
 * the 1pm slate.
 *
 * EMIT WEEK N, RESOLVE WEEK N-1, IN THAT ORDER AND IN ONE RUN. They cannot
 * collide — by Sunday morning the prior week is final (MNF included) and this
 * week has not started. Doing both here rather than in grade-cron keeps
 * PRODUCING a claim and GRADING it in separate jobs: a run that emitted and
 * graded in one pass could grade a forecast it had just written, which is the
 * shape of every self-confirming finding this project has caught.
 *
 * IT WRITES NOTHING IT CANNOT JUSTIFY. No matchups, no scores, no probability
 * inputs -> no entry. An empty week is a claim ("there was nothing to predict");
 * a missing week is an absence. They are not the same and the ledger should only
 * ever contain the second.
 */
const store = require('../../src/store');
const WC = require('../../src/weekly_claims');
const predledger = require('../../src/predledger');
const PO = require('../../src/routes/playoffs');

/* THE PURE CORE, exported for the unit test — no store, no egress.
 *
 * Given the week's matchups and each owner's season points-for, produce the
 * forecasts to append. p_home comes from the SAME winProb the playoff odds use,
 * injected rather than reimplemented: a second win-probability in this file is
 * how the site and the ledger come to disagree about the same game.
 */
function buildClaims(season, week, matchups, pfByOwner) {
  const pf = pfByOwner || {};
  const ids = Object.keys(pf);
  if (!ids.length || !(matchups || []).length) return [];
  const vals = ids.map(k => Number(pf[k]) || 0);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length);

  const rows = [];
  for (const m of matchups) {
    // winProb is a STRENGTH-RELATIVE-TO-FIELD probability, not a head-to-head
    // one. Converting: the home side's edge is its own field-probability against
    // the away side's, normalised so the pair sums to 1. Stated because a raw
    // winProb pair does not sum to 1 and silently using one of them would be a
    // probability about a different question.
    const ph = PO.winProb({ pf: Number(pf[m.home]) || 0 }, mean, sd);
    const pa = PO.winProb({ pf: Number(pf[m.away]) || 0 }, mean, sd);
    const denom = ph + pa;
    rows.push({
      home: m.home, away: m.away,
      p_home: denom > 0 ? ph / denom : 0.5,
      inputs: { pf_home: Number(pf[m.home]) || 0, pf_away: Number(pf[m.away]) || 0,
                field_mean: Number(mean.toFixed(2)), field_sd: Number(sd.toFixed(2)) },
    });
  }
  // The weekly-high pick is the strongest team by season points-for. A weak
  // claim, deliberately: the point is a CALIBRATED record of how often the
  // obvious pick wins, which is the baseline any cleverer rule has to beat.
  const top = ids.slice().sort((a, b) => (Number(pf[b]) || 0) - (Number(pf[a]) || 0))[0];
  return WC.weekClaims({ season, week, matchups: rows, weekly_high_pick: top });
}

/* Resolutions for a week whose scores are final. Returns only what CAN be
 * resolved — an unplayed or missing matchup yields nothing rather than a loss. */
function buildResolutions(forecasts, scores, pfByOwner) {
  const out = [];
  for (const f of forecasts || []) {
    if (f.ftype === 'probability') {
      const r = WC.resolveMatchup(f, scores);
      if (r) out.push(r);
    } else if (f.ftype === 'categorical') {
      const r = WC.resolveWeeklyHigh(f, scores, pfByOwner);
      if (r) out.push(r);
    }
  }
  return out;
}

/* Sleeper's matchup rows carry `matchup_id` and `roster_id`; two rows sharing a
 * matchup_id are the two sides. Mapped to OWNER ids, because the ledger and the
 * points-for table are keyed by owner and a record keyed by roster_id would join
 * to nothing after an offseason roster renumber. */
function pairUp(rows, sleeperMap) {
  const byMatch = {};
  for (const r of rows || []) {
    if (r == null || r.matchup_id == null) continue;
    (byMatch[r.matchup_id] || (byMatch[r.matchup_id] = [])).push(r);
  }
  const out = [];
  for (const id of Object.keys(byMatch)) {
    const side = byMatch[id];
    if (side.length !== 2) continue;      // a bye or a malformed week: not a matchup
    const own = r => String((sleeperMap || {})[String(r.roster_id)] || '');
    const a = own(side[0]), b = own(side[1]);
    if (!a || !b) continue;               // unmapped roster: no owner to key on
    out.push({ home: a, away: b });
  }
  return out;
}

/* Season points-for per owner, summed from the weeks already played. Not read
 * off a standings object: the strength input must be what was known BEFORE this
 * week, and a standings row updated mid-week would leak the thing being
 * predicted into the prediction. */
async function seasonPointsFor(sleeper, leagueId, week, sleeperMap) {
  const pf = {};
  for (let w = 1; w < week; w++) {
    let pts = null;
    try { pts = await sleeper.weekPointsByOwner(leagueId, w, sleeperMap); } catch (e) { pts = null; }
    if (!pts) continue;
    for (const k of Object.keys(pts)) pf[k] = (pf[k] || 0) + (Number(pts[k]) || 0);
  }
  return pf;
}

exports.pairUp = pairUp;
exports.buildClaims = buildClaims;
exports.buildResolutions = buildResolutions;

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
    const week = Number(sData && sData.week);
    // PRESEASON IS A CLEAN SKIP, not a failure. The schedule fires from the day
    // it lands; a job that is red by design until September is a job nobody
    // reads, and then the first real failure looks like the twentieth expected
    // one. Same reasoning as the projection snapshot, which shipped with exactly
    // this defect and was corrected an hour later.
    if (!season || !week) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'no live week yet' }) };
    }

    /* THE REAL sleeper API, and the first version of this handler called one that
     * does not exist. It used `sleeper.weekScores(...)` and read `sData.matchups`
     * / `sData.points_for` off the bundle — none of the three are real. The
     * module exports `matchupsForWeek(leagueId, week)` and
     * `weekPointsByOwner(leagueId, week, sleeperMap)`, and `bundle()` returns
     * league/state/week, not a matchup list.
     *
     * The unit test would have passed either way: it exercises buildClaims and
     * buildResolutions, which are pure and know nothing about this. Same class as
     * the SharedValuation script tag earlier today — a pure core that is tested
     * and a wiring layer that is not. Caught before commit this time, by reading
     * the module's exports rather than trusting the call. */
    const emitted = [];
    const raw = await sleeper.matchupsForWeek(leagueId, week);
    const pairs = pairUp(raw, (sData && sData.sleeper_map) || cfg.sleeper_map || {});
    const pf = await seasonPointsFor(sleeper, leagueId, week, (sData && sData.sleeper_map) || cfg.sleeper_map || {});
    const claims = buildClaims(season, week, pairs, pf);
    for (const c of claims) {
      await predledger.append(store, { kind: 'forecast', method: 'weekly-claims-v1',
        season, payload: c });
      emitted.push(c.key);
    }

    // Resolve LAST week from this week's ledger + last week's final scores.
    const resolved = [];
    if (week > 1) {
      const keys = (await store.listKeys(`pred:${season}:`)).sort();
      const prior = [];
      for (const k of keys) {
        const e = await store.get(k);
        if (e && e.kind === 'forecast' && e.payload
            && ((e.payload.subject || {}).week === week - 1)) prior.push(e.payload);
      }
      const lastScores = await sleeper.weekPointsByOwner(
        leagueId, week - 1, (sData && sData.sleeper_map) || cfg.sleeper_map || {})
        .catch(() => null);
      if (lastScores) {
        for (const r of buildResolutions(prior, lastScores, pf)) {
          await predledger.append(store, { kind: 'forecast_resolution',
            method: 'weekly-claims-v1', season, payload: r });
          resolved.push(r.forecast_key);
        }
      }
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, season, week,
      emitted: emitted.length, resolved: resolved.length }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) };
  }
};
