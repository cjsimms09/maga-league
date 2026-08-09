/* FORWARD-PREDICTION ASSEMBLER — the committed pre-draft/at-pick claims.
 *
 * Every Lab experiment is retrospective; a forecast is the one thing that is not —
 * committed in writing, timestamped, before the outcome exists, so it carries no
 * researcher degrees of freedom and is the ONLY way calibration ("91% survival")
 * is ever measurable. This turns the live board into the two strongest, model-backed,
 * gradeable claims:
 *
 *   room_seat  — who the room takes at each upcoming round-1 seat, simulated by ADP.
 *                Tests the opponent/ADP model; resolves the moment that seat picks.
 *   survival   — P(a target survives to my next pick), straight from the survival
 *                model (survival_to_next). This is the calibration instrument: many
 *                live survival claims, graded, ARE the reliability curve.
 *
 * PURE: takes a plain snapshot, returns the payloads to commit; the caller fires them
 * via PredLedger.forecast (deduped by key) and ONLY for the real draft — a mock is not
 * forward evidence. roster_dollars + adp_fall wait on the E[$] quantile / a fall model
 * (no fabricated precision). Unit-tested in draft/tests/forecast.test.js.
 */
(function (global) {
  'use strict';

  function _adp(s) {
    return s.adp != null ? s.adp
      : (s.player ? (s.player.adjusted_adp != null ? s.player.adjusted_adp : s.player.raw_adp) : null);
  }

  /* Normalize a scored board row to the fields the assembler reads, so app.js can
   * pass raw scored rows and a test can pass plain objects. */
  function _norm(s) {
    var p = s.player || s;
    return {
      player_id: String(p.player_id),
      name: p.name,
      position: p.position,
      adp: _adp(s),
      survival_to_next: s.survival_to_next != null ? s.survival_to_next : null,
    };
  }

  /* room_seat: simulate round 1 by ADP. Walk each upcoming NON-mine seat in order;
   * each takes the best-ADP player not already predicted-taken or on my roster. A
   * plausible, falsifiable prediction of what the room does before it does it. */
  function roomSeatForecasts(rows, myPicks, currentPick, teams) {
    var mine = {};
    (myPicks || []).forEach(function (p) { mine[p] = 1; });
    var pool = rows.filter(function (r) { return r.adp != null; })
      .slice().sort(function (a, b) { return a.adp - b.adp; });
    var taken = {};
    var out = [];
    for (var seat = 1; seat <= (teams || 10); seat++) {
      // find the next best-ADP player not yet taken in this simulation
      var pick = null;
      for (var i = 0; i < pool.length; i++) {
        if (!taken[pool[i].player_id]) { pick = pool[i]; break; }
      }
      if (!pick) break;
      taken[pick.player_id] = 1;
      if (mine[seat]) continue;                                  // my seat = my decision, not a room claim
      if (currentPick != null && seat < currentPick) continue;   // already happened
      out.push({
        method: 'room-seat-forecast-v1',
        payload: {
          key: 'room_seat:r1p' + seat,
          ftype: 'categorical',
          value: pick.player_id,
          claim: 'the room takes ' + pick.name + ' at overall pick ' + seat,
          resolution_rule: 'the player_id actually drafted at overall pick ' + seat,
          resolves_when: 'overall pick ' + seat,
        },
      });
    }
    return out;
  }

  /* survival: for my top-K plausible targets carrying a survival estimate, commit
   * P(survive to my next pick). The claim is keyed to the specific next pick so it
   * grades exactly once, when that pick arrives. */
  function survivalForecasts(rows, nextPick, k) {
    if (nextPick == null) return [];
    return rows.filter(function (r) { return r.survival_to_next != null; })
      .slice(0, k || 5)
      .map(function (r) {
        return {
          method: 'survival-forecast-v1',
          payload: {
            key: 'survival:' + r.player_id + '@pick' + nextPick,
            ftype: 'probability',
            value: Math.max(0, Math.min(1, r.survival_to_next)),
            claim: r.name + ' survives to my pick ' + nextPick,
            resolution_rule: '1 if ' + r.name + ' was undrafted when overall pick '
              + nextPick + ' arrived, else 0',
            resolves_when: 'overall pick ' + nextPick,
          },
        };
      });
  }

  /* The full slate to commit RIGHT NOW from this board.
   * snap: { scored:[rows], myPicks:[overall...], currentPick, nextPick, teams } */
  function buildForecasts(snap) {
    snap = snap || {};
    var rows = (snap.scored || []).map(_norm).filter(function (r) { return r.player_id && r.player_id !== 'undefined'; });
    if (!rows.length) return [];
    var out = [];
    // room_seat only while round 1 is still unfolding (currentPick within round 1).
    if (snap.currentPick == null || snap.currentPick <= (snap.teams || 10)) {
      out = out.concat(roomSeatForecasts(rows, snap.myPicks, snap.currentPick, snap.teams));
    }
    out = out.concat(survivalForecasts(rows, snap.nextPick, snap.survivalK || 5));
    return out;
  }

  /* RESOLVE — reality answering the committed claims, from the completed draft.
   * Mirror of forecast_grade.build_resolutions (kept in step by parallel tests).
   *   forecasts: the committed forecast entries (from GET /api/ledger/predict).
   *   draft:     {picks:[{overall, player_id}]} — the finished board.
   * room_seat resolves to who actually went at that overall pick; survival to 1 iff
   * the target was undrafted when its pick arrived. A forecast whose pick has not
   * been reached stays PENDING (no fabricated outcome). Returns resolution payloads;
   * the caller fires them via PredLedger.forecastResolution (deduped by key). */
  function buildResolutions(forecasts, draft) {
    var picks = ((draft || {}).picks || []).slice()
      .sort(function (a, b) { return (a.overall || 0) - (b.overall || 0); });
    var atOverall = {}, draftedBefore = {}, taken = {}, maxOverall = 0;
    picks.forEach(function (p) {
      var ov = p.overall, pid = String(p.player_id);
      draftedBefore[ov] = Object.assign({}, taken);
      atOverall[ov] = pid;
      taken[pid] = 1;
      if (ov > maxOverall) maxOverall = ov;
    });
    var out = [];
    (forecasts || []).forEach(function (f) {
      var key = ((f.payload || {}).key) || '';
      if (key.indexOf('room_seat:r1p') === 0) {
        var seat = parseInt(key.split('r1p')[1], 10);
        if (atOverall.hasOwnProperty(seat)) {
          out.push({ payload: { forecast_key: key, outcome: atOverall[seat], source: 'completed draft' } });
        }
      } else if (key.indexOf('survival:') === 0 && key.indexOf('@pick') > 0) {
        var body = key.slice('survival:'.length);
        var parts = body.split('@pick');
        var pid = parts[0], npk = parseInt(parts[1], 10);
        if (npk <= maxOverall) {
          var survived = !(draftedBefore[npk] && draftedBefore[npk][pid]);
          out.push({ payload: { forecast_key: key, outcome: survived ? 1 : 0, source: 'completed draft' } });
        }
      }
    });
    return out;
  }

  var api = { buildForecasts: buildForecasts, roomSeatForecasts: roomSeatForecasts,
              survivalForecasts: survivalForecasts, buildResolutions: buildResolutions };
  global.DraftForecast = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
