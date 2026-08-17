// TERRITORY: A
/* "NO UPSIDE", OPERATIONALISED — Cory's barbell hypothesis given a definition
 * that is made of measurements rather than of adjectives.
 *
 * Cory, 2026-08-17, verbatim:
 *   "It almost feels like it's useful to draft middle tier players with no
 *    upside.. either they're a starter who is average or above (go in first 8
 *    rounds) or you need to draft upside or injury opportunity?"
 *
 * That sentence names three kinds of player and the middle one is the claim.
 * To test it, "upside" has to stop being a feeling. This module is the whole
 * definition, and it is deliberately small: two committed measurements, one
 * comparison, three labels.
 *
 * ── THE TWO MEASUREMENTS ────────────────────────────────────────────────────
 *
 * 1. `draft/backtest/projection_error_calibration.json` — the MEASURED
 *    distribution of `realized / projected`, 1,304 graded player-seasons over
 *    2023-25, per (position x projection-rank-within-position band). It gives
 *    `p50_ratio` (the median outcome as a multiple of the projection) and
 *    `p90_ratio` (the top-decile outcome). THIS IS THE REAL INSTRUMENT, and
 *    the reason it is used here rather than the board's own spread columns:
 *
 *      - `proj_sd` on the live board IS measured now (`proj_sd_source ==
 *        "measured-2023-25-error"` for 530 of 682 rows, from this same
 *        calibration via projections.py:303) — the older warning that it is a
 *        `proj_mean x variance` heuristic is STALE for skill players and holds
 *        only for K/DEF and unranked rows;
 *      - but `proj_ceiling` is NOT measured. It is
 *        `mean + CEILING_Z * proj_sd` (projections.py:318) — a SYMMETRIC
 *        Gaussian ceiling laid over a distribution the calibration shows is
 *        violently right-skewed. RB|33+ measures p10 0.021 / p50 0.345 /
 *        p90 1.434 against a mean of 0.573: the median late back returns a
 *        THIRD of his projection and the tenth one returns 1.4x it. A Gaussian
 *        ceiling cannot represent that, and "upside" is exactly the quantity
 *        it flattens. So the ratios are read straight, never through
 *        proj_ceiling.
 *
 * 2. `draft/backtest/empirical_draft_value.json` ->
 *    `q6_allocation.realized_replacement_used` — the OUTCOME-space replacement
 *    level, i.e. the pooled 2023-25 realized points of the player who finished
 *    at each position's league starter rank (RB21 / WR29 / QB10 / TE10).
 *    QB 330.1, RB 170.8, WR 155.0, TE 124.1.
 *
 * ── WHY BOTH SIDES MUST BE IN OUTCOME SPACE, which is the one trap here ─────
 *
 * `proj_mean` is a PROJECTION. `proj_mean x p50_ratio` is a REALIZED-POINTS
 * quantity, because the ratio's denominator is the projection. So the
 * threshold it is compared against must also be realized points — which is
 * why the board's own `replacement_points` (QB 341.72 / RB 189.10 / WR 173.27
 * / TE 151.95) are NOT used here: those are projection-space levels, and
 * empirical_draft_value §6.1 measured the two spaces to differ by +11.6 to
 * +27.9 points depending on position. Mixing them would build a positional
 * bias of up to 16 points straight into the class boundary.
 *
 * ── THE DEFINITION ──────────────────────────────────────────────────────────
 *
 * For a board row with a position, a within-position projection rank and a
 * projection, let R(pos) be the outcome-space replacement above and let
 * (p50, p90) be the measured ratios for that row's (position, rank band):
 *
 *   ANCHOR   proj_mean * p50 >= R(pos)
 *            His MEDIAN season is a league starter. Cory's "a starter who is
 *            average or above".
 *
 *   SWING    proj_mean * p50 < R(pos) <= proj_mean * p90
 *            His median season is not a starter, but a top-decile season is.
 *            Cory's "upside or injury opportunity" — the pick is a lottery
 *            ticket whose winning outcome is a real starting asset.
 *
 *   DEAD     proj_mean * p90 < R(pos)
 *            EVEN A TOP-DECILE SEASON DOES NOT REACH STARTER LEVEL. This is
 *            "no upside" with the adjective removed: not "he probably will not
 *            hit", but "the measured distribution of outcomes for players
 *            priced like him does not contain a startable one at 1-in-10".
 *
 * ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────
 *
 * A row the calibration cannot price returns `UNMEASURED`, never a class. That
 * is absent-is-not-zero applied at the boundary that matters most here: an
 * unmeasured row silently labelled DEAD would let a coverage gap masquerade as
 * a finding about players, and every consumer in this repo treats DEAD as a
 * reason not to draft someone. K and DEF return `NA` — the calibration is
 * offence-only and their timing belongs to the engine's own rails, not to a
 * construction overlay.
 *
 * Pure module: reads two committed artifacts once, no engine import, no
 * globals, no writes.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CAL_PATH = path.join(ROOT, 'draft', 'backtest', 'projection_error_calibration.json');
const EDV_PATH = path.join(ROOT, 'draft', 'backtest', 'empirical_draft_value.json');

/** Rank edges WITHIN a position — projection_error.BAND_EDGES, mirrored here
 *  because this module is JS and that one is Python. The mirror is not a
 *  convention: `test_band_edges_match_the_python_producer` reads the literal
 *  out of projection_error.py and fails if the two ever drift. */
