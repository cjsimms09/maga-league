/* THE TOOL-WAIVER ARM'S BRIDGE — drives the REAL live waiver tool, decides nothing.
 *
 * WHY THIS IS JAVASCRIPT, stated the same way draft/backtest/replay.js states it:
 * the thing under test is `src/routes/waivers.js` (evaluateClaims) plus the
 * shared valuation's `claimStoppingRule` — the code that would run on a live
 * Tuesday. A Python re-implementation would grade a second system that merely
 * resembles the tool, which is this repository's most-caught defect class
 * (see replay.js's header, and waivers.js's own history of a private
 * lineupPoints copy). So Python prepares each week's as-of inputs and THIS file
 * does nothing but call the real functions and echo their answers back.
 *
 * Protocol: one JSON request per stdin line ->
 *           one JSON response per stdout line. Fields:
 *   in : { id, myRoster, freeAgents, league, ctx, waiverType }
 *   out: { id, drop, dollars_per_point, n_claims, top: claims[0..4],
 *          depletes, stopping }   (or { id, error })
 *
 * `stopping` is the live claimStoppingRule verdict on the tool's own top-ranked
 * claim, under the season's REAL waiver_type (1 = reverse standings across
 * 2023-25, read from league_history settings, never assumed). The harness
 * executes a claim only when the tool's own rule says `claim: true`.
 *
 * NOT part of ci.yml's JS suites (it is a bridge, not a test); exercised through
 * draft/tests/test_replay_waiver.py, which also asserts this file requires the
 * real tool modules rather than defining claim math of its own.
 */
'use strict';
const path = require('path');
const readline = require('readline');
const W = require(path.join(__dirname, '..', '..', 'src', 'routes', 'waivers.js'));
const V = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'valuation.js'));

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', line => {
  if (!line.trim()) return;
  let req = null;
  try { req = JSON.parse(line); } catch (e) {
    process.stdout.write(JSON.stringify({ error: 'unparseable request: ' + e.message }) + '\n');
    return;
  }
  try {
    const res = W.evaluateClaims(req.freeAgents || [], req.myRoster || [],
                                 req.league || {}, req.ctx || {});
    // The live stopping rule, on the tool's own top claim, under the REAL
    // waiver regime. waiverPriorityDepletes returns null for FAAB/unknown —
    // surfaced as-is rather than coerced, so the harness refuses instead of
    // guessing (the rule's own documented posture).
    const depletes = V.waiverPriorityDepletes(req.waiverType);
    const top = (res.claims || [])[0] || null;
    let stopping = null;
    if (top && depletes !== null) {
      stopping = V.claimStoppingRule({
        depletes: depletes,
        net_points: top.net_value,
        contested: !!top.contested,
        reserve: req.reserve == null ? null : req.reserve,
      });
    }
    process.stdout.write(JSON.stringify({
      id: req.id,
      drop: res.drop,
      dollars_per_point: res.dollars_per_point,
      n_claims: (res.claims || []).length,
      top: (res.claims || []).slice(0, 5),
      depletes: depletes,
      stopping: stopping,
    }) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ id: req && req.id,
      error: String((e && e.message) || e) }) + '\n');
  }
});
