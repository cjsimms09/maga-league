// TERRITORY: A
/* THE SPECS ARE COMPLETE AND USABLE BEFORE ANY DATA ARRIVES.
 *
 * The whole value of declaring materiality bars and behavioural implications in
 * advance is lost if a row turns out to be missing one at grading time and gets
 * filled in then. So the specs are checked for completeness NOW, while every row
 * is empty and nobody has an interest in the answer.
 *
 * Run: node draft/tests/component_specs.test.js
 */
'use strict';
const path = require('path');
const S = require(path.join(__dirname, '..', '..', 'src', 'component_specs.js'));
const G = require(path.join(__dirname, '..', '..', 'src', 'component_grade.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };
const threw = f => { try { f(); return null; } catch (e) { return e.message; } };

const NAMES = Object.keys(S.SPECS);

// ── EVERY ROW IS COMPLETE ──────────────────────────────────────────────────
{
  ck('the named components all have specs',
    NAMES.length >= 6 && NAMES.indexOf('survival') >= 0, NAMES);
  const bad = NAMES.filter(n => {
    const s = S.SPECS[n];
    return !(s.claim && s.material > 0 && s.baseline && s.cluster_is
      && s.implication && s.implication.earning && s.implication.hurting
      && s.implication.noise && s.resolves_from);
  });
  ck('  and every one is complete — claim, bar, baseline, cluster, three implications',
    bad.length === 0, bad);
}

// ── A SPEC DRIVES THE GRADER DIRECTLY ──────────────────────────────────────
{
  const spec = S.specFor('survival');
  const r = G.gradeComponent(Object.assign({ pairs: [] }, spec));
  ck('a spec is exactly what gradeComponent needs — no extra argument at grade time',
    r.verdict === 'no_data', r);
  const msg = threw(() => S.specFor('made_up'));
  ck('  and an undeclared component REFUSES rather than being graded on the fly',
    /no spec for/.test(msg || ''), msg);
  ck('  saying why a bar chosen after the numbers is the failure',
    /chosen after the numbers are in/.test(msg || ''), msg);
}

// ── THE CLUSTER UNIT IS NOT ASSUMED ────────────────────────────────────────
{
  /* SURVIVAL DOES NOT CLUSTER BY WEEK, and this is the row where getting it
   * wrong would do the most damage. A run on running backs moves every survival
   * forecast in that window together, so the independent unit is the DRAFT.
   * Clustering by player-forecast would report thousands of independent
   * observations and a floor several times too small — on the component that
   * external replay is about to hand us the most data for. */
  ck('survival clusters by DRAFT, not by week or by forecast',
    S.SPECS.survival.cluster_is === 'draft', S.SPECS.survival.cluster_is);
  const inSeason = NAMES.filter(n => n !== 'survival');
  ck('  every in-season row clusters by week',
    inSeason.every(n => S.SPECS[n].cluster_is === 'week'),
    inSeason.filter(n => S.SPECS[n].cluster_is !== 'week'));
  ck('  and survival resolves from the draft itself — no outcomes, no January',
    /later picks|subsequent picks/.test(S.SPECS.survival.resolves_from),
    S.SPECS.survival.resolves_from);
}

// ── THE COMPOSITION MECHANISM IS NAMED IN THE ROW, NOT ONLY IN A DOC ───────
{
  /* The point Cory asked to be made explicit: VONA is computed FROM survival,
   * so calibrating survival moves a strategy-level quantity without any
   * strategy comparison running. If that only lives in an audit file it will be
   * lost; it belongs on the row that would trigger it. */
  ck('survival\'s EARNING implication names what it firms up downstream',
    /VONA/.test(S.SPECS.survival.implication.earning),
    S.SPECS.survival.implication.earning);
  ck('  and its HURTING implication carries the same dependency the other way',
    /VONA/.test(S.SPECS.survival.implication.hurting));
}

// ── THE IMPLICATIONS ARE BEHAVIOURAL, NOT RESTATEMENTS ─────────────────────
{
  /* "The term is not earning" is a verdict, not an implication. A row that only
   * restates its own verdict has skipped the step this file exists for. Every
   * implication must contain an instruction about drafting or lineups. */
  // The list is deliberately explicit rather than clever. It caught three
  // specs that described a STATE ("the ordering can be trusted") instead of
  // an action, which is exactly the step this file exists to force. It also
  // missed `set`, and that is a gap in the GUARD rather than in the spec —
  // recorded here because loosening a guard to make a test pass is the wrong
  // move unless the guard is genuinely wrong, and this one was.
  const VERBS = /\b(take|draft|trust|stop|remove|keep|lean|anchor|fall back|use|treat|revisit|change|assume|do not act|widen|set|chase|protect)\b/i;
  const weak = [];
  NAMES.forEach(n => {
    ['earning', 'hurting', 'noise'].forEach(k => {
      if (!VERBS.test(S.SPECS[n].implication[k])) weak.push(n + '.' + k);
    });
  });
  ck('every implication tells me to DO something, rather than restating the verdict',
    weak.length === 0, weak);
}

// ── THE POSITION SPLIT IS DECLARED WHERE IT MATTERS ────────────────────────
{
  /* The two sources already disagree ~20% at WR and TE and ~2% at QB and RB. A
   * pooled projection row would average that away and report a clean null. */
  ck('projection and consensus are graded BY POSITION, not just pooled',
    S.SPECS.projection.split_by === 'position' && S.SPECS.consensus.split_by === 'position');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
