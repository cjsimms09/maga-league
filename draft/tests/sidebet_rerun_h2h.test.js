/* RUN IT BACK + LIFETIME HEAD-TO-HEAD (redesign catalog items 4 and 6,
 * 2026-08-24) — model arithmetic, guardrails, and the rendered surface.
 * Nonce-isolated against the persistent store.
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'rerunh2h-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app'));
const data = require(path.join(ROOT, 'src', 'data'));
const store = require(path.join(ROOT, 'src', 'store'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + '  -> ' + JSON.stringify(d))); };
const nonce = 'rerun-' + Date.now();

// pairRecord is pure — fixture bets, no store.
const settled = (id, a, b, winner, stake, extra = {}) => ({
  id, status: 'settled', push: false, stake,
  parties: [{ owner_id: a }, { owner_id: b }], winner_ids: [winner], ...extra });

{
  const bets = [
    settled('x1', 1, 9, 1, 50),           // cory beats richard, +50
    settled('x2', 1, 9, 9, 20),           // richard wins, -20
    settled('x3', 1, 9, 1, 30),           // cory, +30
    { ...settled('x4', 1, 9, 1, 40), push: true, winner_ids: [] },  // push
    settled('x5', 1, 3, 1, 100),          // different pair — excluded
    { ...settled('x6', 1, 9, 1, 75), status: 'locked' },            // unsettled — excluded
    { id: 'x7', status: 'settled', push: false, stake: 60,          // 3-party — excluded
      parties: [{ owner_id: 1 }, { owner_id: 9 }, { owner_id: 3 }], winner_ids: [1] },
  ];
  const r = SB.pairRecord(bets, 1, 9);
  ck('pairRecord counts exactly the settled two-party bets of this pair',
    r.games === 4 && r.aWins === 2 && r.bWins === 1 && r.pushes === 1, r);
  ck('…with the net from a\'s side (+50 −20 +30, push moves nothing)', r.aNet === 60, r);
  const mirror = SB.pairRecord(bets, 9, 1);
  ck('…and the mirror inverts exactly', mirror.aWins === 1 && mirror.bWins === 2
    && mirror.aNet === -60, mirror);
  ck('a pair with no history is 0 games', SB.pairRecord(bets, 5, 6).games === 0);
}

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const rich = owners.find(o => o.username === 'richard');
  for (const o of owners) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  // ── rerun: model ─────────────────────────────────────────────────────────
  const orig = await SB.propose({ proposer_id: cory.id, party_ids: [rich.id],
    stake: 40, terms: nonce + ' settled one', resolves: 'end of season',
    conditions: [{ id: 'c1', when: 'week', week: 2, test: 'outscores', subject_id: cory.id, target_id: rich.id }] });
  ck('a LIVE bet refuses to rerun', (await SB.rerun(orig.id, rich.id)).refused === 'not_finished');

  await SB.accept(orig.id, rich.id, rich.name);
  await SB.settle(orig.id, [cory.id], cory.id, cory.name, { why: 'test' });

  ck('a non-party cannot rerun',
    (await SB.rerun(orig.id, owners.find(o => o.username === 'david').id)).refused === 'not_yours');

  const back = await SB.rerun(orig.id, rich.id);
  ck('rerun creates a fresh PROPOSED bet from the tapper', back && back.status === 'proposed'
    && Number(back.proposer_id) === rich.id, back && back.status);
  ck('…same words, same stake, same opponent, linked',
    back.terms === nonce + ' settled one' && back.stake === 40
    && back.rerun_of === orig.id
    && back.parties.some(p => p.owner_id === cory.id && !p.accepted), back);
  ck('…and the stale week-2 condition was DROPPED with the reason in the audit',
    back.conditions.length === 0
    && back.audit.some(a => /week-bound conditions dropped/.test(a.what || '')), back.conditions);

  const pool = await SB.propose({ proposer_id: cory.id, party_ids: [rich.id],
    stake: 100, terms: nonce + ' pool', format: 'pool' });
  await SB.accept(pool.id, rich.id, rich.name);
  await SB.settle(pool.id, [rich.id], cory.id, cory.name, { why: 'test' });
  ck('a pool refuses — rerun is two-party props only',
    (await SB.rerun(pool.id, rich.id)).refused === 'not_two_party_prop');

  // A season-long conditionless bet keeps nothing worth dropping.
  const plain = await SB.propose({ proposer_id: cory.id, party_ids: [rich.id],
    stake: 10, terms: nonce + ' plain', resolves: 'x' });
  await SB.decline(plain.id, rich.id, rich.name);
  const back2 = await SB.rerun(plain.id, cory.id);
  ck('a DECLINED bet reruns too (revive the offer)', back2 && back2.status === 'proposed'
    && !back2.audit.some(a => /dropped/.test(a.what || '')), back2 && back2.audit);

  // ── surface ──────────────────────────────────────────────────────────────
  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const rc = cookieFrom(await fetch(b + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'username=richard&password=pw', redirect: 'manual' }));

  const page = await (await fetch(b + '/bank?section=sidebets', { headers: { Cookie: rc } })).text();
  ck('the settled card offers Run it back', page.includes(`/sidebets/${orig.id}/rerun`), 'no rerun form');
  ck('the H2H chip shows richard\'s record vs cory (1–1 from the two settled bets)',
    /lifetime vs Cory:/.test(page) && /<b>1–1<\/b>/.test(page), 'chip missing or wrong');

  const post = await fetch(b + `/sidebets/${pool.id}/rerun`, {
    method: 'POST', headers: { Cookie: rc }, redirect: 'manual' });
  ck('the route relays the pool refusal by name',
    /betfail=not_two_party_prop/.test(post.headers.get('location') || ''), post.headers.get('location'));

  server.close();
  console.log(`\n${pass}/${pass + fail} rerun + h2h checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
