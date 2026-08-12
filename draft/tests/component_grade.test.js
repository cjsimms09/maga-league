// TERRITORY: A
/* COMPONENT-LEVEL GRADING — and the distinction the whole surface exists for.
 *
 * "No difference detected" and "we cannot detect a difference" look identical in
 * every report this project produces. This makes the difference STRUCTURAL: a
 * null is only ever `noise` when the design could have seen a material effect,
 * and `too_thin` otherwise.
 *
 * AND THE INDEPENDENT UNIT IS THE WEEK. Measured today: treating correlated
 * observations as independent runs the false-positive rate 4.7% -> 11.1% as
 * within-week correlation rises, while aggregating to the week stays calibrated.
 * Player-weeks share a slate exactly the same way, so every statistic is
 * computed on cluster means and n_clusters is reported beside n_obs.
 *
 * Run: node draft/tests/component_grade.test.js
 */
'use strict';
const path = require('path');
const G = require(path.join(__dirname, '..', '..', 'src', 'component_grade.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };
const threw = f => { try { f(); return null; } catch (e) { return e.message; } };

/* Every call needs one. Stated once here so the suite reads like a caller. */
const IMP = {
  earning: 'keep the term and lean on it harder in close calls',
  hurting: 'zero the term, the way MEASURED_WEIGHTS already zeroed four',
  noise: 'stop paying attention to it — it is not moving outcomes at a size worth acting on',
};
const g = o => G.gradeComponent(Object.assign({ implication: IMP }, o));

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function build(weeks, per, errA, errB) {
  const pairs = [], base = [];
  for (let w = 1; w <= weeks; w++) {
    for (let i = 0; i < per; i++) {
      const real = 12 + (rnd() * 17 - 8);
      pairs.push({ predicted: real + (rnd() - 0.5) * errA, realized: real, cluster: w });
      base.push({ predicted: real + (rnd() - 0.5) * errB });
    }
  }
  return { pairs, base };
}

// ── THE THREE VERDICTS, AND THE THIRD IS THE POINT ─────────────────────────
{
  const big = build(14, 90, 6, 12);           // a large, real improvement
  const r = g({ name: 'x', pairs: big.pairs, baseline: big.base, material: 0.2 });
  ck('a real, material improvement reads EARNING', r.verdict === 'earning', r);

  const none = build(14, 90, 8, 8);           // identical error: no skill
  const r2 = g({ name: 'x', pairs: none.pairs, baseline: none.base, material: 0.5 });
  ck('a genuine null with power reads NOISE, not "no effect"', r2.verdict === 'noise', r2);
  ck('  and it SAYS the design could have seen one',
    /COULD have detected/.test(r2.why), r2.why);

  const thin = build(2, 3, 8, 8);             // two weeks, three players
  const r3 = g({ name: 'x', pairs: thin.pairs, baseline: thin.base, material: 0.05 });
  ck('the SAME null on a thin sample reads TOO_THIN, not noise', r3.verdict === 'too_thin', r3);
  ck('  which is the distinction the surface exists to make',
    r2.verdict !== r3.verdict);
}

// ── THE WEEK IS THE UNIT ───────────────────────────────────────────────────
{
  const d = build(14, 90, 8, 8);
  const r = g({ name: 'x', pairs: d.pairs, baseline: d.base, material: 0.5 });
  ck('n_obs and n_clusters are BOTH reported', r.n_obs === 1260 && r.n_clusters === 14, r);
  /* THE CLAIM I FIRST WROTE HERE WAS FALSE, and it was the one I expected.
   * "Clustering gives a larger floor than iid" is NOT a general property — it
   * held 0.9x on independent data, because when observations within a week are
   * independent, the mean of 90 of them has sd/sqrt(90) and the two floors
   * COINCIDE. That is correct behaviour, not a bug.
   *
   * Clustering gives the RIGHT floor: equal to iid when there is no
   * within-week correlation, LARGER when there is. So the property is tested
   * where it exists — against data carrying a shared weekly shock, which is
   * what a real slate does. */
  const flat = d.pairs.map(p => Object.assign({}, p, { cluster: null }));
  const rIid = g({ name: 'x', pairs: flat, baseline: d.base, material: 0.5 });
  ck('  with INDEPENDENT rows, clustered and iid floors agree',
    Math.abs(r.mde - rIid.mde) / rIid.mde < 0.35,
    { clustered: r.mde, iid: rIid.mde });

  // Now with a shared weekly shock — every row in a week pushed the same way.
  const corr = [], corrBase = [];
  for (let w = 1; w <= 14; w++) {
    const shock = (rnd() - 0.5) * 14;              // the slate
    for (let i = 0; i < 90; i++) {
      const real = 12 + (rnd() * 17 - 8);
      corr.push({ predicted: real + shock, realized: real, cluster: w });
      corrBase.push({ predicted: real });
    }
  }
  const rC = g({ name: 'x', pairs: corr, baseline: corrBase, material: 0.5 });
  const rCiid = g({ name: 'x',
    pairs: corr.map(p => Object.assign({}, p, { cluster: null })),
    baseline: corrBase, material: 0.5 });
  ck('  with a SHARED WEEKLY SHOCK, the clustered floor is far larger than iid',
    rC.mde > rCiid.mde * 3,
    { clustered: rC.mde, iid: rCiid.mde, ratio: (rC.mde / rCiid.mde).toFixed(1) });
  ck('  which is the false precision that turns correlated rows into findings',
    rC.n_clusters === 14 && rC.n_obs === 1260);
}

// ── NO INVENTED THRESHOLD ──────────────────────────────────────────────────
{
  const d = build(4, 10, 8, 8);
  const msg = threw(() => g({ name: 'x', pairs: d.pairs }));
  ck('a missing materiality bar throws', !!msg, msg);
  ck('  and says why an invented one decides the verdict by accident',
    /decided by an invented threshold/.test(msg || ''), msg);
}

// ── EVERY ROW THAT RESOLVES CARRIES WHAT IT WOULD CHANGE ───────────────────
{
  const d = build(4, 10, 8, 8);
  const msg = threw(() => G.gradeComponent({ name: 'x', pairs: d.pairs, material: 0.5 }));
  ck('a component with no behavioural implication throws', !!msg, msg);
  ck('  and says a finding nobody can act on is a number, not a finding',
    /not a finding/.test(msg || ''), msg);

  // ALL THREE BRANCHES, BEFORE THE VERDICT IS KNOWN. Supplying only the one
  // that ends up firing is the same defect `resolution_rule` prevents on the
  // forecast rail: a consequence written after the outcome is a rationalisation
  // and reads exactly like a prediction.
  const partial = threw(() => G.gradeComponent({ name: 'x', pairs: d.pairs, material: 0.5,
    implication: { earning: 'keep it' } }));
  ck('  a flattering branch alone is refused', !!partial, partial);
  ck('  and the missing branches are NAMED',
    /hurting/.test(partial || '') && /noise/.test(partial || ''), partial);

  const big = build(14, 90, 6, 12);
  const r = g({ name: 'x', pairs: big.pairs, baseline: big.base, material: 0.2 });
  ck('an EARNING row carries the earning line', r.verdict === 'earning'
    && r.implication === IMP.earning, r.implication);
  const none = build(14, 90, 8, 8);
  const rn = g({ name: 'x', pairs: none.pairs, baseline: none.base, material: 0.5 });
  ck('  a NOISE row carries the noise line, which is the one that changes behaviour',
    rn.verdict === 'noise' && rn.implication === IMP.noise, rn.implication);

  // AND THE UNINFORMATIVE ROWS CARRY NOTHING. A design that could not have seen
  // the effect implies nothing about how to draft; a "what to do" line beside
  // it is how an underpowered null turns into a decision.
  const thin = build(2, 3, 8, 8);
  const rt = g({ name: 'x', pairs: thin.pairs, baseline: thin.base, material: 0.05 });
  ck('a TOO_THIN row carries NO implication', rt.verdict === 'too_thin'
    && rt.implication === null, rt);
  ck('  and says why, rather than leaving the field blank',
    /constrains nothing/.test(rt.implication_why || ''), rt.implication_why);
  const rz = g({ name: 'empty', pairs: [], material: 1 });
  ck('  same for no_data', rz.implication === null, rz);
}

// ── A COMPONENT WITH NO BASELINE MEASURES A WEAKER THING, AND SAYS SO ──────
{
  const d = build(14, 90, 8, 8);
  const r = g({ name: 'x', pairs: d.pairs, material: 0.5 });
  ck('without a baseline the effect is labelled BIAS, not skill',
    r.effect_is === 'bias', r.effect_is);
  ck('  because grading against nothing measures error, not whether it earns its place',
    r.effect_is !== 'mae_improvement_vs_baseline');
}

// ── DEGENERATE INPUT ───────────────────────────────────────────────────────
{
  const r = g({ name: 'empty', pairs: [], material: 1 });
  ck('nothing resolved yet reads no_data, never a verdict', r.verdict === 'no_data', r);
}

// ── THE CLAMP IS A DISTRIBUTIONAL QUESTION, ANSWERABLE WITHOUT OUTCOMES ────
{
  const fs = require('fs');
  const p = path.join(__dirname, '..', '..', 'public', 'draft_data.json');
  if (fs.existsSync(p)) {
    const art = JSON.parse(fs.readFileSync(p, 'utf8'));
    const uni = (art.players || []).concat(art.kept_players || []);
    const c = G.clampReport(uni, 0.15);
    ck('the clamp report counts how many players sit ON the cap', c.at_cap > 0, c);
    ck('  and reports it as a SHARE, because a cap that binds broadly is not a cap',
      c.share_at_cap != null && c.share_at_cap < 0.5, c);
    console.log('        live board: ' + c.at_cap + '/' + c.n + ' at the ±0.15 cap ('
      + (c.share_at_cap * 100).toFixed(1) + '%), ' + c.at_upper + ' upper / ' + c.at_lower + ' lower');
  } else {
    console.log('SKIP  no built board');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
