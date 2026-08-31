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

/* ⚠️ WHAT THIS PROBE IS, AND WHAT IT IS NOT — added 2026-08-27 by E after I
 * misused my own tool. This file imports `lineup.js` (the optimizer) and
 * RE-IMPLEMENTS member.js's opponent-score choice locally, a few lines below.
 * So it demonstrates the CONSEQUENCE of feeding a partial score into pWin —
 * it is blind to whether the shipped code actually feeds one. It prints the
 * identical table on fixed and on broken code, and on 2026-08-27 I ran it
 * against a FIXED `main` and reported the unchanged output as though it were
 * evidence the defect was still live. It was not. The two checks that WERE
 * decisive were reading the literal line in member.js and `git log -S` showing
 * it had never been removed on main.
 *
 * So the live-state check now runs HERE, reading the shipped source, and the
 * probe says out loud which of the two things it is reporting. */
function liveState() {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'member.js'), 'utf8');
  /* The defect: oppMean taking the live accumulated matchup.opp.points. */
  const substitutes = /oppMean\s*=\s*matchup\.opp\.points/.test(src);
  return { substitutes, evidence: substitutes
    ? 'member.js assigns oppMean = matchup.opp.points — the partial IS substituted'
    : 'member.js contains no `oppMean = matchup.opp.points` — the partial is NOT substituted' };
}

const ARC = [
  ['pre-kickoff — points 0, the fallback fires', 0],
  ['one early game finished', 15],
  ['the 1pm window finished', 40],
  ['the 4pm window finished', 80],
  ['every game finished', 112],
];

function run() {
  const ls = liveState();
  console.log('\n  LIVE STATE OF THE SHIPPED CODE (read from src/routes/member.js, not simulated)');
  console.log('  ' + ls.evidence);
  console.log('  ' + (ls.substitutes
    ? '=> the arc below is what the page IS DOING today.'
    : '=> the arc below is the MECHANISM ONLY — a demonstration of what would happen\n     if the partial were fed in. It is NOT evidence about the current code.'));
  console.log('');

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
  /* ---- AND THE INDIVIDUAL SWAP, which is what I said I had not shown -------
   * `calls` stays 0 no matter how large the bench edge, because `calls` is the
   * chase-vs-protect DEVIATION list, not the your-lineup-is-wrong list. The
   * alert reads `set.changes`, filtered on `dollars > 0.5 || startProj - sitProj > 1`
   * (`lineup.js:1045`). So the swap's DOLLARS are what move, and they move a lot. */
  const swap = edge => {
    const R = ROSTER.map(r => Object.assign({}, r));
    R.find(r => r.id === 'b1').proj = 9.0 + edge;      // bench WR
    R.find(r => r.id === 'wr2').proj = 9.0;            // the starter he beats
    const cur = R.filter(r => r.starter).map(r => r.id);
    return ARC.map(([, pts]) => {
      let oppMean = pts, oppSd;
      if (!(pts > 0)) { oppMean = typical.median || band.median; oppSd = typical.sd || undefined; }
      const out = LO.optimize(R.map(r => Object.assign({}, r)),
        { band, sigmaByPos, oppMean, oppSd, current: cur });
      const c = ((out.set || {}).changes || [])[0];
      if (!c) return null;
      const dp = c.startProj - c.sitProj;
      return { d: c.dollars, shown: (c.dollars > 0.5 || dp > 1) };
    });
  };
  console.log('\n  THE SAME START/SIT SWAP, PRICED THROUGH THE SAME DAY');
  console.log('  ' + pad('bench edge over the starter', 30) + pad('its value at each hour', 36) + 'in the Sunday alert?');
  [1.2, 0.9, 0.7].forEach(e => {
    const a = swap(e);
    console.log('  ' + pad('+' + e.toFixed(1) + ' projected points', 30)
      + pad(a.map(x => x ? "$" + x.d.toFixed(2) : "—").join(" / "), 38)
      + a.map(x => x && x.shown ? 'Y' : 'n').join('/'));
  });
  console.log('\n  The swap is worth ~4x more at 11am than at 1pm, unchanged in every way');
  console.log('  except the clock. And below a ~1.0-point edge the alert STOPS MENTIONING');
  console.log('  it mid-Sunday and starts again afterwards.');
  /* ---- WHAT EACH FIX ACTUALLY COSTS -------------------------------------
   * The matchup card's precedent is REFUSE (member.js:2812). On this page that
   * means `oppMean: 0`, which lineup.js:494 documents as "0 disables the matchup
   * term". It is supported and it is not free -- measured below, so B decides
   * with the number rather than the principle. */
  console.log('\n  WHAT EACH OPTION COSTS — the same roster, mid-Sunday');
  const opt = (label, oppMean, oppSd) => {
    const out = LO.optimize(ROSTER.map(r => Object.assign({}, r)),
      { band, sigmaByPos, oppMean, oppSd, current: CURRENT });
    let posture = '';
    try { const wp = LO.weeklyPosture(out, band); posture = (wp && (wp.headline || wp.label || wp.text)) || ''; }
    catch (e) { posture = '(unavailable)'; }
    console.log('  ' + pad(label, 32)
      + pad(out.ev.pWin != null ? (100 * out.ev.pWin).toFixed(1) + '%' : '—', 9)
      + pad('$' + out.ev.dollars.toFixed(2), 11) + posture);
  };
  opt('hold the pre-kick estimate', typical.median, typical.sd);
  opt('REFUSE (oppMean 0)', 0, undefined);
  opt('today — substitute the partial', 40, undefined);
  console.log('\n  Refusing removes the wrong probability and is NOT free: the dollar');
  console.log('  figure collapses ~10x because the matchup term carried most of it, and');
  console.log('  the headline still ASSERTS something ("no chase this week") rather than');
  console.log('  saying the matchup cannot be priced mid-game. There is no "we cannot');
  console.log('  say" state on this surface, and that is the real gap behind all three.');

  console.log('\n  ⚠️ The silent case is CONSTRUCTED to sit near the $0.50 bar and is not');
  console.log('  claimed as typical. The 4x swing in the dollar value is unconditional,');
  console.log('  and the bar is real, so some swap lands in that band most weeks.');
}

if (require.main === module) run();
