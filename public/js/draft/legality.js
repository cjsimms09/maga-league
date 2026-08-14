/* THE LEGALITY LAYER — a running guarantee you can SEE, not one you trust.
 *
 * WHY THIS EXISTS (mock #1, severity-1)
 * -------------------------------------
 * Cory finished a mock with no defense. The tool never said a word. The root
 * cause was the seat-identity bug — the need term was reading another team's
 * roster, so DEF read as filled — but the deeper failure is that a silent
 * guarantee is indistinguishable from a broken one. Nothing on screen ever
 * asserted "your lineup is legal", so nothing could visibly stop being true.
 *
 * THE REVISED DOCTRINE (Cory's correction, and he was right)
 * ---------------------------------------------------------
 * My first instinct was to force-fill K/DST at the endgame. That is wrong for
 * this league: 6 bench slots, weekly-resetting waiver priority, two weeks before
 * week 1, and streamable onesies mean **leaving the draft without K/DST is a
 * legitimate strategy** — bench spots are worth more as ceiling fliers under our
 * payout table. So:
 *
 *   - **Onesies (K/DEF) are NEVER force-filled.** The choice is PRICED, not
 *     removed. Ending without them must be a decision made with numbers, never
 *     an accident.
 *   - **Hard legality still applies to the rest.** QB/RB/WR/TE/FLEX are not
 *     streamable in any useful sense; a path that would leave one genuinely
 *     unfillable is suppressed with a reason.
 *
 * The distinction the strip must carry: an empty DEF is *informational*
 * ("streamable — by design?"), an empty RB2 is *alarming*.
 *
 * Pure module: no DOM, no engine coupling. The app renders it, the robot drives
 * it, and both see the same verdict.
 */
