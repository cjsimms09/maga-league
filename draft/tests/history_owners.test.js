'use strict';
// THE OWNER CARDS — the numbers on them have to agree with each other.
//
// Each card states a record, a win percentage and a title count, and prints the
// championship years next to the trophies. Three of those four are derived from
// the other, so the card can be checked against itself: the percentage must
// come out of the record printed beside it, and the count must match the years
// listed beside it.
//
// Found while reading the page: it said "1 Titles".
//
// NOT guarded here, deliberately — the ten seeded records do not close
// (wins 425, losses 424; nine owners on 85 games and one on 86, so the games
// total is odd when every game contributes two). That is a fact about the real
// league in src/seed-data.js, which is not this session's file and not a thing
// code can decide. It is written up in PARKED.md for Cory with the arithmetic
// and a ready-to-enable guard; committing that guard now would just be a red
// suite that tells nobody anything new.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ho-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const html = await (await fetch(base + '/history?section=owners', { headers: { cookie } })).text();

  // One entry per owner card, read out of the card itself.
  const cards = [...html.matchAll(/<div class="card owner-card">([\s\S]*?)<div class="money-line">/g)].map(m => {
    const c = m[1];
    const name = (c.match(/<h3>([^<]+)<\/h3>/) || [])[1];
    const rec = (c.match(/<b>(\d+)-(\d+)(?:-(\d+))?<\/b><span>Record/) || []).slice(1, 4);
    const pct = (c.match(/<b>([\d.]+)%<\/b><span>Win %/) || [])[1];
    const titles = (c.match(/<b>(\d+)<\/b><span>Title(s?)</) || []).slice(1, 3);
    // The years printed beside the trophies, e.g. "2019, 2020, 2021, 2022*".
    const years = (c.match(/🏆[\s\S]*?<span class="muted"[^>]*>\s*([\d,\s*]+)<\/span>/) || [])[1];
    return { name, w: +rec[0], l: +rec[1], t: +(rec[2] || 0), pct: pct == null ? null : +pct,
      titles: titles[0] == null ? null : +titles[0], plural: titles[1],
      years: years ? years.trim().split(/\s*,\s*/).filter(Boolean) : [] };
  });

  ck('the owners page renders a card per active owner',
    cards.length === owners.filter(o => o.active).length,
    { cards: cards.length, active: owners.filter(o => o.active).length });
  ck('  every card carries a record, a percentage and a title count',
    cards.every(c => c.name && Number.isFinite(c.w) && c.pct != null && c.titles != null),
    cards.filter(c => !(c.name && Number.isFinite(c.w) && c.pct != null && c.titles != null)));

  // ── The percentage is derived from the record printed beside it, with a tie
  // worth half a win. Checked per card so a wrong one names itself.
  const badPct = cards.filter(c => {
    const gp = c.w + c.l + c.t;
    const want = gp ? Math.round(((c.w + c.t * 0.5) / gp) * 1000) / 10 : 0;
    return Math.abs(want - c.pct) > 0.05;
  });
  ck('every win % comes out of the record on the same card, ties worth a half',
    badPct.length === 0,
    badPct.map(c => ({ name: c.name, rec: `${c.w}-${c.l}-${c.t}`, shown: c.pct })));
  // FIXTURE CHECK: with no ties anywhere, halving them is untested.
  ck('  fixture check: at least one owner has a tie, so the half counts',
    cards.some(c => c.t > 0), cards.map(c => `${c.name}:${c.t}`).join(' '));

  // ── The title count is the number of years printed beside the trophies.
  const badCount = cards.filter(c => c.titles !== c.years.length);
  ck('every title count matches the championship years listed beside it',
    badCount.length === 0,
    badCount.map(c => ({ name: c.name, count: c.titles, years: c.years })));

  // ── The plural. It read "1 Titles".
  const oneTitle = cards.filter(c => c.titles === 1);
  ck('fixture check: somebody has exactly one title', oneTitle.length > 0,
    cards.map(c => `${c.name}:${c.titles}`).join(' '));
  ck('  a single title is not pluralised',
    oneTitle.every(c => c.plural === ''), oneTitle.map(c => ({ name: c.name, shown: '1 Title' + c.plural })));
  ck('  and any other number is',
    cards.filter(c => c.titles !== 1).every(c => c.plural === 's'),
    cards.filter(c => c.titles !== 1 && c.plural !== 's').map(c => ({ name: c.name, titles: c.titles })));

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
