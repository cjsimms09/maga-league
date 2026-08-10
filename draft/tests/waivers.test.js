/* THE WAIVER TOOL — logic + the CROSS-TOOL AGREEMENT check (DONE standard #3).
 *
 * Cory: "construct a case where two tools value the same player and check that
 * they agree." This test does exactly that — the waiver tool's startable value for
 * a player must equal the draft engine's, because a claim is the same decision as
 * a pick. If they diverge, the system is not one valuation.
 *
 * Run: node draft/tests/waivers.test.js
 */
const path = require('path');
global.window = global;
require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'survival.js'));
require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'composite.js'));
const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));
const W = require(path.join(__dirname, '..', '..', 'src', 'routes', 'waivers.js'));
const V = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'valuation.js'));

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '\n      -> ' + detail : '')); }
}

const league = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
const mk = (id, pos, proj, vorp, extra) => Object.assign(
  { player_id: id, name: id, position: pos, proj_mean: proj, vorp: vorp }, extra || {});

// My roster: starters filled, a weak bench RB to drop.
const myRoster = [
  mk('myQB', 'QB', 300, 60), mk('myRB1', 'RB', 240, 95), mk('myRB2', 'RB', 220, 85),
  mk('myWR1', 'WR', 230, 90), mk('myWR2', 'WR', 210, 80), mk('myTE', 'TE', 180, 55),
  mk('myK', 'K', 130, 10), mk('myDEF', 'DEF', 125, 8),
  mk('myFlex', 'RB', 175, 45), mk('benchScrub', 'WR', 120, 12),   // weakest, the drop
];

// Free-agent pool.
const freeAgents = [
  mk('faWRgood', 'WR', 205, 78),   // real startable upgrade at a flex-competitive spot
  mk('faRBmid', 'RB', 150, 30),    // bench depth
  mk('faKbad', 'K', 110, 3),
];

const res = W.evaluateClaims(freeAgents, myRoster, league, { lineupMean: 130, lineupSd: 24, oppMean: 128 });

// 1) THE CROSS-TOOL AGREEMENT: the waiver tool's startable value == the draft
// engine's, for the same player and roster.
freeAgents.forEach(fa => {
  const eng = E.starterSlotMarginal(fa, myRoster, league).value;
  const claim = res.claims.find(c => c.player_id === fa.player_id);
  check('[' + fa.player_id + '] waiver value == draft-engine value (one valuation)',
    Math.abs(eng - claim.startable_value) < 1e-9, eng + ' vs ' + claim.startable_value);
});

// 2) Ranking: the best startable upgrade is the top claim.
check('the best startable FA is the #1 claim',
  res.claims[0].player_id === 'faWRgood', res.claims[0].player_id);

// 3) Drop: the weakest bench body is the drop candidate, never a starter.
check('the drop is the weakest bench player (benchScrub), not a starter',
  res.drop && res.drop.player_id === 'benchScrub', res.drop && res.drop.player_id);

// 4) Dollars: a real upgrade is worth positive dollars, via the same $110/$100
// machinery the lineup tool uses.
check('the top claim is worth positive dollars', res.claims[0].dollars > 0, String(res.claims[0].dollars));
check('dollars derive from the shared per-point exchange rate', res.dollars_per_point > 0,
  String(res.dollars_per_point));

// 5) Consensus alongside dollars (C3): every claim carries a raw projection number,
// labelled, next to its dollar figure.
check('every claim shows a raw projection alongside the dollars',
  res.claims.every(c => c.consensus_projection != null && !!c.consensus_label));

// 5b) HONEST LABELLING (the shared C3 rule): the label must NOT say "consensus"
// when only ONE source is wired — it must name that source ("Sleeper proj").
// The old local implementation returned "raw consensus" for a single Sleeper
// projection, which is a small lie in exactly the spot Cory asked for a sanity
// check. Waivers now delegates to public/js/draft/consensus.js, so the wire and
// the draft board can never label the same player differently.
check('a single-source projection is labelled by its SOURCE, not "consensus"',
  res.claims.every(c => c.consensus_label === 'no projection'
    || /^Consensus \(\d+ src\)$/.test(c.consensus_label)
    || (/ proj$/.test(c.consensus_label) && !/consensus/i.test(c.consensus_label))),
  JSON.stringify(res.claims.slice(0, 3).map(c => c.consensus_label)));
{
  const W2 = require(path.join(__dirname, '..', '..', 'src', 'routes', 'waivers.js'));
  const C2 = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'consensus.js'));
  const one = W2.consensusProjection({ proj_mean: 226 });
  const two = W2.consensusProjection({ proj_sleeper: 220, proj_fantasypros: 232 });
  check('one source -> "<Source> proj", no "consensus" claim', one.label === 'Sleeper proj' && one.isConsensus === false, one.label);
  check('two sources -> "Consensus (2 src)" and averaged', two.label === 'Consensus (2 src)' && two.value === 226 && two.isConsensus === true, JSON.stringify(two));
  // The delegation itself: waivers must return the SAME value the shared module does.
  check('waiver projection == the shared C3 derivation (one valuation, C1-style)',
    W2.consensusProjection({ proj_mean: 181 }).value === C2.rawProjection({ proj_mean: 181 }).value);
}

// 6) Who-else-needs: a rival short at the position shows up; a full team does not.
const leagueRosters = {
  7: [mk('r7wr', 'WR', 200, 70)],                 // only 1 WR -> needs WR
  8: [mk('r8wr1', 'WR', 210, 80), mk('r8wr2', 'WR', 205, 78), mk('r8wr3', 'WR', 200, 76)], // WR full
};
const withRivals = W.evaluateClaims([mk('faWR2', 'WR', 205, 78)], myRoster, league, {
  lineupMean: 130, lineupSd: 24, oppMean: 128,
  leagueRosters, postures: { 7: 'contender', 8: 'lock' },
});
const claim = withRivals.claims[0];
check('a WR claim is contested by the team short at WR (team 7)',
  claim.rivals.some(r => r.rid === 7), JSON.stringify(claim.rivals));
check('the team already full at WR (team 8) is NOT listed as needing him',
  !claim.rivals.some(r => r.rid === 8), JSON.stringify(claim.rivals));

// 7) A claim the machinery likes but the projection is low would be visible: the
// two numbers are independent fields on the same row (C3's whole point).
check('consensus and dollars are separate fields, so a disagreement is visible',
  typeof claim.consensus_projection === 'number' && typeof claim.dollars === 'number');

console.log('\n' + pass + '/' + (pass + fail) + ' waiver-tool checks passed');
process.exit(fail ? 1 : 0);
