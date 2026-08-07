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
    this.transport = null;     // 'direct' | 'proxy' — decided on first success
    this.timer = null;
    this.failures = 0;
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
    const tryDirect = () => fetch(DIRECT + path, { mode: 'cors' })
      .then(r => { if (!r.ok) return fail('Sleeper', r); return r.json(); })
      .then(j => { this.transport = 'direct'; return j; });
    const tryProxy = () => fetch(PROXY + encodeURIComponent(path))
      .then(r => { if (!r.ok) return fail('this site', r); return r.json(); })
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
        self.failures = 0;
        if (Array.isArray(picks)) {
          const before = self.picks.length;
          self.picks = picks;
          self.onStatus({
            state: 'live',
            message: 'Synced via ' + self.transport + ' — ' + picks.length + ' picks in',
            newPicks: picks.length - before,
          });
          self.onPicks(self.allPicks());
        }
        self.timer = setTimeout(function () { self.poll(); }, POLL_MS);
      })
      .catch(err => {
        self.failures++;
        const wait = Math.min(BACKOFF_MAX, POLL_MS * Math.pow(2, self.failures));
        self.onStatus({
          state: 'error',
          // A 4xx will not fix itself by waiting — it means the id or the path
          // is wrong. Saying "retrying" there just wastes somebody's draft.
          message: (err.status >= 400 && err.status < 500
              ? 'Rejected by ' + err.message + '. Check the draft ID — that will not fix itself by retrying.'
              : 'Sleeper unreachable (' + err.message + '). Retrying in ' + Math.round(wait / 1000) + 's.')
            + ' You can enter picks by hand meanwhile.',
        });
        self.timer = setTimeout(function () { self.poll(); }, wait);
      });
  };

  /** API picks plus anything typed in, de-duplicated by player. */
  DraftSync.prototype.allPicks = function () {
    const seen = new Set();
    const out = [];
    this.picks.concat(this.manual).forEach(p => {
      const id = String(p.player_id || (p.metadata && p.metadata.player_id) || '');
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push({
        player_id: id,
        pick_no: p.pick_no || out.length + 1,
        round: p.round,
        picked_by: p.picked_by || p.roster_id,
        roster_id: p.roster_id,
        source: p.__manual ? 'manual' : 'sleeper',
        metadata: p.metadata || {},
      });
    });
    out.sort((a, b) => (a.pick_no || 0) - (b.pick_no || 0));
    return out;
  };

  DraftSync.prototype.addManual = function (playerId, rosterId) {
    this.manual.push({
      player_id: String(playerId), roster_id: rosterId,
      pick_no: this.allPicks().length + 1, __manual: true,
    });
    this.onPicks(this.allPicks());
  };

  DraftSync.prototype.removeManual = function (playerId) {
    this.manual = this.manual.filter(p => String(p.player_id) !== String(playerId));
    this.picks = this.picks.filter(p => String(p.player_id) !== String(playerId));
    this.onPicks(this.allPicks());
  };

  /** Whose turn is it, given the true pick order? */
  DraftSync.prototype.currentPickNumber = function () {
    return this.allPicks().length + 1;
  };

  // Exposed so the id parser can be tested without a browser — it is the piece
  // that turns a paste into a working sync, and it had a bug.
  DraftSync.normalizeDraftId = normalizeDraftId;
  global.DraftSync = DraftSync;
  if (typeof module !== 'undefined' && module.exports) module.exports = DraftSync;
})(typeof window !== 'undefined' ? window : globalThis);
