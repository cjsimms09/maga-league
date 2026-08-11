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

// 1b) THE ARITHMETIC net_value IS SUPPOSED TO BE DOING.
//
// It was `startableValue(fa) - startableValue(drop)`, two BENCH marginals each
// measured against the incumbent AT THAT PLAYER'S POSITION — so across positions
// the subtraction did not cancel and the remainder was a comparison between two
// of my own players. Measured on this roster: a kicker projected 110, claimed
// while already starting one projected 130, scored +23.36 net and $59, of which
// 0.35 x (my WR2 210 - my kicker 130) = 28.00 was the gap between two players
// neither added nor dropped.
//
// The quantity is now the change in what my optimal STARTING lineup projects,
// which is what the docstring always claimed and the unit dollarsPerPoint prices.
{
  const worseK = mk('faKworse', 'K', 110, 3);      // I already start a 130 kicker
  const benchRB = mk('faRBbench', 'RB', 150, 30);  // behind a 220 and a 240
  // INPUT ORDER IS DELIBERATE. Array.sort is stable, so with the stronger depth
  // claim listed first the tie-break would be unobservable and the assertion
  // below would pass with the tie-break deleted (it did — caught by rule 10).
  // benchRB (startable_value -24.08) goes FIRST so only a real tie-break can
  // move worseK (-6.94) ahead of it.
  const r = W.evaluateClaims([benchRB, worseK, mk('faWRgood2', 'WR', 205, 78)],
    myRoster, league, { lineupMean: 130, lineupSd: 24, oppMean: 128 });
  const of = id => r.claims.find(c => c.player_id === id);

  check('a kicker WORSE than the one I start is worth exactly nothing',
    of('faKworse').net_value === 0 && of('faKworse').dollars === 0,
    'net ' + of('faKworse').net_value + ', $' + of('faKworse').dollars);
  check('  and a bench RB who cannot crack the lineup is worth nothing either',
    of('faRBbench').net_value === 0, String(of('faRBbench').net_value));

  // The REAL upgrade: 205 displaces the 175 flex, so the starting lineup gains
  // exactly 30. Stated as arithmetic rather than "it is positive" — rule 12.
  check('a real upgrade is worth the exact lineup delta (205 over the 175 flex = 30)',
    of('faWRgood2').net_value === 30, String(of('faWRgood2').net_value));
  check('  and its dollars are that delta at the shared per-point rate',
    Math.abs(of('faWRgood2').dollars - 30 * r.dollars_per_point) < 0.02,
    of('faWRgood2').dollars + ' vs ' + (30 * r.dollars_per_point));

  // THE SPECIFIC REGRESSION: nothing about players neither added nor dropped may
  // enter the number. Widening the gap between my WR2 and my kicker moved the old
  // answer; it must not move this one.
  const widened = myRoster.map(p => p.player_id === 'myWR2' ? mk('myWR2', 'WR', 300, 80) : p);
  const r2 = W.evaluateClaims([worseK], widened, league, { lineupMean: 130, lineupSd: 24, oppMean: 128 });
  check('a claim is unaffected by two of my OWN players getting further apart',
    r2.claims[0].net_value === of('faKworse').net_value,
    'widened ' + r2.claims[0].net_value + ' vs ' + of('faKworse').net_value);

  // Depth is demoted, not deleted: both score 0 on the field, and A's untouched
  // marginal breaks the tie.
  const zeros = r.claims.filter(c => c.net_value === 0);
  check('claims that reach the field are ranked above pure depth',
    r.claims[0].net_value > 0 && zeros.length === 2, JSON.stringify(r.claims.map(c => c.net_value)));
  check('  and pure-depth claims are ordered by startable_value, not by input order',
    zeros[0].player_id === 'faKworse' && zeros[0].startable_value > zeros[1].startable_value,
    zeros.map(c => c.player_id + ':' + c.startable_value).join(' '));
}

// 1c) A DOWNGRADE MUST BE ABLE TO SAY IT IS ONE.
//
// My first fix wrapped this in Math.max(0, …) and A was right to drop it: that
// turns "this claim would make your lineup worse" into "this claim is worth
// nothing", and on a Tuesday those are different sentences. It is also the same
// failure found all over this project — a clamp that makes a bad answer
// indistinguishable from a neutral one.
//
// Nine players for nine slots, so `dropCandidate` has no bench body and must
// give up a STARTER. Claiming a 40-point kicker costs the 175-point flex and
// does not displace the 130 kicker, because K is not flex-eligible — the slot
// simply empties. The arithmetic is stated rather than the sign asserted.
{
  const tight = [mk('myQB', 'QB', 300, 60), mk('myRB1', 'RB', 240, 95), mk('myRB2', 'RB', 220, 85),
    mk('myWR1', 'WR', 230, 90), mk('myWR2', 'WR', 210, 80), mk('myTE', 'TE', 180, 55),
    mk('myFlex', 'RB', 175, 45), mk('myK', 'K', 130, 10), mk('myDEF', 'DEF', 125, 8)];
  const r = W.evaluateClaims([mk('faJunk', 'K', 40, 1)], tight, league,
    { lineupMean: 130, lineupSd: 24, oppMean: 128 });
  check('with no bench body the drop is a STARTER', r.drop && r.drop.player_id === 'myFlex',
    r.drop && r.drop.player_id);
  check('a real downgrade prices NEGATIVE, not zero', r.claims[0].net_value === -175,
    String(r.claims[0].net_value) + ' (expected -175: the flex empties, the kicker does not displace a better one)');
  check('  and its dollars are negative too, so the page cannot read it as neutral',
    r.claims[0].dollars < 0, String(r.claims[0].dollars));
}

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
