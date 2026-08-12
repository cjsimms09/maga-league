/* THE DRAFT SURVIVES THE PAGE. Cory, 2026-08-13, mid-mock:
 *
 *   "The site reset and the draft started over. ON THE 22ND THAT IS
 *    UNRECOVERABLE. A reset at pick 80 means no board, no recommendations, no
 *    override records, and no way to reconstruct where I was — during the one
 *    event this entire system exists for."
 *
 * ── WHAT WAS ACTUALLY WRONG ─────────────────────────────────────────────────
 *
 * There was NO PERSISTENCE OF DRAFT STATE AT ALL. `state.drafted`,
 * `state.rosters`, `state.myRoster` and `state.recentPicks` lived only in
 * memory. Twenty-odd other things were persisted — weights, lists, rail
 * acknowledgements, the pinned board, the keeper slate, even the mock
 * calibration — and THE PICKS WERE NOT. So any page load started over.
 *
 * No reload is triggered by our own code: there is no `location.reload` in
 * app.js and no auto-refresh. Which means the reload came from outside it — a
 * phone discarding a backgrounded tab during a long mock is the likeliest, and
 * a deploy landing mid-draft or a stray refresh do the same thing. THE CAUSE
 * BARELY MATTERS, because every one of them lands on the same defect: nothing
 * was written down, so there was nothing to come back to.
 *
 * ── WHY A MODULE RATHER THAN INLINE IN app.js ───────────────────────────────
 *
 * Cory's requirement is "MAKE IT TESTABLE — I want to be able to kill the page
 * mid-mock and come back to where I was." Serialisation inline in a browser IIFE
 * can only ever be source-scanned (rule 11e), and a source scan cannot tell a
 * working round-trip from a comment describing one. These are pure functions:
 * Node can drive a full save/restore cycle and assert the state that comes back.
 *
 * ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────
 *
 * IDs ARE STORED, NOT PLAYER OBJECTS, and rehydration reads them back off the
 * live board. A snapshot of player objects would restore a stale board silently
 * — the pre-deploy projections, the pre-deploy ADP — and look completely normal.
 *
 * A RESTORE ONTO A DIFFERENT BOARD IS REPORTED, NEVER SILENT. If `built_at`
 * moved, or a stored id is no longer in the pool, the caller gets it in
 * `warnings` and must surface it. Restoring 79 of 80 picks and saying nothing is
 * worse than not restoring: the board would look right and be wrong.
 */
