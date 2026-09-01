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
const WINDOW = require('../../src/capture_window');
const predledger = require('../../src/predledger');
const { computeWaiverReco, buildAutoWaiverEntry, buildAutoStreamEntry } = require('../../src/waiver_reco');

/* ── THE CLOCK IS INJECTABLE, AND THAT IS A DEADLINE FIX (register 458) ─────
 *
 * Week 1's capture window opens 2026-09-06. Until it does, EVERY path through
 * this file lands in a skip arm, and every test of it asserts a skip — the
 * route test's own header says so: "lands on a clean pre-season skip". So the
 * branch that actually writes the row Cory cannot backfill has never once been
 * demonstrated to write one. That is rule 3e exactly: a probe that has never
 * returned a positive is untested, not passing.
 *
 * `runCapture` took no clock, so there was no seam to open the window through.
 * `RECO_CAPTURE_NOW` is that seam, and it follows the pattern this repo already
 * uses twice (`PROJ_SNAPSHOT_NOW` in weekly_proj_snapshot.py, `RECO_PROBE_TODAY`
 * in reco_probe_interpret.sh). Unset in production, so this is inert there.
 *
 * ⚠️ AN UNPARSEABLE VALUE THROWS RATHER THAN FALLING BACK TO THE REAL CLOCK.
 * A silent fallback would run an open-window test at today's real time, land in
 * the skip arm, and pass — proving nothing while looking like proof. That is the
 * same failure the seam exists to remove, so it must not be reachable by typo. */
function captureNow() {
  const raw = process.env.RECO_CAPTURE_NOW;
  if (!raw) return Date.now();
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) {
    throw new Error(`RECO_CAPTURE_NOW is set to '${raw}', which is not a parseable `
      + 'date. Refusing rather than using the real clock: a typo that silently ran at '
      + 'the real time would make an open-window test pass in the SKIP arm and prove '
      + 'nothing (register 458).');
  }
  return t;
}
exports.captureNow = captureNow;

/* Pure, exported for the unit test: the season/week/owner gate. Returns
 * { skip: '<reason>' } or { season, week, ownerId, myRid }. */
function autoCaptureContext(sData, cfg, owners, now = captureNow()) {
  const season = String((sData && sData.state && sData.state.season) || '');
  const week = Number(sData && sData.week);
  if (!season || !week) return { skip: 'no live week yet' };
  if ((sData.season_type || 'regular') !== 'regular') return { skip: 'preseason' };
  /* ⚠️ SLEEPER SAYING "WEEK 1" IS NOT THE SAME AS WEEK 1 BEING NEAR (register
   * 434). It flipped to regular/week-1 on 2026-08-30, ELEVEN DAYS before the
   * first game, and the capture is one-per-week-ever — so a fire in that gap
   * records a recommendation made before the week existed and then suppresses
   * the real one, while the probe prints its most reassuring line. `weekIsLive`
   * returns null when the schedule cannot answer, and null must NOT block:
   * a missing schedule restores the old behaviour rather than inventing a
   * season-long silent refusal. */
  if (WINDOW.weekIsLive(season, week, now) === false) {
    return { skip: WINDOW.SKIP_REASON };
  }
  const commish = (owners || []).find(o => o.is_commissioner);
  if (!commish) return { skip: 'no commissioner owner' };
  const map = (cfg && cfg.sleeper_map) || {};
  const myRid = Object.keys(map).find(rid => Number(map[rid]) === Number(commish.id));
  if (!myRid) return { skip: 'commissioner not mapped to a Sleeper roster' };
  /* ⚠️ THE CLOCK TRAVELS WITH THE DECISION (register 458). The marker written
   * downstream is read back by `markerIsPremature`, which compares its `at`
   * against this same window — so if the stamp comes from a DIFFERENT clock
   * than the gate, the two can disagree and the self-heal re-fires the capture
   * on every run, writing a duplicate ledger row each time.
   *
   * That is not hypothetical: it is exactly what `capture_opens_and_writes.js`
   * caught the first time the open-window arm was ever executed — the gate said
   * "inside the window", `new Date()` stamped the marker outside it, and the
   * next run re-captured. One decision, one clock (rule 11). */
  return { season, week, ownerId: commish.id, myRid, now };
}

exports.autoCaptureContext = autoCaptureContext;

/* Pure, exported for the unit test: shape the Tuesday wire email's payload
 * from the reco, and decide whether it is worth an inbox at all. Actionable =
 * a positive claim, a block-watch row, or a hard-OUT on the roster — a week
 * with none of those sends nothing (the Sunday-alert noise lesson: fifteen
 * "nothing to do" emails teach you to stop opening the one that matters). */
