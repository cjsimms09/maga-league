// DERIVED EVIDENCE WEIGHTING (JS live path) — weight is a FUNCTION, not a hand tier.
//
// JS port of draft/backtest/evidence_weight.py (kept as reference) so the weekly loop
// can CONSUME the calibration ledger in the same runtime that writes it. This is the
// difference between a record of accuracy and a model that CHANGES because of it (#5):
// league evidence gains weight as its precision grows (more graded decisions → tighter
// se → more weight, automatically); external is discounted by measured transferability².
//
// consumeCalibration() is the wire: it turns the accumulated calibration ledger into the
// LEAGUE precision input and recombines — so every weekly grade nudges the weights.

'use strict';

const PLACEHOLDER_TRANSFER = 0.25;

function precision(se) {
  if (se === null || se === undefined || se <= 0) return 0;
  return 1 / (se * se);
}

function seFromCi(lo, hi) {
  if (lo === null || lo === undefined || hi === null || hi === undefined) return null;
  return Math.abs(hi - lo) / 3.92;
}

function combine(league, external, transferability) {
  const wl = precision(league.se);
  const placeholder = transferability === null || transferability === undefined;
  const t = placeholder ? PLACEHOLDER_TRANSFER : Math.max(0, Math.min(1, transferability));
  const we = t * t * precision(external.se);
  const tot = wl + we;
  if (tot <= 0) {
    return { posterior: league.estimate, weights: { league: 0, external: 0 }, dominant: 'none',
      transferability: placeholder ? null : t, transferability_is_placeholder: placeholder };
  }
  const shareL = wl / tot, shareE = we / tot;
  const le = league.estimate, ee = external.estimate;
  const post = (le !== undefined && le !== null && ee !== undefined && ee !== null)
    ? Math.round((shareL * le + shareE * ee) * 1e4) / 1e4
    : (le !== undefined && le !== null ? le : ee);
  return {
    posterior: post,
    weights: { league: Math.round(shareL * 1e3) / 1e3, external: Math.round(shareE * 1e3) / 1e3 },
    dominant: wl >= we ? 'league' : 'external',
    transferability: placeholder ? null : Math.round(t * 1e3) / 1e3,
    transferability_is_placeholder: placeholder,
    record: { n_league: league.n, se_league: league.se, n_external: external.n, se_external: external.se,
      t, w_league: Math.round(shareL * 1e3) / 1e3, w_external: Math.round(shareE * 1e3) / 1e3 },
  };
}

// #5 THE CONSUME: derive league precision from the calibration ledger and recombine with
// an external finding. The ledger's graded sample size n and dispersion give the league se
// (se ~= dispersion/sqrt(n)); as graded decisions accumulate weekly, se shrinks and league
// weight rises on its own — nobody edits a constant. Returns the combined weighting plus
// the derived league se so the trajectory shows what moved.
function consumeCalibration(calibrationLedger, external, opts) {
  opts = opts || {};
  // pool every graded snapshot: total graded n, and a dispersion proxy. For probability
  // claims, Brier's spread; for point claims, the MAE; default to a unit dispersion.
  let n = 0;
  let dispSum = 0, dispN = 0;
  for (const snap of calibrationLedger || []) {
    const f = snap.forecasts || snap;   // tolerate a raw scorecard or a wrapped snapshot
    const gained = (f.n_graded || 0) + ((snap.decisions || {}).scored || 0);
    n += gained;
    if (f.probability && f.probability.brier !== null && f.probability.brier !== undefined) {
      dispSum += Math.sqrt(f.probability.brier); dispN += 1;   // Brier is a variance-like term
    } else if (f.point && f.point.mae !== null && f.point.mae !== undefined) {
      dispSum += f.point.mae; dispN += 1;
    }
  }
  const dispersion = dispN ? dispSum / dispN : (opts.dispersion || 0.5);
  const leagueSe = n > 0 ? dispersion / Math.sqrt(n) : null;
  const league = { estimate: opts.leagueEstimate ?? null, se: leagueSe, n };
  const combined = combine(league, external || { estimate: null, se: null, n: 0 }, opts.transferability ?? null);
  return { league_se: leagueSe, graded_n: n, dispersion: Math.round(dispersion * 1e4) / 1e4, combined };
}

module.exports = { precision, seFromCi, combine, consumeCalibration, PLACEHOLDER_TRANSFER };