(function (global) {
  'use strict';

  var KEY = 'maga.draft.session.v1';
  var VERSION = 1;

  function idsOf(list) {
    return (list || []).map(function (p) {
      return String(p && p.player_id != null ? p.player_id : p);
    });
  }

  /* The keeper flag is CARRIED, not re-derived. `state.myRoster` holds keepers
   * with `is_keeper: true` and several surfaces branch on it; re-deriving from
   * the keeper slate on restore would be a second derivation of the same fact,
   * free to disagree with the first. */
  function myRosterEntries(list) {
    return (list || []).map(function (p) {
      return { id: String(p.player_id), is_keeper: !!p.is_keeper };
    });
  }

  function serialize(state, meta) {
    var s = state || {}, m = meta || {};
    var rosters = {};
    Object.keys(s.rosters || {}).forEach(function (slot) {
      rosters[slot] = idsOf(s.rosters[slot]);
    });
    return {
      v: VERSION,
      saved_at: m.now || new Date().toISOString(),
      built_at: m.built_at || null,
      mode: s.mode || null,
      mockMode: s.mockMode || null,
      mySlot: m.mySlot != null ? m.mySlot : null,
      drafted: s.drafted ? Array.from(s.drafted).map(String) : [],
      rosters: rosters,
      myRoster: myRosterEntries(s.myRoster),
      recentPicks: (s.recentPicks || []).slice(0, 40),
      lastPickSeen: s.lastPickSeen != null ? s.lastPickSeen : null,
      pickContextId: s.pickContextId != null ? s.pickContextId : null,
      clockMode: !!s.clockMode,
      clockIndex: s.clockIndex || 0,
    };
  }

  /* Rehydrate against the LIVE board. Returns { ok, state, warnings, stats }.
   * `state` carries only the fields a caller should assign; it never touches
   * anything the saved blob did not cover. */
  function restore(saved, board, opts) {
    var o = opts || {};
    var warnings = [];
    if (!saved || typeof saved !== 'object') {
      return { ok: false, reason: 'no saved session', warnings: warnings };
    }
    if (saved.v !== VERSION) {
      return { ok: false, reason: 'saved session is version ' + saved.v
        + ', this build reads version ' + VERSION
        + ' — refusing to guess at a shape that has changed', warnings: warnings };
    }
    /* KEPT PLAYERS ARE NOT ON THE DRAFTABLE BOARD, and that is correct — they
     * are off it precisely because they cannot be drafted. But they ARE on my
     * roster, so a rehydration that looks only at `players` loses all three of
     * Cory's keepers on every restore: he would come back from a crash to a
     * roster missing Chase, Henry and Walker, with the recommendation engine
     * then scoring need and stack against a roster that is three players short.
     *
     * Caught by this module's own test rather than by review, and it is the
     * THIRD time today that `kept_players` being disjoint from `players` has
     * produced a wrong answer. The lookup pool is therefore explicit here rather
     * than assumed by the caller. */
    var lookup = (board || []).concat(o.alsoLookIn || []);
    var byId = {};
    lookup.forEach(function (p) { byId[String(p.player_id)] = p; });

    // A BOARD REBUILD IS NOT A CORRUPTION, but it is not nothing either: ADP,
    // projections and tiers all move, so a restored pick list is being read
    // against numbers it was not made against.
    if (saved.built_at && o.built_at && saved.built_at !== o.built_at) {
      warnings.push('the board was rebuilt since this draft started (saved '
        + saved.built_at + ', now ' + o.built_at + ') — the picks are intact but '
        + 'every projection, ADP and tier behind them has moved');
    }

    var missing = [];
    function hydrate(ids) {
      var out = [];
      (ids || []).forEach(function (id) {
        var p = byId[String(id)];
        if (p) out.push(p); else missing.push(String(id));
      });
      return out;
    }

    var rosters = {};
    Object.keys(saved.rosters || {}).forEach(function (slot) {
      rosters[slot] = hydrate(saved.rosters[slot]);
    });
    var myRoster = [];
    (saved.myRoster || []).forEach(function (e) {
      var p = byId[String(e.id)];
      if (!p) { missing.push(String(e.id)); return; }
      // Copy rather than mutate the board row: `is_keeper` is a property of my
      // roster entry, not of the player, and stamping it onto the shared board
      // object would leak into every other surface reading that row.
      myRoster.push(Object.assign({}, p, { is_keeper: !!e.is_keeper }));
    });

    // THE DRAFTED SET IS KEPT WHOLE EVEN WHEN A PLAYER LEFT THE POOL. A pick
    // that no longer resolves is still a pick that HAPPENED — dropping it would
    // silently hand that player back to the board as available, which is the
    // one error that actively misleads a live draft.
    var drafted = new Set((saved.drafted || []).map(String));
    var unresolved = (saved.drafted || []).map(String).filter(function (id) {
      return !byId[id];
    });
    if (unresolved.length) {
      warnings.push(unresolved.length + ' drafted player(s) are no longer in the '
        + 'pool and cannot be named, but are still held as taken: '
        + unresolved.slice(0, 5).join(', '));
    }
    if (missing.length) {
      warnings.push(missing.length + ' roster entr(ies) could not be matched to a '
        + 'board row and were dropped from the roster views');
    }

    return {
      ok: true,
      warnings: warnings,
      stats: { drafted: drafted.size, myRoster: myRoster.length,
        unresolved: unresolved.length, savedAt: saved.saved_at },
      state: {
        mode: saved.mode, mockMode: saved.mockMode,
        drafted: drafted, rosters: rosters, myRoster: myRoster,
        recentPicks: saved.recentPicks || [],
        lastPickSeen: saved.lastPickSeen, pickContextId: saved.pickContextId,
        clockMode: !!saved.clockMode, clockIndex: saved.clockIndex || 0,
      },
      mySlot: saved.mySlot,
    };
  }

  /* WRITING MUST NEVER TAKE THE DRAFT DOWN. A quota error or private-mode
   * refusal on a save is a lost recovery point; a thrown exception on the clock
   * is a lost draft. So it reports rather than throws — and it reports, rather
   * than swallowing, because a persistence layer that fails silently is exactly
   * the thing this file exists to replace. */
  function save(state, meta, storage) {
    var st = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!st) return { ok: false, reason: 'no storage' };
    try {
      st.setItem(KEY, JSON.stringify(serialize(state, meta)));
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: (e && e.name) || 'write failed' };
    }
  }

  function load(storage) {
    var st = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!st) return null;
    try { return JSON.parse(st.getItem(KEY) || 'null'); } catch (e) { return null; }
  }

  function clear(storage) {
    var st = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!st) return;
    try { st.removeItem(KEY); } catch (e) {}
  }

  /* Is there anything worth offering to resume? A saved session with no picks is
   * a fresh page, not a recovery — offering to restore it would train Cory to
   * dismiss the banner, and a banner that is always there is not a signal. */
  function isResumable(saved) {
    return !!(saved && saved.v === VERSION
      && ((saved.drafted || []).length > 0 || (saved.myRoster || []).length > 0));
  }

  var api = { KEY: KEY, VERSION: VERSION, serialize: serialize, restore: restore,
    save: save, load: load, clear: clear, isResumable: isResumable };
  global.DraftSession = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
