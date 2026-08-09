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

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
