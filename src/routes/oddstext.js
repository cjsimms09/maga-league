// ─────────────────────────────────────────────────────────────────────────────
// HOW A PROBABILITY IS PRINTED — one definition, because two surfaces disagreeing
// about whether a live team is at zero is two different answers to the same
// question.
//
// The rule: CERTAINTY IS A PROPERTY OF THE DERIVATION, NOT OF THE VALUE.
//
// /matchup printed a flat "0%" for a 2–10 team with eight games left. It got
// there honestly: playoffs.simOdds is a 4,000-iteration Monte Carlo, that team
// went 0-for-4,000, and 0/4000 is exactly 0. But a sample of 4,000 does not
// prove a team is out — it proves the odds are under about 1-in-4,000 — and the
// page asserted elimination for a team that could still finish 10–10. The same
// function returns a REAL 0 or 1 when the season is over and the table is
// final (simOdds' gamesLeft === 0 branch), which is a fact. The value is
// identical in both cases; only the caller knows which it is.
//
// So `exact` must be passed in by whoever knows. Without it, 0 and 1 print as
// bounds — which costs nothing when the odds really are tiny, and stops the
// page ending a season by rounding. Certainty that IS provable has its own
// surface: clinchElim's ELIMINATED / CLINCHED markers, which are computed from
// bounds ("can't possibly") rather than from a simulation.
//
// Live win probabilities (whatwatch's sweat meter) are a Normal-model output and
// are NEVER exact — P(win) of 1.3e-14 is the model's opinion about a 53-point
// hole, not a fact about football, and the panel exists to be read while the
// ball is still in the air.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

/**
 * A probability as text a reader can trust.
 *
 * @param p      probability 0..1 (null/NaN → '—')
 * @param exact  true only when the CALLER can prove the value is a certainty
 *               and not a sampling artifact. Default false.
 * @returns '<1%' | '>99%' | '0%' | '100%' | 'N%' | '—'
 */
function pctText(p, exact = false) {
  const n = Number(p);
  if (p == null || !Number.isFinite(n)) return '—';
  if (n <= 0) return exact ? '0%' : '<1%';
  if (n >= 1) return exact ? '100%' : '>99%';
  if (n < 0.005) return '<1%';
  if (n > 0.995) return '>99%';
  return Math.round(n * 100) + '%';
}

/**
 * What a figure printed by pctText PROVES about the real percentage, as
 * [lo, hi] in percentage points. The inverse of the function above, so anything
 * DERIVED from two printed figures can be held to what they actually support
 * rather than to values the reader never saw.
 */
function pctSpan(t) {
  if (t === '<1%') return [0, 1];
  if (t === '>99%') return [99, 100];
  if (t === '0%') return [0, 0];
  if (t === '100%') return [100, 100];
  const n = parseFloat(t);
  return Number.isFinite(n) ? [n - 0.5, n + 0.5] : [0, 100];
}

/** True when a printed figure is a bound rather than a number. */
const isBound = t => t === '<1%' || t === '>99%';

module.exports = { pctText, pctSpan, isBound };
