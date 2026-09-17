// WEEKLY HIGH POINT — record the winner and attribute the $100, every Tuesday.
//
// Cory, 2026-09-17: "Every week the high point should be recorded and winnings
// for that week attributed.. this isn't hard."
//
// It was not being done at all. POST /admin/weekly has always written the
// ledger entry that moves $100 into somebody's winnings — and it needed a human
// to open the admin panel and press a button. Nobody did, so /bank and every
// "winnings this year" number showed nothing, all season.
//
// This is that button, on a timer. The DECISION lives in src/weekly_high.js
// with no I/O in it (so it is unit-tested without Blobs or Sleeper); this file
// does the fetching and the writing and nothing else.
//
// ⚠️ IT BACKFILLS. Every finished, paying, unrecorded week gets caught up on
// the first run, not just last week — because the season is already underway
// with nothing recorded, and a job that only ever looks at "last week" would
// leave the earlier weeks permanently missing.
//
// ⚠️ IT NEVER OVERWRITES. An existing entry for a (year, week) is left exactly
// as it is, settled or not. The admin form deliberately REPLACES on a manual
// re-record — that is right for a human fixing a mistake and wrong for a robot,
// which would undo the correction every Tuesday forever.
//
// Manually invocable with ?key=WEEKLY_HIGH_CRON_KEY, following grade-cron's
// lesson: a path that has never run is a path that fails when it matters.

const store = require('../../src/store');
const H = require('../../src/helpers');
const L = require('../../src/ledger');
const sleeper = require('../../src/sleeper');
const WH = require('../../src/weekly_high');

async function run() {
  const log = [];
  const world = await H.loadWorld();
  const leagueId = world.config && world.config.sleeper_league_id;
  if (!leagueId) return { ok: false, error: 'no sleeper_league_id configured', log };

  const season = H.currentSeason(world.seasons);
  if (!season) return { ok: false, error: 'no current season', log };

  const data = await sleeper.bundle(leagueId);
  if (!data || !data.state) return { ok: false, error: 'sleeper bundle unavailable', log };
  const stateWeek = Number(data.state.week) || 0;

  const owners = H.activeOwners(world.owners);
  const map = world.config.sleeper_map || {};
  const todo = WH.weeksNeedingRecord(season, stateWeek, world.ledger);

  log.push(`season ${season.year}, sleeper state week ${stateWeek}, `
           + `${todo.length} finished week(s) needing a record: [${todo.join(', ')}]`);

  const recorded = [];
  const skipped = [];
  for (const week of todo) {
    let scorer = null;
    try {
      const m = await sleeper.matchupsForWeek(leagueId, week);
      scorer = sleeper.highScorer(m, data, map, owners);
    } catch (e) {
      skipped.push({ week, reason: `sleeper fetch failed: ${e && e.message}` });
      continue;
    }
    const decision = WH.entryFor(season, week, scorer);
    if (!decision.ok) {
      skipped.push({ week, reason: decision.reason, detail: decision.detail });
      continue;
    }
    await L.addEntry(decision.entry);
    recorded.push({ week, ...decision.scorer, amount: decision.entry.amount });
    log.push(`week ${week}: ${decision.scorer.owner} (${decision.scorer.team}) `
             + `${decision.scorer.points} pts -> $${decision.entry.amount}`);
  }

  // An unmapped roster is the one skip that must be impossible to miss: it means
  // real money is going unattributed and will keep doing so every week.
  const unmapped = skipped.filter(s => /UNMAPPED/.test(s.reason || ''));
  for (const u of unmapped) log.push(`🔴 week ${u.week}: ${u.reason} ${JSON.stringify(u.detail || {})}`);

  return { ok: true, season: season.year, stateWeek, recorded, skipped, log,
           needs_attention: unmapped.length > 0 };
}

exports.handler = async (event) => {
  // ⚠️ REQUIRED, AND I NEARLY SHIPPED WITHOUT IT. Every other scheduled
  // function here calls this first; the store cannot reach Blobs in a deployed
  // function otherwise, so the job would fail in production and pass every
  // local check. Copied from grade-cron rather than reasoned about.
  store.initBlobs(event);
  // Manual smoke gate, same rule as grade-cron: a SCHEDULED invocation carries
  // no query string and always runs. A human smoke test passes ?key=. If
  // WEEKLY_HIGH_CRON_KEY is set, a manual hit with the wrong key is refused.
  const qs = (event && event.queryStringParameters) || {};
  const isManual = qs.key !== undefined;
  if (isManual && process.env.WEEKLY_HIGH_CRON_KEY && qs.key !== process.env.WEEKLY_HIGH_CRON_KEY) {
    return { statusCode: 403, body: JSON.stringify({ ok: false, error: 'bad key' }) };
  }
  try {
    const out = await run();
    for (const line of out.log || []) console.log(line);
    return { statusCode: out.ok ? 200 : 500, body: JSON.stringify(out, null, 1) };
  } catch (e) {
    console.error('weekly-high-cron failed:', e && e.stack || e);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) };
  }
};

exports.run = run;
