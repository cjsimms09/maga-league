/* ROSTER BUILDER MODEL — marginal lineup value, as a SECOND VOICE.
 *
 * Cory, 2026-08-19: "Let's use mlv and I won't draft 2 kickers and 2 def.. it
 * needs to be clear what player model is recommending and why and I still want
 * to retain my current view. So maybe a spot that's says roster builder model
 * says and then the player"
 *
 * ── WHY THIS IS A MODULE AND NOT A REWRITE OF scorePlayer ────────────────────
 *
 * MLV cleared every preregistered bar on A's re-run (register 132): the only
 * arm to beat the humans in ALL THREE seasons on BOTH gradings, +45.8 actual /
 * +29.3 skill, 30 of 30 rosters legal. But paired against the SHIPPED curve the
 * skill gain is +21.4 with sd 115 (t 1.02, an upper bound — 30 seats are 3
 * correlated clusters), and 2025 is -9.1. So it beats the HUMANS convincingly
 * and beats OUR OWN BOARD only weakly.
 *
 * Rewriting the live scoring path on that margin, two days before the draft,
 * would risk the thing it is trying to improve. Cory asked for it as a separate
 * panel that keeps his current view — which is also the safe engineering answer.
 * The war room's ranking is UNCHANGED. This adds a voice; it does not replace
 * one.
 *
 * ── THE MECHANISM, IN ONE LINE ───────────────────────────────────────────────
 *
 *     marginal(c) = lineupValue(roster + c) − lineupValue(roster)
 *
 * It taxes DISPLACEMENT, not position count. A 4th running back better than
 * your flex starter keeps his full value — he starts, and the man he benches
 * nets off. One worse than your flex is worth ~zero. There is no curve and no
 * constant to tune: under Cory's own "grade skill not luck" ruling a bench body
 * contributes exactly zero, so maximising marginal lineup value IS maximising
 * the graded objective rather than approximating it.
 *
 * ⚠️ ONE RULE THAT IS NOT EMERGENT AND MUST NOT BE PRESENTED AS IF IT WERE.
 * K ≤ 1 and DEF ≤ 1 are IMPOSED, from Cory's words. Measured: without them the
 * mechanism drafts 1.93 kickers and 1.90 defences and its edge falls from
 * +45.8/+29.3 to +19.2/+10.8. No-injury grading rewards a second kicker; a real
 * roster does not. Cory: "I won't draft 2 kickers and 2 def."
 *
 * ⚠️ AND IT IS A CAP, NOT AN EXCLUSION — register 134. Once the starting lineup
 * is full this module recommends a DEFENCE and a KICKER AT THE TOP OF THE LIST
 * (HOU DEF +22.7, Aubrey K +16.9 on the live board). That is correct behaviour
 * and not a bug: a bench body's marginal lineup value is exactly zero, so a
 * kicker filling an empty dedicated slot beats the best skill player left. On
 * the harness the same rule takes K at its ROUND-9 PICK IN 30 OF 30 SEAT-YEARS
 * and still beats the humans in all three seasons.
 *
 * Excluding them instead is NOT equivalent — an earlier claim that it was came
 * from a harness arm that crashed on every invocation. Measured properly:
 * exclusion scores −83.7 actual / −211.3 skill with 0 of 30 rosters legal.
 *
 * ⚠️ LIMITATION, state it rather than hide it: this CANNOT VALUE A BENCH. Six of
 * fifteen roster spots have marginal value zero and fall through to
 * best-available. It is a starting-lineup optimiser; read it as one.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RosterBuilderMLV = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FLEX_ELIGIBLE = ['RB', 'WR', 'TE'];

  /* ⛔ VALUE MUST BE SCARCITY-ADJUSTED, AND THIS NEARLY SHIPPED WITHOUT IT.
   *
   * MLV was validated on A's harness using the MARKET'S OWN DRAFT ORDER as the
   * per-player value, which carries scarcity implicitly — a pick-1 player is
   * scarce by construction. Ported to the live board with RAW PROJECTIONS it
   * recommended quarterbacks at +415 pre-draft and a kicker above Puka Nacua,
   * because filling an empty QB slot with a 415-point quarterback really does
   * add 415 points of lineup value — if you ignore that a 322.9-point one is
   * free off the wire.
   *
   * That is register 196's finding wearing new clothes: raw points are not
   * comparable across positions, and the fix is the same one the whole project
   * already uses. Value is SURPLUS OVER THE WIRE, measured from this league's
   * own three drafts (the (N+1)-th best at each position, where N is how many
   * that position this room really takes):
   *
   *   QB 322.9 · RB 78.4 · WR 124.8 · TE 130.4 · K 128.6 · DEF 100.0
   *
   * A 415 QB is then worth 92 and Nacua 158, which is the ordering the board
   * has used all season.
   *
   * ── DERIVED NOW, NOT FROZEN — 2026-08-21, register 221 ───────────────────
   *
   * The paragraph above is the only place in the repo that ever stated where
   * these six numbers came from, and the method it states is the RIGHT one —
   * it is Cory's own, asked for again on 08-21: *"should we use last few years
   * of draft to determine how many at each position are rostered/drafted then
   * use that to compare waiver wire"*. What was wrong is that the arithmetic
   * ran ONCE and the answer was pasted into three files
   * (`position_boards.js:41`, `vona_board.js:41`, here).
   *
   * `draft/tools/waiver_baseline.js` now recomputes it every board build:
   * COUNT from three seasons of this league's own `final_rosters`, VALUE from
   * a source's own projection of the (count+1)-th man. Reconciled against the
   * legacy literal rather than replacing it blind — QB, WR and DEF land within
   * 1-2 ranks of it, which is the evidence it was honestly derived; **RB is
   * the one real divergence, sitting at board rank 51 against a drafted count
   * of 47 and a rostered count of 44, worth 18.5 blend points.** One position,
   * and it is the one Cory weights most.
   *
   * DEFAULTS ARE THE DERIVED **BLEND** BASELINE, because `recommend()`'s
   * default `valueField` is `proj_mean` — the blend. Numerator and denominator
   * from one source, which the legacy pairing never guaranteed. Callers pricing
   * on a different source pass `opts.waiver` (app.js does, from
   * `position_boards.json`'s `waiver_by_source`); passing nothing keeps the
   * blend, and passing a partial object falls back per position rather than to
   * zero — a MISSING baseline must never silently become "everything is pure
   * surplus", which is the 415-point-QB failure this whole mechanism exists to
   * stop. */
  var WAIVER = { QB: 317.7, RB: 96.9, WR: 129.0, TE: 119.7, K: 125.7, DEF: 93.3 };

  function startersOf(league) {
    var s = (league && (league.roster_slots || league.starters)) || {};
    return { QB: s.QB || 0, RB: s.RB || 0, WR: s.WR || 0, TE: s.TE || 0,
      K: s.K || 0, DEF: s.DEF || 0, FLEX: s.FLEX || 0 };
  }

  /* value of the best legal lineup from a {pos: [value,...]} bag */
  function lineupValue(bag, st) {
    var total = 0, left = {};
    ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(function (q) {
      var have = (bag[q] || []).slice().sort(function (a, b) { return b - a; });
      var need = st[q] || 0;
      for (var i = 0; i < need; i++) total += have[i] || 0;
      left[q] = have.slice(need);
    });
    var flexPool = [];
    FLEX_ELIGIBLE.forEach(function (q) { flexPool = flexPool.concat(left[q] || []); });
    flexPool.sort(function (a, b) { return b - a; });
    for (var f = 0; f < (st.FLEX || 0); f++) total += flexPool[f] || 0;
    return total;
  }

  function bagOf(roster, valueFn) {
    var bag = {};
    (roster || []).forEach(function (p) {
      if (!p || !p.position) return;
      (bag[p.position] || (bag[p.position] = [])).push(valueFn(p));
    });
    return bag;
  }

  /* WHY, in Cory's language rather than the model's. The reason is derived from
   * what actually changed in the lineup, never from a template guess. */
  function explain(cand, roster, st, valueFn) {
    var pos = cand.position;
    var held = (roster || []).filter(function (p) { return p && p.position === pos; });
    var slots = st[pos] || 0;
    var v = valueFn(cand);
    if (held.length < slots) {
      return 'fills your open ' + pos + ' slot';
    }
    var vals = held.map(valueFn).sort(function (a, b) { return b - a; });
    var worstStarter = vals[slots - 1];
    if (FLEX_ELIGIBLE.indexOf(pos) >= 0 && (st.FLEX || 0) > 0) {
      /* is the flex seat open, and would he take it? */
      var surplus = 0;
      FLEX_ELIGIBLE.forEach(function (q) {
        surplus += Math.max(0, (roster || []).filter(function (p) { return p && p.position === q; }).length - (st[q] || 0));
      });
      if (surplus < (st.FLEX || 0)) return 'takes your open FLEX seat';
      var flexNow = [];
      FLEX_ELIGIBLE.forEach(function (q) {
        var h = (roster || []).filter(function (p) { return p && p.position === q; })
          .map(valueFn).sort(function (a, b) { return b - a; });
        flexNow = flexNow.concat(h.slice(st[q] || 0));
      });
      flexNow.sort(function (a, b) { return b - a; });
      if (v > (flexNow[0] || 0)) return 'starts at FLEX over your current flex';
    }
    if (v > worstStarter) return 'starts over your ' + pos + (slots > 1 ? slots : '');
    return 'bench only — he does not crack your lineup';
  }

  /**
   * Rank the board by marginal lineup value.
   * @param board  [{name, position, ...}]  available players
   * @param roster [{name, position, ...}]  what Cory already holds
   * @param opts   {league, valueField|valueFn, topN}
   */
  /* ⚠️ TAKEN PLAYERS CANNOT BE RECOMMENDED, AND UNTIL 2026-08-20 NOTHING HERE
   * STOPPED THEM. Cory, from a rehearsal: "Roster builder model is recommending
   * players that are already gone."
   *
   * `recommend()` iterated whatever array it was handed and had no concept of a
   * drafted player. Every caller passed `state.board`, which the app does prune
   * on each pick — so the module's correctness depended entirely on every
   * present and future caller having pruned first. That is the assumption this
   * repo keeps paying for, and the panel's own contract in app.js says the
   * opposite: "no model here can name an illegal pick". A player already taken
   * is an illegal pick.
   *
   * So the guard lives HERE, where it cannot be bypassed by a caller, rather
   * than in the caller that happened to be wrong.
   *
   * IT DOES NOT HIDE THE PROBLEM. Silently filtering would mask an upstream
   * staleness — which is how the underlying defect would survive the symptom
   * being fixed. Anything filtered is COUNTED and NAMED on the returned array
   * as `_taken_filtered`, so a caller can surface it and the real cause stays
   * findable. On a healthy board the count is zero and nothing changes.
   *
   * `taken` accepts a Set, an array, or an object keyed by id — the app holds a
   * Set (`state.drafted`), and refusing the other shapes would just invite a
   * caller to convert it wrongly. */
  /* ⚠️ ID TYPE IS COMPARED AS A STRING ON BOTH SIDES, ALWAYS.
   * The first version did `taken.has(String(id)) || taken.has(id)`, which still
   * missed a Set holding NUMERIC ids against a board carrying string ones — and
   * Sleeper returns ids as strings in some payloads and numbers in others, so
   * that is a live shape, not a hypothetical. A guard that misses on a type
   * mismatch is the same as no guard, and it fails in the direction that puts a
   * drafted player back on Cory's screen. Caught by this module's own suite. */
  function isTaken(taken, id) {
    if (!taken || id == null) return false;
    var k = String(id);
    if (typeof taken.has === 'function') {
      if (taken.has(k) || taken.has(id)) return true;
      var found = false;
      taken.forEach(function (v) { if (String(v) === k) found = true; });
      return found;
    }
    if (Array.isArray(taken)) {
      for (var i = 0; i < taken.length; i++) {
        if (String(taken[i]) === k) return true;
      }
      return false;
    }
    return Object.prototype.hasOwnProperty.call(taken, k) && !!taken[k];
  }

  function recommend(board, roster, opts) {
    opts = opts || {};
    var st = startersOf(opts.league);
    var field = opts.valueField || 'proj_mean';
    /* PER-POSITION FALLBACK, NOT PER-OBJECT. `opts.waiver` may be one source's
     * baseline with holes in it (FFToday prices no kickers, Clay no defences —
     * measured, not hypothetical). A hole must fall back to the derived blend
     * figure for that position, never to 0: a zero baseline makes every player
     * at that position pure surplus and hands the lineup a 400-point kicker. */
    var wire = opts.waiver || null;
    var waiverAt = function (pos) {
      var v = wire ? wire[pos] : null;
      return (v == null ? WAIVER[pos] : v) || 0;
    };
    var valueFn = opts.valueFn || function (p) {
      var raw = Number(p[field]) || 0;
      /* surplus over what the wire leaves at his position — never raw points */
      return Math.max(0, raw - waiverAt(p.position));
    };
    var base = bagOf(roster, valueFn);
    var baseVal = lineupValue(base, st);
    var out = [];
    var filtered = [];
    /* A player already on Cory's OWN roster is taken too, and that needs no
     * caller to remember: the roster is right here. Recommending a man he
     * already holds is the same defect wearing a different hat. */
    var mine = {};
    (roster || []).forEach(function (p) {
      if (p && p.player_id != null) mine[String(p.player_id)] = true;
    });
    (board || []).forEach(function (c) {
      if (!c || !c.position) return;
      if (isTaken(opts.taken, c.player_id) || mine[String(c.player_id)]) {
        filtered.push(c.name || String(c.player_id));
        return;
      }
      /* ⚠️ IMPOSED, NOT EMERGENT — Cory: "I won't draft 2 kickers and 2 def." */
      if ((c.position === 'K' || c.position === 'DEF')
          && (roster || []).filter(function (p) { return p && p.position === c.position; }).length >= 1) return;
      var bag = {};
      Object.keys(base).forEach(function (k) { bag[k] = base[k].slice(); });
      (bag[c.position] || (bag[c.position] = [])).push(valueFn(c));
      var gain = lineupValue(bag, st) - baseVal;
      out.push({ player: c, position: c.position, marginal: Math.round(gain * 10) / 10,
        why: explain(c, roster, st, valueFn) });
    });
    out.sort(function (a, b) { return b.marginal - a.marginal; });
    var top = out.slice(0, opts.topN || 5);
    /* EVIDENCE, NOT SILENCE. Zero on a healthy board; non-zero means a caller
     * handed us a stale pool and the real bug is upstream of here. */
    top._taken_filtered = filtered.length;
    top._taken_names = filtered.slice(0, 8);
    return top;
  }

  return { recommend: recommend, lineupValue: lineupValue, startersOf: startersOf, WAIVER: WAIVER,
    _explain: explain,
    EVIDENCE: {
      register: 132,
      beats_humans_all_three_seasons: true,
      actual: 45.8, skill: 29.3, legal: '30/30',
      paired_vs_shipped_skill: { mean: 21.4, sd: 115, t_upper_bound: 1.02, wins: '14/30' },
      caveat: 'Beats the HUMANS in all three seasons on both gradings. Beats OUR '
            + 'OWN shipped curve only weakly (t 1.02, upper bound). The K<=1 / '
            + 'DEF<=1 cap is IMPOSED from Cory\'s words, not emergent: without it '
            + 'the mechanism drafts 1.93 K and 1.90 DEF and its edge halves.',
      onesies_are_capped_not_excluded: 'Register 134. Once your lineup is full '
            + 'this model puts a DEF and a K at the top of the list, because a '
            + 'bench body is worth exactly zero to it. Excluding them instead '
            + 'costs -83.7 actual / -211.3 skill and leaves 0 of 30 rosters legal.',
      cannot_value_a_bench: '6 of 15 roster spots score zero marginal value and '
            + 'fall through to best-available. Starting-lineup optimiser.',
    } };
}));
