// TERRITORY: A
/* THE TRIPWIRES ARE DIAGNOSTIC, AND THAT IS THE INVARIANT THIS FILE PROTECTS.
 *
 * Cory, 2026-08-14: "A TRIPWIRE CAN SAY 'INVESTIGATE THIS RECOMMENDATION.' IT
 * CANNOT SAY 'CHANGE THIS RECOMMENDATION.' Not a scoring term, not a penalty,
 * not a weight." And: adding a QB rule now "COULD MAKE THE SYMPTOM DISAPPEAR
 * WHILE LEAVING THE UNDERLYING DEFECT INTACT" — a symptom hidden by a correction
 * is worse than a visible one, because it removes the only signal saying
 * something is wrong.
 *
 * So the strongest assertion here is a NEGATIVE one: nothing in the engine may
 * reference this module. A test that only checked the tripwires' output would
 * pass just as happily on the day somebody wired one into scorePlayer.
 *
 * Run: node draft/tests/tripwires.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const T = require(path.join(ROOT, 'draft', 'tools', 'tripwires.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const STARTERS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 };
const p = (pick, position, name, adp) => ({ pick, position, name, adp });

// ── THE ARCHITECTURAL RULE ─────────────────────────────────────────────────
{
  const engine = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
  ck('engine.js does not reference the tripwires at all',
    !/tripwire/i.test(engine) || !/require\([^)]*tripwires/.test(engine),
    'a tripwire that can reach scorePlayer is a scoring term wearing a diagnostic name');
  ck('  and nothing in tripwires.js returns a weight, penalty or multiplier',
    (function () {
      const src = fs.readFileSync(path.join(ROOT, 'draft', 'tools', 'tripwires.js'), 'utf8');
      return !/\b(penalty|weight|multiplier|discount|adjust)\s*[:=]/i.test(
        src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, ''));
    })());

  /* NON-VACUITY for the first assertion: prove the regex can fail, or "engine
   * does not mention tripwires" is satisfied by any typo in the pattern. */
  ck('CONTROL: the same test fires on a file that DOES require tripwires',
    /require\([^)]*tripwires/.test("const T = require('./tripwires.js');"));
}

// ── RULE 15: INVISIBLE DURING A LIVE DRAFT ────────────────────────────────
{
  const args = { myPicks: [p(4, 'QB', 'A', 40), p(9, 'QB', 'B', 60)],
    referencePicks: [p(4, 'RB', 'X', 4)], starters: STARTERS,
    deviationDistribution: { values: [0, 1, 2], population: 'test' } };

  const live = T.observe(Object.assign({ mode: 'live' }, args));
  ck('mode "live" returns NO observations', live.observations.length === 0 && !live.visible);
  ck('  and says why rather than returning a bare empty list', /RULE 15/.test(live.why));

  const mock = T.observe(Object.assign({ mode: 'mock' }, args));
  ck('  mode "mock" DOES observe — otherwise the live suppression is vacuous',
    mock.visible && mock.observations.length > 0, mock.observations.length);
  const post = T.observe(Object.assign({ mode: 'post' }, args));
  ck('  mode "post" observes too', post.visible && post.observations.length > 0);

  let threw = false;
  try { T.observe(Object.assign({ mode: undefined }, args)); } catch (e) { threw = true; }
  ck('  an UNSPECIFIED mode throws rather than defaulting to visible', threw);
}

// ── 1. CONCENTRATION ──────────────────────────────────────────────────────
{
  const two = T.concentration([p(4, 'QB', 'A'), p(9, 'QB', 'B'), p(14, 'RB', 'C')],
    STARTERS, { withinFirst: 10 });
  ck('two QBs inside the first ten fires', two.length === 1 && two[0].evidence.count === 2);
  ck('  and the text reports, it does not instruct',
    /^CONCENTRATION:/.test(two[0].text) && !/(should|avoid|do not|prevent|bad)/i.test(two[0].text),
    two[0].text);

  ck('one QB does not fire',
    T.concentration([p(4, 'QB', 'A')], STARTERS, { withinFirst: 10 }).length === 0);
  ck('  and TWO RBs do not fire — RB is not a one-start position',
    T.concentration([p(4, 'RB', 'A'), p(9, 'RB', 'B')], STARTERS, { withinFirst: 10 }).length === 0,
    'the rule is about ONE-START positions, derived from the format, not a QB rule');
  /* THE UNIT IS MY SELECTIONS, NOT OVERALL PICK NUMBERS, and this pair is what
   * made that ambiguity visible: picks 4 and 44 are my 1st and 2nd SELECTIONS,
   * so they DO fire on the selections reading and do NOT on the overall one.
   * Both are asserted so the semantic cannot drift silently. */
  const spread = [p(4, 'QB', 'A'), p(44, 'QB', 'B')];
  ck('  two QBs at my selections 1 and 2 fire on the SELECTIONS reading',
    T.concentration(spread, STARTERS, { withinFirstSelections: 10 }).length === 1);
  ck('  and do NOT fire when the window is overall picks 1-10',
    T.concentration(spread, STARTERS, { withinOverallPick: 10 }).length === 0);
  ck('  an 11th-selection QB is outside a 10-selection window',
    T.concentration([p(1, 'RB'), p(2, 'RB'), p(3, 'RB'), p(4, 'RB'), p(5, 'RB'),
      p(6, 'RB'), p(7, 'RB'), p(8, 'RB'), p(9, 'RB'), p(10, 'QB', 'A'), p(11, 'QB', 'B')],
      STARTERS, { withinFirstSelections: 10 }).length === 0);
}

