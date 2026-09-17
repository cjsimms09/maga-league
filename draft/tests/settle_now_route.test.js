'use strict';
// "SETTLE IT NOW" — the button, end to end, with Sleeper stubbed.
//
// Cory, 2026-09-17, after finding week 1's $100 unattributed: "settle it now."
// He could not. The job lived inside a Netlify function, and its only doors were
// a schedule that had never fired and a keyed HTTP twin whose key is not
// configured. So the job moved to src/settle_money.js and the commissioner
// console got a button.
//
// This drives that button against a booted app and a temp store, with Sleeper
// replaced in the require cache — the sandbox cannot reach api.sleeper.app, and
// more to the point a test that needs the live NFL to be mid-season is a test
// that stops working in February.
//
// Run: node draft/tests/settle_now_route.test.js

const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'setl-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const L = require(path.join(ROOT, 'src', 'ledger'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));

// ── stub Sleeper BEFORE anything requires it ────────────────────────────────
// Module caching makes this stick for every later require of '../sleeper'.
const sleeper = require(path.join(ROOT, 'src', 'sleeper'));
let STATE_WEEK = 2;
let HIGH = {};            // week -> scorer
sleeper.bundle = async () => ({ state: { week: STATE_WEEK }, rosters: [], users: [] });
sleeper.matchupsForWeek = async (_id, week) => ({ week });
sleeper.highScorer = (m) => HIGH[m.week] || null;
sleeper.standings = () => [];
sleeper.winnersBracket = async () => [];
sleeper.placementsFrom = () => ({});

const SETTLE = require(path.join(ROOT, 'src', 'settle_money'));
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
  const member = owners.find(o => o.id !== cory.id && o.id !== rich.id && o.active);
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  member.password_hash = hashPassword('pw'); member.must_change_password = false; member.is_commissioner = false;
  await store.set('owners', owners);

  HIGH = { 1: { team: 'Richard2121', points: 154.2, roster_id: 8, owner: { id: rich.id, name: rich.name } } };

  // ONE DEFINITION, not two. The scheduled function and the job must be the
  // same function object — if someone re-inlines the job into the cron, the
  // button and the schedule silently diverge and this fails.
  const cron = require(path.join(ROOT, 'netlify', 'functions', 'weekly-high-cron.js'));
  ck('CONTROL: the schedule and the button run the SAME job', cron.run === SETTLE.run);

  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: form,
    body: `username=${u}&password=pw`, redirect: 'manual' }));
  const post = (c, url, body = '') => fetch(b + url, { method: 'POST',
    headers: { ...form, Cookie: c }, body, redirect: 'manual' });

  // ── a member must never be able to move money ─────────────────────────────
  const mc = await login(member.username);
  const m = await post(mc, '/admin/settle-now');
  ck('a plain member cannot settle the money (403)', m.status === 403, m.status);

  const cc = await login('cory');
  const ledgerOf = async id => (await L.allEntries()).filter(e => Number(e.owner_id) === Number(id));
  await store.set('ledger', (await L.allEntries()).filter(e => Number(e.owner_id) !== Number(rich.id)));

  // ── 1. the button records the unattributed week ───────────────────────────
  let res = await post(cc, '/admin/settle-now');
  ck('the button redirects rather than erroring', res.status === 302, res.status);
  const flash1 = decodeURIComponent((res.headers.get('location') || '').split('msg=')[1] || '');
  let mine = await ledgerOf(rich.id);
  ck('⭐ WEEK 1 IS ON THE BOOKS — $100 to the high scorer',
     mine.length === 1 && mine[0].type === 'weekly' && mine[0].week === 1 && mine[0].amount === 100,
     mine.map(e => ({ t: e.type, w: e.week, a: e.amount })));
  ck('  … and it NAMES the money it moved rather than saying "done"',
     /Week 1/.test(flash1) && new RegExp(rich.name).test(flash1), flash1);
  ck('  … recorded unsettled: who won is a fact, PAID is a claim only a human makes',
     mine[0].settled === false);

  // ── 2. pressing it again must be a no-op ──────────────────────────────────
  res = await post(cc, '/admin/settle-now');
  const flash2 = decodeURIComponent((res.headers.get('location') || '').split('msg=')[1] || '');
  mine = await ledgerOf(rich.id);
  ck('pressing it a SECOND time records nothing — no double payment',
     mine.length === 1, mine.length);
  ck('  … and says so plainly', /Nothing to settle/.test(flash2), flash2);

  // ── 3. Cory's actual situation: he paid BEFORE the job ran ────────────────
  await store.set('ledger', (await L.allEntries()).filter(e => Number(e.owner_id) !== Number(rich.id)));
  await post(cc, '/admin/ledger',
    `owner_id=${rich.id}&kind=payment_sent&amount=100&desc=Week+1+high+point&note=Venmo&year=2026`);
  mine = await ledgerOf(rich.id);
  ck('SETUP: with no prize on the books his payment alone reads as a debt',
     L.balances(mine, owners)[rich.id].balance === -100, L.balances(mine, owners)[rich.id].balance);

  res = await post(cc, '/admin/settle-now');
  const flash3 = decodeURIComponent((res.headers.get('location') || '').split('msg=')[1] || '');
  mine = await ledgerOf(rich.id);
  ck('⭐ PRESSING SETTLE FIXES IT: the prize lands, finds the payment, both settle',
     L.balances(mine, owners)[rich.id].balance === 0 && mine.every(e => e.settled) && mine.length === 2,
     mine.map(e => ({ t: e.type, a: e.amount, s: e.settled })));
  ck('  … and it SAYS the week was already paid rather than quietly netting out',
     /already paid/.test(flash3), flash3);
  ck('  … the winnings still count as won — settling recorded payment, it did not erase',
     L.seasonSummary(mine, 2026).won === 100, L.seasonSummary(mine, 2026).won);

  // ── 4. an unmapped winner must shout, not guess ───────────────────────────
  await store.set('ledger', (await L.allEntries()).filter(e => Number(e.owner_id) !== Number(rich.id)));
  HIGH = { 1: { team: 'Nobody', points: 141.0, roster_id: 99, owner: null } };
  res = await post(cc, '/admin/settle-now');
  const flash4 = decodeURIComponent((res.headers.get('location') || '').split('msg=')[1] || '');
  ck('an UNMAPPED winning roster attributes nothing and shouts',
     /UNMAPPED/.test(flash4) && /🔴/.test(flash4), flash4);
  ck('  … and no money was invented for a guessed owner',
     (await L.allEntries()).filter(e => e.type === 'weekly' && e.year === 2026).length === 0);

  // ── 5. the button is actually on the page ─────────────────────────────────
  HIGH = {};
  const page = await (await fetch(b + '/admin?tab=ledger', { headers: { Cookie: cc } })).text();
  ck('the ledger tab carries the button (a route with no button is not a fix)',
     /action="\/admin\/settle-now"/.test(page) && /Settle the money now/.test(page));

  // ── 6. a Sleeper outage must degrade honestly, not 500 ────────────────────
  sleeper.bundle = async () => { throw new Error('Sleeper 503'); };
  res = await post(cc, '/admin/settle-now');
  const flash6 = decodeURIComponent((res.headers.get('location') || '').split('msg=')[1] || '');
  ck('a Sleeper outage reports the reason instead of throwing a 500',
     res.status === 302 && /Could not settle/.test(flash6), { status: res.status, flash6 });

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
