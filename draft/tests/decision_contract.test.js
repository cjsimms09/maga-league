// TERRITORY: A
/* THE DECISION EXPLANATION CONTRACT — the invariant and the six requirements.
 *
 * The assertions that matter are the ones that make prose UNABLE to lie, not the
 * ones that check a field exists.
 */
'use strict';
const DC = require('../../public/js/draft/decision_contract.js');
const E = require('../../public/js/draft/engine.js');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name); }
}
function threw(fn) { try { fn(); return false; } catch (e) { return true; } }

const mk = (id, score, weighted, extra) => Object.assign({
  player: { player_id: id, name: 'P' + id, position: 'WR' },
  score: score, components: { weighted: weighted },
}, extra || {});

// ── (1) DECISIVENESS, NOT DOMINANCE ─────────────────────────────────────────
/* Cory's case: the biggest contribution on the winner can contribute NOTHING to
 * why he won, because the alternative had just as much of it. */
{
  const win = mk('a', 10.5, { value: 100, stack: 1.5 });
  const alt = mk('b', 10.0, { value: 100, stack: 1.0 });
  const c = DC.contributions(win, alt, 0.5);
  const value = c.find(x => x.term === 'value');
  const stack = c.find(x => x.term === 'stack');

  check('a term the alternative matches contributes ZERO to the decision',
    value.delta === 0 && value.direction === 'neutral');
  check('  even though it is by far the largest number on the winner',
    value.winner === 100);
  check('the term that actually separated them is the one with a delta',
    stack.delta === 0.5 && stack.direction === 'helped');
  check('  and it is decision-significant: removing it alone flips the pick',
    stack.decision_significant === true);
  check('the ordering is by DELTA, not by absolute contribution',
    c[0].term === 'stack');

  /* SHARES CAN EXCEED 1 WHEN TERMS OPPOSE — the case a renderer would get wrong. */
  const w2 = mk('a', 0.2, { value: 1.4, need: -1.2 });
  const a2 = mk('b', 0.0, { value: 0, need: 0 });
  const c2 = DC.contributions(w2, a2, 0.2);
  const shares = c2.map(x => x.share_of_gap);
  check('OPPOSING TERMS give shares far outside [0,1] — expected, not a bug',
    Math.max.apply(null, shares) > 5 && Math.min.apply(null, shares) < -5);
  check('  and the payload SAYS a renderer must not assume they sum to one',
    /must not assume shares sum to one/.test(
      DC.explain({ winner: w2, alternative: a2 }).evidence.shares_note));
}

// ── (2) RESOLUTION IS A FIELD, FROM THE ENGINE'S CONSTANTS ─────────────────
{
  const cfg = E.CFG;
  check('a sub-coin-flip gap is TIE_WITHIN_RESOLUTION, not a win',
    DC.resolution(0.06, cfg).status === 'TIE_WITHIN_RESOLUTION');
  check('  and it SAYS the higher score is not a better choice',
    /not a better choice/.test(DC.resolution(0.06, cfg).why));
  check('a gap inside the tie band is CLOSE', DC.resolution(1.5, cfg).status === 'CLOSE');
  check('a gap outside it is DECISIVE', DC.resolution(9, cfg).status === 'DECISIVE');
  check('no alternative is UNKNOWN, never DECISIVE by default',
    DC.resolution(null, cfg).status === 'UNKNOWN');

  /* THE BANDS COME FROM THE ENGINE. A copy here would let the prose layer drift
   * into deciding what a coin flip is — the thing requirement 2 forbids. */
  check('the band reported is the ENGINE\'s TIE_THRESHOLD, not a local constant',
    DC.resolution(9, cfg).band === E.CFG.TIE_THRESHOLD);
  check('  and the coin-flip band is the engine\'s COIN_FLIP_GAP',
    DC.resolution(0.06, cfg).band === E.CFG.COIN_FLIP_GAP);
}

// ── (3) THE CAUSE VOCABULARY IS OPEN, NOT A FIXED LIST ─────────────────────
{
  const win = mk('a', 5, { value: 3, brand_new_term: 2 });
  const alt = mk('b', 1, { value: 1, brand_new_term: 0 });
  const cs = DC.causes(win, alt, DC.contributions(win, alt, 4));
  check('A TERM THE ENGINE ADDS LATER APPEARS WITHOUT THIS FILE CHANGING',
    cs.some(c => c.code === 'term:brand_new_term'));
  check('  (a renderer pattern-matching a fixed list would silently stop explaining)',
    true);

  const alt2 = mk('b', 1, { value: 1 }, { demoted: true, rails: [1], onesie: { capped: true } });
  const cs2 = DC.causes(win, alt2, DC.contributions(win, alt2, 4));
  const codes = cs2.map(c => c.code);
  check('structural causes come from engine STATE, not from prose',
    codes.indexOf('structural:demoted') >= 0 && codes.indexOf('structural:rail') >= 0
    && codes.indexOf('structural:onesie_cap') >= 0);
}

