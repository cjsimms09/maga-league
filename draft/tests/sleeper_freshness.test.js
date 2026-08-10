'use strict';
/* bundle() MUST TELL ITS CALLERS HOW OLD THE DATA IS.
 *
 * It served the stale cache with no signal, so on a Sunday outage the matchup,
 * scoreboard, what-to-watch and home hero would all keep showing old scores as if
 * live. B closed those four by deriving staleness from the cache doc rather than
 * reaching into sleeper.js — right at the time, but it leaves every FUTURE caller
 * having to remember, and the one that forgets is silently dishonest. Freshness
 * now rides on what bundle() returns.
 *
 * THE PROPERTY IS NON-ENUMERABLE, and that is load-bearing: this object is spread,
 * JSON.stringify'd and Object.keys'd throughout the app, so a visible new key
 * would leak into responses and stored snapshots. These tests assert BOTH that it
 * is readable and that it stays invisible.
 *
 * METHOD NOTE, adopted from B (its first staleness test passed for the wrong
 * reason — it seeded the cache under a wrong league_id, which bundle() SILENTLY
 * DISCARDS). Silent discard is possible here too, so the vacuity check below
 * proves the fixture is actually being served before anything is asserted about it.
 *
 * Run: node draft/tests/sleeper_freshness.test.js
 */
const path = require('path');
const Module = require('module');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

// Stub the store so bundle() reads a cache WE control, and the network so a
// "live" path can be forced or failed on demand.
const ROOT = path.join(__dirname, '..', '..');
let CACHE = null;
let NET = () => { throw new Error('network disabled in this test'); };

const realLoad = Module._load;
Module._load = function (req, parent, isMain) {
  // Stub the DOC layer sleeper.js actually uses (src/data.js), not the store
  // beneath it — stubbing the wrong level is how a test ends up exercising real
  // persistence and passing for reasons unrelated to what it claims.
  if (req === './data' || req === '../data' || /[\\/]data(\.js)?$/.test(req)) {
    return {
      getDoc: async () => CACHE,
      setDoc: async (_k, v) => { CACHE = v; },
    };
  }
  return realLoad.apply(this, arguments);
};

const SLEEPER = require(path.join(ROOT, 'src', 'sleeper.js'));
Module._load = realLoad;

const LEAGUE = 'L123';
const DATA = { league: { league_id: LEAGUE }, week: 5, rosters: [], users: [], matchups: [] };

(async function run() {
  // ── FRESH CACHE (inside TTL) is served, and says so ───────────────────────
  CACHE = { league_id: LEAGUE, fetched_at: Date.now() - 1000, data: DATA, cached: 'x' };
  let b = await SLEEPER.bundle(LEAGUE);

  // VACUITY CHECK FIRST — B's lesson. If the fixture were discarded (wrong
  // league_id, wrong shape) every assertion below would pass against null or a
  // live fetch and mean nothing.
  ck('the fixture is actually being served (not silently discarded)',
     !!b && b.week === 5, JSON.stringify(b && Object.keys(b)));

  ck('a served bundle carries _freshness', !!(b && b._freshness), b && b._freshness);
  ck('fresh cache reports NOT stale', b._freshness.is_stale === false, b._freshness);
  ck('and reports an age', typeof b._freshness.age_ms === 'number', b._freshness);
  ck('freshness() reads it off the bundle',
     SLEEPER.freshness(b) && SLEEPER.freshness(b).served_from === 'cache');

  // ── NON-ENUMERABLE: nothing downstream may see a new key ──────────────────
  ck('_freshness is invisible to Object.keys',
     Object.keys(b).indexOf('_freshness') === -1, Object.keys(b));
  ck('_freshness is invisible to JSON.stringify',
     JSON.stringify(b).indexOf('_freshness') === -1);
  ck('_freshness does not survive a spread (so it cannot leak into a response)',
     ({ ...b })._freshness === undefined);

  // ── STALE AFTER A FAILURE is the case that was silent ─────────────────────
  const oldAt = Date.now() - 6 * 60 * 1000;          // beyond TTL
  CACHE = { league_id: LEAGUE, fetched_at: oldAt, data: DATA,
            failed_at: Date.now() - 5000, cached: 'x' };
  b = await SLEEPER.bundle(LEAGUE);
  ck('after a failure the stale bundle is still SERVED (pages keep rendering)',
     !!b && b.week === 5);
  ck('and it is flagged STALE — the silence this closes',
     b._freshness.is_stale === true, b._freshness);
  ck('with the reason named',
     b._freshness.served_from === 'stale-after-failure', b._freshness);
  ck('and the last-good time carried, not the failure time',
     b._freshness.fetched_at === oldAt, b._freshness);
  ck('age is measured from LAST GOOD, so it reflects how wrong the data may be',
     b._freshness.age_ms >= 6 * 60 * 1000 - 2000, b._freshness.age_ms);

  // ── THE DISCRIMINATING CASE, and the reason it exists ─────────────────────
  // The stale case above has a 6-minute-old fetched_at, so is_stale is true via
  // the AGE clause whether or not the failure clause works. I proved that by
  // breaking the failure clause: the suite still passed 14/14. A test that cannot
  // fail for the reason it was written is the vacuity B caught in its own work.
  //
  // This case isolates the failure signal: a bundle served after a failure with
  // NO prior good fetch (fetched_at 0). Age is unknown, so ONLY served_from can
  // mark it stale — and it must, because "we have never had good data and the
  // fetch just failed" is the most stale a bundle can be.
  CACHE = { league_id: LEAGUE, fetched_at: 0, data: DATA,
            failed_at: Date.now() - 5000, cached: 'x' };
  b = await SLEEPER.bundle(LEAGUE);
  ck('served-after-failure with no prior good fetch is STALE on served_from alone',
     !!b && b._freshness.is_stale === true && b._freshness.age_ms === null,
     JSON.stringify(b && b._freshness));

  // ── A WRONG league_id must NOT be served (the silent-discard path itself) ──
  CACHE = { league_id: 'SOMETHING-ELSE', fetched_at: Date.now(), data: DATA, cached: 'x' };
  let threw = false, other = null;
  try { other = await SLEEPER.bundle(LEAGUE); } catch (e) { threw = true; }
  ck("another league's cache is never served as ours",
     threw || !other || other.week !== 5 || (other._freshness || {}).served_from === 'live',
     'got ' + JSON.stringify(other && other.week));

  console.log('\n' + pass + '/' + (pass + fail) + ' sleeper-freshness checks passed');
  process.exit(fail ? 1 : 0);
})();
