// Prediction ledger (Phase L1) — append-only + contamination-rule tests.
// Run: node draft/tests/predledger.test.js
const P = require('../../src/predledger');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

// A tiny in-memory store with the same surface the real store exposes, plus a
// write counter so a test can PROVE that reads perform no writes.
function memStore() {
  const m = new Map();
  let writes = 0;
  return {
    writes: () => writes,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async set(k, v) { writes++; m.set(k, v); },
    async listKeys(prefix) { return [...m.keys()].filter(k => k.startsWith(prefix)); },
    async getMany(keys) { return keys.map(k => (m.has(k) ? m.get(k) : null)); },
  };
}

(async function () {
  // --- pure buildEntry -----------------------------------------------------
  const e = P.buildEntry({ kind: 'pick', season: 2026, pick: 34, payload: { name: 'x' } },
    { nowIso: '2026-08-22T18:00:00.000Z', seq: 7 });
  check('buildEntry stamps the SERVER decision_at, not the client clock',
    e.decision_at === '2026-08-22T18:00:00.000Z');
  check('buildEntry carries kind/season/pick/seq/id',
    e.kind === 'pick' && e.season === '2026' && e.pick === 34 && e.seq === 7
      && e.id === '2026-000000007');
  check('every entry carries a method/model version (defaults to kind-v0)',
    e.method === 'pick-v0');
  check('an explicit method is preserved (survival-snapshot-v0 vs future lrm-v1)',
    P.buildEntry({ kind: 'lrm', season: 2026, method: 'survival-snapshot-v0' },
      { nowIso: 'z', seq: 1 }).method === 'survival-snapshot-v0');
  check('a recorded entry is frozen — a reader cannot mutate a prediction',
    (function () { try { e.pick = 999; } catch (x) {} return e.pick === 34; })());
  check('an unknown kind is rejected loudly',
    (function () { try { P.buildEntry({ kind: 'nope', season: 2026 }, { nowIso: 'z', seq: 1 }); return false; }
      catch (x) { return /unknown ledger kind/.test(x.message); } })());
  check('a missing season is rejected',
    (function () { try { P.buildEntry({ kind: 'pick' }, { nowIso: 'z', seq: 1 }); return false; }
      catch (x) { return /needs a season/.test(x.message); } })());

  // --- append-only invariant ----------------------------------------------
  check('assertFreshKey refuses to overwrite an existing key',
    (function () { try { P.assertFreshKey(['pred:2026:000000001'], 'pred:2026:000000001'); return false; }
      catch (x) { return /append-only/.test(x.message); } })());

  // --- store-aware append + read ------------------------------------------
  const store = memStore();
  const now = '2026-08-22T18:05:00.000Z';
  const a = await P.append(store, { kind: 'recommendation', season: 2026, pick: 34,
    build_at: 'B1', payload: { top: [{ name: 'Bowers' }] } }, { now });
  const b = await P.append(store, { kind: 'pick', season: 2026, pick: 34,
    build_at: 'B1', payload: { name: 'Bowers' } }, { now });
  check('append returns entries with increasing seq', a.seq === 1 && b.seq === 2);
  check('append stamps the injected server time as decision_at',
    a.decision_at === now && b.decision_at === now);

  const writesAfterAppend = store.writes();
  const all = await P.readAll(store, 2026);
  check('readAll returns every appended entry, in seq order',
    all.length === 2 && all[0].seq === 1 && all[1].seq === 2);
  check('CONTAMINATION RULE: readAll performs NO writes',
    store.writes() === writesAfterAppend, 'writes went from ' + writesAfterAppend + ' to ' + store.writes());

  // --- the join grading uses: recommendation + pick, by pick number --------
  const recs = all.filter(x => x.kind === 'recommendation');
  const picks = all.filter(x => x.kind === 'pick');
  check('a recommendation and the pick I took join by pick number',
    recs[0].pick === picks[0].pick && recs[0].seq < picks[0].seq,
    'rec logged before pick — outcome cannot contaminate the prediction');

  // --- seq survives a lost counter (falls back to max existing key) --------
  const store2 = memStore();
  await P.append(store2, { kind: 'pick', season: 2026, pick: 34 }, { now });
  await store2.set('pred-seq:2026', null);   // simulate a lost counter
  const c = await P.append(store2, { kind: 'pick', season: 2026, pick: 41 }, { now });
  check('a lost seq counter recovers from existing keys and never reuses a seq',
    c.seq === 2);

  // --- DEMAND 1: the immutability probe ------------------------------------
  // Attempt to change entry 000000001 through every path the module exposes.
  // Each must FAIL or APPEND — never edit the recorded prediction in place.
  {
    const s = memStore();
    const e1 = await P.append(s, { kind: 'recommendation', season: 2026, pick: 34,
      method: 'composite-v1', payload: { top: ['a'] } }, { now });
    const key = P.seqKey(2026, e1.seq);

    // Path 1: re-append with the same season/kind must NOT reuse the key — it
    // gets a new seq, leaving entry 1 untouched.
    const e2 = await P.append(s, { kind: 'recommendation', season: 2026, pick: 34,
      method: 'composite-v1', payload: { top: ['DIFFERENT'] } }, { now });
    const after1 = (await s.get(key));
    check('probe: a second append never overwrites entry 1 (new seq instead)',
      e2.seq === e1.seq + 1 && after1.payload.top[0] === 'a');

    // Path 2: the returned object is frozen — a grading pass that holds a
    // reference cannot mutate the prediction content.
    try { e1.payload.top[0] = 'tampered'; } catch (x) {}
    try { e1.decision_at = 'backdated'; } catch (x) {}
    const reread = await s.get(key);
    check('probe: a held reference cannot mutate the stored prediction',
      reread.decision_at === now && reread.kind === 'recommendation');

    // Path 3: the module exposes NO update or delete — grading can only read
    // and append. (Part 11: grading appends grades, never touches predictions.)
    check('probe: the ledger module exposes no update/delete/edit function',
      typeof P.update === 'undefined' && typeof P.del === 'undefined'
        && typeof P.edit === 'undefined' && typeof P.remove === 'undefined');

    // Path 4: assertFreshKey is the guard that makes a direct re-write refuse.
    check('probe: a direct re-write of an existing key is refused (append-only)',
      (function () { try { P.assertFreshKey([key], key); return false; }
        catch (x) { return /append-only/.test(x.message); } })());
  }

  // --- DEMAND 2: coverage across all kinds ---------------------------------
  // Draft night fires all of these; each must WRITE. A domain that recommends
  // without logging is invisible to the learning loop.
  {
    const s = memStore();
    const kinds = ['recommendation', 'pick', 'survival', 'override', 'lrm', 'run'];
    for (const k of kinds) {
      await P.append(s, { kind: k, season: 2026, pick: 34, method: k + '-v1',
        payload: { probe: k } }, { now });
    }
    const all = await P.readAll(s, 2026);
    check('coverage: all six kinds write to the ledger',
      kinds.every(k => all.some(e => e.kind === k)) && all.length === 6,
      all.map(e => e.kind).join(','));
    check('coverage: each kind carries its own method tag',
      all.every(e => e.method === e.kind + '-v1'));
  }

  // --- §C override-reason capture: the one entry kind that needs my finger ---
  {
    const s = memStore();
    const e = await P.append(s, { kind: 'override', method: 'override-reason-v1', season: 2026,
      pick: 34, payload: { player_id: '99', name: 'X', over_name: 'TopRec',
        reason: 'target', off_top_rec: true } }, { now });
    check('override-reason logs with its method, reason, and off-top-rec flag',
      e.method === 'override-reason-v1' && e.payload.reason === 'target'
        && e.payload.off_top_rec === true && e.payload.over_name === 'TopRec');
  }

  console.log('\n' + pass + '/' + (pass + fail) + ' predledger checks passed');
  process.exit(fail ? 1 : 0);
})();
