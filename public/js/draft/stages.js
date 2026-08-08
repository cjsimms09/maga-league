/* THE DECISION TREE — an ordered, auditable set of stages.
 *
 * Replaces "composite-then-explain" with a structure that produces the SAME
 * answer for the same board every time and SHOWS which branch fired. The point
 * is not new arithmetic; it is that a recommendation can name where it came
 * from, so a disagreement has an address.
 *
 *   STAGE 1  LEGALITY & CONSTRUCTION FLOOR   hard gates, never overridden
 *   STAGE 2  CONSENSUS BASELINE              market order; the default answer
 *   STAGE 3  DOCTRINE TILT                   the enrolled plan, bounded
 *   STAGE 4  EDGE INTERVENTION               named edges that can override
 *   STAGE 5  CONFIDENCE & SIZING             what fired, how sure, how far
 *
 * ── WHY STAGE 4 SHIPS AT A FLOOR ──────────────────────────────────────────
 *
 * Experiment 34 is blocked (D13: no historical ADP, no archived decision-time
 * projections), so the reliability numbers that were meant to size Stage 4 do
 * not exist. PRE-REGISTRATION-34.md already committed to the answer BEFORE that
 * was known: Stage 4 STARTS SMALL AND EARNS UP per measured edge class, rather
 * than starting loud and being tuned down.
 *
 * So Stage 4 exists, fires, and is deliberately at its minimum — and it SAYS SO
 * on the surface. An unsized intervention is NOT the same claim as a sized one,
 * and rendering them identically would let a floor-magnitude deviation read as a
 * confident one. Same principle as the tier-voice sentence: the surface reports
 * what the evidence actually supports.
 *
 * `sized: false` is therefore load-bearing, not metadata. It is set here, in one
 * place, and `stages.test.js` asserts no Stage-4 result can claim otherwise
 * while EDGE_SIZING stays 'floor'.
 */
(function (global) {
  'use strict';

  var STAGES = {
    LEGALITY:   { n: 1, key: 'legality',   label: 'legality floor' },
    BASELINE:   { n: 2, key: 'baseline',   label: 'consensus baseline' },
    DOCTRINE:   { n: 3, key: 'doctrine',   label: 'doctrine tilt' },
    EDGE:       { n: 4, key: 'edge',       label: 'edge intervention' },
    CONFIDENCE: { n: 5, key: 'confidence', label: 'confidence & sizing' },
  };

  /* THE SIZING STATE OF STAGE 4, in one place.
   *
   * 'floor'  — magnitudes are at their minimum, PENDING MEASUREMENT. Every
   *            Stage-4 result carries sized:false and the surface must say so.
   * 'sized'  — an experiment has measured the edge class and its magnitude was
   *            widened deliberately. Only ever set alongside the evidence.
   *
   * Flipping this without measurement is the same error as flipping the
   * doctrine's GOVERNS flag without wiring the tilt — a label claiming a state
   * the system is not in. stages.test.js polices it the same way.
   */
  var EDGE_SIZING = 'floor';
  function edgeSizing() { return EDGE_SIZING; }
  function isSized() { return EDGE_SIZING === 'sized'; }

  /** The sentence the card must show when a floor-level edge fires. */
  function sizingVoice() {
    return isSized()
      ? 'sized to its measured edge class'
      : 'AT MINIMUM — magnitude unsized pending measurement (exp 34 blocked, D13)';
  }

  /**
   * Build the stage report attached to a recommendation.
   *
   * `stage` is one of STAGES.*; `detail` is the stage's own explanation.
   * A Stage-4 result can NEVER report sized:true while EDGE_SIZING is 'floor' —
   * the flag is derived here rather than passed in, so no caller can assert a
   * confidence the system has not earned.
   */
  function report(stage, detail) {
    if (!stage || !stage.key) return null;
    var out = {
      stage: stage.n,
      key: stage.key,
      label: stage.label,
      detail: detail || null,
      sized: null,
      sizing_line: null,
    };
    if (stage.key === 'edge') {
      out.sized = isSized();                 // DERIVED, never supplied
      out.sizing_line = sizingVoice();
    }
    return out;
  }

  /** One line for the surface: which stage produced this, and how sure. */
  function line(rep) {
    if (!rep) return 'source: not yet staged';
    if (rep.key !== 'edge') return 'Stage ' + rep.stage + ' — ' + rep.label;
    return '⚡ Stage 4 — ' + rep.label + ' · ' + rep.sizing_line;
  }

  var api = { STAGES: STAGES, report: report, line: line,
              edgeSizing: edgeSizing, isSized: isSized, sizingVoice: sizingVoice };
  global.DraftStages = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
