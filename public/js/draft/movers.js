// TERRITORY: A
/* ADP MOVERS — who the market is re-pricing fastest, both directions.
 *
 * Cory (2026-08-16, verbatim): "Do we have way to capture quick movement in
 * ADPs. Players moving up or down quickly, might be good to identify as could
 * hint at some new, movement, or development. Maybe a small screen on war room
 * showing the top 10 ADP movers up and top 10 down?"
 *
 * The data already exists: build.py stamps `adp_velocity` on every board
 * player from the RETAINED daily ADP series (draft/adp_series.py) — POSITIVE =
 * RISING (ADP number falling toward an earlier pick), measured over the whole
 * retained window (`notes.adp_series_span_days`). `adp_stale` is the alarm the
 * series powers: a move of ≥8 slots means the board's own number for that
 * player is materially behind the market. This module only SORTS AND LABELS
 * what the build stamped — it computes no new market quantity and feeds no
 * score. NOT a tested momentum edge (adp_series.py's own header: momentum
 * prediction is recorded as blocked, not attempted) — these are names to
 * INVESTIGATE, which is exactly what Cory asked the panel for.
 *
 * ABSENT, NOT ZERO. Day one of a fresh series every velocity is None, and the
 * honest render is "series too shallow", never a wall of zeros. A player with
 * velocity null is EXCLUDED from both lists; a board with nobody measurable
 * returns state 'shallow' so the renderer can say so.
 *
 * Pure. No DOM, no state, no fetch. app.js renderAdpMovers() prints what this
 * returns; ui_fidelity_movers.test.js pins ordering, tie stability, the
 * null-exclusion rule, the shallow state and the stale flag through the real
 * renderer.
 */
(function (global) {
  'use strict';

  var DEFAULT_N = 10;

  /* movers(players, opts) -> {
   *   state:   'ok' | 'shallow'   (shallow: nobody carries a measured velocity)
   *   span:    days the velocity window covers (opts.span, from the artifact's
   *            notes.adp_series_span_days; null when the caller has none)
   *   counted: how many players carry a non-null velocity
   *   up:      top N risers  (velocity > 0), fastest first, ties input-stable
   *   down:    top N fallers (velocity < 0), fastest-falling first, ties stable
   * }
   * Row: { player, adp, velocity, per_day, stale }
   *   adp     = raw_adp (the market number the series tracks; null stays null)
   *   per_day = velocity / span to 1 decimal, null when span < 1 — a rate on a
   *             zero-day window would be invented, so it is absent instead.
   *   stale   = the build's own adp_stale flag ({direction, slots, days}|null)
   */
  function movers(players, opts) {
    opts = opts || {};
    var n = opts.n || DEFAULT_N;
    var span = (opts.span != null && opts.span >= 0) ? opts.span : null;
    var withV = [];
    (players || []).forEach(function (p, i) {
      if (!p || p.adp_velocity == null) return;   // absent ≠ zero: excluded, not 0
      withV.push({ p: p, v: Number(p.adp_velocity), i: i });
    });

    function row(e) {
      return {
        player: e.p,
        adp: e.p.raw_adp != null ? Number(e.p.raw_adp) : null,
        velocity: e.v,
        per_day: (span != null && span >= 1) ? Math.round((e.v / span) * 10) / 10 : null,
        stale: e.p.adp_stale || null,
      };
    }
    // Explicit index tiebreak: equal velocities keep board order, provably,
    // rather than leaning on the engine's sort stability.
    var up = withV.filter(function (e) { return e.v > 0; })
      .sort(function (a, b) { return (b.v - a.v) || (a.i - b.i); })
      .slice(0, n).map(row);
    var down = withV.filter(function (e) { return e.v < 0; })
      .sort(function (a, b) { return (a.v - b.v) || (a.i - b.i); })
      .slice(0, n).map(row);

    return {
      state: withV.length ? 'ok' : 'shallow',
      span: span,
      counted: withV.length,
      up: up,
      down: down,
    };
  }

  var api = { movers: movers, DEFAULT_N: DEFAULT_N };
  global.DraftMovers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
