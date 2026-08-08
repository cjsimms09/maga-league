/* THE DEVIATION BADGE — every deviation from consensus, priced and explained.
 *
 * THE PRINCIPLE (anchor-doctrine.md): consensus ADP is the PRIOR. Every
 * deviation from it must be paid for with evidence, and the badge is where that
 * payment is itemised. Big deviations require big evidence and SAY so.
 *
 * SILENCE WHEN WE HAVE NO EDGE. A deviation inside the noise band renders
 * NOTHING — not a grey badge, not a zero. Most picks are market picks and the
 * surface should be quiet about them, or the one pick where the model really
 * disagrees stops standing out.
 *
 * THE HONESTY THAT MAKES THIS DIFFERENT FROM DECORATION
 * -----------------------------------------------------
 * The confidence tier is derived from the EVIDENCE BEHIND THE TERMS THAT BOUGHT
 * THE DISTANCE, never from the size of the deviation. A 20-pick reach bought by
 * an untested term is not "high confidence" — it is a large bet on an unproven
 * belief, and the badge says exactly that.
 *
 * Evidence classes are the real ones as of 2026-08-08, not aspirational:
 *
 *   survival  MODERATE   — calibration is measured (`replay.js calibration()`)
 *                          and the auto-adjuster scores it by calibration error
 *   ceiling   MODERATE   — D9 installed off experiment 21's frontier sweep
 *   tier      WEAK       — the tier model has NO calibration instrument yet
 *                          (bundled into experiment 36)
 *   value     UNTESTED   — our projections have never been raced against the
 *                          market. That is experiment 33, and until it reports
 *                          the term underneath every recommendation is unproven
 *   need      STRUCTURAL — not a fitted belief; it reads roster slots. Cannot be
 *                          "wrong" the way a projection can, but earns no
 *                          confidence either — it is arithmetic, not evidence
 *   keeper/bye/stack  WEAK — modelled, unvalidated (stack is a LEAN, uninstalled)
 *
 * When experiments 33 and 36 report, THESE CONSTANTS ARE THE INSTALL POINT.
 * Nothing else needs to change for the badge to start telling the truth about a
 * better-evidenced model.
 */
