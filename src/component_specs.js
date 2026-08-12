// TERRITORY: A
/* THE COMPONENT ROWS, DECLARED BEFORE ANY OF THEM RESOLVES.
 *
 * `component_grade.js` computes a verdict. This file says WHAT IS BEING GRADED,
 * what counts as material, what the independent unit is, and — for each of the
 * three outcomes — what it would mean for how to draft or set a lineup.
 *
 * ALL OF IT IS WRITTEN NOW, WHILE EVERY ROW IS EMPTY. A materiality bar chosen
 * after seeing the effect is a bar chosen to clear or to fail; an implication
 * written after the verdict is a rationalisation that reads exactly like a
 * prediction. Same discipline as `resolution_rule` on the forecast rail, applied
 * one level up.
 *
 * ── THE CLUSTER IS NOT ALWAYS THE WEEK, AND GETTING IT WRONG IS THE WHOLE GAME
 *
 * Measured: treating correlated observations as independent runs the
 * false-positive rate from 4.7% to 11.1%. So every row names its independent
 * unit explicitly rather than inheriting one:
 *
 *   · in-season rows cluster by WEEK — player-weeks share a slate.
 *   · SURVIVAL clusters by DRAFT — a run on running backs moves every survival
 *     forecast in that window together. Clustering survival by player-forecast
 *     would produce thousands of "independent" observations and a floor several
 *     times too small, which is the exact false precision this project has spent
 *     weeks removing.
 *
 * ── SURVIVAL, RESIZED 2026-08-12 AGAINST THE SAMPLE THAT WILL ACTUALLY EXIST ─
 *
 * THIS ROW WAS WRITTEN ASSUMING "a few hundred external leagues". That was wrong
 * and it was my number, not a measured one. C's Route 1 ceiling is TENS of
 * qualifying drafts in one season, and the figure today is ZERO. An order of
 * magnitude in the sample is not a caveat on a spec — it decides what the row is
 * allowed to say.
 *
 * MEASURED, not argued (draft/backtest/survival_power.py, cluster = draft,
 * 30 forecasts per draft, a shared per-draft shock because a positional run
 * moves every forecast in the window together):
 *
 *     clusters │ detectable-effect floor (Brier)
 *           10 │ 0.0199   — at the materiality bar. Not enough.
 *           20 │ 0.0109   — roughly half the bar. ENOUGH.
 *           40 │ 0.0071
 *          100 │ 0.0051
 *
 * So against the declared bar of 0.02 Brier, **twenty replayed drafts is
 * sufficient and ten is not**. That is inside C's ceiling rather than outside
 * it, which is the opposite of what "resize down" implied — and it is only true
 * because the bar was declared before the numbers arrived.
 *
 * `min_clusters` is therefore part of the spec. Below it the row reports
 * `too_thin` and carries NO implication, which is the whole point of the
 * distinction: a null at twelve drafts would otherwise read exactly like a null
 * at two hundred.
 *
 * AND THE CLUSTERING DECLARATION MATTERS MORE AT THIS SIZE, NOT LESS. Treating
 * each forecast as independent turns 20 drafts into ~600 "observations" and
 * shrinks the floor by about sqrt(30) — a factor of five and a half of pure
 * fiction. At three hundred clusters that error is embarrassing; at twenty it is
 * the difference between measuring something and reporting that you did.
 *
 * THE FLOOR ABOVE IS OPTIMISTIC AT THE SMALL END, stated rather than buried: the
 * test uses 1.96 rather than a t critical value, and its false-positive rate at
 * 10 clusters measures 6.7% against a nominal 5%. That pushes the k=10 row
 * further below the bar, not closer to it.
 *
 * ── AND C's MEASURED SUPPLY, WHICH DECIDES WHETHER 20 IS EVER REACHED ───────
 *
 * C routed the numbers (PARKED, 2026-08-12) and they are better than the relay
 * on one axis and worse on the other:
 *
 *   · CONFIRMED, and generous: ONE replayed draft yields **60 forecasts, 40
 *     resolved**, with no outcome data used. This file's floor was computed at
 *     30 per draft, so it is CONSERVATIVE on that axis.
 *   · CONTRADICTED: external qualifying drafts measured **0** — twice, against
 *     real pools (394 attempted / 0 matched in 2025; 293 / 0 in 2026, every one
 *     of the 266 readable leagues rejected by F1 on FORMAT before any other
 *     clause was reached). F7 is answered and the answer is negative.
 *
 * SO THE HONEST SUPPLY TODAY IS ONE CLUSTER PER SEASON — our own draft — and
 * zero from replay. Against `min_clusters: 20` that means **the survival row
 * reads `too_thin` for the foreseeable future, and that is the correct output
 * rather than a disappointment.** It is exactly the distinction this surface was
 * built to make: "we cannot detect a difference" reported as itself, instead of
 * a null at n=1 wearing the clothes of a null at n=200.
 *
 * The floor table is not wasted by that. It converts an open-ended "we need more
 * drafts" into a STATED, FALSIFIABLE THRESHOLD — twenty — which is what any
 * future source (non-MFL, or a dated re-registered F1, or Route 1's board
 * series) now has to clear to make this row speak. Cory is not changing F1, so
 * the threshold is a bar on the source, not an invitation to relax a filter.
 *
 * WHY IT STILL MATTERS AT ALL, WHICH IS THE COMPOSITION POINT: VONA is computed
 * FROM survival, and survival was ranked third among the things most likely to
 * be wrong. If external replay calibrates survival, VONA firms up and the whole
 * draft-side valuation firms up with it — WITHOUT ANY STRATEGY COMPARISON EVER
 * RUNNING.
 *
 * That is the composition mechanism, stated concretely rather than as a
 * principle: a component finding, followed to its implication, moves a
 * strategy-level quantity that no strategy-level experiment in this league has
 * the power to move.
 *
 * NOTE ON THE HONEST LIMIT, carried here rather than discovered later: mock and
 * external drafts deplete more ADP-strictly than our own room does, so a
 * survival curve calibrated on them may run slightly optimistic against a noisy
 * live league. The row is graded and reported with that stamp; it is a bias of
 * known sign, which is far better than the ungraded state it replaces.
 */