const BAND_EDGES = [3, 8, 16, 32];

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const ONESIE = { K: true, DEF: true };

const CLASSES = { ANCHOR: 'ANCHOR', SWING: 'SWING', DEAD: 'DEAD',
  UNMEASURED: 'UNMEASURED', NA: 'NA' };

/** The band label for a within-position projection rank (mirrors
 *  projection_error.band_of exactly, including its `unranked` refusal). */
function bandOf(rank) {
  if (rank == null) return 'unranked';
  const r = Math.trunc(Number(rank));
  let lo = 1;
  for (const hi of BAND_EDGES) {
    if (r <= hi) return lo + '-' + hi;
    lo = hi + 1;
  }
  return lo + '+';
}

let _cal = null;
/** The measured error calibration's cells, {"POS|band": {...}}. */
function calibration() {
  if (_cal === null) {
    const raw = JSON.parse(fs.readFileSync(CAL_PATH, 'utf8'));
    if (!raw.cells || !Object.keys(raw.cells).length) {
      throw new Error('upside_class: calibration has no cells — refusing to classify');
    }
    _cal = raw;
  }
  return _cal;
}

let _repl = null;
/** Outcome-space replacement per position, from the empirical study's own
 *  artifact. Never hardcoded here: the study can be re-run and this must
 *  follow it, and a stale copy is the dual-maintenance defect this repo has
 *  found a dozen times. */
function replacement() {
  if (_repl === null) {
    const raw = JSON.parse(fs.readFileSync(EDV_PATH, 'utf8'));
    const r = ((raw.q6_allocation || {}).realized_replacement_used) || null;
    if (!r) {
      throw new Error('upside_class: empirical_draft_value.json carries no '
        + 'q6_allocation.realized_replacement_used — refusing to invent a threshold');
    }
    for (const pos of POSITIONS) {
      if (!(Number(r[pos]) > 0)) {
        throw new Error('upside_class: no outcome-space replacement for ' + pos);
      }
    }
    _repl = r;
  }
  return _repl;
}

/** The measured cell for a (position, within-position projection rank), or
 *  null when the calibration does not price it. */
function cellFor(pos, rank) {
  const c = calibration().cells[pos + '|' + bandOf(rank)];
  if (!c || c.status !== 'measured') return null;
  if (c.p50_ratio == null || c.p90_ratio == null) return null;
  return c;
}

/** The within-position projection rank the calibration's band is defined on.
 *  The board's `pos_rank` IS that ordering (proj_mean desc within position —
 *  vorp.assign_tiers writes it, projections.py:253 pins the requirement, and
 *  `test_pos_rank_is_the_calibration_band_ordering` re-derives it from the
 *  shipped board). Falls back to `proj_rank` if a caller supplies a bare row. */
function rankOf(p) {
  if (p == null) return null;
  if (p.pos_rank != null) return Number(p.pos_rank);
  if (p.proj_rank != null) return Number(p.proj_rank);
  return null;
}

/** The measured outcome-space median and top-decile seasons for a board row,
 *  in realized points. Returns null when the row cannot be priced. */
function outcomeBand(p) {
  if (!p || !p.position) return null;
  if (POSITIONS.indexOf(p.position) < 0) return null;
  const mean = Number(p.proj_mean);
  if (!(mean > 0)) return null;
  const cell = cellFor(p.position, rankOf(p));
  if (!cell) return null;
  return {
    band: bandOf(rankOf(p)),
    n: cell.n,
    p50: mean * Number(cell.p50_ratio),
    p90: mean * Number(cell.p90_ratio),
    replacement: Number(replacement()[p.position]),
  };
}

/**
 * The class of a board row: ANCHOR | SWING | DEAD | UNMEASURED | NA.
 * Never throws on a row it cannot price — it says so instead.
 */
function classify(p) {
  if (!p || !p.position) return CLASSES.UNMEASURED;
  if (ONESIE[p.position]) return CLASSES.NA;
  const ob = outcomeBand(p);
  if (!ob) return CLASSES.UNMEASURED;
  if (ob.p50 >= ob.replacement) return CLASSES.ANCHOR;
  if (ob.p90 >= ob.replacement) return CLASSES.SWING;
  return CLASSES.DEAD;
}

/** Counts by class over a list of rows — the non-vacuity readout every
 *  consumer should print before believing an arm built on this. */
function census(players) {
  const out = { ANCHOR: 0, SWING: 0, DEAD: 0, UNMEASURED: 0, NA: 0 };
  (players || []).forEach(p => { out[classify(p)] += 1; });
  return out;
}

module.exports = { CLASSES, BAND_EDGES, POSITIONS, bandOf, cellFor, rankOf,
  outcomeBand, classify, census, calibration, replacement };
