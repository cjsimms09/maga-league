'use strict';
// THE ROUTE, NOT JUST THE RULE — Cory's sequence driven through the real form.
//
// payment_match.test.js proves the DECISION is right. This proves the wiring is:
// it boots the app, logs in as the commissioner, and POSTs the same form he
// used, then reads the ledger back. Both matter — the defect he hit was a pure
// wiring defect (the rule for settling already existed in ledger.js and the form
// simply never called it), so a module test alone would have passed while the
// site went on inventing debts.
//
// Run: node draft/tests/payment_settles_route.test.js

const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'paym-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const L = require(path.join(ROOT, 'src', 'ledger'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
const form = { 'Content-Type': 'application/x-www-form-urlencoded' };
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const rich = owners.find(o => o.id !== cory.id && o.active);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);

  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cc = cookieFrom(await fetch(b + '/login', { method: 'POST', headers: form,
    body: 'username=cory&password=pw', redirect: 'manual' }));
  // CONTROL: prove the session actually authenticates, by asking for a page only
  // a commissioner may see. Checking the cookie STRING would not: the first
  // version of this line looked for /session/ in it, the cookie is named
  // `maga_league`, and the control failed while every POST beneath it worked —
  // a broken control reporting a healthy system as broken (rule 3f).
  const adminPage = await fetch(b + '/admin?tab=ledger', { headers: { Cookie: cc }, redirect: 'manual' });
  ck('CONTROL: the commissioner is logged in (otherwise every POST below is a silent redirect)',
     adminPage.status === 200, adminPage.status);
  const adminHtml = await adminPage.text();
  ck('the WHO I STILL OWE panel renders on the ledger tab',
     /Who I Still Owe/.test(adminHtml));
  ck('  … and it lists the seeded carried-over balance the league has not paid',
     /carried-over balance/i.test(adminHtml));

  const ledgerOf = async id => (await L.allEntries()).filter(e => Number(e.owner_id) === Number(id));
  const post = (url, body) => fetch(b + url, { method: 'POST', headers: { ...form, Cookie: cc }, body, redirect: 'manual' });

  // Start from a clean slate for this owner so the seed's buy-in does not
  // absorb the payment and hide the behaviour under test.
  const start = await L.allEntries();
  await store.set('ledger', start.filter(e => Number(e.owner_id) !== Number(rich.id)));
  ck('CONTROL: the test owner starts with an empty tab', (await ledgerOf(rich.id)).length === 0);

  // ── 1. CORY'S EXACT SEQUENCE: pay a prize that has not been recorded yet ──
  await post('/admin/ledger',
    `owner_id=${rich.id}&kind=payment_sent&amount=100&desc=Week+1+high+point&note=Venmo&year=2026`);
  let mine = await ledgerOf(rich.id);
  const bal = () => L.balances(mine, owners)[rich.id].balance;
  ck('the payment is recorded — the money really did move', mine.length === 1 && mine[0].type === 'payment', mine);
  ck('⚠️ THE OLD BUG: this used to read "owes you $100"; it is still -100 while no prize exists',
     bal() === -100, bal());

  // That is not a regression: with no prize on the books there is nothing to
  // settle, and inventing one would be worse. What must happen is that the
  // prize, when it lands, finds this payment.

  // ── 2. THE CRON RECORDS THE PRIZE AND FINDS THE PAYMENT ──────────────────
  const PM = require(path.join(ROOT, 'src', 'payment_match'));
  const prize = await L.addEntry({ owner_id: rich.id, year: 2026, type: 'weekly',
    amount: 100, week: 1, desc: 'Week 1 high point' });
  const hit = PM.matchPrizeToOpenPayment({ entries: await L.allEntries(), prize });
  ck('the incoming prize matches the payment Cory already made', !!hit, hit && hit.id);
  await L.setSettled(hit.id, true, 'matched to week 1 high point', 'auto');
  await L.setSettled(prize.id, true, 'already paid', 'auto');
  mine = await ledgerOf(rich.id);
  ck('AFTER THE MATCH: the balance is even and nothing is left open',
     bal() === 0 && mine.every(e => e.settled), { bal: bal(), open: mine.filter(e => !e.settled).length });
  ck('  … and the winnings still COUNT as won — settling paid, it did not erase',
     L.seasonSummary(mine, 2026).won === 100, L.seasonSummary(mine, 2026).won);

  // ── 3. THE NORMAL ORDER: prize first, then pay it ────────────────────────
  await store.set('ledger', (await L.allEntries()).filter(e => Number(e.owner_id) !== Number(rich.id)));
  const w2 = await L.addEntry({ owner_id: rich.id, year: 2026, type: 'weekly',
    amount: 100, week: 2, desc: 'Week 2 high point' });
  mine = await ledgerOf(rich.id);
  ck('an unpaid prize shows as money the league owes', bal() === 100, bal());

  await post('/admin/ledger',
    `owner_id=${rich.id}&kind=payment_sent&amount=100&desc=Week+2+high+point&note=Venmo&year=2026`);
  mine = await ledgerOf(rich.id);
  ck('⭐ PAYING A RECORDED PRIZE SETTLES IT — no opposite entry is appended',
     mine.length === 1 && mine[0].id === w2.id && mine[0].settled === true,
     mine.map(e => ({ type: e.type, amt: e.amount, settled: e.settled })));
  ck('  … the balance is even', bal() === 0, bal());
  ck('  … and the note Cory typed is on the record, so he can see HOW it moved',
     /Venmo/.test(mine[0].settle_note || ''), mine[0].settle_note);

  // ── 4. THE SECOND DOOR (POST /payment) MUST BEHAVE IDENTICALLY ───────────
  // Two forms recorded payments and both had the defect. If only one is fixed
  // the bug simply moves to whichever screen Cory happens to use.
  await store.set('ledger', (await L.allEntries()).filter(e => Number(e.owner_id) !== Number(rich.id)));
  const w3 = await L.addEntry({ owner_id: rich.id, year: 2026, type: 'weekly',
    amount: 100, week: 3, desc: 'Week 3 high point' });
  await post('/admin/payment', `owner_id=${rich.id}&amount=100&direction=i_paid&note=Zelle`);
  mine = await ledgerOf(rich.id);
  ck('the /bank payment form settles too — one definition, not two',
     mine.length === 1 && mine[0].id === w3.id && mine[0].settled === true,
     mine.map(e => ({ type: e.type, amt: e.amount, settled: e.settled })));

  // ── 5. "WHO I STILL OWE" IS ANSWERABLE ──────────────────────────────────
  await store.set('ledger', (await L.allEntries()).filter(e => Number(e.owner_id) !== Number(rich.id)));
  await L.addEntry({ owner_id: rich.id, year: 2026, type: 'weekly', amount: 100, week: 4, desc: 'Week 4 high point' });
  const owedBefore = PM.outstandingPayouts(await L.allEntries(), owners);
  ck('an unpaid prize appears in WHO I STILL OWE',
     owedBefore.some(r => Number(r.owner_id) === Number(rich.id) && r.total === 100), owedBefore);

  await post('/admin/ledger',
    `owner_id=${rich.id}&kind=payment_sent&amount=100&desc=Week+4&note=cash&year=2026`);
  const owedAfter = PM.outstandingPayouts(await L.allEntries(), owners);
  ck('  … and DISAPPEARS once it is paid — which is the whole point',
     !owedAfter.some(r => Number(r.owner_id) === Number(rich.id)), owedAfter);

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
