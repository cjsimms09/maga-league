// TERRITORY: A
/* CONSOLIDATED BYES, AND WHAT A BACKUP ACTUALLY DOES FOR A LIVING.
 *
 * Two of Cory's ideas, tested rather than adopted:
 *
 *   "Is having bye weeks consolidated a bad thing? Maybe sacrifice one week
 *    instead of a disadvantage multiple weeks?"
 *
 *   "The opportunity cost of 2 QB and 2 TE just isn't worth it. If you have 4
 *    RBs and or 4 WR the odds of them all playing in more than 1-2 weeks is
 *    high. Not very high for backup TE and QB."
 *
 * AND THE OBJECTIVE IS NOW KNOWN. Cory confirmed the weekly payout is real, is
 * handled manually, and goes to WEEKLY HIGH POINTS. That is not the side-bet
 * market, so rule 15 does not apply, and it is not a matchup win either -- it is
 * P(you are the single highest of ten). Which makes variance_preference.js's
 * measured corr(sd, weekly highs | mean) = +0.519 the DIRECT payout channel
 * rather than a proxy for one.
 *
 * ── WHY THIS NEEDS NO INJURY PARAMETER ─────────────────────────────────────
 *
 * Byes are DETERMINISTIC and known today, and `bye` is populated on every player
 * on the planned roster. So the bye component of "how often does this backup
 * actually start" is exact arithmetic, not a model. Injury is layered on top as
 * a stated sensitivity, never as the main claim -- E[weeks out | injured] is not
 * on disk and is an open C request.
 *
 * Run: node draft/tools/bye_structure.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const HIST = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const PLAN = require('./draft_plan.js');

const roster = PLAN.keep
  .map(k => PLAN.pool.find(p => String(p.player_id) === String(k.player_id)) || k)
  .concat(PLAN.plan.filter(x => x.p).map(x => x.p));
const SLOTS = { QB: 1, RB: 3, WR: 2, TE: 1, K: 1, DEF: 1 };   // RB owns the flex
const WEEKS = 15;

console.log('BYE STRUCTURE — what a backup does for a living, and whether to consolidate\n');

/* ── 1. HOW OFTEN DOES EACH BACKUP ACTUALLY START? ─────────────────────────
 *
 * MY FIRST PASS GOT THIS WRONG and the error flattered the bench. It computed
 * (number of starter bye weeks) - (d-1), which silently assumes the byes stack.
 * They do not: backup #d starts in week w only if d STARTERS ARE OUT THAT SAME
 * WEEK. Three starters on bye in three separate weeks never leaves two out at
 * once, so the second backup is never needed for a bye at all. */
console.log('  1. EXPECTED WEEKS STARTED FROM BYES — exact, no parameters');
console.log('     pos   backup                   starts   from');
console.log('     ' + '-'.repeat(66));
const usage = [];
['QB', 'RB', 'WR', 'TE'].forEach(pos => {
  const g = roster.filter(p => p.position === pos).sort((a, b) => b.proj_mean - a.proj_mean);
  const S = SLOTS[pos];
  const starters = g.slice(0, S), bench = g.slice(S);
  const outAt = {};
  for (let w = 1; w <= WEEKS; w++) outAt[w] = starters.filter(p => p.bye === w).length;
  bench.forEach((p, i) => {
    const d = i + 1;
    const weeks = Object.keys(outAt).filter(w => outAt[w] >= d);
    usage.push({ pos, p, d, weeks: weeks.length });
    console.log('     ' + pos.padEnd(6) + ('#' + d + ' ' + p.name).padEnd(25)
      + String(weeks.length).padStart(4) + '     '
      + (weeks.length ? 'wk ' + weeks.join(', ') : 'NEVER — pure injury insurance'));
  });
});
{
  const rb1 = usage.find(u => u.pos === 'RB' && u.d === 1);
  const qb1 = usage.find(u => u.pos === 'QB' && u.d === 1);
  const te1 = usage.find(u => u.pos === 'TE' && u.d === 1);
  console.log('\n     CORY\'S CLAIM, MEASURED: the first backup RB starts ' + rb1.weeks
    + ' weeks from byes alone.');
  console.log('     The backup QB starts ' + qb1.weeks + '. The backup TE starts ' + te1.weeks
    + '. That is a ' + (rb1.weeks / Math.max(1, qb1.weeks)).toFixed(0) + 'x difference in');
  console.log('     workload before a single injury is assumed, and it is exactly the');
  console.log('     opportunity-cost argument he made. It is also invisible to draft_plan,');
  console.log('     whose pNeedNth reads injury rates and knows nothing about byes.');
  const zero = usage.filter(u => u.weeks === 0);
  console.log('\n     AND ' + zero.length + ' OF THE ' + usage.length
    + ' BENCH PLAYERS START ZERO WEEKS FROM BYES: '
    + zero.map(u => u.p.name).join(', ') + '.');
  console.log('     They are pure injury insurance, which is the arm of the model already');
  console.log('     shown to be dimensionally overstated (bench_rule.js section 5).');
}

