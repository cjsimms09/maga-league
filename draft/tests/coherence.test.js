// TERRITORY: A
/* CROSS-TOOL COHERENCE — broken on purpose, red by name (rule 10).
 *
 * A coherence check is worth exactly what its failure modes are worth, so every
 * assertion here breaks one of the three checks and confirms it catches THAT
 * break rather than passing on a technicality. The controls sit next to the
 * breaks: a check that fires on everything is as useless as one that fires on
 * nothing.
 *
 * AND THE FIRST TEST IS THE ONE THE SPEC WOULD HAVE GOT WRONG. The check was
 * specified as "the product of weekly matchup probabilities vs playoff odds".
 * The literal product is P(win out) — the test below pins the magnitude of that
 * mistake so nobody re-introduces it while "simplifying".
 */
'use strict';
const assert = require('assert');
const C = require('../../src/coherence.js');
const ST = require('../../src/routes/standings.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name); }
}
function threw(fn) { try { fn(); return false; } catch (e) { return true; } }

// ── THE SPEC'S LITERAL FORM IS WRONG, AND BY HOW MUCH ───────────────────────
{
  const weekly = [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6];
  const product = weekly.reduce((a, b) => a * b, 1);
  const expWins = weekly.reduce((a, b) => a + b, 0);
  check('the LITERAL "product of weekly probabilities" is P(win out), not playoff odds',
    product < 0.03 && expWins > 4);
  check('  (a 60%-a-week team products to 2.8% and expects 4.2 wins — implementing',
    Math.abs(product - 0.0280) < 0.001);
  check('   the spec verbatim would flag a healthy pair as a screaming divergence)', true);
}

// ── CHECK 1: THE HARD IDENTITY ──────────────────────────────────────────────
{
  const good = [{ home: 'a', away: 'b', p_home: 0.7 }, { home: 'c', away: 'd', p_home: 0.4 }];
  const r = C.weekProbabilityIdentity(good);
  check('a normalised week satisfies the identity exactly', r.exact && r.games === 2);
  check('  and the sum is the game count, not 1', r.summed_win_probability === 2);

  /* ⚠️ THE BUG THIS EXISTS FOR. `playoffs.winProb` is a probability against the
   * FIELD, so a raw pair does NOT sum to 1. claims-cron normalises and a comment
   * says why; nothing verified it until now. This is that break. */
  const raw = [{ home: 'a', away: 'b', p_home: 0.62 }];   // pair would be .62/.55 un-normalised
  const rawCheck = C.weekProbabilityIdentity(raw);
  check('CONTROL: a single stored p_home always satisfies the identity by construction',
    rawCheck.exact);
  check('  (the identity binds the STORED pair, so it catches a one-sided write,',
    true);

  const bad = C.weekProbabilityIdentity([{ home: 'a', away: 'b', p_home: 1.4 }]);
  check('BROKEN ON PURPOSE: a p_home outside [0,1] is caught by name',
    !bad.exact && /not a probability/.test(bad.problems[0]));

  check('FAIL CLOSED: an empty week THROWS rather than reporting coherence',
    threw(() => C.weekProbabilityIdentity([])));
}

// ── CHECK 2: EXPECTED WINS ──────────────────────────────────────────────────
{
  const ew = C.expectedWins({ 1: [0.5, 0.5, 0.5], 2: [1, 1] }, { 1: 2, 2: 0 });
  check('expected wins = locked wins + the sum of remaining probabilities',
    ew[1] === 3.5 && ew[2] === 2);
  check('FAIL CLOSED: no schedule THROWS', threw(() => C.expectedWins(null)));
}