function wirePayload(reco, week, ridName, leagueId) {
  const top = (reco && reco.claims && reco.claims[0]) || null;
  const bw = ((reco && reco.blockWatch) || []).map(b => ({ ...b,
    denies_names: (b.denies || []).map(ridName) }));
  const inj = (reco && reco.myInjured) || [];
  const p = {
    week,
    topClaim: top && top.net_value > 0
      ? { name: top.name, position: top.position, net_value: top.net_value,
          dollars: top.dollars, drop: reco.drop || null }
      : null,
    stream: ((reco && reco.streamClaims) || [])[0] || null,
    blockWatch: bw,
    myInjured: inj,
    // Catalog item 14 ("IR moves... end at the transaction, which happens
    // in Sleeper"): the injury section names who's hurt; this is what lets
    // notify.js turn that into an actual "open in Sleeper" link, same URL
    // construction as server-app.js's res.locals.sleeperLink('team').
    leagueId: leagueId || null,
  };
  p.actionable = !!(p.topClaim || bw.length || inj.some(x => x.out));
  return p;
}
exports.wirePayload = wirePayload;

/* The capture itself, callable from BOTH entry points: the schedule (below)
 * and the app's /api/reco-probe route. Netlify SCHEDULED functions are not
 * HTTP-invocable — the probe's first live run answered an edge 403 with an
 * empty body and proved it (2026-08-24), which also falsifies grade-cron's
 * old "manually invocable" comment for scheduled functions generally. The
 * app function IS reachable, so verification goes through it. */
exports.runCapture = async () => {
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
    /* ⚠️ A MARKER WRITTEN BEFORE ITS OWN WEEK'S WINDOW OPENED IS NOT A RECORD
     * OF THAT WEEK'S DECISION (register 438). `lineupauto:2026:1` was written
     * on 2026-08-30, eleven days before week 1's first game, by the probe's
     * fallback capture — and without this it would suppress the real Sunday
     * capture for the whole of week 1 while the probe reported the healthiest
     * verdict it has. Nothing in a pull request can edit the live store, so the
     * self-heal has to live here. A marker with no `at` is treated as VALID:
     * markers predate that field and refusing them would re-capture history. */
    const mark = await store.get(markKey);
    if (mark && !WINDOW.markerIsPremature(mark, ctx.season, ctx.week)) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'already captured', week: ctx.week }) };
    }
    if (mark) {
      console.log(`[waiver-reco] marker ${markKey} was written ${mark.at}, before week ${ctx.week}'s capture window opened — recapturing at the real decision moment (register 438)`);
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
    let captured = 0, note = null;
    if (!entries.length) {
      await store.set(markKey, { none: true, live: reco.live,
        blockWatch: (reco && reco.blockWatch) || [], at: new Date(ctx.now).toISOString() });
      note = reco.live ? 'tool says hold — recorded as the week marker' : 'reco not live';
    } else {
      for (const entry of entries) await predledger.append(store, entry);
      // blockWatch rides on the marker: P331 grades whether flagged players
      // actually get claimed by the owners they were flagged for, and that
      // grade needs the Tuesday-night snapshot, not a re-derivation.
      await store.set(markKey, { keys: entries.map(e => e.payload.key),
        blockWatch: reco.blockWatch || [], at: new Date(ctx.now).toISOString() });
      captured = entries.length;
    }

    /* THE TUESDAY WIRE ALERT (task 36, Cory's "fastest on news" item): the
     * same computation this run just logged goes to the commissioner's inbox
     * before waivers clear overnight. Once per week, stamped on success only
     * so a failed send retries next invocation; a non-actionable week sends
     * nothing (see wirePayload). */
    let emailed = 0, emailNote = null;
    try {
      const notify = require('../../src/notify');
      const ridName = rid => {
        const oid = Number((cfg.sleeper_map || {})[String(rid)]);
        return ((owners || []).find(o => Number(o.id) === oid) || {}).name || `team ${rid}`;
      };
      const payload = wirePayload(reco, ctx.week, ridName, cfg.sleeper_league_id);
      const wireStamp = `tuesdaywire:${ctx.season}:${ctx.week}`;
      if (!payload.actionable) emailNote = 'nothing worth an inbox this week';
      else if (await store.get(wireStamp)) emailNote = 'already sent this week';
      else {
        const r = await notify.tuesdayWire(owners, payload);
        /* real clock ON PURPOSE: this records when an inbox was actually
         * touched, not which week's decision was captured, and nothing reads
         * it through markerIsPremature (register 458). */
        if (r && r.sent) { emailed = 1; await store.set(wireStamp, { at: new Date().toISOString() }); }
        else emailNote = (r && (r.reason || r.error)) || 'send skipped';
      }
    } catch (e) { emailNote = String(e && e.message || e); }

    return { statusCode: 200, body: JSON.stringify({ ok: true, week: ctx.week,
      captured, ...(note ? { note } : { keys: entries.map(e => e.payload.key) }),
      emailed, ...(emailNote ? { emailNote } : {}) }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message || e) }) };
  }
};

exports.handler = async (event) => {
  store.initBlobs(event);
  return exports.runCapture();
};
