// TERRITORY: A
// THE RATIO COMPARED A ONE-WEEK SPIKE TO A SEASON AVERAGE.
//
// `wireVsStarter()` answers the question every hold-or-stream decision rests on:
// how good is the free man at this position, against the last starter? It was
// computing
//
//     median score in the week a player was CLAIMED
//     ────────────────────────────────────────────
//     last starter's SEASON-AVERAGE week
//
// The numerator is selection on the outcome — a manager spends a waiver claim on
// the man who just blew up — and `wire_level.js` carries that caveat in its own
// artifact. The denominator is an average over every week, good and bad. Those
// are not like things, and the quotient is not a ratio.
//
//      quoted        corrected
//   QB   103%   ->    88%
//   RB    70%   ->    50%
//   WR    88%   ->    58%
//   TE   115%   ->    66%
//
// THE TE FIGURE IS THE ONE THAT DID DAMAGE. "The TE wire is BETTER than a
// starter" is what justified streaming a tight end instead of rostering a
// backup, and it is false: over the three weeks you would actually hold a wire
// add, a TE delivers two thirds of a starter. NO position's wire is
// starter-quality. Four tools print this number, including `draft_card.js`,
// which is read at the table.
//
// ── WHY `ongoing` IS THE MATCHING QUANTITY, AND NOT BY TASTE ───────────────
//
// C measured E[weeks out | injured]: QB 3.28, TE 2.44 weeks. `ongoingLevels()`
// is the median over the three weeks AFTER acquisition. The window you need
// cover for and the window that was measured are the same window.
//
// ── AND THE STARTER LINE DIVIDED EVERYTHING BY A HARDCODED 15 ──────────────
//
// `games_expected` is on the board per position and per player. Fifteen is a
// constant standing in for data one field away.
//
// Run: node draft/tests/wire_vs_starter.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PLAN = require(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'));
const WL = require(path.join(ROOT, 'draft', 'tools', 'wire_level.js')).levels();
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};
const VS = PLAN.wireVsStarter();
const POS = ['QB', 'RB', 'WR', 'TE'];

// ── 1. THE HOLD RATIO USES THE HOLD NUMBER ──────────────────────────────
{
  ck('every position reports a ratio', POS.every(p => VS[p] && VS[p].pct != null),
    POS.filter(p => !VS[p] || VS[p].pct == null));
  ck('the headline `wire` is the ONGOING level, not the claim-week spike',
    POS.every(p => Math.abs(VS[p].wire - WL.ongoing.per_week[p]) < 1e-9),
    POS.map(p => [p, VS[p].wire, WL.ongoing.per_week[p]]));
  ck('and it SAYS which basis it used, so a reader never has to infer it',
    POS.every(p => /^ongoing-3wk$/.test(VS[p].basis)), POS.map(p => VS[p].basis));
  ck('the claim-week spike is still published, named — it is the right number '
    + 'for a ONE-WEEK bye patch and only wrong as a hold ratio',
  POS.every(p => Math.abs(VS[p].claim_week - WL.per_week[p]) < 1e-9));
  ck('CONTROL — the two really do differ, or this whole file is about nothing',
    POS.every(p => VS[p].claim_week > VS[p].wire),
    POS.map(p => [p, VS[p].claim_week, VS[p].wire]));
  ck('the sample size reported belongs to the level reported — quoting an n '
    + 'from the other measure is how a number gets trusted for the wrong reason',
  POS.every(p => VS[p].n === WL.ongoing.n[p]), POS.map(p => [p, VS[p].n, WL.ongoing.n[p]]));
}

