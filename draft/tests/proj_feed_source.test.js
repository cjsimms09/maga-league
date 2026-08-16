'use strict';
// TERRITORY: A
// THE PROJECTION-SOURCE SWITCH IN THE FEED (Cory, 2026-08-16: "Make a way for
// me to easily switch between models in the site!"). Claims under test:
//   1. default IS current behavior — no source (or junk) means proj_mean, so
//      every existing consumer is untouched by this change;
//   2. each source derives from exactly the board field its name says, and
//      the basis string names it (a January read can tell which regime priced
//      any week);
//   3. sleeper_fp_average is the mean when both exist, degrades to the one
//      that exists SAYING SO, and is absent (never zero) when neither does;
//   4. the feed stamps which source built it;
//   5. sourceFromControls validates — unknown values fall back to 'blend'
//      out loud rather than half-applying.
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PF = require(path.join(ROOT, 'src', 'proj_feed'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const P = { player_id: '1', name: 'A', position: 'RB', team: 'DET',
  proj_mean: 170, proj_sleeper: 187, proj_fantasypros: 153 };

// 1. default is current behavior
const d0 = PF.weekly(P, {});
ck('no source -> proj_mean/17 (current behavior untouched)',
  d0.proj === Math.round(170 / 17 * 100) / 100 && d0.basis === 'season_rate:proj_mean/17',
  JSON.stringify(d0));
const dJunk = PF.weekly(P, { source: 'coinflip' });
ck('junk source -> blend, not a half-applied switch', dJunk.basis === 'season_rate:proj_mean/17');

// 2. each source reads its own field and names it
const s = PF.weekly(P, { source: 'sleeper' });
ck('sleeper reads proj_sleeper and says so',
  s.proj === 11 && s.basis === 'season_rate:proj_sleeper/17', JSON.stringify(s));
const f = PF.weekly(P, { source: 'fantasypros' });
ck('fantasypros reads proj_fantasypros and says so',
  f.proj === 9 && f.basis === 'season_rate:proj_fantasypros/17', JSON.stringify(f));

// 3. the average and its honest degradations
const a = PF.weekly(P, { source: 'sleeper_fp_average' });
ck('average = mean of both when both exist',
  a.proj === 10 && a.basis === 'season_rate:avg(proj_sleeper,proj_fantasypros)/17',
  JSON.stringify(a));
const onlyS = PF.weekly({ player_id: '2', proj_sleeper: 170 }, { source: 'sleeper_fp_average' });
ck('average with FP missing uses sleeper AND SAYS SO',
  onlyS.proj === 10 && onlyS.basis === 'season_rate:avg:proj_sleeper_only/17',
  JSON.stringify(onlyS));
const neither = PF.weekly({ player_id: '3', proj_mean: 170 }, { source: 'sleeper_fp_average' });
ck('average with neither is ABSENT, never zero and never a silent proj_mean',
  neither.proj === null && neither.basis === 'absent', JSON.stringify(neither));
const sAbsent = PF.weekly({ player_id: '4', proj_mean: 170 }, { source: 'sleeper' });
ck('sleeper source with no proj_sleeper is absent, not proj_mean',
  sAbsent.proj === null && sAbsent.basis === 'absent');

// zeroing (bye/OUT) outranks every source the same way
const bye = PF.weekly(Object.assign({}, P, { bye: 7 }), { source: 'sleeper', week: 7 });
ck('bye zeroes under any source (the solver guard)', bye.proj === 0 && bye.basis === 'zeroed');

// 4. the feed stamps its source
const feed = PF.buildFeed([P], { week: 3, season: '2026', source: 'sleeper' });
ck('feed stamps source and prices under it',
  feed.source === 'sleeper' && feed.players['1'].proj === 11, JSON.stringify(feed.source));
const feedDef = PF.buildFeed([P], { week: 3, season: '2026' });
ck('feed default stamp is blend', feedDef.source === 'blend');

// 5. validation
ck('sourceFromControls validates', PF.sourceFromControls({ projection_source: 'sleeper' }) === 'sleeper'
  && PF.sourceFromControls({ projection_source: 'nope' }) === 'blend'
  && PF.sourceFromControls(null) === 'blend');
ck('PROJ_SOURCES is the four-option contract',
  JSON.stringify(PF.PROJ_SOURCES) === JSON.stringify(['blend', 'sleeper', 'fantasypros', 'sleeper_fp_average']));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
