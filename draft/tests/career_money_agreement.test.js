'use strict';
// TWO PAGES STATE THE SAME CAREER MONEY. THEY HAVE TO AGREE, AND THE AVERAGE
// HAS TO NAME ITS DENOMINATOR.
//
// /bank's career card and /history?section=money are separate renderings of one
// fact. They agree — both come off H.winningsGrid / H.careerTotals, and the
// route says so — but nothing compared them, and the last time a fact had six
// agreeing derivations and no comparison (the playoff cut) the seventh was
// wrong and went out by email. So the agreement is made structural here.
//
// The card's third figure was NOT sound. "per season (7)" was computed over
// Object.keys(grid[owner]).length and commented "seasons actually played (a
// denominator, so per season is honest)" — but the winnings grid only holds
// years where money changed hands. There is not one zero-valued key in it
// across ten seasons, so a season you played and won nothing never appears.
// Sam has two such years and was shown $625 a season on a $1,250 career.
// Seasons played is recorded nowhere in the league's data — history carries
// winnings, awards and weekly, all money-keyed — so the label has to name the
// denominator it actually has.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cma-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const H = require(path.join(ROOT, 'src', 'helpers'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 300) : ''))); };
const usd = s => Number(String(s).replace(/[$,]/g, ''));
const flat = h => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const world = await H.loadWorld();
  const grid = H.winningsGrid(world);

  // THE SHARPEST VIEWER: whoever has been in the money in the FEWEST seasons.
  // On a viewer who cashed every year the two readings of the denominator
  // coincide and none of this can fail.
  const viewer = owners.filter(o => o.active)
    .sort((a, b) => Object.keys(grid[a.id] || {}).length - Object.keys(grid[b.id] || {}).length)[0];
  const inMoney = Object.keys(grid[viewer.id] || {}).length;
  const spanYears = H.gridYears(grid).length;
  ck('fixture check: the viewer has NOT been in the money every season',
    inMoney > 0 && inMoney < spanYears, { viewer: viewer.name, inMoney, spanYears });

  const o = owners.find(x => x.id === viewer.id);
  o.password_hash = hashPassword('pw'); o.must_change_password = false;
  await store.set('owners', owners);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `username=${o.username}&password=pw` });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const raw = async r => (await fetch(base + r, { headers: { cookie } })).text();

  const bankHtml = await raw('/bank');
  const histHtml = await raw('/history?section=money');
  const bt = flat(bankHtml);

  // ── What /bank claims.
  const banked = (bt.match(/\$([\d,.]+)\s*banked all-time/) || [])[1];
  const rank = (bt.match(/(\d+)\s*of\s*(\d+)\s*money rank/) || []).slice(1, 3);
  const per = (bt.match(/\$([\d,.]+)\s*per season in the money \((\d+)\)/) || []).slice(1, 3);
  const leader = (bt.match(/(\w[\w'’]*) leads all-time with \$([\d,.]+)\s*—?\s*you're \$([\d,.]+) back/) || []).slice(1, 4);
  const leads = /You lead the all-time money board/.test(bt);
  ck('the career card renders', !!(banked && rank.length && per.length), { banked, rank, per });

  // ── What /history claims, read out of the grid itself.
  const cells = [...histHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map(c => c[1].replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, '').trim()));
  const gridRows = cells
    .filter(r => r.length > 3 && /^\$[\d,]/.test(r[r.length - 1] || ''))
    .map(r => ({ name: r[0], career: usd(r[r.length - 1]), years: r.slice(1, r.length - 1).map(usd) }))
    // The table carries its own summary row; it is not an owner. (This caught
    // me out first time and reported three defects that were all my probe.)
    .filter(g => !/league total/i.test(g.name));
  const allTime = (flat(histHtml).match(/All-Time Winnings\s*\$([\d,.]+)/) || [])[1];
  const mine = gridRows.find(g => g.name.includes(o.name));
  const sorted = [...gridRows].sort((a, b) => b.career - a.career);
  ck('the money grid renders every active owner and its own total',
    gridRows.length === owners.filter(x => x.active).length && !!allTime,
    { rows: gridRows.length, active: owners.filter(x => x.active).length, allTime });

  // ── THE AGREEMENTS.
  ck('career money agrees across the two pages',
    !!mine && usd(banked) === mine.career, { bank: usd(banked), history: mine && mine.career });
  ck('  money rank agrees with the order of the grid',
    !!mine && Number(rank[0]) === sorted.indexOf(mine) + 1,
    { stated: rank[0], grid: mine && sorted.indexOf(mine) + 1 });
  ck('  the field size agrees with the number of rows',
    Number(rank[1]) === gridRows.length, { stated: rank[1], rows: gridRows.length });
  ck('  the leader and the gap agree with the grid',
    leads ? sorted[0] === mine
      : !!(leader.length && sorted[0].name.includes(leader[0]) && usd(leader[1]) === sorted[0].career
        && Math.abs(usd(leader[2]) - (sorted[0].career - mine.career)) < 0.005),
    { stated: leader, top: sorted[0] && [sorted[0].name, sorted[0].career] });
  ck('  every career equals that owner\'s row of year cells',
    gridRows.every(g => Math.abs(g.years.reduce((s, v) => s + (v || 0), 0) - g.career) < 0.005),
    gridRows.filter(g => Math.abs(g.years.reduce((s, v) => s + (v || 0), 0) - g.career) >= 0.005));
  ck('  and the rows sum to the all-time total in the grid\'s own header',
    Math.abs(gridRows.reduce((s, g) => s + g.career, 0) - usd(allTime)) < 0.005,
    { rows_sum: gridRows.reduce((s, g) => s + g.career, 0), header: usd(allTime) });

  // ── THE DENOMINATOR.
  ck('the average is the career divided by the count it prints',
    Math.abs(usd(per[0]) - usd(banked) / Number(per[1])) < 0.01,
    { stated: per, computed: (usd(banked) / Number(per[1])).toFixed(2) });
  // The count is checkable on the OTHER page: it is how many of that owner's
  // year cells carry money.
  ck('  the count is the seasons that owner was in the money, per the grid',
    !!mine && Number(per[1]) === mine.years.filter(v => v > 0).length,
    { stated: per[1], grid_nonzero: mine && mine.years.filter(v => v > 0).length, cells: mine && mine.years });
  ck('  and it is NOT the number of seasons the grid spans',
    Number(per[1]) !== (mine && mine.years.length),
    { stated: per[1], span: mine && mine.years.length });
  ck('  the label says which seasons it counted',
    /per season in the money/.test(bt) && !/per season \(/.test(bt),
    (bt.match(/per season[^·]{0,40}/) || [])[0]);

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
