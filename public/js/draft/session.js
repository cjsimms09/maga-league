/* THE DRAFT SESSION — one lifecycle, explicit states, and a way out of any of
 * them.
 *
 * WHY (mock #1, back half)
 * -----------------------
 * Two blockers came from the same root: the session lifecycle was never designed
 * as one flow. Sync hung with a spinner and no state; END DRAFT appeared dead.
 *
 * THE END-DRAFT BUG, FOUND: the §D safety pass guarded it with `window.prompt`.
 * Chrome suppresses repeated dialogs — once "prevent this page from creating
 * additional dialogs" is armed (by the user, or by the browser after several
 * dialogs), **prompt() returns null instantly and silently**. The guard then
 * reads `null !== 'END'` and `return`s. No dialog, no error, no feedback: a
 * button that does nothing, forever, and no way to tell it apart from a hang.
 * Cory's suspicion was exactly right.
 *
 * A confirmation that can be suppressed by the browser is not a safety feature,
 * it is a trapdoor. The typed confirm now lives IN THE PAGE.
 *
 * THE STATES
 * ----------
 *   idle        no draft linked; manual entry works
 *   connecting  a draft id was given; first response not yet seen
 *   live        picks are flowing
 *   stalled     connected but nothing seen for a while — degraded, still trying
 *   wedged      past the patience budget; the tool has STOPPED waiting
 *   ended       draft over, board restored
 *
 * `wedged` is the state mock #1 had no name for. A spinner that hangs is the
 * worst possible draft-night behavior, so it is a state with an exit, not an
 * absence of one.
 */
(function (global) {
  'use strict';

  var STATES = ['idle', 'connecting', 'live', 'stalled', 'wedged', 'ended'];

  // Patience budget, in ms. Deliberately short: on the clock, ten seconds of
  // silence is an eternity and manual entry is always available.
  var CONNECT_TIMEOUT = 8000;    // connecting -> wedged if no first response
  var STALL_AFTER = 15000;       // live -> stalled if no new data
  var WEDGE_AFTER = 45000;       // stalled -> wedged

  function create(now) {
    return {
      state: 'idle',
      since: now || 0,
      lastResponseAt: null,
      firstResponseAt: null,
      connectStartedAt: null,
      draftId: null,
      // Every transition, with its timing. This is what makes the next mock
      // report its own hang duration instead of relying on memory.
      log: [],
      timings: { connectMs: null, longestGapMs: 0 },
    };
  }

  function transition(s, next, now, note) {
    if (STATES.indexOf(next) < 0) return s;
    if (s.state === next) return s;
    s.log.push({ from: s.state, to: next, at: now,
                 heldMs: s.since != null ? now - s.since : null,
                 note: note || null });
    s.state = next;
    s.since = now;
    return s;
  }

  /** A draft id was entered and the first request is out. */
  function connecting(s, draftId, now) {
    s.draftId = draftId || null;
    s.connectStartedAt = now;
    s.firstResponseAt = null;
    return transition(s, 'connecting', now, 'draft ' + (draftId || '?'));
  }

  /** Any successful response from the sync layer. */
  function sawResponse(s, now, gotPicks) {
    if (s.firstResponseAt == null) {
      s.firstResponseAt = now;
      s.timings.connectMs = s.connectStartedAt != null ? now - s.connectStartedAt : null;
    }
    if (s.lastResponseAt != null) {
      var gap = now - s.lastResponseAt;
      if (gap > s.timings.longestGapMs) s.timings.longestGapMs = gap;
    }
    s.lastResponseAt = now;
    return transition(s, 'live', now, gotPicks ? 'picks seen' : 'response, no picks');
  }

  /**
   * Called on a timer. Advances the degradation ladder; returns the state.
   * This is the only thing that can produce `wedged`, so a hang always has a
   * named terminus rather than an open spinner.
   */
  function tick(s, now) {
    if (s.state === 'connecting') {
      if (now - (s.connectStartedAt || now) >= CONNECT_TIMEOUT) {
        return transition(s, 'wedged', now, 'no first response in '
          + Math.round(CONNECT_TIMEOUT / 1000) + 's');
      }
      return s;
    }
    if (s.state === 'live' || s.state === 'stalled') {
      var quiet = now - (s.lastResponseAt || s.since || now);
      if (quiet >= WEDGE_AFTER) {
        return transition(s, 'wedged', now, Math.round(quiet / 1000) + 's without a response');
      }
      if (quiet >= STALL_AFTER && s.state === 'live') {
        return transition(s, 'stalled', now, Math.round(quiet / 1000) + 's quiet');
      }
    }
    return s;
  }

  /**
   * THE HARD RESET. Works from ANY state, including wedged, because it does not
   * ask the sync layer for permission — the caller tears sync down and this
   * returns a fresh session. The one control that must never itself be able to
   * hang.
   */
  function hardReset(s, now) {
    var prior = s ? s.state : 'unknown';
    var fresh = create(now);
    fresh.log.push({ from: prior, to: 'idle', at: now, note: 'HARD RESET' });
    return fresh;
  }

  /** What the user is told, per state. Never a bare spinner. */
  function describe(s) {
    var q = s.lastResponseAt != null ? s.lastResponseAt : s.connectStartedAt;
    switch (s.state) {
      case 'idle':
        return { text: 'Manual mode — mark picks yourself as they happen.', tone: 'ok' };
      case 'connecting':
        return { text: 'Connecting…', tone: 'busy' };
      case 'live':
        return { text: 'Live sync' + (s.timings.connectMs != null
          ? ' — connected in ' + (s.timings.connectMs / 1000).toFixed(1) + 's' : ''), tone: 'ok' };
      case 'stalled':
        return { text: 'Sync quiet — still polling. Manual entry works meanwhile.', tone: 'warn' };
      case 'wedged':
        return { text: 'SYNC GAVE UP — switched to manual. Mark picks yourself; '
          + 'nothing is lost. Check the draft ID, or Reset and reconnect.', tone: 'bad' };
      case 'ended':
        return { text: 'Draft ended. Board is back to full.', tone: 'ok' };
      default:
        return { text: '', tone: 'ok' };
    }
  }

  /** A one-line timing report — what mock #2 should be able to tell us. */
  function report(s) {
    return {
      state: s.state,
      connect_ms: s.timings.connectMs,
      longest_gap_ms: s.timings.longestGapMs,
      transitions: s.log.length,
      wedged_at: (s.log.filter(function (l) { return l.to === 'wedged'; })[0] || {}).at || null,
      log: s.log.slice(),
    };
  }

  var api = { STATES: STATES, CONNECT_TIMEOUT: CONNECT_TIMEOUT, STALL_AFTER: STALL_AFTER,
              WEDGE_AFTER: WEDGE_AFTER, create: create, transition: transition,
              connecting: connecting, sawResponse: sawResponse, tick: tick,
              hardReset: hardReset, describe: describe, report: report };
  global.DraftSession = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
