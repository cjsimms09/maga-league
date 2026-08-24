// TERRITORY: relay
/* THE TUESDAY-NIGHT WAIVER AUTO-CAPTURE — the tool's advice goes on the
 * record whether or not anybody taps a button.
 *
 * WHY IT EXISTS. Cory, 2026-08-24, looking at the waiver page's "Log this
 * claim" card: "I shouldn't have to manually log claims and you should be
 * logging and grading ALL recommendations everywhere even if I don't do
 * them." He is right, and the plumbing already agreed with him: waiver_claim
 * has been a registered, resolvable, gradeable ledger kind all season
 * (claims-cron resolves, grade-cron grades) — but the ONLY emitters were the
 * manual buttons on the page. An untapped button meant an unrecorded week,
 * and an unrecorded week is a recommendation the season can never grade.
 *
 * WHAT IT WRITES. One waiver_claim row per week: the tool's TOP claim for
 * the commissioner's roster, computed by the SAME src/waiver_reco.js call
 * the /waivers page renders from — the ledger row is definitionally what the
 * page showed, not a re-derivation that can drift. What Cory actually DID is
 * never captured here: that is readable from Sleeper's own transaction log
 * afterwards, which is exactly why the recommendation is the only thing that
 * needs a live snapshot (the page's own footer has said so all along).
 *
 * TUESDAY EVENING ET (Wednesday 00:10 UTC), and that is the whole design:
 * after MNF ends the week, before waivers clear Wednesday ~3am ET. A
 * recommendation captured after claims process is not advice, it is
 * hindsight.
 *
 * IT WRITES NOTHING IT CANNOT JUSTIFY. Preseason -> clean skip (the
 * claims-cron reasoning: a job red by design until September is a job nobody
 * reads). No mapped commissioner roster -> skip, named in the response. No
 * claim clearing net_value > 0 -> the WEEK MARKER records "the tool said
 * hold" and no row is fabricated. The marker also makes re-runs idempotent:
 * one row per week, ever, no matter how often the function fires.
 */
const store = require('../../src/store');
const predledger = require('../../src/predledger');
const { computeWaiverReco, buildAutoWaiverEntry, buildAutoStreamEntry } = require('../../src/waiver_reco');

/* Pure, exported for the unit test: the season/week/owner gate. Returns
 * { skip: '<reason>' } or { season, week, ownerId, myRid }. */
function autoCaptureContext(sData, cfg, owners) {
  const season = String((sData && sData.state && sData.state.season) || '');
  const week = Number(sData && sData.week);
  if (!season || !week) return { skip: 'no live week yet' };
  if ((sData.season_type || 'regular') !== 'regular') return { skip: 'preseason' };
  const commish = (owners || []).find(o => o.is_commissioner);
  if (!commish) return { skip: 'no commissioner owner' };
  const map = (cfg && cfg.sleeper_map) || {};
  const myRid = Object.keys(map).find(rid => Number(map[rid]) === Number(commish.id));
  if (!myRid) return { skip: 'commissioner not mapped to a Sleeper roster' };
  return { season, week, ownerId: commish.id, myRid };
}

exports.autoCaptureContext = autoCaptureContext;

exports.handler = async (event) => {
  store.initBlobs(event);
  const qs = (event && event.queryStringParameters) || {};
  const isManual = qs.key !== undefined;
  if (isManual && process.env.WAIVER_RECO_CRON_KEY && qs.key !== process.env.WAIVER_RECO_CRON_KEY) {
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

    // One capture per week, ever — the marker is the idempotence mechanism
    // (rmarkKey pattern from claims-cron), and for a "hold" week it IS the
    // record.
    const markKey = `waiverauto:${ctx.season}:${ctx.week}`;
    if (await store.get(markKey)) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'already captured', week: ctx.week }) };
    }

    const playersDb = await sleeper.players();
    let artifact = {};
    try {
      artifact = JSON.parse(require('fs').readFileSync(
        require('path').join(__dirname, '..', '..', 'public', 'draft_data.json'), 'utf8'));
    } catch (e) { artifact = {}; }

    const reco = computeWaiverReco(sData, playersDb, artifact, ctx.myRid, owners.length);
    // Both advice surfaces this page carries, one decision moment: the top
    // priority claim (waiver_claim) and the K/DEF stream (stream_call —
    // register 287's stream twin). Either can honestly be absent.
    const entries = [
      buildAutoWaiverEntry(reco, ctx.season, ctx.week, ctx.ownerId),
      buildAutoStreamEntry(reco, ctx.season, ctx.week, ctx.ownerId),
    ].filter(Boolean);
    if (!entries.length) {
      await store.set(markKey, { none: true, live: reco.live, at: new Date().toISOString() });
      return { statusCode: 200, body: JSON.stringify({ ok: true, week: ctx.week,
        captured: 0, note: reco.live ? 'tool says hold — recorded as the week marker' : 'reco not live' }) };
    }
    for (const entry of entries) await predledger.append(store, entry);
    await store.set(markKey, { keys: entries.map(e => e.payload.key), at: new Date().toISOString() });
    return { statusCode: 200, body: JSON.stringify({ ok: true, week: ctx.week,
      captured: entries.length, keys: entries.map(e => e.payload.key) }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) };
  }
};