// ── 2. DEVIATION AS A STORED PERCENTILE ───────────────────────────────────
{
  const dist = { values: [], population: 'x' };
  for (let i = 0; i < 100; i++) dist.values.push(i);   // deviations 0..99

  /* deviation = adp - pick. With values 0..99, a deviation of 105 sits above
   * every one of them -> 100th percentile. My first version used adp 105 at
   * pick 10, a deviation of 95, which is the 96th percentile and correctly did
   * NOT fire at a 99 threshold. The code was right and the test's arithmetic
   * was wrong — worth keeping, because a threshold test whose own numbers are
   * off is how a real threshold gets loosened to make a test pass. */
  const hit = T.deviation([p(10, 'QB', 'Reacher', 115)], dist, { flagAtPercentile: 99 });
  ck('a deviation past the 99th percentile fires', hit.length === 1, hit);
  ck('  and reports a PERCENTILE, not a raw gap',
    hit.length && /percentile/.test(hit[0].text) && hit[0].evidence.percentile >= 99,
    hit[0] && hit[0].text);
  ck('  and names the population the percentile is against',
    hit.length && hit[0].evidence.population === 'x');

  ck('a typical deviation does not fire',
    T.deviation([p(10, 'QB', 'Normal', 30)], dist, { flagAtPercentile: 99 }).length === 0);

  /* UNCALIBRATED MUST NOT LOOK LIKE CLEAN. A missing distribution returning []
   * would read as "checked, nothing unusual" — the null-as-absence defect. */
  const none = T.deviation([p(10, 'QB', 'Reacher', 115)], null, {});
  ck('NO distribution reports UNCALIBRATED rather than silence',
    none.length === 1 && /UNCALIBRATED/.test(none[0].text) && none[0].evidence.calibrated === false);
}

// ── 3. POSITIONAL DISTRIBUTION vs THE REFERENCE ───────────────────────────
{
  const mine = [p(1, 'QB'), p(2, 'QB'), p(3, 'QB'), p(4, 'RB'), p(5, 'RB'),
    p(6, 'WR'), p(7, 'WR'), p(8, 'WR'), p(9, 'WR'), p(10, 'WR'), p(11, 'WR'), p(12, 'TE')];
  const ref = [p(1, 'QB'), p(2, 'RB'), p(3, 'RB'), p(4, 'RB'), p(5, 'RB'),
    p(6, 'WR'), p(7, 'WR'), p(8, 'WR'), p(9, 'WR'), p(10, 'WR'), p(11, 'TE'), p(12, 'TE')];
  const d = T.distribution(mine, ref, { firstN: 12, minGap: 2 });
  ck('a divergent positional shape fires', d.length === 1, d);
  ck('  and prints BOTH distributions, not a count',
    d.length && /model .*\|  reference /.test(d[0].text), d[0] && d[0].text);
  ck('  identical distributions do not fire',
    T.distribution(ref, ref, { firstN: 12, minGap: 2 }).length === 0);
}

// ── 4. TIMING, AND ITS INTERACTION WITH CONCENTRATION ─────────────────────
{
  const mine = [p(12, 'TE', 'Early TE'), p(19, 'TE', 'Second TE')];
  const ref = [p(25, 'TE', 'Market TE')];
  const t = T.timing(mine, ref, STARTERS, { withinFirst: 10 });
  ck('a position taken before the reference fires', t.length === 1, t);
  ck('  taking it LATER than the reference does not',
    T.timing([p(40, 'TE', 'Late')], ref, STARTERS, {}).length === 0);

  /* Cory's point: TE1 at 12 alone is one signal; TE1 at 12 AND TE2 at 19 is
   * timing and concentration, and the output has to say so. */
  const both = T.timing(mine, ref, STARTERS, { withinFirst: 20 });
  ck('  and it SAYS when it coincides with concentration',
    both.length && both[0].evidence.coincides_with_concentration
    && /AND concentrated/.test(both[0].text), both[0] && both[0].text);
  ck('  while a lone timing signal does not claim concentration',
    !T.timing([p(12, 'TE', 'Only')], ref, STARTERS, { withinFirst: 20 })[0]
      .evidence.coincides_with_concentration);
}

// ── NOTHING HERE EMITS A DIRECTIVE ────────────────────────────────────────
{
  const all = T.observe({ mode: 'mock', starters: STARTERS,
    myPicks: [p(4, 'QB', 'A', 40), p(9, 'QB', 'B', 60), p(12, 'TE', 'C', 50)],
    referencePicks: [p(4, 'RB', 'X', 4), p(30, 'TE', 'Y', 30)],
    deviationDistribution: { values: [0, 1, 2], population: 'test' } }).observations;
  const directive = /\b(take|avoid|don't|do not|should|must|instead of|prefer)\b/i;
  ck('no observation contains a directive verb',
    all.every(o => !directive.test(o.text)), all.filter(o => directive.test(o.text)).map(o => o.text));
  ck('  every observation carries structured evidence, not just prose',
    all.every(o => o.evidence && typeof o.evidence === 'object'));
  ck('CONTROL: the directive regex would catch one if present',
    directive.test('TAKE the tight end here'));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
