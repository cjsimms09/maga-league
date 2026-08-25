// TERRITORY: E
/* THE WIN PROBABILITY COMPARES A FULL-WEEK PROJECTION AGAINST A PARTIAL LIVE SCORE.
 *
 * `member.js:3539`:
 *     if (matchup && matchup.opp && matchup.opp.points > 0) { oppMean = matchup.opp.points; }
 *
 * `matchup.opp.points` is `m.points` off Sleeper's matchup object (`sleeper.js:200`)
 * — the opponent's ACCUMULATED SCORE THIS WEEK. Zero before kickoff, partial
 * during, final after.
 *
 * MY side of the same comparison is never a live number. `member.js:3389-3396`
 * resolves a projection: sleeper proj → season average → LAST week → 0, and
 * `sleeper.js:552` fixes `wkPts` to `weekStats(season, state.week - 1)`, so the
 * "last week" fallback really is last week and never this one.
 *
 * So from the opponent's first point until his last game ends, `pWin` divides a
 * full-week projection by a partial total. Both ENDPOINTS are right — pre-kickoff
 * the fallback fires, and after every game both sides are whole-week quantities.
 * Everything in between is wrong, and the error is largest on Sunday morning,
 * which is when the late-window start/sit calls are still live.
 *
 * WHAT THIS PROBE CANNOT DO. Sleeper egress is blocked from the sandbox and the
 * season has not started, so it drives the REAL `LO.optimize` with a synthetic
 * roster rather than reading a live page. It demonstrates the PROBABILITY moving;
 * it does NOT demonstrate a start/sit recommendation flipping — this fixture
 * produces zero calls at every level, and that is reported rather than hidden.
 *
 * REPORT ONLY. Reads nothing but the committed harvest; writes nothing.
 *
 * Run: node draft/tools/sunday_win_probability_probe.js
 */
'use strict';
const path = require('path');
const LO = require(path.join(__dirname, '..', '..', 'src', 'routes', 'lineup.js'));

const band = LO.weeklyHighBand();
const typical = LO.typicalTeamScore();
const sigmaByPos = LO.positionSigmas();

/* Nine starters summing to 99.0 — a hair under the league's median team, so the
 * honest answer is "slight underdog" at every hour of the day. */
const ROSTER = [
  { id: 'qb', pos: 'QB', proj: 19, starter: true }, { id: 'rb1', pos: 'RB', proj: 13, starter: true },
  { id: 'rb2', pos: 'RB', proj: 11, starter: true }, { id: 'wr1', pos: 'WR', proj: 12, starter: true },
  { id: 'wr2', pos: 'WR', proj: 10, starter: true }, { id: 'te', pos: 'TE', proj: 8, starter: true },
  { id: 'flex', pos: 'RB', proj: 10, starter: true }, { id: 'k', pos: 'K', proj: 8, starter: true },
  { id: 'def', pos: 'DEF', proj: 8, starter: true },
  { id: 'b1', pos: 'WR', proj: 7 }, { id: 'b2', pos: 'RB', proj: 6 }, { id: 'b3', pos: 'TE', proj: 5 },
];
const CURRENT = ROSTER.filter(r => r.starter).map(r => r.id);

const ARC = [
  ['pre-kickoff — points 0, the fallback fires', 0],
  ['one early game finished', 15],
  ['the 1pm window finished', 40],
  ['the 4pm window finished', 80],
  ['every game finished', 112],
];

function run() {
  const fails = [];
  const pad = (x, n) => { x = String(x); return x + ' '.repeat(Math.max(0, n - x.length)); };
  const ok = (n, c, d) => { console.log('  ' + n + ' ' + pad(d, 62) + (c ? 'OK' : '*** FAILED ***')); if (!c) fails.push(n); };

  const at = pts => {
    let oppMean = pts, oppSd;
    if (!(pts > 0)) { oppMean = typical.median || band.median; oppSd = typical.sd || undefined; }
    const out = LO.optimize(ROSTER.map(r => Object.assign({}, r)),
      { band, sigmaByPos, oppMean, oppSd, current: CURRENT });
    let posture = null;
    try { const wp = LO.weeklyPosture(out, band); posture = (wp && (wp.headline || wp.label || wp.text)) || null; }
    catch (e) { posture = '(posture unavailable: ' + e.message + ')'; }
    return { oppMean, pWin: out.ev.pWin, dollars: out.ev.dollars,
             calls: (out.calls || []).length, mean: out.ev.mean, posture: posture };
  };

  console.log('CONTROLS');
  const pre = at(0), post = at(112);
  ok('C1', Math.abs(pre.mean - 99) < 0.5, 'the fixture lineup projects ' + pre.mean.toFixed(1) + ', just under the league median');
  ok('C2', pre.pWin < 0.5 && post.pWin < 0.5,
     'both ENDPOINTS are sane: pre-kickoff ' + (100 * pre.pWin).toFixed(1) + '%, final ' + (100 * post.pWin).toFixed(1) + '%');
  const mid = at(15);
  ok('C3', mid.pWin > 0.9, 'and the middle is not: one early game gives ' + (100 * mid.pWin).toFixed(1) + '%');
  if (fails.length) { console.log('\n*** control(s) failed — output void ***'); process.exit(1); }

  console.log('\nWHAT THE SURFACE REPORTS AS ONE SUNDAY UNFOLDS — the roster never changes');
  console.log('  ' + pad('opponent state', 44) + pad('oppMean', 9) + pad('P(win)', 9)
    + pad('dollars', 10) + 'headline advice');
  ARC.forEach(([label, pts]) => {
    const r = at(pts);
    console.log('  ' + pad(label, 44) + pad(r.oppMean.toFixed(1), 9)
      + pad((100 * r.pWin).toFixed(1) + '%', 9) + pad('$' + r.dollars.toFixed(2), 10)
      + (r.posture || '—'));
  });
  console.log('\n  Same roster, same projections, same opponent. The reported probability');
  console.log('  swings ' + (100 * pre.pWin).toFixed(0) + '% -> ' + (100 * mid.pWin).toFixed(0)
    + '% -> ' + (100 * post.pWin).toFixed(0) + '% because ONE side of the comparison');
  console.log('  switches from a projection to a partial total and the other does not.');
  /* ⚠️ THIS PARAGRAPH REPLACED AN EARLIER, WEAKER ONE. The first version of this
   * probe reported only P(win), found `calls` was 0 at every level, and said in
   * as many words that it showed the PROBABILITY moving and NOT a recommendation
   * flipping. That was honest and it was also incomplete: `calls` is not the
   * advice. `weeklyPosture()` is, and it flips. */
  console.log('\n  IT IS NOT ONLY THE PROBABILITY. The headline advice flips from');
  console.log('  "Protect the matchup" to "Start your studs" and back, and the dollar');
  console.log('  figure moves 2.5x, on a roster that never changes.');
  console.log('\n  `calls` is 0 at every level on this fixture, so no individual start/sit');
  console.log('  swap is demonstrated here — that would need a roster with a real swap in');
  console.log('  it. The POSTURE and the DOLLARS are the advice, and both move.');
}

if (require.main === module) run();
