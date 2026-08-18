// TERRITORY: A
'use strict';
// 🔴 AUDIT FINDINGS 1 + 3 (external persistence audit, 2026-08-16): LOST
// UPDATES ON WHOLE-DOCUMENT BLOB WRITES.
//
// Every app doc (ledger, owners, config, alerts) is one JSON blob, and every
// writer did read → modify → write with an `await` between the read and the
// write. Two concurrent requests: A reads [1,2], B reads [1,2], A writes
// [1,2,3], B writes [1,2,4] — entry 3 is gone, silently. The ledger is the
// league's authoritative money state; `owners` has 4+ independent writers
// (a member's password change vs the commissioner's Sleeper record sync).
//
// THIS FILE IS THE RED-THEN-GREEN EVIDENCE. Run against the pre-fix store it
// FAILS (the red run is preserved verbatim in
// draft/audit/persistence_hardening_2026-08-16.md). The fix is at the store
// seam: `store.mutate(key, fn)` — per-key in-process serialization of the
// whole read-modify-write — and the authoritative writers are migrated onto
// it. See the honest-residual-risk header in src/store.js: @netlify/blobs
// 8.2.0 exposes NO conditional write, so cross-instance races are narrowed by
// Netlify's few-warm-instances routing, not eliminated.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mutex-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const L = require(path.join(ROOT, 'src', 'ledger'));
const sleeper = require(path.join(ROOT, 'src', 'sleeper'));
const { hashPassword, verifyPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 220) : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Seal off the network: this test is about the store, not the runner's egress.
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('127.0.0.1')) return realFetch(url, opts);
  return { ok: false, status: 500, text: async () => '' };
};

