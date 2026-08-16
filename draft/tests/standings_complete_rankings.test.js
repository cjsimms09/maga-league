// TERRITORY: A
'use strict';
// 🔴 AUDIT FINDING 2 (external persistence audit, 2026-08-16): THE STANDINGS /
// DRAFT-ORDER EDITOR ACCEPTED INCOMPLETE RANKINGS.
//
// POST /admin/standings checked DUPLICATE ranks only. A submission missing an
// owner saved silently with nine names; a stray rank 11 in a ten-team league
// saved a non-contiguous list. These standings SET THE NEXT DRAFT'S PICK ORDER
// (admin.js /draft/open reads them), so a quiet partial save is a wrong draft
// order discovered on draft day. Server-side rule now: every ACTIVE owner
// exactly once, ranks exactly the contiguous 1..N, otherwise the whole save is
// rejected with a message naming who is missing / what is wrong.
//
// RED against the pre-fix route (partial and gap cases both saved); the red
// run is preserved in draft/audit/persistence_hardening_2026-08-16.md.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'standings-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 220) : ''))); };

const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('127.0.0.1')) return realFetch(url, opts);
  return { ok: false, status: 500, text: async () => '' };
};

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  const active = owners.filter(o => o.active);
  const N = active.length;
  const YEAR = 2026;

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = login.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');

  const save = async ranks => {  // ranks: {owner_id: rank}
    const body = 'year=' + YEAR + Object.entries(ranks).map(([id, r]) => `&rank_${id}=${r}`).join('');
    const r = await fetch(base + '/admin/standings', { method: 'POST', redirect: 'manual',
      headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    return { status: r.status, msg: decodeURIComponent((r.headers.get('location') || '').split('msg=')[1] || '') };
  };
  const stored = async () => ((await store.get('seasons'))[YEAR] || {}).standings || [];

  const baseline = await stored();

  // ── PARTIAL SET: one active owner has no rank ─────────────────────────────
  {
    const missing = active[N - 1];
    const ranks = {}; active.slice(0, N - 1).forEach((o, i) => { ranks[o.id] = i + 1; });
    const r = await save(ranks);
    ck('a partial submission is REJECTED (this was the silent-save defect)',
      !/Standings saved/.test(r.msg), r.msg);
    ck('  and the message NAMES who is missing', r.msg.includes(missing.name), r.msg);
    ck('  and nothing was written', JSON.stringify(await stored()) === JSON.stringify(baseline));
  }

  // ── DUPLICATE RANK ────────────────────────────────────────────────────────
  {
    const ranks = {}; active.forEach((o, i) => { ranks[o.id] = i + 1; });
    ranks[active[1].id] = 1;   // two owners at rank 1, nobody at rank 2
    const r = await save(ranks);
    ck('a duplicate rank is rejected', !/Standings saved/.test(r.msg) && /once|Duplicate|duplicate/.test(r.msg), r.msg);
    ck('  and nothing was written', JSON.stringify(await stored()) === JSON.stringify(baseline));
  }

  // ── GAP: all owners ranked, but 1..N-1 plus N+1 ───────────────────────────
  {
    const ranks = {}; active.forEach((o, i) => { ranks[o.id] = i + 1; });
    ranks[active[N - 1].id] = N + 1;   // rank N skipped, N+1 used
    const r = await save(ranks);
    ck('a gapped (non-contiguous) ranking is REJECTED', !/Standings saved/.test(r.msg), r.msg);
    ck('  and the message states the 1..N rule', r.msg.includes(`1`) && r.msg.includes(String(N)), r.msg);
    ck('  and nothing was written', JSON.stringify(await stored()) === JSON.stringify(baseline));
  }

  // ── A COMPLETE PERMUTATION SAVES ──────────────────────────────────────────
  {
    // Reverse order, so the save is provably ORDERED BY RANK, not by owner id.
    const ranks = {}; active.forEach((o, i) => { ranks[o.id] = N - i; });
    const r = await save(ranks);
    ck('a complete 1..N permutation is ACCEPTED', /Standings saved/.test(r.msg), r.msg);
    const got = await stored();
    const want = active.map(o => o.id).reverse();
    ck('  and stored in rank order', JSON.stringify(got) === JSON.stringify(want), { got, want });
    ck('  covering every active owner exactly once', new Set(got).size === N && got.length === N);
  }

  // ── AN INACTIVE OWNER'S RANK IS NOT REQUIRED AND NOT COUNTED ──────────────
  {
    const benched = active.find(o => !o.is_commissioner);
    const ownersNow = await store.get('owners');
    ownersNow.find(o => o.id === benched.id).active = false;
    await store.set('owners', ownersNow);
    const rest = active.filter(o => o.id !== benched.id);
    const ranks = {}; rest.forEach((o, i) => { ranks[o.id] = i + 1; });
    const r = await save(ranks);
    ck('with an owner deactivated, the remaining 1..N-1 permutation saves', /Standings saved/.test(r.msg), r.msg);
    ck('  and the inactive owner is not in the standings', !(await stored()).includes(benched.id));
    ownersNow.find(o => o.id === benched.id).active = true;
    await store.set('owners', ownersNow);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