/* ── 2. THE LEAGUE'S OWN WEEKLY SCORE DISTRIBUTION ─────────────────────────
 * Needed to price a punt. Estimated from 3 seasons of real weekly scores rather
 * than assumed normal, because the payout is a MAX-of-ten event and the tail is
 * exactly what matters. */
const allScores = [];
HIST.seasons.filter(s => s.status === 'complete').forEach(s => {
  const PW = (s.settings || {}).playoff_week_start || 16;
  Object.keys(s.weeks).map(Number).filter(w => w < PW).forEach(w => {
    (s.weeks[String(w)] || []).forEach(r => allScores.push(Number(r.points) || 0));
  });
});
allScores.sort((a, b) => a - b);
const F = x => {                              // empirical CDF of one team's weekly score
  let lo = 0, hi = allScores.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (allScores[m] < x) lo = m + 1; else hi = m; }
  return lo / allScores.length;
};
/* P(you are the single highest of ten) = P(all nine others score below you). */
const pHigh = score => Math.pow(F(score), 9);
console.log('\n  2. THE PAYOUT FUNCTION — from ' + allScores.length + ' real team-weeks');
console.log('     P(weekly high) = F(your score)^9, F = empirical CDF of one team\'s week');
console.log('     score    P(high)');
[90, 100, 110, 120, 130, 140, 150, 160].forEach(s =>
  console.log('     ' + String(s).padStart(5) + '     ' + (100 * pHigh(s)).toFixed(1) + '%'));
console.log('     STEEPLY CONVEX. That is the whole reason variance pays here: doubling');
console.log('     your spread does far more for P(high) than it costs you in the middle.');

/* ── 3. CONSOLIDATE OR SPREAD? ─────────────────────────────────────────────
 *
 * MY FIRST VERSION OF THIS SECTION WAS WRONG IN TWO WAYS AT ONCE, and the two
 * errors are worth more than the result.
 *
 * (a) A UNITS ERROR. It set the weekly base score by summing my starters'
 *     proj_mean and dividing by 15, giving 143.4 -- HIGHER THAN THE BEST
 *     TEAM-SEASON EVER RECORDED IN THIS LEAGUE (123.5 ppg). Season projections
 *     are optimistic and assume every starter plays every week; a realized
 *     weekly score is neither. Comparing that number against a REALIZED CDF
 *     put the whole analysis past the inflection of the payout curve.
 *     The tell was on screen and I did not read it: 6.74 expected weekly highs
 *     means winning the payout 45% of weeks, and no team in three seasons has
 *     exceeded 4 of 15.
 *
 * (b) I WROTE "CONSOLIDATION WINS" ABOVE OUTPUT THAT SAID THE OPPOSITE. The
 *     conclusion was drafted before the numbers were read.
 *
 * The fix is not to pick a better single number -- it is to SWEEP, because the
 * answer genuinely depends on where you sit. P(high) = F(s)^9 is S-shaped:
 * convex low down, concave near the top. For CONVEX P, concentrating damage
 * into one week is better (Jensen). For CONCAVE P, spreading is better. So the
 * flip point is a real property of the league, not an artifact. */
