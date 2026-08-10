'use strict';
// BANK — career money reference numbers (all-time banked + money rank).
// The finances page detailed THIS season's tab but never answered "how much have
// I actually won here, ever, and where does that put me".
//
// The load-bearing assertion is the AGREEMENT one: this figure is derived from
// the same winningsGrid/careerTotals the history page uses, so the two surfaces
// must show the same number. A second derivation of one quantity is the disease
// this project keeps finding (waivers consensus, the thin-pool VORP); this test
// exists so career money never becomes another instance.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bkc-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const c = cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw', redirect: 'manual' }));

  const bank = await (await fetch(b + '/bank', { headers: { Cookie: c } })).text();
  ck('the career-money card renders', /Your career money/.test(bank));

  const total = (bank.match(/bk-career-num money-gold">\$([\d,]+)/) || [])[1];
  ck('it shows an all-time banked total', !!total, total);

  const rankM = bank.match(/bk-career-num">(\d+)<span class="bk-career-of">of (\d+)/);
  ck('it shows a money rank out of the field', !!rankM && Number(rankM[1]) >= 1 && Number(rankM[2]) >= 2,
    rankM && rankM.slice(1).join('/'));

  ck('it shows a per-season figure with its denominator', /per season \(\d+\)/.test(bank));
  ck('it names the all-time leader (or says you are it)',
    /leads all-time with/.test(bank) || /You lead the all-time money board/.test(bank));
  ck('it distinguishes winnings from this season\'s cash position',
    /this season's cash position/.test(bank) || /Everything below is this season only/.test(bank));

  // THE AGREEMENT CHECK — one derivation, two surfaces.
  const hist = await (await fetch(b + '/history?section=money', { headers: { Cookie: c } })).text();
  ck('the SAME career total appears on the history money page (one derivation)',
    !!total && hist.includes('$' + total), total);

  ck('no template error', !/ReferenceError|is not defined|Cannot read/.test(bank));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
