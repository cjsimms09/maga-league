// TERRITORY: relay
/* THE SUNDAY-MORNING LINEUP AUTO-CAPTURE — register 287's lineup twin.
 *
 * Same mandate as waiver-reco-cron (Cory, 2026-08-24: "you should be logging
 * and grading ALL recommendations everywhere even if I don't do them"), same
 * pattern: lineup_call has been resolvable and gradeable all season, but its
 * only emitter was the /lineup page's manual button. This emits the
 * optimizer's start/sit advice for the commissioner's roster automatically,
 * via the SAME liveOptimizeFor() the page renders from — the graded row is
 * definitionally what the page showed.
 *
 * SUNDAY 12:50 UTC (~8:50am ET), before the 1pm slate and ten minutes ahead
 * of claims-cron — the same decision-time reasoning as weekly-proj-snapshot:
 * the lineup a person would have set is the pre-slate one, not Tuesday's
 * hindsight. (A TNF starter's fate is already sealed by Sunday; that is the
 * same convention the projection snapshot ships with, stated not hidden.)
 *
 * EMIT ONLY, one row per week, marker-idempotent. Preseason / no week / no
 * mapped commissioner are named clean skips. Unlike waivers there is no
 * "hold" week — whenever the optimizer is live, its lineup IS the advice, and
 * an edge of zero still emits: "tool agrees with the studs" is a gradeable
 * claim, not an absence. Resolution stays in claims-cron, grading in
 * grade-cron.
 */
const store = require('../../src/store');
const predledger = require('../../src/predledger');
const { buildAutoLineupEntry } = require('../../src/waiver_reco');
const { autoCaptureContext } = require('./waiver-reco-cron');

exports.handler = async (event) => {
  store.initBlobs(event);
  const qs = (event && event.queryStringParameters) || {};
  const isManual = qs.key !== undefined;
  if (isManual && process.env.LINEUP_RECO_CRON_KEY && qs.key !== process.env.LINEUP_RECO_CRON_KEY) {
    return { statusCode: 403, body: JSON.stringify({ ok: false, error: 'bad key' }) };
  }
  try {
    const sleeper = require('../../src/sleeper');
    const cfg = (await store.get('config')) || {};
    const owners = (await store.get('owners')) || [];
    const sData = await sleeper.bundle(cfg.sleeper_league_id);
    const ctx = autoCaptureContext(sData, cfg, owners);
    if (ctx.skip) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: ctx.skip }) };
    }

    const markKey = `lineupauto:${ctx.season}:${ctx.week}`;
    if (await store.get(markKey)) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'already captured', week: ctx.week }) };
    }

    // The page's own computation, on the commissioner's roster. member.js
    // exports it for exactly this caller; `world` here carries the one field
    // liveOptimizeFor reads (config).
    const { liveOptimizeFor } = require('../../src/routes/member');
    const me = owners.find(o => o.is_commissioner);
    const { live, band } = await liveOptimizeFor({ config: cfg }, owners, me);

    const entry = buildAutoLineupEntry(live, band, ctx.season, ctx.week, ctx.ownerId);
    if (!entry) {
      await store.set(markKey, { none: true, live: !!live, at: new Date().toISOString() });
      return { statusCode: 200, body: JSON.stringify({ ok: true, week: ctx.week,
        captured: 0, note: 'optimizer not live — recorded as the week marker' }) };
    }
    await predledger.append(store, entry);
    await store.set(markKey, { key: entry.payload.key, at: new Date().toISOString() });
    return { statusCode: 200, body: JSON.stringify({ ok: true, week: ctx.week,
      captured: 1, key: entry.payload.key }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) };
  }
};
