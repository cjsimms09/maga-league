/* WHY CORY TOOK WHO HE TOOK — one tap, recorded at the moment of the pick.
 *
 * Cory, 2026-08-23: *"my_actual_pick / my_deviation_reason are empty everywhere
 * — the why behind your twelve decisions is unrecoverable this needs to be
 * fixed for next year."*
 *
 * ── WHY THE 2026 FIELD WAS EMPTY, which is the whole design brief ───────────
 *
 * The schema held `my_deviation_reason` all along. Nothing wrote it, because
 * the only way to fill it was for a human to type a sentence during a draft
 * that moves at roughly eight seconds a pick. That is not a bug in the field;
 * it is a bug in asking. An unprompted free-text box at 8s/pick collects
 * nothing, every time, and the 2026 log is the evidence.
 *
 * So: ONE TAP, from a fixed vocabulary, beside the thing he is already looking
 * at. Free text exists but is never required.
 *
 * ── WHY localStorage AND NOT A POST ────────────────────────────────────────
 *
 * The pick log is written by a GitHub Action polling Sleeper; this runs in
 * Cory's browser. The obvious join is a server round-trip per pick — and
 * draft night is precisely when a network dependency is worst: he is on a
 * phone or a laptop in someone's living room, and a failed POST at pick 33
 * loses the reason silently, which is the failure we already have.
 *
 * localStorage cannot fail that way. The merge happens AFTERWARDS, offline,
 * against the committed log (`draft/tools/merge_pick_reasons.js`). A reason is
 * worth nothing in the next eight seconds and everything in January, so there
 * is no reason to take on live-network risk to move it.
 *
 * PURE: no DOM, no fetch. Dual browser/Node export so the merge tool and the
 * tests can drive the same code the page runs.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PickReasons = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'maga.pick_reasons.v1';

  /* ── THE VOCABULARY ────────────────────────────────────────────────────────
   *
   * Grounded in what the 2026 draft actually shows, not invented. Cory
   * departed from the recorded top recommendation at eleven of twelve picks,
   * and the autopsy says why in aggregate: he took skill players early while
   * the static path named defences, and not one man he took would have
   * survived to his next pick.
   *
   * Each code is a DISTINCT decision, so the grade can separate them. "I liked
   * him more" and "he would not have lasted" are different claims about the
   * world and only one of them is checkable against the freeze — keeping them
   * apart is what makes the field gradeable rather than a mood.
   *
   * SEVEN, deliberately. A vocabulary long enough to need reading is not
   * one-tap, and the eighth option is always `other` with free text. */
  var REASONS = [
    { code: 'took_the_pick', label: 'Took the pick',
      note: 'agreed with the recommendation' },
    { code: 'position_need', label: 'Needed the slot',
      note: 'roster need overrode the board' },
    { code: 'would_not_last', label: 'He would not last',
      note: 'survival, not value — checkable against the freeze' },
    { code: 'value_too_good', label: 'Value too good',
      note: 'he fell further than he should have' },
    { code: 'my_read', label: 'My read',
      note: 'personal conviction against the model' },
    { code: 'news', label: 'News / injury',
      note: 'information the board did not have' },
    { code: 'tools_man_gone', label: 'Its man was gone',
      note: 'the recommendation was already off the board' },
  ];
  var CODES = REASONS.map(function (r) { return r.code; });

  function isValidCode(c) { return CODES.indexOf(c) >= 0 || c === 'other'; }

  /* ── PURE CORE — every function here takes and returns plain data ───────── */

  /* One record. `pick` and `player_id` are what the merge joins on; nothing
   * joins on a NAME, because the 2026 log truncates keeper names to the first
   * word and a name-join against it silently matches nothing (register 264). */
  function makeEntry(pick, playerId, code, freeText, at) {
    if (pick == null || playerId == null) return null;
    if (!isValidCode(code)) return null;
    var e = {
      pick: Number(pick),
      player_id: String(playerId),
      reason_code: code,
      recorded_at: at || null,
    };
    if (freeText) e.reason_text = String(freeText).slice(0, 400);
    return e;
  }

  /* LAST TAP WINS, by (pick). He may tap, change his mind, and tap again
   * before the pick is in — recording both would make the log ambiguous about
   * which one he meant, and the last one is always the one he acted on. */
  function upsert(list, entry) {
    if (!entry) return (list || []).slice();
    var out = (list || []).filter(function (e) { return Number(e.pick) !== Number(entry.pick); });
    out.push(entry);
    out.sort(function (a, b) { return a.pick - b.pick; });
    return out;
  }

  /* ── STORAGE — wrapped, because a private window throws on access ───────── */

  function load(storage) {
    try {
      var raw = (storage || root.localStorage).getItem(KEY);
      var v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function save(list, storage) {
    try {
      (storage || root.localStorage).setItem(KEY, JSON.stringify(list || []));
      return true;
    } catch (e) { return false; }
  }

  function record(pick, playerId, code, freeText, opts) {
    opts = opts || {};
    var e = makeEntry(pick, playerId, code, freeText, opts.at);
    if (!e) return null;
    var next = upsert(load(opts.storage), e);
    save(next, opts.storage);
    return e;
  }

  /* THE EXPORT CORY ACTUALLY USES — one button, one clipboard payload. It
   * carries the freeze sha so the merge can REFUSE a reasons file recorded
   * against a different board, the same guard log_draft_picks.py already
   * enforces per row. */
  function exportDoc(opts) {
    opts = opts || {};
    return {
      _what: 'Why Cory took who he took, one tap per pick. Merge with '
        + 'draft/tools/merge_pick_reasons.js.',
      season: opts.season || null,
      freeze_sha256: opts.freezeSha || null,
      vocabulary: REASONS,
      entries: load(opts.storage),
    };
  }

  return {
    KEY: KEY, REASONS: REASONS, CODES: CODES,
    isValidCode: isValidCode, makeEntry: makeEntry, upsert: upsert,
    load: load, save: save, record: record, exportDoc: exportDoc,
  };
}));
