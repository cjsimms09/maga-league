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
  function byeStack(pick, roster) {
    if (!pick || byeOf(pick) == null) return null;
    var proj = (roster || []).concat([pick]);
    var byes = {};
    _starters(proj).forEach(function (p) {
      var b = byeOf(p);
      if (b != null) byes[b] = (byes[b] || 0) + 1;
    });
    var wk = byeOf(pick);
    if (byes[wk] >= 3) return { week: wk, count: byes[wk] };
    return null;
  }

  /* The reason line, in the RULE'S OWN TERMS. */
  function reasonFor(pick, roster, capped) {
    if (!pick) return 'no players available';
    var open = openPositions(roster);
    var openList = Object.keys(open);
    var pos = pick.position;
    var c = counts(roster);
    var isFlexDepth = FLEX_POS[pos] && (c[pos] || 0) >= (STARTERS[pos] || 0);
    var deferred = ['QB', 'DEF'].filter(function (p) {
      return open[p] && (c[p] || 0) < STARTERS[p];   // still-empty onesie starter we're passing on
    });
    if (capped) {
      return 'bench — every starter + flex slot is filled; best value on the board ('
        + pos + ')';
    }
    var lead = 'best available within your remaining need (' + pos + ')';
    if (isFlexDepth) lead = 'best flex-eligible value (' + pos + ') — taken ahead of a weaker '
      + 'starter slot, which is worth more than reaching to fill it';
    var tail = deferred.length
      ? '; ' + deferred.join(' & ') + ' deferred (the market prices ' + (deferred.length > 1 ? 'them' : 'it')
        + ' well later)' : '';
    return lead + tail + (openList.length ? '' : '');
  }

  /* THE RECOMMENDATION. board: available players; roster: my keepers + picks so far. */
  function recommend(board, roster) {
    var capped = isAllCapped(board, roster);
    var mask = capped ? (board || []) : withinCap(board, roster);
    var pick = null;
    mask.forEach(function (p) { if (!pick || adpOf(p) < adpOf(pick)) pick = p; });
    return {
      pick: pick,
      within_need: !capped && !!pick,
      capped: capped,
      reason: reasonFor(pick, roster, capped),
      open_positions: openPositions(roster),
      bye_stack: byeStack(pick, roster),
      confidence: 'rule ranking is measured & robust (holds across seats, opponent '
        + 'models, keeper slates); any $ figure is MC-harness tier, not a season projection',
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
