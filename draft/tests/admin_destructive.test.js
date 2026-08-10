'use strict';
// ADMIN SAFETY — the destructive commissioner actions, audited.
//
// `/admin/draft/reset` hard-deletes every owner's claimed draft spot. Days before
// a draft, with claims landing live, its only guard was a client-side confirm() —
// which a stray POST, a double-tap or a resubmitted form walks straight past, and
// the nightly backup would lose every claim made since. This asserts the two real
// guards: a SERVER-side typed confirmation, and a snapshot taken before the delete
// so a mistake is recoverable.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'admd-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { getDoc, setDoc } = data;
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
const form = { 'Content-Type': 'application/x-www-form-urlencoded' };
(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const member = owners.find(o => o.username !== 'cory' && o.active);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  member.password_hash = hashPassword('pw'); member.must_change_password = false; member.is_commissioner = false;
  await store.set('owners', owners);

  // A year the seed migrations do not touch: `draft2026_reopened` clears 2026 spots
  // on world-load, which would confuse this test about the RESET logic itself.
  const YEAR = 2099;
  const claims = { order: [{ pos: 1, owner_id: cory.id, slot: 3 }, { pos: 2, owner_id: member.id, slot: 1 }] };
  await setDoc(`draft:${YEAR}`, claims);

  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: form, body: `username=${u}&password=pw`, redirect: 'manual' }));

  // 1) A plain member cannot reach ANY destructive admin route.
  const mc = await login(member.username);
  const mres = await fetch(b + '/admin/draft/reset', { method: 'POST', headers: { ...form, Cookie: mc }, body: `year=${YEAR}&confirm=RESET`, redirect: 'manual' });
  ck('a member cannot reset the draft (403)', mres.status === 403, mres.status);
  ck('  and the claims survive that attempt', !!(await getDoc(`draft:${YEAR}`, null)));

  const cc = await login('cory');

  // 2) WITHOUT the typed confirmation the draft must survive, even as commissioner.
  await fetch(b + '/admin/draft/reset', { method: 'POST', headers: { ...form, Cookie: cc }, body: `year=${YEAR}`, redirect: 'manual' });
  const still = await getDoc(`draft:${YEAR}`, null);
  ck('a commissioner POST WITHOUT the typed confirm does NOT wipe the draft', !!still && (still.order || []).length === 2);

  // 3) A wrong confirmation is also refused.
  await fetch(b + '/admin/draft/reset', { method: 'POST', headers: { ...form, Cookie: cc }, body: `year=${YEAR}&confirm=yes`, redirect: 'manual' });
  ck('a wrong confirmation string is refused too', !!(await getDoc(`draft:${YEAR}`, null)));

  // 4) WITH the confirmation it clears — and snapshots first.
  await fetch(b + '/admin/draft/reset', { method: 'POST', headers: { ...form, Cookie: cc }, body: `year=${YEAR}&confirm=RESET`, redirect: 'manual' });
  ck('with the typed confirm the draft is cleared', (await getDoc(`draft:${YEAR}`, null)) === null);

  const backups = (await store.listKeys(`draft-backup:${YEAR}:`)) || [];
  ck('a snapshot was written BEFORE the delete (recoverable)', backups.length === 1, backups.join(','));
  const snap = backups.length ? await store.get(backups[0]) : null;
  ck('  the snapshot holds the actual claimed spots', !!snap && (snap.order || []).length === 2
    && snap.order.some(p => p.slot === 3) && snap.order.some(p => p.slot === 1));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
