/* THE SEAT — one resolved identity, derived once, consumed by every surface.
 *
 * THE BUG THIS EXISTS TO KILL (mock #1, 2026-08-08)
 * -------------------------------------------------
 * The War Room carried TWO seat identities at the same time and nothing noticed:
 *
 *   - `league.my_draft_slot` — my seat in the REAL league (e.g. 7)
 *   - `pick_order.my_picks`  — rebuilt from the MOCK ROOM's seat (e.g. 4)
 *
 * `applyDraftShape()` rebuilt the pick order from the mock's shape using the
 * mock seat, then the ONLY line that writes `my_draft_slot` was skipped, because
 * its guard reads `!state.mockMode` and `applyDraftShape` had just set
 * `state.mockMode` two statements earlier. The league slot survived untouched
 * while every pick number came from a different seat.
 *
 * That is not a display glitch. Every roster-attribution site compares
 * `slot === league.my_draft_slot`, so in a mock the picks I actually made landed
 * on nobody's roster and one opponent's picks landed on MINE. The engine then
 * read a stranger's roster for the need term — which is why it kept offering TEs
 * after Loveland, QBs after Dak, showed no flex awareness, and never saw an
 * empty DEF slot. Every downstream symptom is this one fact.
 *
 * THE RULE
 * --------
 * There is exactly one seat identity, `resolve()` produces it, and no view may
 * compute its own. It distinguishes two numbers that are genuinely different and
 * were being conflated:
 *
 *   roomSlot — my seat in the room BEING DRAFTED RIGHT NOW. Every pick number,
 *              every roster attribution, every recommendation uses this.
 *   realSlot — my seat in the real league. Display and provenance only.
 *
 * In a league draft they are the same number. In a mock they usually are not,
 * and the mapping is shown rather than assumed.
 *
 * UNRESOLVED IS A STATE, NOT A DEFAULT. If a mock room cannot tell us which seat
 * is mine, `roomSlot` is null and the tool says so. Quietly reusing the league
 * number in a room of a different size is what produced the wrong-seat draft.
 */
