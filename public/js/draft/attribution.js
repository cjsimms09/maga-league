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

  function isKeeper(p) { return !!(p && p.is_keeper); }

  /**
   * KEEPERS ARE IMMOVABLE. A hard rule, enforced at the one chokepoint every
   * roster write passes through, because a keeper vanishing silently is the
   * fixture-keepers disease again: the roster still looks plausible, the need
   * model quietly reprices three positions, and nothing anywhere says so.
   *
   * Nothing may remove or replace a keeper-badged player: not a pick, not a
   * sync event, not reconciliation. `drop()` is the only way a player leaves a
   * roster in this module, so guarding it covers every path by construction
   * rather than by remembering to add a check at each call site.
   *
   * The one legitimate exception is an explicit un-keeper (the slate itself
   * changed), which goes through `dropAllowingKeeper` and is used only by
   * unmarkLocal — the exact inverse of a user action the user just took.
   */
  var keeperViolations = 0;
  function dropRespectingKeepers(list, id) {
    return (list || []).filter(function (p) {
      if (String(p.player_id) !== String(id)) return true;
      if (isKeeper(p)) { keeperViolations++; return true; }   // refuse, and count it
      return false;
    });
  }
  function keeperGuardReport() { return { violations: keeperViolations }; }
  function resetKeeperGuard() { keeperViolations = 0; }

  /** Put a player on exactly one seat, removing him from every other. */
  function place(state, player, slot, mySlot) {
    const id = String(player.player_id);
    Object.keys(state.rosters).forEach(function (s) {
      if (String(s) !== String(slot)) state.rosters[s] = dropRespectingKeepers(state.rosters[s], id);
    });
    state.rosters[slot] = state.rosters[slot] || [];
    if (!has(state.rosters[slot], id)) state.rosters[slot].push(player);
    // A keeper already on my roster is never displaced by an incoming pick for
    // the same player — and if the incoming copy is not badged, the badged one
    // stays rather than being overwritten by a stub from the sync feed.
    if (has(state.myRoster, id) && state.myRoster.some(function (p) {
      return String(p.player_id) === String(id) && isKeeper(p);
    })) {
      // COUNT THE REFUSAL. Protecting the keeper silently would leave the
      // guard unfalsifiable — the whole point is that an attempt to displace
      // one is visible, so a real slate change is distinguishable from a bug.
      keeperViolations++;
      return;
    }
    state.myRoster = dropRespectingKeepers(state.myRoster, id);
    if (mySlot != null && Number(slot) === Number(mySlot)) state.myRoster.push(player);
  }

  /**
   * REHEARSAL SKIP — a mock pick in a round I do not actually own.
   *
   * Under `top_picks_flat`, keeping three players forfeits rounds 1-3. A mock
   * room does not know that: it hands me picks in those rounds anyway. Those
   * selections are REHEARSAL NOISE — the player is genuinely off the board in
   * this room, so the board and survival model must see him gone, but he is not
   * mine and must never touch my roster, my need model, or my legality state.
   *
   * Recording them as noise rather than discarding them keeps the board honest
   * (he IS unavailable here) while keeping the roster true to draft night.
   */
  function markRehearsalNoise(state, player) {
    if (!player) return state;
    state.drafted.add(String(player.player_id));
    state.rehearsalNoise = state.rehearsalNoise || [];
    if (!has(state.rehearsalNoise, player.player_id)) state.rehearsalNoise.push(player);
    return state;
  }

  /**
   * A pick the user typed or tapped. A guess, and revisable.
   *
   * A SEATLESS MARK IS STILL A MARK. Tapping "✕" on a board row says one thing
   * — THIS MAN IS GONE — and says nothing about who took him, so `slot` is null
   * on the commonest manual action there is. This used to return early on that
   * null and discard the mark entirely: the player never entered `state.drafted`
   * and was removed only from the live `state.board` array by the caller.
   *
   * That is a time bomb rather than a cosmetic gap, because every board rebuild
   * derives from the drafted set —
   *     state.board = state.data.players.filter(p => !state.drafted.has(id))
   * — at app.js:392, :432, :2620 and :3744. So a data refresh, a news override
   * or a keeper change mid-draft RESURRECTED every opponent pick that had been
   * marked by hand, silently, back onto the board as available. The queue's
   * "already drafted" strike-through and the compare tray's drafted badge read
   * the same set and were blind to them too.
   *
   * `applyRemote` had this right all along (record first, return unplaced if the
   * seat is unknown); the two paths simply disagreed about the same question.
   * They now agree, which is the whole point of the shared-state audit: one
   * canonical fact, one derivation.
   *
   * Caught by that audit's INVARIANT 2 firing in the live war room —
   * "3 off the board != 1 picks + 3 keepers" — during the mock-#3 rehearsal.
   */
  function markLocal(state, player, slot, mySlot) {
    if (!player) return state;
    state.drafted.add(String(player.player_id));
    if (!slot) return state;              // seatless mark: gone, unattributed
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
    // A keeper is not undoable, because marking him was never an action the
    // user took — he was seeded from the confirmed slate. Undo unwinds guesses.
    if (state.myRoster.some(function (p) {
      return String(p.player_id) === String(id) && isKeeper(p); })) return state;
    state.drafted.delete(id);
    Object.keys(state.rosters).forEach(function (s) {
      state.rosters[s] = dropRespectingKeepers(state.rosters[s], id);
    });
    state.myRoster = dropRespectingKeepers(state.myRoster, id);
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
                applyRemote: applyRemote, place: place,
                isKeeper: isKeeper, markRehearsalNoise: markRehearsalNoise,
                keeperGuardReport: keeperGuardReport, resetKeeperGuard: resetKeeperGuard };
  global.DraftAttribution = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