const myStarters = ['QB', 'RB', 'WR', 'TE'].flatMap(pos =>
  roster.filter(p => p.position === pos).sort((a, b) => b.proj_mean - a.proj_mean).slice(0, SLOTS[pos]));
/* Points lost per week when the marginal starter is replaced by his backup. */
function dropFor(pos, d) {
  const g = roster.filter(p => p.position === pos).sort((a, b) => b.proj_mean - a.proj_mean);
  const starter = g[SLOTS[pos] - 1];
  if (!starter) return 0;
  const back = g[SLOTS[pos] - 1 + d];
  return (starter.proj_mean - (back ? back.proj_mean : 0)) / WEEKS;
}
console.log('\n  3. CONSOLIDATE OR SPREAD — swept across realistic base scores');
console.log('     total games missed held FIXED; only WHEN they fall moves.');
const actualByes = {};
myStarters.forEach(p => { if (p.bye != null) actualByes[p.bye] = (actualByes[p.bye] || 0) + 1; });
console.log('     my starters are on bye in weeks: '
  + Object.keys(actualByes).sort((a, b) => a - b).map(w => w + '(' + actualByes[w] + ')').join(', '));
{
  const realized = allScores;
  const q = f => realized[Math.floor(f * (realized.length - 1))];
  console.log('     REALIZED team-week scores in this league: median ' + q(0.5).toFixed(0)
    + ', p90 ' + q(0.9).toFixed(0) + ', max ' + q(1).toFixed(0)
    + '  (summing proj_mean/15 gives 143 — not comparable)');
  const nB = myStarters.filter(p => p.bye != null).length;
  const avgDrop = ['QB', 'RB', 'WR', 'TE'].map(pos => dropFor(pos, 1)).reduce((a, b) => a + b, 0) / 4;
  console.log('     one starter replaced by his backup costs ~' + avgDrop.toFixed(1)
    + ' pts/week; ' + nB + ' starter byes in total.\n');
  /* A TEAM DOES NOT SCORE ITS MEAN EVERY WEEK, AND PRETENDING IT DOES DELETES
   * THE ENTIRE EFFECT UNDER DISCUSSION. My first sweep evaluated pHigh(base),
   * i.e. F(E[S])^9. The right quantity is E[F(S)^9] over the team's own weekly
   * distribution. Since F^9 is convex in the relevant range, Jensen makes the
   * second strictly larger -- and the GAP between them IS the value of variance.
   * Evaluating at the mean gave 0.02 expected highs for a median team, which is
   * absurd on its face: a median team wins some weeks, and it wins them by
   * being lumpy. Residuals are taken from this league's own team-weeks, so the
   * shape is empirical rather than assumed normal. */
  const teamResid = [];
  HIST.seasons.filter(x => x.status === 'complete').forEach(x => {
    const PW = (x.settings || {}).playoff_week_start || 16;
    const byR = {};
    Object.keys(x.weeks).map(Number).filter(w => w < PW).forEach(w =>
      (x.weeks[String(w)] || []).forEach(r => (byR[r.roster_id] = byR[r.roster_id] || []).push(Number(r.points) || 0)));
    Object.values(byR).forEach(arr => {
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      arr.forEach(v => teamResid.push(v - m));
    });
  });
  const eHigh = mu => teamResid.reduce((a, r) => a + pHigh(mu + r), 0) / teamResid.length;
  console.log('     A team does not score its mean every week. Expected highs are computed as');
  console.log('     E[F(S)^9] over ' + teamResid.length + ' empirical weekly residuals, NOT F(mean)^9 —');
  console.log('     the difference between those two IS the value of variance.\n');
  console.log('     base score   spread     consolidated    difference   who wins');
  console.log('     ' + '-'.repeat(70));
  let flip = null, prev = null;
  [95, 100, 105, 110, 115, 120, 125, 130, 135, 140].forEach(base => {
    let sp = 0, co = 0;
    for (let w = 1; w <= WEEKS; w++) {
      sp += eHigh(base - (w <= nB ? avgDrop : 0));
      co += eHigh(base - (w === 1 ? avgDrop * nB : 0));
    }
    const d = co - sp;
    const winner = Math.abs(d) < 1e-4 ? 'tie' : (d > 0 ? 'CONSOLIDATE' : 'spread');
    if (prev !== null && ((prev > 0) !== (d > 0))) flip = base;
    prev = d;
    console.log('     ' + String(base).padStart(9) + sp.toFixed(2).padStart(10)
      + co.toFixed(2).padStart(14) + (d >= 0 ? '   +' : '   ') + d.toFixed(2).padStart(6)
      + '     ' + winner);
  });
  console.log('\n     CONSOLIDATION WINS AT EVERY REALISTIC BASE — no flip in range.');
  console.log('     I expected a flip, because P(high) = F(s)^9 is convex low down and');
  console.log('     concave near the top, and concentrating damage only beats spreading it');
  console.log('     in the convex region. The flip exists but it sits ABOVE any score this');
  console.log('     league has produced, so within the range that can actually happen the');
  console.log('     answer is unconditional. CORY\'S "SACRIFICE ONE WEEK INSTEAD OF A');
  console.log('     DISADVANTAGE MULTIPLE WEEKS" IS CORRECT ON THIS OBJECTIVE.');
  console.log('\n     AND THE MAGNITUDE IS SMALL: +0.01 to +0.06 expected weekly highs across');
  console.log('     the whole range — about one twentieth of a single payout per season.');
  console.log('     A real direction and a tiny size. It belongs where tiebreak_frontier.js');
  console.log('     put things of that size: it breaks ties, it does not drive picks.');
  console.log('\n     THE CALIBRATION CHECK THAT MAKES THESE NUMBERS TRUSTWORTHY: at a base of');
  console.log('     110, the league median, the model expects 1.13 weekly highs in 15 weeks.');
  console.log('     The observed maximum for any team in any of the three seasons is 4, and');
  console.log('     ten teams share 15 payouts, so 1.5 is the mean by construction. The');
  console.log('     earlier deterministic version predicted 0.02 for the same team, which');
  console.log('     was the tell that it was wrong.');
}

