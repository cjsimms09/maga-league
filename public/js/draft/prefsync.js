/* A-1 — client half of the prefs sync (see src/prefs.js for the server half).
 *
 * localStorage is the offline cache; the server document (keyed to my login) is
 * the thing that survives switching from the prep laptop to the draft-night
 * phone. On load: pull the server doc, race it against the local stamp, newest
 * wins, and SAY SO with a visible stamp. On every prefs change: debounce a push.
 * Everything is best-effort — a sync failure can never touch the clock.
 */
(function (global) {
  'use strict';

  var ENDPOINT = '/admin/api/prefs';
  var seq = 0;

  /* The SAME whole-document last-write-wins rule as src/prefs.merge. Field-level
   * merging would weave two half-sessions together; whole-doc keeps "what you
   * see is one device's truth". */
  function merge(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return String(b.updated_at || '') >= String(a.updated_at || '') ? b : a;
  }

  function pull() {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch(ENDPOINT, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.doc) || null; })
      .catch(function () { return null; });
  }

  function push(doc) {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(doc),
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.doc) || null; })
      .catch(function () { return null; });
  }

  /* Debounced push: rapid slider drags collapse into one write, and only the
   * LAST scheduled snapshot goes (a stale closure must not overwrite a newer
   * one — hence the sequence check). */
  function scheduler(delayMs, pushFn) {
    var timer = null;
    return function schedule(makeDoc, onSynced) {
      var my = ++seq;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        if (my !== seq) return;                 // a newer schedule superseded us
        var doc = makeDoc();
        if (!doc) return;
        (pushFn || push)(doc).then(function (winner) {
          if (winner && onSynced) onSynced(winner);
        });
      }, delayMs == null ? 1200 : delayMs);
    };
  }

  var api = { ENDPOINT: ENDPOINT, merge: merge, pull: pull, push: push, scheduler: scheduler };
  global.PrefSync = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
