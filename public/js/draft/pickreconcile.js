/* PICK RECONCILE (feature A) — Sleeper is authoritative; make local state match.
 *
 * A mis-marked pick corrupts every downstream recommendation (need model, roster
 * count, survival). Two fixes:
 *   - reconcileMine(): the clean one — pull what Sleeper says MY roster is and
 *     diff it against my local marks, so a single control fixes any local error
 *     regardless of cause (fat-thumb, double-mark, a pick marked to the wrong
 *     seat). Keepers are never touched — they are mine in any room and are not in
 *     Sleeper's DRAFT picks.
 *   - lastMark(): the sync-dead fallback — identify the most recent LOCAL mark so
 *     one tap can revert it.
 *
 * Pure: diffs sets, returns {misMarks, missing, authoritativeMine}; the caller
 * applies the changes and writes corrections to the ledger (never deletes history).
 * Unit-tested in draft/tests/pickreconcile.test.js.
 */
(function (global) {
  'use strict';

  function slotOf(p) {
    return p.draft_slot != null ? p.draft_slot
      : (p.roster_id != null ? p.roster_id : p.picked_by);
  }

  /* Diff my LOCAL marks against Sleeper's authoritative picks for my seat.
   *   localMarked   ids I marked as MY picks (guesses)
   *   sleeperPicks  [{player_id, draft_slot|roster_id|picked_by}] from sync.allPicks()
   *   mySlot        my seat id in Sleeper (roster_id / draft_slot)
   *   keepers       my keeper ids — never a mis-mark, never re-added
   * Returns:
   *   authoritativeMine  ids Sleeper says are on my seat
   *   misMarks           ids I marked but Sleeper does NOT confirm as mine (remove)
   *   missing            ids Sleeper says are mine that I never marked (add) */
  function reconcileMine(localMarked, sleeperPicks, mySlot, keepers) {
    var marked = new Set((localMarked || []).map(String));
    var keeperSet = new Set((keepers || []).map(String));
    var mine = new Set();
    (sleeperPicks || []).forEach(function (p) {
      if (mySlot != null && String(slotOf(p)) === String(mySlot)) mine.add(String(p.player_id));
    });
    var misMarks = [], missing = [];
    marked.forEach(function (id) {
      if (!mine.has(id) && !keeperSet.has(id)) misMarks.push(id);
    });
    mine.forEach(function (id) {
      if (!marked.has(id) && !keeperSet.has(id)) missing.push(id);
    });
    return { authoritativeMine: Array.from(mine), misMarks: misMarks, missing: missing,
             clean: misMarks.length === 0 && missing.length === 0 };
  }

  /* The most recent LOCAL mark (for one-tap revert in the sync-dead case).
   * `recentPicks` is the app's feed (each {player_id, pick_no}); `localMarked` the
   * set of my guesses. Returns the player_id of the last marked-mine pick, or null. */
  function lastMark(recentPicks, localMarked) {
    var marked = new Set((localMarked || []).map(String));
    for (var i = (recentPicks || []).length - 1; i >= 0; i--) {
      var id = String(recentPicks[i].player_id);
      if (marked.has(id)) return id;
    }
    return null;
  }

  var api = { reconcileMine: reconcileMine, lastMark: lastMark };
  global.DraftPickReconcile = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
