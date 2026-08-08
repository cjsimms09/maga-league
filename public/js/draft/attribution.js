/* Who owns which pick — the one piece of draft state that must never be wrong.
 *
 * Extracted from app.js so it can be TESTED. It was previously inline in a
 * browser IIFE with no exports, which meant the only evidence that "either
 * order works" was a commit message. The Loveland bug lived here: a pick marked
 * by hand before Sleeper reported it became permanent, because the sync path
 * skipped anything already in `drafted`.
 *
 * THE RULE, and everything here follows from it: a local mark is a GUESS made
 * before the data arrived. Sleeper is the RECORD. When they disagree, Sleeper
 * wins — always, in every ordering, including when the guess named the wrong
 * player entirely.
 *
 * `state` is { drafted:Set, rosters:{slot:[player]}, myRoster:[player] }.
 */
(function (global) {
  'use strict';

  function has(list, id) {
    return list.some(function (p) { return String(p.player_id) === String(id); });
  }
  function drop(list, id) {
    return list.filter(function (p) { return String(p.player_id) !== String(id); });
  }

  /** Put a player on exactly one seat, removing him from every other. */
  function place(state, player, slot, mySlot) {
    const id = String(player.player_id);
    Object.keys(state.rosters).forEach(function (s) {
      if (String(s) !== String(slot)) state.rosters[s] = drop(state.rosters[s], id);
    });
    state.rosters[slot] = state.rosters[slot] || [];
    if (!has(state.rosters[slot], id)) state.rosters[slot].push(player);
    state.myRoster = drop(state.myRoster, id);
    if (mySlot != null && Number(slot) === Number(mySlot)) state.myRoster.push(player);
  }

  /** A pick the user typed or tapped. A guess, and revisable. */
  function markLocal(state, player, slot, mySlot) {
    if (!player || !slot) return state;
    state.drafted.add(String(player.player_id));
    place(state, player, slot, mySlot);
    return state;
  }

  /**
   * A-2: take a LOCAL guess back — the exact inverse of markLocal.
   *
   * Only a guess is undoable; a Sleeper-reported pick is the record and has no
   * inverse here (correcting the record is reconciliation's job, not undo's).
   * Removes the player from the drafted set, every seat, and my roster — the
   * caller restores him to the visible board.
   */
  function unmarkLocal(state, player) {
    if (!player) return state;
    const id = String(player.player_id);
    state.drafted.delete(id);
    Object.keys(state.rosters).forEach(function (s) {
      state.rosters[s] = drop(state.rosters[s], id);
    });
    state.myRoster = drop(state.myRoster, id);
    return state;
  }

  /**
   * A pick Sleeper reported. Authoritative.
   *
   * Idempotent: this runs for every pick on every four-second poll, so the
   * common case must be a cheap no-op rather than repeated pushes.
   */
  function applyRemote(state, player, slot, mySlot) {
    if (!player) return state;
    state.drafted.add(String(player.player_id));
    if (slot == null) return state;          // seatless pick: recorded, unplaced
    place(state, player, slot, mySlot);
    return state;
  }

  function emptyState() {
    return { drafted: new Set(), rosters: {}, myRoster: [] };
  }

  const api = { emptyState: emptyState, markLocal: markLocal, unmarkLocal: unmarkLocal,
                applyRemote: applyRemote, place: place };
  global.DraftAttribution = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
