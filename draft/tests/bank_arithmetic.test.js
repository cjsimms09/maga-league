'use strict';
// THE MONEY PAGE HAS TO ADD UP, AND SAY WHAT IT IS ADDING.
//
// The Square Up section closed with: "After these, Cory is holding $2,425 —
// that's the pot, not yet paid out." The figure is settlement.imbalance, which
// is the sum of the OUTSTANDING positions — so every dollar somebody has
// already paid LEAVES it, while that same dollar is sitting in the bank. On the
// seeded 2026 books, with three owners paid up, it told the commissioner the
// pot was $2,425 when $3,625 ends up in his hands. Understated by exactly the
// $1,200 already collected, on the one page where a wrong number is somebody's
// actual money.
//
// The number was never wrong — the SENTENCE was. So this checks two different
// things: that the figure reconciles with the totals printed directly above it,
// and that the page does not describe it as money held or as the pot. A test
// that only checked the arithmetic would have passed on the old copy.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bankm-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const SETTLE = require(path.join(ROOT, 'src', 'routes', 'settlement'));

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

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const t = strip(await (await fetch(base + '/bank', { headers: { cookie } })).text());

  // ── The three figures, as a reader sees them.
  const owedTo = (t.match(/Still owed TO the league\s*\$?([\d,.]+)/) || [])[1];
  const owedBy = (t.match(/Still owed BY the league\s*\$?([\d,.]+)/) || [])[1];
  const stated = (t.match(/After these,\s*\$?([\d,.]+) more has come in/) || [])[1];
  // Lazily to the END of the passage, not to the first '.' — it is two
  // sentences, and a naive [^.]* stops halfway and hides the second claim.
  const line = (t.match(/After these,.*?(?:size of the pot|not yet paid out)\./) 
    || t.match(/After these,[^.]*\./) || ['(settlement summary absent)'])[0];

  ck('the money page renders the settlement summary', /After these,/.test(t), line);
  ck('  the two totals it refers to are on the page', !!(owedTo && owedBy), { owedTo, owedBy });
  ck('  and the figure itself', !!stated, line);

  if (owedTo && owedBy && stated) {
    ck('the figure is the difference of the two totals printed above it',
      Math.abs((usd(owedTo) - usd(owedBy)) - usd(stated)) < 0.005,
      { owedTo, owedBy, stated, subtracts_to: usd(owedTo) - usd(owedBy) });
  }

  // ── FIXTURE CHECK. All of this only bites when money has ALREADY been paid
  // in: with nobody paid up, imbalance and the bank's holdings coincide and the
  // old sentence was true. The seeded books have three owners settled, which is
  // exactly why reading the real page found it.
  const paidBadges = (t.match(/\bPaid\b/g) || []).length;
  ck('fixture check: the books really do have money already paid in',
    paidBadges >= 2, { paidBadges });

  // ── THE CLAIM. Money the bank is holding is a different quantity from money
  // still to come, and the page cannot compute the first one honestly (paid_in
  // counts settled charges as well as payments, so summing it is only cash if
  // no ledger ever records a buy-in both ways). So it must not claim to.
  ck('the settlement figure is not described as money the bank is holding',
    !/is holding/.test(line), line);
  ck('  nor as the size of the pot',
    !/that's the pot/.test(line), line);
  ck('  and it says plainly that money already paid in is not in it',
    /already paid in/.test(line) && /not the size of the pot/.test(line), line);

  // ── The engine underneath, on the shape the page was wrong about: three of
  // ten paid, one carried credit outstanding.
  {
    const nets = [
      { owner_id: 1, name: 'A', net: 0 }, { owner_id: 2, name: 'B', net: 0 },
      { owner_id: 3, name: 'C', net: 375 },
      ...[4, 5, 6, 7, 8, 9, 10].map(i => ({ owner_id: i, name: 'x' + i, net: -400 })),
    ];
    const r = SETTLE.settlementReport(nets, () => null, 1);
    ck('the hub settlement moves everything through the bank',
      r.transfers.every(x => x.from_id === 1 || x.to_id === 1), r.transfers.length);
    ck('  every non-square owner is settled exactly once',
      r.transfers.length === 8, r.transfers.length);
    ck('  imbalance is the net still to move, not the cash on hand',
      r.imbalance === -2425, r.imbalance);
    // Each owner's transfers must clear their own balance to zero.
    const cleared = nets.filter(n => n.owner_id !== 1).every(n => {
      const moved = r.transfers.filter(x => x.from_id === n.owner_id).reduce((s, x) => s - x.amount, 0)
        + r.transfers.filter(x => x.to_id === n.owner_id).reduce((s, x) => s + x.amount, 0);
      // net + = the league owes them (clears when they RECEIVE); net - = they
      // owe (clears when they PAY). So the settled position is net - moved.
      return Math.abs(n.net - moved) < 0.005;
    });
    ck('  and the payments settle every owner to zero', cleared,
      r.transfers.map(x => `${x.from}->${x.to} ${x.amount}`));
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
