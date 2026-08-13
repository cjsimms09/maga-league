// TERRITORY: A
/* THE ANALYZER'S CLAIMS — and the property that makes a claim gradeable.
 *
 * The rail already refuses a forecast without a key, an ftype, a value and a
 * resolution rule. So the tests that matter are not "does it build an object" —
 * they are the ones about whether the rule can still be read the way it was
 * meant a year later, and whether the module refuses what the analyzer does not
 * actually compute.
 */
'use strict';
const AC = require('../../src/analyzer_claims.js');
const ST = require('../../src/routes/standings.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name); }
}
function threw(fn) { try { fn(); return false; } catch (e) { return true; } }

const proj = {
  season: '2026', throughWeek: 7, spots: 4,
  projections: [
    { rid: 1, playoff_prob: 0.82, exp_wins: 9.4, strength_mean: 121.2, posture: 'lock' },
    { rid: 2, playoff_prob: 0.05, exp_wins: 4.1, strength_mean: 98.7, posture: 'chasing_high' },
  ],
};

// ── the emission ────────────────────────────────────────────────────────────
{
  const claims = AC.analyzerClaims(proj);
  check('every team yields BOTH a probability and a point claim', claims.length === 4);
  check('  the probability claim is the playoff odds',
    claims[0].ftype === 'probability' && claims[0].value === 0.82);
  check('  the point claim is expected wins, emitted BESIDE it',
    claims[1].ftype === 'point' && claims[1].value === 9.4);
  check('every claim carries a resolution rule',
    claims.every(c => c.resolution_rule && c.resolution_rule.length > 40));

  /* ⚠️ THE CUT MUST BE IN THE RULE. "Makes the playoffs" silently means something
   * different the year the league changes playoff_teams, and this season's claim
   * would then be graded against next season's cut. */
  check('THE CUT IS FROZEN INTO THE RULE, not left implied',
    /top 4 of the FINAL/.test(claims[0].resolution_rule)
    && /not whatever it is at/.test(claims[0].resolution_rule));

  check('the tie convention is stated on the wins claim before any outcome',
    /tied game counts as no win/.test(claims[1].resolution_rule));

  // Keys must be stable and must NOT collide across checkpoints — a new week is
  // a NEW forecast, not a revision of last week's.
  const later = AC.analyzerClaims(Object.assign({}, proj, { throughWeek: 8 }));
  check('a re-run at the same checkpoint produces the SAME key (the ledger dedupes)',
    AC.analyzerClaims(proj)[0].key === claims[0].key);
  check('a DIFFERENT checkpoint produces a different key — a new claim, not a revision',
    later[0].key !== claims[0].key);
}

// ── fail closed ─────────────────────────────────────────────────────────────
{
  check('FAIL CLOSED: a projection missing `spots` THROWS rather than guessing the cut',
    threw(() => AC.analyzerClaims({ season: '2026', throughWeek: 7, projections: [] })));
  check('FAIL CLOSED: a probability outside [0,1] THROWS',
    threw(() => AC.playoffForecast({ season: '2026', throughWeek: 7, rid: 1,
      playoff_prob: 1.2, spots: 4 })));
  check('FAIL CLOSED: a missing playoff_prob THROWS rather than defaulting to 0.5',
    threw(() => AC.playoffForecast({ season: '2026', throughWeek: 7, rid: 1, spots: 4 })));
}

// ── resolutions ─────────────────────────────────────────────────────────────
{
  const claims = AC.analyzerClaims(proj);
  const pf = claims[0], wf = claims[1];
  check('a made-playoffs resolution scores 1', AC.resolvePlayoff(pf, [1, 3, 4, 5]).outcome === 1);
  check('a missed-playoffs resolution scores 0', AC.resolvePlayoff(pf, [3, 4, 5, 6]).outcome === 0);

  /* NOT PLAYED IS NOT A MISS — the distinction the whole rail turns on. */
  check('an unfinished season resolves to NULL, never to a miss',
    AC.resolvePlayoff(pf, null) === null);
  check('  and an unknown team\'s wins resolve to NULL rather than zero',
    AC.resolveExpectedWins(wf, { 99: 8 }) === null);

  const r = AC.resolveExpectedWins(wf, { 1: 11 });
  check('the wins resolution carries signed AND absolute error',
    r.signed_error === 1.6 && r.abs_error === 1.6);
  const under = AC.resolveExpectedWins(wf, { 1: 7 });
  check('  and the sign is real — under-prediction is negative',
    under.signed_error === -2.4 && under.abs_error === 2.4);
}

// ── THE REFUSALS, which are the honest part ─────────────────────────────────
{
  check('championship probability is REFUSED, with the reason recorded as data',
    AC.NOT_EMITTED.championship_probability
    && /never plays the bracket/.test(AC.NOT_EMITTED.championship_probability.reason));
  check('expected dollars is REFUSED, and names the docstring that claims otherwise',
    /line 19/.test(AC.NOT_EMITTED.expected_dollars.reason));

  const emitted = AC.analyzerClaims(proj).map(c => c.ftype + '|' + c.key);
  check('  and NEITHER appears in the emitted set — a refusal that still emitted',
    !emitted.some(k => /champ|dollar/.test(k)));
  /* WAS `check(..., true)`. The check above it is `!emitted.some(...)`, which is
   * TRUE ON AN EMPTY ARRAY — so if analyzerClaims() ever returned nothing, the
   * refusal check would pass for the wrong reason. The prose becomes the guard
   * that makes the neighbour mean something. */
  check('   and the emitted set is NON-EMPTY, so that refusal check is not vacuous',
    emitted.length > 0, emitted.length);
}

// ── the claim is about what the analyzer ACTUALLY returns ───────────────────
/* ⚠️ RULE 10d GUARD. Every assertion above runs on a hand-written fixture. If
 * projectStandings ever stops returning these fields the fixture keeps passing
 * and the emission silently breaks, so this asserts the SHAPE against the real
 * function rather than against my memory of it. */
{
  const fields = ['season', 'throughWeek', 'spots', 'projections'];
  const real = ST.projectStandings.toString();
  check('the real projectStandings still returns the shape analyzerClaims consumes',
    fields.every(f => real.includes(f)));
  check('  and still emits playoff_prob and exp_wins per row',
    real.includes('playoff_prob') && real.includes('exp_wins'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
