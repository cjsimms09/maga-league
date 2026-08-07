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

  function DraftSync(opts) {
    this.draftId = opts.draftId || null;
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
    const tryDirect = () => fetch(DIRECT + path, { mode: 'cors' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(j => { this.transport = 'direct'; return j; });
    const tryProxy = () => fetch(PROXY + encodeURIComponent(path))
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(j => { this.transport = 'proxy'; return j; });

    if (this.transport === 'direct') return tryDirect().catch(tryProxy);
    if (this.transport === 'proxy') return tryProxy();
    // First call: try direct (fast, no function invocations), fall back to proxy.
    return tryDirect().catch(tryProxy);
  };

  DraftSync.prototype.start = function () {
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
          message: 'Sleeper unreachable (' + err.message + '). Retrying in ' + Math.round(wait / 1000) + 's — you can enter picks by hand meanwhile.',
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

  global.DraftSync = DraftSync;
})(typeof window !== 'undefined' ? window : globalThis);
