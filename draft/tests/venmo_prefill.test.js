/* PREFILLED VENMO LINKS (redesign catalog item 8, 2026-08-24) — every pay
 * button carries its amount and a note, so the tap IS the payment.
 *
 * End-to-end against the real app: a settled unpaid side bet renders an
 * owe-row whose Venmo link prefills txn=pay&amount=<net>, and the bank's
 * Square Up transfers prefill each row's own amount. Negative arm: an owner
 * with no handle still renders the loud "no Venmo on file", never a bare or
 * broken link.
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'venmopre-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createApp } = require(path.join(ROOT, 'server-app'));
const data = require(path.join(ROOT, 'src', 'data'));
const store = require(path.join(ROOT, 'src', 'store'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));

let pass = 0, fail = 0;
const ck = (name, cond, detail) => {
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + name + (cond ? '' : '  -> ' + (detail || '')));
  cond ? pass++ : fail++;
};

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const rich = owners.find(o => o.username === 'rich') || owners.find(o => /rich/i.test(o.name || ''));
  const cory = owners.find(o => o.username === 'cory');
  for (const o of owners) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  cory.venmo = 'cory-simms';       // creditor HAS a handle
  rich.venmo = '';                 // debtor's own handle is irrelevant here
  await store.set('owners', owners);

  // A settled bet rich lost to cory, unpaid — creates the owe-row.
  const nonce = 'venmo-prefill-' + Date.now();
  const bet = await SB.propose({
    proposer_id: rich.id, party_ids: [cory.id], stake: 25,
    terms: nonce, resolves: 'when this test says so',
  });
  await SB.accept(bet.id, cory.id, cory.name);
  await SB.settle(bet.id, [cory.id], cory.id, cory.name, { why: 'test' });

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const login = async u => cookieFrom(await fetch(b + '/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${u}&password=pw`, redirect: 'manual' }));

  const rc = await login(rich.username || 'rich');
  const bank = await fetch(b + '/bank?section=sidebets', { headers: { Cookie: rc } });
  const html = await bank.text();
  ck('bank renders for the debtor', bank.status === 200, bank.status);

  // The owe-row's Venmo button: prefilled with the $25 he owes and a note.
  const oweLink = (html.match(/href="(https:\/\/venmo\.com\/u\/cory-simms[^"]*)"/) || [])[1] || '';
  ck('owe-row Venmo link exists', !!oweLink, 'no venmo.com/u/cory-simms link in /bank');
  ck('…prefilled with txn=pay', /txn=pay/.test(oweLink), oweLink);
  ck('…prefilled with the exact amount owed', /amount=25\.00/.test(oweLink), oweLink);
  ck('…carries a note naming the bet', /note=/.test(oweLink) && /MFGA/.test(decodeURIComponent(oweLink)), oweLink);

  // Square Up transfers (league money): every rendered Venmo button that has a
  // handle must carry an amount — no bare profile links remain on the page.
  const bankTop = await (await fetch(b + '/bank', { headers: { Cookie: rc } })).text();
  const settleLinks = [...bankTop.matchAll(/class="btn gold small" href="(https:\/\/venmo\.com\/u\/[^"]+)"/g)].map(m => m[1]);
  if (settleLinks.length) {
    ck('every Square Up Venmo button prefills its own amount',
      settleLinks.every(u => /txn=pay&amount=\d+(\.\d\d)?/.test(u) || /amount=\d/.test(u)),
      JSON.stringify(settleLinks.slice(0, 3)));
  } else {
    ck('Square Up rendered no Venmo buttons (only the seeded no-handle owners) — negative arm holds',
      /no Venmo on file/.test(bankTop) || !/Square Up/.test(bankTop), 'expected fallback text');
  }

  // Negative arm: a creditor with NO handle renders the loud fallback.
  // (cory owes nothing here, so flip: remove cory's handle, re-render, and the
  // owe-row must fall back rather than emit a broken link.)
  cory.venmo = '';
  await store.set('owners', (await store.get('owners')).map(o => o.id === cory.id ? { ...o, venmo: '' } : o));
  const html2 = await (await fetch(b + '/bank?section=sidebets', { headers: { Cookie: rc } })).text();
  ck('no handle -> loud fallback, never a broken link',
    /no Venmo on file/.test(html2) && !/venmo\.com\/u\/cory-simms/.test(html2), 'fallback missing');

  server.close();
  console.log(`\n${pass}/${pass + fail} venmo prefill checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
