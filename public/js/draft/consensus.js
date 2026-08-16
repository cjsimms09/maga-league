/* CONSENSUS PROJECTION (contract C3) — the raw, unmodelled sanity-check number.
 *
 * Cory: show a plain averaged consensus projection next to every dollar/valuation,
 * in every tool, clearly labelled as raw consensus — NOT our valuation. Dollars
 * stay the objective; the projection is the sanity check on a long chain
 * (projection -> points -> win prob -> playoff odds -> payout) whose links rest on
 * guessed constants (we found one wrong by ~2x). When the tool recommends a
 * LOWER-projection player, both numbers must be on screen — that is the moment the
 * machinery is either finding something real or is broken, and one number can't
 * tell you which. The consensus column already earned this: it caught the
 * inflated-VORP C1 bug on first contact with real data.
 *
 * HONEST LABELLING (Cory's rule): a number labelled "consensus" that comes from
 * one place is a small lie in exactly the spot he asked for a sanity check. So the
 * label states the truth: >=2 sources -> "Consensus (N src)"; 1 source ->
 * "<Source> proj" (e.g. "Sleeper proj 226"). The label is derived per player
 * from whichever per-source fields are actually present — on today's board
 * that is Sleeper + FantasyPros (2 src), plus our own model where it attaches
 * (3 src); players either source misses fall back honestly to fewer. (The
 * "Sleeper only" era this header once described ended 2026-08-10 when the
 * FantasyPros attach landed — the mechanism needed no change, which is the
 * point of deriving the label instead of writing it.)
 *
 * ONE derivation for every tool (draft / waiver / lineup / standings) so the same
 * player shows the same raw projection everywhere.
 */
(function (global) {
  'use strict';

  var SOURCE_LABELS = { sleeper: 'Sleeper', sleeper_projections: 'Sleeper',
    fantasypros: 'FantasyPros', ffc: 'FFC', consensus: 'Consensus',
    ownmodel: 'Our model' };

  function cleanSource(s) {
    if (!s) return 'proj';
    return SOURCE_LABELS[String(s).toLowerCase()] || String(s);
  }

  /* The raw projection for a player, with an HONEST source label.
   * @param provenance  optional artifact provenance ({projections:{source}}) so a
   *                    single proj_mean is labelled by its true source.
   * Returns { value, sources:[...], label, isConsensus }. */
  function rawProjection(player, provenance) {
    if (!player) return { value: null, sources: [], label: 'proj', isConsensus: false };
    // Explicit per-source projection fields win (this is how a real multi-source
    // consensus arrives): average whatever is present.
    var perSource = [];
    if (player.proj_sleeper != null) perSource.push(['sleeper', Number(player.proj_sleeper)]);
    if (player.proj_fantasypros != null) perSource.push(['fantasypros', Number(player.proj_fantasypros)]);
    if (player.proj_ffc != null) perSource.push(['ffc', Number(player.proj_ffc)]);
    // THIRD SOURCE, ADDED 2026-08-15. proj_ownmodel is our own leak-free,
    // self-derived model — WHICH algorithm is the board's business, not this
    // file's: build.py stamps it in provenance own_model.algorithm (own_v6
    // since Cory's 2026-08-16 promotion; this comment once said walk_forward
    // and went stale within a day of the v4 promotion — the label 'Our model'
    // is deliberately version-free so the next promotion cannot strand it).
    // Attached by build.py the same additive way FantasyPros was — coverage is
    // partial by design (needs prior-season production, so rookies carry
    // none), which is exactly why it's an entry in an array that only includes
    // what's present rather than a required field.
    if (player.proj_ownmodel != null) perSource.push(['ownmodel', Number(player.proj_ownmodel)]);
    if (perSource.length) {
      var sum = perSource.reduce(function (a, kv) { return a + kv[1]; }, 0);
      var srcs = perSource.map(function (kv) { return kv[0]; });
      return { value: sum / perSource.length, sources: srcs,
        label: perSource.length >= 2 ? 'Consensus (' + perSource.length + ' src)'
                                     : cleanSource(srcs[0]) + ' proj',
        isConsensus: perSource.length >= 2 };
    }
    // Fallback: the single blended field (proj_mean), labelled by provenance.
    if (player.proj_mean != null) {
      var src = provenance && provenance.projections && provenance.projections.source;
      return { value: Number(player.proj_mean), sources: [src || 'sleeper'],
        label: cleanSource(src || 'sleeper') + ' proj', isConsensus: false };
    }
    return { value: null, sources: [], label: 'proj', isConsensus: false };
  }

  /* THE DISAGREEMENT MOMENT. Among the candidates a human is weighing, does one
   * project HIGHER than the recommended player? If so the tool is recommending a
   * lower-projection guy — surface it, because that is exactly when both numbers
   * must be seen. Returns the higher-projection alternative (or null), with both
   * raw projections, so the caller can render "we prefer X; Y projects higher".
   * `candidates` are score-objects ({player,...}); `rec` is the recommended one. */
  function higherProjectionAlt(rec, candidates, provenance, withinTop) {
    if (!rec || !rec.player) return null;
    var recProj = rawProjection(rec.player, provenance).value;
    if (recProj == null) return null;
    var pool = (candidates || []).slice(0, withinTop || 5);
    var best = null;
    pool.forEach(function (c) {
      var p = c.player || c;
      if (!p || String(p.player_id) === String(rec.player.player_id)) return;
      // Only same-position comparisons are apples-to-apples (a QB always projects
      // higher than an RB cross-position; that is not a disagreement, it is scoring
      // units). The meaningful flag is "a same-position guy projects higher yet we
      // rank him lower" — the real "are we finding something or broken" moment.
      if (p.position !== rec.player.position) return;
      var pr = rawProjection(p, provenance).value;
      if (pr == null) return;
      if (pr > recProj && (!best || pr > best.proj)) best = { player: p, proj: pr };
    });
    if (!best) return null;
    return { rec_proj: recProj, alt: best.player, alt_proj: best.proj,
      delta: Math.round(best.proj - recProj) };
  }

  var api = { rawProjection: rawProjection, higherProjectionAlt: higherProjectionAlt,
    cleanSource: cleanSource };
  global.DraftConsensus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
