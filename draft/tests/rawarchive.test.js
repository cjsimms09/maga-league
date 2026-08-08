// Raw-forever archive (Phase L2) — immutability + append-only + dedup tests.
// Run: node draft/tests/rawarchive.test.js
const R = require('../../src/rawarchive');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  — ' + detail : '')); }
}

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
  const now = '2026-08-22T18:00:00.000Z';

  // --- content hash is stable and order-independent ------------------------
  check('content hash is order-independent for object keys',
    R.contentHash({ a: 1, b: 2 }) === R.contentHash({ b: 2, a: 1 }));
  check('content hash changes when content changes',
    R.contentHash({ a: 1 }) !== R.contentHash({ a: 2 }));

  // --- snapshot: append-only, immutable ------------------------------------
  const s = memStore();
  const r1 = await R.snapshot(s, { kind: 'draft_picks', season: 2026,
    payload: { picks: [{ id: '1' }] } }, { now });
  check('a snapshot is written with seq 1 and a hash',
    r1.snapshot && r1.snapshot.seq === 1 && !!r1.snapshot.hash && r1.deduped === false);
  check('the snapshot is frozen at the top level (seq/hash/kind immutable)',
    (function () { try { r1.snapshot.seq = 999; r1.snapshot.kind = 'x'; } catch (e) {}
      return r1.snapshot.seq === 1 && r1.snapshot.kind === 'draft_picks'; })());

  // --- dedup: identical content does not duplicate -------------------------
  const writesBefore = s.writes();
  const r2 = await R.snapshot(s, { kind: 'draft_picks', season: 2026,
    payload: { picks: [{ id: '1' }] } }, { now });
  check('an identical re-archive is deduped (no new snapshot, no write)',
    r2.deduped === true && r2.snapshot === null && s.writes() === writesBefore);

  // --- a changed payload archives a new distinct snapshot ------------------
  const r3 = await R.snapshot(s, { kind: 'draft_picks', season: 2026,
    payload: { picks: [{ id: '1' }, { id: '2' }] } }, { now });
  check('a changed payload archives a new snapshot with the next seq',
    r3.deduped === false && r3.snapshot.seq === 2);

  const all = await R.readAll(s, 2026, 'draft_picks');
  check('readAll returns the distinct snapshots in seq order',
    all.length === 2 && all[0].seq === 1 && all[1].seq === 2);
  check('the ordered snapshots ARE the raw history (state 1 then state 2)',
    all[0].payload.picks.length === 1 && all[1].payload.picks.length === 2);

  // --- different kinds are namespaced independently ------------------------
  await R.snapshot(s, { kind: 'board', season: 2026, payload: { built_at: 'x' } }, { now });
  const man = await R.manifest(s, 2026);
  check('manifest counts snapshots per kind',
    man.draft_picks === 2 && man.board === 1, JSON.stringify(man));

  // --- validation: unknown kind / missing season rejected ------------------
  check('an unknown raw kind is rejected loudly',
    await (async () => { try { await R.snapshot(s, { kind: 'nope', season: 2026 }, { now }); return false; }
      catch (e) { return /unknown raw kind/.test(e.message); } })());
  check('a missing season is rejected',
    await (async () => { try { await R.snapshot(s, { kind: 'board' }, { now }); return false; }
      catch (e) { return /needs a season/.test(e.message); } })());

  // --- immutability: readAll never writes ----------------------------------
  const w = s.writes();
  await R.readAll(s, 2026, 'draft_picks');
  await R.manifest(s, 2026);
  check('readAll and manifest perform no writes (raw is read-only after archive)',
    s.writes() === w);

  console.log('\n' + pass + '/' + (pass + fail) + ' rawarchive checks passed');
  process.exit(fail ? 1 : 0);
})();
