/* Module 9 — live draft sync.
 *
 * Polls Sleeper for picks and reconciles them against the local board. Sleeper's
 * CORS headers could not be verified from the build environment, so the first
 * request races a direct fetch against a same-origin proxy on this site; whichever
 * works is remembered for the rest of the draft. Either way the draft never
 * depends on a service we control being up.
 *
 * Manual entry is a first-class path, not a fallback bolted on: off-platform
 * drafts and API lag both end the same way — someone types the pick in.
 */
(function (global) {
  'use strict';

  const DIRECT = 'https://api.sleeper.app/v1';
  const PROXY = '/admin/sleeper-proxy?path=';
  const POLL_MS = 4000;      // spec asks 3-5s; 4 is polite and plenty fast
  const BACKOFF_MAX = 30000; // on repeated failure, ease off rather than hammer

  /**
   * Get a draft id out of whatever got pasted.
   *
   * People paste the URL, because that is what is in front of them. They also
   * paste with a trailing space, and on a phone they sometimes get a zero-width
   * character courtesy of the share sheet. Every one of those used to produce
   * "Sleeper unreachable (HTTP 400)" — which is a lie twice over: Sleeper was
   * never contacted, and nothing was unreachable. Our own allowlist rejected a
   * malformed path and the UI blamed the other end.
   *
   * Sleeper ids are long digit strings, so the last long run of digits in the
   * input is the id whether they pasted a bare number or the whole URL.
   */
  function normalizeDraftId(input) {
    const raw = String(input == null ? '' : input).replace(/[\s\u200B-\u200D\uFEFF]/g, '');
    if (!raw) return { id: null, error: null };
    if (/^\d{6,25}$/.test(raw)) return { id: raw, error: null };
    const runs = raw.match(/\d{6,25}/g);
    if (runs && runs.length) return { id: runs[runs.length - 1], error: null };
    return {
      id: null,
      error: 'That does not look like a draft ID. Open the draft on Sleeper and copy '
        + 'the number out of the address bar — sleeper.com/draft/nfl/<number>.',
    };
  }

  function DraftSync(opts) {
    const parsed = normalizeDraftId(opts.draftId);
    this.draftId = parsed.id;
    this.idError = parsed.error;
    this.onPicks = opts.onPicks || function () {};
    this.onStatus = opts.onStatus || function () {};
    /* Fires when a draft that WAS answering starts 404ing repeatedly — the
     * signature of a Sleeper mock room being deleted after it ends (captured
     * live 2026-08-17: the page retried a garbage-collected mock forever while
     * its dead picks kept pricing the board). Optional: undefined keeps the
     * old retry-only behavior. */
    this.onDeadRoom = opts.onDeadRoom || null;
    /* After a page reload the resumed sync has never succeeded (lastOkAt null)
     * even though the BOARD carries the resumed picks — the caller passes this
     * hint so a deleted room is still recognized as "gone", not "bad id". */
    this.resumedWithPicks = !!opts.resumedWithPicks;
    this.dead404s = 0;
    this.transport = null;     // 'direct' | 'proxy' — decided on first success
    this.timer = null;
    this.failures = 0;
    this.lastOkAt = null;
    this.picks = [];
    this.manual = [];          // hand-entered picks, merged with the API's
    this.running = false;
  }

  DraftSync.prototype.fetchJson = function (path) {
    // An error has to say which end refused, and why. "HTTP 400" alone sent us
    // hunting Sleeper's status page for a validation failure of our own making.
    const fail = (where, r) => r.json().catch(() => ({})).then(body => {
      const why = body && body.error ? body.error : 'HTTP ' + r.status;
      const e = new Error(where + ': ' + why);
      e.status = r.status;
      e.viaProxy = where === 'this site';
      throw e;
    });
    // A 200 whose body is not JSON (an outage page, a block page) used to
    // surface as "Sleeper unreachable (Unexpected token <...)" — the same lie
    // in the other direction: Sleeper WAS reached, it just did not answer with
    // data. Classified here so the status line can say which failure happened.
    const parse = (where, r) => r.json().catch(() => {
      const e = new Error(where + ' answered HTTP ' + r.status
        + ' with a body that is not JSON — an outage or block page, not pick data.');
      e.status = r.status;
      e.nonJson = true;
      e.viaProxy = where === 'this site';
      throw e;
    });
    const tryDirect = () => fetch(DIRECT + path, { mode: 'cors' })
      .then(r => { if (!r.ok) return fail('Sleeper', r); return parse('Sleeper', r); })
      .then(j => { this.transport = 'direct'; return j; });
    const tryProxy = () => fetch(PROXY + encodeURIComponent(path))
      .then(r => { if (!r.ok) return fail('this site', r); return parse('this site', r); })
      .then(j => { this.transport = 'proxy'; return j; });

    if (this.transport === 'direct') return tryDirect().catch(tryProxy);
    if (this.transport === 'proxy') return tryProxy();
    // First call: try direct (fast, no function invocations), fall back to proxy.
    return tryDirect().catch(tryProxy);
  };

  DraftSync.prototype.start = function () {
    if (this.idError) { this.onStatus({ state: 'error', message: this.idError }); return; }
    if (!this.draftId) { this.onStatus({ state: 'manual', message: 'Manual entry mode' }); return; }
    this.running = true;
    this.poll();
  };

  DraftSync.prototype.stop = function () {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  };

  /**
   * The draft object itself — slot assignments, straight from the source.
   *
   * Sleeper knows who sits where. Typing my own slot in is an error waiting to
   * happen, and falling back to enumeration order for the manager profiles
   * silently applies the wrong person's tendencies to the wrong seat, which
   * corrupts Layer 2 in a way no test catches and no user notices.
   */
  DraftSync.prototype.fetchDraft = function () {
    return this.fetchJson('/draft/' + this.draftId);
  };

  DraftSync.prototype.poll = function () {
    if (!this.running) return;
    const self = this;
    this.fetchJson('/draft/' + this.draftId + '/picks')
      .then(picks => {
        /* ⚠️ TWO 200-OK RESPONSES THAT ARE NOT A PICK LIST, BOTH SILENT UNTIL
         * THE 2026-08-16 CHAOS DRILL.
         *
         * 1. A NON-ARRAY BODY ({"error": ...} is valid JSON) fell through the
         *    old `if (Array.isArray(picks))` with NO status message at all —
         *    and worse, `lastOkAt` had already been refreshed above it and
         *    `failures` reset. So while Sleeper served garbage, the sync-age
         *    readout said FRESH, the system strip's "SYNC STALE" red channel
         *    could never fire, and the board sat frozen with full confidence.
         *    A silent wrong number in the one field every staleness surface
         *    trusts.
         *
         * 2. AN EMPTY ARRAY MID-DRAFT wiped the board: `self.picks = []` with
         *    40 picks in rewinds the clock to pick 1, and every survival
         *    window and recommendation is computed as if nobody had drafted —
         *    while the status line said "Synced — 0 picks in", state 'live'.
         *    The Python logger REFUSES an empty read for exactly this reason
         *    (`or []` is a broken read, not an empty draft); the war room now
         *    holds its picks and says so. A genuinely empty pre-draft room
         *    (picks 0 -> 0) still reads as live sync, unchanged.
         *
         * Neither updates lastOkAt: "the picks last came back GOOD" is the
         * quantity every age surface renders, and garbage is not good. */
        if (!Array.isArray(picks) || (picks.length === 0 && self.picks.length > 0)) {
          self.failures++;
          const wait = Math.min(BACKOFF_MAX, POLL_MS * Math.pow(2, self.failures));
          const shape = Array.isArray(picks) ? 'an EMPTY pick list'
            : picks === null ? 'null'
            : typeof picks === 'object' ? 'an object'
              + (picks.error ? ' ("' + picks.error + '")' : '')
            : 'a ' + typeof picks;
          self.onStatus({
            state: 'error',
            lastOkAt: self.lastOkAt || null,
            message: 'Sleeper answered the pick poll with ' + shape
              + (Array.isArray(picks)
                ? ' while ' + self.picks.length + ' picks are on the board — a broken read, not an undrafted room.'
                : ' instead of a pick list.')
              + ' KEEPING the ' + self.picks.length + ' picks already in. Retrying in '
              + Math.round(wait / 1000) + 's. You can enter picks by hand meanwhile.',
          });
          self.timer = setTimeout(function () { self.poll(); }, wait);
          return;
        }
        self.failures = 0;
        self.dead404s = 0;
        // LAST-GOOD TIME, so a caller can render AGE rather than a bare "synced".
        // On draft night a stalled sync looks identical to a working one: the
        // status line freezes on its last message and the board keeps
        // recommending players who went four picks ago, with full confidence and
        // no indication. Age is the only honest signal, and it has to come from
        // the module that knows — deriving it in each surface is how one surface
        // ends up honest and the next does not.
        self.lastOkAt = Date.now();
        const before = self.picks.length;
        self.picks = picks;
        self.onStatus({
          state: 'live',
          // A SHRINKING list is accepted (a commissioner CAN undo a pick on
          // Sleeper, and Sleeper's full list is the record) but it is never
          // silent: the board following an undo looks identical to the board
          // losing picks, and only one of those is fine.
          message: picks.length < before
            ? 'Pick list SHRANK from ' + before + ' to ' + picks.length
              + ' (a pick undone on Sleeper?) — following Sleeper\'s list.'
            : 'Synced via ' + self.transport + ' — ' + picks.length + ' picks in',
          newPicks: picks.length - before,
          lastOkAt: self.lastOkAt,
        });
        self.onPicks(self.allPicks());
        self.timer = setTimeout(function () { self.poll(); }, POLL_MS);
      })
      .catch(err => {
        self.failures++;
        const wait = Math.min(BACKOFF_MAX, POLL_MS * Math.pow(2, self.failures));
        self.onStatus({
          state: 'error',
          // Carried on the ERROR path too: how long since the board was last
          // right matters more than how long the current failure has lasted.
          lastOkAt: self.lastOkAt || null,
          // A 4xx at the START will not fix itself by waiting — it means the id
          // or the path is wrong. But a 4xx AFTER the sync has been working
          // (chaos drill, 2026-08-16: a mid-draft 403 rate-limit/block) is NOT
          // a bad draft id — the id already proved itself — and sending Cory
          // off to re-check a working id mid-draft is a misdirection. lastOkAt
          // is the witness: null means the id never worked, set means it did.
          // A non-JSON 200 is its own case (err.nonJson) — "unreachable" was a
          // lie there too; the parse error already names both ends and why.
          message: (err.nonJson
              ? err.message + ' Retrying in ' + Math.round(wait / 1000) + 's.'
              : err.status === 404 && (self.lastOkAt || self.resumedWithPicks)
              /* A 404 AFTER the id worked is not a rate limit — the draft is
               * GONE. Sleeper deletes mock rooms when they end, so this is the
               * normal end-of-mock signature, and the honest message is "this
               * room no longer exists", not "retrying will fix it". */
              ? 'This draft no longer exists at Sleeper (mock rooms are deleted '
                + 'when they end). The board still holds its ' + self.picks.length
                + ' picks — clear them before connecting your next room.'
              : err.status >= 400 && err.status < 500
              ? (self.lastOkAt
                  ? 'Rejected by ' + err.message + ' AFTER the sync had been working — '
                    + 'a rate limit or block, not a bad draft ID. Retrying in '
                    + Math.round(wait / 1000) + 's.'
                  : 'Rejected by ' + err.message + '. Check the draft ID — that will not fix itself by retrying.')
              : 'Sleeper unreachable (' + err.message + '). Retrying in ' + Math.round(wait / 1000) + 's.')
            + ' You can enter picks by hand meanwhile.',
        });
        if (err.status === 404 && (self.lastOkAt || self.resumedWithPicks)) {
          self.dead404s++;
          if (self.dead404s >= 3 && self.onDeadRoom) {
            try { self.onDeadRoom(self.dead404s); } catch (e) { /* never break the poll */ }
          }
        } else {
          self.dead404s = 0;
        }
        self.timer = setTimeout(function () { self.poll(); }, wait);
      });
  };

  /** API picks plus anything typed in, de-duplicated by player. */
  DraftSync.prototype.allPicks = function () {
    const seen = new Set();
    const out = [];
    /* Superseded placeholders are excluded HERE rather than deleted, so the
     * retirement is reversible and the row can still be inspected. A real pick
     * arriving out of order un-retires nothing — the watermark only rises. */
    const dead = new Set(this.supersededManual ? this.supersededManual() : []);
    /* Recomputed PER PASS, like pickNoCollisions below — before 2026-08-16 this
     * accumulated across renders, so one id-less pick read as "47 dropped"
     * after 47 renders. The count is the state of THIS list, not a lifetime
     * tally, or the number itself becomes the wrong number. */
    this.droppedNoId = 0;
    this.picks.concat(this.manual.filter(m => !dead.has(String(m.player_id))))
      .forEach(p => {
      const id = String(p.player_id || (p.metadata && p.metadata.player_id) || '');
      /* ⚠️ A PICK WITH NO RESOLVABLE ID WAS DROPPED SILENTLY, AND A DROPPED
       * PICK MAKES THE CLOCK READ EARLY.
       *
       * `currentPick` is `pickEvents + 1`. Lose one pick here and the board
       * believes fewer selections have happened than really have, so every
       * survival window is computed too early and every player looks more
       * likely to last than he is. That is the same failure that cost 25 slots
       * this morning via `applySlot`, arriving from a different direction — and
       * this one leaves no trace at all.
       *
       * Dedup on `seen` is CORRECT and stays silent: the same player appearing
       * twice is one selection, and Sleeper rows are concatenated ahead of
       * manual ones so the real pick wins the slot. Only the ID-LESS case is
       * counted, because that is a pick the room made that this board cannot
       * represent. */
      if (!id) {
        this.droppedNoId += 1;
        return;
      }
      if (seen.has(id)) return;
      seen.add(id);
      out.push({
        player_id: id,
        pick_no: p.pick_no || out.length + 1,
        round: p.round,
        picked_by: p.picked_by || p.roster_id,
        roster_id: p.roster_id,
        // DRAFT_SLOT IS THE SEAT, AND IN A MOCK IT IS THE ONLY ONE.
        //
        // Reported from a real mock: a round-4 pick did not register. This
        // normaliser dropped draft_slot, and reconcile.js reads
        // `p.draft_slot || p.roster_id || null`. In a LEAGUE draft roster_id
        // exists, so the fallback covered the omission and everything worked.
        // A MOCK DRAFT HAS NO ROSTERS — Sleeper sends roster_id null and puts
        // the seat in draft_slot — so every mock pick resolved to team_slot
        // null, could not be attributed to any seat, and vanished from the
        // roster it belonged to.
        //
        // The mock is the rehearsal for draft day, so a bug that only appears
        // in mocks is a bug in the only practice available.
        draft_slot: p.draft_slot != null ? p.draft_slot
          : (p.metadata && p.metadata.draft_slot != null ? p.metadata.draft_slot : null),
        source: p.__manual ? 'manual' : 'sleeper',
        // SLEEPER SERVES `is_keeper` ON EVERY PICK (log_draft_picks.py's own
        // `_from_sleeper` reads the identical field) and this normaliser
        // built a NEW object without carrying it over — the same shape as the
        // draft_slot omission fixed above, in the same function, and never
        // caught for this field because a mock room carries no real keepers,
        // so reconcileKeepers() (app.js) is the only live consumer and it is
        // explicitly skipped in mock mode (`state.mockMode` guard). Found
        // empirically: with Cory's real keepers correctly placed on Sleeper,
        // `reconcile()` reported all three "missing... still on the board"
        // and halted, because every pick here silently lost is_keeper before
        // reconcile() ever saw it. Session E, 2026-08-18.
        is_keeper: !!p.is_keeper,
        metadata: p.metadata || {},
      });
    });
    out.sort((a, b) => (a.pick_no || 0) - (b.pick_no || 0));
    /* THE AGGREGATE THAT MAKES BOTH SILENT FAILURES LOUD.
     *
     * `pick_no: p.pick_no || out.length + 1` above substitutes a POSITION for a
     * missing pick number. That is a plausible value standing in for an absent
     * one, and it can COLLIDE with a real pick_no — after which the sort order
     * between the two is arbitrary, and run detection reads a sequence the room
     * never produced.
     *
     * Neither this nor the id-less drop is worth refusing over mid-draft: the
     * board is still mostly right and stopping is worse. Both are COUNTED and
     * exposed so a surface can say so, which is the difference between a
     * degraded board and a board that lies about being intact. */
    const nos = out.map(r => r.pick_no);
    this.pickNoCollisions = nos.length - new Set(nos).size;
    return out;
  };

  /* THE SEAT A PICK BELONGS TO. `draft_slot` is the chair and `roster_id` is the
   * team; a MOCK draft has no rosters, so the seat only lives in draft_slot. */
  function seatOf(p) {
    return Number(p.draft_slot) || Number(p.roster_id) || null;
  }

  /* ⚠️ A TYPED PICK IS A PLACEHOLDER, AND IT HAS TO RETIRE ITSELF.
   *
   * B drove this and it is the one that mattered most: the room takes a player
   * the board does not carry, Cory types it in, Sleeper comes back and reports
   * THE SAME PICK under its own id, and the pick is counted TWICE — drafted
   * 15 -> 16 -> 17, seat 3 holding both `manual:rondale-deepcut` and `990001`.
   * `recordManualPick` mints a synthetic id and `allPicks()` dedupes BY
   * player_id, so a synthetic id can never equal Sleeper's. `removeManual()`
   * existed for exactly this and was called from nowhere in the repo.
   *
   * MY OWN CHANGE MADE IT REACHABLE IN THE COMMON CASE. Before 2026-08-13 a
   * wedge unlinked sync permanently, so Sleeper never came back and the
   * duplicate never arrived; the bug was real and largely unreachable. Now the
   * board recovers by itself, which is right — and it means every pick typed
   * during an outage WILL be reported again a few seconds later. The fallback
   * B measured is the whole plan after a wedge, and it was putting the picks out
   * of step, which is the exact opposite of what its own form promises.
   *
   * ── WHY NOT MATCH BY NAME, WHICH IS THE OBVIOUS FIX ──────────────────────
   *
   * Because getting it wrong MERGES TWO DIFFERENT PLAYERS, and the room contains
   * similar names on purpose (B's own probe hit `Frank Gore Sr` / `Frank Gore
   * Jr` in a different guard, and their case-sensitive match let a duplicate
   * through as `rondale deepcut` vs `Rondale Deepcut`). A wrong merge deletes a
   * real pick from the board and looks like nothing happened.
   *
   * A TYPED ROW NEVER CLAIMED TO IDENTIFY A PLAYER. It claims "SEAT S MADE A
   * PICK WE COULD NOT IDENTIFY". So it is retired on exactly that claim being
   * satisfied: the moment seat S has MORE REAL PICKS than it had when the row
   * was typed, the placeholder has been superseded and is dropped. Count-
   * preserving, identity-free, and it cannot merge two players because it never
   * asserts who the player was.
   *
   * WHAT IT DOES WHEN IT IS WRONG, which is the half worth stating: if Cory
   * types a pick against the WRONG SEAT, that placeholder never retires and sits
   * on the board as a visible stale row. A stale row he can see beats a silent
   * double count he cannot — and `removeManual` is still there to delete it. */
  DraftSync.prototype.realPicksForSeat = function (seat) {
    if (seat == null) return 0;
    return this.picks.filter(p => seatOf(p) === Number(seat)).length;
  };

  DraftSync.prototype.addManual = function (playerId, rosterId, draftSlot) {
    const seat = draftSlot != null ? Number(draftSlot) : Number(rosterId);
    this.manual.push({
      player_id: String(playerId), roster_id: rosterId,
      // Same reasoning as the sleeper path: without a seat a typed pick is
      // recorded but belongs to nobody, which is the failure it exists to fix.
      draft_slot: draftSlot != null ? draftSlot : rosterId,
      pick_no: this.allPicks().length + 1, __manual: true,
      /* THE WATERMARK THIS ROW RETIRES AGAINST — the real-pick count at this seat
       * that must be EXCEEDED before the placeholder is considered superseded.
       * Recorded at entry, because "how many real picks had this seat made when
       * he typed" is not recoverable afterwards.
       *
       * ⚠️ IT COUNTS THE PLACEHOLDERS ALREADY QUEUED AT THIS SEAT, and the first
       * version did not. Two picks typed for seat 4 during one outage both got
       * watermark 0, so the FIRST real pick to come back retired BOTH of them —
       * one real event silently deleting two records, which is the same
       * over-count as the bug, in the other direction. Giving the second row a
       * watermark of 1 makes them retire one at a time, in order, which is how
       * the room actually reports them. */
      real_at_entry: this.realPicksForSeat(seat)
        + this.manual.filter(m => seatOf(m) === seat).length,
    });
    this.onPicks(this.allPicks());
  };

  /** Typed rows the room has since reported for real — ids only, for the caller
   *  to purge from its own surfaces. `allPicks()` already excludes them. */
  /* One call a surface or a test can ask instead of reaching into fields.
   * Reported rather than thrown: mid-draft, a degraded board that SAYS it is
   * degraded beats a correct board that stopped. */
  DraftSync.prototype.ingestHealth = function () {
    const rows = this.allPicks();
    return {
      picks: rows.length,
      dropped_no_id: this.droppedNoId || 0,
      pick_no_collisions: this.pickNoCollisions || 0,
      clean: !(this.droppedNoId || 0) && !(this.pickNoCollisions || 0),
    };
  };

  DraftSync.prototype.supersededManual = function () {
    return this.manual
      .filter(m => m.real_at_entry != null
        && this.realPicksForSeat(seatOf(m)) > m.real_at_entry)
      .map(m => String(m.player_id));
  };

  DraftSync.prototype.removeManual = function (playerId) {
    this.manual = this.manual.filter(p => String(p.player_id) !== String(playerId));
    this.picks = this.picks.filter(p => String(p.player_id) !== String(playerId));
    this.onPicks(this.allPicks());
  };

  /** Whose turn is it, given the true pick order? */
  /** When the picks last came back good, or null if never. The module owns this
   *  so every surface reports the same age instead of each deriving its own. */
  DraftSync.prototype.lastSyncAt = function () { return this.lastOkAt || null; };
  DraftSync.prototype.syncAgeMs = function () {
    return this.lastOkAt ? (Date.now() - this.lastOkAt) : null;
  };

  DraftSync.prototype.currentPickNumber = function () {
    return this.allPicks().length + 1;
  };

  // Exposed so the id parser can be tested without a browser — it is the piece
  // that turns a paste into a working sync, and it had a bug.
  DraftSync.normalizeDraftId = normalizeDraftId;
  global.DraftSync = DraftSync;
  if (typeof module !== 'undefined' && module.exports) module.exports = DraftSync;
})(typeof window !== 'undefined' ? window : globalThis);