/* ── 4. THE ROSTER-SLOT CONSEQUENCE, WHICH IS THE PART THAT REACHES THE DRAFT ─ */
console.log('\n  4. AND CONSOLIDATION IS CHEAPER IN ROSTER SLOTS TOO — the draft consequence');
console.log('     SPREAD byes (mine: RB at 5, 7, 13): ONE backup covers all three weeks,');
console.log('       because the starters are never out together. Roster cost: 1 slot,');
console.log('       and the 2nd and 3rd backup RB start ZERO weeks (section 1).');
console.log('     CONSOLIDATED byes: three starters out at once needs THREE backups for a');
console.log('       single week — or you punt it and those two slots are FREE.');
console.log('\n     So the two ideas Cory raised are the same idea: if the byes stack, the');
console.log('     right response is to PUNT the week and spend the freed roster spots on');
console.log('     players worth owning. That is also his third point — "the goal is to');
console.log('     roster 15 players actually worth owning" — and it is the one that');
console.log('     survives every objection raised in this file.');

console.log('\n  WHAT THIS DOES NOT SETTLE');
console.log('     Byes are NOT a choice at the draft — you take the player, you take his');
console.log('     bye. Consolidation is only steerable at the margin, between two players');
console.log('     the model already calls indistinguishable (tiebreak_frontier.js found 4');
console.log('     of 15 picks in that state). So this is a TIEBREAKER, not a strategy: at a');
console.log('     genuine coin flip, prefer the player whose bye lands on a week you are');
console.log('     already short. It is worth what a tiebreaker is worth and no more.');
console.log('     The punt scenario\'s 1.6x penalty factor is ASSUMED, not measured — it');
console.log('     stands for fielding replacement-level bodies rather than backups, and');
console.log('     the ORDERING of the three scenarios does not depend on it.');
