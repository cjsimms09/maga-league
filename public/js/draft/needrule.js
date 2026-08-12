/* NEEDRULE (feature A) — the measured draft-day rule, on the board.
 *
 * The rule (EXP-KEEPER-B0.md, all three parts measured, not assumed):
 *   Recommend the best-ADP player among positions UNDER STARTABLE CAPACITY —
 *   dedicated starters (QB1 RB2 WR2 TE1 K1 DEF1) plus one FLEX share for RB/WR/TE.
 *   - never over-draft a filled position (beats pure ADP by ~$258 from Cory's seat)
 *   - let strong flex-eligible value jump ahead of a weak starter (value-depth beats
 *     strict fill-first by ~$51); QB and DEF defer to their cheaper mid/late ADP
 *     because the market prices them well there
 *   - never leave a starter slot empty at the end; onesies fill by their own late ADP
 *
 * HONEST TIER (carried onto the screen): the RANKINGS and SIGNS are trustworthy; the
 * dollar magnitudes ($258 / $51) are MC-harness-dependent and must NOT be shown as
 * season projections. `confidence` says exactly that.
 *
 * UNMODELED (must be VISIBLE, not silent): bye-week coverage. The rule does not price
 * byes, so if its pick would stack >=3 STARTERS on one bye week, `byeStack` warns —
 * the hole that shows up in week 9 and nobody remembers why.
 *
 * Pure. Unit-tested in draft/tests/needrule.test.js. The war room renders
 * recommend() as the top voice; coherence.js resolves it against other signals.
 */
