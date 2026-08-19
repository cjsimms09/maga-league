// TERRITORY: A
/* THE DECISION EXPLANATION CONTRACT — the invariant and the six requirements.
 *
 * The assertions that matter are the ones that make prose UNABLE to lie, not the
 * ones that check a field exists.
 */
'use strict';
const fs = require('fs');
const path = require('path');
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
  /* THIS WAS `check(..., true)` — a sentence printing PASS while asserting
   * nothing. The claim it makes is testable, so it is tested: the fixed list
   * really is blind to the new term, and the open mechanism really does see it.
   * Two arms, or "the vocabulary is open" is just a hope with a PASS beside it.
   * (22 more of these exist across 14 suites as of 2026-08-14 — counted, not
   * fixed here; they are annotation-shaped but they still print PASS.) */
  check('  (a renderer pattern-matching a fixed list WOULD have missed it —',
    !('brand_new_term' in DC.TERM_WORDS));
  check('   the fixed list is blind and the open mechanism is not)',
    cs.some(c => c.code === 'term:brand_new_term') && !('brand_new_term' in DC.TERM_WORDS));

  const alt2 = mk('b', 1, { value: 1 }, { demoted: true, rails: [1], onesie: { capped: true } });
  const cs2 = DC.causes(win, alt2, DC.contributions(win, alt2, 4));
  const codes = cs2.map(c => c.code);
  check('structural causes come from engine STATE, not from prose',
    codes.indexOf('structural:demoted') >= 0 && codes.indexOf('structural:rail') >= 0);
  // structural:onesie_cap is RETIRED with its mechanism (Cory 08-14, executed
  // 08-18, register 5n). The fixture above still passes capped:true, and the
  // contract must now IGNORE it — a reader of a dead flag is how the false
  // deletion survived four days in the engine.
  check('  and the retired onesie_cap cause never fires, even on a capped-shaped input',
    codes.indexOf('structural:onesie_cap') < 0);
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

// ── THE CONVERSE INVARIANT: MOVED IS NOT DECISIVE ──────────────────────────
/* Without this the SAME BUG returns at a lower threshold: the zero-delta check
 * passes while every tiny non-zero contribution is promoted into a reason. */
{
  // Cory's case: value +8.0, survival-ish +0.1, gap 4.2.
  const win = mk('a', 12.3, { value: 8.0, stack: 0.1 });
  const alt = mk('b', 8.1, { value: 0, stack: 0 });
  const c = DC.contributions(win, alt, 4.2);
  const value = c.find(x => x.term === 'value');
  const tiny = c.find(x => x.term === 'stack');

  // FOUR states since 2026-08-13 — see the UNKNOWN block at the foot of this
  // file. The stub below now carries `decision_significant` explicitly: a
  // contrib WITHOUT that field is malformed, and roleOf deliberately answers
  // 'unknown' for it rather than guessing 'absent'. That is the safe direction
  // (refuse, don't assert) and it is the same call the NaN fix makes — so the
  // stub is corrected rather than the rule being loosened to accept it.
  check('FOUR STATES: absent / moved / decisive / unknown, not two',
    DC.roleOf(value) === 'decisive' && DC.roleOf(tiny) === 'moved'
    && DC.roleOf({ delta: 0, decision_significant: false }) === 'absent'
    && DC.roleOf({ delta: 0 }) === 'unknown');
  check('a term that MOVED but did not decide is caught as a causal claim',
    DC.citesNonDecisive('we took him for the stack', c).join(',') === 'stack');
  check('  it passes the zero-delta check — which is exactly why the converse is needed',
    DC.citesZeroContribution('we took him for the stack', c).length === 0);
  check('naming the DECISIVE term is compliant under both detectors',
    DC.citesNonDecisive('best value on the board', c).length === 0
    && DC.citesZeroContribution('best value on the board', c).length === 0);
}

