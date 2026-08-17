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

  /* SCOPED TO THE PLAYER DICT, and the first version was not. It searched the
   * whole file for `"<field>":` and, the moment build_bundle grew a
   * `field_limits` block DECLARING those fields absent, matched the declaration
   * of their absence and reported all five as written. A check that reads a NAME
   * and infers BEHAVIOUR — the exact class this suite exists for, landing on the
   * suite itself. */
  const appendAt = src.indexOf('players.append({');
  const dict = appendAt >= 0 ? src.slice(appendAt, src.indexOf('})', appendAt)) : '';
  ck('CONTROL: the player dict was located in build_bundle.py',
    dict.length > 100 && /"player_id"/.test(dict), dict.length);

  const written = RISK_INPUTS.filter(f => new RegExp('"' + f + '"\\s*:').test(dict));
  /* THE ASSERTION INVERTED ON 2026-08-14 AND THAT IS THE IMPROVEMENT. It used to
   * require that NONE of risk's inputs were written — pinning the degeneracy.
   * build_bundle now emits `age`, which it had computed all along and never
   * wrote. What must stay true is that the other three are NOT written: they are
   * point-in-time facts with no historical archive, so writing them would be
   * lookahead contamination rather than a repair. */
  const CONTAMINATING = ['injury_status', 'depth_chart_order', 'opportunity_z'];
  ck('build_bundle.py writes `age` — the one risk input it can honestly supply',
    written.indexOf('age') >= 0, written);
  ck('  and writes NONE of the point-in-time three (that would be lookahead)',
    CONTAMINATING.every(f => written.indexOf(f) < 0),
    { contaminating_written: CONTAMINATING.filter(f => written.indexOf(f) >= 0),
      note: 'these come from Sleeper\'s LIVE payload with no historical archive; '
        + 'today\'s value in a past replay decides a past pick with future facts' });
  ck('  so the Lab risk term is PARTIAL, and the provenance says so',
    /PARTIAL/.test(E.WEIGHT_PROVENANCE.risk), E.WEIGHT_PROVENANCE.risk);

  /* THIS TRIPWIRE FIRED ON 2026-08-17 AND IT WAS RIGHT.
   *
   * It used to assert that build_bundle.py STILL manufactured proj_ceiling as
   * `1.35 * proj_mean`, with the note "if this fails, ceiling may now be
   * measurable and its provenance must be re-derived". The harness was fixed
   * that day — dispersion now comes from the measured p90/p10/sd per
   * (position, band), fitted leave-one-season-out — so the assertion failed,
   * exactly as designed, and caught a WEIGHT_PROVENANCE.ceiling string that had
   * silently become false ("collinear with value on the backtest board").
   *
   * It now guards the opposite direction, which is the live risk from here:
   * that someone reintroduces a synthetic constant and re-collinearises every
   * backtest board without noticing. */
  ck('  and NO LONGER manufactures proj_ceiling from proj_mean',
    !/"proj_ceiling"\s*:\s*round\(\(pm[^)]*\)\s*\*\s*1\.35/.test(src)
    && !/"proj_sd"\s*:\s*round\(\(pm[^)]*\)\s*\*\s*0\.25/.test(src),
    'a synthetic dispersion constant is back in build_bundle.py — every weight '
    + 'experiment on a bundle is collinear again');

  /* The provenance must say WHICH of the two states the zero is in. "Collinear
   * on the backtest board" was true until the harness fix and is now false;
   * "measured and refuted" is not true either. The honest word is UNMEASURED,
   * plus the fact that the experiment is now runnable. */
  ck('  and the ceiling provenance reflects the fixed harness, not the old one',
    /UNMEASURED/.test(E.WEIGHT_PROVENANCE.ceiling)
    && !/collinear with value on the backtest board/.test(E.WEIGHT_PROVENANCE.ceiling),
    E.WEIGHT_PROVENANCE.ceiling);

  /* And it must NOT oversell the fix. The measured ceiling is still
   * proj_mean x a per-cell constant; a reader who takes "the harness is fixed"
   * to mean "the ceiling is now per-player" will over-trust any weight fitted
   * on it. constant_multiple_sweep says so on the live board today. */
  ck('  and does not oversell it — the collinearity is reduced, not removed',
    /REDUCED, NOT REMOVED/.test(E.WEIGHT_PROVENANCE.ceiling),
    E.WEIGHT_PROVENANCE.ceiling);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