(function (global) {
  'use strict';

  // Streamable onesies: weekly-resetting waiver priority means the wire always
  // has a startable option, so these are a pricing question, not a legality one.
  var STREAMABLE = { K: true, DEF: true };
  // FLEX draws from these; a surplus at any of them can fill it.
  var FLEX_POS = ['RB', 'WR', 'TE'];

  function countByPos(roster) {
    var out = {};
    (roster || []).forEach(function (p) {
      var pos = p.position || p.pos;
      if (pos) out[pos] = (out[pos] || 0) + 1;
    });
    return out;
  }

  /**
   * Fill the starting lineup greedily from a roster and report what is missing.
   *
   * Dedicated slots are filled first, then FLEX takes any leftover RB/WR/TE.
   * Returns { filled, required, slots: [{slot, need, have, missing}], missing: [] }
   * where `missing` lists unfilled STARTING slots (not bench).
   */
  function lineupState(roster, starters) {
    var have = countByPos(roster);
    var pool = {};
    Object.keys(have).forEach(function (k) { pool[k] = have[k]; });

    var slots = [];
    var filled = 0, required = 0;

    Object.keys(starters || {}).forEach(function (slot) {
      if (slot === 'FLEX') return;                 // resolved after dedicated
      var need = Number(starters[slot]) || 0;
      required += need;
      var got = Math.min(need, pool[slot] || 0);
      pool[slot] = (pool[slot] || 0) - got;
      filled += got;
      slots.push({ slot: slot, need: need, have: got, missing: need - got,
                   streamable: !!STREAMABLE[slot] });
    });

    var flexNeed = Number((starters || {}).FLEX) || 0;
    if (flexNeed) {
      required += flexNeed;
      var spare = FLEX_POS.reduce(function (n, p) { return n + Math.max(0, pool[p] || 0); }, 0);
      var flexGot = Math.min(flexNeed, spare);
      filled += flexGot;
      slots.push({ slot: 'FLEX', need: flexNeed, have: flexGot,
                   missing: flexNeed - flexGot, streamable: false });
    }

    var missing = slots.filter(function (s) { return s.missing > 0; });
    return { filled: filled, required: required, slots: slots, missing: missing };
  }

  /**
   * THE RUNNING GUARANTEE. Given the roster, the starters map, and how many
   * picks remain, classify the state.
   *
   * status:
   *   'legal'      every starting slot fills
   *   'streamable' only onesies are open — informational, by design
   *   'at-risk'    a non-streamable slot is open but still fillable in time
   *   'ILLEGAL'    a non-streamable slot CANNOT be filled with the picks left
   */
  function assess(roster, starters, picksLeft) {
    var st = lineupState(roster, starters);
    var hard = st.missing.filter(function (s) { return !s.streamable; });
    var soft = st.missing.filter(function (s) { return s.streamable; });
    var hardCount = hard.reduce(function (n, s) { return n + s.missing; }, 0);
    var softCount = soft.reduce(function (n, s) { return n + s.missing; }, 0);
    var left = Number(picksLeft);
    if (!Number.isFinite(left)) left = Infinity;

    var status;
    if (!st.missing.length) status = 'legal';
    else if (!hard.length) status = 'streamable';
    else if (hardCount > left) status = 'ILLEGAL';
    else status = 'at-risk';

    return {
      status: status,
      filled: st.filled,
      required: st.required,
      slots: st.slots,
      hardMissing: hard,
      softMissing: soft,
      hardCount: hardCount,
      softCount: softCount,
      picksLeft: left,
      // TRUE when every remaining pick is spoken for by a mandatory slot. Not a
      // hard filter — a suppression trigger for paths that would waste one.
      mustDraftNow: hard.length > 0 && hardCount >= left,
      /* THE ONESIE SQUEEZE — REPORTED, AND IT CHANGES NOTHING BY ITSELF.
       *
       * TRUE when the open slots (streamable ones included) no longer all fit in
       * the picks remaining. `status` deliberately ignores streamable slots — an
       * empty DEF never reads ILLEGAL however late it is, which is a recorded
       * decision — so there was NO field on this object that could distinguish
       * "two onesies open with eight picks left" from "two onesies open with
       * zero". A consumer wanting to say something about the endgame had to
       * recompute it, and none did.
       *
       * Deliberately NOT wired to suppression, the status, or `deliberate`.
       * Reversing the onesie rule is Cory's call and it is routed; publishing the
       * quantity it turns on is what lets that call be made from evidence. */
      onesieSqueeze: softCount > 0 && (hardCount + softCount) >= left,
      line: line(st, hard, soft, left),
    };
  }

  /** The strip's one line. Informational for onesies, alarming for the rest. */
  function line(st, hard, soft, left) {
    var head = 'Starters: ' + st.filled + '/' + st.required;
    if (!st.missing.length) return head + ' · legal ✓';
    var parts = [];
    if (hard.length) {
      parts.push(hard.map(function (s) {
        return s.slot + (s.missing > 1 ? ' ×' + s.missing : '') + ' unfilled';
      }).join(', ') + (Number.isFinite(left) ? ' · ' + left + ' picks left' : ''));
    }
    if (soft.length) {
      /* THE CLOCK WAS MISSING FROM THIS BRANCH ONLY (2026-08-14).
       *
       * The hard branch above appends `· N picks left`; this one never did. So a
       * reader with DEF and K open saw the SAME SENTENCE at twelve picks left and
       * at zero — "DEF/K empty (streamable — by design?)" — with nothing on the
       * strip to tell the two apart. Measured on Cory's real board: identical text
       * at picks 88, 93, 108, 113, 128 and 133, while `picksLeft` ran 7 down to 2.
       *
       * ⚠ AND THE STATUS IS RIGHT AS IT STANDS — I CHECKED BEFORE ASSUMING
       * OTHERWISE. My first reading was that "by design?" at zero picks left is a
       * reassuring sentence over an unfillable lineup, and that reading is wrong
       * on the mechanism: THE DRAFT IS NOT THE LINEUP DEADLINE. The draft is
       * 22 August and week 1 is mid-September, so an empty DEF or K at the last
       * pick is filled off the wire in the three weeks between — which is exactly
       * what `exitSummary` already writes down as the plan ("claim Tuesday; wire
       * targets pre-loaded"). Calling that ILLEGAL would be the false label, not
       * the true one, and `legality.test.js` calls the rule "the whole revision".
       *
       * It is not FREE — the roster is 15 (9 + 6 bench), so claiming two onesies
       * into a full roster costs two drops. `priceOnesie` already prices that as
       * "the bench slot is the real cost". Priced, not prohibited.
       *
       * So the only real defect here was the ASYMMETRY: the count is a fact, and
       * withholding it from one branch was never part of any decision. */
      parts.push(soft.map(function (s) { return s.slot; }).join('/')
        + ' empty (streamable — by design?)'
        + (Number.isFinite(left) ? ' · ' + left + ' picks left' : ''));
    }
    return head + ' · ' + parts.join(' · ');
  }

  /**
   * Would taking this player leave a mandatory slot unfillable?
   *
   * Suppression, not prohibition: returns a reason string when the pick would
   * strand a non-streamable slot, else null. Onesies never trigger it — that is
   * the whole point of the revision.
   */
  function suppressReason(roster, starters, picksLeft, player) {
    var after = (roster || []).concat([player]);
    var post = assess(after, starters, Number(picksLeft) - 1);
    if (post.status !== 'ILLEGAL') return null;
    var before = assess(roster, starters, picksLeft);
    if (before.status === 'ILLEGAL') return null;   // already lost; not this pick's fault
    return 'would strand ' + post.hardMissing.map(function (s) { return s.slot; }).join('/')
      + ' — ' + post.hardCount + ' mandatory slot(s), ' + post.picksLeft + ' pick(s) left';
  }

  /**
   * PRICE THE ONESIE CHOICE (Cory's revision). No forcing — a comparison.
   * `onesieDollars` / `flierDollars` come from the caller's E[$] model.
   */
  function priceOnesie(slot, onesieDollars, flierDollars) {
    var d = Math.round((Number(onesieDollars) || 0) * 10) / 10;
    var f = Math.round((Number(flierDollars) || 0) * 10) / 10;
    return {
      slot: slot,
      onesie: d,
      flier: f,
      delta: Math.round((d - f) * 10) / 10,
      verdict: d >= f ? 'take the ' + slot : 'the flier prices higher',
      note: slot + ' is streamable — waiver priority resets weekly and the wire '
        + 'always has a startable option, so the bench slot is the real cost',
    };
  }

  /**
   * DRAFT-EXIT SUMMARY. What is unfilled, and the plan for it, so ending the
   * draft is deliberate and the in-season tools inherit the to-do.
   */
  function exitSummary(roster, starters, picksLeft) {
    var a = assess(roster, starters, picksLeft);
    var todo = a.softMissing.map(function (s) {
      return { slot: s.slot, plan: 'stream ' + s.slot + ' — claim Tuesday; '
        + 'wire targets pre-loaded' };
    });
    a.hardMissing.forEach(function (s) {
      todo.push({ slot: s.slot, plan: 'MANDATORY slot unfilled — this is not a '
        + 'streaming plan, it is a hole' });
    });
    return {
      status: a.status,
      line: a.line,
      deliberate: a.status === 'legal' || a.status === 'streamable',
      todo: todo,
    };
  }

  /**
   * MISSED-MARK RECOVERY (4) — END-OF-DRAFT RECONCILIATION.
   *
   * Compare what I marked against what Sleeper says I own. Every discrepancy is
   * listed for one-tap correction BEFORE the draft archives, because a wrong
   * roster at exit corrupts the grading data everything downstream depends on.
   *
   * Returns { ok, missing[], extra[] }:
   *   missing — Sleeper has him, I never recorded him (the forgot-to-tap case)
   *   extra   — I recorded him, Sleeper does not have him (a mis-tap)
   */
  function reconcileExit(markedRoster, sleeperRoster) {
    var mine = {};
    (markedRoster || []).forEach(function (p) { mine[String(p.player_id)] = p; });
    var theirs = {};
    (sleeperRoster || []).forEach(function (p) { theirs[String(p.player_id)] = p; });
    var missing = Object.keys(theirs).filter(function (id) { return !mine[id]; })
      .map(function (id) { return theirs[id]; });
    var extra = Object.keys(mine).filter(function (id) { return !theirs[id]; })
      .map(function (id) { return mine[id]; });
    return {
      ok: missing.length === 0 && extra.length === 0,
      missing: missing, extra: extra,
      // Never auto-applied. The list is for ONE-TAP CORRECTION -- a roster the
      // owner did not confirm is the same problem as a pick he did not make.
      note: (missing.length || extra.length)
        ? 'roster differs from Sleeper — correct before archiving'
        : 'roster matches Sleeper',
    };
  }

  var api = { reconcileExit: reconcileExit, STREAMABLE: STREAMABLE, FLEX_POS: FLEX_POS, lineupState: lineupState,
              assess: assess, suppressReason: suppressReason,
              priceOnesie: priceOnesie, exitSummary: exitSummary };
  global.DraftLegality = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
