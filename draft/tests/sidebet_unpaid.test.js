'use strict';
// SIDE BETS DO NOT NET, BECAUSE THEY DO NOT GO THROUGH THE BANK.
//
// The "Still Unpaid" card printed owed_to_me MINUS i_owe — a signed net, under
// a label that names a quantity. Three unpaid bets ($50 in from Marian, $75 and
// $25 out to David and Michael) summarised as "-$50", when $150 has to change
// hands across three people before anyone is square, exactly as the list
// directly below it says. League money nets because every dollar routes through
// the commissioner; this is the one tab where that does not hold, and the
// reasoning had been carried across anyway.
//
// Driven through the real page, because the defect is only visible when both
// directions are present — a book where you are only owed, or only owe, makes
// the net and the gross the same number and the card looks right.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sbu-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 300) : ''))); };
const strip = h => h.replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const usd = s => Number(String(s).replace(/[$,]/g, ''));

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  const [A, B, C] = owners.filter(o => o.active && o.id !== cory.id);

  // BOTH DIRECTIONS, MORE THAN ONE COUNTERPARTY — the only shape where a net
  // and a gross differ. One win in, two losses out, to two different people.
  const mk = async (them, terms, stake, winner) => {
    const b = await SB.propose({ proposer_id: cory.id, party_ids: [them.id], terms, stake, resolves: 'week 7' });
    await SB.accept(b.id, them.id, them.name);
    await SB.settle(b.id, [winner.id], cory.id, cory.name);
    return SB.get(b.id);
  };
  const won = await mk(A, 'Bills cover the spread', 50, cory);
  await mk(B, 'I outscore you in week 3', 75, B);
  await mk(C, 'Over 45 total', 25, C);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const page = async () => strip(await (await fetch(base + '/bank?section=sidebets', { headers: { cookie } })).text());

  const read = t => {
    const head = (t.match(/Still Unpaid\s*(-?\$?[\d,.]+|✓)/) || [])[1];
    const sub = (t.match(/Still Unpaid\s*\S+\s*(owed you[^💸]*?)(?:💸|$)/) || [])[1];
    // Every row of "Who Owes Who", which is the same money itemised.
    const rows = [...t.matchAll(/(\w+)\s+(owes you|you owe)\s+\$([\d,.]+)/g)]
      .map(m => ({ who: m[1], dir: m[2], amt: usd(m[3]) }));
    return { head, sub: (sub || '').trim(), rows };
  };

  const t1 = await page();
  const r1 = read(t1);
  ck('the side-bet tab renders the unpaid card', !!r1.head, t1.slice(0, 200));
  // FIXTURE CHECK: with only one direction the net and the gross coincide and
  // nothing below can fail.
  ck('  fixture check: money is owed in BOTH directions, to more than one person',
    r1.rows.some(r => r.dir === 'owes you') && r1.rows.filter(r => r.dir === 'you owe').length >= 2,
    r1.rows);

  ck('the headline is an amount, not a signed net',
    !!r1.head && !/^-/.test(r1.head), r1.head);
  ck('  and it is the money that actually has to change hands',
    usd(r1.head) === r1.rows.reduce((s, r) => s + r.amt, 0),
    { headline: r1.head, itemised: r1.rows, sums_to: r1.rows.reduce((s, r) => s + r.amt, 0) });
  ck('  the direction is still on the card',
    /owed you \$50/.test(r1.sub) && /you owe \$100/.test(r1.sub), r1.sub);
  ck('  and so is the number of people it is spread across',
    /across 3 people/.test(r1.sub), r1.sub);

  // ── PAYING ONE OF THEM. The card exists to be worked down, so the transition
  // is the thing that matters: settling with one person must move the figure by
  // exactly that person's amount and leave the others alone.
  {
    const leg = (won.legs || [])[0];
    ck('fixture check: the won bet has a leg to settle', !!leg, won.legs);
    await SB.markLeg(won.id, leg.id, cory.id, cory.name, true);
    const r2 = read(await page());
    ck('marking one payment drops the total by exactly that payment',
      usd(r2.head) === usd(r1.head) - leg.amount,
      { before: r1.head, after: r2.head, leg: leg.amount });
    ck('  and by exactly one person', /across 2 people/.test(r2.sub), r2.sub);
    ck('  the money still outstanding is all in one direction now',
      /owed you \$0/.test(r2.sub) && /you owe \$100/.test(r2.sub), r2.sub);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
