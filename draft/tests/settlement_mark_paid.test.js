'use strict';
// TERRITORY: B — SITE-REVIEW-2026-09-02.md §1/§2 item ③ (catalog 7): "Missing
// function: mark as paid — debtor taps 'I paid', creditor confirms, the line
// clears with a date; today a debt can never be resolved on the site."
//
// League settlement (Square Up) is hub-routed (register: every debtor pays
// the commissioner, the commissioner pays every creditor, never peer-to-
// peer) and recomputed fresh every render from live balances -- there is no
// persisted "leg" object like side bets have. Marking a transfer paid means
// writing a real ledger entry the same way /admin/payment already does
// (L.addEntry, type 'payment', signed from the owner's point of view), via
// an owner-facing two-step mirroring the already-shipped sidebets rule:
// the RECEIVER's mark is the fact; the PAYER's mark is a claim the receiver
// confirms. Hub routing means the counterparty is always the commissioner.
//
// Real app, real HTTP -- the security claim (only the debtor can claim,
// only the commissioner can confirm, only the creditor can self-settle,
// balances actually move, a stale claim is never trusted) has to hold at
// the route, not just in a hidden button.
//
// Run: node draft/tests/settlement_mark_paid.test.js
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'settle-paid-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const L = require(path.join(ROOT, 'src', 'ledger'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');            // the hub
  const active = owners.filter(o => o.active && o.id !== cory.id);
  const debtor = active[0];    // will owe the hub
  const creditor = active[1];  // will be owed by the hub
  const stranger = active[2];
  for (const o of [cory, debtor, creditor, stranger]) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  cory.is_commissioner = true;
  await store.set('owners', owners);
  const season = H.currentSeason(await store.get('seasons'));

  // data.ensureSeeded() already populates real historical ledger entries for
  // every owner, so a fresh addEntry() lands on top of a NON-zero starting
  // balance -- setTo() reads the live balance and adds exactly the delta
  // needed to reach the target, so every assertion below can use a clean,
  // known number regardless of what the seed happened to give these owners.
  const balanceOf = async ownerId => {
    const ledger = await store.get('ledger') || [];
    return L.balances(ledger, owners)[ownerId].balance;
  };
  const setTo = async (ownerId, target, type, desc) => {
    const cur = await balanceOf(ownerId);
    const delta = Math.round((target - cur) * 100) / 100;
    if (Math.abs(delta) > 0.005) await L.addEntry({ owner_id: ownerId, year: season.year, type, amount: delta, desc });
  };

  await setTo(debtor.id, -200, 'buy_in', 'fixture debt');
  await setTo(creditor.id, 150, 'weekly', 'fixture credit');
  await setTo(stranger.id, 0, 'adjustment', 'fixture: stranger owes nothing');

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const loginAs = async u => (await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw` }))
    .headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const cookies = { debtor: await loginAs(debtor.username), creditor: await loginAs(creditor.username),
    cory: await loginAs(cory.username), stranger: await loginAs(stranger.username) };
  const post = (p, cookie, body) => fetch(base + p, { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body || {}).toString() });
  const bank = async cookie => (await fetch(base + '/bank', { headers: { cookie } })).text();

  // ── fixture sanity ─────────────────────────────────────────────────────
  ck('fixture: debtor owes the hub $200', await balanceOf(debtor.id) === -200, await balanceOf(debtor.id));
  ck('fixture: hub owes the creditor $150', await balanceOf(creditor.id) === 150, await balanceOf(creditor.id));
  let html = await bank(cookies.debtor);
  ck('the debtor sees an "I paid this" button on the settlement card',
    /I paid this/.test(html));

  // ── DEBTOR CLAIMS: does not move money ─────────────────────────────────
  await post('/bank/settle/claim', cookies.debtor);
  ck('claiming does NOT change the debtor\'s balance (a claim is not the fact)',
    await balanceOf(debtor.id) === -200, await balanceOf(debtor.id));
  html = await bank(cookies.debtor);
  ck('the debtor now sees "You said you paid"', /You said you paid/.test(html), (html.match(/You said you paid[^<]*/) || [])[0]);
  html = await bank(cookies.cory);
  ck('the commissioner sees the pending claim with a confirm button',
    new RegExp(`<b>${debtor.name}</b> says they paid`).test(html) && /Confirm received/.test(html));

  // CONTROL: a stranger posting to /bank/settle/claim has no debt, so nothing happens to the debtor's real claim.
  await post('/bank/settle/claim', cookies.stranger);
  ck('CONTROL — a stranger with no hub debt claiming does nothing (no crash, no forged claim)',
    await balanceOf(stranger.id) === 0, await balanceOf(stranger.id));

  // CONTROL: a non-commissioner cannot confirm.
  const badConfirm = await post('/bank/settle/confirm', cookies.creditor, { owner_id: String(debtor.id) });
  ck('CONTROL — a non-commissioner is refused at /bank/settle/confirm (403)', badConfirm.status === 403, badConfirm.status);
  ck('  and the debt is still unpaid', await balanceOf(debtor.id) === -200, await balanceOf(debtor.id));

  // ── STALE CLAIM: balances move after the claim, before the confirm ─────
  await setTo(debtor.id, -250, 'adjustment', 'a late fee, added after the claim');
  ck('fixture: the debtor now owes $250, but the pending claim still says $200',
    await balanceOf(debtor.id) === -250, await balanceOf(debtor.id));
  await post('/bank/settle/confirm', cookies.cory, { owner_id: String(debtor.id) });
  ck('THE STALE CLAIM IS NOT TRUSTED — confirming against a claim whose amount no longer matches the live transfer does nothing',
    await balanceOf(debtor.id) === -250, await balanceOf(debtor.id));
  html = await bank(cookies.debtor);
  ck('  and the debtor is back to seeing "I paid this" (the stale claim does not render as pending)',
    /I paid this/.test(html) && !/You said you paid/.test(html));

  // ── RE-CLAIM AT THE NEW AMOUNT, THEN A REAL CONFIRM ─────────────────────
  await post('/bank/settle/claim', cookies.debtor);
  await post('/bank/settle/confirm', cookies.cory, { owner_id: String(debtor.id) });
  ck('CONFIRMING A FRESH, MATCHING CLAIM CLEARS THE DEBT — balance moves from -250 to 0',
    await balanceOf(debtor.id) === 0, await balanceOf(debtor.id));
  html = await bank(cookies.debtor);
  ck('  the settled debt no longer shows an "I paid this" button (nothing left to claim)',
    !/I paid this/.test(html));

  // ── WITHDRAW ─────────────────────────────────────────────────────────────
  await setTo(creditor.id, -150, 'buy_in', 'creditor now owes instead');
  await post('/bank/settle/claim', cookies.creditor);
  html = await bank(cookies.creditor);
  ck('fixture: creditor now owes $150 and has claimed', /You said you paid/.test(html));
  await post('/bank/settle/withdraw', cookies.creditor);
  html = await bank(cookies.creditor);
  ck('WITHDRAW clears the claim — back to "I paid this", no money moved',
    /I paid this/.test(html) && !/You said you paid/.test(html) && await balanceOf(creditor.id) === -150,
    await balanceOf(creditor.id));

  // ── THE RECEIVER SELF-SETTLES (no confirm step) ─────────────────────────
  await setTo(creditor.id, 300, 'adjustment', 'now the hub owes creditor $300');
  ck('fixture: hub now owes creditor $300', await balanceOf(creditor.id) === 300, await balanceOf(creditor.id));
  await post('/bank/settle/received', cookies.creditor);
  ck('"I RECEIVED IT" IS SELF-SERVICE — no commissioner confirm needed, balance clears immediately',
    await balanceOf(creditor.id) === 0, await balanceOf(creditor.id));

  // CONTROL: a debtor cannot use the received-it route to zero out their own debt.
  await setTo(debtor.id, -100, 'buy_in', 'a fresh debt');
  await post('/bank/settle/received', cookies.debtor);
  ck('CONTROL — a debtor cannot self-settle via /bank/settle/received (wrong direction, refused)',
    await balanceOf(debtor.id) === -100, await balanceOf(debtor.id));

  // ── THE COMMISSIONER'S OWN MARK ON A PAYOUT (Cory, 2026-10-20) ──────────
  //
  // "can you make an easy way for me click square to confirm I paid that
  // person" — Square Up had three of its four buttons. On money the HUB owes,
  // the commissioner had NO control: he Venmo'd the weekly-high winner and the
  // debt stayed on his list until that owner logged in and pressed "I received
  // it". For an owner who never logs in, it never left.
  //
  // It SETTLES on click rather than raising a claim. That is a deliberate
  // exception to the payer-claims rule this file documents at the top, ruled
  // by Cory the same day he asked: the payer here IS the bank and the
  // commissioner, and he can already write this exact entry at
  // /admin/payment, so it is the authority he has put where he is looking.
  await setTo(creditor.id, 175, 'weekly', 'hub owes creditor a weekly high');
  ck('fixture: hub owes the creditor $175', await balanceOf(creditor.id) === 175, await balanceOf(creditor.id));

  html = await bank(cookies.cory);
  ck('THE MISSING FOURTH CONTROL: the commissioner now sees an "I paid <name>" button on a payout he owes',
    new RegExp(`I paid ${creditor.name}`).test(html),
    (html.match(/I paid [^<]{0,30}/g) || []).slice(0, 4));
  ck('  and it says plainly that it settles without the other owner confirming',
    /does not have to confirm/.test(html));

  // ⚠️ THE CONFIRM DIALOG MUST NOT BE BUILT BY INTERPOLATING A NAME INTO JS.
  // `onsubmit="return confirm('… <%= t.to %> …')"` renders an apostrophe as
  // `&#39;`, the HTML parser decodes it back to `'` before JS sees it, and
  // `confirm('Mark $100 to O'Brien as paid?')` is a syntax error — so the
  // handler never runs and the form SUBMITS WITH NO CONFIRMATION. It works for
  // every name you happen to test and vanishes for one future owner, on a
  // button that moves money. The message lives in data-confirm instead.
  const paidForm = (html.match(/<form[^>]*\/bank\/settle\/paid[^>]*>/) || [])[0] || '';
  ck('  the confirm message is carried in data-confirm, not interpolated into the JS',
    /data-confirm="/.test(paidForm) && /onsubmit="return confirm\(this\.dataset\.confirm\)"/.test(paidForm),
    paidForm);
  const onsubmitAttr = (paidForm.match(/onsubmit="([^"]*)"/) || [])[1] || '';
  ck('  and the onsubmit handler contains NO interpolated data at all (apostrophe-proof)',
    !new RegExp(creditor.name.split(/\s+/)[0]).test(onsubmitAttr)
      && !/\$/.test(onsubmitAttr),
    onsubmitAttr);

  // ACCESS: a commissioner control must not render for an owner (A24 — owners
  // get results, never tools). The creditor's own row still offers "I received
  // it", which is theirs; the branch order is what keeps those separate.
  const creditorHtml = await bank(cookies.creditor);
  ck('  LEAK CHECK: the creditor does NOT see the commissioner\'s "I paid" button on their own payout',
    !/\/bank\/settle\/paid/.test(creditorHtml) && /I received it/.test(creditorHtml));
  const strangerHtml = await bank(cookies.stranger);
  ck('  LEAK CHECK: an owner with nothing outstanding sees no settle controls at all',
    !/\/bank\/settle\/paid/.test(strangerHtml));

  const ledgerBefore = ((await store.get('ledger')) || []).length;
  await post('/bank/settle/paid', cookies.cory, { owner_id: String(creditor.id) });
  ck('CLICKING IT SETTLES IMMEDIATELY — $175 payout clears to 0 with no confirmation step',
    await balanceOf(creditor.id) === 0, await balanceOf(creditor.id));

  // The ENTRY, not just the balance: a money page's audit trail has to name
  // who said so, because this mark has no second party to catch it.
  const written = ((await store.get('ledger')) || []).slice(ledgerBefore);
  ck('  it writes exactly ONE ledger entry', written.length === 1, written.map(e => e.desc));
  ck('  signed NEGATIVE against the payee (money went OUT of the commissioner), same as /admin/payment i_paid',
    written[0] && written[0].amount === -175, written[0] && written[0].amount);
  ck('  and the entry NAMES who marked it, so an unconfirmed payout is traceable',
    written[0] && /marked sent by/.test(written[0].desc) && written[0].desc.includes(cory.name),
    written[0] && written[0].desc);

  // ⚠️ THE GUARD THAT IS NOT A LOCK. There is no idempotency key here; the
  // protection is that the settlement is recomputed from LIVE balances every
  // request, so after the first write there is no hub_owes transfer left to
  // settle. Asserted rather than assumed, because "click it twice and you pay
  // twice" on a money page is the worst version of this feature.
  await post('/bank/settle/paid', cookies.cory, { owner_id: String(creditor.id) });
  ck('PRESSING IT TWICE DOES NOT DOUBLE-PAY — the live re-check finds nothing left to settle',
    await balanceOf(creditor.id) === 0, await balanceOf(creditor.id));

  html = await bank(cookies.cory);
  ck('  and the settled payout no longer offers the button',
    !new RegExp(`I paid ${creditor.name}`).test(html));

  // ── CONTROL: only the commissioner, and only in the payout direction ────
  await setTo(creditor.id, 120, 'weekly', 'hub owes creditor again');
  const sneak = await post('/bank/settle/paid', cookies.stranger, { owner_id: String(creditor.id) });
  ck('CONTROL — a non-commissioner cannot mark a payout sent (route refuses, no money moves)',
    await balanceOf(creditor.id) === 120 && sneak.status !== 200,
    { balance: await balanceOf(creditor.id), status: sneak.status });
  const selfServe = await post('/bank/settle/paid', cookies.creditor, { owner_id: String(creditor.id) });
  ck('CONTROL — the CREDITOR cannot use it to pay themselves',
    await balanceOf(creditor.id) === 120,
    { balance: await balanceOf(creditor.id), status: selfServe.status });

  // The direction check matters: "I paid them" aimed at someone who owes the
  // hub would move the money the WRONG WAY and wipe a debt owed to Cory.
  await setTo(debtor.id, -140, 'buy_in', 'debtor owes the hub again');
  await post('/bank/settle/paid', cookies.cory, { owner_id: String(debtor.id) });
  ck('CONTROL — "I paid them" on someone who OWES the hub is refused (would erase a debt owed to Cory)',
    await balanceOf(debtor.id) === -140, await balanceOf(debtor.id));

  // A stale claim must not survive the payout being settled from the other end.
  await setTo(creditor.id, 90, 'weekly', 'hub owes creditor, who has claimed');
  await post('/bank/settle/claim', cookies.creditor);   // wrong direction: no claim is written
  await post('/bank/settle/paid', cookies.cory, { owner_id: String(creditor.id) });
  const claimsLeft = await store.get('settlement-claims:' + season.year) || {};
  ck('settling a payout leaves NO claim behind for that owner',
    !claimsLeft[String(creditor.id)] && await balanceOf(creditor.id) === 0,
    { claim: claimsLeft[String(creditor.id)], balance: await balanceOf(creditor.id) });

  server.close();
  console.log(`\n${pass}/${pass + fail} settlement-mark-paid checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
