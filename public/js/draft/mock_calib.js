/* MOCK SURVIVAL CALIBRATION — grade the one number Cory looks at most.
 *
 * "91% to last to your next pick" has never been graded against anything. A mock
 * answers that claim a dozen times per draft, and it resolves WITHIN the session:
 * the tool predicts, at my pick, the chance each player lasts to my NEXT pick, and
 * as the mock proceeds reality settles it. This module is the pure core of that
 * loop — no DOM, no storage, no clock — so it is unit-tested headless and the app
 * only feeds it state.
 *
 * THE LOOP:
 *   record(sessionId, atPick, horizonPick, predictions)  // predictions made at MY pick
 *   observePick(pid, pickNo)                              // every pick, as it happens
 *   resolveMatured(picksMade)                             // settle predictions whose horizon passed
 *   calibration()                                         // predicted-vs-empirical, binned + Brier
 *
 * A prediction "survives" if the player was NOT taken before the horizon pick:
 * observed draft pick is null (still on the board) or >= horizonPick.
 *
 * TWO CAVEATS ARE STAMPED ON EVERY READOUT, non-negotiable (Cory):
 *   1. Mock autopickers deplete ADP-strict, so a mock-calibrated curve runs
 *      OPTIMISTIC against our noisier real room. The number is a floor on error.
 *   2. This grades SURVIVAL only. A mock null on run-detection does NOT convict
 *      that mechanism (mocks lack keepers, money, rivalries; half the field
 *      autopicks) — that pre-registration lives with the run capture, not here.
 */
(function (global) {
  'use strict';

  var CAVEATS = [
    'Mock autopickers deplete ADP-strict, so this curve runs OPTIMISTIC vs our ' +
      'noisier real room — read the error as a floor, not the true miss.',
    'Survival only. A mock run-detection null does not convict the mechanism ' +
      '(mocks lack keepers/money/rivalries; half the field autopicks).',
  ];

  function create() {
    // pending: predictions awaiting their horizon. resolved: settled (pred, outcome).
    var pending = [];        // {session, atPick, horizonPick, pid, pred}
    var resolved = [];       // {session, atPick, horizonPick, pid, pred, survived}
    var draftedAt = {};      // pid -> the pick number it left the board (first wins)

    function observePick(pid, pickNo) {
      var key = String(pid);
      if (draftedAt[key] == null) draftedAt[key] = Number(pickNo);
    }

    /* Record the survival predictions made AT one of my picks. Deduped by
     * (session, atPick, pid): a re-render at the same pick replaces, never doubles,
     * so the live app can call this every render without inflating n. */
    function record(sessionId, atPick, horizonPick, predictions) {
      (predictions || []).forEach(function (pr) {
        if (pr == null || pr.pid == null || pr.survival == null) return;
        var pid = String(pr.pid);
        var i = pending.findIndex(function (x) {
          return x.session === sessionId && x.atPick === atPick && x.pid === pid;
        });
        var row = { session: sessionId, atPick: atPick, horizonPick: horizonPick,
                    pid: pid, pred: Number(pr.survival) };
        if (i >= 0) pending[i] = row; else pending.push(row);
      });
    }

    /* Settle every pending prediction whose horizon pick has now been made.
     * picksMade = count of picks completed in the mock so far. A prediction with
     * horizonPick <= picksMade is mature: its answer is knowable. survived iff the
     * player was not taken before the horizon (draftedAt null, or >= horizonPick). */
    function resolveMatured(picksMade) {
      var stillPending = [];
      pending.forEach(function (row) {
        if (row.horizonPick > picksMade) { stillPending.push(row); return; }
        var takenAt = draftedAt[row.pid];
        var survived = (takenAt == null || takenAt >= row.horizonPick) ? 1 : 0;
        resolved.push({ session: row.session, atPick: row.atPick,
          horizonPick: row.horizonPick, pid: row.pid, pred: row.pred, survived: survived });
      });
      pending = stillPending;
      return resolved.length;
    }

    /* Predicted-vs-empirical over all resolved predictions: decile bins (each with
     * n, mean predicted, empirical survival rate), the Brier score, and the overall
     * optimism gap (mean predicted − empirical). Caveats always attached. */
    function calibration() {
      var bins = [];
      for (var b = 0; b < 10; b++) bins.push({ lo: b / 10, hi: (b + 1) / 10, n: 0, sumPred: 0, sumSurv: 0 });
      var brierSum = 0, sumPred = 0, sumSurv = 0;
      resolved.forEach(function (r) {
        var idx = Math.min(9, Math.max(0, Math.floor(r.pred * 10)));
        var bin = bins[idx];
        bin.n++; bin.sumPred += r.pred; bin.sumSurv += r.survived;
        brierSum += (r.pred - r.survived) * (r.pred - r.survived);
        sumPred += r.pred; sumSurv += r.survived;
      });
      var n = resolved.length;
      return {
        n_resolved: n,
        n_pending: pending.length,
        brier: n ? round(brierSum / n, 4) : null,
        mean_predicted: n ? round(sumPred / n, 4) : null,
        empirical_survival: n ? round(sumSurv / n, 4) : null,
        optimism_gap: n ? round((sumPred - sumSurv) / n, 4) : null,   // + => tool over-predicts survival
        bins: bins.filter(function (x) { return x.n > 0; }).map(function (x) {
          return { range: [x.lo, x.hi], n: x.n,
            mean_predicted: round(x.sumPred / x.n, 4),
            empirical: round(x.sumSurv / x.n, 4) };
        }),
        caveats: CAVEATS.slice(),
      };
    }

    function round(v, d) { var m = Math.pow(10, d); return Math.round(v * m) / m; }

    /* Serialize for cross-mock aggregation (a handful of mocks -> a real curve). */
    function toJSON() { return { pending: pending, resolved: resolved, draftedAt: draftedAt }; }
    function load(obj) {
      if (!obj) return;
      pending = obj.pending || []; resolved = obj.resolved || []; draftedAt = obj.draftedAt || {};
    }
    function reset() { pending = []; resolved = []; draftedAt = {}; }

    return { record: record, observePick: observePick, resolveMatured: resolveMatured,
             calibration: calibration, toJSON: toJSON, load: load, reset: reset,
             CAVEATS: CAVEATS };
  }

  var MockCalib = { create: create, CAVEATS: CAVEATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = MockCalib;
  else global.MockCalib = MockCalib;
})(typeof window !== 'undefined' ? window : this);