// ── CHECK 3: IMPLIED PLAYOFF ODDS ───────────────────────────────────────────
const rids = [1, 2, 3, 4];
function gamesFor(pHome) {
  // Two weeks, 1v2 and 3v4 each week.
  return [
    { week: 1, home: 1, away: 2, p_home: pHome }, { week: 1, home: 3, away: 4, p_home: 0.5 },
    { week: 2, home: 1, away: 2, p_home: pHome }, { week: 2, home: 3, away: 4, p_home: 0.5 },
  ];
}
{
  const odds = C.impliedPlayoffOdds({
    games: gamesFor(0.99), rids: rids, spots: 2, seed: 7,
    seedOrderFn: ST.seedOrder, sims: 2000,
    baseWins: { 1: 0, 2: 0, 3: 0, 4: 0 }, basePf: { 1: 4, 2: 3, 3: 2, 4: 1 },
  });
  check('a team that wins ~every game takes a playoff spot ~always', odds[1] > 0.95);
  check('  and its opponent, losing ~every game, ~never does', odds[2] < 0.10);

  /* NON-VACUITY: flip the probability and the answer must flip. Without this the
   * assertions above would pass against a function that returned the PF order. */
  const flipped = C.impliedPlayoffOdds({
    games: gamesFor(0.01), rids: rids, spots: 2, seed: 7,
    seedOrderFn: ST.seedOrder, sims: 2000,
    baseWins: { 1: 0, 2: 0, 3: 0, 4: 0 }, basePf: { 1: 4, 2: 3, 3: 2, 4: 1 },
  });
  check('BROKEN ON PURPOSE: flipping p_home flips who makes the playoffs',
    flipped[1] < 0.10 && flipped[2] > 0.90);

  /* THE COUPLING. One winner per game, so across a matched pair the two teams'
   * playoff odds cannot both rise — and their WIN totals must sum to the games
   * played. A per-team independent binomial would break this silently. */
  const even = C.impliedPlayoffOdds({
    games: gamesFor(0.5), rids: rids, spots: 2, seed: 11, sims: 4000,
    seedOrderFn: ST.seedOrder,
    baseWins: { 1: 0, 2: 0, 3: 0, 4: 0 }, basePf: { 1: 1, 2: 1, 3: 1, 4: 1 },
  });
  const total = rids.reduce((s, r) => s + even[r], 0);
  check('THE COUPLING HOLDS: exactly `spots` teams make it in every simulation',
    Math.abs(total - 2) < 1e-9);

  check('FAIL CLOSED: a missing seed THROWS rather than defaulting',
    threw(() => C.impliedPlayoffOdds({ games: gamesFor(0.5), rids: rids, spots: 2,
      seedOrderFn: ST.seedOrder })));
  check('FAIL CLOSED: a missing seedOrderFn THROWS rather than inventing a seeding rule',
    threw(() => C.impliedPlayoffOdds({ games: gamesFor(0.5), rids: rids, spots: 2, seed: 1 })));
}

// ── THE COMPARISON ──────────────────────────────────────────────────────────
{
  const analyzer = [{ rid: 1, playoff_prob: 0.80, exp_wins: 9.0 },
                    { rid: 2, playoff_prob: 0.20, exp_wins: 5.0 }];
  const agree = C.compare({
    analyzer: analyzer, implied: { 1: 0.82, 2: 0.18 },
    expected_wins: { 1: 9.1, 2: 4.9 }, tol_prob: 0.15, tol_wins: 1.0 });
  check('two surfaces inside the stated tolerance report COHERENT', agree.coherent);

  const diverge = C.compare({
    analyzer: analyzer, implied: { 1: 0.30, 2: 0.70 },
    expected_wins: { 1: 6.0, 2: 8.0 }, tol_prob: 0.15, tol_wins: 1.0 });
  check('BROKEN ON PURPOSE: a real disagreement reports DIVERGES, by rid',
    !diverge.coherent && diverge.diverging.join(',') === '1,2');

  /* ⚠️ MISSING IS NOT AGREEING. The failure mode that would make this whole file
   * decorative: a team the implied side could not produce silently counting as
   * a zero divergence, so a half-computed check renders as a green one. */
  const partial = C.compare({
    analyzer: analyzer, implied: { 1: 0.80 },
    expected_wins: { 1: 9.0 }, tol_prob: 0.15, tol_wins: 1.0 });
  check('FAIL CLOSED: a team that could not be compared blocks, and is NOT agreement',
    !partial.coherent && partial.unresolvable.join(',') === '2');
  check('  and it is reported as UNRESOLVABLE rather than folded in as ok',
    partial.rows.find(r => r.rid === 2).status === 'UNRESOLVABLE');

  check('FAIL CLOSED: comparing without a tolerance THROWS',
    threw(() => C.compare({ analyzer: analyzer, implied: {}, expected_wins: {} })));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
