'use strict';
/* THE WAIVER CLAIM VALUE — one baseline, not two marginals.
 *
 * B found the defect and parked it rather than guessing, because the valuation is
 * A's and B would not ship a surface on top of a number that prices a downgrade
 * at $59. It was right not to.
 *
 * THE DEFECT, in B's words: `net_value` compared two marginals measured against
 * DIFFERENT INCUMBENTS. It priced claiming a kicker strictly worse than the one
 * already starting at $59, and 28 of those points were the gap between the WR2
 * and the kicker — nothing about the two kickers being compared.
 *
 * TWO COMPOUNDING BUGS. Fixing one leaves the other:
 *   1. `startableValue` returns THREE different scales depending on `fills` —
 *      `vorp` (vs positional replacement) for a starter/flex fit, and
 *      `upgrade*discount + insurance` (vs MY incumbent) for a bench fit. The
 *      route subtracted one from the other. Different zeroes.
 *   2. Subtracting a NEGATIVE drop value ADDS its deficit to the claim.
 *
 * This suite reproduces the case BEFORE trusting the fix, then pins the
 * properties the fix must have.
 *
 * Run: node draft/tests/claim_value.test.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const V = require(path.join(ROOT, 'public', 'js', 'draft', 'valuation.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d ? '\n        -> ' + d : ''))); };

const LEAGUE = { teams: 10, starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
const P = (id, pos, proj, vorp) => ({ player_id: id, name: id, position: pos,
  proj_mean: proj, vorp: vorp == null ? proj - 100 : vorp });

/* THE ONE REAL OPTIMISER, injected. A greedy best-per-slot with a single FLEX —
 * the same rule lineup.js applies. It is defined HERE only because this is a
 * test; production injects src/routes/lineup.js's bestLineup. */
const SLOTS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
const FLEX = ['RB', 'WR', 'TE'];
function lineupPoints(roster) {
  const byPos = {};
  (roster || []).forEach(p => { (byPos[p.position] = byPos[p.position] || []).push(p.proj_mean || 0); });
  Object.values(byPos).forEach(a => a.sort((x, y) => y - x));
  let total = 0; const used = {};
  Object.keys(SLOTS).forEach(pos => {
    const a = byPos[pos] || [];
    for (let i = 0; i < SLOTS[pos]; i++) if (a[i] != null) total += a[i];
    used[pos] = SLOTS[pos];
  });
  let best = 0;
  FLEX.forEach(pos => { const a = byPos[pos] || [], i = used[pos] || 0;
    if (a[i] != null && a[i] > best) best = a[i]; });
  return total + best;
}

/* ── B's CASE, RECONSTRUCTED ────────────────────────────────────────────────
 * A full roster starting a decent kicker, with a weak bench WR as the drop
 * candidate. The claim is a STRICTLY WORSE kicker. */
const myK = P('K-good', 'K', 130);
/* THE FIRST FIXTURE HAD NO TRUE BENCH BODY, and the fix caught me: with one
 * spare WR at 92 he was the FLEX STARTER, so dropping him really did cost 92 and
 * claimValue correctly called every claim a downgrade. Two tests went red for
 * the right reason. A genuine non-starter is needed to reproduce B's case —
 * `flexWR` starts in the flex, `scrubWR` is the drop candidate. */
const flexWR = P('WR-flex', 'WR', 92);            // starts in the FLEX
const scrubWR = P('WR-scrub', 'WR', 55);          // the real drop candidate
const roster = [
  P('QB1', 'QB', 300), P('RB1', 'RB', 240), P('RB2', 'RB', 210),
  P('WR1', 'WR', 250), P('WR2', 'WR', 220), P('TE1', 'TE', 160),
  myK, P('DEF1', 'DEF', 110), flexWR, scrubWR,
];
const worseK = P('K-worse', 'K', 118);            // strictly worse than K-good

{
  const r = V.claimValue(worseK, scrubWR, roster, LEAGUE, lineupPoints);
  ck('a STRICTLY WORSE kicker is not worth anything',
     r.net_points <= 0,
     'priced at ' + r.net_points + ' — this is the $59 downgrade B found');
  ck('and it SAYS it is a downgrade rather than reading as zero',
     r.improves === false && /DOWNGRADE|no change/.test(r.why),
     r.why);

  /* THE OLD ARITHMETIC, COMPUTED HERE so the regression is a number rather than
   * a story. netPoints = startableValue(claim) - startableValue(drop), which is
   * what the route did. */
  const svClaim = V.startableValue(worseK, roster, LEAGUE).value;
  const svDrop = V.startableValue(scrubWR, roster, LEAGUE).value;
  const oldNet = Math.max(0, svClaim - svDrop);
  ck('the OLD formula really did price this downgrade as positive (non-vacuity)',
     oldNet > 0,
     'old netPoints = max(0, ' + svClaim.toFixed(2) + ' - ' + svDrop.toFixed(2)
     + ') = ' + oldNet.toFixed(2) + ' — if this is 0 the fixture no longer '
     + 'reproduces B\'s case and the test below proves nothing');
  ck('and the new value is strictly lower than the old one',
     r.net_points < oldNet,
     'new ' + r.net_points.toFixed(2) + ' vs old ' + oldNet.toFixed(2));
}

/* ── THE PROPERTIES THE FIX MUST HAVE ──────────────────────────────────────── */
{
  const betterK = P('K-better', 'K', 145);
  const r = V.claimValue(betterK, scrubWR, roster, LEAGUE, lineupPoints);
  ck('a genuinely better kicker IS worth the lineup gain, and only that',
     Math.abs(r.net_points - (145 - 130)) < 1e-9,
     'got ' + r.net_points + ', expected exactly ' + (145 - 130)
     + ' — the K upgrade, with no WR2 gap smuggled in');
}
{
  // The drop is a bench body; swapping in a WR who cannot crack the lineup
  // changes nothing, and must read as nothing.
  const deadWR = P('WR-dead', 'WR', 60);
  const r = V.claimValue(deadWR, scrubWR, roster, LEAGUE, lineupPoints);
  ck('a claim that cannot reach the starting lineup is worth zero, not "some"',
     r.net_points === 0, 'got ' + r.net_points);
}
{
  // Dropping a STARTER to add someone better must net only the difference.
  const bigWR = P('WR-big', 'WR', 300);
  const r = V.claimValue(bigWR, roster.find(p => p.player_id === 'WR2'), roster, LEAGUE, lineupPoints);
  ck('dropping a starter nets only the difference, not the newcomer\'s whole value',
     r.net_points > 0 && r.net_points < 300,
     'got ' + r.net_points + ' — 300 would mean the dropped starter was free');
}
{
  const r = V.claimValue(P('K2', 'K', 145), null, roster, LEAGUE, lineupPoints);
  ck('an empty roster spot (no drop) is handled', r.net_points > 0, JSON.stringify(r));
}

/* ── THE OPTIMISER IS INJECTED, AND IT REFUSES TO GUESS ─────────────────────
 * A silent fallback to a private lineup implementation is how two valuations
 * drift while both look right — the disease this module exists to cure. */
{
  let threw = false;
  try { V.claimValue(worseK, scrubWR, roster, LEAGUE); } catch (e) { threw = /lineupPoints/.test(e.message); }
  ck('it REFUSES without the real optimiser rather than falling back',
     threw, 'it silently used some other lineup rule');
}

console.log('');
console.log(pass + '/' + (pass + fail) + ' claim-value checks passed');
process.exit(fail ? 1 : 0);
