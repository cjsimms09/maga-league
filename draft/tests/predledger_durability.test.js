// TERRITORY: A
/* A FAILED CAPTURE MUST SURVIVE THE FAILURE — proven on a stubbed network.
 *
 * B routed this: PredLedger.override() posted, retried once, and threw the
 * record away, so every draft-night override was one network blip from being
 * lost permanently. The fix parks failed bodies in localStorage and replays
 * them. A durability fix that has never been shown to survive an outage is
 * worth nothing, so this suite drives the outage directly.
 *
 * WHICH CHECKS ACTUALLY DISCRIMINATE, counted rather than asserted. My first
 * header claimed "every check below fails against the old code". THAT IS FALSE
 * and checking it was worth more than the claim: about half of these would fail
 * against the pre-fix version (the parking, ordering, replay and pending()
 * checks), and the rest — "does not throw when localStorage is full/absent/
 * corrupt" — PASS against the old code too, because the old code never touched
 * storage at all. Those are regression guards on the NEW risk this fix
 * introduces, not evidence the fix works. Both kinds belong here; conflating
 * them was the overclaim.
 *
 * Run: node draft/tests/predledger_durability.test.js
 */
'use strict';
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail !== undefined ? '\n        -> ' + String(detail).slice(0, 300) : '')); }
}

/* A localStorage that behaves like the real one, including the ability to be
 * absent or to throw on quota — both real draft-night conditions. */
function memStorage() {
  const m = new Map();
  return {
    _map: m,
    throwOnSet: false,
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (this.throwOnSet && k !== '__pl_probe') throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
  };
}

let online = true;
const posted = [];
global.fetch = function (url, opts) {
  if (!online) return Promise.reject(new Error('network down'));
  posted.push(JSON.parse(opts.body));
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
};
global.localStorage = memStorage();

const PL = require('../../public/js/draft/predledger.js');
const QK = 'predledger_pending_v1';
const q = () => JSON.parse(global.localStorage.getItem(QK) || '[]');

const OV = (pick, chosen) => ({
  season: 2026, pick, build_at: 'B1',
  payload: { chosen, recommended: 'Bowers', score_gap: 3.2, reason: 'news' },
});