// ── THE VONA STRING WAS PINNED AS THE STANDARD. IT WAS NOT ONE. ───────────
/* THIS BLOCK USED TO OPEN: '"Scarcity priced in value (VONA), not
 * double-counted" is the only shipped string that was already doing the right
 * thing ... its saving grace is that it says WHERE the effect actually lives.'
 *
 * It named the wrong place, and this block could not have noticed, for three
 * independent reasons that are worth keeping visible:
 *
 *   1. VONA_STRING WAS A LOCAL LITERAL. The test defined the sentence it was
 *      testing and never read engine.js. Change the shipped string to anything
 *      at all and this block still passed — a fixture deriving from the thing
 *      under test always agrees with it. It now reads the real template out of
 *      the engine source, so drift fails here.
 *   2. ONE CHECK WAS THE LITERAL `true`. It asserted nothing and printed PASS.
 *      Replaced with the condition it was gesturing at.
 *   3. THE PREMISE WAS NEVER MEASURED. "The effect lives in VONA" was accepted
 *      because it sounds like the accounting. VONA = proj_mean -
 *      expectedBestAvailable(samePos, nextPick), a function of the BOARD with no
 *      roster input: filling the slot moves vona for 0 of 1690 players. See
 *      composite_roster_blindness.test.js. Board scarcity and your slot being
 *      empty are two different things that got the same word.
 *
 * THE GENERAL FORM SURVIVES AND IS THE REASON TO KEEP THIS CASE: the explanation
 * must follow the actual causal ACCOUNTING STRUCTURE, not the vocabulary humans
 * use to describe the model. The old string failed its own standard. */
{
  const ENGINE_SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'), 'utf8');
  const m = ENGINE_SRC.match(/need\.why = `(fills your empty [^`]*)`/);
  const VONA_STRING = m ? m[1].replace('${player.position}', 'TE') : null;

  check('CONTROL: the shipped empty-slot string was located in engine.js',
    VONA_STRING !== null);

  const win = mk('a', 5, { value: 4, need: 0 });
  const alt = mk('b', 1, { value: 0, need: 0 });
  const c = DC.contributions(win, alt, 4);

  check('THE STANDARD: the shipped string names `need` and need contributed nothing',
    DC.citesZeroContribution(VONA_STRING || '', c).indexOf('need') >= 0);
  check('  so it must be CONTEXT, not a reason — and the engine gates it on w.need',
    /if \(w\.need \* need\.value > 0\) reasons\.push\(need\.why\)/.test(ENGINE_SRC));
  check('  and it no longer claims the empty-slot effect lives in VONA',
    !/priced in value \(VONA\), not double-counted/.test(VONA_STRING || ''));
  check('  it points at the surface that actually reads the roster',
    /needrule card/.test(VONA_STRING || ''));

  /* The failure mode it protects against, stated as its own case. */
  check('"scarcity drove the pick" would be conceptually true and structurally false',
    DC.citesZeroContribution('scarcity drove the pick', c).length === 0);
  check('  (no `scarcity` TERM exists, so no term detector can catch it —',
    !('scarcity' in DC.TERM_WORDS));
  check('   which is why the contract carries PROVENANCE, not a flat term list)',
    DC.SURVIVAL_CALIBRATION.status === 'soft');
}

// ── THE ENGINE NOW SEPARATES REASON FROM CONTEXT ───────────────────────────
{
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'), 'utf8');
  check('the engine emits a CONTEXT array alongside reasons',
    /\n\s+context,\n/.test(src));
  check('tier is gated on its WEIGHTED contribution, not the raw term',
    /if \(w\.tier \* tier > 5\)/.test(src));
  check('need is DEMOTED to context when its weight is zero',
    /if \(w\.need \* need\.value > 0\) reasons\.push\(need\.why\);\s*\n\s*else context\.push\(need\.why\);/.test(src));
  check('risk reasons are gated rather than pushed unconditionally',
    /if \(w\.risk !== 0\) risk\.reasons/.test(src));
  check('stack reasons are gated too — the next false cause if the weight moves',
    /if \(w\.stack !== 0\) stack\.reasons/.test(src));
}

// ── AND THE DEMOTED FACTS MUST STILL REACH A SURFACE ───────────────────────
/* ⚠️ I EMITTED `context` FROM THE ENGINE AND WIRED NO CONSUMER — rule 14,
 * committed by the person who spent the week catching it. Rule 16 correctly
 * moved 24 board facts out of `reasons`; with no reader they would simply have
 * vanished from the board, which is a worse outcome than the false causality it
 * replaced. Pinned here so the demotion can never again be a deletion. */
{
  const fs = require('fs'), path = require('path');
  const app = fs.readFileSync(path.join(__dirname, '..', '..',
    'public', 'js', 'draft', 'app.js'), 'utf8');

  check('the rec list RENDERS context', /s\.context && s\.context\.length/.test(app));
  check('the one-answer card renders it too', /s2\.context && s2\.context\.length/.test(app));

  /* SEPARATE ELEMENTS. The whole point of the split is that a roster fact must
   * not be readable AS the reason; putting both in one line would restore the
   * confusion with extra steps. */
  check('context has its OWN element, never appended to the reason line',
    /class="rec-context"/.test(app) && /id = 'clock-context'/.test(app));
  check('  and the reason line still renders reasons only',
    /class="rec-why">' \+ escapeHtml\(s\.reasons\[0\]\)/.test(app));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/* ── UNKNOWN IS ITS OWN ROLE (B, 2026-08-13) ───────────────────────────────
 *
 * At pick 108 the engine returned NaN scores. resolution() correctly said
 * UNKNOWN and decision_significant was correctly null — and roleOf's ternary
 * then coerced that null to false and reported MOVED for every non-zero term.
 * A renderer trusting it would cite value +62.4 as a supporting factor behind a
 * decision the contract had just declared indescribable.
 */
{
  const nanWinner = { name: 'W', components: { weighted:
    { value: 62.4, keeper: 12.9, tier: 0, need: 0 } } };
  const nanAlt = { name: 'A', components: { weighted:
    { value: 0, keeper: 0, tier: 0, need: 0 } } };
  const contribs = DC.contributions(nanWinner, nanAlt, NaN);
  const byTerm = {}; contribs.forEach(c => { byTerm[c.term] = c; });

  ck('an unusable gap resolves UNKNOWN', DC.resolution(NaN).status === 'UNKNOWN');
  ck('...and decision_significant is null, not false',
    byTerm.value.decision_significant === null, String(byTerm.value.decision_significant));
  ck('a non-zero term under an unusable gap is UNKNOWN, never MOVED',
    DC.roleOf(byTerm.value) === 'unknown', DC.roleOf(byTerm.value));
  ck('...and so is a smaller one — the whole state is unexplainable, not just the big term',
    DC.roleOf(byTerm.keeper) === 'unknown', DC.roleOf(byTerm.keeper));
  // Ordering matters: under a NaN gap even "this contributed nothing" is a claim
  // we cannot support, so a zero-delta term is unknown too rather than absent.
  ck('a ZERO-delta term under an unusable gap is also unknown, not absent',
    DC.roleOf(byTerm.tier) === 'unknown', DC.roleOf(byTerm.tier));

  // THE HOLE THE FIX COULD HAVE OPENED. Naming the state without a detector for
  // it would have made the sentence pass BOTH existing checks — a quieter bug.
  const s = 'took him on value, with the keeper stack behind it';
  ck('the sentence escapes citesZeroContribution (deltas are non-zero)',
    DC.citesZeroContribution(s, contribs).length === 0);
  ck('...and escapes citesNonDecisive (nothing is "moved" any more)',
    DC.citesNonDecisive(s, contribs).length === 0);
  ck('...so citesUnexplainable is the detector that must catch it',
    DC.citesUnexplainable(s, contribs).sort().join(',') === 'keeper,value',
    DC.citesUnexplainable(s, contribs).join(','));

  // THE CONTROL. On a healthy gap the new role must never appear, or it would
  // suppress every real explanation on the board (rule 10).
  const okContribs = DC.contributions(nanWinner, nanAlt, 62.4);
  ck('a usable gap yields no unknown roles at all',
    okContribs.every(c => DC.roleOf(c) !== 'unknown'));
  ck('...and citesUnexplainable stays silent there',
    DC.citesUnexplainable(s, okContribs).length === 0);
}
