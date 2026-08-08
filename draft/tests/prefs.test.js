/* A-1 — prefs sync across the phone/laptop divide (complete-backlog.md A-1).
 * Run: node draft/tests/prefs.test.js
 *
 * The robot scenario the spec names: set a target on simulated device A, assert
 * it renders on device B — through the REAL merge + store logic (src/prefs.js)
 * and the client's mirror of the same rule (prefsync.js).
 */
'use strict';
const P = require('../../src/prefs.js');
const PS = require('../../public/js/draft/prefsync.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

function memStore() {
  const m = new Map();
  return {
    async get(k, d) { return m.has(k) ? m.get(k) : (d === undefined ? null : d); },
    async set(k, v) { m.set(k, v); },
  };
}

(async function main() {
  // --- the named scenario: device A prep -> device B draft -------------------
  {
    const store = memStore();
    const OWNER = 1;
    // Tuesday night, desktop: targets + slider homework, pushed to the server.
    const desktop = await P.save(store, OWNER, {
      updated_at: '2026-08-18T21:00:00.000Z', device: 'desktop',
      prefs: { lists: { targets: ['4034', '8112'], avoid: ['9509'], queue: ['4034'] },
               weights: { value: 1.0, ceiling: 0.8 }, autoWeights: false },
    });
    check('device A push stores the doc under my login', desktop.device === 'desktop'
      && desktop.prefs.lists.targets.length === 2);

    // Saturday, phone: a stale local cache from last week. Server must win.
    const phoneLocal = P.doc({ lists: { targets: ['1111'] } }, '2026-08-11T09:00:00.000Z', 'phone');
    const serverDoc = await P.load(store, OWNER);
    const winner = PS.merge(phoneLocal, serverDoc);
    check('device B: the newer desktop homework beats the stale phone cache',
      winner.device === 'desktop' && winner.prefs.lists.targets.includes('4034'),
      JSON.stringify(winner));
    check('client and server merge rules agree exactly',
      P.merge(phoneLocal, serverDoc) === PS.merge(phoneLocal, serverDoc));

    // The phone then edits (draft-morning tweak) and pushes: now IT is newest.
    const tweaked = await P.save(store, OWNER, {
      updated_at: '2026-08-22T10:00:00.000Z', device: 'phone',
      prefs: { lists: { targets: ['4034', '8112', '5859'], avoid: ['9509'], queue: [] } },
    });
    check('a later phone edit becomes the stored truth (last-write-wins)',
      tweaked.device === 'phone' && tweaked.prefs.lists.targets.length === 3);

    // Desktop reloads: server (phone) is newer than its own stamp — it adopts.
    const back = PS.merge(P.doc({ lists: { targets: ['4034', '8112'] } },
      '2026-08-18T21:00:00.000Z', 'desktop'), await P.load(store, OWNER));
    check('device A later adopts device B\'s newer copy — full round trip',
      back.device === 'phone' && back.prefs.lists.targets.includes('5859'));
  }

  // --- an OLDER push must not clobber newer server state ---------------------
  {
    const store = memStore();
    await P.save(store, 2, { updated_at: '2026-08-20T12:00:00.000Z', device: 'new',
      prefs: { lists: { targets: ['a'] } } });
    const w = await P.save(store, 2, { updated_at: '2026-08-19T12:00:00.000Z', device: 'old',
      prefs: { lists: { targets: ['b'] } } });
    check('a stale push loses: the stored doc keeps the newer copy',
      w.device === 'new' && w.prefs.lists.targets[0] === 'a', JSON.stringify(w));
  }

  // --- sanitize: the whitelist is the schema ---------------------------------
  {
    const clean = P.sanitize({
      lists: { targets: ['1', 2, '3'], avoid: [], junk: ['x'] },
      weights: { value: 1.2, evil: 'DROP TABLE', nan: NaN },
      autoWeights: true,
      playerOverrides: { '42': { bye: 9 } },
      surprise_key: { anything: true },
    });
    check('list ids coerce to strings; unknown list names dropped',
      clean.lists.targets.join(',') === '1,2,3' && !('junk' in clean.lists));
    check('non-numeric and NaN weights are dropped',
      clean.weights.value === 1.2 && !('evil' in clean.weights) && !('nan' in clean.weights));
    check('unknown top-level keys never reach the store', !('surprise_key' in clean));
    check('overrides survive keyed by string id', clean.playerOverrides['42'].bye === 9);

    let threw = false;
    try { P.sanitize({ playerOverrides: { x: 'y'.repeat(300000) } }); } catch (e) { threw = true; }
    check('an oversized document is rejected, not stored', threw);
  }

  // --- the client scheduler: last snapshot wins, stale closures dropped ------
  {
    const pushed = [];
    const fakePush = doc => { pushed.push(doc); return Promise.resolve(doc); };
    const schedule = PS.scheduler(5, fakePush);
    schedule(() => ({ updated_at: 't1', prefs: {} }));
    schedule(() => ({ updated_at: 't2', prefs: {} }));      // supersedes t1
    await new Promise(r => setTimeout(r, 30));
    check('rapid changes collapse into one push of the LATEST snapshot',
      pushed.length === 1 && pushed[0].updated_at === 't2', JSON.stringify(pushed));
  }

  console.log(`\n${pass}/${pass + fail} prefs-sync checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
