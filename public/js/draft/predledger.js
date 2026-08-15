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

  /* ── A FAILED POST IS PARKED, NEVER DROPPED (2026-08-13, routed by B) ──────
   *
   * The previous behaviour was: post, retry once, log, RETURN NULL. The record
   * was then gone. B put it plainly — every draft-night override was one network
   * blip from being lost permanently — and an override is the single hardest
   * record to reconstruct afterwards, because it is a JUDGEMENT and nothing in
   * the artifact implies it. A lost recommendation can be rebuilt from the board;
   * a lost "I took Cook over Bowers because of news" cannot be rebuilt from
   * anything.
   *
   * The header already promised the failure would be "visible, not swallowed".
   * It WAS visible. Visible and gone is still gone — surfacing a loss is not the
   * same as preventing one, and the comment let that distinction pass.
   *
   * So: on final failure the body goes to localStorage, and every later success
   * drains the queue oldest-first. Draft night is one machine, one tab, a few
   * hours; localStorage is the right durability for exactly that and no more.
   *
   * FOUR THINGS THIS DELIBERATELY DOES NOT DO:
   *   - It never blocks. Draft night has a clock; a flush is fire-and-forget.
   *   - It never reorders. The queue drains in order and STOPS at the first
   *     failure, so a replay cannot interleave a late record ahead of an
   *     earlier one.
   *   - It never silently discards to stay under quota. If the queue is full the
   *     new record is refused and SAYS SO, because dropping the newest quietly
   *     is the same defect one level down.
   *   - It never pretends a replay happened at decision time. `client_at` keeps
   *     the original instant and `payload.replayed_at` marks the delay, so the
   *     server's authoritative stamp can be recognised as a REPLAY stamp rather
   *     than mistaken for when the decision was made.
   */
  /* ── UPGRADED TO WRITE-AHEAD, 2026-08-13, on B's diagnosis ────────────────
   *
   * My first fix parked a body only AFTER both post attempts failed. B's point
   * is correct and it is not a refinement: a tab killed DURING the attempt —
   * a backgrounded phone discarded mid-draft, the exact failure draft_session.js
   * exists for — never reaches the catch, so the record is gone before anything
   * writes it down. Parking on failure protects against a network outage. It
   * does not protect against the browser going away, which is the likelier of
   * the two at a draft table.
   *
   * So the queue is now the ONLY path. Every record is written to localStorage
   * BEFORE any network call, and a row leaves the queue only on server
   * acknowledgement. That is the same discipline draft_session.js already uses
   * for draft state, and B was right that it should not have been reinvented
   * one module over.
   *
   * ORDERING IS A FREE CONSEQUENCE: one drain, oldest-first, so nothing can
   * overtake anything. And delivery becomes at-least-once rather than
   * at-most-once, which is the correct trade for an append-only ledger — a
   * duplicate is a nuisance the server can dedup on `key`, a loss is permanent.
   *
   * ── AND THE PART OF B'S CRITIQUE THAT STILL STANDS ────────────────────────
   *
   * "console.error on a phone, at a table, with nobody in devtools" is silent by
   * every practical definition. THAT IS STILL TRUE OF THIS FILE. `pending()`
   * exposes the count and `onError` fires, but a number nothing renders is a
   * number nobody sees. The surface belongs to B; this module can only make the
   * fact available, and it now does. Routed, not fixed here.
   */
  var QUEUE_KEY = 'predledger_pending_v1';
  var QUEUE_MAX = 500;                    // ~30x a full draft's decision count
  var flushing = false;
  var nextId = 1;

  function store() {
    try {
      var s = global.localStorage;
      if (!s) return null;
      s.setItem('__pl_probe', '1'); s.removeItem('__pl_probe');   // private mode throws
      return s;
    } catch (e) { return null; }
  }
  function readQueue() {
    var s = store();
    if (!s) return [];
    try {
      var raw = s.getItem(QUEUE_KEY);
      var q = raw ? JSON.parse(raw) : [];
      return Array.isArray(q) ? q : [];
    } catch (e) { return []; }            // corrupt queue must not break capture
  }
  function writeQueue(q) {
    var s = store();
    if (!s) return false;
    try { s.setItem(QUEUE_KEY, JSON.stringify(q)); return true; } catch (e) { return false; }
  }
  function queueLength() { return readQueue().length; }
  function enqueue(body) {
    var q = readQueue();
    if (q.length >= QUEUE_MAX) return null;
    var id = 'r' + (Date.now()) + '-' + (nextId++);
    q.push({ id: id, body: body, queued_at: new Date().toISOString(), attempts: 0 });
    return writeQueue(q) ? id : null;
  }
  function dropById(id) {
    var q = readQueue();
    var out = [];
    for (var i = 0; i < q.length; i++) if (q[i].id !== id) out.push(q[i]);
    if (out.length !== q.length) writeQueue(out);
  }
  /* ON A FAILURE, THE HEAD WAS ATTEMPTED AND *EVERYTHING* IS NOW DELAYED.
   * Only the head is ever posted, so `attempts` alone marks one record however
   * many sit behind it — and those others reach the server late just the same.
   * `replayed_at` means "this arrived later than it was captured", which is true
   * for the whole queue at the moment of a failure, so the whole queue is
   * marked. Stamping on `attempts` alone would have labelled one of three
   * delayed records and left the other two indistinguishable from live ones. */
  function markFailure(headId) {
    var q = readQueue();
    for (var i = 0; i < q.length; i++) {
      if (q[i].id === headId) q[i].attempts = (q[i].attempts || 0) + 1;
      q[i].delayed = true;
    }
    writeQueue(q);
  }

  /* Drain oldest-first, stopping at the first failure so ordering holds.
   * A row leaves ONLY on acknowledgement. */
  function flush() {
    if (flushing) return Promise.resolve(0);
    if (!readQueue().length) return Promise.resolve(0);
    flushing = true;
    var sent = 0;
    function step() {
      var cur = readQueue();
      if (!cur.length) return Promise.resolve();
      var head = cur[0];
      var body = head.body;
      /* STAMPED AS A REPLAY ONLY IF AN EARLIER ATTEMPT ACTUALLY FAILED. With
       * write-ahead every record passes through the queue, so stamping on
       * presence-in-queue would mark all of them and the field would stop
       * meaning anything — the same "a flag everything carries is not a flag"
       * problem as a check that cannot fail. */
      if ((head.attempts > 0 || head.delayed) && body && body.payload
          && typeof body.payload === 'object' && !body.payload.replayed_at) {
        body.payload.replayed_at = new Date().toISOString();
      }
      return post(body).then(function () {
        dropById(head.id);
        sent++;
        return step();
      }, function (e) {
        markFailure(head.id);
        lastError = String(e && e.message || e);
        throw e;                       // stop the drain; the rest stay in order
      });
    }
    return step().then(function () {
      flushing = false;
      return sent;
    }, function () { flushing = false; return sent; });
  }

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

  /* THE DECISION JOIN KEY — WITHOUT IT THE GRADER PRODUCES NOTHING (2026-08-11).
   *
   * `forecast_grade.gradeDecisions` joins the three decision kinds on
   * `payload.key`:
   *
   *     if (e.kind === 'recommendation') { if (p.key) recs[p.key] = e; }
   *     else if (e.kind === 'pick')      { if (p.key) picks[p.key] = e; }
   *     else if (e.kind === 'override')  { if (p.key) overrides[p.key] = e; }
   *     ...
   *     for (const k of Object.keys(recs)) { ... }
   *
   * NOT ONE CALL SITE IN app.js SUPPLIED A `key`. Every entry failed the `if`,
   * `recs` was always empty, the loop never ran, and gradeDecisions returned
   * zero rows for every season — so "was the tool followed or overridden",
   * "where Cory beat the model", and `override_rate` were all structurally
   * empty rather than wrong. Nothing errored. Nothing rendered a bad number.
   * The capture fired, the server stored it, and the grader silently dropped
   * every record on the floor.
   *
   * THAT IS THE SEPTEMBER 1 DEADLINE'S EXACT FAILURE MODE. Rule 2 depends on
   * override outcomes, the draft on the 22nd is meant to be the first real
   * entry, and a decision-time record cannot be reconstructed afterward. The
   * loss would have been discovered in January, when nothing can be done.
   *
   * STAMPED HERE, IN ONE PLACE, rather than at each call site — a join key
   * maintained at nineteen call sites is the two-places disease with eighteen
   * extra places. `season|build_at|pick` identifies the decision: one board,
   * one pick number, whatever was recommended, taken or overridden there.
   *
   * A CALLER-SUPPLIED KEY ALWAYS WINS. `forecast` and `forecast_resolution`
   * carry their own `key`/`forecast_key` with a different meaning, and
   * overwriting those would break the resolution join to fix the decision one.
   */
  var DECISION_KINDS = { recommendation: 1, pick: 1, override: 1 };

  function decisionKey(info) {
    if (info.pick == null || !info.build_at) return null;   // not a decision at a pick
    return (info.season || '') + '|' + info.build_at + '|' + info.pick;
  }

  function send(kind, info, opts) {
    opts = opts || {};
    var payload = info.payload || {};
    if (DECISION_KINDS[kind] && payload.key == null) {
      var k = decisionKey(info);
      // A null key is left ABSENT rather than written as null: the grader tests
      // `if (p.key)`, so a null would be dropped just the same, and a present
      // field that is always falsy reads like a key that exists.
      if (k) {
        var copy = {};
        for (var f in payload) if (Object.prototype.hasOwnProperty.call(payload, f)) copy[f] = payload[f];
        copy.key = k;
        payload = copy;
      }
    }
    var body = {
      kind: kind,
      method: info.method || null,           // model/method version that produced it
      season: info.season || null,
      pick: info.pick == null ? null : info.pick,
      build_at: info.build_at || null,
      client_at: new Date().toISOString(),   // provenance only; server clock is authority
      payload: payload,
    };
    /* WRITE FIRST, THEN DRAIN. The record is on disk before any network call,
     * so a tab that dies mid-request loses nothing. */
    var id = enqueue(body);
    if (id == null) {
      /* Storage is full, blocked or absent (private mode). Fall back to the old
       * direct-post path — DEGRADED, not silent: this is the one case where a
       * failure is still unrecoverable, and it says so. */
      return post(body).catch(function () {
        return post(body).catch(function (e2) {
          lastError = String(e2 && e2.message || e2);
          if (global.console) {
            console.error('[predledger] post failed AND could not be parked '
              + '(no usable localStorage). THIS RECORD IS LOST.', lastError, body);
          }
          if (typeof opts.onError === 'function') opts.onError(lastError);
          return null;
        });
      });
    }
    return flush().then(function (sent) {
      var left = queueLength();
      if (left && global.console) {
        console.error('[predledger] ' + left + ' record(s) UNSENT and parked for replay — '
          + 'last error: ' + lastError, body);
      }
      if (left && typeof opts.onError === 'function') opts.onError(lastError, left);
      return sent ? { ok: true } : null;
    });
  }

  function oncePer(kind, info, sig) {
    var key = kind + '|' + info.pick + '|' + (info.build_at || '') + '|' + (sig || '');
    if (seen[key]) return Promise.resolve(null);
    seen[key] = true;
    return send(kind, info);
  }

  /* THE BOARD STATE THAT PRODUCED THE RECOMMENDATION (2026-08-13).
   *
   * Until today the recommendation payload carried the TOP TEN NAMES AND THEIR
   * SCORES and nothing else. That answers "what did the model say" and cannot
   * answer "what could it have said", so no recommendation was replayable and
   * none ever would have been: the board is gone the moment the draft ends.
   * `taken_player_ids` did not appear anywhere in the repository.
   *
   * THIS IS EVIDENCE ARCHITECTURE, NOT LOGGING. The question it keeps
   * answerable is the one every later valuation change depends on -- "would a
   * different valuation have chosen differently ON THAT BOARD" -- and it is
   * permanently unanswerable if the board is not captured at decision time.
   *
   * WHY THE TAKEN SET AND NOT THE AVAILABLE SET. The engine consumes `board`,
   * the AVAILABLE players, so the available set is the literal input. But
   * `board = data.players MINUS drafted`, and `build_at` in the join key already
   * identifies which `data.players` universe was in play. So the taken set
   * reconstructs the input exactly while being one to two orders of magnitude
   * smaller -- ~150 ids at the last pick against ~1,700 available at the first.
   * The complement is not a summary of the input; it IS the input, expressed
   * against a universe the key already pins down.
   *
   * ORDER IS PRESERVED AND LABELLED RATHER THAN CLAIMED. A JS Set iterates in
   * insertion order, which is draft order while the set is built incrementally
   * and is NOT after a restore rebuilds it -- app.js has such a path. Ordering
   * is not consumed by the engine, which scores and sorts, so it is carried for
   * later learning only and `taken_order` says which of the two it is instead of
   * letting a reader assume draft order.
   *
   * THE DIGEST IS THE POINT OF THE RECORD. It makes "the persisted state
   * corresponds to the actual board" checkable rather than asserted: a replay
   * rebuilds the board from these ids and recomputes it, and a mismatch is a
   * loud failure instead of a silently wrong rescore. Taken over the SORTED ids,
   * so it is invariant to the ordering question above.
   */
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function boardState(taken, boardSize, ordered) {
    var ids = [];
    if (taken) {
      /* Set, Array and array-like all arrive here; forEach covers Set and Array
       * and is the only iteration this file's browser target guarantees. */
      if (typeof taken.forEach === 'function') taken.forEach(function (v) { ids.push(String(v)); });
      else for (var i = 0; i < taken.length; i++) ids.push(String(taken[i]));
    }
    var sorted = ids.slice().sort();
    return {
      taken_player_ids: ids,
      taken_count: ids.length,
      taken_order: ordered === false ? 'unordered' : 'insertion',
      /* The complement's size, so a replay can assert
       * board_size + taken_count === |universe| and catch a board that was
       * filtered by something this record does not know about. Without it an
       * unknown extra filter reproduces a WRONG board that still digests
       * consistently with itself. */
      board_size: boardSize == null ? null : boardSize,
      taken_digest: fnv1a(sorted.join(',')),
    };
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
    /* The decision-time board, canonicalised. Exposed so the call site cannot
     * invent its own representation, and so the representation is testable
     * without a browser or a server. */
    boardState: boardState,
    capture: function (kind, info) { return send(kind, info); },
    lastError: function () { return lastError; },
    /* HOW MANY RECORDS ARE PARKED RIGHT NOW. A status hook that shows only
     * lastError would go quiet the moment one post succeeded, while records
     * from the outage were still sitting unsent — which is the previous defect
     * wearing a different hat. This is the number that must reach the screen. */
    pending: function () { return queueLength(); },
    /* Manual drain, for a status hook's "retry now" affordance. */
    flush: function () { return flush(); },
    _reset: function () {                                    // tests only
      seen = {}; lastError = null; flushing = false;
      var st = store(); if (st) { try { st.removeItem(QUEUE_KEY); } catch (e) {} }
    }
  };

  global.PredLedger = PredLedger;
  if (typeof module !== 'undefined' && module.exports) module.exports = PredLedger;
})(typeof window !== 'undefined' ? window : globalThis);
