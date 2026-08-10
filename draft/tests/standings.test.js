/* ROSTER ANALYZER — validation over the REAL 2023-25 seasons (DONE standard #1).
 *
 * Not a fixture test: it runs the projector against three real seasons of actual
 * H2H results and grades it two ways — did the predicted top-4 match the actual
 * playoff teams, and are the probabilities coherent + calibrated at the extremes.
 * Also asserts the hard invariant that makes the probabilities trustworthy: across
 * a projection, playoff probabilities sum to exactly the number of playoff spots.
 *
 * Run: node draft/tests/standings.test.js
 */
const path = require('path');
const S = require(path.join(__dirname, '..', '..', 'src', 'routes', 'standings.js'));
const LO = require(path.join(__dirname, '..', '..', 'src', 'routes', 'lineup.js'));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '\n      -> ' + detail : '')); }
}

// 1) Forward-test accuracy over real data.
const v = S.validateStandings();
check('top-4 accuracy beats coin-flip (40%) by a wide margin',
  v.top4_accuracy >= 0.6, (v.top4_accuracy * 100).toFixed(0) + '%');
check('the simulator is at least as good as the naive current-standings baseline',
  v.top4_accuracy >= v.naive_accuracy - 1e-9,
  'model ' + (v.top4_accuracy * 100).toFixed(0) + '% vs naive ' + (v.naive_accuracy * 100).toFixed(0) + '%');

// 2) Calibration at the extremes (mid-buckets are small-n and noisy — we assert
// only where the sample supports it: the model must rule teams out and lock teams
// in correctly).
const lo = v.calibration.find(c => c.bucket === '0-10%');
const hi = v.calibration.find(c => c.bucket === '90-100%');
check('teams given <10% playoff odds almost never make it', !lo || lo.actual_rate <= 0.20,
  lo && (lo.actual_rate * 100).toFixed(0) + '% (n=' + (lo && lo.n) + ')');
check('teams given >90% playoff odds almost always make it', !hi || hi.actual_rate >= 0.80,
  hi && (hi.actual_rate * 100).toFixed(0) + '% (n=' + (hi && hi.n) + ')');

// 3) The probability invariant: exactly PLAYOFF_SPOTS teams make it each sim, so
// playoff probabilities across the league sum to PLAYOFF_SPOTS. If this breaks the
// probabilities are not real probabilities.
const season = LO.seasonOf(LO.harvest(), '2024');
const proj = S.projectStandings(season, { throughWeek: 7, sims: 2000, seed: 42 });
const probSum = proj.projections.reduce((s, p) => s + p.playoff_prob, 0);
check('playoff probabilities sum to the number of playoff spots (4)',
  Math.abs(probSum - S.PLAYOFF_SPOTS) < 0.02, probSum.toFixed(3));
check('every playoff_prob is a real probability in [0,1]',
  proj.projections.every(p => p.playoff_prob >= 0 && p.playoff_prob <= 1));
check('every team gets a posture the other tools can consume',
  proj.projections.every(p => ['lock', 'contender', 'desperate', 'chasing_high'].includes(p.posture)));

// 4) Posture is coherent: the top seed is not "chasing_high", the bottom is not "lock".
const top = proj.projections[0], bottom = proj.projections[proj.projections.length - 1];
check('the projected leader is a lock or contender, never chasing/desperate',
  top.posture === 'lock' || top.posture === 'contender', top.posture);
check('the projected cellar team is not classified a playoff lock',
  bottom.posture !== 'lock', bottom.posture);

// 5) Determinism: same seed -> same projection (resume/repro safety).
const proj2 = S.projectStandings(season, { throughWeek: 7, sims: 2000, seed: 42 });
check('same seed reproduces the projection exactly',
  JSON.stringify(proj.projections.map(p => [p.rid, p.playoff_prob]))
  === JSON.stringify(proj2.projections.map(p => [p.rid, p.playoff_prob])));

console.log('\n' + pass + '/' + (pass + fail) + ' roster-analyzer checks passed'
  + '  [top-4 ' + (v.top4_accuracy * 100).toFixed(0) + '% vs naive ' + (v.naive_accuracy * 100).toFixed(0) + '%]');
process.exit(fail ? 1 : 0);
