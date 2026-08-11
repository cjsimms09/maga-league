'use strict';
// TWO HEAD-TO-HEAD RECORDS, ONE TAP APART, COUNTING DIFFERENT GAMES.
//
// The franchise page's grid is built by history-data from the REGULAR SEASON
// only — `if (w > REG_WEEKS) continue`, deliberate, so the ten owners are
// comparable. /rivalry and the matchup card use routes/h2h, which counts every
// meeting including the playoff bracket. Both are right for the question they
// answer. Nothing said they were different questions.
//
// So the grid read "Cory 5–0 vs Michael" under the words "tap a row for the
// full rivalry", and the row opened a page saying 5–1. Twenty-two of the
// forty-five pairs differ, every one of them by a post-season game — including
// the 2023 third-place game Cory won 149.28–110.60, which the grid drops.
//
// The fix was labelling, not arithmetic, so this pins BOTH: that the two
// derivations reconcile exactly (grid + post-season = engine, for every pair),
// and that the page tells the reader which one it is showing.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hfs-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const H2H = require(path.join(ROOT, 'src', 'routes', 'h2h'));
const HD = require(path.join(ROOT, 'src', 'routes', 'history-data'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 320) : ''))); };
const flat = h => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

(async () => {
  await data.ensureSeeded();

  // ── THE TWO DERIVATIONS RECONCILE, PAIR BY PAIR.
  const A = HD.build();
  const names = Object.keys(A.owners);
  let compared = 0, differing = 0;
  const broken = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      const grid = (A.owners[a].h2h || {})[b];
      const ua = H2H.userIdForName(a), ub = H2H.userIdForName(b);
      if (!grid || !ua || !ub) continue;
      const eng = H2H.headToHead(ua, ub);
      const post = eng.games.filter(g => Number(g.week) > HD.REG_WEEKS);
      const aPost = post.filter(g => g.a > g.b).length;
      const bPost = post.filter(g => g.b > g.a).length;
      compared++;
      if (eng.played !== grid.w + grid.l + (grid.t || 0)) differing++;
      if (eng.a.wins !== grid.w + aPost || eng.b.wins !== grid.l + bPost) {
        broken.push({ pair: `${a}/${b}`, grid: `${grid.w}-${grid.l}`,
          engine: `${eng.a.wins}-${eng.b.wins}`, post: post.length });
      }
    }
  }
  // ── THE ARCHIVE'S OWN BOOKS CLOSE. Carried over from
  // career_records_close.test.js, which retired itself when A corrected the
  // seed (f71b05e). A's test_career_records_close.py now guards the seeded
  // career totals and is stronger there — ten owners, W == L, ties even, slots
  // even, every owner on the same game count. The ONE clause it does not have
  // is this one: it reads seed-data, not the box scores. This is the check that
  // localized the bad row in the first place — the era closing exactly is what
  // proved the surplus was upstream of it — so it stays, here, where the
  // archive is already built.
  {
    let w = 0, l = 0, t = 0;
    for (const n of names) {
      const c = (A.owners[n] || {}).career || { wins: 0, losses: 0, ties: 0 };
      w += c.wins; l += c.losses; t += c.ties || 0;
    }
    ck('the box-score era closes: every game in the archive has two sides',
      w === l, { wins: w, losses: l });
    ck('  and its ties are paired', t % 2 === 0, t);
    ck('  fixture check: there is a real era in there to close', w > 100, w);
  }

  ck('every pair in the league is compared', compared >= 40, compared);
  // FIXTURE CHECK: if no pair differed, the invariant below would hold
  // trivially and the labelling would not matter.
  ck('  fixture check: the two records really do differ for some pairs',
    differing > 0, { differing, compared });
  ck('the regular-season grid plus the post-season games IS the full record',
    broken.length === 0, broken.slice(0, 6));

  // ── AND THE PAGE SAYS WHICH ONE IT IS SHOWING.
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
  const html = await (await fetch(base + '/history/franchise/Cory', { headers: { cookie } })).text();
  const t = flat(html);

  ck('the franchise head-to-head grid renders', /Head to Head/.test(t) && /Opponent/.test(t), t.slice(0, 120));
  ck('  it says the record it shows is the regular season',
    /Head to Head regular season/.test(t), (t.match(/Head to Head[^O]{0,90}/) || [])[0]);
  ck('  and that the page behind each row counts more games than it does',
    /playoffs included/.test(t), (t.match(/Head to Head[^O]{0,90}/) || [])[0]);
  ck('  it no longer calls the linked page the "full rivalry" of this record',
    !/tap a row for the full rivalry/.test(t), (t.match(/tap a row[^·]{0,60}/) || [])[0]);

  // The row a reader would tap, and the record it leads to, on one pair known
  // to differ. Nothing here requires them to be EQUAL — only that the page has
  // told the reader why they are not.
  {
    const row = (html.match(/<a href="\/rivalry\?a=Cory&b=Michael"[\s\S]{0,400}?<td class="win">(\d+)<\/td>\s*<td class="lose">(\d+)<\/td>/) || []).slice(1, 3);
    const riv = flat(await (await fetch(base + '/rivalry?a=Cory&b=Michael', { headers: { cookie } })).text());
    const rivRec = (riv.match(/(You|\w+) leads? (\d+)–(\d+)/) || []).slice(1, 4);
    ck('fixture check: the tapped row and its rivalry page really do differ',
      row.length === 2 && rivRec.length === 3
      && Number(row[0]) + Number(row[1]) !== Number(rivRec[1]) + Number(rivRec[2]),
      { grid_row: row, rivalry: rivRec });
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
