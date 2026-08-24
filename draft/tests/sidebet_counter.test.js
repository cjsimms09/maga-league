/* COUNTER-OFFER (redesign catalog item 3, 2026-08-24) — "I'd take this bet at
 * a different price." Model + route + rendered surface, end-to-end.
 *
 * Nonce-isolated (the persistent-store lesson from sidebet_pool_record): every
 * finder keys on this run's own terms, never on shape.
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'sbcounter-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app'));
const data = require(path.join(ROOT, 'src', 'data'));
const store = require(path.join(ROOT, 'src', 'store'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));

let pass = 0, fail = 0;
const ck = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  -> ' + JSON.stringify(detail)));
  cond ? pass++ : fail++;
};
const nonce = 'counter-' + Date.now();

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const rich = owners.find(o => o.username === 'richard');
  const cory = owners.find(o => o.username === 'cory');
  for (const o of owners) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  // ── model ─────────────────────────────────────────────────────────────────
  const orig = await SB.propose({ proposer_id: cory.id, party_ids: [rich.id],
    stake: 50, terms: nonce + ' original', resolves: 'week 3' });

  const r1 = await SB.counter(orig.id, cory.id, cory.name, { stake: 40 });
  ck('the proposer cannot counter their own offer', r1 && r1.refused === 'own_offer', r1);

  const r2 = await SB.counter(orig.id, rich.id, rich.name, { stake: 50, terms: nonce + ' original' });
  ck('an identical counter is refused as no_change (that is an accept)', r2 && r2.refused === 'no_change', r2);

  const out = await SB.counter(orig.id, rich.id, rich.name, { stake: 25 });
  ck('a real counter returns both halves', out && out.bet && out.next, out);
  ck('the original is DECLINED on the record', out.bet.status === 'declined', out.bet.status);
  ck('…and linked forward', out.bet.countered_to === out.next.id, out.bet);
  ck('the counter is a fresh PROPOSED bet with roles swapped',
    out.next.status === 'proposed' && Number(out.next.proposer_id) === rich.id, out.next);
  ck('…at the countered stake, linked back',
    out.next.stake === 25 && out.next.countered_from === orig.id, out.next);
  ck('…with the counter-proposer auto-accepted and the original proposer pending',
    out.next.parties.find(p => p.owner_id === rich.id).accepted === true
      && !out.next.parties.find(p => p.owner_id === cory.id).accepted, out.next.parties);

  const r3 = await SB.counter(orig.id, rich.id, rich.name, { stake: 10 });
  ck('a dead offer cannot be countered again', r3 && r3.refused === 'not_counterable', r3);

  const pool = await SB.propose({ proposer_id: cory.id, party_ids: [rich.id],
    stake: 100, terms: nonce + ' pool', format: 'pool', pool_outcome: 'most wins' });
  const r4 = await SB.counter(pool.id, rich.id, rich.name, { stake: 60 });
  ck('a pool is refused — counters are two-party props only',
    r4 && r4.refused === 'not_two_party_prop', r4);

  // Accepting the counter locks it — the negotiation actually completes.
  const acc = await SB.accept(out.next.id, cory.id, cory.name);
  ck('the original proposer can accept the counter and it locks',
    acc && acc.status === 'locked', acc && acc.status);

  // ── route + surface ───────────────────────────────────────────────────────
  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const login = async u => cookieFrom(await fetch(b + '/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${u}&password=pw`, redirect: 'manual' }));
  const cc = await login('cory'), rc = await login('richard');

  const orig2 = await SB.propose({ proposer_id: cory.id, party_ids: [rich.id],
    stake: 80, terms: nonce + ' route', resolves: 'week 4' });

  // rich sees the Counter door on the card…
  const page1 = await (await fetch(b + '/bank?section=sidebets', { headers: { Cookie: rc } })).text();
  ck('the recipient sees the Counter form on the pending card',
    page1.includes(`/sidebets/${orig2.id}/counter`), 'no counter form');

  // …and uses it.
  const post = await fetch(b + `/sidebets/${orig2.id}/counter`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: rc },
    body: 'stake=45&terms=' + encodeURIComponent(nonce + ' route countered'), redirect: 'manual' });
  ck('the route answers with the countered redirect',
    post.status === 302 && /countered=1/.test(post.headers.get('location') || ''),
    post.headers.get('location'));

  const bets = await SB.all();
  const counterBet = bets.find(x => x.terms === nonce + ' route countered');
  ck('the counter landed with the new terms and stake',
    counterBet && counterBet.stake === 45 && counterBet.countered_from === orig2.id, counterBet && counterBet.stake);

  // cory now has it in front of them, marked as a counter.
  const page2 = await (await fetch(b + '/bank?section=sidebets', { headers: { Cookie: cc } })).text();
  ck('the original proposer sees the counter card with its chip',
    page2.includes(nonce + ' route countered') && /counter-offer — replaces an earlier one/.test(page2),
    'counter card or chip missing');

  // Negative arm at the route: cory countering their OWN new pending offer.
  const own = await SB.propose({ proposer_id: cory.id, party_ids: [rich.id],
    stake: 10, terms: nonce + ' own', resolves: 'x' });
  const post2 = await fetch(b + `/sidebets/${own.id}/counter`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cc },
    body: 'stake=5', redirect: 'manual' });
  ck('route refuses a self-counter with the named reason',
    /betfail=own_offer/.test(post2.headers.get('location') || ''), post2.headers.get('location'));

  server.close();
  console.log(`\n${pass}/${pass + fail} counter-offer checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
