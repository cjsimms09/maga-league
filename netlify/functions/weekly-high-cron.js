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
// ⚠️ THE JOB LIVES IN src/settle_money.js, not here. It was moved 2026-09-17 so
// that the Express app could call it too: with the job trapped inside a Netlify
// function, the only ways to run it were a schedule that had never fired and a
// keyed HTTP twin whose key is not configured — so "settle it now" had no
// answer. This file is now only the SCHEDULE.
const { run } = require('../../src/settle_money');

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
