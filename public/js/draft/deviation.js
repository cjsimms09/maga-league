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
    // 33 REPORTED 2026-08-09 (draft/backtest/EXP33.md). THE PRE-REGISTERED LOSS
    // CONDITION FIRED: our walk-forward blend LOSES to a naive prior-year+
    // availability baseline on top-decile hit rate (0.41 vs 0.57–0.59, both
    // seasons, both from strictly-prior data) — worse at finding the elite players
    // who decide seasons. 'lost', not softened. (A Sleeper source that "won" was a
    // leak — an in-season-updated endpoint, ~0.80 corr with realized — and was
    // DISQUALIFIED, not reported as a winner.) This is a standing surface banner,
    // per the pre-registration, naming the better source.
    33: { name: 'projection source bake-off', status: 'lost',
          finding: 'our projections LOSE to a simple prior-year+opportunity baseline at ' +
                   'identifying the top decile — the players who actually matter (exp 33)' },
    // 34 REPORTED 2026-08-09 (draft/backtest/EXP34.md). The result is an ORDERING
    // edge — our walk-forward ranking of the pool beats ADP's (rho diff +0.12,
    // CI[0.008,0.233], n=19) — which is a LEAN, and a DIFFERENT claim from any
    // individual deviation being justified. Recorded as 'lean_ordering', NOT
    // 'won', on purpose: 'won' would read as "our picks beat market", which 34
    // did NOT show (the per-pick surface is all thin/inconclusive, 2025 skipped).
    // Anyone citing 34 as vindication of the 74% deviation rate is MISREADING it.
    34: { name: 'recommendation-vs-market scoreboard', status: 'lean_ordering',
          finding: 'our ranking edges the market (LEAN, n=19) — this deviation still unvalidated' },
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
    // ORDERING edge measured, but NOT a per-deviation license (exp 34). The
    // sentence must say both: the small aggregate edge AND that THIS deviation is
    // not thereby validated — otherwise 34 gets misread as vindicating the rate.
    if (e.status === 'lean_ordering') {
      return e.finding || 'our ranking edges the market (LEAN) — this deviation still unvalidated';
    }
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

  /* THE PROJECTION PROVENANCE BANNER, derived from EVIDENCE_STATE[33] — the
   * standing banner exp 33's pre-registration owes the surface when our blend
   * loses. It also carries the exp-34/36 RECONCILIATION so neither result is ever
   * cited alone: we order the pool slightly better than a WEAK market (exp 34 beat
   * a weak benchmark — exp 36 shows ADP is a sub-0.5 ranker at every position), yet
   * we are WORSE than a naive baseline at finding the elite (exp 33). Both are true
   * and the banner says both. Returns null when 33 has not lost (nothing to warn).
   */
  function projectionProvenance() {
    var e = EVIDENCE_STATE[33];
    if (!e || e.status === 'unrun' || e.status === 'won') return null;
    if (e.status === 'lost') {
      return {
        severity: 'warn',
        headline: 'Projections lose to a naive baseline at finding the elite (exp 33)',
        detail: (e.finding || 'our projections lose to a naive baseline on top-decile') +
                '. Reconciled: we rank the pool slightly better than a WEAK market ' +
                '(exp 34 vs ADP, which exp 36 shows is a sub-0.5 ranker everywhere), ' +
                'but worse than a simple baseline at the players who decide seasons. ' +
                'Lean on tier structure and scarcity, not on point projections.',
      };
    }
    return { severity: 'note', headline: e.name + ': ' + e.status, detail: e.finding };
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
  /* EXP 36 MARKET-EFFICIENCY SURFACE — where is consensus ADP actually a good
   * ranker? Measured 2026-08-09 over 255 board picks (`draft/backtest/exp36.json`):
   * within-cell Spearman(-adp, realized) per (round-band × position). This is the
   * region-quality the deviation card reads so it can say, at pick 34, whether we
   * are deviating where the market ranks WEAKLY (freer) or WELL (respect it) — the
   * anchor-doctrine inversion made actionable without waiting for Stage 2. Cited +
   * reversible: regenerate these numbers from exp36.json on a re-fire, never hand-set.
   * (The doctrine's early/late premise was REFUTED here — early RB/WR are weak; the
   * market orders value best mid and in late WR.) */
  var MARKET_EFFICIENCY = {
    'r1-3':  { RB: 0.121, WR: 0.256 },
    'r4-7':  { QB: 0.58, RB: 0.13, WR: 0.199, TE: 0.615 },
    'r8-11': { RB: -0.024, WR: 0.134 },
    'r12+':  { QB: -0.073, RB: -0.147, WR: 0.718 },
  };
  var MARKET_EFFICIENCY_POOLED = { QB: 0.381, RB: 0.445, WR: 0.486, TE: 0.28 };
  var MARKET_TEAMS = 10;   // league size; a round is MARKET_TEAMS picks

  function roundBandOfPick(pickNo) {
    var r = Math.ceil((Number(pickNo) || 0) / MARKET_TEAMS);
    if (r <= 3) return 'r1-3';
    if (r <= 7) return 'r4-7';
    if (r <= 11) return 'r8-11';
    return 'r12+';
  }
  // {value, source} — the measured cell if ranked, else the position pooled average,
  // else null (unmeasured -> the card says anchor, the conservative default).
  function marketEfficiency(pickNo, position) {
    var cell = MARKET_EFFICIENCY[roundBandOfPick(pickNo)] || {};
    if (position && position in cell) return { value: cell[position], source: 'cell' };
    if (position && position in MARKET_EFFICIENCY_POOLED) return { value: MARKET_EFFICIENCY_POOLED[position], source: 'pooled' };
    return { value: null, source: 'unmeasured' };
  }
  /* EXP 36 → PER-REGION DEVIATION BAND (derived, replacing the old flat 4.0).
   *
   * The silence band is the deviation the surface won't bother flagging. It must
   * NOT be one flat number: where the market ranks a region WELL, a deviation is a
   * real bet against a reliable prior and deserves a badge even when small (TIGHT
   * band); where the market ranks WEAKLY or backwards, deviating is cheap and
   * expected, so don't clutter the surface (WIDE band). "One flat band on a board
   * whose reliability varies by an order of magnitude" was the T=4.0 inertness
   * symptom (DERIVED-VS-DECLARED-AUDIT.md). So band = f(measured reliability),
   * DECREASING in efficiency.
   *
   * DERIVATION — mean-anchored, so this redistributes the band BY REGION without
   * globally loosening or tightening it (a pure SHAPE derivation, not a smuggled
   * level change that would need its own gate):
   *
   *     band(cell) = BASE * (1 - rho) / (1 - rho_bar)
   *
   * where rho is the cell's measured efficiency (pooled position average if the
   * cell is thin, BASE if the position is unmeasured), rho_bar is the mean
   * efficiency across the ranked cells, and BASE = the old 4.0 — now the band the
   * AVERAGE-reliability region keeps. Clamped to [BAND_MIN, BAND_MAX] as
   * GUARDRAILS (not measurements) so a near-perfect market can't drive the band to
   * 0 (a badge on every pick) nor a backwards region to an absurd width. rho_bar
   * recomputes from the surface on any re-fire — never hand-set. Delta is measured
   * in PICKS, and reliability is a ranking property, so this band is correctly in
   * picks (the old code passed a DOLLAR config here — a latent unit slip this
   * closes). */
  var NOISE_BAND_BASE = 4.0;            // the flat band this replaces; now the mean-region band
  var BAND_MIN = 1.5, BAND_MAX = 6.0;   // guardrails, not measurements

  var RHO_BAR = (function () {
    var xs = [];
    Object.keys(MARKET_EFFICIENCY).forEach(function (band) {
      var row = MARKET_EFFICIENCY[band] || {};
      Object.keys(row).forEach(function (pos) {
        if (typeof row[pos] === 'number') xs.push(row[pos]);
      });
    });
    if (!xs.length) return 0;
    return xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
  })();

  // The per-region silence band, in picks. Unmeasured region -> the conservative
  // BASE (the same "anchor to market" default marketQuality falls back to).
  function noiseBandFor(pickNo, position) {
    var m = marketEfficiency(pickNo, position);
    if (m.value === null) return NOISE_BAND_BASE;
    var raw = NOISE_BAND_BASE * (1 - m.value) / (1 - RHO_BAR);
    return Math.max(BAND_MIN, Math.min(BAND_MAX, Math.round(raw * 100) / 100));
  }

  /* EXP 25 DEAD-ZONE PRIOR — RB realized value collapses mid-draft while WR holds.
   * BBM full field (200k picks/cell): RB 137→80→63 after round 4, WR gentle. Located
   * on OUR three seasons (exp25_deadzone.json): RB averages ~170 through overall pick
   * 60 then drops to ~110; WR holds ~140 and OVERTAKES RB at overall pick ~61. Overall
   * pick is the cross-league invariant, so the region is in overall picks, not rounds.
   * INFORMATIONAL — a labeled prior shown on the card like the exp-36 surface, NOT a
   * re-weighting (a board change waits on the money-graded gate). Cited + reversible:
   * regenerate the boundary from exp25 on a re-fire. */
  var DEADZONE = { position: 'RB', enter: 51, inside: 61, holds: 'WR' };

  function deadZoneLine(pickNo, position) {
    var pk = Number(pickNo);
    if (!Number.isFinite(pk) || pk < DEADZONE.enter) return null;
    if (position === 'RB') {
      if (pk >= DEADZONE.inside) {
        return 'INSIDE the RB dead zone (overall pick ' + pk + '): RB realized value '
          + 'usually collapses here while ' + DEADZONE.holds + ' holds — 2 of 3 BBM '
          + 'full-field seasons + our exp 25 (the 2024 injury year is the exception, so '
          + 'don’t let this override a genuinely elite RB value). Otherwise a mid-round RB '
          + 'is the board’s worst-evidenced value; prefer ' + DEADZONE.holds + '.';
      }
      return 'ENTERING the RB dead zone (~pick ' + DEADZONE.inside + '+): RB value is about to '
        + 'collapse while ' + DEADZONE.holds + ' holds (exp 25 + BBM prior).';
    }
    if (position === DEADZONE.holds && pk >= DEADZONE.inside) {
      return DEADZONE.holds + ' HOLDS its value here where RB collapses (overall pick ' + pk
        + ') — the best-evidenced mid-round lean (exp 25 + BBM prior).';
    }
    return null;
  }

  /* The weak/moderate/well band edges are DERIVED (not the hand-set 0.2/0.5): they
   * are the TERTILES of the measured positive-efficiency distribution, so "weak"
   * means "bottom third of the regions the market at least orders correctly" and
   * the language moves as more cells are measured (DERIVED-VS-DECLARED-AUDIT.md).
   * `<=0` (BACKWARDS) stays an absolute constant — zero correlation is a real
   * boundary, not a quantile. Recomputes from the surface on a re-fire. */
  function _quantile(sorted, q) {
    if (!sorted.length) return null;
    var idx = (sorted.length - 1) * q, lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }
  var EFF_CUTS = (function () {
    var xs = [];
    Object.keys(MARKET_EFFICIENCY).forEach(function (b) {
      var row = MARKET_EFFICIENCY[b] || {};
      Object.keys(row).forEach(function (p) { if (typeof row[p] === 'number' && row[p] > 0) xs.push(row[p]); });
    });
    xs.sort(function (a, b) { return a - b; });
    // Fall back to the old absolute cuts only if the surface is somehow empty.
    return { weak: _quantile(xs, 1 / 3) || 0.2, well: _quantile(xs, 2 / 3) || 0.5 };
  })();

  // The plain-language draft line (no options costume): weak -> freer, well -> respect.
  function marketQualityLine(pickNo, position) {
    var m = marketEfficiency(pickNo, position);
    var where = roundBandOfPick(pickNo) + (position ? ' ' + position : '');
    if (m.value === null) return 'market rank-quality here is unmeasured — anchor to market (conservative)';
    var cite = ' (' + (m.source === 'pooled' ? 'pos avg ' : '') + m.value.toFixed(2) + ', exp 36)';
    if (m.value <= 0) return 'the market ranks ' + where + ' BACKWARDS' + cite + ' — a deviation here is cheap';
    if (m.value < EFF_CUTS.weak) return 'the market ranks ' + where + ' WEAKLY' + cite + ' — you are freer to deviate';
    if (m.value < EFF_CUTS.well) return 'the market is a MODERATE ranker in ' + where + cite + ' — deviate only on real evidence';
    return 'the market ranks ' + where + ' WELL' + cite + ' — respect it, deviations here are expensive';
  }

  function badge(entry, ourPick, noiseBand) {
    if (!entry || !entry.player) return null;
    var p = entry.player;
    var adp = p.adjusted_adp != null ? p.adjusted_adp
      : (p.raw_adp != null ? p.raw_adp : null);
    if (adp == null || ourPick == null) return null;

    // POSITIVE = we take him EARLIER than the market does (a reach we are
    // choosing to pay for). Negative = he has fallen to us.
    var delta = Math.round((adp - ourPick) * 10) / 10;
    // An explicit finite band is honoured (tests, overrides); otherwise DERIVE the
    // per-region band from the exp-36 reliability surface (noiseBandFor).
    //
    // MATERIALITY BUG (2026-08-10 critique): the app passes noiseBand === null to
    // ask for the derived band, but `Number(null)` is 0 — a FINITE number — so the
    // isFinite guard passed, band stayed 0, and `|delta| < 0` was never true: every
    // deviation showed the LEAN banner, including a 0.1-pick non-deviation (Gibbs,
    // 'ADP 1.1 · we say now, 0.1 early'). null/undefined must derive, not collapse
    // to a zero band that flags everything.
    var band;
    if (noiseBand == null || !Number.isFinite(Number(noiseBand))) {
      band = noiseBandFor(ourPick, p.position);
    } else {
      band = Number(noiseBand);
    }

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
      // WHERE ON THE BOARD (exp 36): is this a region the market ranks well or
      // poorly? The single most actionable thing for draft night — deviate freely
      // where ADP is a weak ranker, respect it where ADP is strong.
      marketQuality: marketQualityLine(ourPick, p.position),
      marketEfficiency: marketEfficiency(ourPick, p.position),
      // EXP 25: is this pick in the RB dead zone (RB value collapses, WR holds)?
      // An informational labeled prior, null outside the region / off RB & WR.
      deadZone: deadZoneLine(ourPick, p.position),
      // The band this deviation had to clear — derived per-region (exp 36), so a
      // small deviation shows in a well-ranked region and is silenced in a weak one.
      noiseBand: band,
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
              EVIDENCE_STATE: EVIDENCE_STATE, recordEvidence: recordEvidence,
              projectionProvenance: projectionProvenance,
              marketEfficiency: marketEfficiency, marketQualityLine: marketQualityLine,
              noiseBandFor: noiseBandFor, RHO_BAR: RHO_BAR,
              deadZoneLine: deadZoneLine, DEADZONE: DEADZONE, EFF_CUTS: EFF_CUTS };
  global.DraftDeviation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