// ── (4) CALIBRATION TRAVELS WITH THE TERM ──────────────────────────────────
{
  const win = mk('a', 5, { stack: 2, value: 3 });
  const alt = mk('b', 1, { stack: 0, value: 1 });
  const c = DC.contributions(win, alt, 4);
  const stack = c.find(x => x.term === 'stack');

  /* ⚠️ THE STRICTEST REQUIREMENT. The caveat must be a field the renderer cannot
   * reach the number WITHOUT seeing — not a parallel list it remembers to join. */
  check('CALIBRATION IS ON THE CONTRIBUTOR ITSELF, not a separate lookup',
    stack.calibration && stack.calibration.status === 'soft');
  check('  and it names WHY the number is soft',
    /MODELLED correlation/.test(stack.calibration.note));
  check('every contributor carries a calibration — none can be read bare',
    c.every(x => x.calibration && x.calibration.status));
  check('an uncalibrated term says so rather than reading as measured',
    DC.CALIBRATION.keeper.status === 'uncalibrated');

  /* Survival is inside VONA, inside `value`, so it can never appear as a term.
   * Its caveat is carried explicitly or a renderer would describe a
   * survival-driven wait with no warning attached. */
  check('SURVIVAL carries its own caveat even though it is not a weighted term',
    /OVER-PREDICTS DEPARTURES by 15-57%/.test(DC.SURVIVAL_CALIBRATION.note));
}

// ── THE FORBIDDEN THING, MECHANICAL ────────────────────────────────────────
{
  const win = mk('a', 5, { value: 3, tier: 0, need: 0 });
  const alt = mk('b', 1, { value: 1, tier: 0, need: 0 });
  const c = DC.contributions(win, alt, 4);

  check('a sentence citing a ZERO-delta term is caught, by term name',
    DC.citesZeroContribution('last of Tier 1 TE', c).join(',') === 'tier');
  check('  and "fills an empty RB slot" is caught when need contributed nothing',
    DC.citesZeroContribution('fills an empty RB slot', c).indexOf('need') >= 0);
  check('a sentence citing only a REAL contributor is compliant',
    DC.citesZeroContribution('best value on the board', c).length === 0);

  /* NON-VACUITY: it must pass when the term genuinely moved. */
  const c2 = DC.contributions(mk('a', 5, { tier: 4 }), mk('b', 1, { tier: 0 }), 4);
  check('CONTROL: the same sentence is FINE when tier actually moved the decision',
    DC.citesZeroContribution('last of Tier 1 TE', c2).length === 0);
}

// ── (5) REPRODUCIBILITY ────────────────────────────────────────────────────
{
  const win = mk('a', 5, { value: 3, stack: 1 });
  const alt = mk('b', 1, { value: 1, stack: 0 });
  const one = DC.explain({ winner: win, alternative: alt, cfg: E.CFG });
  const two = DC.explain({ winner: win, alternative: alt, cfg: E.CFG });
  check('SAME STATE -> BYTE-IDENTICAL EVIDENCE. The wording may vary; this may not',
    JSON.stringify(one.evidence) === JSON.stringify(two.evidence));
  check('presentation is NULL — the renderer is not in this module',
    one.presentation === null);
  check('  and the contract states the invariant a renderer must run',
    /no explanation may cite a factor whose delta is zero/.test(one.invariant));
  check('FAIL CLOSED: no winner THROWS rather than emitting an empty explanation',
    threw(() => DC.explain({})));
}

// ── (6) ROSTER CONSTRUCTION / DEFERRAL ─────────────────────────────────────
{
  const g = { positions: [
    { position: 'QB', need: true, verdict: 'WAIT', grab_by_pick: 88, evlw_per_week: 0.4 },
    { position: 'TE', need: true, verdict: 'GRAB-SOON', grab_by_pick: 61, evlw_per_week: 1.1 },
    { position: 'RB', need: false, verdict: 'WAIT', grab_by_pick: null },
  ] };
  const d = DC.deferral(g);
  check('deferral carries WHY, UNTIL WHEN and WHAT WOULD CHANGE IT',
    d.length === 2 && d[0].status === 'WAIT' && d[0].until_pick === 88
    && d[0].what_would_change_it.length > 10);
  check('  positions with no open need are omitted, not reported as deferred',
    !d.some(x => x.position === 'RB'));
  check('  and the cost of waiting is carried per week, from GrabBy',
    d[1].cost_of_waiting_per_week === 1.1);
  check('no grabby at all yields an empty list, not a fabricated deferral',
    DC.deferral(null).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