(function (global) {
  'use strict';

  var STARTERS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
  var FLEX = 1;
  var FLEX_POS = { RB: 1, WR: 1, TE: 1 };

  function startableCap(pos) {
    return (STARTERS[pos] || 0) + (FLEX_POS[pos] ? FLEX : 0);
  }

  function adpOf(p) {
    var a = p.adjusted_adp != null ? p.adjusted_adp
      : (p.raw_adp != null ? p.raw_adp : (p.adp != null ? p.adp : null));
    return a == null ? Infinity : a;
  }

  function byeOf(p) {
    var b = p.bye != null ? p.bye : (p.bye_week != null ? p.bye_week : p.byeWeek);
    return b == null ? null : Number(b);
  }

  function counts(roster) {
    var c = {};
    (roster || []).forEach(function (p) { c[p.position] = (c[p.position] || 0) + 1; });
    return c;
  }

  /* Positions still under startable capacity, given the roster (keepers + picks). */
  function openPositions(roster) {
    var c = counts(roster), open = {};
    Object.keys(STARTERS).forEach(function (pos) {
      if ((c[pos] || 0) < startableCap(pos)) open[pos] = startableCap(pos) - (c[pos] || 0);
    });
    return open;
  }

  /* The value-depth mask: board players at a position still under startable capacity.
   * Empty (all capped) -> whole board (bench = best available). */
  function withinCap(board, roster) {
    var c = counts(roster);
    var avail = (board || []).filter(function (p) {
      return (c[p.position] || 0) < startableCap(p.position);
    });
    return avail.length ? avail : (board || []);
  }

  function _starters(roster) {
    // the lineup the rule is building toward: fill dedicated slots, then 1 flex
    var byPos = {}, c = counts(roster), starters = [];
    (roster || []).forEach(function (p) { (byPos[p.position] = byPos[p.position] || []).push(p); });
    Object.keys(STARTERS).forEach(function (pos) {
      (byPos[pos] || []).slice(0, STARTERS[pos]).forEach(function (p) { starters.push(p); });
    });
    // flex = best remaining RB/WR/TE beyond dedicated
    var overflow = [];
    Object.keys(FLEX_POS).forEach(function (pos) {
      (byPos[pos] || []).slice(STARTERS[pos]).forEach(function (p) { overflow.push(p); });
    });
    overflow.sort(function (a, b) { return adpOf(a) - adpOf(b); });
    if (overflow[0]) starters.push(overflow[0]);
    return starters;
  }

  /* Would adding `pick` put >=3 STARTERS on one bye week? (Rule doesn't price byes.) */
  /* ── A BYE WARNING THAT CANNOT FIRE MUST NOT LOOK LIKE ONE THAT FOUND
   *    NOTHING ─────────────────────────────────────────────────────────────
   *
   * This returned a bare `null` in two completely different situations: the
   * starters genuinely do not stack on one week, and THE DATA CANNOT ANSWER THE
   * QUESTION. A null bye can never contribute to the count, so a roster with
   * three unknown byes returned exactly what a clean roster returns.
   *
   * 564 players carried a team and no bye week — 37% of the top-225 tight ends —
   * so this was not a corner case. The gaps are now filled from the player's own
   * team (adp.py, and app.js for boards already built), but FILLING THEM IS NOT
   * THE SAME AS BEING ABLE TO SAY SO: a future source change reopens the hole
   * silently unless the blindness is reported rather than inferred.
   *
   * So the shape is now three-valued. `{blind: n}` says the tool looked and could
   * not see; `null` means it looked and there was nothing there. A caller that
   * ignores `blind` is no worse off than before; one that reads it can tell Cory
   * the difference on the 22nd. */
  function byeStack(pick, roster) {
    if (!pick) return null;
    var proj = (roster || []).concat([pick]);
    var starters = _starters(proj);
    var unknown = starters.filter(function (p) { return byeOf(p) == null; }).length;
    if (byeOf(pick) == null) {
      return { blind: unknown || 1, week: null, count: 0,
        why: 'this player has no bye week on the board, so a conflict cannot be '
          + 'ruled out — silence here is not the same as "no conflict"' };
    }
    var byes = {};
    starters.forEach(function (p) {
      var b = byeOf(p);
      if (b != null) byes[b] = (byes[b] || 0) + 1;
    });
    var wk = byeOf(pick);
    if (byes[wk] >= 3) return { week: wk, count: byes[wk], blind: unknown || 0 };
    if (unknown) {
      return { blind: unknown, week: wk, count: byes[wk] || 0,
        why: unknown + ' of your starters have no bye week on the board, so the '
          + 'count above is a floor rather than the answer' };
    }
    return null;
  }

  /* The reason line, in the RULE'S OWN TERMS. */
  function reasonFor(pick, roster, capped, ood) {
    if (!pick) return 'no players available';
    if (ood) return 'past the rule\'s measured region — starters + flex are covered and only '
      + 'K/DEF remain; the mask was measured on expensive skill picks, not cheap bench slots, '
      + 'so a high-upside ' + pick.position + ' here is worth its own bench spot — take the '
      + 'upside or fill the onesie, your call';
    var open = openPositions(roster);
    var openList = Object.keys(open);
    var pos = pick.position;
    var c = counts(roster);
    var isFlexDepth = FLEX_POS[pos] && (c[pos] || 0) >= (STARTERS[pos] || 0);
    var deferred = ['QB', 'DEF'].filter(function (p) {
      return open[p] && (c[p] || 0) < STARTERS[p];   // still-empty onesie starter we're passing on
    });
    /* ── THE WORD "VALUE" DOES NOT BELONG TO THIS RULE ────────────────────
     *
     * This rule ranks by ADP — `mask.forEach(p => adpOf(p) < adpOf(pick))`. It
     * computes no value quantity of any kind. The composite, rendered as a card
     * on the SAME SCREEN, ranks by VONA and titles itself "Best TE value".
     * Both said "value", for a market price and a model estimate, and the two
     * disagree on 11 of 12 picks — measured, draft/tools/mock_walk.js.
     *
     * Cory, 2026-08-13: "If they legitimately answer different questions, THE
     * LABELS MUST SAY SO — and if I cannot tell them apart while reading, they
     * do not." They do answer different questions, so each label now names its
     * own quantity and the collision is gone. */
    if (capped) {
      return 'bench — every starter + flex slot is filled; earliest by MARKET PRICE on the board ('
        + pos + ')';
    }
    var lead = 'earliest by MARKET PRICE within your remaining need (' + pos + ')';
    if (isFlexDepth) lead = 'earliest flex-eligible by MARKET PRICE (' + pos + ') — taken ahead of a '
      + 'weaker starter slot, which is worth more than reaching to fill it';
    var tail = deferred.length
      ? '; ' + deferred.join(' & ') + ' deferred (the market prices ' + (deferred.length > 1 ? 'them' : 'it')
        + ' well later)' : '';
    return lead + tail + (openList.length ? '' : '');
  }

  /* THE RULE'S DOMAIN. b0_need/value_depth measured the mask where it was measured: the
   * EARLY/MID board, filling expensive skill starters, where over-drafting a filled slot
   * costs real value ($443 mask vs no-mask). It says nothing about the state where all
   * skill starter+flex slots are covered and only K/DEF remain open — cheap bench territory
   * where a slot's opportunity cost is ~0 and a high-upside skill player has value
   * INDEPENDENT of my starting slots (insurance, trade, a role opening). There the mask
   * would exclude that player to force a onesie — asserting evidence it does not have. So
   * the rule EXPRESSES its domain and DEFERS outside it rather than masking confidently. */
  function outOfDomain(roster) {
    var open = Object.keys(openPositions(roster));
    return open.length > 0 && open.every(function (p) { return p === 'K' || p === 'DEF'; });
  }

  /* THE RECOMMENDATION. board: available players; roster: my keepers + picks so far. */
  function recommend(board, roster) {
    var capped = isAllCapped(board, roster);
    var ood = !capped && outOfDomain(roster);
    // In-domain: mask to startable need (measured). Capped OR out-of-domain: open the mask so
    // bench upside competes with the onesie — the rule defers instead of asserting past its evidence.
    var mask = (capped || ood) ? (board || []) : withinCap(board, roster);
    var pick = null;
    mask.forEach(function (p) { if (!pick || adpOf(p) < adpOf(pick)) pick = p; });
    return {
      pick: pick,
      within_need: !capped && !ood && !!pick,
      capped: capped,
      out_of_domain: ood,
      reason: reasonFor(pick, roster, capped, ood),
      open_positions: openPositions(roster),
      bye_stack: byeStack(pick, roster),
      confidence: ood
        ? 'PAST THE MEASURED REGION — the mask was measured filling expensive skill starters, '
          + 'not cheap bench/onesie slots; this is your call, not a masked recommendation'
        : 'rule ranking is measured & robust (holds across seats, opponent models, keeper '
          + 'slates); any $ figure is MC-harness tier, not a season projection',
    };
  }

  function isAllCapped(board, roster) {
    var c = counts(roster);
    return !(board || []).some(function (p) {
      return (c[p.position] || 0) < startableCap(p.position);
    });
  }

  /* The FIELD when it's close: the top N within-need players by ADP, so the human can
   * choose. Each carries its position and ADP; the caller prices intervals. */
  function fieldWithinNeed(board, roster, n) {
    return withinCap(board, roster).slice()
      .sort(function (a, b) { return adpOf(a) - adpOf(b); })
      .slice(0, n || 4);
  }

  var api = { recommend: recommend, fieldWithinNeed: fieldWithinNeed, withinCap: withinCap,
              openPositions: openPositions, byeStack: byeStack, startableCap: startableCap,
              STARTERS: STARTERS, FLEX: FLEX, FLEX_POS: FLEX_POS, adpOf: adpOf };
  global.DraftNeedRule = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
