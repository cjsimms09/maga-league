/* SOURCE-AWARE BOARD — Cory, live 2026-08-20: "This toggle should just
 * rearrange the board though and also may change vona calc or recommended
 * player." Two toggles had shipped by then and neither did that — both only
 * swapped which NUMBER a row displayed, because engine.js's entire scoring
 * pipeline (VONA, composite score, tier cliffs, the recommendation itself)
 * reads `player.vorp`/`player.tier`/`player.proj_mean` directly, and those
 * three fields are computed exactly once, server-side, from the blend.
 *
 * THE FIX IS NOT IN engine.js. `draft/tools/alt_source_rankings.py` already
 * ran the real, unmodified `vorp.apply_vorp()`/`assign_tiers()` once per
 * alternate source (Draft Sharks, Sleeper, our model, FantasyPros) and wrote
 * the results onto every player as suffixed fields — `vorp_ds`, `tier_ds`,
 * `pos_rank_ds`, ... This module's ONE job is to take a real board and
 * return a SHADOW COPY with the unsuffixed fields swapped for a source's
 * suffixed ones, so engine.js's existing, trusted, heavily-tested scoring
 * runs completely unmodified against different input data. Zero lines of
 * engine.js change — the entire live recommendation pipeline becomes
 * source-aware just by feeding it a different board, the same trick
 * DraftShadows already uses for weights, applied here to data instead.
 *
 * Pure, dual browser/Node export, no DOM, no fetch — same shape as
 * market_delta.js / position_boards_view.js this session.
 */
