/* TRUE EDIT OF AN UNACCEPTED BET — Cory's ruling, 2026-08-23: "I didn't say
 * bet withdrawal I said edit." End-to-end through the real app: proposer
 * edits in place, terms are versioned, and THE CONTROL THAT MATTERS — an
 * accept of the pre-edit terms is REFUSED, because nobody may be bound to
 * words they never saw. */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app.js'));
const data = require(path.join(ROOT, 'src', 'data.js'));
const store = require(path.join(ROOT, 'src', 'store.js'));
const SB = require(path.join(ROOT, 'src', 'sidebets.js'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const rich = owners.find(o => /rich/i.test(o.username)) || owners[1];
  const cory = owners.find(o => o.is_commissioner);
  for (const o of [rich, cory]) { o.password_hash = hashPassword('pw123456'); o.must_change_password = false; }
  await store.set('owners', owners);
  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const b = 'http://127.0.0.1:' + srv.address().port;
  const login = async u => (await fetch(b + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${u}&password=pw123456`, redirect: 'manual',
  })).headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
  const post = (p2, cookie, body) => fetch(b + p2, { method: 'POST', redirect: 'manual',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const rc = await login(rich.username);
  const cc = await login(cory.username);

  await post('/sidebets', rc,
    `ticket=finish&format=prop&kind=finish_above&stake=25&party=${cory.id}&terms=${encodeURIComponent('Rich finishes above Cory')}`);
  const bet = (await SB.all()).find(x => x.status === 'proposed'
    && x.proposer_id === rich.id && (x.parties || []).some(p => p.owner_id === cory.id));
  ck('fixture: the proposal exists at v1', !!bet && (bet.terms_version || 1) === 1, bet && bet.terms_version);

  // A non-proposer cannot edit — even a party to the bet.
  const r1 = await post(`/sidebets/${bet.id}/edit`, cc, 'stake=999');
  ck('a non-proposer edit is refused', /betfail=not_yours/.test(r1.headers.get('location') || ''), r1.headers.get('location'));
  ck('and changed nothing', (await SB.get(bet.id)).stake === 25);

  // The proposer edits in place: same bet, new terms, version bumps.
  await post(`/sidebets/${bet.id}/edit`, rc, `stake=40&terms=${encodeURIComponent('Rich finishes above Cory, loser wears the jersey')}`);
  const v2 = await SB.get(bet.id);
  ck('the edit landed in place — same bet id, stake 40, v2',
    v2.stake === 40 && v2.terms_version === 2, { stake: v2.stake, v: v2.terms_version });
  ck('the old terms survive on the bet for the card to show',
    v2.edits && v2.edits.length === 1 && v2.edits[0].stake === 25 && v2.edits[0].version === 1, v2.edits);
  ck('the audit says so', v2.audit.some(a => /Edited \(v2\)/.test(a.what || '')), v2.audit.slice(-1));

  // ── THE CONTROL — a stale accept binds nobody ────────────────────────────
  const stale = await post(`/sidebets/${bet.id}/accept`, cc, 'terms_version=1');
  const afterStale = await SB.get(bet.id);
  ck('CONTROL — accepting the PRE-EDIT terms is refused',
    /stale_terms=1/.test(stale.headers.get('location') || ''), stale.headers.get('location'));
  ck('CONTROL — the bet is still only a proposal and Cory is NOT bound',
    afterStale.status === 'proposed'
    && !afterStale.parties.find(p => p.owner_id === cory.id).accepted, afterStale.status);

  // Accepting the CURRENT terms works and locks it.
  await post(`/sidebets/${bet.id}/accept`, cc, 'terms_version=2');
  const locked = await SB.get(bet.id);
  ck('accepting the terms actually on screen locks the bet', locked.status === 'locked', locked.status);

  // Once accepted, edit is over.
  const r2 = await post(`/sidebets/${bet.id}/edit`, rc, 'stake=1');
  ck('edit after acceptance is refused', /betfail=not_editable/.test(r2.headers.get('location') || ''), r2.headers.get('location'));
  ck('and the locked stake stands', (await SB.get(bet.id)).stake === 40);

  // The card renders the machinery: edited chip + old terms + versioned form.
  const page = await fetch(b + '/bank?section=sidebets', { headers: { Cookie: rc } }).then(r => r.text());
  ck('the card shows the ✎ edited chip with the old terms one tap away',
    /✎ edited/.test(page) && /was: \$25/.test(page));

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
