// TERRITORY: shared (B extracted from A's draft/tools/fieldability_probe.js,
// disclosed trespass — see ROUTES.md 08-19, register 73 dispatch).
/* THE ONE FIELDABILITY MATCHER — Rule 11.
 *
 * A→B dispatch (register 73, ROUTES.md 08-19) insisted on reuse rather than a
 * second matcher: "greedy is WRONG here — filling FLEX first strands a
 * dedicated slot and reports a false alarm... bipartite matching with
 * augmenting paths... Rule 11: one matcher." My own first cut of the live
 * warning (bye_fieldability.js) was exactly that second matcher, and it
 * carried a real bug this league's data exposes: it pooled QB leftovers into
 * FLEX capacity, but this league's FLEX is RB/WR/TE only (draft_data.json
 * league.starters has no SUPER_FLEX) — legality.js's own FLEX_POS constant
 * agrees. A roster with a spare QB and a real WR/TE shortfall would have
 * shown Cory a false "clean" week.
 *
 * So the matcher moves here — copied verbatim from fieldability_probe.js's
 * algorithm, parameterized instead of reading a module-level STARTERS
 * closure — and BOTH the live warning and the research probe call this one
 * copy. fieldability_probe.js now delegates to it; fieldability.test.js's
 * planted-hole/greedy-trap cases are the shared control for both callers.
 *
 * PURE: no DOM, no fetch, no fs. Dual browser/Node export, same shape as
 * expert_spread.js.
 */
(function (global) {
  'use strict';

  var FLEX_ELIG = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
                     REC_FLEX: ['WR', 'TE'] };

  /* CAN THIS SET OF PLAYERS FILL EVERY STARTING SLOT IN WEEK `wk`?
   *
   * Greedy would be wrong: filling FLEX first can strand a dedicated slot.
   * This is a small bipartite matching (players -> slots) solved by
   * augmenting paths, so "un-fieldable" means genuinely un-fieldable rather
   * than "the heuristic could not find it". */
  function fieldable(roster, wk, starters, flexElig) {
    var STARTERS = starters || {};
    var ELIG = flexElig || FLEX_ELIG;
    var slots = [];
    Object.keys(STARTERS).forEach(function (s) {
      for (var i = 0; i < STARTERS[s]; i++) slots.push(s);
    });
    var avail = (roster || []).filter(function (p) { return p && +p.bye !== wk && p.position; });
    var eligible = function (p, slot) {
      return ELIG[slot] ? ELIG[slot].indexOf(p.position) >= 0 : p.position === slot;
    };

    var slotOf = new Array(slots.length).fill(-1);
    function tryAssign(pi, seen) {
      for (var s = 0; s < slots.length; s++) {
        if (seen[s] || !eligible(avail[pi], slots[s])) continue;
        seen[s] = true;
        if (slotOf[s] < 0 || tryAssign(slotOf[s], seen)) { slotOf[s] = pi; return true; }
      }
      return false;
    }
    var filled = 0;
    for (var i = 0; i < avail.length; i++) {
      if (tryAssign(i, new Array(slots.length).fill(false))) filled++;
    }
    var unfilled = [];
    slots.forEach(function (s, idx) { if (slotOf[idx] < 0) unfilled.push(s); });
    return { ok: unfilled.length === 0, unfilled: unfilled, bodies: avail.length,
             slots: slots.length };
  }

  var API = { fieldable: fieldable, FLEX_ELIG: FLEX_ELIG };
  global.Fieldable = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
