// TERRITORY: A
/* THE DECISION EXPLANATION CONTRACT — a causal interface, not a prose helper.
 *
 * ── THE PRINCIPLE, AND IT GOVERNS EVERY DESIGN CHOICE BELOW ────────────────
 *
 *   **THE RENDERER MAY EXPLAIN THE DECISION. IT MAY NEVER DETERMINE THE REASON
 *   FOR THE DECISION.**
 *
 * The engine determines the reason. This contract RECORDS it. The renderer turns
 * it into a sentence. That is what makes one shape safe across draft, lineup and
 * waiver instead of three prose generators each inventing their own logic —
 * which is exactly how six definitions of flex eligibility happened.
 *
 * **THERE IS NO RENDERER IN THIS FILE.** Not an omission: a shared renderer
 * would make the draft's voice the lineup's voice and put three surfaces'
 * wording behind one change. The seam is the DATA.
 *
 * ── COST: A BYPRODUCT, MEASURED ────────────────────────────────────────────
 *
 * `scorePlayer` already emits `components.weighted` — per-term weighted
 * contributions computed during the scoring that has to happen anyway. This
 * module reads them and computes NOTHING about players: no second pass over the
 * pool, no second scoring model, and nothing resembling an LLM. `E.recommend` is
 * 3,097 ms; this is a few dozen object reads on the two entries that already
 * won and came second. **It does not touch the hot path in any measurable way,
 * and if that ever stops being true the fix is to drop the contract, not to
 * slow the board on the 22nd.**
 *
 * ── (1) DECISIVENESS, NOT DOMINANCE ────────────────────────────────────────
 *
 * The largest contribution and the decisive one are different questions. A term
 * can be the biggest number on the winner and contribute nothing to WHY he won,
 * because the alternative had just as much of it.
 *
 * So every term is reported as **WINNER MINUS ALTERNATIVE**, as a **SHARE OF THE
 * SCORE GAP**, with its **direction**, and with **whether it is decision-
 * significant** — defined as: removing this term alone would flip the decision.
 *
 * ⚠️ **SHARES CAN EXCEED 100% AND THAT IS THE POINT.** When terms pull against
 * each other the gap is a small residue of large opposing forces, and a renderer
 * that assumed shares sum to one would report nonsense. Stated in the payload.
 *
 * ── (2) RESOLUTION IS A FIELD, NOT A JUDGEMENT THE PROSE MAKES ─────────────
 *
 * `DECISIVE` / `CLOSE` / `TIE_WITHIN_RESOLUTION`, from the ENGINE'S OWN
 * constants (`CFG.COIN_FLIP_GAP`, `CFG.TIE_THRESHOLD`) rather than numbers
 * invented here. **The language layer does not get to decide whether something
 * is a coin flip.**
 *
 * ── (3) CAUSES ARE AN OPEN VOCABULARY THE ENGINE OWNS ──────────────────────
 *
 * Why the alternative lost is emitted as structured causes with engine-owned
 * codes. **The taxonomy is deliberately NOT fixed here**: the term codes come
 * from whatever `components.weighted` contains, so a term added to the engine
 * appears automatically, and the structural codes come from engine states that
 * already exist. A consumer that pattern-matched a fixed list would silently
 * stop explaining the day a term was added.
 *
 * ── (4) CALIBRATION TRAVELS WITH THE TERM ──────────────────────────────────
 *
 * The strictest requirement. "Survival contributed +0.8" reads more
 * authoritative than it is. So calibration is a field ON THE CONTRIBUTOR, not a
 * parallel list — **the renderer cannot reach the number without seeing the
 * caveat attached to it.** That is what makes it structurally unable to say
 * "he will not make it back" while remaining able to say "survival helped,
 * although that estimate is still rough".
 *
 * ── (5) REPRODUCIBILITY IS THE TEST ────────────────────────────────────────
 *
 * Same engine state, same recommendation → the FACTS must be identical. The
 * wording may vary; the evidence may not. `evidence` and `presentation` are
 * separated so six months from now "why did it recommend this player" is
 * answerable from the RECORD rather than from what the UI happened to say.
 *
 * ── (6) ROSTER CONSTRUCTION IS PART OF THE CONTRACT ────────────────────────
 *
 * "Why no QB here, and wait" is the question actually being asked at pick 41.
 * `deferral` carries why a position is being deferred, roughly until when, and
 * what would change it — sourced from `DraftGrabBy`, which the war room ALREADY
 * computes every pick, so it costs nothing new.
 */
