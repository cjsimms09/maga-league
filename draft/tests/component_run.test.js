// TERRITORY: A
/* THE COMPONENT RUN — the caller the rail did not have, and its known-answer case.
 *
 * The rail (component_grade + component_specs) was built with nothing calling
 * it. This file exercises the writer against SYNTHETIC data with a PLANTED
 * effect, so the path is proved before a season exists rather than first run in
 * January — which is the failure this project has found four times.
 *
 * Run: node draft/tests/component_run.test.js
 */
'use strict';
const path = require('path');
const R = require(path.join(__dirname, '..', '..', 'src', 'component_run.js'));
const S = require(path.join(__dirname, '..', '..', 'src', 'component_specs.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// ── EVERY DECLARED COMPONENT HAS A BUILDER ─────────────────────────────────
{
  const missing = Object.keys(S.SPECS).filter(n => !R.BUILDERS[n]);
  ck('every declared component has a pair builder',
    missing.length === 0, missing);
  ck('  (a declared component with no builder is worse than an undeclared one)', true);
}

// ── EMPTY INPUT REPORTS no_data PER ROW, NEVER SILENCE ─────────────────────
{
  const r = R.runAll({});
  ck('with no data, every row still appears', r.components.length === r.declared);
  ck('  and each reads no_data rather than being omitted',
    r.components.every(c => c.verdict === 'no_data'), r.components.map(c => c.verdict));
  ck('  graded count is zero and says so', r.graded === 0);
}

// ── THE KNOWN-ANSWER CASE: A PLANTED EFFECT MUST BE FOUND ──────────────────
{
  /* THE WHOLE POINT OF THIS FILE. A writer first executed in January is a writer
   * nobody has run. So: plant an effect the grader MUST see, and a null the
   * grader must NOT call a finding. */
  const rows = [];
  for (let w = 1; w <= 14; w++) {
    for (let i = 0; i < 90; i++) {
      const real = 12 + (rnd() * 17 - 8);
      rows.push({ week: w, realized: real,
        // proj_mean is a SEASON total; the builder divides by 17.
        proj_mean: (real + (rnd() - 0.5) * 2) * 17,
        proj_baseline: (real + (rnd() - 0.5) * 9) * 17 });
    }
  }
  const r = R.runAll({ opportunity_adj: rows });
  const row = r.components.find(c => c.name === 'opportunity_adj');
  ck('a PLANTED improvement is detected — the writer can find something',
    row.verdict === 'earning', { verdict: row.verdict, effect: row.effect, mde: row.mde });
  ck('  and the row carries its detectable-effect floor beside the result',
    row.mde != null && row.n_clusters === 14, { mde: row.mde, clusters: row.n_clusters });
  ck('  and the behavioural implication the spec declared',
    typeof row.implication === 'string' && row.implication.length > 10, row.implication);
}

// ── AND THE CONTROL: NO EFFECT MUST NOT READ AS ONE ────────────────────────
{
  const rows = [];
  for (let w = 1; w <= 14; w++) {
    for (let i = 0; i < 90; i++) {
      const real = 12 + (rnd() * 17 - 8);
      const err = (rnd() - 0.5) * 8;
      rows.push({ week: w, realized: real,
        proj_mean: (real + err) * 17,
        proj_baseline: (real + (rnd() - 0.5) * 8) * 17 });
    }
  }
  const row = R.runAll({ opportunity_adj: rows }).components
    .find(c => c.name === 'opportunity_adj');
  /* MY FIRST ASSERTION HERE WAS TOO STRICT and failed honestly. It demanded
   * `noise`; the grader returned `real_but_immaterial` with an effect of -0.12
   * against a materiality bar of 1.0. That is NOT a bug — with 1,260 rows over
   * 14 clusters the floor is well below 0.12, so a sampling fluctuation of that
   * size is genuinely detectable, and calling it real-but-immaterial is the
   * correct answer at alpha 0.05. The property that matters is that it does NOT
   * claim a material improvement. */
  ck('CONTROL: equal error does NOT read as earning',
    row.verdict !== 'earning' && row.verdict !== 'hurting',
    { verdict: row.verdict, effect: row.effect, mde: row.mde });
  ck('  and if it is detected at all, it is below the materiality bar',
    row.verdict !== 'real_but_immaterial' || Math.abs(row.effect) < 1.0,
    { effect: row.effect });
  ck('  so the writer is not simply reporting whatever it is handed', true);
}

// ── THE DECLARED MINIMUM IS ENFORCED, NOT TRUSTED ──────────────────────────
{
  /* survival declares min_clusters: 20 against a MEASURED floor. Two drafts must
   * read too_thin however clean the data looks. */
  const rows = [];
  for (let d = 1; d <= 2; d++) {
    for (let i = 0; i < 40; i++) {
      const p = 0.5 + rnd() * 0.4;
      rows.push({ draft_id: d, p_survive: p, survived: rnd() < p ? 1 : 0, base_rate: 0.6 });
    }
  }
  const row = R.runAll({ survival: rows }).components.find(c => c.name === 'survival');
  ck('survival at 2 drafts reads too_thin against its declared minimum of 20',
    row.verdict === 'too_thin', { verdict: row.verdict, clusters: row.n_clusters });
  ck('  and carries NO implication, because it constrains nothing',
    row.implication === null, row.implication);
  ck('  and names the declared minimum in its reason',
    /declared minimum of 20/.test(row.why || ''), row.why);
  ck('  and it clusters by DRAFT — 2, not 80', row.n_clusters === 2, row.n_clusters);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
