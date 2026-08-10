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

  // ── DELETING A VOTE destroys the vote AND every ballot AND every comment —
  // the governance record the amendment ledger derives from — behind a bare "✕".
  // It must be recoverable.
  {
    const VID = 'v-audit-1';
    await setDoc(`vote:${VID}`, { id: VID, question: 'Raise the buy-in?', status: 'closed' });
    await store.set(`ballot:${VID}:${cory.id}`, { owner_id: cory.id, choice: 'yes' });
    await store.set(`ballot:${VID}:${member.id}`, { owner_id: member.id, choice: 'no' });
    await store.set(`vcomment:${VID}:c1`, { body: 'no thanks' });

    await fetch(b + `/admin/votes/${VID}/delete`, { method: 'POST', headers: { ...form, Cookie: cc }, body: '', redirect: 'manual' });
    ck('deleting a vote clears the vote and its ballots', (await getDoc(`vote:${VID}`, null)) === null
      && (await store.listKeys(`ballot:${VID}:`)).length === 0);

    const vb = (await store.listKeys(`vote-backup:${VID}:`)) || [];
    ck('  but a snapshot was taken first (recoverable)', vb.length === 1, vb.join(','));
    const snap = vb.length ? await store.get(vb[0]) : null;
    ck('  the snapshot holds the vote, BOTH ballots and the comment',
      !!snap && snap.vote && snap.vote.id === VID
      && Object.keys(snap.ballots || {}).length === 2
      && Object.keys(snap.comments || {}).length === 1,
      snap && JSON.stringify({ b: Object.keys(snap.ballots || {}).length, c: Object.keys(snap.comments || {}).length }));
    ck('  and it records who deleted it and when', !!snap && snap.deleted_by === cory.id && !!snap.deleted_at);
  }

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