(async () => {
  PL._reset(); posted.length = 0;

  // ── 1. THE FAILURE THAT USED TO DESTROY DATA ─────────────────────────────
  online = false;
  await PL.override(OV(13, 'Cook'));
  check('an override that fails to post is PARKED, not dropped', q().length === 1, q());
  check('  and the parked body is the real record, not a stub',
    q()[0] && q()[0].body && q()[0].body.kind === 'override'
    && q()[0].body.payload.chosen === 'Cook' && q()[0].body.payload.reason === 'news',
    q()[0] && q()[0].body);
  check('  pending() reports it, so a status hook can show a live loss risk',
    PL.pending() === 1, PL.pending());

  // ── 2. MORE FAILURES QUEUE IN ORDER ──────────────────────────────────────
  await PL.override(OV(28, 'Smith'));
  await PL.pick({ season: 2026, pick: 33, build_at: 'B1', payload: { name: 'Lamar' } });
  check('further failures queue, oldest first', q().length === 3
    && q()[0].body.pick === 13 && q()[1].body.pick === 28 && q()[2].body.pick === 33,
    q().map(x => x.body.pick));

  /* Snapshot the ORIGINAL capture instants before any replay, so section 4 can
   * assert they are unchanged rather than inferring it from clock ordering. */
  const originalClientAt = {};
  q().forEach(x => { originalClientAt[x.body.pick] = x.body.client_at; });

  // ── 3. RECOVERY REPLAYS EVERYTHING, IN ORDER ─────────────────────────────
  online = true;
  await PL.pick({ season: 2026, pick: 48, build_at: 'B1', payload: { name: 'Swift' } });
  await new Promise(r => setTimeout(r, 30));            // drain is fire-and-forget
  check('the next successful post drains the queue', PL.pending() === 0, q());
  const picks = posted.map(b => b.pick);
  check('  every parked record reached the server', picks.includes(13) && picks.includes(28)
    && picks.includes(33) && picks.includes(48), picks);
  check('  and they arrive in the order they were made (13 before 28 before 33)',
    picks.indexOf(13) < picks.indexOf(28) && picks.indexOf(28) < picks.indexOf(33), picks);

  // ── 4. A REPLAY MUST NOT MASQUERADE AS A LIVE DECISION ───────────────────
  const replayed = posted.filter(b => b.payload && b.payload.replayed_at);
  check('replayed records are STAMPED as replays', replayed.length === 3, replayed.length);
  /* MY FIRST VERSION OF THIS ASSERTED client_at < replayed_at AND IT FAILED —
   * not because the code was wrong but because the replay happened in the SAME
   * MILLISECOND as the capture. That is the identical failure class C reported
   * in the trashtalk tie-break (50% wrong over 19,940 same-millisecond pairs):
   * a wall clock used as an ordering oracle at a resolution it does not have.
   *
   * It was also the wrong assertion. The claim is not "the replay is later" —
   * it is "the ORIGINAL capture instant survives the replay unrewritten", and
   * that is checkable exactly, against the value snapshotted before the flush. */
  /* `.every()` ON AN EMPTY ARRAY IS TRUE. If the replay stamp were never applied,
   * `replayed` would be empty and this would PASS while proving nothing — a
   * vacuous assertion of exactly the kind task #23 is cleaning up, written into
   * a brand-new suite. The length guard is part of the assertion, not a
   * neighbouring check that happens to precede it. */
  check('  and keep their ORIGINAL client_at, so decision time is not rewritten',
    replayed.length === 3 && replayed.every(b => b.client_at === originalClientAt[b.pick]),
    replayed.map(b => [b.pick, b.client_at, originalClientAt[b.pick]]));
  const live = posted.find(b => b.pick === 48);
  check('  a record that never failed is NOT stamped as a replay',
    live && !(live.payload || {}).replayed_at);

  // ── 5. A PARTIAL OUTAGE MUST NOT REORDER ─────────────────────────────────
  PL._reset(); posted.length = 0;
  online = false;
  await PL.override(OV(68, 'A'));
  await PL.override(OV(73, 'B'));
  let n = 0;
  global.fetch = function (url, opts) {                 // succeeds once, then fails again
    n++;
    if (n === 1 || n > 3) { posted.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); }
    return Promise.reject(new Error('flaky'));
  };
  await PL.override(OV(88, 'C'));
  await new Promise(r => setTimeout(r, 30));
  check('a flaky network leaves the REMAINING queue in order, never interleaved',
    q().length > 0                                  // else `.every` passes vacuously
    && q().every((x, i, a) => i === 0 || a[i - 1].body.pick <= x.body.pick),
    q().map(x => x.body.pick));

  // ── 6. STORAGE ITSELF FAILING MUST NOT BREAK CAPTURE ─────────────────────
  global.fetch = function () { return Promise.reject(new Error('down')); };
  PL._reset();
  global.localStorage.throwOnSet = true;
  let threw = false;
  try { await PL.override(OV(93, 'D')); } catch (e) { threw = true; }
  check('a full/blocked localStorage does not throw into the caller', !threw);
  global.localStorage.throwOnSet = false;

  // ── 7. NO localStorage AT ALL (private mode) ─────────────────────────────
  const saved = global.localStorage;
  global.localStorage = undefined;
  threw = false;
  try { await PL.override(OV(108, 'E')); } catch (e) { threw = true; }
  check('with no localStorage at all, capture still does not throw', !threw);
  check('  and pending() reports 0 rather than crashing', PL.pending() === 0);
  global.localStorage = saved;

  // ── 8. A CORRUPT QUEUE MUST NOT POISON THE SESSION ───────────────────────
  PL._reset();
  global.localStorage.setItem(QK, '{{{ not json');
  threw = false;
  try { await PL.override(OV(113, 'F')); } catch (e) { threw = true; }
  check('a corrupt queue is discarded rather than crashing capture', !threw);

  // ── 9. WRITE-AHEAD: THE RECORD IS ON DISK BEFORE THE NETWORK ANSWERS ─────
  /* THE CHECK THAT SEPARATES THIS FIX FROM THE PREVIOUS ONE. Parking on failure
   * survives a network outage; it does NOT survive the browser going away
   * mid-request, because the catch never runs. B named that case specifically —
   * a backgrounded phone discarded at a draft table — and it is the likelier of
   * the two. A hanging fetch stands in for the tab dying: if the record is
   * already in localStorage while the request is still in flight, a tab death at
   * that instant loses nothing.
   *
   * This check FAILS against my own first implementation, which is the point. */
  PL._reset(); posted.length = 0;
  let release;
  global.fetch = function () { return new Promise(r => { release = r; }); };   // never settles
  const inflight = PL.override(OV(128, 'G'));
  await new Promise(r => setTimeout(r, 10));
  check('WRITE-AHEAD: the record is on disk while the request is STILL IN FLIGHT',
    q().length === 1 && q()[0].body.payload.chosen === 'G', q());
  check('  so a tab killed mid-request loses nothing', PL.pending() === 1);
  release({ ok: true, json: () => Promise.resolve({}) });
  await inflight;
  await new Promise(r => setTimeout(r, 10));
  check('  and once the server acknowledges, the row leaves the queue',
    PL.pending() === 0, q());

  // ── 10. THE CONTROL: THIS SUITE MUST BE ABLE TO FAIL ─────────────────────
  /* If `online` did nothing, every check above would pass vacuously against a
   * ledger that simply always works. Prove the outage is real. */
  PL._reset(); posted.length = 0;
  global.fetch = function () { return Promise.reject(new Error('down')); };
  await PL.pick({ season: 2026, pick: 999, build_at: 'B1', payload: { name: 'z' } });
  check('CONTROL: with the network down nothing reaches the server',
    posted.length === 0 && PL.pending() === 1, { posted: posted.length, pending: PL.pending() });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
