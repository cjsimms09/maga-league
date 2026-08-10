'use strict';
// WHAT TO WATCH — the sweat engine: sweat meter (P win from live + remaining),
// the weekly-hundred sweat, the "what you need" line, buckets, and the
// most-watchable sort. Pure — reuses the optimizer's probability core.
const path = require('path');
const W = require(path.join(__dirname, '..', '..', 'src', 'routes', 'whatwatch'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };
const p = (proj, sd = 7) => ({ proj, sd });

(function () {
  // remainStats
  const rs = W.remainStats([p(10), p(20)]);
  ck('remainStats sums mean', rs.mean === 30);
  ck('remainStats sums variance', rs.varc === 98, rs.varc);

  // sweat: ahead on the board with players left → favored
  const ahead = W.sweat({ live: 90, oppLive: 70, remain: [p(15)], oppRemain: [p(15)] });
  ck('projected finals = live + remaining', ahead.myProj === 105 && ahead.oppProj === 85);
  ck('leader is favored', ahead.pWin > 0.5, ahead.pWin);
  ck('margin is projected difference', ahead.margin === 20);

  // dead even → ~coin flip
  const even = W.sweat({ live: 80, oppLive: 80, remain: [p(12)], oppRemain: [p(12)] });
  ck('even game ~ 50/50', Math.abs(even.pWin - 0.5) < 0.02, even.pWin);

  // labels
  ck('coin flip label', W.sweatLabel(0.5).level === 'flip');
  ck('safe label', W.sweatLabel(0.92).level === 'safe');
  ck('cooked label', W.sweatLabel(0.05).level === 'cooked');
  ck('sweat label in between', W.sweatLabel(0.65).level === 'sweat');

  // need line
  const behind = W.sweat({ live: 60, oppLive: 90, remain: [p(10), p(5)], oppRemain: [] });
  ck('behind → "need ~X" from N players', /Need ~15 more, from 2 players/.test(W.needLine(behind)), W.needLine(behind));
  const winning = W.sweat({ live: 100, oppLive: 80, remain: [p(5)], oppRemain: [p(5)] });
  ck('ahead → "up X projected"', /Up /.test(W.needLine(winning)), W.needLine(winning));
  const doneWin = W.sweat({ live: 120, oppLive: 90, remain: [], oppRemain: [] });
  ck('no players left + ahead → done, projected to win', /Done — projected to win/.test(W.needLine(doneWin)));
  const doneLose = W.sweat({ live: 80, oppLive: 120, remain: [], oppRemain: [] });
  ck('no players left + behind → done, projected to lose', /Done — projected to lose/.test(W.needLine(doneLose)));

  // weekly-hundred sweat
  const hp = W.highSweat({ live: 130, remain: [p(20)] }, [140, 145, 150]);
  ck('highSweat is a probability', hp >= 0 && hp <= 1, hp);
  ck('highSweat 0 with no band', W.highSweat({ live: 130, remain: [p(20)] }, []) === 0);

  // panel sort: the coin flip should rank above a blowout
  const rows = W.panelRows([
    { owner_id: 1, name: 'Blowout', oppName: 'x', live: 150, oppLive: 60, remain: [], oppRemain: [] },
    { owner_id: 2, name: 'Nailbiter', oppName: 'y', live: 88, oppLive: 88, remain: [p(10)], oppRemain: [p(10)] },
  ]);
  ck('most-watchable (coin flip) sorts first', rows[0].name === 'Nailbiter', rows[0].name);
  ck('each row carries label + need', rows[0].label && typeof rows[0].need === 'string');

  // ── THE LIVE PATH. member.js#liveWatchEntries has no per-player feed, so it
  // sent `remain: []` — indistinguishable from "the week is over". Zero
  // remaining players means zero variance, so pWin collapsed to exactly 1/0 and
  // EVERY live game rendered a confident verdict plus "Done — nothing left on
  // the field" while the ball was in the air. The rehearsal path supplies
  // `remain`, so the preview looked right and only the real Sunday was broken.
  {
    const L = e => ({ remain: [], oppRemain: [], remainKnown: false, ...e });
    const s = W.sweat(L({ live: 84.2, oppLive: 84.1 }));
    ck('live w/o the per-player feed states NO probability (not a 100% certainty)',
      s.pWin === null, s.pWin);
    ck('  the real score survives onto the row', s.live === 84.2 && s.oppLive === 84.1);
    ck('  the margin is still real', s.margin === 0.1, s.margin);
    ck('  and it does not claim the game is DONE',
      !/Done|Nothing left/.test(W.needLine(s)), W.needLine(s));
    ck('  it says what the board says instead', /Up 0\.1 on the board/.test(W.needLine(s)), W.needLine(s));
    ck('  a null probability gets its own neutral state, not one of the four verdicts',
      W.sweatLabel(null).level === 'live' && !['flip', 'safe', 'cooked', 'sweat'].includes(W.sweatLabel(null).level));
    ck('  no fake "🎯 100% at the $100" for whoever is merely leading',
      W.highSweat(L({ live: 200 }), [120, 130, 140]) === null);
    ck('  a genuinely finished week (feed present, nobody left) still says Done',
      /Done — projected to win/.test(W.needLine(W.sweat({ live: 120, oppLive: 90, remain: [], oppRemain: [] }))));

    // The sort ranked by |pWin - 0.5|, which is NaN when pWin is null — every
    // comparison false, so "most watchable first" was completely inert on live
    // data. Unpriced rows rank by closeness on the board instead.
    const lr = W.panelRows([
      L({ owner_id: 1, name: 'Blowout', oppName: 'x', live: 150, oppLive: 60 }),
      L({ owner_id: 2, name: 'OnePoint', oppName: 'y', live: 84.2, oppLive: 84.1 }),
    ], [120, 130]);
    ck('  the closest game on the board sorts first on live data', lr[0].name === 'OnePoint', lr.map(r => r.name).join(','));
    // Mixed: a game we can actually price outranks one we can only score.
    const mixed = W.panelRows([
      L({ owner_id: 1, name: 'Unpriced', oppName: 'x', live: 80, oppLive: 80 }),
      { owner_id: 2, name: 'Priced', oppName: 'y', live: 88, oppLive: 88, remain: [p(10)], oppRemain: [p(10)] },
    ]);
    ck('  a priced game outranks an unpriced one', mixed[0].name === 'Priced', mixed.map(r => r.name).join(','));

    // WHOSE GAME IS IT? "Down 6.3 on the board" with no subject reads as second
    // person. That is right in the "Your game" row and wrong in every row under
    // "Around the league", where it means the first team named and the reader
    // has to work that out for themselves.
    const viewer = 1;
    const panel = W.panelRows([
      L({ owner_id: viewer, opp_id: 2, name: 'You', oppName: 'Them', live: 80, oppLive: 74 }),
      L({ owner_id: 3, opp_id: 4, name: 'David', oppName: 'Michael', live: 82.6, oppLive: 88.9 }),
    ], [], viewer);
    const mine = panel.find(r => r.owner_id === viewer);
    const theirs = panel.find(r => r.owner_id === 3);
    ck('  the viewer\'s own row stays second person', /^Up 6 on the board\.$/.test(mine.need), mine.need);
    ck('  someone else\'s row names whose game it is', /^David is down 6\.3 on the board\.$/.test(theirs.need), theirs.need);
    ck('  and with no viewer given, nobody is named (unchanged behaviour)',
      /^Down 6\.3 on the board\.$/.test(W.panelRows([
        L({ owner_id: 3, name: 'David', oppName: 'Michael', live: 82.6, oppLive: 88.9 })], [])[0].need));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
