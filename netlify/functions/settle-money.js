// SETTLE THE MONEY — the HTTP-invokable twin of weekly-high-cron.
//
// ⚠️ WHY THIS FILE EXISTS, AND IT IS A CORRECTION OF MY OWN DESIGN.
// `weekly-high-cron` carries `schedule = "0 11 * * 2"` in netlify.toml, and a
// SCHEDULED Netlify function is not reachable over HTTP: hitting its URL
// returns 403 with an EMPTY body — not my handler's JSON 403, which is how the
// failure was identified (2026-09-17, weekly-high-record run #1). So the
// workflow built to catch up week 1 could never have worked, and the schedule
// was the only way in.
//
// That is fine for the steady state — Tuesday comes round every week, and Cory
// is right that it should need nobody — but it leaves two real cases stranded:
//
//   1. CATCHING UP. The automation shipped mid-season with money already won.
//      "Wait until Tuesday" is not an answer for a prize won a week ago.
//   2. VERIFYING A FIX. If a week is skipped because a roster is missing from
//      config.sleeper_map, you fix the map and re-run — you do not wait seven
//      days to find out whether it worked.
//
// So the JOB lives in weekly-high-cron.js (one definition, still the scheduled
// one), and this is a thin unscheduled door onto the same `run()`. It shares
// the logic completely; it cannot drift, because there is nothing here to
// drift.
//
// ⚠️ IT REQUIRES A KEY, unconditionally. The scheduled function may run
// keyless because Netlify invokes it internally; this one is on the open web
// and writes to the money ledger. No key configured = refuse, rather than
// leaving a public write endpoint open. (It is idempotent and never overwrites,
// so the blast radius is small — but "small blast radius" is not a reason to
// skip the lock.)

const store = require('../../src/store');
const { run } = require('../../src/settle_money');

exports.handler = async (event) => {
  store.initBlobs(event);
  const expected = process.env.WEEKLY_HIGH_CRON_KEY;
  const qs = (event && event.queryStringParameters) || {};
  if (!expected) {
    return { statusCode: 403, body: JSON.stringify({
      ok: false,
      error: 'WEEKLY_HIGH_CRON_KEY is not configured, so this door stays shut. '
           + 'The Tuesday schedule does not need it and is unaffected.' }) };
  }
  if (qs.key !== expected) {
    return { statusCode: 403, body: JSON.stringify({ ok: false, error: 'bad key' }) };
  }
  try {
    const out = await run();
    for (const line of out.log || []) console.log(line);
    return { statusCode: out.ok ? 200 : 500, body: JSON.stringify(out, null, 1) };
  } catch (e) {
    console.error('settle-money failed:', (e && e.stack) || e);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String((e && e.message) || e) }) };
  }
};
