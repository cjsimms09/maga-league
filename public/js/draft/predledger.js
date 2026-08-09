/* Prediction ledger — client capture (Phase L1).
 *
 * Fires at DECISION TIME and posts to the append-only server ledger, which
 * stamps the authoritative decision timestamp. The contamination rule lives on
 * the server (this only ever appends); here the job is to capture the right
 * moments without flooding the log:
 *   - 'recommendation' once per (pick, build) — the board I decided from
 *   - 'pick'           every time I mark a player as MINE — the decision itself
 *   - 'override'       every manual override — a judgement against the model
 *
 * Best-effort and non-blocking: a failed post must never freeze the clock. It
 * retries once, then surfaces the failure to the console and a status hook so a
 * silent data loss on draft night is visible, not swallowed.
 */
(function (global) {
  'use strict';
  var ENDPOINT = '/admin/api/ledger/predict';
  var seen = {};          // dedup keys for once-per-pick kinds
  var lastError = null;

  function post(body) {
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) throw new Error('ledger post ' + r.status);
      return r.json();
    });
  }

  function send(kind, info, opts) {
    opts = opts || {};
    var body = {
      kind: kind,
      method: info.method || null,           // model/method version that produced it
      season: info.season || null,
      pick: info.pick == null ? null : info.pick,
      build_at: info.build_at || null,
      client_at: new Date().toISOString(),   // provenance only; server clock is authority
      payload: info.payload || {},
    };
    return post(body).catch(function (e) {
      // one retry, then make the loss loud
      return post(body).catch(function (e2) {
        lastError = String(e2 && e2.message || e2);
        if (global.console) console.error('[predledger] capture failed:', lastError, body);
        if (typeof opts.onError === 'function') opts.onError(lastError);
        return null;
      });
    });
  }

  function oncePer(kind, info, sig) {
    var key = kind + '|' + info.pick + '|' + (info.build_at || '') + '|' + (sig || '');
    if (seen[key]) return Promise.resolve(null);
    seen[key] = true;
    return send(kind, info);
  }

  var PredLedger = {
    /* Once per (pick, build) — the board state I made a decision from. */
    recommendation: function (info) { return oncePer('recommendation', info); },
    /* Every pick I take is its own decision — never deduped. */
    pick: function (info) { return send('pick', info); },
    /* Every override is a judgement against the model — never deduped. */
    override: function (info) { return send('override', info); },
    /* Survival estimates at this pick — once per (pick, build). */
    survival: function (info) { return oncePer('survival', info); },
    /* Last-responsible-moment snapshot — once per (pick, build). */
    lrm: function (info) { return oncePer('lrm', info); },
    /* A run-detection firing — deduped by the run signature so the same run
     * logs once, but a new/changed run at a later pick logs again. */
    run: function (info, sig) { return oncePer('run', info, sig); },
    /* Doctrine state at this pick — deduped by the doctrine SIGNATURE, so a
     * steady plan logs once per pick but a switch (which changes the signature)
     * always writes. Declines are explicit events and go through capture(). */
    doctrine: function (info, sig) { return oncePer('doctrine', info, sig); },
    /* Exp-31 platform sampling — deduped per (pick, build) by pick number, so a
     * four-second poll re-seeing the same pick logs it once. */
    platformSample: function (info, sig) { return oncePer('mock_platform_sample', info, sig); },
    /* FORWARD PREDICTION — a committed, timestamped claim about something that has
     * not happened yet (survival %, ADP falls, who the room takes, roster $). The
     * server stamps decision_at and enforces the gradeable skeleton (key + ftype +
     * value + resolution_rule); the FORWARD GUARANTEE (only graded if committed
     * before it resolved) lives in forecast_grade.py. Deduped by the forecast key,
     * so re-rendering the board never double-commits the same claim. */
    forecast: function (info) { return oncePer('forecast', info, (info.payload || {}).key); },
    /* What reality returned — a SEPARATE append joined by key, written only when the
     * outcome is known. Deduped by the forecast key it resolves (append-only: the
     * first resolution wins; a re-resolve is ignored). */
    forecastResolution: function (info) {
      return oncePer('forecast_resolution', info, (info.payload || {}).forecast_key);
    },
    /* Generic passthrough. */
    capture: function (kind, info) { return send(kind, info); },
    lastError: function () { return lastError; },
    _reset: function () { seen = {}; lastError = null; },   // tests only
  };

  global.PredLedger = PredLedger;
  if (typeof module !== 'undefined' && module.exports) module.exports = PredLedger;
})(typeof window !== 'undefined' ? window : globalThis);
