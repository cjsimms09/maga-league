// TERRITORY: A
'use strict';
/* MARK-AS-PAID IS RECEIVER-CONFIRMS — both arms, allowed and refused.
 *
 * The security claim under test: the person who OWES money can never write
 * "paid" into the record. A payer's mark is a CLAIM (leg.claimed); only the
 * RECEIVER's mark sets leg.paid, and only the receiver can un-set it. A
 * stranger to the leg can do neither. Driven at the module (the enforcement
 * point member.js's route calls) and then over real HTTP so the route carries
 * the same rule — hiding a button is not a guarantee.
 */
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'paidflow-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 200) : ''))); };
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const active = owners.filter(o => o.active && o.id !== cory.id);
  const winner = active[0], stranger = active[1];
  for (const o of [cory, winner, stranger]) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  winner.venmo = 'winner-handle';
  await store.set('owners', owners);

  // A settled bet: cory lost to `winner` — one leg, cory → winner, $60.
  const mkSettled = async () => {
    const b = await SB.propose({ proposer_id: cory.id, party_ids: [winner.id], stake: 60, terms: 'paid-flow fixture' });
    await SB.accept(b.id, winner.id, winner.name);
    await SB.settle(b.id, [winner.id], winner.id, winner.name);
    return SB.get(b.id);
  };

  // ── module arms ───────────────────────────────────────────────────────────
  {
    let b = await mkSettled();
    const leg = b.legs[0];
    ck('fixture: one leg, payer=cory receiver=winner', b.legs.length === 1 && leg.from === cory.id && leg.to === winner.id, b.legs);

    // REFUSED: the payer's mark never sets paid.
    b = await SB.markLeg(b.id, leg.id, cory.id, cory.name, true);
    ck('payer marking "paid" does NOT set paid', b.legs[0].paid === false, b.legs[0]);
    ck('  it records a CLAIM instead, attributed and timestamped',
      b.legs[0].claimed && b.legs[0].claimed.by === cory.id && !!b.legs[0].claimed.at, b.legs[0].claimed);
    ck('  the money stays on the books while only claimed',
      SB.settlementsFor([b], winner.id, () => '').owed_to_me === 60);

    // ALLOWED: the payer can withdraw their own claim.
    b = await SB.markLeg(b.id, leg.id, cory.id, cory.name, false);
    ck('payer can withdraw the claim', b.legs[0].claimed === null && b.legs[0].paid === false, b.legs[0]);

    // REFUSED: a stranger to the leg can do nothing.
    const r = await SB.markLeg(b.id, leg.id, stranger.id, stranger.name, true);
    ck('a stranger to the leg is refused outright', r === null);
    b = await SB.get(b.id);
    ck('  and the leg is untouched', b.legs[0].paid === false && b.legs[0].claimed === null, b.legs[0]);

    // ALLOWED: the receiver's mark is the fact.
    b = await SB.markLeg(b.id, leg.id, winner.id, winner.name, true);
    ck('the receiver marking paid IS the fact', b.legs[0].paid === true && b.legs[0].paid_by === winner.id, b.legs[0]);
    ck('  and the leg leaves the owes-list', SB.settlementsFor([b], winner.id, () => '').owed_to_me === 0);

    // ALLOWED: the receiver can reverse it — "it never arrived" clears any claim.
    await SB.markLeg(b.id, leg.id, cory.id, cory.name, true);          // payer re-claims
    b = await SB.markLeg(b.id, leg.id, winner.id, winner.name, false);
    ck('receiver un-marking clears paid AND the stale claim', b.legs[0].paid === false && b.legs[0].claimed === null, b.legs[0]);
  }

  // Old legs (written before the claim state existed) read cleanly.
  {
    const b = await mkSettled();
    const raw = await store.get(`sidebet:${b.id}`);
    delete raw.legs[0].claimed;
    await store.set(`sidebet:${b.id}`, raw);
    const back = await SB.get(b.id);
    ck('a pre-claim leg normalizes to claimed:null', back.legs[0].claimed === null, back.legs[0]);
  }

  // ── the route carries the same rule (real HTTP) ───────────────────────────
  {
    const b = await mkSettled();
    const leg = b.legs[0];
    const server = createApp().listen(0);
    await new Promise(r => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = async u => cookieFrom(await fetch(base + '/login', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${u}&password=pw`, redirect: 'manual' }));
    const post = async (ck2) => fetch(`${base}/sidebets/${b.id}/leg/${leg.id}`, { method: 'POST',
      headers: { Cookie: ck2, 'Content-Type': 'application/x-www-form-urlencoded' }, body: '', redirect: 'manual' });

    await post(await login('cory'));                     // payer via the route
    let after = await SB.get(b.id);
    ck('via the route, the payer produces a claim, never paid',
      after.legs[0].paid === false && after.legs[0].claimed && after.legs[0].claimed.by === cory.id, after.legs[0]);

    await post(await login(winner.username));            // receiver via the route
    after = await SB.get(b.id);
    ck('via the route, the receiver settles the leg', after.legs[0].paid === true, after.legs[0]);

    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