(async () => {
  await data.ensureSeeded();

  // ═══ 1. THE HEADLINE DEFECT: two interleaved appends on ONE doc ═══════════
  // Each addEntry does `await read` then `await write`. Fired concurrently,
  // both read the same base array; against the pre-fix store the second write
  // erases the first entry. THIS IS THE ASSERTION THAT WAS RED.
  {
    const before = (await L.allEntries()).length;
    const [a, b] = await Promise.all([
      L.addEntry({ owner_id: 2, year: 2026, type: 'weekly', week: 51, amount: 100, desc: 'race A' }),
      L.addEntry({ owner_id: 3, year: 2026, type: 'weekly', week: 52, amount: 100, desc: 'race B' }),
    ]);
    const ledger = await L.allEntries();
    ck('two concurrent ledger appends BOTH survive', ledger.some(e => e.id === a.id) && ledger.some(e => e.id === b.id),
      { before, after: ledger.length, haveA: ledger.some(e => e.id === a.id), haveB: ledger.some(e => e.id === b.id) });
    ck('  and the count grew by exactly two', ledger.length === before + 2, { before, after: ledger.length });
  }

  // ═══ 2. FINDING 3: settle racing a concurrent append ══════════════════════
  // settleAll rewrites the whole doc; an append landing in the same window
  // either erased the settlement or was itself erased.
  {
    const open1 = await L.addEntry({ owner_id: 4, year: 2026, type: 'adjustment', amount: -25, desc: 'open tab 1' });
    const open2 = await L.addEntry({ owner_id: 4, year: 2026, type: 'adjustment', amount: -10, desc: 'open tab 2' });
    const [n, appended] = await Promise.all([
      L.settleAll(4),
      L.addEntry({ owner_id: 5, year: 2026, type: 'adjustment', amount: -5, desc: 'appended during settle' }),
    ]);
    const ledger = await L.allEntries();
    const s1 = ledger.find(e => e.id === open1.id), s2 = ledger.find(e => e.id === open2.id);
    ck('settleAll settled both open entries', !!(s1 && s1.settled && s2 && s2.settled), { n, s1: s1 && s1.settled, s2: s2 && s2.settled });
    ck('  AND the concurrent append survived the settle', ledger.some(e => e.id === appended.id));
  }

  // ═══ 3. update and remove racing appends ══════════════════════════════════
  {
    const target = await L.addEntry({ owner_id: 6, year: 2026, type: 'adjustment', amount: -1, desc: 'to update' });
    const doomed = await L.addEntry({ owner_id: 6, year: 2026, type: 'adjustment', amount: -2, desc: 'to remove' });
    const [, addedDuringUpdate] = await Promise.all([
      L.updateEntry(target.id, { amount: -99 }, 'raced'),
      L.addEntry({ owner_id: 7, year: 2026, type: 'adjustment', amount: -3, desc: 'added during update' }),
    ]);
    let ledger = await L.allEntries();
    ck('updateEntry racing an append: both effects persist',
      (ledger.find(e => e.id === target.id) || {}).amount === -99 && ledger.some(e => e.id === addedDuringUpdate.id),
      { updated: (ledger.find(e => e.id === target.id) || {}).amount, appended: ledger.some(e => e.id === addedDuringUpdate.id) });
    const [, addedDuringRemove] = await Promise.all([
      L.removeEntry(doomed.id),
      L.addEntry({ owner_id: 7, year: 2026, type: 'adjustment', amount: -4, desc: 'added during remove' }),
    ]);
    ledger = await L.allEntries();
    ck('removeEntry racing an append: the removal took AND the append survived',
      !ledger.some(e => e.id === doomed.id) && ledger.some(e => e.id === addedDuringRemove.id),
      { removed: !ledger.some(e => e.id === doomed.id), appended: ledger.some(e => e.id === addedDuringRemove.id) });
  }

  // ═══ 4. THE PRIMITIVE ITSELF: store.mutate(key, fn) ═══════════════════════
  {
    ck('store.mutate exists (the atomic read-modify-write primitive)', typeof store.mutate === 'function');
    if (typeof store.mutate === 'function') {
      // Serialization: a SLOW mutation fully completes before a fast one reads.
      const log = [];
      await store.set('mx:doc', []);
      await Promise.all([
        store.mutate('mx:doc', async v => { log.push('slow-read'); await sleep(40); log.push('slow-write'); return v.concat('slow'); }),
        store.mutate('mx:doc', async v => { log.push('fast-read:' + JSON.stringify(v)); return v.concat('fast'); }),
      ]);
      ck('mutations on one key are serialized (second reads AFTER first wrote)',
        log.join('|') === 'slow-read|slow-write|fast-read:["slow"]', log);
      ck('  and the doc carries both updates in order', JSON.stringify(await store.get('mx:doc')) === '["slow","fast"]', await store.get('mx:doc'));

      // fn returning undefined = deliberate no-write.
      const beforeNoop = await store.get('mx:doc');
      const out = await store.mutate('mx:doc', () => undefined);
      ck('fn returning undefined writes nothing and resolves to the current doc',
        JSON.stringify(out) === JSON.stringify(beforeNoop) && JSON.stringify(await store.get('mx:doc')) === JSON.stringify(beforeNoop));

      // A missing doc reads as null, not a crash.
      const fresh = await store.mutate('mx:never-written', cur => (cur == null ? ['from-null'] : cur));
      ck('a missing doc reaches fn as null and can be created', JSON.stringify(fresh) === '["from-null"]', fresh);

      // A throwing fn must not poison the chain for later mutations.
      let threw = false;
      await store.mutate('mx:doc', () => { throw new Error('deliberate'); }).catch(() => { threw = true; });
      const afterThrow = await store.mutate('mx:doc', v => v.concat('after-throw'));
      ck('a throwing fn rejects its own call and later mutations still run',
        threw && afterThrow.includes('after-throw'), { threw, afterThrow });

      // Different keys do not serialize against each other.
      const t0 = Date.now(); let fastDone = 0;
      await Promise.all([
        store.mutate('mx:slowkey', async v => { await sleep(60); return ['s']; }),
        store.mutate('mx:fastkey', async v => { fastDone = Date.now() - t0; return ['f']; }),
      ]);
      ck('independent keys are not serialized against each other', fastDone < 50, { fastDone });
    }
  }

  // ═══ 5. OWNERS: a password change vs the commissioner's record sync ═══════
  // The audit's named scenario: `owners` is one doc with 4+ writers. The
  // member changes their password while the commissioner runs the Sleeper
  // record sync — pre-fix, whichever wrote last silently reverted the other.
  {
    const owners = await store.get('owners');
    const cory = owners.find(o => o.username === 'cory');
    const rich = owners.find(o => o.name === 'Richard');
    cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
    rich.password_hash = hashPassword('pw'); rich.must_change_password = false;
    await store.set('owners', owners);

    // The sync path needs Sleeper; stub the module's exports (admin.js holds
    // the same module object) so the route runs its REAL read-modify-write.
    const era = {}; era['u-rich'] = { wins: 30, losses: 20, ties: 1 };
    sleeper.bundle = async () => ({ users: [], rosters: [] });
    sleeper.userMap = () => ({ 'u-rich': rich.id });
    sleeper.records = async () => ({ careerByUser: era, seasonsCovered: [2023, 2024] });

    const srv = createApp().listen(0);
    await new Promise(r => srv.once('listening', r));
    const base = `http://127.0.0.1:${srv.address().port}`;
    const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
    const login = async u => cookieFrom(await fetch(base + '/login', { method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw` }));
    const cc = await login('cory'), rc = await login(rich.username);
    const post = (p, ckie, body) => fetch(base + p, { method: 'POST', redirect: 'manual',
      headers: { Cookie: ckie, 'Content-Type': 'application/x-www-form-urlencoded' }, body });

    const [pw, sync] = await Promise.all([
      post('/password', rc, 'current=pw&next=changed-in-race&confirm=changed-in-race'),
      post('/admin/sync-records', cc, ''),
    ]);
    ck('both requests were accepted', pw.status === 302 && sync.status === 302, { pw: pw.status, sync: sync.status });
    const after = await store.get('owners');
    const richAfter = after.find(o => o.id === rich.id);
    ck('the password change SURVIVED the concurrent commissioner sync',
      verifyPassword('changed-in-race', richAfter.password_hash),
      { hint: 'owner-sync clobbered the password write' });
    ck('  and the sync landed too (record_baseline frozen)',
      !!richAfter.record_baseline
        && richAfter.record_baseline.wins === Math.max(0, (rich.wins || 0) - 30)
        && richAfter.record_baseline.through === 'pre-2023',
      richAfter.record_baseline);

    // And the plain whole-doc admin writer racing a member profile write.
    const [rec, prof] = await Promise.all([
      post(`/admin/owners/${rich.id}/record`, cc, 'wins=9&losses=4&ties=0'),
      post('/profile', rc, 'email=rich-race@example.com'),
    ]);
    ck('record edit + profile edit both accepted', rec.status === 302 && prof.status === 302, { rec: rec.status, prof: prof.status });
    const after2 = (await store.get('owners')).find(o => o.id === rich.id);
    ck('the record edit and the email edit BOTH persist',
      after2.wins === 9 && after2.email === 'rich-race@example.com',
      { wins: after2.wins, email: after2.email });

    srv.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