'use strict';
(function (global) {

/* ── (1) THE DECISIVENESS MODEL ─────────────────────────────────────────────
 *
 * `delta` = winner's weighted contribution − alternative's, for one term. That
 * is the term's contribution to the GAP, which is the thing a causal claim is
 * about. A term where both players score identically has delta 0 and may not be
 * cited, however large its absolute value.
 *
 * `decision_significant` = |delta| >= |gap|: removing this term alone flips the
 * decision. Strictly a per-term counterfactual, which is why several terms can
 * each be significant at once when they oppose each other.
 */
function contributions(winner, alternative, gap) {
  const w = ((winner || {}).components || {}).weighted || {};
  const a = ((alternative || {}).components || {}).weighted || {};
  const terms = Object.keys(w);
  const g = Number(gap);
  const usableGap = isFinite(g) && Math.abs(g) > 1e-9 ? g : null;
  return terms.map(term => {
    const delta = (Number(w[term]) || 0) - (Number(a[term]) || 0);
    return {
      term: term,
      winner: Number(w[term]) || 0,
      alternative: Number(a[term]) || 0,
      delta: delta,
      share_of_gap: usableGap == null ? null : delta / usableGap,
      direction: Math.abs(delta) < 1e-9 ? 'neutral' : (delta > 0 ? 'helped' : 'hurt'),
      decision_significant: usableGap == null ? null : Math.abs(delta) >= Math.abs(usableGap),
      /* (4) THE CAVEAT IS ATTACHED TO THE NUMBER, not filed beside it. */
      calibration: CALIBRATION[term] || { status: 'measured', note: null },
    };
  }).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

/* ── (4) CALIBRATION STATUS PER TERM ────────────────────────────────────────
 *
 * A property of the SYSTEM, not of a decision, so it is a fixed map — but it
 * rides on every contributor rather than being looked up by a renderer that
 * might forget. `soft` means the number is real but the estimate behind it is
 * known-rough; `uncalibrated` means nothing has ever graded it.
 */
const CALIBRATION = {
  value: { status: 'measured', note: 'the only term with an out-of-sample dollar '
    + 'measurement behind it' },
  keeper: { status: 'uncalibrated', note: 'keeper option value is a CROSS-SEASON '
    + 'option a single-season grade cannot price — never graded' },
  stack: { status: 'soft', note: 'priced against a MODELLED correlation (rho 0.35), '
    + 'not a measured one — the reason D10 refused to install a change on it' },
  tier: { status: 'measured', note: 'measured as a drag; weighted to zero' },
  need: { status: 'measured', note: 'redundant with the always-on lineup mask; '
    + 'weighted to zero' },
  risk: { status: 'measured', note: 'measured as a drag; weighted to zero' },
  ceiling: { status: 'soft', note: 'could not be signed (−4.8 [−26, +17]); '
    + 'weighted to zero' },
  bye: { status: 'measured', note: 'a real null; weighted to zero' },
};

/* Survival is not a weighted term — it is inside VONA, which is inside `value` —
 * so it cannot appear in `contributions`. Named here so a renderer describing a
 * survival-driven wait still gets the caveat. */
const SURVIVAL_CALIBRATION = { status: 'soft',
  note: 'the survival model OVER-PREDICTS DEPARTURES by 15-57% '
    + '(draft/tests/survival_honesty.test.js) — known, measured, uncorrected' };

/* ── (2) RESOLUTION, FROM THE ENGINE'S OWN CONSTANTS ────────────────────────*/
function resolution(gap, cfg) {
  const c = cfg || {};
  const flip = c.COIN_FLIP_GAP == null ? 1 : Number(c.COIN_FLIP_GAP);
  const tie = c.TIE_THRESHOLD == null ? 2 : Number(c.TIE_THRESHOLD);
  if (gap == null || !isFinite(gap)) {
    return { status: 'UNKNOWN', gap: null, band: null,
      why: 'no alternative to compare against — a single candidate is not a decision' };
  }
  const g = Math.abs(Number(gap));
  if (g < flip) {
    return { status: 'TIE_WITHIN_RESOLUTION', gap: gap, band: flip,
      why: `the gap (${g.toFixed(2)}) is below the board's own coin-flip threshold `
        + `(${flip}) — the higher score is not a better choice, it is a tie the `
        + 'board cannot resolve' };
  }
  if (g < tie) {
    return { status: 'CLOSE', gap: gap, band: tie,
      why: `the gap (${g.toFixed(2)}) is inside the tie band (${tie}) — a real `
        + 'ordering, but not a comfortable one' };
  }
  return { status: 'DECISIVE', gap: gap, band: tie,
    why: `the gap (${g.toFixed(2)}) is outside the tie band (${tie})` };
}

/* ── (3) STRUCTURED CAUSES, OPEN VOCABULARY ─────────────────────────────────
 *
 * Term causes are generated FROM the weighted block, so a new engine term
 * appears here without this file changing. Structural causes come from engine
 * states that already exist on a scored entry. Neither list is closed.
 */
function causes(winner, alternative, contribs) {
  const out = [];
  contribs.filter(c => c.direction !== 'neutral').forEach(c => {
    out.push({
      code: 'term:' + c.term,
      kind: 'scoring_term',
      magnitude: c.delta,
      decision_significant: c.decision_significant,
      calibration: c.calibration,
    });
  });
  const alt = alternative || {};
  if (alt.demoted) out.push({ code: 'structural:demoted', kind: 'structural',
    detail: 'the alternative was demoted by a plausibility rail or the onesie cap' });
  if ((alt.rails || []).length) out.push({ code: 'structural:rail', kind: 'structural',
    detail: 'a plausibility rail fired on the alternative', rails: alt.rails.length });
  if ((winner || {}).legality) out.push({ code: 'structural:legality_forced',
    kind: 'structural', detail: 'roster legality forced this pick' });
  if (((alt.onesie || {}).capped)) out.push({ code: 'structural:onesie_cap',
    kind: 'structural', detail: 'the alternative hit the onesie duplicate cap' });
  return out;
}

/* THE FORBIDDEN THING, MADE MECHANICAL.
 *
 * **NO EXPLANATION MAY CITE A FACTOR THAT HAD ZERO CAUSAL CONTRIBUTION.**
 * Returns the terms a sentence names whose delta is zero. Empty = compliant.
 *
 * Patterns are BROAD on purpose: a narrow matcher that missed a synonym would
 * report compliance it never tested. A false positive costs a rewording; a false
 * negative ships a lie.
 */
const TERM_WORDS = {
  value: /\b(value|vona|vorp|projec\w*)\b/i,
  tier: /\btier\b/i,
  need: /\b(need|fills?|empty\s+\w+\s+slot)\b/i,
  risk: /\b(risk|volatil\w*)\b/i,
  ceiling: /\b(ceiling|upside|boom)\b/i,
  bye: /\bbye\b/i,
  stack: /\bstack\w*\b/i,
  keeper: /\bkeeper\b/i,
};
/* ── THE CONVERSE INVARIANT: MOVED IS NOT DECISIVE ─────────────────────────
 *
 * The zero-delta detector alone leaves the SAME BUG at a lower threshold: every
 * tiny non-zero contribution gets promoted into a reason and the detector
 * passes. Cory's case — value +8.0, survival +0.1, gap 4.2 — survival technically
 * moved the decision, and "we took him because of survival" is still misleading.
 *
 * So there are three states, not two:
 *   ABSENT   delta 0            — may not be cited at all.
 *   MOVED    non-zero, |delta| < |gap| — may be cited as a SECONDARY
 *                                 consideration, never as the reason.
 *   DECISIVE |delta| >= |gap|   — removing it alone flips the pick. This is the
 *                                 only state an explanation may name as WHY.
 *
 * ── AND A FOURTH, WHICH THIS FUNCTION USED TO COERCE AWAY (B, 2026-08-13) ──
 *
 *   UNKNOWN  the gap itself is unusable — NaN, infinite, or zero.
 *
 * At pick 108 the engine returned NaN scores. `resolution()` correctly reported
 * UNKNOWN and `decision_significant` was correctly null: with no gap there is no
 * counterfactual to evaluate. But `contrib.decision_significant ? ... : 'moved'`
 * turned that null into `false` and then into MOVED, so EVERY non-zero term
 * reported itself a secondary consideration for a decision the contract had
 * just said it could not describe. A renderer trusting roleOf would have cited
 * value +62.4 and keeper +12.9 as "supporting factors" behind a NaN.
 *
 * That is the week's recurring shape — A NULL COERCING INTO A VALID-LOOKING
 * VALUE RATHER THAN REFUSING — and it is worse here than elsewhere, because the
 * contract's whole purpose is to be the thing a renderer can trust.
 *
 * UNKNOWN IS ITS OWN ROLE, not a variant of MOVED, and the ordering below is
 * deliberate: it is checked BEFORE the absent test, because under a NaN gap
 * even "this term contributed nothing" is a claim we cannot support. The
 * renderer contract is: UNKNOWN may be cited as neither reason nor secondary —
 * it may only be reported as unexplainable.
 */
function roleOf(contrib) {
  if (!contrib) return 'absent';
  if (contrib.decision_significant == null) return 'unknown';
  if (Math.abs(contrib.delta) < 1e-9) return 'absent';
  return contrib.decision_significant ? 'decisive' : 'moved';
}

/* Terms a sentence names that MOVED but were not DECISIVE. Empty = compliant as
 * a causal claim. A renderer may still mention these as secondary, which is why
 * this is a separate detector rather than folded into the zero check. */
function citesNonDecisive(sentence, contribs) {
  const s = String(sentence || '');
  const byTerm = {};
  (contribs || []).forEach(c => { byTerm[c.term] = c; });
  const weak = [];
  Object.keys(TERM_WORDS).forEach(term => {
    if (!TERM_WORDS[term].test(s)) return;
    if (roleOf(byTerm[term]) === 'moved') weak.push(term);
  });
  return weak;
}

/* Terms a sentence names while the gap is UNUSABLE. Empty = compliant.
 *
 * WITHOUT THIS THE UNKNOWN ROLE WOULD BE A HOLE RATHER THAN A FIX. Adding
 * 'unknown' to roleOf stops UNKNOWN masquerading as MOVED — but it also drops
 * those terms out of citesNonDecisive (they are no longer 'moved') while
 * citesZeroContribution never saw them either (their delta is non-zero). So a
 * sentence citing value under a NaN gap would have passed BOTH detectors, and
 * the contract would have certified as compliant the exact sentence it exists
 * to forbid. Naming the state without a detector for it is how a fix becomes a
 * quieter version of the bug.
 *
 * A term here may be cited as NEITHER reason NOR secondary consideration. The
 * only honest rendering under an unusable gap is that the decision cannot be
 * explained — which is a real thing to say, and a far better one than a
 * confident sentence about a NaN.
 */
function citesUnexplainable(sentence, contribs) {
  const s = String(sentence || '');
  const byTerm = {};
  (contribs || []).forEach(c => { byTerm[c.term] = c; });
  const bad = [];
  Object.keys(TERM_WORDS).forEach(term => {
    if (!TERM_WORDS[term].test(s)) return;
    if (roleOf(byTerm[term]) === 'unknown') bad.push(term);
  });
  return bad;
}

function citesZeroContribution(sentence, contribs) {
  const s = String(sentence || '');
  const byTerm = {};
  (contribs || []).forEach(c => { byTerm[c.term] = c; });
  const bad = [];
  Object.keys(TERM_WORDS).forEach(term => {
    if (!TERM_WORDS[term].test(s)) return;
    const c = byTerm[term];
    if (c && Math.abs(c.delta) < 1e-9) bad.push(term);
  });
  return bad;
}

/* ── (6) DEFERRAL — sourced, not invented ───────────────────────────────────*/
function deferral(grabby) {
  const g = grabby || {};
  return (g.positions || []).filter(p => p.need).map(p => ({
    position: p.position,
    status: p.verdict,                       // TAKE-NOW / GRAB-SOON / WAIT / NONE-LEFT
    until_pick: p.grab_by_pick == null ? null : p.grab_by_pick,
    cost_of_waiting_per_week: p.evlw_per_week == null ? null : p.evlw_per_week,
    what_would_change_it: p.grab_by_pick == null
      ? 'nothing measured — this position has no timing signal'
      : `the position emptying faster than modelled; recomputed every pick from `
        + `the live board`,
  }));
}

/* ── THE CONTRACT ───────────────────────────────────────────────────────────*/
function explain(opts) {
  const o = opts || {};
  const winner = o.winner;
  if (!winner || !winner.player) {
    throw new Error('decision_contract.explain: `winner` is required and must be a '
      + 'scored entry. An explanation with no decision in it is prose.');
  }
  const alt = o.alternative || null;
  const gap = winner.gap_to_second != null ? Number(winner.gap_to_second)
    : (alt && alt.score != null ? Number(winner.score) - Number(alt.score) : null);
  const contribs = contributions(winner, alt, gap);
  const res = resolution(gap, o.cfg);

  return {
    contract: 'decision-explanation-v1',
    /* (5) EVIDENCE — the reproducible half. Same engine state, same facts. */
    evidence: {
      decision: { player_id: String(winner.player.player_id),
        name: winner.player.name || null, position: winner.player.position || null,
        score: winner.score },
      alternative: alt && alt.player
        ? { player_id: String(alt.player.player_id), name: alt.player.name || null,
            position: alt.player.position || null, score: alt.score }
        : null,
      gap: gap,
      resolution: res,
      contributions: contribs,
      causes: causes(winner, alt, contribs),
      deferral: deferral(o.grabby),
      survival: { value: winner.survival_to_next == null ? null : winner.survival_to_next,
        calibration: SURVIVAL_CALIBRATION },
      shares_note: 'share_of_gap CAN EXCEED 1 and can be negative. When terms pull '
        + 'against each other the gap is a small residue of large opposing forces. '
        + 'A renderer must not assume shares sum to one.',
    },
    /* (9) PRESENTATION — deliberately null. The renderer's job, per consumer. */
    presentation: null,
    invariant: 'no explanation may cite a factor whose delta is zero — use '
      + 'citesZeroContribution() against every sentence before rendering it',
  };
}

const api = { explain, contributions, resolution, causes, deferral,
  citesZeroContribution, citesNonDecisive, citesUnexplainable, roleOf,
  TERM_WORDS, CALIBRATION, SURVIVAL_CALIBRATION };
global.DecisionContract = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
