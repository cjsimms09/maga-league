/* COHERENCE (feature A) — the ONE VOICE resolver for the war room.
 *
 * The draft-day surfaces (recommendation, plan, deviation band, dead-zone marker,
 * market-reliability line, strategy split, LRM) were assembled ad hoc in
 * renderRecommendations with no single arbiter — so two of them could point
 * different ways and leave Cory to reconcile at pick 34 with the room talking.
 * This module is that arbiter: given the directional signals for ONE candidate,
 * it returns a single verdict, and — the point of the whole architecture — it is
 * MAGNITUDE-AWARE, so it is loud only where the evidence is real and the cost is
 * measurable, and quiet when the pick is obvious.
 *
 * A signal is { name, stance:'for'|'against'|'neutral', magnitude, cite, prior }
 *   magnitude  measured $ (or points) the signal attaches to its stance; 0/undef
 *              for a signal with a direction but no measured size (a weak prior).
 *   prior      true = an informational prior (e.g. the dead-zone marker), which a
 *              LARGER measured magnitude on the other side is allowed to override
 *              (this is the exp25 "don't let the dead zone override elite RB value"
 *              tempering, generalised). false/undef = a hard measured signal.
 *
 * Pure. Unit-tested in draft/tests/coherence.test.js against constructed conflict
 * boards. The war room renders resolve().voice and obeys resolve().loud.
 */
(function (global) {
  'use strict';

  // A stance counts as "material" (worth going loud over) only above this measured
  // magnitude. Below it, a disagreement is noise and the surface stays quiet. Tuned
  // to the tournament's null p95 ($30) — a cost smaller than luck is not a cost.
  var MATERIAL = 30;

  function _num(x) { return (typeof x === 'number' && isFinite(x)) ? x : 0; }

  function _weight(sig) {
    // A prior with no measured magnitude weighs a fixed small amount; a measured
    // signal weighs its magnitude. Priors never outweigh a material measurement.
    var m = _num(sig.magnitude);
    if (sig.prior) return Math.min(m, MATERIAL - 0.01);   // capped below material
    return m;
  }

  /* Resolve the signals for ONE candidate into a single voice.
   * planStance (optional): 'for'|'against' — whether the enrolled plan takes this
   * candidate; used to phrase the plan-adherence nudge with its measured cost. */
  function resolve(signals, opts) {
    opts = opts || {};
    var sigs = (signals || []).filter(function (s) { return s && s.stance; });
    var forW = 0, againstW = 0, forMax = null, againstMax = null;
    var dissent = [];
    sigs.forEach(function (s) {
      var w = _weight(s);
      if (s.stance === 'for') { forW += w; if (!forMax || w > _weight(forMax)) forMax = s; }
      else if (s.stance === 'against') { againstW += w; if (!againstMax || w > _weight(againstMax)) againstMax = s; }
    });
    var net = forW - againstW;                    // >0 leans take, <0 leans avoid
    var lean = net > 0 ? 'for' : (net < 0 ? 'against' : 'neutral');
    var minority = lean === 'for' ? againstMax : forMax;
    var minorityW = lean === 'for' ? againstW : forW;
    // CONTESTED iff a genuine measured signal opposes the lean above the material
    // bar AND is not merely an over-ridable prior swamped by the other side.
    var contested = !!(minority && minorityW >= MATERIAL &&
                       !(minority.prior && Math.abs(net) >= MATERIAL));
    if (contested) {
      (lean === 'for' ? sigs.filter(function (s) { return s.stance === 'against'; })
                      : sigs.filter(function (s) { return s.stance === 'for'; }))
        .forEach(function (s) { if (_weight(s) > 0) dissent.push(s); });
    }

    // Plan-adherence: cost of taking against the plan = the plan-side magnitude.
    var planNudge = null;
    if (opts.planStance === 'against') {
      // The plan does NOT take this candidate; taking it deviates. Cost = the best
      // measured "for the plan / against this pick" magnitude, if material.
      var cost = againstMax ? _weight(againstMax) : 0;
      if (cost >= MATERIAL) {
        planNudge = { deviating: true, cost: Math.round(cost),
                      cite: againstMax && againstMax.cite || null };
      }
    }

    var verdict, voice, loud;
    if (contested) {
      verdict = 'contested';
      loud = true;
      voice = 'CONTESTED — ' + (lean === 'for' ? 'the value says take' : 'the market says pass')
        + ', but ' + dissent.map(_phrase).join('; ') + '. One of the ~2 real decisions this draft — slow down.';
    } else if (Math.abs(net) >= MATERIAL) {
      verdict = lean === 'for' ? 'take' : 'avoid';
      loud = false;
      voice = (lean === 'for' ? 'Clear: take. ' : 'Clear: pass. ')
        + (lean === 'for' ? (forMax && _phrase(forMax) || 'best value on the board')
                          : (againstMax && _phrase(againstMax) || 'below the market here'));
    } else {
      verdict = 'obvious';
      loud = false;
      voice = 'No strong signal either way — take the market default.';
    }
    if (planNudge) {
      loud = true;
      voice += ' PLAN: you are deviating; measured cost ≈ $' + planNudge.cost
        + (planNudge.cite ? ' (' + planNudge.cite + ').' : '.');
    }
    return { verdict: verdict, lean: lean, loud: loud, voice: voice,
             net: Math.round(net), forWeight: Math.round(forW), againstWeight: Math.round(againstW),
             dissent: dissent.map(function (s) { return s.name; }), planNudge: planNudge,
             material: MATERIAL };
  }

  function _phrase(s) {
    var m = Math.round(_num(s.magnitude));
    var mag = m ? ' (≈$' + m + ')' : '';
    var c = s.cite ? ' [' + s.cite + ']' : '';
    return s.name + mag + c;
  }

  var api = { resolve: resolve, MATERIAL: MATERIAL };
  global.DraftCoherence = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
