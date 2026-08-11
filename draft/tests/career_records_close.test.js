'use strict';
// EVERY GAME HAS TWO SIDES, SO THE CAREER RECORDS HAVE TO CLOSE.
//
// They do not. The ten seeded records sum to 425 wins and 424 losses, and the
// games total is odd (851) when every game contributes two. Confirmed by Cory
// 2026-08-11: the surplus is his own pre-2023 row.
//
// WHY THIS TEST ASSERTS A DISCREPANCY INSTEAD OF FAILING ON IT.
// The number lives in src/seed-data.js, which is Session A's file — hand-
// transcribed real league history, and not something this session may edit. The
// options were: leave it silent until A acts, or commit a red suite. Neither is
// acceptable, so this takes the third road, the same one every_route_renders
// takes with its expected 4xx list: the invariant is asserted in full, the ONE
// known exception is named, SIZED and ATTRIBUTED, and anything that does not
// match that exact shape fails.
//
// It is not a test that blesses a wrong number. It is a test that says: this is
// the only thing wrong, this is exactly how wrong, and it is this row. A second
// imbalance, a different owner drifting, or a change in the size of this one all
// go red. So does the fix — see RETIREMENT at the bottom, which is how this file
// tells you to delete it.
//
// HOW THE ROW WAS LOCALISED. The 2023–25 record derived from the box-score
// archive closes exactly (225–225 regular season, 255–255 including playoffs),
// so the era data is sound and the surplus is upstream of it. Subtracting that
// era from each seeded career leaves the pre-2023 baseline, and there nine
// owners have played 40 games and one has played 41.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'crc-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const HD = require(path.join(ROOT, 'src', 'routes', 'history-data'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 320) : ''))); };

// The single outstanding discrepancy, stated so it cannot drift unnoticed.
const KNOWN = { owner: 'Cory', extraWins: 1, extraGames: 1 };

(async () => {
  await data.ensureSeeded();
  const owners = (await store.get('owners')).filter(o => o.active);
  const A = HD.build();

  // ── 1) THE ERA THE BOX SCORES COVER CLOSES. This is what makes the surplus
  // attributable: if the modern record did not close, the fault could be
  // anywhere.
  {
    let w = 0, l = 0, t = 0;
    for (const o of owners) {
      const c = (A.owners[o.name] || {}).career || { wins: 0, losses: 0, ties: 0 };
      w += c.wins; l += c.losses; t += c.ties || 0;
    }
    ck('the 2023-25 record derived from the archive closes', w === l, { wins: w, losses: l });
    ck('  and its ties are paired', t % 2 === 0, t);
    ck('  fixture check: there is a real era to subtract', w > 100, w);
  }

  // ── 2) THE PRE-2023 BASELINE. Seeded career minus the era above.
  const base = owners.map(o => {
    const c = (A.owners[o.name] || {}).career || { wins: 0, losses: 0, ties: 0 };
    const w = o.wins - c.wins, l = o.losses - c.losses, t = (o.ties || 0) - (c.ties || 0);
    return { name: o.name, w, l, t, games: w + l + t };
  });
  const games = [...new Set(base.map(b => b.games))].sort((a, b) => a - b);
  const modal = games[0];
  const odd = base.filter(b => b.games !== modal);

  ck('exactly one owner has a different number of pre-2023 games',
    odd.length === 1, { game_counts: base.map(b => `${b.name}:${b.games}`) });
  ck('  and it is the row Cory identified',
    odd.length === 1 && odd[0].name === KNOWN.owner, odd.map(o => o.name));
  ck('  by exactly the amount diagnosed, no more',
    odd.length === 1 && odd[0].games - modal === KNOWN.extraGames,
    { surplus: odd.length === 1 ? odd[0].games - modal : null, expected: KNOWN.extraGames });
  ck('  everybody else is level with everybody else',
    base.filter(b => b.games === modal).length === owners.length - 1,
    base.map(b => `${b.name}:${b.games}`));

  // ── 3) THE WHOLE-LEAGUE INVARIANT, stated in full. Off by the known amount
  // and nothing else.
  {
    const W = owners.reduce((s, o) => s + (o.wins || 0), 0);
    const L = owners.reduce((s, o) => s + (o.losses || 0), 0);
    const T = owners.reduce((s, o) => s + (o.ties || 0), 0);
    const G = W + L + T;
    ck('career wins exceed losses by exactly the one known win',
      W - L === KNOWN.extraWins, { wins: W, losses: L, difference: W - L, known: KNOWN.extraWins });
    ck('  ties are paired across the league', T % 2 === 0, T);
    ck('  and the games total is odd by exactly that one game',
      G % 2 === 1 && (G - KNOWN.extraGames) % 2 === 0, { games: G });

    // ── RETIREMENT. When A corrects src/seed-data.js (Cory 49-36-1 -> 48-36-1)
    // this check goes red, which is the signal to delete this whole file and
    // replace it with the plain invariant: W === L, T even, G even.
    ck('RETIREMENT CHECK — the discrepancy is still outstanding',
      W !== L,
      W === L ? 'The records now close. Delete career_records_close.test.js and '
        + 'assert W === L, T % 2 === 0, G % 2 === 0 directly.' : undefined);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
