// TERRITORY: A
/* EVERY WEIGHT MUST SAY WHERE ITS NUMBER CAME FROM, AND THE PANEL MUST NOT
 * CONTRADICT IT.
 *
 * WHAT THIS EXISTS TO CATCH. On 2026-08-14 the live panel told Cory "the sliders
 * at zero are at zero because they did nothing", and cited ceiling's measured
 * -4.8 [-26,+17] as the reason it was off. Item 10's sweep then found that the
 * backtest board carries none of risk's five inputs and manufactures
 * proj_ceiling as a fixed 1.35x of proj_mean. So:
 *
 *   · the risk experiment ran on a term with ONE distinct value (0.0). It could
 *     not have returned anything else at any weight.
 *   · the ceiling experiment ran on a term rank-identical to the value term
 *     (Spearman 1.0000). Raising one weight was raising the other.
 *
 * Two of the five zeros were not measurements, and the panel was presenting them
 * as measurements. RULE 16: the explanation is an evidence surface. A sentence
 * that cites a confidence interval is making an evidential claim, and a wrong one
 * costs more than silence — Cory reads that panel to decide whether to override.
 *
 * THE INVARIANT: MEASURED_WEIGHTS and WEIGHT_PROVENANCE cover the same keys, and
 * no weight marked UNMEASURED may be described as measured in the copy Cory sees.
 * If a future run measures risk properly on a real board, this test fails until
 * the provenance entry is updated too — which is the point.
 *
 * Run: node draft/tests/weight_provenance.test.js
 */
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const W = E.MEASURED_WEIGHTS, P = E.WEIGHT_PROVENANCE;

ck('WEIGHT_PROVENANCE is exported at all', P && typeof P === 'object');

// ── COVERAGE — no weight may be silent about where it came from ─────────────
{
  const wk = Object.keys(W).sort(), pk = Object.keys(P || {}).sort();
  ck('every weight has a provenance entry',
    wk.every(k => pk.indexOf(k) >= 0), wk.filter(k => pk.indexOf(k) < 0));
  ck('  and no provenance entry names a weight that does not exist',
    pk.every(k => wk.indexOf(k) >= 0), pk.filter(k => wk.indexOf(k) < 0));
}

// ── THE TWO KNOWN-UNMEASURED WEIGHTS STAY DECLARED ─────────────────────────
{
  const unmeasured = Object.keys(P || {}).filter(k => /UNMEASURED/.test(P[k]));
  ck('risk and ceiling are still declared UNMEASURED',
    unmeasured.indexOf('risk') >= 0 && unmeasured.indexOf('ceiling') >= 0,
    unmeasured);

  /* NOT AN ASSERTION THAT THEY ARE ZERO — that is a decision, not an invariant,
   * and a later run may legitimately move them. The invariant is that whoever
   * moves one has to say what measured it. */
  ck('  a weight declared UNMEASURED gives a REASON, not just the word',
    unmeasured.every(k => P[k].length > 'UNMEASURED'.length + 10),
    unmeasured.map(k => k + ': ' + P[k]));
}

// ── THE PANEL COPY MUST NOT CLAIM A MEASUREMENT THAT DOES NOT EXIST ────────
{
  const preset = E.WEIGHT_PRESETS.filter(p => p.key === 'measured')[0];
  ck('the live-policy preset exists', !!preset);
  const why = (preset && preset.why) || '';

  /* The exact sentence that was wrong, and the shape of it. Anything asserting
   * that every zeroed slider was zeroed by evidence is now false. */
  ck('the panel no longer says the zeroed sliders "did nothing"',
    !/at zero because they did nothing/i.test(why), why);

  ck('  and no longer cites ceiling\'s collinear interval as its reason',
    !/-4\.8|\[-26/.test(why), why);

  ck('  and names risk and ceiling as unmeasured rather than measured',
    /never (been )?measured|were never measured|incapable/i.test(why)
    && /risk/i.test(why) && /ceiling/i.test(why), why);

  /* NON-VACUITY. If `why` were empty or the preset missing, every assertion
   * above would pass trivially. It has to be real prose that really mentions
   * the sliders. */
  ck('CONTROL: the panel copy is substantive and names the weights',
    why.length > 200 && /tier/i.test(why) && /need/i.test(why) && /bye/i.test(why),
    { length: why.length });
}

// ── AND THE DEGENERACY CLAIM ITSELF IS STILL TRUE ──────────────────────────
/* The provenance string asserts a fact about the fixture. If build_bundle.py
 * starts writing risk inputs, this file must stop claiming the term is
 * degenerate. Checked by re-deriving it, not by trusting the comment — the
 * comment is exactly what item 9 says cannot be trusted. */
{
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', 'backtest', 'build_bundle.py'), 'utf8');
  const RISK_INPUTS = ['age', 'injury_status', 'games_missed_3yr', 'depth_chart_order',
    'opportunity_z'];
  const written = RISK_INPUTS.filter(f => new RegExp('"' + f + '"\\s*:').test(src));
  ck('build_bundle.py still writes NONE of risk\'s five inputs',
    written.length === 0,
    { now_written: written, note: 'if this fails the risk term is no longer degenerate '
      + 'in the Lab and WEIGHT_PROVENANCE.risk must be re-derived, not edited to taste' });

  ck('  and still manufactures proj_ceiling from proj_mean',
    /"proj_ceiling"\s*:\s*round\(\(pm[^)]*\)\s*\*\s*1\.35/.test(src),
    'if this fails, ceiling may now be measurable and its provenance must be re-derived');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
