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
  var SOURCES = [
    { key: 'ds', label: 'Draft Sharks' },
    { key: 'sleeper', label: 'Sleeper' },
    { key: 'ownmodel', label: 'Our model' },
    { key: 'fantasypros', label: 'FantasyPros' },
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
   * than score against undefined). */
  function forSource(players, source) {
    if (!players || !players.length || !source || source === 'blend' || !isValidSource(source)) {
      return players;
    }
    return players.map(function (p) {
      var out = Object.assign({}, p);
      SWAP_FIELDS.forEach(function (field) {
        var sf = suffixedField(field, source);
        if (p[sf] != null) out[field] = p[sf];
      });
      out._sourceRanked = source;
      out._sourceCovered = !!p['covered_' + source];
      return out;
    });
  }

  /** How many of `players` actually carry real coverage for `source` (not a
   * fallback) — the same honesty the #proj-source panel already prints, so
   * any consumer of this module can show the same caveat. Returns null for
   * 'blend'/falsy (the question does not apply). */
  function coverage(players, source) {
    if (!players || !source || source === 'blend' || !isValidSource(source)) return null;
    var total = players.length;
    var covered = players.filter(function (p) { return !!p['covered_' + source]; }).length;
    return { covered: covered, total: total };
  }

  var API = { SOURCES: SOURCES, SWAP_FIELDS: SWAP_FIELDS, forSource: forSource, coverage: coverage };
  global.SourceBoard = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