'use strict';

/* Each spec is exactly the argument `gradeComponent` refuses to run without,
 * plus the two fields that make the row readable a year later. */
const SPECS = {
  survival: {
    claim: 'P(this player is still available at my next pick), from the board '
      + 'depletion model the war room shows beside every name.',
    // Resolvable from the draft's own later picks. No outcomes, no January.
    resolves_from: 'the replayed draft\'s own subsequent picks',
    cluster_is: 'draft',
    // MEASURED, see the header. Below this the row is `too_thin` and carries no
    // implication — 20 drafts puts the floor at 0.0109 Brier against a declared
    // bar of 0.02; 10 drafts puts it at 0.0199, which is the bar itself.
    min_clusters: 20,
    // A probability, so the metric is Brier and the bar is in Brier units.
    // 0.02 is roughly the difference between a curve that is useful for a
    // wait-or-take call and one that is decoration.
    material: 0.02,
    baseline: 'the base rate — the share of comparable players who survived the '
      + 'same window. A survival model that cannot beat the base rate is a '
      + 'restatement of it.',
    implication: {
      earning: 'TRUST THE WAIT. A calibrated survival curve makes "he will still '
        + 'be there" an actual decision rather than a hope — take the scarcer '
        + 'position first and come back for the one the curve says survives. It '
        + 'also firms up VONA, which is computed FROM survival, and therefore the '
        + 'whole draft-side valuation, without any strategy test running.',
      hurting: 'STOP LETTING SURVIVAL DECIDE WAIT-OR-TAKE, and treat every VONA '
        + 'number as suspect for the same reason — VONA rides entirely on this. '
        + 'Fall back to the base rate, which is at least honest, and take the '
        + 'player rather than the option on the player.',
      noise: 'The curve is not adding to the base rate. Draft as though survival '
        + 'were flat: assume the market takes players in roughly ADP order and '
        + 'stop paying attention to per-player survival differences.',
    },
  },

  projection: {
    claim: 'proj_mean predicts a player\'s realized weekly points.',
    resolves_from: 'the weekly box score',
    cluster_is: 'week',
    material: 1.0,                 // points per player-week
    baseline: 'last season\'s per-game average, the cheapest honest predictor',
    implication: {
      earning: 'Keep ranking by projection, and widen its weight against ADP in '
        + 'the rounds where the two disagree most (measured: rounds 4-9).',
      hurting: 'The board is worse than a naive prior. Anchor harder on the '
        + 'market and treat our own projection as a tiebreak, not a ranking.',
      noise: 'Projection is not beating a naive prior at a size worth acting on. '
        + 'Stop treating small projection gaps as reasons to move a player.',
    },
    // Graded BY POSITION as well as pooled, because the two projection sources
    // already disagree ~20% at WR and TE and 2% at QB and RB (DECISIONS-NEEDED
    // entry 000). A pooled row would average that away.
    split_by: 'position',
  },

  opportunity_adj: {
    claim: 'The opportunity adjustment (±15%, from target share and WOPR) '
      + 'improves on the raw projection.',
    resolves_from: 'the weekly box score',
    cluster_is: 'week',
    material: 1.0,
    baseline: 'proj_baseline — the same projection WITHOUT the adjustment',
    implication: {
      earning: 'Lean on it, and revisit the ±15% clamp: 1.6% of the board sits '
        + 'ON the cap today, all of it upper, so a term that earns is being '
        + 'held back at exactly the players it is most confident about.',
      hurting: 'REMOVE IT. That is a strategy change reached without a strategy '
        + 'comparison — the board reverts to proj_baseline and every VORP, tier '
        + 'and dollar figure moves with it.',
      noise: 'It is decoration. Remove it for legibility rather than for points; '
        + 'a term nobody can show is working teaches distrust of the panel.',
    },
  },

  consensus: {
    claim: 'The two-source blend predicts better than either source alone.',
    resolves_from: 'the weekly box score',
    cluster_is: 'week',
    material: 1.0,
    baseline: 'FantasyPros alone, and Sleeper alone — graded against BOTH, '
      + 'because beating one and losing to the other is a different finding '
      + 'from beating both',
    implication: {
      earning: 'Keep both sources and treat their DISAGREEMENT as information — '
        + 'the single-source mark on the board becomes a real warning rather '
        + 'than a provenance note.',
      hurting: 'CHANGE THE ANCHOR to whichever source wins. The blend is '
        + 'averaging a systematic positional disagreement rather than two '
        + 'opinions, and that is already suspected at WR and TE.',
      noise: 'The blend is not buying accuracy. Keep it for robustness against a '
        + 'single provider failing, and stop claiming it as an edge.',
    },
    split_by: 'position',
  },

  replacement: {
    claim: 'Replacement level — the VORP subtrahend — sits where the actual '
      + 'startable/not-startable boundary falls.',
    resolves_from: 'realized weekly starts across the league',
    cluster_is: 'week',
    material: 2.0,                 // points of replacement level
    baseline: 'the shipped per-position replacement, as frozen on draft day',
    implication: {
      earning: 'Take the best VORP across positions and stop second-guessing it '
        + 'with positional feel — QB against RB against WR at the same pick is '
        + 'the one comparison VORP exists to make, and it is trustworthy.',
      hurting: 'Stop drafting off cross-position VORP — it is wrong by the size '
        + 'of the error and every dollar figure inherits it. Draft within '
        + 'position off projection, and re-derive replacement from realized '
        + 'starts rather than from projected rank.',
      noise: 'Replacement is roughly right. Stop tuning it and spend the '
        + 'attention on projection, which feeds it.',
    },
  },

  weekly_claims: {
    claim: 'The matchup win probabilities emitted every week are calibrated.',
    resolves_from: 'the final weekly scores',
    cluster_is: 'week',
    material: 0.02,                // Brier
    baseline: 'a flat 50% on every matchup',
    implication: {
      earning: 'Set the Sunday lineup off the playoff-odds surface — chase '
        + 'variance when it says the matchup is lost and protect when it says '
        + 'the matchup is won, rather than always maximising points.',
      hurting: 'Do not act on the playoff odds. They are worse than assuming '
        + 'every matchup is a coin flip, which is a strong claim and an easy '
        + 'fallback.',
      noise: 'The odds are no better than 50/50 at a size worth acting on. Use '
        + 'them as decoration, never as the reason to start a risky player.',
    },
  },
};

/* The argument `gradeComponent` wants, assembled from a spec so a caller cannot
 * quietly substitute a friendlier materiality bar or a freshly-written
 * implication at grading time. */
function specFor(name) {
  const s = SPECS[name];
  if (!s) {
    throw new Error(`component_specs: no spec for "${name}". A component graded `
      + 'without a declared spec has its materiality bar and its behavioural '
      + 'implication chosen after the numbers are in, which is the failure the '
      + 'spec file exists to prevent.');
  }
  return { name: name, material: s.material, implication: s.implication,
    cluster_is: s.cluster_is, baseline_is: s.baseline };
}

module.exports = { SPECS, specFor };