// ── 2. THE FINDING, ASSERTED ────────────────────────────────────────────
// Not the exact percentages — those move with the board. The CLAIM.
{
  ck('NO position\'s wire is starter-quality — the sentence that was false and '
    + 'drove the streaming argument', POS.every(p => VS[p].pct < 100),
  POS.map(p => [p, Math.round(VS[p].pct)]));
  ck('FAIL ARM — under the OLD claim-week basis at least one position reads '
    + 'above 100%, which is the defect reproduced rather than remembered',
  POS.some(p => VS[p].claim_week_pct >= 100),
  POS.map(p => [p, Math.round(VS[p].claim_week_pct)]));
  ck('and TE specifically flips from above-starter to below — the number that '
    + 'justified not rostering a backup tight end',
    VS.TE.claim_week_pct > 100 && VS.TE.pct < 100,
    { claim: Math.round(VS.TE.claim_week_pct), hold: Math.round(VS.TE.pct) });
  ck('RB remains the hardest hole to fill off the wire, which was true before '
    + 'and is more true now — the ordering survives the correction',
    POS.every(p => p === 'RB' || VS.RB.pct <= VS[p].pct),
    POS.map(p => [p, Math.round(VS[p].pct)]));
}

// ── 3. THE STARTER LINE USES REAL GAMES, NOT 15 ─────────────────────────
{
  const src = fs.readFileSync(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'), 'utf8');
  const fn = src.slice(src.indexOf('function wireVsStarter()'));
  ck('the hardcoded /15 is gone from the starter line',
    !/proj_mean\s*\/\s*15\b/.test(fn.slice(0, 3000)));
  ck('and it reads the player\'s OWN games_expected first',
    /games_expected/.test(fn.slice(0, 3000)));
  /* THE DIRECTION MATTERS: RB's games_expected is 14.2, so dividing by 15
   * understated the RB starter line by ~5.6% — flattering the wire at exactly
   * the position where the wire is worst. */
  const EXP = { QB: 15.5, RB: 14.2, WR: 15.0, TE: 14.8 };
  POS.forEach(p => {
    const s = PLAN.pool.filter(x => x.position === p && Number.isFinite(+x.proj_mean))
      .map(x => +x.proj_mean / EXP[p]).sort((a, b) => b - a);
    const want = s[VS[p].slots - 1];
    ck('the ' + p + ' starter line matches a per-position games divisor',
      Math.abs(VS[p].starter - want) < 0.35, { got: VS[p].starter, want: want });
  });
}

// ── 4. IT STILL REFUSES RATHER THAN GUESSING ────────────────────────────
// The original guard is the reason this function is trustworthy at all: without
// league.starters the "starter line" is invented, and it feeds the whole
// hold-or-stream argument.
{
  const src = fs.readFileSync(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'), 'utf8');
  ck('a missing roster shape still throws instead of assuming one',
    /REFUSING\s*\+?\s*'?\s*to assume a roster shape/.test(src)
      || /REFUSING/.test(src.slice(src.indexOf('function wireVsStarter()'), src.indexOf('function wireVsStarter()') + 900)));
  ck('the flex is still SPLIT rather than counted into both RB and WR',
    /flexShare = \{ RB: 0\.5, WR: 0\.5, TE: 0 \}/.test(src));
  ck('slots are still derived from the league, not hardcoded',
    POS.every(p => VS[p].slots > 0 && VS[p].slots <= 30), POS.map(p => [p, VS[p].slots]));
}

// ── 5. THE FOUR CONSUMERS STILL GET WHAT THEY READ ──────────────────────
// draft_card, free_picks (x2) and scoring_edge read `.pct`, `.wire` and
// `.slots`. A correction that silently changed the shape would break the card
// Cory reads at the table.
{
  ['pct', 'wire', 'slots', 'starter', 'n'].forEach(f => {
    ck('every position still carries `' + f + '`, which the four consumers read',
      POS.every(p => VS[p][f] != null), POS.filter(p => VS[p][f] == null));
  });
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the hold-or-stream ratio divides two quantities measured');
console.log('over the same window, the claim-week spike is still available under its own');
console.log('name, the starter line uses each position\'s real games, and the corrected');
console.log('finding — no wire is starter-quality — is asserted as a claim rather than as');
console.log('four percentages that would drift with the board.');
console.log('WHAT IT DOES NOT: change any pick. wireVsStarter is read by the reporting tools,');
console.log('not by the seat solver, so the plan is byte-identical. What changed is that the');
console.log('numbers printed beside it are now true.');
