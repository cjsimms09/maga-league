'use strict';
// A TIER LINE IN AN ADP-ORDERED LIST IS A CLAIM ABOUT A DIFFERENT ORDERING.
//
// Found auditing the board's numbers from the page side. The printed draft
// sheet is sorted by ADP — its own heading says "top N by ADP" — and it drew
// "— Tier N starts —" the first time each tier appeared. Tier is a VALUE
// grouping, and in ADP order tiers interleave, so the markers came out
//
//   1, 2, 3, 4, 5, 6, 10, 8, 7, 12, 9, 15, 11, 16, 13, 14, 19, 17, 21, 18,
//   52, 44, 42, 20, 22, ...
//
// "Tier 52 starts" printed at row 104, ahead of "Tier 20 starts" at row 123,
// and 136 of the 180 printed rows sat beneath a tier line for a tier they are
// not in — on the artifact whose whole job is to be trusted at a table with no
// wifi, under a rule that tells you to take best available by value.
//
// The tier is a per-player fact and is printed per player now. This pins that,
// and pins the general rule: any running "tier starts" header on this sheet
// must be monotonic, which it can only be if the list is ordered by value.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dst-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 320) : ''))); };

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
  const html = await (await fetch(base + '/admin/draft-sheet', { headers: { cookie } })).text();

  ck('the sheet renders its board', /class="board"/.test(html) && /class="row/.test(html));

  // ── THE RUNNING HEADER. Allowed only if monotonic in the printed order.
  const markers = [...html.matchAll(/Tier (\d+) starts/g)].map(m => Number(m[1]));
  if (markers.length) {
    let mono = true;
    for (let i = 1; i < markers.length; i++) if (markers[i] < markers[i - 1]) mono = false;
    ck('any running tier header is monotonic in the order the sheet prints',
      mono, { sequence: markers.slice(0, 30) });
  } else {
    ck('the sheet does not announce tier boundaries it cannot honour',
      true, 'no running tier header — tier is printed per player instead');
  }

  // ── EVERY ROW STILL CARRIES ITS OWN TIER, and it is the artifact's tier.
  {
    const art = require(path.join(ROOT, 'public', 'draft_data.json'));
    const rows = [...html.matchAll(/<div class="row[^"]*">([\s\S]*?)<\/div>\s*(?=<div class="row|<\/div>)/g)]
      .map(m => {
        const nm = (m[1].match(/<span class="nm">([^<]*)/) || [])[1];
        const tr = (m[1].match(/<span class="tr">t?(\d*)</) || [])[1];
        return { name: (nm || '').trim(), tier: tr ? Number(tr) : null };
      }).filter(r => r.name);
    ck('fixture check: rows were parsed off the sheet', rows.length >= 100, rows.length);
    const withTier = rows.filter(r => r.tier != null);
    ck('  most rows carry a tier', withTier.length >= rows.length * 0.8,
      { withTier: withTier.length, rows: rows.length });
    const wrong = withTier.filter(r => {
      const p = art.players.find(x => x.name === r.name);
      return p && p.tier != null && p.tier !== r.tier;
    });
    ck('  and every printed tier is that player\'s tier in the artifact',
      wrong.length === 0, wrong.slice(0, 6));
  }


  // ── THE OTHER HALF, LEFT OPEN BY A: the sheet carried no value figure at all,
  // and its number is an ADP ordering while the war room's board is numbered by
  // VALUE — Brandon Aubrey is 121 here and 59 there. Neither ordering is wrong;
  // nothing said they were different questions, and with no VORP on the page
  // there was nothing to reconcile them with.
  {
    const art = require(path.join(ROOT, 'public', 'draft_data.json'));
    ck('the board says which ordering its numbering is',
      /in ADP order/.test(html), (html.replace(/<[^>]+>/g, ' ').match(/The board[^(]*/) || [])[0]);
    ck('  and legends the two letters it prints',
      /points over replacement/.test(html) && /tier within position/.test(html),
      (html.replace(/<[^>]+>/g, ' ').match(/The board[^(]*/) || [])[0]);

    const rows = [...html.matchAll(/<div class="row[^"]*">([\s\S]*?)<\/div>\s*(?=<div class="row|<\/div>)/g)]
      .map(m => ({
        name: ((m[1].match(/<span class="nm">([^<]*)/) || [])[1] || '').trim(),
        v: (m[1].match(/<span class="v[^"]*">([+-]?\d+)</) || [])[1],
      })).filter(r => r.name);
    const withV = rows.filter(r => r.v != null);
    ck('  every row carries its value over replacement',
      withV.length >= rows.length * 0.9, { withValue: withV.length, rows: rows.length });
    const wrong = withV.filter(r => {
      const p = art.players.find(x => x.name === r.name);
      return p && p.vorp != null && Math.round(p.vorp) !== Number(r.v);
    });
    ck('  and it is the artifact\'s VORP, rounded', wrong.length === 0, wrong.slice(0, 5));
  }

  // ── BEST AVAILABLE BY POSITION IS BY VALUE, which is what its heading claims.
  // It was sliced off the ADP-sorted list, so it printed Tucker Kraft at TE5 on
  // a VORP of -3.82 above Sam LaPorta (+17.8), and Brock Bowers (+82.15, the
  // best TE on the board) second behind Trey McBride (+64.22).
  {
    const art = require(path.join(ROOT, 'public', 'draft_data.json'));
    ck('the section says it is ordered by value',
      /Best available by position — by value/.test(html.replace(/<[^>]+>/g, m => m === '</h2>' ? '' : m).replace(/<[^>]+>/g, '')),
      (html.replace(/<[^>]+>/g, ' ').match(/Best available[^<]{0,70}/) || [])[0]);
    let checked = 0, unsorted = [];
    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
      const col = html.match(new RegExp('<h3>' + pos + '</h3>[\\s\\S]*?</ol>'));
      if (!col) continue;
      const vals = [...col[0].matchAll(/<span class="v[^"]*">([+-]?\d+)</g)].map(m => Number(m[1]));
      if (vals.length < 4) continue;
      checked++;
      for (let i = 1; i < vals.length; i++) if (vals[i] > vals[i - 1]) unsorted.push({ pos, at: i + 1, vals });
    }
    ck('fixture check: the position columns were parsed with their values', checked >= 3, checked);
    ck('  each column descends by value, top to bottom', unsorted.length === 0, unsorted.slice(0, 3));
    // And the top of each column really is the best available at that position.
    const bad = [];
    for (const pos of ['QB', 'RB', 'WR', 'TE']) {
      const col = html.match(new RegExp('<h3>' + pos + '</h3>[\\s\\S]*?</ol>'));
      if (!col) continue;
      const first = (col[0].match(/<li>([^<]*)/) || [])[1];
      const best = art.players.filter(p => p.position === pos)
        .sort((a, b) => b.vorp - a.vorp)[0];
      if (first && best && !first.trim().startsWith(best.name)) bad.push({ pos, printed: first.trim(), best: best.name });
    }
    ck('  and the first name in each is the best by value', bad.length === 0, bad);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