(function (global) {
  'use strict';

  var SOURCES = ['sleeper', 'site-claimed', 'manual', 'league-config', 'assumed', 'unresolved'];

  /**
   * Build the seat identity.
   *   opts.realSlot   my league seat (from the artifact / claim)
   *   opts.roomSlot   my seat in the current room (null when unknown)
   *   opts.source     where roomSlot came from
   *   opts.verified   Sleeper confirmed it against a real draft object
   *   opts.mock       null, or {teams, rounds, type} for the mock room
   *   opts.myPicks    the pick numbers rebuilt for roomSlot
   */
  function resolve(opts) {
    opts = opts || {};
    var real = num(opts.realSlot);
    var room = num(opts.roomSlot);
    var mock = opts.mock || null;
    // Outside a mock the room IS the league, so the league seat is the room
    // seat. Inside a mock we never fall back — see UNRESOLVED above.
    if (room == null && !mock) room = real;
    var source = opts.source || (room == null ? 'unresolved' : 'league-config');
    if (SOURCES.indexOf(source) < 0) source = 'manual';
    return {
      roomSlot: room,
      realSlot: real,
      source: room == null ? 'unresolved' : source,
      verified: !!opts.verified && room != null,
      mock: mock,
      picks: (opts.myPicks || []).slice(),
      // True when the two numbers genuinely differ and both are known — the
      // case that has to be displayed rather than silently reconciled.
      mapped: mock != null && room != null && real != null && room !== real,
      resolved: room != null,
    };
  }

  /** Which seat owns overall pick `p` in a `teams`-team snake (1-based). */
  function slotOfPick(p, teams) {
    var t = Number(teams);
    if (!t) return null;
    var round = Math.ceil(p / t);
    var idx = p - (round - 1) * t;
    return round % 2 ? idx : t - idx + 1;
  }

  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** One sentence naming the identity. Rendered in ONE place, quoted elsewhere. */
  function describe(seat) {
    if (!seat || !seat.resolved) {
      return seat && seat.mock
        ? 'SEAT UNRESOLVED — this mock room has not told us which seat is yours; set it before trusting any pick number'
        : 'SEAT UNRESOLVED — set your draft slot';
    }
    var assumed = seat.source === 'assumed'
      ? ' (ASSUMED — the mock room did not report your seat; set it if wrong)' : '';
    if (seat.mapped) {
      return 'mock seat ' + seat.roomSlot + ' = my real seat ' + seat.realSlot
        + ' — picks mapped' + assumed;
    }
    if (seat.mock) return 'mock seat ' + seat.roomSlot + assumed;
    return 'seat ' + seat.roomSlot + (seat.verified ? ' (Sleeper-verified)' : '');
  }

  /**
   * THE CONSISTENCY ASSERTION. Given the seat and the surfaces that consume it,
   * report every disagreement. The robot runs this; the app can too. Returns
   * {ok, problems[]} — a list, not a boolean, because "which surface disagrees"
   * is the whole diagnostic.
   *
   *   consumers: { pickOrderMyPicks, rosterSlotsSeen, headerSlot, noticePicks }
   */
  function audit(seat, consumers) {
    var c = consumers || {};
    var problems = [];
    if (!seat || !seat.resolved) {
      problems.push('seat unresolved — no surface can be correct');
      return { ok: false, problems: problems };
    }
    var mine = c.pickOrderMyPicks || [];
    if (mine.length && seat.picks.length) {
      if (mine.length !== seat.picks.length || mine.some(function (p, i) { return p !== seat.picks[i]; })) {
        problems.push('pick_order.my_picks ' + JSON.stringify(mine.slice(0, 6))
          + ' != seat.picks ' + JSON.stringify(seat.picks.slice(0, 6)));
      }
    }
    if (c.headerSlot != null && Number(c.headerSlot) !== seat.roomSlot) {
      problems.push('header shows seat ' + c.headerSlot + ', seat is ' + seat.roomSlot);
    }
    if (c.noticePicks && c.noticePicks.length && seat.picks.length) {
      if (c.noticePicks[0] !== seat.picks[0]) {
        problems.push('mock notice first pick ' + c.noticePicks[0]
          + ' != seat first pick ' + seat.picks[0]);
      }
    }
    // THE CHECK THAT WOULD HAVE CAUGHT MOCK #1.
    //
    // Comparing the seat against surfaces that were all fed the same number
    // proves nothing — they agreed with each other while both were wrong. The
    // question is whether these pick numbers ACTUALLY BELONG to this seat in a
    // room this size. In a snake with no keeper forfeits that is arithmetic, so
    // an identity claiming seat 7 while holding seat 4's picks is caught
    // structurally rather than by hoping some view disagrees.
    //
    // Mocks never have keeper forfeits, which is exactly where this bug lived;
    // in the real league the pick order carries forfeits, so the check is
    // skipped there rather than made to lie.
    var teams = seat.mock ? seat.mock.teams : c.teams;
    if (seat.mock && teams && seat.picks.length) {
      var wrong = seat.picks.filter(function (p) {
        return slotOfPick(p, teams) !== seat.roomSlot;
      });
      if (wrong.length) {
        problems.push('seat ' + seat.roomSlot + ' does not own pick(s) '
          + wrong.slice(0, 4).join(', ') + ' in a ' + teams + '-team snake — these are seat '
          + slotOfPick(wrong[0], teams) + "'s picks");
      }
    }
    // A pick attributed to a seat that does not exist in the room is the
    // wrong-roster symptom's other half.
    if (teams) {
      (c.rosterSlotsSeen || []).forEach(function (s) {
        if (Number(s) < 1 || Number(s) > Number(teams)) {
          problems.push('roster exists for seat ' + s + ', outside a ' + teams + '-team room');
        }
      });
    }
    return { ok: problems.length === 0, problems: problems };
  }

  var api = { resolve: resolve, describe: describe, audit: audit, slotOfPick: slotOfPick, SOURCES: SOURCES };
  global.DraftSeat = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
