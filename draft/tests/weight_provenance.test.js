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

// ── THE UNMEASURED WEIGHTS STAY DECLARED ───────────────────────────────────
/* THIS BLOCK USED TO REQUIRE BOTH risk AND ceiling TO SAY "UNMEASURED", and on
 * 2026-08-17 that became the wrong invariant. The ceiling experiment was re-run
 * on the first board in this project's history whose proj_ceiling was not a
 * constant multiple of proj_mean, and it came back positive and separable in
 * 3/3 seeds (EXP-CEILING-REDERIVATION.md). The zero first survived as a
 * DELIBERATE HOLD, then — later the same day — Cory as owner overrode the hold
 * and ruled 0.45 (the exp-21 inverted-U peak); the weight ships non-zero.
 *
 * Continuing to call it unmeasured would be the same defect this file was
 * written to catch, pointed the other way: the panel telling Cory a number is
 * unmeasured when it has in fact been measured and contradicted. */
{
  const unmeasured = Object.keys(P || {}).filter(k => /UNMEASURED/.test(P[k]));
  ck('risk is still declared UNMEASURED', unmeasured.indexOf('risk') >= 0, unmeasured);

  ck('ceiling is NO LONGER declared unmeasured — it was measured 2026-08-17',
    unmeasured.indexOf('ceiling') < 0, P.ceiling);

  /* RE-PINNED 2026-08-17, SAME DAY: Cory ruled the weight non-zero ("IS THIS
   * STUDIES? IF SO, YES") and the hold this block used to pin was explicitly
   * overridden by its owner. The two things that keep the entry honest have
   * changed with the state: it must say the number is MEASURED AND RULED (not
   * merely measured — a ruling is a decision someone can be asked about), and
   * it must record the PREREG DEVIATION as dated and owned rather than letting
   * an early ship read as drift. */
  ck('  and says the shipped number is MEASURED AND RULED, with the ruling date',
    /MEASURED/.test(P.ceiling) && /RULED/i.test(P.ceiling)
    && /2026-08-17/.test(P.ceiling), P.ceiling);
  ck('  and records the prereg deviation as an explicit owner override, dated',
    /PREREG DEVIATION/i.test(P.ceiling) && /overrode|override/i.test(P.ceiling)
    && /08-22/.test(P.ceiling), P.ceiling);
  ck('  and still carries the caveat the ruling shipped with (saturation, Sept re-run)',
    /saturat/i.test(P.ceiling) && /September|quantile/i.test(P.ceiling), P.ceiling);

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

  ck('  and still names risk as never measured',
    /never measured|incapable/i.test(why) && /risk/i.test(why), why);

  /* CEILING'S ENTRY IN THE PANEL COPY CHANGED CATEGORY TWICE on 2026-08-17.
   * First from "unmeasured" to "known to be set wrong and held" (the morning
   * re-derivation), then — the same day — to "on at 0.45, ruled" when Cory
   * overrode the prereg hold ("IS THIS STUDIES? IF SO, YES"). The copy must
   * tell Cory the slider is ON at the ruled value, whose ruling that is, and
   * that 0.45 is the measured peak — because "should it be higher?" was his
   * own question and the panel is where he would reach for the answer. */
  ck('  and tells Cory ceiling is ON at the ruled 0.45, and whose ruling that is',
    /ceiling/i.test(why) && /0\.45/.test(why) && /ruled|Cory/i.test(why)
    && !/set wrong|known to be wrong/i.test(why)
    && !/risk and ceiling are off but were never measured/i.test(why), why);

  ck('  and says higher is NOT better (the inverted-U), so the ruling\'s own '
    + '"should it be higher?" is answered on the surface',
    /higher/i.test(why) && /inverted-U|NEGATIVE|not better/i.test(why), why);

  ck('  and records the early ship as a ruled, dated deviation from the 8/22 hold',
    /8\/22|2026-08-22/.test(why) && /override|deviation|ruled/i.test(why), why);

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

  /* The provenance must say WHICH state the zero is in, and there have now been
   * three. "Collinear on the backtest board" was true until the harness fix.
   * "UNMEASURED, the experiment is runnable and has not been run" was true for
   * the few hours between the harness fix and the re-run. Since the re-run the
   * honest description is MEASURED, CONTRADICTED, AND HELD — and none of the
   * three earlier phrasings may survive, because each of them would tell Cory
   * the number is unexamined when it has in fact been examined and disagreed
   * with. */
  ck('  and the ceiling provenance reflects the RE-RUN, not either earlier state',
    !/collinear with value on the backtest board/.test(E.WEIGHT_PROVENANCE.ceiling)
    && !/has NOT been run/.test(E.WEIGHT_PROVENANCE.ceiling)
    && !/un-re-derived/.test(E.WEIGHT_PROVENANCE.ceiling),
    E.WEIGHT_PROVENANCE.ceiling);

  /* NON-VACUITY FOR THE ABOVE: three negative assertions pass trivially against
   * an empty string, so require the positive claim too. */
  ck('  CONTROL: and actually cites the re-derivation it replaced them with',
    /EXP-CEILING-REDERIVATION\.md/.test(E.WEIGHT_PROVENANCE.ceiling),
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