(function (global) {
  'use strict';

  /* Every alternate source this board can be re-ranked on, keyed the same
   * way alt_source_rankings.py's SOURCES dict is, so the suffix on a field
   * name ("vorp_ds") always matches a key here ("ds") without translation. */
  /* ⚠️ EIGHT, NOT FOUR — Cory, 2026-08-21: "Where are all the other sources we
   * got?? We got more than that?" He was right. The blend is built from SEVEN
   * sources and `source_boards.json` has shown all of them in the best-available
   * panel for days, but this list knew four, so the Big Board toggle could not
   * offer CBS, ESPN, FFToday or Mike Clay. They were ingested, committed and
   * blended into the number he drafts on, and invisible on the tab he asked to
   * see them on.
   *
   * AND THE TWO THAT WERE HERE ARE THE WORST-COVERED. Inside his top 200:
   * ESPN 99%, CBS 97%, FFToday 94%, Clay 89% — against Draft Sharks 95% and
   * FantasyPros 90%. The missing four were not a thin tail.
   *
   * Order is coverage-descending within the "not ours" group, so the toggle
   * reads best-covered first rather than in the order they happened to be
   * ingested. `ownmodel` stays last: Cory ruled our own projections out of the
   * peer comparison (2026-08-19, "lets exclude our own projections") and
   * source_boards.json already honours that by omitting it entirely — it is
   * kept here only because this toggle re-ranks rather than compares. */
  var SOURCES = [
    { key: 'sleeper', label: 'Sleeper' },
    { key: 'espn', label: 'ESPN' },
    { key: 'cbs', label: 'CBS' },
    { key: 'ds', label: 'Draft Sharks' },
    { key: 'fftoday', label: 'FFToday' },
    { key: 'fantasypros', label: 'FantasyPros' },
    /* ⚠️ NOT AN INDEPENDENT EIGHTH OPINION, AND THE LABEL SAYS SO. Mike Clay
     * IS ESPN's projections man, and both stores score RAW STAT LINES under
     * this league's table, so `proj_clay` and `proj_espn` come out identical on
     * 306 of the 331 players they share — 92.4%, where every other pair on the
     * board is under 5%. Toggling between them and seeing the same board is
     * correct behaviour, not a bug; reading it as two sources agreeing is the
     * mistake, which is why the parenthesis is in the label rather than in a
     * note some surface might not render. Register 197. */
    { key: 'clay', label: 'Mike Clay (= ESPN)' },
    { key: 'ownmodel', label: 'Our model' },
  ];

  /* Fields engine.js actually reads for scoring/VONA/tiers. Swapped from the
   * suffixed source fields when present; left as-is (the blend value) when a
   * player was never run through alt_source_rankings.py at all — an older
   * cached artifact degrades to the blend rather than a crash or a hole. */
  var SWAP_FIELDS = ['proj_mean', 'vorp', 'tier', 'pos_rank', 'overall_rank',
    'replacement', 'tier_size', 'tier_drop', 'tier_rank'];

  function isValidSource(key) {
    return SOURCES.some(function (s) { return s.key === key; });
  }

  /* proj_mean itself is not one of alt_source_rankings.py's DERIVED_FIELDS —
   * it writes the source-priced value it actually ranked on as
   * `proj_used_<key>` instead (the real source number where covered, the
   * player's OWN blend number where not — never a fabricated zero). */
  function suffixedField(field, key) {
    return (field === 'proj_mean' ? 'proj_used' : field) + '_' + key;
  }

  /** Returns `players` UNCHANGED (same array, same objects — no copy, no
   * cost) when `source` is falsy or 'blend'. For any other valid source key,
   * returns a NEW array of shallow-copied player objects with the scoring
   * fields swapped to that source's precomputed ranking. An unrecognised
   * source key is treated as 'blend' (degrade to the trusted default rather
   * than score against undefined).
   *
   * DROP, NOT FALLBACK — Cory's own ruling, stated twice: "I like the player
   * disappearing when source is selected." A player the source does not
   * cover is EXCLUDED from the returned board entirely, not kept at his
   * blend price. (An earlier version of this file did the opposite —
   * flagged, corrected same day: ROUTES.md.)
   *
   * THE ONE GUARD: if the artifact predates alt_source_rankings.py (no
   * player anywhere carries a `covered_<source>` field at all), there is no
   * coverage data to drop BY — filtering would blank the entire board for
   * every non-blend source, the exact "degrades to nothing" failure this
   * codebase treats as worse than a wrong number. In that one case only,
   * every player is kept (the pre-DROP-ruling behavior), same as this
   * function already did for a player missing individual scoring fields. */
  function forSource(players, source) {
    if (!players || !players.length || !source || source === 'blend' || !isValidSource(source)) {
      return players;
    }
    var covField = 'covered_' + source;
    var anyCoverageData = players.some(function (p) { return covField in p; });
    var out = [];
    players.forEach(function (p) {
      var covered = !!p[covField];
      if (anyCoverageData && !covered) return;   // DROP — the whole point of the ruling
      var q = Object.assign({}, p);
      SWAP_FIELDS.forEach(function (field) {
        var sf = suffixedField(field, source);
        if (p[sf] != null) q[field] = p[sf];
      });
      q._sourceRanked = source;
      q._sourceCovered = covered;
      out.push(q);
    });
    return out;
  }

  /** How many of `players` actually carry real coverage for `source` (not a
   * fallback) — the same honesty the #proj-source panel already prints, so
   * any consumer of this module can show the same caveat. Returns null for
   * 'blend'/falsy (the question does not apply).
   *
   * ⚠️ `depth` (optional, added 2026-08-20 for Cory's scope ruling — "We
   * really just need to focus on top 200 players maybe 250") counts only the
   * `depth` shallowest players BY ADP. Omitted, the whole array is counted,
   * exactly as before — every existing caller is unchanged.
   *
   * WHY IT WAS WORTH A PARAMETER. Over all 700 board players Draft Sharks
   * covers 35%; over the top 200 by ADP it covers 94%, against Sleeper's
   * 100%. The unscoped count is not wrong, it just answers a question nobody
   * asks — nobody drafts the 700th player. A caller showing coverage to a
   * human should pass a depth.
   *
   * Players with no ADP sort LAST, never first: unknown is not early. */
  function adpOf(p) {
    var v = p && (p.adjusted_adp != null ? p.adjusted_adp
      : (p.raw_adp != null ? p.raw_adp : p.adp));
    return v == null ? 9999 : Number(v);
  }
  function coverage(players, source, depth) {
    if (!players || !source || source === 'blend' || !isValidSource(source)) return null;
    var pool = players;
    if (typeof depth === 'number' && depth > 0 && depth < players.length) {
      pool = players.slice().sort(function (a, b) { return adpOf(a) - adpOf(b); })
        .slice(0, depth);
    }
    var total = pool.length;
    var covered = pool.filter(function (p) { return !!p['covered_' + source]; }).length;
    return { covered: covered, total: total, depth: total < players.length ? total : null };
  }

  /** Cory, 2026-08-21: "toggle between sources... the old list you used to
   * have that list top 5-10 at each position for that source." The single-
   * pick "Best available, by source" table (source_boards.json) already
   * answers "who is #1 per source" — this answers "who are the top N per
   * position, for the ONE source the toggle currently has selected."
   *
   * REUSES forSource(), never a second ranking pass: the DROP semantics
   * (uncovered players excluded), the swapped `pos_rank`, everything a
   * caller already trusts from the re-ranking toggle carries straight
   * through. This function's only new work is grouping by position and
   * slicing to `n` — no scoring, no filtering logic of its own.
   *
   * `pos_rank` is present on every player even for 'blend' (the board's own
   * position rank), so the same sort works whether or not `source` swapped
   * anything — a caller never needs a separate blend code path. */
  function topByPosition(players, source, n) {
    n = n > 0 ? n : 8;
    var pool = forSource(players, source);
    var byPos = {};
    (pool || []).forEach(function (p) {
      var pos = p && p.position;
      if (!pos) return;
      (byPos[pos] = byPos[pos] || []).push(p);
    });
    Object.keys(byPos).forEach(function (pos) {
      byPos[pos] = byPos[pos].slice().sort(function (a, b) {
        var ra = a.pos_rank != null ? a.pos_rank : adpOf(a);
        var rb = b.pos_rank != null ? b.pos_rank : adpOf(b);
        return ra - rb;
      }).slice(0, n);
    });
    return byPos;
  }

  var API = { SOURCES: SOURCES, SWAP_FIELDS: SWAP_FIELDS, forSource: forSource,
    coverage: coverage, adpOf: adpOf, topByPosition: topByPosition };
  global.SourceBoard = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