(function (global) {
  'use strict';

  // Evidence class per term. Ordered weakest-first; the tier is capped by the
  // weakest term doing real work, because a chain is as strong as its weakest
  // load-bearing link.
  var EVIDENCE = {
    value:   { klass: 'untested',   rank: 0, note: 'projections never raced vs market (exp 33)' },
    tier:    { klass: 'weak',       rank: 1, note: 'no calibration instrument yet (exp 36)' },
    keeper:  { klass: 'weak',       rank: 1, note: 'modelled, unvalidated' },
    bye:     { klass: 'weak',       rank: 1, note: 'modelled, unvalidated' },
    stack:   { klass: 'weak',       rank: 1, note: 'LEAN only — not installed' },
    need:    { klass: 'structural', rank: 2, note: 'reads roster slots — arithmetic, not a belief' },
    risk:    { klass: 'weak',       rank: 1, note: 'modelled, unvalidated' },
    ceiling: { klass: 'moderate',   rank: 3, note: 'installed off exp 21 frontier sweep' },
    survival:{ klass: 'moderate',   rank: 3, note: 'calibration measured in replay' },
  };

  // A term is "doing real work" if it moved the player at least this many
  // points. Below it, it is rounding, and naming it would be noise.
  var MATERIAL = 2.0;

  function evidenceOf(term) {
    return EVIDENCE[term] || { klass: 'weak', rank: 1, note: 'unclassified' };
  }

  /**
   * Which terms bought the distance, largest first, materials only.
   * `weighted` is the engine's per-term contribution map.
   */
  function drivers(weighted) {
    return Object.keys(weighted || {})
      .map(function (t) {
        var v = Number(weighted[t]) || 0;
        var e = evidenceOf(t);
        return { term: t, points: Math.round(v * 10) / 10, klass: e.klass,
                 rank: e.rank, note: e.note };
      })
      .filter(function (d) { return Math.abs(d.points) >= MATERIAL; })
      .sort(function (a, b) { return Math.abs(b.points) - Math.abs(a.points); });
  }

  /**
   * THE CONFIDENCE TIER — from evidence, never from magnitude.
   *
   * CERTIFIED  every material driver is VALIDATED (rank 4). **No term reaches
   *            that today** — nothing in this model has been raced against a
   *            held-out benchmark and won. The tier is defined so the vocabulary
   *            is complete when experiments 33 and 36 report, and so that
   *            promoting a term is a one-line, deliberate act.
   *
   *            An earlier draft of this granted CERTIFIED to merely-MODERATE
   *            evidence, which would have printed the strongest word we have
   *            over a model whose central term is untested. Caught by its own
   *            test; recorded because the pressure to let "pretty good" mean
   *            "certified" is exactly what this tier resists.
   *
   * LIKELY     EVERY material driver is moderate-or-better
   * LEAN       anything else — including a large deviation bought by weak or
   *            untested terms, which is the case the badge exists to expose
   *
   * THE LADDER IS THE WEAKEST LINK, not the strongest. An earlier version read
   * the BEST driver, so a moderate term paired with a weak one scored LIKELY —
   * which is precisely backwards: the weak term is still load-bearing, and the
   * conclusion inherits its fragility. Its own test caught it.
   *
   * Note that `structural` (need) caps at LEAN by design. Roster arithmetic
   * cannot be wrong the way a projection can, but it is not EVIDENCE either, so
   * it must not raise confidence in a deviation.
   */
  /* THE TIER, SPOKEN HONESTLY.
   *
   * A tier word alone is read as a grade — LEAN sounds like "slightly less
   * confident", when what it actually means here is "bought with evidence that
   * has never been raced against the market". Measured 2026-08-08: 100% of this
   * model's deviations are LEAN, across 300 simulated decisions. So the word on
   * its own would be doing the opposite of its job — a uniform grade reads as
   * no grade at all.
   *
   * The per-component confidence rule therefore applies to the composite's own
   * output: a recommendation that departs from consensus must not speak in the
   * same voice as a validated call. One canonical phrasing, defined here rather
   * than in the renderer, so every surface that shows a tier shows the same
   * sentence.
   */
  /* ── THE EVIDENCE STATE — the sentence's SOURCE OF TRUTH ─────────────────
   *
   * The confidence sentence is DERIVED from what the experiments have actually
   * reported, never written by hand. That is the whole mechanism, and it exists
   * because of a specific failure mode: a confidence sentence that outlives the
   * experiment which should have updated it is WORSE THAN THE BARE WORD. "LEAN
   * — unvalidated vs market" is honest today and becomes a lie the moment 34
   * reports, in either direction, because the market race will have happened.
   *
   * So updating a finding here rewrites every surface at once. There is no
   * second place to remember.
   */
  var EVIDENCE_STATE = {
    33: { name: 'projection source bake-off', status: 'unrun', finding: null },
    34: { name: 'recommendation-vs-market scoreboard', status: 'unrun', finding: null },
  };

  /* THE SENTENCE, DERIVED. `status` is one of:
   *   'unrun'         — never executed
   *   'inconclusive'  — ran; CI spans zero (the n≈36 case, pre-registered)
   *   'lost'          — ran; our picks lost to market. `finding` carries the words.
   *   'won'           — ran; our picks beat market.
   */
  function leanVoice() {
    var e = EVIDENCE_STATE[34];
    if (!e || e.status === 'unrun') return 'unvalidated vs market';
    if (e.status === 'inconclusive') {
      return e.finding || 'raced against market, inconclusive at this sample';
    }
    if (e.status === 'lost') return e.finding || 'lost to market when measured';
    if (e.status === 'won') return e.finding || 'beat market when measured';
    return 'unvalidated vs market';
  }

  /* THE ONE PLACE THE TIER IS PUT INTO WORDS.
   *
   * SSOT applied to LANGUAGE, the same rule as the PlayerRef resolver — because
   * phrasing drifts exactly the way facts do. "Sleeper-confirmed" became
   * "Sleeper-verified" inside a single session once; a second copy of this
   * sentence would do the same and nobody would notice which surface was
   * telling the older story.
   */
  function tierVoice(tier) {
    if (tier === 'LEAN') return leanVoice();
    if (tier === 'LIKELY') return 'moderate evidence';
    if (tier === 'CERTIFIED') return 'validated vs held-out';
    return leanVoice();
  }
  function tierLine(tier) { return tier + ' — ' + tierVoice(tier); }

  // Kept as a derived view so callers can enumerate the ladder without each
  // rebuilding the mapping — but it is COMPUTED, never a second source.
  function tierVoices() {
    return { LEAN: tierVoice('LEAN'), LIKELY: tierVoice('LIKELY'),
             CERTIFIED: tierVoice('CERTIFIED') };
  }

  /** Record an experiment's result. Rewrites every surface that shows a tier. */
  function recordEvidence(expId, status, finding) {
    if (!EVIDENCE_STATE[expId]) return null;
    EVIDENCE_STATE[expId].status = status;
    EVIDENCE_STATE[expId].finding = finding || null;
    return EVIDENCE_STATE[expId];
  }

  function tierFor(ds) {
    if (!ds.length) return 'LEAN';
    var worst = ds.reduce(function (m, d) { return Math.min(m, Number(d.rank) || 0); }, 9);
    if (worst >= 4) return 'CERTIFIED';           // unreachable today, by design
    if (worst >= 3) return 'LIKELY';
    return 'LEAN';
  }

  /**
   * The market's own dispersion, and ONLY where it is a measurement.
   *
   * `adp_sd` exists on every player, but it is a real crowd spread only for the
   * ~205 with matched FFC ADP; the deep pool carries a fallback around 30 that
   * would render as "wildly contested" when it means "we have no market read".
   * Presenting a missing measurement as a strong signal is the exact inversion
   * of the anchor doctrine, so the fallback pool returns null.
   */
  function dispersion(player) {
    if (!player || player.adp_source !== 'ffc') return null;
    var sd = Number(player.adp_sd);
    if (!Number.isFinite(sd) || sd <= 0) return null;
    return { sd: Math.round(sd * 10) / 10,
             contested: sd >= 8,
             text: sd >= 8 ? 'market itself disagrees — contested' : 'market is settled here' };
  }

  /**
   * Build the badge for one scored entry.
   *
   *   entry      the engine's scored row {player, score, components}
   *   ourPick    the pick number we are recommending him AT [live-sequence]
   *   noiseBand  picks; inside it the badge is null (silence)
   *
   * Returns null when there is nothing worth saying.
   */
  function badge(entry, ourPick, noiseBand) {
    if (!entry || !entry.player) return null;
    var p = entry.player;
    var adp = p.adjusted_adp != null ? p.adjusted_adp
      : (p.raw_adp != null ? p.raw_adp : null);
    if (adp == null || ourPick == null) return null;

    // POSITIVE = we take him EARLIER than the market does (a reach we are
    // choosing to pay for). Negative = he has fallen to us.
    var delta = Math.round((adp - ourPick) * 10) / 10;
    var band = Number(noiseBand);
    if (!Number.isFinite(band)) band = 4.0;

    // SILENCE INSIDE THE BAND. Most picks are market picks.
    if (Math.abs(delta) < band) return null;

    var ds = drivers((entry.components || {}).weighted);
    var tier = tierFor(ds);
    var disp = dispersion(p);
    var lead = ds[0] || null;

    return {
      adp: adp,
      pick: ourPick,
      delta: delta,
      early: delta > 0,
      tier: tier,
      // The tier as a SENTENCE, never a bare grade. See tierVoice.
      tierLine: tierLine(tier),
      tierVoice: tierVoice(tier),
      // ⚡ = the model is OVERRIDING consensus here, not merely ordering within
      // it. Only ever set on a real deviation, by construction.
      override: Math.abs(delta) >= band,
      drivers: ds,
      dispersion: disp,
      line: summary(adp, delta),
      // THE FLIP SIDE, always shown with the case. If the leading term is the
      // thing you doubt, the same pick is a reach — and you should be told that
      // in the same breath as the argument for it.
      counter: counterLine(lead, delta),
    };
  }

  function summary(adp, delta) {
    if (delta > 0) return 'ADP ' + adp + ' · we say now, ' + Math.abs(delta) + ' early';
    return 'ADP ' + adp + ' · fell ' + Math.abs(delta) + ' past his market price';
  }

  function counterLine(lead, delta) {
    if (!lead) return 'no single term carries this — treat it as a close call';
    var names = {
      tier: 'the tier cliff', ceiling: 'the ceiling case', need: 'the roster need',
      keeper: 'the keeper value', bye: 'the bye conflict', stack: 'the stack',
      risk: 'the risk read', value: 'our projection',
    };
    var what = names[lead.term] || ('the ' + lead.term + ' term');
    if (delta > 0) {
      return 'if you do not believe ' + what + ', this is a reach';
    }
    return 'if you do not believe ' + what + ', he fell for a reason';
  }

  var api = { EVIDENCE: EVIDENCE, MATERIAL: MATERIAL, drivers: drivers,
              tierFor: tierFor, dispersion: dispersion, badge: badge,
              summary: summary, counterLine: counterLine,
              tierVoice: tierVoice, tierLine: tierLine, tierVoices: tierVoices,
              EVIDENCE_STATE: EVIDENCE_STATE, recordEvidence: recordEvidence };
  global.DraftDeviation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
