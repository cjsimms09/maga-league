/* Draft engine — Modules 5, 6, 7.
 *
 * Pure functions over the artifact built offline. Everything here runs in the
 * browser during a live draft, so it must stay fast (it is: the whole board is
 * a few hundred players and every loop below is linear or n log n).
 *
 * Every recommendation carries its own `reasons` array so a pick can be audited
 * after the fact — "why did it say that" should never require reading code.
 */
(function (global) {
  'use strict';

  // A2/A3 live in their own modules; engine.js orchestrates them.
  const S = global.DraftSurvival || (typeof require === 'function' ? require('./survival.js') : null);
  const C = global.DraftComposite || (typeof require === 'function' ? require('./composite.js') : null);
  if (!S || !C) throw new Error('draft engine requires survival.js and composite.js to load first');

  // ---- config knobs (every magic number lives here, with its reasoning) ----
  const CFG = {
    // Mirrors survival.js — a source-provided sd always wins over both.
    ADP_SD_FLOOR: 3.0,        // nobody is unsure about pick 1
    ADP_SD_RATE: 0.15,        // was 0.22; see survival.js for why, and for why
    ADP_SD_CAP: 15.0,         // this is an interim, not a calibration
    RUN_WINDOW: 10,           // picks of history the Bayesian update looks at
    RUN_DAMPING: 0.5,         // how hard observed rates move the hazard
    RUN_MIN: 0.6,             // clamp: a cold position can't go below this
    RUN_MAX: 1.8,             // clamp: a hot position can't exceed this
    RUN_BANNER_AT: 1.4,       // multiplier that earns a "RUN DETECTED" banner
    BENCH_DISCOUNT: 0.35,     // 12-team default; formatDefaults() overrides it
    BENCH_SCORE_FLOOR: 0.0,   // a bench lottery ticket is never scored below ~0 (PARKED fix C)
    SURVIVOR_CUTOFF: 0.005,   // stop the VONA product once mass is negligible
    TIE_THRESHOLD: 2.0,       // composite points within which we call it a tie
    // STAGE 2 CAP — the crude, evidence-gated deviation anchor (pre-registered in
    // draft/backtest/STAGE2-CAP-PREREG.md). OFF by default: shipping it on before
    // it is measured would be the exact sin the pre-registration guards against.
    // When on, a candidate keeps its deviation-boosted score only if its EARNED
    // evidence (material drivers classed structural/moderate/validated — need,
    // ceiling) >= STAGE2_CAP_T; otherwise it is scored at its consensus baseline.
    // Enabled for measurement via env STAGE2_CAP=1 (see the boot line below).
    STAGE2_CAP: false,
    STAGE2_CAP_T: 4.0,        // one noise band's worth of TESTED evidence to move

    // --- on the clock (Part 6: the buddy layer) ---
    // How wide the gap to second has to be before the board is telling you
    // something rather than rounding noise. Below COIN_FLIP the honest answer
    // is "either", and saying so is worth more than a confident ranking that
    // is really a tossup — false precision is how a tool loses trust on the
    // one pick it got loudly wrong.
    COIN_FLIP_GAP: 1.0,
    CLOSE_GAP: 3.5,
    /* --- Paths panel (Part 2 §1) ---
     * How many top candidates the path clustering considers, how far below the
     * top score a direction may sit and still count as "solid", and the hard
     * 2-4 cap on how many directions render (more than four is a ranking, not a
     * decision).
     *
     * ── THE BAND WAS A FLOOR OVERRIDING ITS OWN DERIVATION (2026-08-13) ──────
     *
     * It read `PATHS_BAND: 12.0` and the comment described the design as
     * "max(12, COIN_FLIP_GAP*4) = 12". COIN_FLIP_GAP is 1.0, so the intended
     * derivation is 4.0 and A HARDCODED 12 SILENTLY DOMINATED IT — the third
     * instance of this exact pattern, after BENCH_CEILING_FLOOR overriding a
     * measured ceiling weight of 0 and VALUE_WEIGHT_FLOOR over w.value.
     *
     * IT MATTERS BECAUSE THE COMPOSITE'S SPREAD IS NOT CONSTANT. Measured over
     * Cory's twelve picks, the top-ten spread runs from 7.7 points to 40.8 — so
     * a fixed 12 admits nearly everything late and almost nothing early. At pick
     * 110 it rendered four directions whose leaders sat 0.0, 0.5, 0.7 and 3.6
     * behind the top: four options at equal visual weight, separated by less
     * than a point. That is the menu Cory could not read.
     *
     * Deriving it from COIN_FLIP_GAP is not a tuned constant — it says a
     * direction is an ALTERNATIVE only if choosing it costs about what the board
     * already calls indistinguishable, which is the one place this engine
     * defines "close". */
    PATHS_POOL: 10,
    get PATHS_BAND() { return (this.COIN_FLIP_GAP == null ? 1 : this.COIN_FLIP_GAP) * 4; },
    PATHS_MAX: 4,
    // Tier-urgency at/above this makes a path a "cliff — take it now" direction
    // rather than a "value" one; it drives both the name and the when-it's-right.
    PATHS_CLIFF_URGENCY: 6.0,
    // --- B7 dollar gap (Part 2) — the comparison primitive ---
    // v1 CRUDE boom-capacity proxy. These coefficients are ROUGH placeholders
    // that turn projection shape into a dollar estimate until September's quantile
    // model makes E[$] exact; they are calibrated only for RELATIVE comparison and
    // every gap renders with its confidence class. DG_HIGH_K prices boom capacity
    // (ceiling-over-mean) into weekly-high equity; DG_ENTRY_K prices the mean into
    // top-4-entry equity; DG_RS_K into RS equity; DG_ECHO_K converts the branch
    // forecast's next-pick point-loss into an echo dollar. DG_NOISE_BAND is the
    // "even money" width — a gap inside it is not a real edge and says so.
    DG_HIGH_K: 0.22,
    DG_ENTRY_K: 0.08,
    DG_RS_K: 0.05,
    DG_ECHO_K: 0.10,
    DG_NOISE_BAND: 4.0,
    // A target you have starred is allowed to jump a gap this big. Wide enough
    // that your own read wins a close call, narrow enough that it cannot drag
    // a materially worse player to the top of the list.
    TARGET_NUDGE: 3.0,

    // --- plausibility rails (Part 6 §2) ---
    // These never change a recommendation. They flag one, because an
    // integration bug across eight composite terms produces confident nonsense
    // rather than a crash — which this codebase has now done three times.
    RAIL_ADP_AHEAD: 30,           // picks ahead of ADP before "verify this"
    RAIL_LATE_ROUNDS: 2,          // rounds left below which K/DST stops being odd
    // Upside is worth paying for; it is not worth paying full price for. See
    // upsideBonus — the raw ceiling-minus-mean spread is a variance measure and
    // was entering a points-over-replacement sum at face value.
    // The value term never switches off entirely; see scorePlayer.
    VALUE_WEIGHT_FLOOR: 0.25,
    /* THE SAME PROTECTION FOR THE BENCH BRANCH, added 2026-08-12 after it was
     * measured recommending Tom Brady.
     *
     * The bench branch does not contain `value` at all — deliberately, VONA is
     * meaningless for a man you cannot start — so VALUE_WEIGHT_FLOOR does not
     * reach it. Its intended anchor is CEILING, and MEASURED_WEIGHTS sets
     * ceiling to 0, which left `0.5*stack + 1*keeper` deciding 120 of 240
     * simulated picks. A flat same-NFL-team bonus was choosing my round-8
     * through round-13 picks.
     *
     * Floored for exactly the reason `value` is: a branch's ANCHOR is not a
     * preference, and no slider setting may switch it off. The zeroing of
     * ceiling in the STARTER branch stands untouched — that decision was made
     * on the starter branch's arithmetic (2026-08-10) and this changes nothing
     * about it. RISK is floored too, as the safety net: it is what silently
     * kept DEFAULT_WEIGHTS from reaching (-42.00 on the worst offender), and it
     * was doing that job by accident rather than by design. */
    /* ── BOTH FLOORS RETIRED TO ZERO, 2026-08-14 ────────────────────────────
     *
     * These read 0.25 and were applied as `Math.max(FLOOR, w.ceiling)` and
     * `Math.max(FLOOR, w.risk)`, over a MEASURED_WEIGHTS.ceiling and .risk of
     * ZERO. The ceiling effect measured -4.8 with a [-26,+17] interval and could
     * not be signed; risk measured as a drag. Both were deliberately switched
     * off — AND A CONSTANT SWITCHED THEM BACK ON for every bench pick, which
     * after the starters fill is every pick. THE WEIGHT VECTOR IS THE SYSTEM'S
     * DESCRIPTION OF WHAT IT BELIEVES; A FLOOR IS THE BEHAVIOUR. They disagreed,
     * and the description lost silently.
     *
     * THEY COULD NOT BE REMOVED BEFORE. Tested on 2026-08-13, setting the
     * ceiling floor to 0 made the QB/TE symptom WORSE (33% -> 50%), because the
     * bench branch had nothing else in it — VONA had been discarded there on the
     * strength of a comment mischaracterising it. With VONA restored and the
     * onesie sign defect fixed, the branch ranks on a term that has an
     * out-of-sample dollar measurement behind it, and the floors are no longer
     * load-bearing for anything.
     *
     * MEASURED, full twelve-pick walk, floors 0.25 -> 0:
     *   roster shape   QB2 RB5 WR2 TE1 DEF1 K1  ->  QB1 RB6 WR2 TE1 DEF1 K1
     *   QB now MATCHES the market reference exactly (1 against 1)
     *   reach median / p90 / max   11.0 / 26.0 / 36.0   IDENTICAL
     *   replacement-level players in the top ten   0  ->  0
     *
     * Kept as named zeros rather than deleted: `Math.max(0, w)` still guards a
     * negative weight from a slider, and bench_branch_anchor.test.js drives
     * these to prove the branch refuses junk WITHOUT them. A knob at zero that a
     * test exercises is honest; a knob at 0.25 overriding a measurement was not.
     */
    BENCH_CEILING_FLOOR: 0,
    BENCH_RISK_FLOOR: 0,
    // D3 flex-discount (approved 2026-08-08). A player who only "starts in your
    // flex" is priced at his MARGINAL value over the best flex-eligible
    // alternative realistically available — never full VORP. FLEX_ALT_WEIGHT is
    // the knob (1.0 = full marginal); lower softens the overlap with the VONA
    // `value` term. Floored at 0, capped at full VORP in scorePlayer.
    FLEX_DISCOUNT: true,
    FLEX_ALT_WEIGHT: 1.0,

    /* D3b — SINGLE-STARTER (onesie) empty-slot need discount (QB/TE/K/DEF).
     * "fills an empty QB slot" used to award the player's FULL VORP as need. For a
     * ONE-starter position that credit is a double-count: the marginal of taking him
     * now — player minus the best replacement still available by my next pick — IS
     * exactly what VONA already prices (a VORP difference equals a proj difference at
     * a shared replacement level). Re-adding it front-loaded onesies (three QBs in the
     * top 7 of a 1-QB league; a TE outscoring an RB with 2.7x its VONA). With this on,
     * VONA prices the scarcity ONCE and the need term keeps only the residual VONA
     * cannot see: a small insurance premium for holding a mandatory slot open. Set
     * false to restore full-VORP need. Multi-starter slots (RB/WR) are untouched —
     * there VONA is large and the distortion doesn't bite. */
    ONESIE_NEED_DISCOUNT: true,
    ONESIE_NEED_INSURANCE: 0.5,   // fraction of the injury-scaled VORP kept as urgency

    /* THE ONESIE DUPLICATION RULE.
     *
     * For a position with exactly one starting slot and no flex relief — QB, K,
     * DEF, and TE once the TE slot and the flex are both accounted for — the
     * SECOND player is worth close to nothing in a 10-team league. He cannot be
     * started while the starter is healthy, and if the starter goes down the
     * wire has a comparable body for free. That asymmetry is the whole rule: a
     * bench RB gets started most weeks; a bench QB gets started almost never.
     *
     * A HARD marginal-value discount, not a soft need penalty. The second QB is
     * priced at his BACKUP/INSURANCE value, because standalone VORP is a number
     * about a player who starts and this one does not.
     *
     * Measured before the fix by draft/tests/sanity-sweep.test.js — 420 roster
     * states over the real board, realistically depleted — 265 onesie-duplicate
     * recommendations, including the reported QB2-in-round-9: Caleb Williams at
     * #2 with a QB rostered, Lamar Jackson at r6, Brock Purdy at r8.
     */
    ONESIE_DISCOUNT: true,
    ONESIE_KEEP: 0.10,            // fraction of standalone value a backup retains
    ONESIE_ENDGAME_PICKS: 2,      // last N picks: nothing else matters, rule relaxes
    /* THE STRUCTURAL CAP, added 2026-08-12 after the roster-construction run.
     *
     * THE DISCOUNT WAS NOT ENOUGH, and the measurement says so: across 120
     * simulated rooms the MODAL draft was QB3 RB1 WR3 TE3 K1 DEF1 — six of my
     * twelve picks on two positions that start one each, against 0.9 running
     * backs. ONESIE_KEEP = 0.10 is MULTIPLICATIVE, and a tenth of a small
     * positive bench score is still positive when every alternative sits near
     * zero. A discount cannot express "never", so it did not.
     *
     * This is a ROSTER-LEGALITY rule, not a valuation one: past this count the
     * player cannot reach the starting lineup at all, whatever he is worth.
     * Counted against the STRICT starting slots, deliberately excluding FLEX —
     * the flex is contested by RB/WR/TE and must not be pre-reserved for the
     * position that happens to be scoring well. So TE1 + TE2 (who may take the
     * flex) are allowed and TE3 is not.
     *
     * K and DEF get ZERO spare bodies: both are streamed, and a second one has
     * never been worth a pick in any measured run (both sit at exactly 1.0).
     *
     * RELAXED IN THE ENDGAME, like every other clause here — with two picks
     * left a legal lineup outranks a tidy one. */
    ONESIE_HARD_CAP: true,
    ONESIE_MAX_SPARE: { QB: 1, TE: 1, K: 0, DEF: 0 },
    // THE EXPLICIT EXCEPTIONS. A onesie duplicate may still surface, but only
    // for a stated reason, and the card must SAY it rather than presenting him
    // as a normal recommendation.
    ONESIE_EXTREME_ADP: 18,       // picks past his market price = real value falling
    ONESIE_ELITE_RANK: 3,         // ...and only for a top-N player at the position

    /* ── THE DOCTRINE TILT (Stage 3) ─────────────────────────────────────
     *
     * SMALL AND CITED, per the pre-registration's small-and-earn-up rule. The
     * enrolled doctrine is a TILT, never an override: it may decide a close
     * call and must never beat a clear one.
     *
     * THE MAGNITUDE IS CITED, NOT CHOSEN. Experiment 19b measured WR Feast
     * diverging from the control on a mean of 1.9 picks per draft and earning
     * +$187 doing it. A tilt that fires on ~2 of 12 picks is a tilt that can
     * only decide near-ties — so the bonus is sized to the observed near-tie
     * gap, not to a number that felt right. Measured on the real board, the
     * top-two composite gap at Cory's picks runs 2.4-10.1 points; DG_NOISE_BAND
     * (the even-money threshold) is 4.0. A tilt of 2.5 can therefore flip a
     * genuine coin-flip and cannot flip anything the engine already calls
     * decided.
     *
     * ⚠️ THIS IS A LEAN, NOT AN INSTALL. 19b is one tournament on simulated
     * rooms; the doctrine's own edge has never been graded on realized
     * outcomes. When experiment 34 reports, this constant is the install
     * point — and per the pre-registration it starts SMALL and earns its way
     * up, rather than starting loud and being tuned down.
     */
    DOCTRINE_TILT: 2.5,           // composite points, cited to exp 19b + the 4.0 band
    DOCTRINE_TILT_ON: true,

    /* CONSERVATION TILT — the count identity, enforced on the live board.
     * Gated departure, DECISIONS-NEEDED #7. Sigma P(gone) over the board must
     * equal the OPPONENT picks between now and my next turn; the raw three-layer
     * model does not satisfy that, and the exponential tilt solves one scalar
     * lambda to make it hold.
     *
     * Flag exists so the departure is revertible in one edit on draft morning
     * rather than by unpicking five call sites. Turning it OFF restores the
     * v3-frozen surface exactly, which is asserted in survival_honesty. */
    CONSERVE_SURVIVAL_ON: true,

    CEILING_SPREAD_SHARE: 0.15,   // fraction of theoretical upside treated as collectable
    CEILING_MAX_BONUS: 20.0,      // hard cap, in the composite's own points
    /* CEILING IS LATE-ROUNDS-ONLY (Cory's model, 2026-08-10). Projections (mean) +
     * VONA + tiers decide early and mid picks; ceiling contributes NOTHING to the
     * composite until the throwaway rounds, where it becomes the lottery-ticket term.
     * Between two players in the SAME tier and position it still breaks the tie toward
     * the higher ceiling (the weekly-payout lean) — that lives in the recommend() sort,
     * not the composite. CEILING_LATE_FROM is the draft-fraction the ramp starts at. */
    CEILING_LATE_FROM: 0.6,       // ceiling term = 0 until 60% of the draft, then ramps to full
    CEILING_TIEBREAK: true,       // same-tier/same-position near-ties lean to higher ceiling
    RAIL_COMPONENT_RATIO: 1.0,    // a component larger than the player's own VORP
    RAIL_RUNAWAY_RATIO: 3.0,      // top score this many times the runner-up
    RAIL_DEFAULT_POS_CAP: { QB: 3, K: 2, DEF: 2, TE: 3 },

    // --- the paper sheet (Part 6 §3) ---
    // Sized for one sheet of A4 at a readable size, not for completeness. A
    // two-page sheet is a sheet nobody reads the second page of, and the
    // failure mode this exists for — dead phone, no wifi — is exactly the one
    // where flipping pages is worst.
    SHEET_QUEUE_DEPTH: 40,        // your own queue: ~4 rounds of contingency
    SHEET_BEST_DEPTH: 30,         // board order, for when the queue runs dry
    SHEET_POSITION_DEPTH: 12,     // per position — deep enough to show 2-3 tiers
    SHEET_POSITIONS: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],

    // --- reading the room (A1 surfaced) ---
    // How much evidence earns a sentence about an opponent. Set high on purpose.
    // A tool that says something confident about all nine of your league-mates
    // is a tool saying nine things, most of them noise, and one wrong call at
    // the table costs more trust than nine right ones earn. Under these
    // thresholds it says nothing, which is usually correct.
    TELL_TIMING_ROUNDS: 1.0,     // rounds off league average before it is a tendency
    TELL_REACH_PICKS: 2.0,       // picks above/below market
    TELL_BPA_GAP: 0.12,          // best-available rate vs league
    TELL_HOMER_RATE: 0.20,       // share of picks from one NFL team
    TELL_ROOKIE_RATIO: 1.5,      // times the league rookie rate
    TELL_ROOKIE_FLOOR: 0.12,     // ...and at least this often, so 2% vs 1% is not a tell

    // --- the threat board ---
    THREAT_NAMES_PER_PICK: 3,    // names shown per intervening seat
    THREAT_MIN_P: 0.01,          // below this a candidate is noise, not a threat
    THREAT_AT_RISK_MIN: 0.25,    // chance of being gone before it is worth naming
    THREAT_AT_RISK_SHOWN: 8,

    // How deep to compare when reporting what a weight change did. Five is the
    // length of the list on screen — reporting a change below the fold would be
    // reporting a change you cannot see.
    WEIGHT_DIFF_DEPTH: 5,

    // --- auto-adjusting weights by draft phase ---
    // Round boundaries for the four phases. Not fitted — three prior drafts is
    // nowhere near enough to fit weights against, and claiming otherwise would
    // be exactly the false precision this codebase refuses. They are the
    // standard shape of a snake draft, stated so they can be argued with.
    AUTO_ANCHOR_ROUNDS: 2,      // everything is empty; need is meaningless
    AUTO_BUILD_ROUNDS: 6,       // starters filling in
    AUTO_FILL_ROUNDS: 10,       // holes start costing real points
    AUTO_TIGHT_PICKS: 4,        // picks left below which a gap is an emergency
  };

  // Measurement override: the intervention-rate diff enables the cap via env so
  // it can measure the cap WITHOUT shipping it on. Node only; no effect in the app.
  if (typeof process !== 'undefined' && process.env && process.env.STAGE2_CAP === '1') {
    CFG.STAGE2_CAP = true;
  }

  /* CEILING = 0.65 — installed 2026-08-08 per DECISION D9 (Cory: "INSTALL, the
   * conservative end"). EVIDENCE: Lab experiment 21 (mean-variance frontier,
   * `FRONTIER.md`) found an INVERTED-U dose-response on ceiling tilt across 150
   * paired rooms from my actual keeper base — moderate tilt is worth
   * +$56/season vs no tilt (λ=0.5: CI [33, 78]; λ=0.25: +$44), while heavy tilt
   * is provably NEGATIVE (λ=2: −$18; λ=3: −$27, CI excludes zero). Experiment 2
   * §5 (`POLICY-TOURNAMENT.md`) independently reproduced the same shape from a
   * different control. 0.65 is deliberately the CONSERVATIVE end of the winning
   * band, not its peak.
   * CAVEAT, stated because it governs the install: both experiments ran in the
   * simulated-room PROXY (v1 money model), not on held-out real seasons — this
   * is a strong LEAN, not a certified edge. September's quantile re-run
   * certifies or reverts it (pre-registered). */
  const DEFAULT_WEIGHTS = { value: 1.0, tier: 1.0, need: 1.0, risk: 1.0, ceiling: 0.65,
    keeper: 1.0, bye: 1.0, stack: 1.0 };

  /* THE MEASURED CONFIG — what the tool loads on, 2026-08-09 (Cory-confirmed).
   *
   * The all-terms participation test (exp_participation, 400 paired rooms) and its
   * follow-ups measured which adjusters actually earn on top of the defensible core
   * (the startable-cap MASK — always on, in needrule.js — plus the VALUE anchor):
   *   - value 1.0   : the anchor; removing it costs ~$362. Half the whole edge.
   *   - stack 1.0   : the ONE adjuster that earns (exp6/stack_sweep, +$196); its
   *                   correlation mechanism isn't in the money-MC, so trust stack_sweep.
   *                   THE LITERAL HERE READ 0.5 UNTIL 2026-08-13 while the live weight
   *                   below read 1.0 — so this block and the code disagreed, and the
   *                   file supported both readings of D10 at once. Cory ruled that 1.0
   *                   was what D10 meant to stand and that the SUPERSEDED marking had
   *                   been applied backwards: the engine was right, the record was
   *                   wrong. Corrected here, in the test assertion, and in the frozen
   *                   baseline (v8) rather than in one place — a coefficient that
   *                   decides picks cannot be documented one way and executed another.
   *   - need 0     : INERT by mask redundancy — the additive weight flips only ~5% of picks
   *                   at 0.5 and still 8% at 3.0, because the need signal is ~uniform inside
   *                   the startable-cap MASK (which IS the need mechanism). Not "untested" —
   *                   unexplorable by this lever. Settled at 0 (the simpler number). The mask
   *                   still carries all of need; participation-rate probe, Cory-confirmed.
   *   - ceiling 0     : SETTLED TO ZERO 2026-08-10 (Cory's call, reviewer-driven). The
   *                   ledger's de-confounded measurement is ceiling -4.8 [-26, +17] — a
   *                   sign we CANNOT distinguish from zero. Yet at 0.65 the flip diagnostic
   *                   showed it deciding 2 of 6 late-round #1s and 4 of 6 top-5s: a third of
   *                   the late board ridden by a term with no defensible sign. The 0.65 was a
   *                   stale single-run guess that outlived its measurement (there was no gate
   *                   between MEASURED and LOADED — the structural bug the graduation gate
   *                   will close). At 0, late picks order by the VALUE ANCHOR + board = "best
   *                   available late", which is the conventional answer and what "don't
   *                   deviate without backing" demands. The weekly-payout ceiling LEAN is NOT
   *                   lost: it lives in the same-tier CEILING TIEBREAK (acts only on genuine
   *                   ties, where value is silent) and in the opt-in "Ceiling Chase" doctrine.
   *   - tier 0, risk 0 : measured DRAG — they pull picks off the value anchor toward a
   *                   mechanism no payout rewards (tier −$235, risk −$143 pooled), worst
   *                   in the early rounds where the anchor is strongest.
   *   - bye 0       : a real null (flips ~40% of picks, earns nothing).
   *   - keeper 1.0  : unmeasured (a cross-season option value a single-season grade can't
   *                   price); left on because it only nudges keeper-eligible players and
   *                   drives the informational KEEPER-TARGET badge, not normal picks.
   * Magnitudes are MC-harness-tier; the SIGN/ordering is the robust claim. See
   * DECISIONS-NEEDED #3. Auto mode still carries its own (older, grid-guarded) phase
   * ramp — this is the DEFAULT the tool loads on, not a change to Auto. */
  /* ⚠️ stack RESTORED TO 1.0, 2026-08-13 — A GOVERNANCE CORRECTION, NOT A TUNE.
   *
   * D10 (Cory, 2026-08-08) stood the stack change down: exp6's peak-at-0.5 is a
   * LEAN priced against a MODELLED rho (0.35), not a measured correlation, and
   * installing on a modelled parameter would have broken D9's own conservatism
   * standard. Its words were "Nothing installed. The stack weight remains 1.0."
   *
   * The next day, `d7da8d3` adopted the measured config wholesale and `stack`
   * rode along at 0.5. Nobody noticed the ruling it contradicted, because the
   * graduation gate compares loaded weights against MEASUREMENTS and had no view
   * of DECISIONS — C found the discrepancy on 2026-08-12 and the gate now checks
   * rulings too.
   *
   * I marked D10 superseded. **Cory has confirmed the ruling was meant to stand,
   * so the ENGINE was wrong and the marking was backwards.** Restored here; the
   * supersession is reversed in LAB-REGISTRY with the correction recorded rather
   * than the state quietly flipped back.
   *
   * The 0.5 finding is not discarded — it remains pre-registered for the
   * September quantile re-run, when a MEASURED correlation replaces the modelled
   * one and the install can be judged on the standard D10 asked for. */
  const MEASURED_WEIGHTS = { value: 1.0, tier: 0.0, need: 0.0, risk: 0.0, ceiling: 0.0,
    keeper: 1.0, bye: 0.0, stack: 1.0 };

  /* Named strategies, as weight sets.
   *
   * Seven sliders is six too many to reason about on the clock, and a knob you
   * do not know how to turn is a knob you never touch — which makes it worse
   * than no knob, because it still looks like a decision you are declining to
   * make. These are the four readings of a draft that actually differ, each
   * expressed as the weights it implies, with the reason attached so it can be
   * argued with rather than trusted.
   *
   * They are starting points. Every one of them is still a slider afterwards.
   */
  const WEIGHT_PRESETS = [
    {
      key: 'measured', label: 'Live policy',
      why: 'What the tool loads on, and what the Lab could actually MEASURE earning money: '
        + 'rank off the board (value) and a stack tilt (the one adjuster that earned). Tier, '
        + 'risk, need, bye AND ceiling are OFF — tier/risk measured as a drag, need is redundant '
        + 'with the always-on lineup MASK, bye is a null, and ceiling could not be signed '
        + '(-4.8 [-26,+17]) so it no longer decides late picks. This is the honest panel: the '
        + 'sliders at zero are at zero because they did nothing.',
      // ONE SOURCE OF TRUTH: reference MEASURED_WEIGHTS, never a second literal. A
      // duplicated copy here is exactly how ceiling stayed 0.65 in one place after
      // it was zeroed in the other (the two-places disease); matchPreset now compares
      // against the same object it loads.
      weights: MEASURED_WEIGHTS,
    },
    {
      key: 'balanced', label: 'Balanced',
      why: 'The old defaults — every term on at ~1. Kept as a reference point; the Lab '
        + 'found several of these terms earn nothing (see Live policy).',
      weights: { value: 1.0, tier: 1.0, need: 1.0, risk: 1.0, ceiling: 0.5, keeper: 1.0, bye: 1.0, stack: 1.0 },
    },
    {
      key: 'value', label: 'Best available',
      why: 'Take the best player and sort the lineup out later. Need barely '
        + 'registers; tier cliffs and safety do the deciding. Strongest early, '
        + 'dangerous after round 8 when the holes stop filling themselves.',
      weights: { value: 1.3, tier: 1.4, need: 0.35, risk: 1.1, ceiling: 0.5, keeper: 1.0, bye: 0.7, stack: 0.7 },
    },
    {
      key: 'upside', label: 'Swing for it',
      why: 'Ceiling over floor, cliffs over comfort. In a 10-team league the '
        + 'median team makes the playoffs, so the payoff is in the tail — but '
        + 'this WILL hand you a bust or two and you should expect it.',
      weights: { value: 0.8, tier: 1.2, need: 0.8, risk: 0.45, ceiling: 1.6, keeper: 1.3, bye: 0.8, stack: 1.3 },
    },
    {
      key: 'safe', label: 'Win now, no holes',
      why: 'Fill the lineup, avoid the bye-week landmines, take the boring '
        + 'healthy one. Costs you upside and it is meant to. Sensible when your '
        + 'three keepers already carry the team.',
      weights: { value: 0.6, tier: 0.9, need: 1.6, risk: 1.7, ceiling: 0.2, keeper: 0.5, bye: 1.6, stack: 0.8 },
    },
  ];

  /* Which preset (if any) the current weights ARE.
   *
   * Exact match only. "Close to Balanced" is a claim that invites you to stop
   * reading the sliders, which is the opposite of what they are for.
   */
  function matchPreset(weights) {
    const keys = Object.keys(DEFAULT_WEIGHTS);
    for (const p of WEIGHT_PRESETS) {
      if (keys.every(k => Math.abs((weights[k] == null ? 1 : weights[k]) - p.weights[k]) < 1e-9)) return p.key;
    }
    return null;
  }

  /* What a weight change actually did to the top of the board.
   *
   * A slider whose effect you cannot see is a slider you are guessing with.
   * Comparing two ranked lists of names is the only honest answer to "did that
   * do anything" — and most of the time the answer is no, which is worth
   * knowing before you spend a pick believing otherwise.
   */
  function rankDiff(before, after, depth) {
    depth = depth || CFG.WEIGHT_DIFF_DEPTH;
    const a = (before || []).slice(0, depth).map(s => s.player.name);
    const b = (after || []).slice(0, depth).map(s => s.player.name);
    if (!a.length || !b.length) return { changed: false, message: '' };
    if (a[0] !== b[0]) {
      return { changed: true, topChanged: true,
        message: 'Now recommends ' + b[0] + ' over ' + a[0] + '.' };
    }
    const joined = b.filter(n => a.indexOf(n) === -1);
    const dropped = a.filter(n => b.indexOf(n) === -1);
    if (joined.length || dropped.length) {
      return { changed: true, topChanged: false,
        message: (joined.length ? joined.join(', ') + ' into the top ' + depth : '')
          + (joined.length && dropped.length ? '; ' : '')
          + (dropped.length ? dropped.join(', ') + ' out' : '') + '.' };
    }
    const moved = b.some((n, i) => a[i] !== n);
    return { changed: moved, topChanged: false,
      message: moved ? 'Reordered the top ' + depth + ', same names.'
                     : 'No change to the top ' + depth + '.' };
  }

  // Positional injury rates -> how much bye/injury insurance a bench body is worth.
  const INJURY_RATE = { QB: 0.14, RB: 0.28, WR: 0.20, TE: 0.22, K: 0.04, DEF: 0.02 };
  // Age at which production reliably falls off, by position.
  const AGE_CLIFF = { RB: 27, WR: 30, TE: 31, QB: 36, K: 99, DEF: 99 };

  // ---- Module 5 now lives in survival.js (A2 three-layer model) ----
  // These thin wrappers keep the pre-refactor call sites working unchanged.
  const normalCdf = S.normalCdf;
  const adpSd = S.adpSd;
  const survivalRaw = S.survivalProbability;

  /* THE ONE SURVIVAL ACCESSOR — and the reason it is one.
   *
   * conservedSurvival was built, exported, covered by its own test, and CALLED BY
   * NOTHING. The app read s.survival_to_next straight off the engine, the engine
   * read S.survivalProbability directly, and the conservation correction — a
   * redistribution rule solved rather than chosen, three candidates tested
   * against each other — did nothing at all. That is why the frozen ratios sat at
   * 0.86-0.90 against an identity demanding 1.000.
   *
   * FIVE CALL SITES read survival: VONA's expectedBestAvailable, the tier-cliff
   * exhaustion product, survival_to_next on the scored entry, the branch
   * forecast, and the draft sheet. Tilting some and not others would leave the
   * board's expected-best disagreeing with the number printed beside the player —
   * a two-places disease with the two places on the same screen. So the accessor
   * replaces the raw binding and every site goes through it.
   *
   * WHAT IT DOES NOT DO. Enforcing the identity is NOT calibration. If the
   * model's shape is wrong, the tilt yields per-player numbers that are still
   * wrong and now merely sum correctly. It fixes the total, not the ordering
   * within it. Stated here as well as in the gate proposal, because the caveat is
   * only useful where the code is read.
   */
  function survival(player, targetPick, ctx) {
    if (!CFG.CONSERVE_SURVIVAL_ON || !ctx || !ctx.board) {
      return survivalRaw(player, targetPick, ctx);
    }
    const c = S.conservedSurvival(ctx.board, targetPick, ctx);
    // `applied` is false when the raw mass is already at or under the count —
    // there is nothing to redistribute and the raw numbers stand. Falling back
    // rather than tilting toward a target we already meet.
    if (!c || !c.applied) return survivalRaw(player, targetPick, ctx);
    const v = c.byId[String(player.player_id)];
    // A player absent from the conserved map is one who is not on ctx.board —
    // the tilt has nothing to say about him, so he keeps his raw number rather
    // than a fabricated one.
    return v == null ? survivalRaw(player, targetPick, ctx) : v;
  }
  const runMultipliers = S.runMultipliers;
  const detectRuns = S.detectRuns;

  // ========================================================= Module 6: VONA
  /**
   * E[best available at `nextPick`] for one position.
   * P(j is the best survivor) = P(j survives) × Π over better players P(taken).
   */
  function expectedBestAvailable(playersAtPos, nextPick, survivalCtx) {
    const sorted = playersAtPos.slice().sort((a, b) => b.proj_mean - a.proj_mean);
    let expected = 0, allBetterGone = 1, massUsed = 0;
    for (const p of sorted) {
      const surv = survival(p, nextPick, survivalCtx);
      const pBest = surv * allBetterGone;
      expected += p.proj_mean * pBest;
      massUsed += pBest;
      allBetterGone *= (1 - surv);
      if (allBetterGone < CFG.SURVIVOR_CUTOFF) break;
    }
    // Whatever probability mass is left means everyone listed is gone; fall back
    // to the worst known player rather than silently crediting zero points.
    if (massUsed < 1 && sorted.length) {
      expected += sorted[sorted.length - 1].proj_mean * (1 - massUsed);
    }
    return expected;
  }

  /** VONA — how much you lose by waiting. The primary decision metric. */
  function vona(player, board, nextPick, survivalCtx) {
    if (nextPick == null) return player.proj_mean; // no future pick: everything is at stake
    const samePos = board.filter(p => p.position === player.position && p.player_id !== player.player_id);
    const eba = expectedBestAvailable(samePos, nextPick, survivalCtx);
    return player.proj_mean - eba;
  }

  // =============================================== Module 7: composite score
  function tierCliffUrgency(player, board, nextPick, survivalCtx) {
    const tierMates = board.filter(p => p.position === player.position && p.tier === player.tier
      && p.player_id !== player.player_id);
    // P(every remaining tier-mate is gone) = the tier is exhausted.
    let pExhausted = 1;
    tierMates.forEach(p => { pExhausted *= (1 - survival(p, nextPick, survivalCtx)); });
    const drop = player.tier_drop || 0;
    return drop * pExhausted;
  }

  /** Value only counts if it reaches the starting lineup. */
  /* D3 — the best flex-eligible alternative realistically available on the board
   * (excluding `player`), by VORP. The marginal a flex-fill is worth is priced
   * against THIS. Cached on ctx across a scoring pass (recommend reuses one ctx),
   * so it is O(n) total, not O(n²). A board-now proxy for "what I could take
   * instead"; the survival-weighted version is quantile-V September work. */
  function bestFlexAlt(player, ctx) {
    const FLEXIBLE = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'] };
    if (!ctx._flexAltSorted) {
      const starters = (ctx.league || {}).starters || {};
      const elig = {};
      Object.keys(FLEXIBLE).forEach(s => { if (starters[s]) FLEXIBLE[s].forEach(p => { elig[p] = true; }); });
      ctx._flexAltSorted = (ctx.board || []).filter(p => elig[p.position])
        .sort((a, b) => (b.vorp || 0) - (a.vorp || 0));
    }
    const list = ctx._flexAltSorted;
    for (let i = 0; i < list.length; i++) {
      if (String(list[i].player_id) !== String(player.player_id)) return list[i].vorp || 0;
    }
    return 0;
  }

  function starterSlotMarginal(player, roster, league) {
    const starters = league.starters || {};
    const flexEligible = { FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'] };
    const mine = roster.filter(p => p.position === player.position)
      .sort((a, b) => b.proj_mean - a.proj_mean);
    const dedicated = starters[player.position] || 0;

    if (mine.length < dedicated) {
      return { value: player.vorp, fills: 'starter',
               why: `fills an empty ${player.position} slot` };
    }
    // Dedicated slots full — can they still start in a flex?
    let flexOpen = 0;
    Object.keys(flexEligible).forEach(slot => {
      if (!starters[slot]) return;
      if (!flexEligible[slot].includes(player.position)) return;
      const used = roster.filter(p => flexEligible[slot].includes(p.position)).length
        - flexEligible[slot].reduce((s, pos) => s + Math.min(starters[pos] || 0,
          roster.filter(r => r.position === pos).length), 0);
      flexOpen += Math.max(0, (starters[slot] || 0) - Math.max(0, used));
    });
    if (flexOpen > 0) {
      return { value: player.vorp, fills: 'flex', why: 'starts in your flex' };
    }
    // Bench: worth the upgrade over the man he replaces, discounted, plus a
    // small insurance premium scaled by how often this position misses games.
    const incumbent = mine[dedicated - 1] || mine[mine.length - 1];
    const upgrade = incumbent ? player.proj_mean - incumbent.proj_mean : player.vorp;
    const insurance = (INJURY_RATE[player.position] || 0.15) * Math.max(0, player.vorp) * 0.5;
    return {
      value: upgrade * CFG.BENCH_DISCOUNT + insurance,
      // WHICH SLOT, not just how much. Path naming used to threshold the
      // MAGNITUDE (`need > 0.5`), so a bench upgrade with any positive marginal
      // value was labelled "Fill TE now" while the TE slot was already full —
      // the mock-#1 complaint, and independent of the seat bug that caused the
      // roster to be wrong in the first place.
      fills: 'bench',
      why: upgrade > 0 ? `bench upgrade over your ${player.position}${dedicated}` : 'bye/injury cover',
    };
  }

  function riskAdjustment(player) {
    let risk = 0;
    const reasons = [];
    const cliff = AGE_CLIFF[player.position] || 99;
    if (player.age && player.age >= cliff) {
      const over = player.age - cliff + 1;
      risk -= Math.min(25, 6 * over);
      reasons.push(`age ${player.age} — past the ${player.position} cliff`);
    }
    if (player.injury_status && !/^(healthy|active)$/i.test(player.injury_status)) {
      risk -= 12;
      reasons.push(`listed ${player.injury_status}`);
    }
    if (player.games_missed_3yr >= 8) {
      risk -= 8;
      reasons.push(`${player.games_missed_3yr} games missed in 3 seasons`);
    }
    if (player.depth_chart_order && player.depth_chart_order > 1) {
      risk -= 6 * (player.depth_chart_order - 1);
      reasons.push(`#${player.depth_chart_order} on the depth chart`);
    }
    if (player.opportunity_z != null && player.opportunity_z > 1) {
      risk += 6;
      reasons.push('opportunity metrics ahead of consensus');
    } else if (player.opportunity_z != null && player.opportunity_z < -1) {
      risk -= 6;
      reasons.push('opportunity metrics behind consensus');
    }
    return { value: risk, reasons };
  }

  /* Per-position typical ceiling spread, recomputed from the LIVE board at the
   * top of every recommend(). Derived from the board rather than hardcoded so it
   * tracks the actual projection source: a hardcoded table would be a second
   * derivation of the projections, free to go stale against them. */
  let _ceilingScales = null;
  function computeCeilingScales(board) {
    /* THE NORMALISER IS REPLACEMENT LEVEL, NOT THE SPREAD DISTRIBUTION.
     *
     * The first version of this divided by each position's MEDIAN SPREAD and was
     * wrong in the amplifying direction: QB's median spread is the SMALLEST on
     * the board (9.7 against WR's 22.8), because the QB pool is mostly backups
     * with tiny projections. Dividing by it would have handed quarterbacks a
     * 2.35x boost — the exact defect, inverted and made worse. The p90 of 66.5
     * that names the problem and the median of 9.7 are the same distribution,
     * heavily right-skewed, and picking the wrong statistic flips the fix.
     *
     * The defect is that A QUARTERBACK SCORES 350-400 A SEASON AND A TIGHT END
     * 150, so the normaliser has to be the position's SCORING MAGNITUDE.
     * Replacement level already is exactly that and is already on every row
     * (QB 341.7, RB 188.5, WR 172.7, TE 150.7). Dividing by it turns a spread
     * into a FRACTION OF WHAT THE POSITION SCORES: QB 66.5/341.7 = 0.195 and
     * TE 30.8/150.7 = 0.204 — near-identical, which is what "the same upside"
     * ought to mean and what the raw points never did. */
    const by = {};
    (board || []).forEach(p => {
      if (!p || !p.position) return;
      const rep = Number(p.replacement);
      if (isFinite(rep) && rep > 0) by[p.position] = rep;
    });
    const vals = Object.keys(by).map(k => by[k]).sort((a, b) => a - b);
    return { scales: by, ref: vals.length ? vals[Math.floor(vals.length / 2)] : 0 };
  }

  function upsideBonus(player, pickNumber, totalPicks, myPicksLeft, allStages, gateOpen) {
    // UNIT MISMATCH — the bug this fixes.
    //
    // `raw` is proj_ceiling minus proj_mean, which is a SPREAD: it tracks
    // proj_sd, not value over replacement. On the real board that is 136 points
    // for Jahmyr Gibbs and 110 for McCaffrey. Every other term in the composite
    // is denominated in points-over-replacement, where an elite player scores
    // ~150 and a round-6 pick scores ~10. So the raw spread was entering the
    // sum at elite-VORP magnitude for anyone with a wide projection, and the
    // wider the uncertainty the bigger the bonus — variance was being paid for
    // as though it were value.
    //
    // The plausibility rail caught it and was ignored: on the 2026-08-07 board
    // it fired `ceiling is Nx this player's VORP` on 15 of the top 15, reaching
    // 15.0x at pick 54. RAIL_COMPONENT_RATIO = 1.0 states the contract plainly
    // — no single component may exceed the player's own VORP — so a term
    // running 15x over it is not a tuning question.
    //
    // Two changes, both in named config:
    //   CEILING_SPREAD_SHARE puts the spread on the composite's scale. Only a
    //   fraction of theoretical upside is actually collectable, and paying the
    //   whole spread assumes every boom outcome lands.
    //   CEILING_MAX_BONUS is a hard ceiling on the ceiling. Whatever the
    //   projection's variance, this term cannot outweigh the value terms.
    //
    // Deliberately NOT capped at the player's own VORP: a round-12 flier has a
    // VORP near zero and upside is the entire reason to take him. Capping there
    // would delete the lottery-ticket behaviour the next line exists to create.
    /* ── POSITION-NORMALISED, 2026-08-13. THE UNITS DEFECT, FIXED AT SOURCE ──
     *
     * `proj_ceiling - proj_mean` is a SPREAD IN RAW SEASON POINTS. A quarterback
     * scores 350-400 a season and a tight end 150, so the QB's spread is the
     * biggest number on the board BY CONSTRUCTION — p90 of 66.5 at QB against
     * 30.8 at TE. Ranking bench picks on it MEASURES SCALE AND CALLS IT UPSIDE,
     * and it is why the board kept handing Cory a second quarterback and a
     * second tight end he could not start.
     *
     * WHY THE ONESIE CAP DID NOT FIX IT, and this is the part that matters: the
     * cap treats the OUTPUT while this drives the INPUT. And the term was
     * supposed to be OFF — MEASURED_WEIGHTS.ceiling is 0, because the ceiling
     * effect measured -4.8 with a [-26,+17] interval and could not be signed.
     * But the bench branch floors it: `Math.max(BENCH_CEILING_FLOOR, w.ceiling)`
     * with BENCH_CEILING_FLOOR = 0.25 SILENTLY RE-ENABLES A WEIGHT THE
     * MEASUREMENT SET TO ZERO, for every bench pick. So the deliberately-
     * disabled, unsignable, unnormalised term is the primary ranker of the whole
     * back half of the draft.
     *
     * THE FIX IS A RATIO, NOT A CAP. Divide each spread by the TYPICAL SPREAD AT
     * ITS OWN POSITION, then re-scale by the board-wide typical spread so the
     * term keeps its magnitude on the composite's scale. What survives is "how
     * much more upside than a normal player at this position" — dimensionless,
     * and therefore comparable across positions, which is the one thing the raw
     * spread never was. Median rather than mean: a handful of extreme boom
     * projections at one position would otherwise set that position's scale. */
    const rawSpread = (player.proj_ceiling || player.proj_mean) - player.proj_mean;
    const cs = _ceilingScales;
    const posScale = cs && cs.scales[player.position];
    const raw = (posScale > 0 && cs.ref > 0) ? rawSpread * (cs.ref / posScale) : rawSpread;
    // Ceiling is LATE-ONLY for the LIVE recommendation: zero until CEILING_LATE_FROM
    // of the draft, then ramps to full (Cory's model — mean+VONA+tiers decide early/mid;
    // throwaway rounds get the lottery). `allStages` restores the old full-draft ramp
    // ONLY for the strategy-exploration shadows, whose whole purpose is to explore
    // ceiling-forward drafts (ctx.ceilingAllStages); it never touches the live board.
    const lateness = totalPicks ? Math.min(1, pickNumber / totalPicks) : 0.5;
    const from = CFG.CEILING_LATE_FROM != null ? CFG.CEILING_LATE_FROM : 0.6;
    /* `gateOpen` REPLACES THE PROXY WITH THE REAL CONDITION.
     *
     * CEILING_LATE_FROM = 0.6 is a PROXY for "the throwaway rounds" — pick 90 of
     * 150. The bench branch fires on the actual condition it is proxying for:
     * every starting slot is full, so from here on every pick IS a lottery
     * ticket. Measured, that happens near pick 70, so through rounds 8 and 9 the
     * proxy said "not late yet" while the real condition had already arrived and
     * the branch's only anchor read 0.00 for every player on the board.
     *
     * So the bench branch passes gateOpen and uses the condition instead of the
     * proxy. THE STARTER BRANCH IS UNTOUCHED — it still ramps from 0.6, because
     * that is the arithmetic the 2026-08-10 ceiling decision was made on. */
    const gate = gateOpen ? 1
      : allStages ? (0.3 + 0.7 * lateness)
      : Math.max(0, (lateness - from)) / Math.max(1e-6, 1 - from);
    const endgame = myPicksLeft != null && myPicksLeft <= 5 ? 1.6 : 1.0;
    const scaled = raw * CFG.CEILING_SPREAD_SHARE * gate * endgame;
    return Math.max(-CFG.CEILING_MAX_BONUS, Math.min(CFG.CEILING_MAX_BONUS, scaled));
  }

  /** The full composite, with a human-readable audit trail attached. */
  /**
   * Is this player a ONESIE DUPLICATE, and if so does he earn an exception?
   *
   * Returns { duplicate, discount, exception, why } where `discount` is the
   * multiplier applied to his value-bearing terms and `why` is the sentence the
   * card must show when he surfaces anyway. A onesie duplicate that appears
   * WITHOUT a stated reason is a bug; one that appears WITH one is a judgement
   * the human can overrule.
   */
  function onesieState(player, ctx) {
    const none = { duplicate: false, discount: 1, exception: null, why: null };
    if (!CFG.ONESIE_DISCOUNT) return none;
    const starters = (ctx.league || {}).starters || {};
    const pos = player.position;
    const roster = ctx.roster || [];
    const slots = starters[pos] || 0;
    if (!slots) return none;

    const have = roster.filter(p => p.position === pos).length;
    if (have < slots) return none;                       // still filling the slot

    // TE is a onesie only once the FLEX cannot take him either.
    if (pos === 'TE' || pos === 'RB' || pos === 'WR') {
      const flexEl = ['RB', 'WR', 'TE'];
      const spare = flexEl.reduce((n, q) =>
        n + Math.max(0, roster.filter(p => p.position === q).length - (starters[q] || 0)), 0);
      const flexOpen = (starters.FLEX || 0) - Math.min(starters.FLEX || 0, spare);
      if (flexOpen > 0) return none;                     // he can still start
      if (pos !== 'TE') return none;                     // RB/WR depth is legitimate
    }

    // THE ENDGAME RELAXATION: with a pick or two left, nothing else matters.
    const left = Number(ctx.myPicksLeft);
    if (Number.isFinite(left) && left <= CFG.ONESIE_ENDGAME_PICKS) return none;

    /* THE HARD CAP — A CEILING ON HABITUAL BEHAVIOUR, NOT A PROHIBITION.
     *
     * ⚠️ TEMPORARY. This is a constraint standing in for a valuation that does
     * not work. The bench branch ranks on `proj_ceiling − proj_mean` in RAW
     * SEASON POINTS, and a quarterback scores 350–400 a season, so his spread is
     * the largest absolute number on the board almost by construction (measured
     * p90: QB 66.5, RB 44.9, WR 34.7, TE 30.8, K 28.1). THAT MEASURES SCALE, NOT
     * UPSIDE — and scale is something the model already knows and should not
     * count twice. A second quarterback should be PRICED LOW BECAUSE HE CANNOT
     * START, not forbidden because somebody counted.
     * ITS REPLACEMENT IS NAMED: position-normalised ceiling. See the retirement
     * check in draft/tests/onesie_cap.test.js and the trigger in PARKED.md.
     *
     * `spare` counts bodies beyond the STRICT slots — FLEX excluded, because the
     * flex is contested by RB/WR/TE and must not be pre-reserved for whichever
     * position happens to be scoring well. */
    const capAllowed = CFG.ONESIE_HARD_CAP ? (CFG.ONESIE_MAX_SPARE || {})[pos] : null;
    const wouldCap = capAllowed != null && (have - slots) >= capAllowed;

    // ---- the exceptions, each of which must be SAYABLE ----------------------
    const adp = player.adjusted_adp != null ? player.adjusted_adp : player.raw_adp;
    const here = Number(ctx.currentPick);
    const fell = (adp != null && Number.isFinite(here)) ? (here - adp) : 0;
    const rank = positionRank(player, ctx);
    if (fell >= CFG.ONESIE_EXTREME_ADP && rank > 0 && rank <= CFG.ONESIE_ELITE_RANK) {
      /* THE FALL-THROUGH SURVIVES THE CAP, and this ordering is the correction.
       *
       * My first version checked the cap BEFORE the exceptions, on the argument
       * that a man who cannot reach the lineup gains nothing from having fallen
       * far. THAT WAS WRONG (Cory, 2026-08-12): a top-three player at the
       * position, handed to me eighty picks past his price, is a trade asset in
       * a room where somebody will need one, and insurance at the one position
       * where a bye leaves me starting NOBODY. Refusing him is a worse error
       * than the one the cap fixes. Measured before the correction: an elite QB3
       * fallen 89 picks sank to rank 1401 of 1753.
       *
       * BUT HE IS STILL DISCOUNTED RATHER THAN PRICED AT FULL VALUE when the cap
       * would otherwise bind — priced low because he cannot start, which is the
       * principle the cap is a stand-in for. He surfaces if he is genuinely
       * better than the alternatives; he does not surface because the arithmetic
       * favours his position. */
      return { duplicate: true, discount: wouldCap ? CFG.ONESIE_KEEP : 1,
        capped: false, exception: 'value',
        why: pos + (have + 1) + ' — ' + (player.name || 'he') + ' at +' + Math.round(fell)
          + ' vs ADP, top-' + CFG.ONESIE_ELITE_RANK + ' at the position; insurance and '
          + 'trade value. YOU CANNOT START HIM'
          + (wouldCap ? ', and you already carry ' + have + ' — priced as a spare.' : '.') };
    }
    const starter = roster.filter(p => p.position === pos)
      .sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0))[0];
    /* "QUESTIONABLE" IS NOT AN INJURY EXCEPTION.
     *
     * The first cut of this accepted any non-healthy status, and the sanity
     * sweep immediately surfaced 291 onesie duplicates all waved through on
     * `Questionable` — because in August a large share of the league carries
     * that tag and it means almost nothing. An exception that fires for
     * everybody is not an exception; it is the rule with extra words, and it
     * would have put a backup QB on the card in most states while looking
     * principled.
     *
     * Only a status that actually threatens availability counts. */
    /* MATCH SLEEPER'S ACTUAL VOCABULARY, not the words we assumed it used.
     *
     * This listed `suspended`, but Sleeper writes `Sus` — so a suspended starter
     * never qualified for the exception and his backup stayed priced as a mere
     * duplicate (Cory, war-room audit). Auditing the live board found two more the
     * pattern never covered: `NA` (not active / not with the team) and `DNR` (did
     * not report) — 9 and 2 players respectively on the current board, i.e. 11
     * genuinely unavailable starters whose handcuff was mispriced.
     *
     * The full set Sleeper emits is: Questionable, Doubtful, Out, IR, PUP, Sus,
     * NA, DNR, COV. `Questionable` is deliberately EXCLUDED and the reasoning
     * above still governs — in August it means almost nothing and an exception
     * that fires for everybody is not an exception. Doubtful stays IN: it is a
     * genuine threat to availability.
     *
     * Written as an explicit list rather than a loose "anything not healthy" so a
     * new Sleeper status fails CLOSED (priced as a backup, the conservative side)
     * instead of silently promoting every duplicate. */
    const SERIOUS = /^(out|doubtful|ir|injured[ _-]?reserve|pup|nfi|sus|susp|suspended|na|dnr|cov)$/i;
    if (starter && starter.injury_status && SERIOUS.test(String(starter.injury_status).trim())) {
      return { duplicate: true, discount: 1, exception: 'injury',
        why: pos + '2 — your starter is flagged ' + starter.injury_status
          + '; this is insurance, not a starter' };
    }

    /* THE CAP LANDS HERE, AFTER EVERY EXCEPTION HAS HAD ITS SAY.
     *
     * So it stops the branch REACHING for a third quarterback because the
     * arithmetic favours him, and does not stop the board handing me a top-three
     * player eighty picks past his price, or a handcuff to a starter who is
     * flagged OUT. That is the difference between a ceiling on habitual
     * behaviour and a prohibition, and getting the order wrong is what made the
     * first version refuse the pick it should most want. */
    if (wouldCap) {
      return { duplicate: true, discount: CFG.ONESIE_KEEP, capped: true, exception: null,
        why: pos + (have + 1) + ' — you already carry ' + have + ' at ' + pos
          + ' and start ' + slots + '. He cannot reach the lineup even if one goes '
          + 'down, and he is not an exceptional fall-through.' };
    }

    return { duplicate: true, discount: CFG.ONESIE_KEEP, capped: false, exception: null,
      why: pos + (have + 1) + ' — you cannot start him; priced as a backup' };
  }

  /** Where he ranks at his own position on the CURRENT board. */
  function positionRank(player, ctx) {
    const at = (ctx.board || []).filter(p => p.position === player.position)
      .sort((a, b) => (b.proj_mean || 0) - (a.proj_mean || 0));
    for (let i = 0; i < at.length; i++) {
      if (String(at[i].player_id) === String(player.player_id)) return i + 1;
    }
    return 0;
  }

  /**
   * Does the enrolled doctrine want this player, and by how much?
   *
   * Returns the bonus in composite points (0 when nothing applies). Reads
   * `ctx.doctrine` — the enrolled key — and defers to DraftDoctrine's own
   * LIVE_CONSTRAINTS so the score and the banner cannot disagree about what
   * the plan wants.
   *
   * Deliberately returns a FLAT bonus rather than a proportional one: a
   * proportional tilt scales with the player's own value, which means it grows
   * exactly where the composite is already confident — the opposite of what a
   * tie-breaker should do.
   */
  function doctrineTilt(player, ctx) {
    if (!CFG.DOCTRINE_TILT_ON) return 0;
    var key = ctx && ctx.doctrine;
    if (!key) return 0;
    var DOC = (typeof DraftDoctrine !== 'undefined') ? DraftDoctrine
      : (typeof require !== 'undefined' ? (function () {
          try { return require('./doctrine.js'); } catch (e) { return null; } })() : null);
    if (!DOC || !DOC.LIVE_CONSTRAINTS) return 0;
    if (typeof DOC.prefers !== 'function') return 0;
    var i = pickIndexOf(ctx);
    // PREFERS, not LIVE_CONSTRAINTS: the latter is a legality filter that
    // returns true for nearly everything, so tilting on it differentiates
    // nothing. See the note above PREFERS in doctrine.js.
    // Pass the PLAYER, not just the position: roster-relative expressions like
    // the Chase-stack completion need his team.
    var pref = DOC.prefers(key, player, i, ctx.roster || []);
    if (!pref) return 0;
    return pref * CFG.DOCTRINE_TILT;
  }

  /* Which of MY picks this is (1-based) — LIVE_CONSTRAINTS is written in that
   * coordinate system, not in [live-sequence]. */
  function pickIndexOf(ctx) {
    if (ctx.myPickIndex != null) return Number(ctx.myPickIndex);
    var left = Number(ctx.myPicksLeft);
    var total = Number(ctx.totalMyPicks);
    if (Number.isFinite(left) && Number.isFinite(total)) return total - left + 1;
    if (Number.isFinite(left)) return Math.max(1, 13 - left);   // 12-pick keeper default
    return 1;
  }

  /**
   * TWO-DIRECTIONAL OVERRIDE DISCLOSURE.
   *
   * A DOCTRINE THAT ONLY SPEAKS WHEN IT WINS IS A DOCTRINE YOU CANNOT AUDIT —
   * and worse, it is one that looks effective regardless of whether it is,
   * because every visible instance is a success by selection.
   *
   * So the report is symmetric:
   *   drove  = true   the enrolled plan's preferred player IS the recommendation
   *   drove  = false  it wanted someone else and lost — and then `wanted`,
   *                   `beatenBy` and `margin` say exactly who and by how much
   *
   * The losing candidate has to be RETAINED rather than discarded, which is why
   * this runs over the full scored list rather than inspecting only the winner.
   * That retention is the whole mechanism: without it the loss is unreportable
   * and the doctrine silently becomes a win-only narrator.
   */
  function doctrineReport(scored, ctx) {
    var key = ctx && ctx.doctrine;
    if (!key || !scored.length) return null;

    // The plan's own favourite: the highest-scoring player it actively wants.
    var wanted = null;
    for (var i = 0; i < scored.length; i++) {
      if (doctrineTilt(scored[i].player, ctx) > 0) { wanted = scored[i]; break; }
    }
    var top = scored[0];
    var drove = !!(wanted && String(wanted.player.player_id) === String(top.player.player_id));

    var out = {
      doctrine: key,
      drove: drove,
      // What the plan wanted, ALWAYS — win or lose.
      wanted: wanted ? { player_id: String(wanted.player.player_id),
                         name: wanted.player.name,
                         position: wanted.player.position,
                         score: Math.round(wanted.score * 10) / 10 } : null,
      beatenBy: null,
      margin: null,
      line: null,
    };

    if (drove) {
      out.line = 'the plan drove this pick';
      return out;
    }
    if (!wanted) {
      // A real state, and worth naming rather than rendering blank: the plan
      // has no opinion here, which is different from having lost.
      out.line = 'the plan has no preference at this pick';
      return out;
    }
    out.beatenBy = { player_id: String(top.player.player_id), name: top.player.name,
                     position: top.player.position,
                     score: Math.round(top.score * 10) / 10 };
    out.margin = Math.round((top.score - wanted.score) * 10) / 10;
    out.line = 'the plan wanted ' + wanted.player.name + ' (' + wanted.player.position
      + '); ' + top.player.name + ' beat him by ' + out.margin;
    return out;
  }

  function scorePlayer(player, ctx) {
    const w = Object.assign({}, DEFAULT_WEIGHTS, ctx.weights || {});
    // Pass the full context (not just run multipliers) so the A2 three-layer
    // model reaches VONA. Passing ctx.runMultipliers here silently reduced the
    // primary decision metric to the ADP-only Layer 1.
    const v = vona(player, ctx.board, ctx.nextPick, ctx);
    const tier = tierCliffUrgency(player, ctx.board, ctx.nextPick, ctx);
    const need = starterSlotMarginal(player, ctx.roster || [], ctx.league || {});
    // D3 flex-discount (approved, pre-registered material): a player who ONLY
    // "starts in your flex" is priced at his marginal value over the best
    // flex-eligible alternative realistically available — never full VORP. With 2
    // RB keepers, a 3rd RB in the flex is worth what he adds OVER the next RB I
    // could take, not his whole VORP; this tilts toward filling genuine holes
    // (WR2) over redundant depth. Floored at 0, capped at full VORP.
    if (CFG.FLEX_DISCOUNT && /flex/.test(need.why)) {
      const alt = bestFlexAlt(player, ctx);
      const marginal = Math.min(player.vorp || 0, Math.max(0, (player.vorp || 0) - CFG.FLEX_ALT_WEIGHT * alt));
      need.value = marginal;
      need.why = 'flex depth — marginal over the next flex option';
    }
    // D3b — single-starter empty-slot need: the scarcity marginal is what VONA (`v`)
    // already prices for a one-starter position, so re-crediting full VORP double-counts
    // it. Keep only the residual insurance and let VONA carry the scarcity. See
    // CFG.ONESIE_NEED_DISCOUNT.
    if (CFG.ONESIE_NEED_DISCOUNT && need.fills === 'starter'
        && (((ctx.league || {}).starters || {})[player.position] === 1)) {
      const insurance = (INJURY_RATE[player.position] || 0.15)
        * Math.max(0, player.vorp || 0) * CFG.ONESIE_NEED_INSURANCE;
      need.value = insurance;
      need.why = `fills your empty ${player.position} slot — scarcity priced in value (VONA), not double-counted`;
    }
    // THE ONESIE DUPLICATION DISCOUNT — see CFG.ONESIE_DISCOUNT.
    const onesie = onesieState(player, ctx);
    const risk = riskAdjustment(player);
    const ceiling = upsideBonus(player, ctx.currentPick, ctx.totalPicks, ctx.myPicksLeft, ctx.ceilingAllStages);
    const kov = C.keeperOptionValue(player, ctx);
    const bye = C.byeCollisionPenalty(player, ctx);
    const stack = C.correlationAdjustment(player, ctx);

    // VALUE IS ON A SLIDER NOW.
    //
    // `v` used to enter unweighted, which made it a fixed anchor no control
    // could touch. Measured on the real board at the six picks I actually own,
    // the gap between the top two players was 2.4 to 10.1 points of score,
    // while a slider swing moves its term by a few — so only extreme settings
    // ever flipped a recommendation, and three of the seven sliders (keeper,
    // bye, stack) could not change the top five at ANY setting.
    //
    // A control that cannot move the thing it points at is worse than no
    // control: it teaches you to stop trusting the panel. Putting value on a
    // slider makes value-versus-need an actual trade-off, and turning it down
    // is what gives the other six room to matter.
    //
    // Default stays 1.0, so an untouched panel scores exactly as before.
    // FLOOR THE VALUE WEIGHT.
    //
    // Measured at picks 41/61/81/101 on the real board, value=0 does NOT
    // produce the feared unanchored disaster — every K/DST that reached a top
    // ten tripped a rail at every setting, so the rails hold even when VONA
    // stops anchoring. But it does degrade: seven K/DST in the top ten at pick
    // 81 against five at default. Value zero is a board chasing need and tier
    // with nothing pulling back toward what a player is actually worth.
    //
    // The floor is cheap insurance rather than a fix for an observed break, and
    // saying which it is matters: the slider still reaches 0 in the UI, it just
    // cannot switch the anchor off entirely.
    const wValue = Math.max(CFG.VALUE_WEIGHT_FLOOR, w.value == null ? 1 : w.value);
    // BENCH-ONLY REPRICE (PARKED B→A audit, fixes A/C/E). A player who cannot reach a
    // starting slot — a second QB behind your starter, a filled-position depth piece —
    // is a LOTTERY TICKET, not a scarcity play. VONA (value over the next STARTER) and
    // tier-cliff urgency are meaningless for a man you can't start, yet they were still
    // floating a benched QB2 to #1 once starters filled. So for a bench-only pick we
    // zero the starter-scarcity terms and score him on UPSIDE + handcuff insurance,
    // floored non-negative so a real bench flier never sinks below a discounted backup
    // and the top score never goes deeply negative for rounds on end.
    const benchOnly = need.fills === 'bench';
    // Hoisted so the published components can report the terms the BENCH branch
    // actually used rather than the starter branch's versions of them.
    let wCeilPub = w.ceiling == null ? 1 : w.ceiling;
    let wRiskPub = w.risk == null ? 1 : w.risk;
    let benchCeilingPub = ceiling;
    let score;
    if (benchOnly) {
      // Score a bench pick on upside + handcuff insurance; keeper/bye/risk still
      // participate so depth ranking stays meaningful. No hard floor — flooring
      // flattened the ordering; the reprice alone already keeps the TOP pick positive
      // (it is the highest-ceiling player left), which is what "no negative #1 while
      // upside remains" requires. CFG.BENCH_SCORE_FLOOR only catches pathological lows.
      // THE ANCHOR, FLOORED — see CFG.BENCH_CEILING_FLOOR. Recomputed with the
      // gate open because the branch itself is the lateness condition the
      // global ramp only approximates.
      const benchCeiling = upsideBonus(player, ctx.currentPick, ctx.totalPicks,
        ctx.myPicksLeft, ctx.ceilingAllStages, true);
      const wCeil = Math.max(CFG.BENCH_CEILING_FLOOR, w.ceiling == null ? 1 : w.ceiling);
      const wRisk = Math.max(CFG.BENCH_RISK_FLOOR, w.risk == null ? 1 : w.risk);
      wCeilPub = wCeil; wRiskPub = wRisk; benchCeilingPub = benchCeiling;
      /* ── VONA IS KEPT HERE FROM 2026-08-13, AND THE REASON IS SEMANTIC ──
       *
       * The justification above for zeroing it reads "VONA (value over the next
       * STARTER) ... meaningless for a man you can't start". THAT IS NOT WHAT
       * VONA COMPUTES. `vona()` takes `board.filter(p => p.position === ...)` —
       * EVERY same-position player left on the board, starter and bench alike —
       * and returns proj_mean minus the expected best of them at my next pick.
       * It is "value over the next player at this position I could realistically
       * get instead", which is exactly as meaningful for depth as for a starter.
       *
       * So the branch was discarding the ONE term with an out-of-sample dollar
       * measurement behind it, for the whole back half of every draft, on the
       * strength of a comment that described a different quantity. What was left
       * ranking those picks was the ceiling term — measured at -4.8 with a
       * [-26,+17] interval and unsignable — reinstated by BENCH_CEILING_FLOOR
       * over a MEASURED_WEIGHTS.ceiling of 0.
       *
       * WEIGHT 1.0 ON PRINCIPLE, NOT ON FIT. VONA either means the same thing
       * for a bench player as for a starter or it does not; there is no
       * principled fractional answer, and picking the fraction that makes a
       * symptom look best is calibration against the symptom (Cory's hard rule).
       *
       * MEASURED, full 12-pick walk against the ADP reference:
       *   RB taken          1 -> 5   (market takes 6; this was Stage 1's largest gap)
       *   TE taken          2 -> 1   (market takes 1)
       *   worst reach   +73.7 -> +36.0
       *   reach p90     +36.7 -> +26.0
       *   QB+TE in top 10  33% -> 50%   <-- WORSE, and not explained away below
       *
       * THE CONCERN IN THE ORIGINAL COMMENT IS REAL AND IS NOT FIXED BY THIS.
       * "A benched QB2 floating to #1 once starters filled" still happens. The
       * correctly-aimed instrument for "I cannot start him" is `need`
       * (starterSlotMarginal), which is roster-state aware, implemented, and
       * measured inert at every weight from 0.25 to 2.0. Suppressing it via the
       * value term instead was aiming a blunt instrument at the wrong quantity. */
      score = wValue * v + wCeil * benchCeiling + w.stack * stack.value + w.keeper * kov.value
        + Math.max(0, w.need * need.value)      // handcuff/insurance, never a penalty here
        - Math.max(0, w.bye * bye.value)        // a bench bye still stings a little
        + wRisk * Math.min(0, risk.value);      // real injury/age risk still counts
      // No hard clamp to zero: the top bench pick is the highest-ceiling player
      // left, so scored[0] stays positive on its own (that is all OPEN-1 requires),
      // while keeper/bye/risk keep modulating the depth ranking below it. A clamp
      // here flattened every low-ceiling flier to an identical 0 and erased those
      // signals. CFG.BENCH_SCORE_FLOOR is retained only as a documented knob.
    } else {
      score = wValue * v
        + w.tier * tier
        + w.need * need.value
        + w.risk * risk.value
        + w.ceiling * ceiling
        + w.keeper * kov.value
        - w.bye * bye.value
        + w.stack * stack.value;
    }

    /* THE ONESIE DISCOUNT, applied to the assembled score.
     *
     * Deliberately NOT a need penalty. The need term already reads ~0 for a
     * backup — that was true while the tool was recommending QB2 in round 9 —
     * because VONA, tier urgency and ceiling were still pricing him as though
     * he would play. He will not. So the discount lands on the WHOLE marginal
     * value, which is what "priced as a backup" actually means.
     *
     * Kept multiplicative and applied last so it cannot be argued away by a
     * slider: no weight setting turns a bench QB into a startable one. */
    /* PUBLISHED AS THE DELTA IT CAUSES. It is multiplicative and applied last,
     * so it cannot be an additive term — but it CAN be reported as the number of
     * points it removed, and it must be, or the components do not sum to the
     * score and every share_of_gap downstream is computed against a gap they did
     * not produce. At pick 110 this was a silent -15.23 on a QB2: the surface
     * showed a player whose published terms totalled 16.92 and whose score was
     * 1.69, with nothing naming the 15 points that vanished. */
    let onesieDelta = 0, doctrineDelta = 0;
    if (onesie.duplicate && onesie.discount < 1) {
      const before = score;
      /* ── A DISCOUNT MUST NEVER BE ABLE TO RAISE A SCORE ──────────────────
       *
       * This was `score = score * onesie.discount`, MULTIPLICATIVE ON A SIGNED
       * QUANTITY. For a positive score that buries an unstartable duplicate,
       * which is the intent. FOR A NEGATIVE SCORE IT MOVES TOWARD ZERO — so the
       * mechanism built to bury duplicates was RESCUING THE WORST ONES, and
       * compressing them all into a tight band just below the legitimate picks.
       *
       * Measured at pick 105 before this line changed: SEVEN OF THE TOP TEN were
       * there because the discount lifted them. Juwan Johnson -29.93 -> -2.99
       * (+26.94). Baker Mayfield -23.02 -> -2.30. Every one a duplicate at a
       * position already full, several with VONA below -20 — the board saying
       * plainly that the expected best available at his position next turn is
       * twenty points better, and the discount overriding it.
       *
       * This is why restoring VONA to the bench branch made the QB/TE top-ten
       * share WORSE (33% -> 50%). The two are coupled: while the branch scored
       * on ceiling alone its outputs were mostly positive and the discount
       * worked; once real value entered, duplicates went strongly negative and
       * the sign defect had something to rescue. The regression was not a cost
       * of the VONA fix, it was a latent defect the VONA fix exposed.
       *
       * `Math.min` rather than a sign test: it says the thing itself — the
       * discounted score is taken only when it is genuinely worse. */
      score = Math.min(score, score * onesie.discount);
      onesieDelta = score - before;
    }

    /* THE DOCTRINE TILT. Additive and bounded. It must be SCALED BY THE ONESIE
     * DISCOUNT so the plan cannot rescue a player construction just priced down.
     *
     * Earlier this added the flat tilt AFTER the 0.10 multiply, at full
     * magnitude — which did the OPPOSITE of the stated intent: a +2.5 tilt on a
     * score cut to a tenth is ten times more influential on exactly the
     * unstartable backups the discount was meant to bury (skeptical-review
     * catch, 2026-08-10). Multiplying the tilt by the same discount restores the
     * intent: a discounted onesie's tilt shrinks with the rest of its score, so
     * no plan talks you into a QB2 you cannot start.
     *
     * `doctrineAllows` is the SAME LIVE_CONSTRAINTS predicate the banner uses
     * to name the doctrine's branch, so the surface and the score cannot
     * disagree about what the plan wants. One canonical fact, one derivation.
     *
     * KNOWN LIMIT (not fixed here): the tilt is still a FLAT ±2.5 against a
     * score whose scale shrinks late (a bench composite tops out ~6 pts), so its
     * SHARE of the decision grows in the throwaway rounds. That is a deliberate
     * flat-tiebreaker design (see doctrineTilt), but its late-round dominance is
     * real and is on the agenda, not silently accepted. */
    var tilt = doctrineTilt(player, ctx);
    if (tilt) {
      if (onesie.duplicate && onesie.discount < 1) tilt *= onesie.discount;
      score += tilt;
      doctrineDelta = tilt;   // published, for the same reason the onesie delta is
    }

    const survivalToNext = ctx.nextPick ? survival(player, ctx.nextPick, ctx) : 0;
    /* ── REASON vs CONTEXT — the split that fixes a 51% false-causality rate ───
     *
     * MEASURED 2026-08-13, top 20 at pick 33: **24 of 47 reason strings cited a
     * term whose contribution was ZERO.** need 20 times, tier 4.
     *
     * THE MECHANISM WAS RIGHT HERE AND IT WAS INCONSISTENT GATING. Some lines
     * gated on the WEIGHTED contribution (`w.ceiling * ceiling`, `w.bye *
     * bye.value`) and some gated on the RAW term (`tier > 5`, `need.value > 0`)
     * or on nothing at all (`risk.reasons`). Five of eight terms are weighted to
     * zero, so every raw-gated line published a cause for a term that could not
     * move any decision.
     *
     * THE RULE (SESSION-A): **CONTEXT MAY EXPLAIN THE STATE OF THE BOARD.
     * REASON MUST EXPLAIN THE DECISION.**
     *
     *   KEEP AS REASON   only where the WEIGHTED contribution is non-trivial.
     *   DEMOTE TO CONTEXT  true board facts that did not drive the pick —
     *                      "your TE slot is empty" is worth knowing at pick 41
     *                      and is not why the tool chose him.
     *   DELETE           anything presenting a zeroed term as causal. No
     *                    rephrasing: vaguer wording ("there is a tier
     *                    consideration here") launders the same false causality
     *                    and makes it unfalsifiable.
     */
    const reasons = [];
    const context = [];
    if (w.value * v > 8) reasons.push(`${v.toFixed(0)} pts better than what's left at ${player.position} by pick ${ctx.nextPick}`);
    /* TIER — DELETED as a reason. "last of Tier 1 TE" presented tier position as
     * the cause while `tier` is weighted 0. It survives only where tier actually
     * carries weight; the SURVIVAL half is genuine board context either way. */
    if (w.tier * tier > 5) {
      reasons.push(`last of Tier ${player.tier} ${player.position} — ${Math.round((1 - survivalToNext) * 100)}% gone by your next pick`);
    } else if (tier > 5) {
      context.push(`Tier ${player.tier} ${player.position} is thinning — ${Math.round((1 - survivalToNext) * 100)}% gone by your next pick`);
    }
    /* NEED — DEMOTED. `need.why` is factually true and its best form is the
     * standard this whole rule is modelled on: "fills your empty TE slot —
     * scarcity priced in value (VONA), not double-counted" is honest precisely
     * because it says where the effect actually lives. It is context, not cause,
     * whenever the need term itself is weighted to zero. */
    if (need.value > 0) {
      if (w.need * need.value > 0) reasons.push(need.why);
      else context.push(need.why);
    }
    /* RISK — was pushed UNGATED. Weighted 0 today, so every one of these was a
     * cause for a term contributing nothing. */
    if (w.risk !== 0) risk.reasons.forEach(r => reasons.push(r));
    if (w.ceiling * ceiling > 6) reasons.push(`ceiling ${Math.round(player.proj_ceiling)} — worth the swing here`);
    if (w.keeper * kov.value >= C.CFG.KOV_BADGE_AT) {
      reasons.push(`KEEPER TARGET — ${Math.round(kov.p_keep * 100)}% likely worth keeping next year at this cost`
        + (kov.slots_free
            ? ` (${kov.slots_free} keeper slot${kov.slots_free === 1 ? '' : 's'} still open)`
            : `, and he beats ${kov.displaced || 'your weakest keeper'} for the last slot by `
              + `${Math.round(kov.value)} pts (raw ${Math.round(kov.raw_value)})`));
    }
    if (w.bye * bye.value > 3) reasons.push(`bye collision: ${bye.detail}`);
    // STACK — was also ungated. It carries weight 1.0 today so it genuinely
    // contributes, but gating on the weight is what stops this line becoming the
    // next false cause the day the weight moves.
    if (w.stack !== 0) stack.reasons.forEach(r => reasons.push(r));
    // A onesie duplicate NEVER appears without saying what it is — whether it
    // was discounted or waved through on an exception. This is the difference
    // between a bug and a judgement call the human can overrule.
    if (onesie.duplicate && onesie.why) reasons.unshift(onesie.why);
    if (!reasons.length) reasons.push(`best value on the board at ${player.position}`);

    return {
      player,
      score,
      // `capped` MUST travel with the entry. The demotion reads s.onesie.capped,
      // and the first version of this object did not carry the field — the sink
      // would have been a guard that exists and does not guard, which is the
      // failure class this codebase keeps producing. Caught before it shipped.
      onesie: onesie.duplicate ? { discounted: onesie.discount < 1,
        capped: !!onesie.capped,
        exception: onesie.exception, why: onesie.why } : null,
      components: {
        vona: v,
        tier_urgency: tier,
        need: need.value,
        need_fills: need.fills || 'bench',
        need_why: need.why,
        risk: risk.value,
        ceiling,
        keeper: kov.value,
        bye: -bye.value,
        stack: stack.value,
        keeper_detail: kov,
        bye_detail: bye,
        weighted: {
          // THE VALUE TERM WAS MISSING HERE. `score` is wValue*v + everything
          // else, but only "everything else" was published — so any consumer
          // asking "what moved this player" got the answer minus its LARGEST
          // component. The deviation badge found it: with no value term it
          // could never name our projections as a driver, and therefore could
          // never surface the evidence class that matters most (untested,
          // pending experiment 33).
          value: wValue * v,
          tier: w.tier * tier, need: w.need * need.value,
          /* PUBLISH THE TERM THAT WAS USED, NOT THE ONE THE WEIGHT VECTOR NAMES.
           * The bench branch scores on `max(BENCH_CEILING_FLOOR, w.ceiling)` times
           * a separately recomputed ceiling, while this published
           * `w.ceiling * ceiling` — which is 0 under MEASURED_WEIGHTS. So on every
           * bench pick the components disagreed with the score by up to 25 points,
           * and `share_of_gap` in the decision contract was computed against a gap
           * the components had not produced. Rule 16 broken by ARITHMETIC rather
           * than by wording: the surface was not choosing bad words for a real
           * cause, it was reporting numbers that never summed to the decision. */
          risk: benchOnly ? wRiskPub * Math.min(0, risk.value) : w.risk * risk.value,
          ceiling: benchOnly ? wCeilPub * benchCeilingPub : w.ceiling * ceiling,
          keeper: w.keeper * kov.value, bye: -w.bye * bye.value, stack: w.stack * stack.value,
          // Applied AFTER assembly, so published as deltas rather than as
          // weight-times-term. Without these the components silently disagree
          // with the score for every discounted onesie and every tilted player.
          onesie: onesieDelta, doctrine: doctrineDelta,
        },
      },
      keeper_target: kov.value >= C.CFG.KOV_BADGE_AT,
      survival_to_next: survivalToNext,
      reasons,
      /* CONTEXT — true board facts that did NOT drive the pick. Emitted beside
       * `reasons` rather than mixed into it, so a consumer literally cannot
       * render a board fact where a cause belongs. */
      context,
    };
  }

  /** Rank the whole available board. Returns scored entries, best first. */
  /**
   * Which mandatory starting slots are still empty, and which positions fill them.
   *
   * FLEX is deliberately excluded from "mandatory": it is satisfiable by three
   * positions the composite already chases hard. K and DST are the danger,
   * because their VORP is near zero — StarterSlotMarginal gives an empty slot
   * full VORP, and full VORP of a kicker is nothing. The composite will
   * therefore never prioritise them on its own.
   */
  function mandatoryGaps(ctx) {
    const starters = (ctx.league || {}).starters || {};
    const roster = ctx.roster || [];
    const held = {};
    roster.forEach(p => { held[p.position] = (held[p.position] || 0) + 1; });

    const gaps = [];
    Object.keys(starters).forEach(slot => {
      if (FLEXIBLE_SLOTS.indexOf(slot) !== -1) return;   // FLEX-type, not position-specific
      const need = (starters[slot] || 0) - (held[slot] || 0);
      for (let i = 0; i < need; i++) gaps.push(slot);
    });
    return gaps;
  }
  const FLEXIBLE_SLOTS = ['FLEX', 'SUPER_FLEX', 'REC_FLEX', 'BN', 'IR', 'TAXI'];
  // Picks remaining below which a bye clash stops being something you can
  // still draft your way out of.
  const BYE_SETTLED_AT = 3;

  /**
   * Roster legality endgame — a HARD filter, not a weight.
   *
   * The failure this prevents: with two picks left, no kicker and no defense,
   * the composite happily recommends a fourth wide receiver because his VONA
   * dwarfs a kicker's. The draft ends, the lineup is illegal, and no amount of
   * survival modelling survives that.
   *
   * A weight cannot fix it — a large enough VONA always outvotes a weight. So
   * once remaining picks are down to the number of mandatory holes, candidates
   * are RESTRICTED to positions that fill one. One round earlier, a soft
   * warning, so the choice is still yours.
   */
  function applyRosterLegality(scored, ctx) {
    const gaps = mandatoryGaps(ctx);
    const picksLeft = ctx.myPicksLeft == null ? 99 : ctx.myPicksLeft;
    if (!gaps.length || !scored.length) return { scored, forced: null, warning: null };

    const needed = {};
    gaps.forEach(pos => { needed[pos] = true; });
    const counts = {};
    gaps.forEach(pos => { counts[pos] = (counts[pos] || 0) + 1; });
    const gapLabel = Object.keys(counts)
      .map(pos => (counts[pos] > 1 ? counts[pos] + '\u00d7' : '') + pos).join(', ');

    if (picksLeft <= gaps.length) {
      const eligible = scored.filter(s => needed[s.player.position]);
      if (eligible.length) {
        eligible.forEach(s => {
          s.forced = true;
          s.reasons = ['FORCED — ' + picksLeft + ' pick' + (picksLeft === 1 ? '' : 's')
            + ' left and you still need ' + gapLabel + '. Nothing else can legally start.']
            .concat(s.reasons || []);
        });
        return {
          scored: eligible,
          forced: { picksLeft, gaps, message: 'Forced: ' + picksLeft + ' pick'
            + (picksLeft === 1 ? '' : 's') + ' left, still missing ' + gapLabel + '.' },
          warning: null,
        };
      }
      // No candidate can fill the hole — say so rather than silently ranking.
      return { scored, forced: null,
        warning: 'You still need ' + gapLabel + ' and nobody on the board plays there.' };
    }

    if (picksLeft <= gaps.length + 1) {
      return { scored, forced: null,
        warning: 'Next pick you will be forced — take ' + gapLabel
          + ' now if you want a choice.' };
    }
    return { scored, forced: null, warning: null };
  }

  /**
   * Format-derived defaults (Part 3 §7).
   *
   * The composite's constants were reasoned for a 12-team league. Ten teams
   * with three keepers is a different game, and several defaults are simply
   * wrong for it — but hand-setting new ones would break again the moment the
   * league changes shape, so they are DERIVED from team count and keeper count.
   *
   * The driver is how much talent actually leaves the pool before the draft
   * and how deep the draft goes. With 10 teams x 3 keepers only 30 players are
   * gone, so replacement level sits high and the waiver wire stays stocked all
   * season. Two consequences follow, and both are real strategy changes:
   *
   *   Bench depth is worth much less. A bench player you are stashing is
   *   competing against a waiver wire that keeps producing startable options,
   *   so the 0.35 discount is too generous — nearer 0.20 in this format.
   *   Handcuffs are close to worthless for the same reason.
   *
   *   VORP spreads compress, so VONA matters more relative to VORP. Positional
   *   scarcity is weaker everywhere except genuinely elite TE and QB.
   *
   * (The FAAB consequence in the source spec does not apply — this league runs
   * waiver priority, confirmed by zero bid amounts across 1,091 historical
   * transactions.)
   */
  function formatDefaults(league) {
    const teams = (league && league.teams) || 12;
    const keepers = ((league && league.keeper_rules) || {}).count || 0;
    const starters = (league && league.starters) || {};
    const startersPerTeam = Object.keys(starters)
      .reduce((n, k) => n + (starters[k] || 0), 0) || 9;

    // Two independent forces, and it matters that they are separated. An
    // earlier version divided (teams x keepers) by (teams x starters), which
    // cancels the team count entirely — a 14-team league scored identically to
    // a 10-team one. The test caught it.
    //
    //   scarcity  — more teams competing for the same NFL player pool means a
    //               thinner wire and a bench that is worth more
    //   relief    — keepers shorten the draft, so more talent goes undrafted
    //               and the wire stays richer, making the bench worth less
    const scarcity = teams / 12;                                  // 1.0 at the baseline
    const relief = keepers / Math.max(1, startersPerTeam);          // 0 at redraft
    const benchDiscount = Math.max(0.15, Math.min(0.45,
      0.35 * scarcity - 0.35 * relief));
    const lockedAway = teams * keepers;

    return {
      teams, keepers, startersPerTeam,
      locked_away: lockedAway,
      scarcity: Number(scarcity.toFixed(3)),
      keeper_relief: Number(relief.toFixed(3)),
      BENCH_DISCOUNT: Number(benchDiscount.toFixed(3)),
      // Streaming is worth more when a startable option is always available, so
      // the positions you can stream get pushed later.
      STREAMABLE_LATE: teams <= 10 ? ['QB', 'TE', 'K', 'DEF'] : ['K', 'DEF'],
      why: teams <= 10
        ? teams + ' teams and ' + keepers + ' keepers: only ' + lockedAway
          + ' players leave the pool, so replacement level is high, the wire stays '
          + 'stocked, and bench depth is worth ' + Math.round(benchDiscount * 100)
          + '% of a starter upgrade rather than 35%.'
        : teams + '-team league: defaults unchanged.',
    };
  }

  /** Apply format-derived defaults to the live config. Idempotent. */
  function applyFormatDefaults(league) {
    const f = formatDefaults(league);
    CFG.BENCH_DISCOUNT = f.BENCH_DISCOUNT;
    return f;
  }

  /**
   * Onesie demotion. A rail-flagged K/DST is the least trustworthy thing on the
   * board — a confident kicker at the top of the list is precisely the bug the
   * rails exist to catch (the codebase has shipped confident nonsense three
   * times). Sink every rail-flagged K/DST below the last unflagged player so it
   * can never sit in ranked position. Done here in the engine, on the list
   * `recommend` returns, so the app and the robot mock see the SAME order —
   * a display-only sort would let the robot draft a kicker the human never sees
   * offered. Forced endgame K/DST carry no rail flag (see plausibilityRails'
   * `!entry.forced`) and are never demoted — a legal lineup still needs one.
   * Stable: the kept group keeps its score order, the sunk group keeps theirs.
   */
  function demoteFlaggedOnesies(scored) {
    const isFlaggedOnesie = s =>
      ((s.player.position === 'K' || s.player.position === 'DEF')
        && !s.forced && s.rails && s.rails.length > 0)
      // A CAPPED ONESIE SINKS TOO, and for a stronger reason than a rail: the
      // rail says "this looks wrong", the cap says "he cannot start". Sinking
      // rather than scoring is the point — a multiplicative discount could not
      // express never, which is why the cap exists at all.
      || (s.onesie && s.onesie.capped && !s.forced);
    let anySunk = false;
    const keep = [];
    const sink = [];
    scored.forEach(s => {
      if (isFlaggedOnesie(s)) { s.demoted = true; sink.push(s); anySunk = true; } else { keep.push(s); }
    });
    return anySunk ? keep.concat(sink) : scored;
  }

  /**
   * Rail-fire budget (item 2 fix 2), pure so it is testable and identical
   * wherever it runs. A rail flags a number the engine thinks is a bug. One in
   * the top options is a judgement call; more than `budget` is a pattern that
   * indicts the whole board. This counts the flagged players in the top `topN`
   * and reports which are acknowledged for THIS build. An acknowledgement is
   * tied to the exact build and flag set via the signature, so a rebuild or a
   * changed flag set silently invalidates it — you cannot wave through a fire
   * you never saw. No DOM, no state: caller passes the scored list and acks.
   */
  function railFireSig(builtAt, id, flags) {
    return String(builtAt == null ? '?' : builtAt) + '|' + id + '|'
      + (flags || []).slice().sort().join('¦');
  }
  function computeRailBudget(scored, opts) {
    opts = opts || {};
    const budget = opts.budget == null ? 2 : opts.budget;
    const topN = opts.topN == null ? 15 : opts.topN;
    const acks = opts.acks || {};
    const builtAt = opts.builtAt;
    const fires = (scored || []).slice(0, topN)
      .filter(s => s.rails && s.rails.length)
      .map(s => {
        const id = String(s.player.player_id);
        const sig = railFireSig(builtAt, id, s.rails);
        const ack = acks[id];
        return { id, name: s.player.name, position: s.player.position,
          flags: s.rails.slice(), sig, acked: !!(ack && ack.sig === sig), ack: ack || null };
      });
    const unacked = fires.filter(f => !f.acked);
    return { fires, count: fires.length, budget, topN,
      overBudget: fires.length > budget, unacked, allAcked: unacked.length === 0 };
  }

  /* THE CRUDE STAGE 2 CAP — evidence-gated deviation, pre-registered.
   *
   * OFF unless CFG.STAGE2_CAP. When on: a candidate keeps its deviation-boosted
   * composite score only if its EARNED evidence — material drivers classed
   * structural/moderate/validated (need, ceiling), summed absolute points — clears
   * CFG.STAGE2_CAP_T. Otherwise it is scored at its consensus baseline (score minus
   * ALL material driver contributions), which strips the untested-`value` and weak
   * boosts and pulls the pick back toward market/VONA order.
   *
   * Rule, threshold and predictions are fixed in STAGE2-CAP-PREREG.md BEFORE the
   * measurement. This is crude by intent (a hard bar, not proportional scaling) —
   * a real anchor we can measure now, not the elegant fake of a post-hoc re-sort.
   */
  function applyStage2Cap(scored) {
    if (!CFG.STAGE2_CAP) return scored;
    const DEV = (typeof DraftDeviation !== 'undefined') ? DraftDeviation
      : (typeof require === 'function' ? require('./deviation.js') : null);
    if (!DEV || typeof DEV.drivers !== 'function') return scored;
    const EARNED = { structural: true, moderate: true, validated: true };
    scored.forEach(s => {
      const drivers = DEV.drivers((s.components || {}).weighted);
      let earned = 0, allMaterial = 0;
      drivers.forEach(d => {
        allMaterial += d.points;                       // signed
        if (EARNED[d.klass]) earned += Math.abs(d.points);
      });
      s.stage2_earned = earned;
      s.stage2_capped = earned >= CFG.STAGE2_CAP_T ? s.score : (s.score - allMaterial);
      s.stage2_held = earned < CFG.STAGE2_CAP_T;       // reverted toward consensus
    });
    scored.sort((a, b) => b.stage2_capped - a.stage2_capped);
    return scored;
  }

  /* Same-tier / same-position TIEBREAKER (Cory's model): projections+VONA+tiers set
   * the order; when two players are the SAME position AND SAME tier AND their scores
   * are within TIE_THRESHOLD, lean to the higher ceiling — in this league a coin-flip
   * between equals goes to the one with more weekly-high upside. Bounded to genuine
   * near-ties, so it never overrides a real value gap. */
  function applyCeilingTiebreak(list) {
    if (!CFG.CEILING_TIEBREAK) return list;
    const cap = (p) => (p.proj_ceiling != null ? p.proj_ceiling : (p.proj_mean || 0));
    for (let pass = 0; pass < 3; pass++) {
      let swapped = false;
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i].player, b = list[i + 1].player;
        if (a.position === b.position && (a.tier || 0) === (b.tier || 0)
            && Math.abs(list[i].score - list[i + 1].score) < CFG.TIE_THRESHOLD
            && cap(b) > cap(a)) {
          const t = list[i]; list[i] = list[i + 1]; list[i + 1] = t; swapped = true;
        }
      }
      if (!swapped) break;
    }
    return list;
  }

  function recommend(ctx) {
    // Position scales BEFORE anything is scored — upsideBonus reads them.
    _ceilingScales = computeCeilingScales(ctx.board);
    const all = ctx.board.map(p => scorePlayer(p, ctx));
    all.sort((a, b) => b.score - a.score);
    applyCeilingTiebreak(all);   // same-tier/same-position near-ties lean to higher ceiling
    // Stage 2 anchor (crude, pre-registered, OFF by default) reorders BEFORE
    // legality/rails so those still apply to the anchored order.
    applyStage2Cap(all);

    const legality = applyRosterLegality(all, ctx);
    // Rails first — they decide who gets demoted. Computed against the
    // score-sorted list so the runaway check still fires on the top score.
    legality.scored.forEach(s => { s.rails = plausibilityRails(s, ctx, legality.scored); });
    const scored = demoteFlaggedOnesies(legality.scored);

    // Flag when the top candidates are close enough that Monte Carlo should break the tie.
    // Computed AFTER demotion so "contested" compares the two real players a
    // human would actually weigh, never a real player against a sunk kicker.
    if (scored.length > 1) {
      const gap = scored[0].score - scored[1].score;
      scored[0].contested = gap < CFG.TIE_THRESHOLD;
      scored[0].gap_to_second = gap;
    }
    if (scored.length) {
      scored[0].legality = legality.forced || null;
      scored[0].legality_warning = legality.warning || null;
      scored[0].doctrine_report = doctrineReport(scored, ctx);
    }
    return scored;
  }

  /**
   * The whole answer for one pick: the list, how much to trust it, and what
   * each of the top options costs you at your next pick.
   *
   * One call rather than three so the on-the-clock view cannot accidentally
   * render a recommendation from one board and a forecast from another.
   */
  function onTheClock(ctx, lists) {
    let scored = recommend(ctx);
    scored = applyPersonalLists(scored, lists);
    // Personal lists reorder, so contested/gap have to be recomputed against
    // the list you are actually looking at.
    if (scored.length > 1) {
      const gap = scored[0].score - scored[1].score;
      scored[0].contested = gap < CFG.TIE_THRESHOLD;
      scored[0].gap_to_second = gap;
    }
    const top = scored.slice(0, 3);
    return {
      scored,
      confidence: confidence(scored),
      branches: top.map(e => branchForecast(e, ctx)).filter(Boolean),
    };
  }

  /**
   * The shape of the rest of your draft.
   *
   * Halfway through, the useful question stops being "who is best" and becomes
   * "how many picks do I actually have spare". Two picks left with a kicker and
   * a defence still to fill is not a draft, it is an arithmetic problem, and
   * you want to know that three rounds before it becomes one.
   */
  function rosterPlan(ctx) {
    const gaps = mandatoryGaps(ctx);
    const picksLeft = ctx.myPicksLeft == null ? 0 : ctx.myPicksLeft;
    const starters = (ctx.league || {}).starters || {};
    const roster = ctx.roster || [];
    const held = {};
    roster.forEach(p => { held[p.position] = (held[p.position] || 0) + 1; });

    // FLEX is separate: it is satisfiable three ways, so it is a claim on a
    // pick without being a claim on a position.
    let flexNeed = 0;
    Object.keys(starters).forEach(slot => {
      if (FLEXIBLE_SLOTS.indexOf(slot) === -1 || slot === 'BN' || slot === 'IR' || slot === 'TAXI') return;
      const surplus = ['RB', 'WR', 'TE'].reduce((n, pos) =>
        n + Math.max(0, (held[pos] || 0) - (starters[pos] || 0)), 0);
      flexNeed += Math.max(0, (starters[slot] || 0) - surplus);
    });

    const need = {};
    gaps.forEach(g => { need[g] = (need[g] || 0) + 1; });
    const needed = Object.keys(need).map(pos => ({ position: pos, count: need[pos] }));
    const mustSpend = gaps.length + flexNeed;
    const spare = picksLeft - mustSpend;

    let message;
    if (!picksLeft) message = 'Draft over.';
    else if (mustSpend === 0) {
      message = picksLeft + ' picks left and every starting slot is filled. All of it is upside from here.';
    } else if (spare < 0) {
      message = picksLeft + ' picks left but ' + mustSpend + ' slots still to fill. '
        + 'Something has to give — you will be starting someone off waivers.';
    } else if (spare === 0) {
      message = picksLeft + ' picks left and ' + mustSpend + ' slots to fill. '
        + 'Every remaining pick is spoken for.';
    } else {
      message = picksLeft + ' picks left, ' + mustSpend + ' still needed. '
        + spare + (spare === 1 ? ' pick is' : ' picks are') + ' genuinely free.';
    }
    return { needed, flexNeed, mustSpend, picksLeft, spare, message,
             tight: spare <= 0 && picksLeft > 0 };
  }

  /**
   * Bye weeks, and the weeks they actually cost you something.
   *
   * A bye clash only matters if it leaves you unable to FIELD a position — two
   * backup receivers off in the same week is a non-event, and colouring it red
   * teaches people to ignore the colour. So the flag is not "how many are out",
   * it is "how many can you still start".
   */
  function byeGrid(ctx) {
    const roster = ctx.roster || [];
    const starters = (ctx.league || {}).starters || {};
    const byWeek = {};
    roster.forEach(p => {
      if (!p.bye) return;
      (byWeek[p.bye] || (byWeek[p.bye] = [])).push(p);
    });

    return Object.keys(byWeek).map(Number).sort((a, b) => a - b).map(week => {
      const out = byWeek[week];
      const shorts = [];
      Object.keys(starters).forEach(pos => {
        if (FLEXIBLE_SLOTS.indexOf(pos) !== -1) return;
        const need = starters[pos] || 0;
        if (!need) return;
        const away = out.filter(p => p.position === pos).length;
        // A position with nobody on bye that week is not a bye problem, and a
        // position you have not drafted yet is a ROSTER problem — that is what
        // the plan above is for. Flagging both here turns the grid into a wall
        // of red in round three, which teaches people to ignore the colour.
        if (!away) return;
        const have = roster.filter(p => p.position === pos).length;
        const left = have - away;
        if (left < need) shorts.push({ position: pos, need, available: left });
      });
      // In round three you hold two running backs, so ANY running-back bye
      // reads as a hole — and it is not one, because you have six picks left to
      // fill it. A clash is only real once you are nearly out of picks. Until
      // then it is provisional, and the UI says so instead of shouting.
      const picksLeft = ctx.myPicksLeft == null ? 0 : ctx.myPicksLeft;
      const provisional = shorts.length > 0 && picksLeft > BYE_SETTLED_AT;
      return {
        week, players: out, shorts, provisional,
        severity: !shorts.length ? (out.length >= 4 ? 'warn' : 'ok')
          : provisional ? 'warn' : 'bad',
      };
    });
  }

  /**
   * How much to trust the top recommendation, in words.
   *
   * The engine can always sort. What it cannot always do is tell you the sort
   * MEANT anything — and on the clock, "these two are a coin flip, take the one
   * you like" is a more useful sentence than a confident number that happens to
   * be 0.3 points ahead. Every draft tool that loses trust loses it on a pick
   * it was loudly certain about.
   */
  function confidence(scored) {
    if (!scored.length) return { level: 'none', gap: 0, message: 'Board is empty.' };
    if (scored.length === 1) {
      return { level: 'clear', gap: Infinity, message: 'Only one legal option.' };
    }
    const gap = scored[0].score - scored[1].score;
    const a = scored[0].player, b = scored[1].player;
    // A NEGATIVE gap means the shown #1 is a PINNED personal-list pick scoring
    // BELOW the board's own top — not a coin flip, and a distance is never
    // negative (2026-08-10 critique: "score within -1.9"). Say what is true.
    if (gap < 0) {
      return {
        level: 'pinned', gap,
        message: a.name + ' is your pick, but the board scores ' + b.name + ' '
          + Math.abs(gap).toFixed(1) + ' higher — keep him on purpose, or take ' + b.name + '.',
      };
    }
    if (gap < CFG.COIN_FLIP_GAP) {
      return {
        level: 'coin-flip', gap,
        message: 'Coin flip: ' + a.name + ' and ' + b.name + ' score within '
          + gap.toFixed(1) + '. Take whichever you like — the board cannot separate them.',
      };
    }
    if (gap < CFG.CLOSE_GAP) {
      return {
        level: 'close', gap,
        message: 'Close: ' + a.name + ' is ahead of ' + b.name + ' by only '
          + gap.toFixed(1) + '. A real preference should override this.',
      };
    }
    return {
      level: 'clear', gap,
      message: a.name + ' is clearly ahead — ' + gap.toFixed(1) + ' points over ' + b.name + '.',
    };
  }

  /**
   * What your next pick looks like if you take this player now.
   *
   * The decision on the clock is never "who is best" in the abstract, it is
   * "who is best given what I can still get later". Taking the RB is right if
   * the WR you want survives the round trip and wrong if he does not, and that
   * is a different question from which of them scores higher today.
   *
   * Returns the expected best VORP still on the board at your next pick, by
   * position, and flags positions that fall off a cliff in between.
   */
  function branchForecast(entry, ctx) {
    const next = ctx.nextPick;
    if (!next || !ctx.board || !ctx.board.length) return null;

    // Everything except the player you would be taking.
    const remaining = ctx.board.filter(p => p.player_id !== entry.player.player_id);
    const avail = remaining.map(p => survival(p, next, ctx));
    const at = S.expectedBestByPos(remaining, avail);
    // Same measure right now, so "what does waiting cost" is a subtraction
    // rather than a number you have to hold two of in your head.
    const now = S.expectedBestByPos(remaining, remaining.map(() => 1));

    const rows = Object.keys(at).map(pos => ({
      position: pos,
      now: now[pos] || 0,
      at_next: at[pos] || 0,
      loss: Math.max(0, (now[pos] || 0) - (at[pos] || 0)),
    })).sort((x, y) => y.loss - x.loss);

    return { pick: next, taking: entry.player.name, rows };
  }

  /**
   * THE PATHS PANEL (Part 2 §1) — turn the flat top-N into 2–4 coherent
   * DIRECTIONS. Deterministic, derived entirely from the already-scored board:
   * no new model, no randomness, so a path set reproduces exactly.
   *
   *   1. take the top PATHS_POOL by composite score
   *   2. cluster them by DIRECTION = position, split into a "cliff" vs "value"
   *      flavour by the leader's tier-urgency (position × tier-urgency, the two
   *      axes the spec names; branch consequence then colours when-it's-right)
   *   3. a direction QUALIFIES only if its best candidate is within PATHS_BAND of
   *      the top composite score — beyond that it is not a solid direction
   *   4. price every path vs the top path (never hidden), name it in plain
   *      language, and generate the one-line "when it's right" from live state
   *   5. cap at PATHS_MAX; flag a path-level coin flip when the top two price
   *      within COIN_FLIP_GAP
   *
   * Returns [] when the board is empty. The caller renders these as cards and
   * logs which path a pick came from; picking off every path is an override.
   */
  /** Surname only — path names are read at a glance on the clock. */
  function lastName(player) {
    const n = String((player && player.name) || '').trim();
    if (!n) return 'him';
    const parts = n.split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : n;
  }

  function computePaths(ctx, scored) {
    const list = (scored && scored.length ? scored : recommend(ctx)) || [];
    if (!list.length) return [];
    const pool = list.slice(0, CFG.PATHS_POOL);
    const topScore = pool[0].score;

    // Cluster by (position × cliff/value flavour). The leader of each cluster is
    // its best-scoring member; flavour is decided by that leader's tier urgency.
    const clusters = {};
    const order = [];
    pool.forEach(entry => {
      const pos = entry.player.position;
      const urgent = ((entry.components || {}).tier_urgency || 0) >= CFG.PATHS_CLIFF_URGENCY;
      const key = pos + (urgent ? ':cliff' : ':value');
      if (!clusters[key]) { clusters[key] = { key: key, pos: pos, cliff: urgent, members: [] }; order.push(key); }
      clusters[key].members.push(entry);
    });

    // Qualify + build. A cluster's score is its best member's score.
    const paths = order.map(key => clusters[key]).filter(c => c.members[0].score >= topScore - CFG.PATHS_BAND);
    paths.sort((a, b) => b.members[0].score - a.members[0].score);
    const chosen = paths.slice(0, CFG.PATHS_MAX);
    const bestScore = chosen.length ? chosen[0].members[0].score : topScore;

    const named = chosen.map((c, i) => {
      const lead = c.members[0];
      const need = (lead.components || {}).need || 0;
      const branch = branchForecast(lead, ctx);
      // A path's own position loss between now and my next pick — the branch
      // consequence axis. High loss = the cliff is real (take it now); low loss
      // = the value will fall (you can wait), which colours when-it's-right.
      const posRow = branch ? (branch.rows.find(r => r.position === c.pos) || null) : null;
      const posLoss = posRow ? posRow.loss : 0;

      // PATH NAMES STATE THEIR MECHANISM (mock-#1 fix #2). "Fill RB now" and
      // "Lock the last elite RB" read as contradictory when they are two valid
      // RB strategies; naming the mechanism makes the difference legible.
      //
      // And the name reads the SLOT STATE, never the need MAGNITUDE (fix #1).
      // A second TE can be a legitimate flex or value play — it may never be
      // called "filling" a slot that is already full.
      const fills = (lead.components || {}).need_fills || 'bench';
      const tierNo = lead.player.tier != null ? lead.player.tier : null;
      let name, mechanism;
      if (c.cliff) {
        name = 'Tier cliff — last of' + (tierNo != null ? ' Tier ' + tierNo : ' his tier')
          + ', ' + lastName(lead.player);
        mechanism = 'scarcity';
      } else if (fills === 'starter') {
        name = 'Fill ' + c.pos + ' now — ' + lastName(lead.player);
        mechanism = 'need';
      } else if (fills === 'flex') {
        name = c.pos + ' for the flex — ' + lastName(lead.player);
        mechanism = 'flex';
      } else {
        /* "OUR MODEL", not "value" — needrule renders a card on the same screen
         * whose lead used to read "best flex-eligible VALUE", and that one ranks
         * by ADP. One word for a market price and a model estimate, on two cards
         * that disagree 11 times in 12. */
        name = 'Best ' + c.pos + ' by OUR MODEL — ' + lastName(lead.player);
        mechanism = 'value';
      }

      let whenRight;
      if (c.cliff) {
        // A cliff is a cliff because the TIER empties after the leader — often
        // there is little comparable left to lose downstream (that IS the cliff),
        // so justify from the tier drop, not a possibly-zero branch loss.
        whenRight = 'right if you believe the ' + c.pos + ' cliff — he is the last of his tier and '
          + 'the quality drop after him is the steepest at the position';
      } else if (posLoss >= 8) {
        whenRight = 'right if you believe the ' + c.pos + ' cliff — the drop to your next pick is ~'
          + Math.round(posLoss) + ' pts';
      } else if (posLoss <= 2) {
        whenRight = 'right if you trust the room to keep passing on ' + c.pos
          + ' — the value should still be there next turn';
      } else {
        whenRight = 'right if you want ' + c.pos + ' certainty now over ~' + Math.round(posLoss)
          + ' pts of downside risk by waiting';
      }

      return {
        key: c.key,
        name: name,
        mechanism: mechanism,
        fills: fills,
        position: c.pos,
        cliff: c.cliff,
        // `components` rides along: the DEVIATION BADGE needs the per-term
        // breakdown to say what bought the distance, and a slimmed projection
        // silently starved it — the badge rendered with "no single term carries
        // this" on every card, which reads like a finding and was a plumbing
        // gap.
        pick: { player: lead.player, score: lead.score,
                components: lead.components,
                why: (lead.reasons || [])[0] || '' },
        candidates: c.members.map(m => ({ player: m.player, score: m.score })),
        plan: branch ? branch.rows.slice(0, 2) : [],
        next_pick: branch ? branch.pick : null,
        price: Math.round((bestScore - c.members[0].score) * 10) / 10,   // >= 0; 0 for the top path
        when_right: whenRight,
        is_top: i === 0,
      };
    });

    // Path-level coin flip: the top two directions price within the gap.
    if (named.length > 1 && (named[1].price) < CFG.COIN_FLIP_GAP) {
      named[0].coin_flip_with = named[1].key;
      named[1].coin_flip_with = named[0].key;
    }
    // SAME POSITION, DIFFERENT LOGIC. Two paths at one position must say WHY
    // they differ — that is the mock-#1 complaint: they read as disagreeing
    // when they are two valid strategies at the same position.
    const byPos = {};
    named.forEach(p => { (byPos[p.position] = byPos[p.position] || []).push(p); });
    Object.keys(byPos).forEach(pos => {
      const group = byPos[pos];
      if (group.length < 2) return;
      const kinds = group.map(p => p.mechanism);
      group.forEach(p => {
        const others = kinds.filter((k, i) => group[i] !== p);
        p.distinction = 'same position, different logic: ' + p.mechanism
          + ' vs ' + others.join('/');
      });
    });

    return named;
  }

  /**
   * B7 — a player's crude v1 E[$] estimate, decomposed. ROUGH by design: it turns
   * projection SHAPE into dollars until September's quantile model makes E[$]
   * exact. Boom capacity (ceiling over mean) buys weekly-high lottery tickets;
   * the mean buys top-4-entry equity and RS equity. Coefficients are placeholders
   * calibrated only for RELATIVE comparison — never presented without a confidence
   * class. Returns {high, entry, rs, total} in dollars.
   */
  function playerDollars(p) {
    const mean = p.proj_mean || 0;
    const ceil = p.proj_ceiling != null ? p.proj_ceiling : mean;
    const boom = Math.max(0, ceil - mean);        // upside points — weekly-high fuel
    const high = CFG.DG_HIGH_K * boom;            // weekly-high equity
    const entry = CFG.DG_ENTRY_K * mean;          // top-4-entry equity (floor/consistency)
    const rs = CFG.DG_RS_K * mean;                // regular-season equity
    return { high: high, entry: entry, rs: rs, total: high + entry + rs };
  }

  /**
   * THE DOLLAR GAP (Part 2 §1/B7) — "which of these two makes me more money?",
   * the single most prominent figure in any comparison. Returns the projected
   * E[$] difference A−B, DECOMPOSED (high-pool $ / top-4-entry $ / next-pick echo
   * $), each a rough v1 estimate. HONESTY RAILS baked in: a `confidence` class of
   * 'rough' always (v1), and a gap inside the noise band reports `even_money:true`
   * with the "even money — pick your guy" verdict rather than a fake number. The
   * `terms` field is the auditable derivation the Why? panel expands.
   *
   * next-pick echo: taking A instead of B costs you the best-available at B's
   * position at your next pick (the two-pick math, not just this pick) — read off
   * the branch forecast's position loss when a ctx is supplied.
   */
  function dollarGap(a, b, ctx) {
    const da = playerDollars(a), db = playerDollars(b);
    // Next-pick echo: what taking A costs in best-available-at-B's-position by my
    // next pick, minus the symmetric cost of taking B. Positive favors A.
    let echo = 0, echoTerms = null;
    if (ctx && ctx.nextPick && ctx.board && ctx.board.length) {
      const fa = branchForecast({ player: a }, ctx);
      const fb = branchForecast({ player: b }, ctx);
      const lossAt = (f, pos) => {
        if (!f) return 0;
        const row = f.rows.find(r => r.position === pos);
        return row ? row.loss : 0;
      };
      // Taking A leaves B's position exposed at next pick (cost), and vice-versa.
      const costOfA = lossAt(fa, b.position);
      const costOfB = lossAt(fb, a.position);
      echo = CFG.DG_ECHO_K * (costOfB - costOfA);
      echoTerms = { cost_of_taking_A: Math.round(costOfA * 10) / 10,
                    cost_of_taking_B: Math.round(costOfB * 10) / 10 };
    }
    const high = da.high - db.high;
    const entry = da.entry - db.entry;
    const rs = da.rs - db.rs;
    const total = (high + entry + rs) + echo;
    const round1 = x => Math.round(x * 10) / 10;
    const even = Math.abs(total) < CFG.DG_NOISE_BAND;
    const leader = total >= 0 ? a : b;
    return {
      total: round1(total),
      high: round1(high),
      entry: round1(entry),
      echo: round1(echo),
      rs: round1(rs),
      leader: even ? null : (leader.name || leader.player_id),
      even_money: even,
      confidence: 'rough',              // v1 — quantile-V upgrades this in September
      band: CFG.DG_NOISE_BAND,
      verdict: even ? 'even money — pick your guy'
        : (leader.name || 'A') + ' +$' + Math.abs(Math.round(total)) + ' this pick',
      terms: {
        A: { name: a.name, dollars: { high: round1(da.high), entry: round1(da.entry), rs: round1(da.rs) } },
        B: { name: b.name, dollars: { high: round1(db.high), entry: round1(db.entry), rs: round1(db.rs) } },
        echo: echoTerms,
        note: 'v1 rough estimate from projection shape (boom capacity vs mean); quantile-V makes this exact in September.',
      },
    };
  }

  /**
   * What a manager's own draft history says about him, in English.
   *
   * The profiles have been feeding the survival model since A1 — alpha_need and
   * beta_value shape every positional distribution, reach_delta widens the
   * softmax for a reacher. All of that has been true and completely invisible.
   * A number that moves a recommendation you cannot see is a number you cannot
   * argue with, and the whole promise of this tool is "explain, don't just
   * rank".
   *
   * Thresholds live in CFG because every one of them is a judgement call about
   * how much evidence earns a sentence. Under them we say nothing, which is the
   * right answer far more often than people building these expect.
   *
   * Everything here is already shrunk toward the league average by managers.py,
   * so a single draft cannot produce a confident tell. `sample_size` is
   * reported anyway — three drafts is three drafts, however it is phrased.
   */
  function managerTells(profile) {
    if (!profile) return [];
    const out = [];
    const n = profile.sample_size || 0;

    // Positional timing: the most useful single fact about an opponent. Negative
    // vs_league means EARLIER than the league — managers.py measures mean round.
    const timing = profile.positional_timing || {};
    Object.keys(timing).forEach(pos => {
      const t = timing[pos] || {};
      const d = t.vs_league;
      if (d == null || Math.abs(d) < CFG.TELL_TIMING_ROUNDS) return;
      out.push({
        kind: 'timing', position: pos,
        weight: Math.abs(d),
        text: d < 0
          ? 'takes ' + pos + ' about ' + Math.abs(d).toFixed(1) + ' rounds earlier than the league'
          : 'waits about ' + d.toFixed(1) + ' rounds longer than the league on ' + pos,
        detail: 'his average ' + pos + ' comes off in round ' + (t.mean_round || 0).toFixed(1),
      });
    });

    // Reaching. Proxy-flagged metrics say so, because a manager who drafted a
    // player who later busted looks like a reacher purely in hindsight.
    const rd = profile.reach_delta || {};
    if (rd.mean != null && Math.abs(rd.mean) >= CFG.TELL_REACH_PICKS) {
      out.push({
        kind: 'reach', weight: Math.abs(rd.mean) / 2,
        // Relative to this league, not to raw ADP: keepers pull every pick
        // "ahead of market" by construction, so the absolute figure is a
        // shared offset rather than anything about him.
        text: rd.mean > 0
          ? 'reaches ' + rd.mean.toFixed(1) + ' picks earlier than the rest of the league'
          : 'lets value come to him — ' + Math.abs(rd.mean).toFixed(1)
            + ' picks later than the rest of the league',
        detail: rd.proxy ? 'measured against today\'s ranks, not the ADP of the day — treat as a hint'
                         : 'measured against that season\'s real ADP',
        proxy: !!rd.proxy,
      });
    }

    // Best-available vs need.
    const bpa = profile.bpa_vs_need || {};
    if (bpa.bpa_rate != null && bpa.league_rate != null
        && Math.abs(bpa.bpa_rate - bpa.league_rate) >= CFG.TELL_BPA_GAP) {
      const hi = bpa.bpa_rate > bpa.league_rate;
      out.push({
        kind: 'bpa', weight: Math.abs(bpa.bpa_rate - bpa.league_rate) * 5,
        text: hi ? 'drafts best-available and ignores his holes'
                 : 'drafts for need — he fills slots before he takes value',
        detail: Math.round(bpa.bpa_rate * 100) + '% best-available vs '
          + Math.round(bpa.league_rate * 100) + '% league',
        proxy: !!bpa.proxy,
      });
    }

    // Homer. Cheap to compute, disproportionately useful — it is the one tell
    // people will confirm out loud at the table.
    const h = profile.homer_index || {};
    if (h.team && h.rate != null && h.rate >= CFG.TELL_HOMER_RATE) {
      out.push({
        kind: 'homer', weight: h.rate * 3, team: h.team,
        text: 'homer for ' + h.team + ' — ' + Math.round(h.rate * 100) + '% of his picks',
        detail: 'expect him to take a ' + h.team + ' player above where you would',
      });
    }

    // Rookies.
    const r = profile.rookie_affinity || {};
    if (r.rate != null && r.league_rate != null && r.rate >= r.league_rate * CFG.TELL_ROOKIE_RATIO
        && r.rate >= CFG.TELL_ROOKIE_FLOOR) {
      out.push({
        kind: 'rookie', weight: (r.rate - r.league_rate) * 6,
        text: 'chases rookies — ' + Math.round(r.rate * 100) + '% vs '
          + Math.round(r.league_rate * 100) + '% league',
      });
    }

    out.sort((a, b) => b.weight - a.weight);
    out.forEach(t => { t.sample_size = n; });
    return out;
  }

  /**
   * Who picks before you do, what they need, and who they are likely to take.
   *
   * This is the question the whole survival model answers internally and has
   * never once said out loud. Round 6, you want the TE, and the real decision is
   * "do the four seats between me and my next pick take him". The tool knew. It
   * expressed that knowledge as a single percentage attached to a player, with
   * no way to see WHICH seat was the threat or WHY.
   *
   * Naming the seat is what makes it actionable, because you know these people.
   * "62% gone" is a number to accept. "Richard takes a QB three rounds early and
   * has no QB" is a number you can check against a man you have played fantasy
   * football with for a decade — and disagree with, which is the point.
   *
   * Returns one row per intervening pick, in pick order, plus a roll-up of who
   * on your board is most likely to be gone and who is most likely to take him.
   */
  function threatBoard(ctx, opts) {
    opts = opts || {};
    const namesPer = opts.namesPerPick || CFG.THREAT_NAMES_PER_PICK;
    // No next pick means no window. `t.pick_no < ctx.nextPick` with a null
    // nextPick would let the whole rest of the draft through and report the
    // last pick of your draft as if forty seats were about to snipe you.
    const intervening = ctx.nextPick ? (ctx.intervening || []).filter(t =>
      t.pick_no >= (ctx.currentPick || 0) && t.pick_no < ctx.nextPick) : [];
    if (!intervening.length || !ctx.board || !ctx.board.length) {
      return { rows: [], atRisk: [], picksUntilNext: 0 };
    }

    // Availability at the time each seat picks, so seat four is not told that
    // a player seat one is 80% likely to have taken is still sitting there.
    const board = ctx.board;
    const rows = [];
    // P(still on the board) for each player, carried forward across the window.
    const alive = {};
    board.forEach(p => { alive[p.player_id] = 1; });

    intervening.forEach(team => {
      const posP = S.positionProbabilities(team, board, ctx);
      const profile = team.profile || null;
      const tells = managerTells(profile);

      // The seat's whole distribution over players: P(position) × P(this man,
      // given the position) × P(he is even still there).
      const cand = [];
      board.forEach(p => {
        const pp = posP[p.position];
        if (!pp) return;
        const within = S.withinPositionProbability(p, board, team);
        const p_take = pp * within * alive[p.player_id];
        if (p_take > CFG.THREAT_MIN_P) cand.push({ player: p, p: p_take });
      });
      cand.sort((a, b) => b.p - a.p);

      // One seat takes exactly one player, so its probabilities cannot sum past
      // 1. Without this a confident seat reads as taking three men at once.
      let mass = 0;
      cand.forEach(c => { mass += c.p; });
      if (mass > 1) cand.forEach(c => { c.p /= mass; });
      cand.forEach(c => { alive[c.player.player_id] *= (1 - c.p); });

      // The full distribution, not the top three. Truncating here would bake a
      // rendering decision into the data, and a caller asking "how likely is he
      // to take a QB" would silently get 0 for any position off the podium.
      const positions = Object.keys(posP).map(k => ({ position: k, p: posP[k] }))
        .sort((a, b) => b.p - a.p);

      rows.push({
        pick_no: team.pick_no,
        team_slot: team.team_slot,
        manager: (profile && (profile.name || profile.display_name)) || null,
        sample_size: profile ? (profile.sample_size || 0) : 0,
        roster_size: (team.roster || []).length,
        positions: positions,
        likely: cand.slice(0, namesPer).map(c => ({
          player_id: c.player.player_id, name: c.player.name,
          position: c.player.position, team: c.player.team || '',
          p: Math.round(c.p * 100),
        })),
        tells: tells.slice(0, 2),
      });
    });

    // Roll-up: who is most likely to be gone, and who takes him.
    const risk = board.map(p => {
      const gone = 1 - alive[p.player_id];
      if (gone < CFG.THREAT_AT_RISK_MIN) return null;
      let culprit = null, best = 0;
      rows.forEach(r => {
        const hit = r.likely.find(l => l.player_id === p.player_id);
        if (hit && hit.p > best) { best = hit.p; culprit = r; }
      });
      return {
        player_id: p.player_id, name: p.name, position: p.position,
        vorp: p.vorp == null ? null : Number(p.vorp.toFixed(1)),
        gone: Math.round(gone * 100),
        // Null rather than a guess when no single seat stands out: "somebody
        // will take him" is a different and weaker claim than naming a seat.
        by: culprit ? (culprit.manager || 'seat ' + culprit.team_slot) : null,
        by_pick: culprit ? culprit.pick_no : null,
      };
    }).filter(Boolean);
    // Ordered by what it costs you, not by probability: a 95%-gone kicker is
    // not news, and a 55%-gone RB1 is the entire decision.
    risk.sort((a, b) => (b.gone / 100) * (b.vorp || 0) - (a.gone / 100) * (a.vorp || 0));

    return {
      rows: rows,
      atRisk: risk.slice(0, CFG.THREAT_AT_RISK_SHOWN),
      picksUntilNext: intervening.length,
    };
  }


  /* Weights that follow the draft instead of waiting to be turned.
   *
   * The honest answer to "should I change these between rounds" is YES, and
   * always has been — the same weights cannot be right in round 1, when every
   * slot is empty and lineup need is meaningless noise, and in round 12, when
   * an unfilled kicker slot is a guaranteed zero. Expecting somebody to work
   * that out mid-draft with eight seconds on the clock is expecting the wrong
   * thing of them.
   *
   * WHAT THIS IS NOT: backtested. Three prior drafts is not enough to fit
   * weights against, and pretending otherwise would be the exact false
   * precision the rest of this codebase refuses. These are the standard
   * structure of a draft — anchor, build, fill, endgame — expressed as weights,
   * plus four situational responses to things happening in front of you. Every
   * single adjustment states its reason, so it is a suggestion you can read and
   * overrule rather than a black box that moves numbers.
   */
  function autoWeights(ctx) {
    const reasons = [];
    const teams = (ctx.league || {}).teams || 10;
    const round = ctx.currentPick ? Math.floor((ctx.currentPick - 1) / teams) + 1 : 1;
    const picksLeft = ctx.myPicksLeft == null ? 99 : ctx.myPicksLeft;
    const w = Object.assign({}, DEFAULT_WEIGHTS);

    // ---- phase ------------------------------------------------------------
    /* THE ENDGAME CEILING WEIGHT IS 0.5, DOWN FROM 1.4 — and that is the ONLY
     * phase this evidence moves. Cory's narrowing, 2026-08-08 (D9 correction):
     *   - exp 2 §5's per-phase grid: endgame ceiling 0.5 is BETTER (+$19, CI
     *     [7.5, 33]) while 1.0 / 2.0 / 3.0 are all WORSE with CIs EXCLUDING
     *     ZERO. The designed "swing at upside in the endgame" hypothesis is
     *     REFUTED — moderate wins, aggressive burns money.
     *   - CORE TILTS (Anchor 0.45 / Build 0.60 / Fill 0.80) ARE UNCHANGED ON
     *     PURPOSE. Every core tilt the grid tested straddled the default:
     *     "no evidence of a shift" is the FINDING, not an invitation to nudge.
     *     Moving them would be fitting noise with extra steps.
     * WHY THE ENDGAME STILL GETS LOTTERY BEHAVIOUR: the bench-lottery lives in
     * upsideBonus (lateness × endgame multipliers), a DIFFERENT mechanism —
     * late fliers are cheap because a bench floor is free on the waiver wire.
     * That policy is untouched. What is removed is the DOUBLE ramp: a 1.4
     * weight multiplied on top of upsideBonus's own late amplification, which
     * is precisely the over-tilt the dose-response priced as negative. */
    let phase, phaseWhy;
    if (round <= CFG.AUTO_ANCHOR_ROUNDS) {
      phase = 'Anchor';
      phaseWhy = 'Round ' + round + ': every slot is empty, so "need" is noise. '
        + 'Take the best player and the cliffs.';
      w.need = 0.35; w.tier = 1.35; w.risk = 1.1; w.ceiling = 0.45; w.bye = 0.5; w.keeper = 0.9;
    } else if (round <= CFG.AUTO_BUILD_ROUNDS) {
      phase = 'Build';
      phaseWhy = 'Round ' + round + ': starters are filling in. Value still leads, '
        + 'but holes start to matter.';
      w.need = 0.9; w.tier = 1.2; w.risk = 1.0; w.ceiling = 0.6; w.bye = 0.8; w.stack = 1.1;
    } else if (round <= CFG.AUTO_FILL_ROUNDS) {
      phase = 'Fill';
      phaseWhy = 'Round ' + round + ': an empty starting slot now costs real points '
        + 'every week, and a stacked bye is a lineup you cannot field.';
      w.need = 1.45; w.tier = 1.0; w.risk = 0.9; w.ceiling = 0.8; w.bye = 1.4;
    } else {
      phase = 'Endgame';
      phaseWhy = 'Round ' + round + ': the marginal starter is close to worthless, '
        + 'so take ceiling over floor — but MODERATELY. (We designed an aggressive '
        + 'endgame upside ramp; the Lab inverted it: heavy late tilt measured '
        + 'NEGATIVE, moderate measured best. Fliers still get their upside credit '
        + 'because a bench floor is free on the wire.) Keeper value counts here too.';
      w.need = 1.3; w.tier = 0.8; w.risk = 0.6; w.ceiling = 0.5; w.keeper = 1.6; w.bye = 1.1;
    }
    reasons.push({ kind: 'phase', text: phaseWhy });

    // ---- what is actually happening in front of you -----------------------

    // 1. A mandatory gap you can no longer afford to defer.
    const gaps = mandatoryGaps(ctx) || {};
    const missing = (gaps.positions || gaps.needed || []).length
      || Object.keys(gaps).filter(k => gaps[k] > 0).length;
    if (picksLeft <= CFG.AUTO_TIGHT_PICKS && missing) {
      w.need = Math.min(3, w.need + 0.9);
      w.ceiling = Math.max(0, w.ceiling - 0.3);
      reasons.push({ kind: 'tight', text: picksLeft + ' picks left with slots still empty — '
        + 'need outranks everything else now.' });
    }

    // 2. A run on a position you still have to fill.
    const runs = detectRuns(ctx.runMultipliers || {}) || [];
    const hot = (Array.isArray(runs) ? runs : []).map(r => r.position || r).filter(Boolean);
    if (hot.length) {
      w.tier = Math.min(3, w.tier + 0.35);
      reasons.push({ kind: 'run', text: 'Run on ' + hot.join(', ')
        + ' — chasing the last of a tier is worth more while it is emptying.' });
    }

    // 3. Starters all filled: stop optimising a lineup that is already legal.
    const plan = rosterPlan(ctx);
    if (plan && !plan.needed.length && !plan.flexNeed && round > CFG.AUTO_ANCHOR_ROUNDS) {
      w.need = Math.max(0.2, w.need - 0.6);
      w.ceiling = Math.min(3, w.ceiling + 0.4);
      w.keeper = Math.min(3, w.keeper + 0.3);
      reasons.push({ kind: 'complete', text: 'Your starting lineup is full — '
        + 'the rest of this draft is upside and next year\'s keepers.' });
    }

    // 4. A bye week you already cannot field a lineup in.
    const byes = byeGrid(ctx) || [];
    const holes = byes.filter(b => b.severity === 'bad' && !b.provisional).length;
    if (holes) {
      w.bye = Math.min(3, w.bye + 0.5);
      reasons.push({ kind: 'bye', text: holes + ' week' + (holes === 1 ? '' : 's')
        + ' you cannot field a lineup — bye collisions are now a real cost, not a tiebreak.' });
    }

    Object.keys(w).forEach(k => { w[k] = Math.round(Math.max(0, Math.min(3, w[k])) * 10) / 10; });
    return { weights: w, phase: phase, round: round, reasons: reasons };
  }

  /**
   * The sheet you take to the table when the tool is not available.
   *
   * Every other surface in here assumes a working phone, a charged battery and
   * a network. Draft day will eventually not have one of those, and the fallback
   * cannot be "remember what it said" — it has to be paper, or a block of text
   * pasted into whatever still works.
   *
   * Three things, in the order you would want them:
   *   1. YOUR QUEUE, in YOUR order. Never re-sorted. A sheet that quietly
   *      reorders your own decisions is a sheet you stop trusting, and the
   *      whole point of the queue is that it is the one list the model does
   *      not get a vote on. It only annotates: how likely each name is to
   *      still be there when you pick.
   *   2. THE BOARD'S ORDER for everyone not in the queue, so the queue running
   *      dry is a smaller problem than it would otherwise be.
   *   3. BY POSITION with tier breaks marked, because the question at pick 9
   *      of a paper draft is "who is the last decent TE", and a single ranked
   *      column answers that badly.
   *
   * It is a SNAPSHOT and says so. Scores depend on what is already on your
   * roster, so a sheet printed pre-draft is right about round 1 and steadily
   * less right after that. Stamping the state it was built from is what stops
   * that from being a silent error in round 8.
   */
  function cheatSheet(ctx, lists, opts) {
    opts = opts || {};
    const queueDepth = opts.queueDepth || CFG.SHEET_QUEUE_DEPTH;
    const bestDepth = opts.bestDepth || CFG.SHEET_BEST_DEPTH;
    const posDepth = opts.positionDepth || CFG.SHEET_POSITION_DEPTH;

    const warnings = [];
    const avoid = new Set((lists && lists.avoid) || []);
    const targets = new Set((lists && lists.targets) || []);
    const queueIds = ((lists && lists.queue) || []).slice(0, queueDepth);

    // Scored once, through exactly the path the live recommendation uses, so
    // the sheet and the screen can never disagree about who is better.
    const scored = applyPersonalLists(recommend(ctx), lists);
    const byId = {};
    scored.forEach(s => { byId[s.player.player_id] = s; });

    const next = ctx.nextPick || null;
    const row = (p, entry) => ({
      player_id: p.player_id,
      name: p.name,
      position: p.position,
      team: p.team || '',
      bye: p.bye || null,
      tier: p.tier || null,
      adp: p.adjusted_adp == null ? null : Math.round(p.adjusted_adp),
      vorp: p.vorp == null ? null : Number(p.vorp.toFixed(1)),
      targeted: targets.has(p.player_id),
      // The one number worth carrying onto paper: not "is he good" — the sheet
      // is already sorted by that — but "can I wait". Null when there is no
      // next pick to survive to, rather than a fabricated 0.
      survives_to_next: next ? Math.round(survival(p, next, ctx) * 100) : null,
      why: entry && entry.reasons && entry.reasons.length ? entry.reasons[0] : null,
    });

    // 1. Your queue, in your order. A queued player who is already off the
    //    board is REPORTED, not dropped: "he is gone" is the sheet's job too.
    const board = {};
    (ctx.board || []).forEach(p => { board[p.player_id] = p; });
    const queue = [];
    queueIds.forEach((id, i) => {
      const p = board[id];
      if (!p) {
        queue.push({ player_id: id, rank: i + 1, gone: true, name: null });
        return;
      }
      const r = row(p, byId[id]);
      r.rank = i + 1;
      r.gone = false;
      if (avoid.has(id)) {
        // Both starred-for-the-queue and blocked is a contradiction the user
        // made, and resolving it silently either way would be wrong.
        r.conflict = true;
        warnings.push(p.name + ' is in your queue AND on your never list');
      }
      queue.push(r);
    });

    // 2. The board's order, minus anyone already spoken for above.
    const queued = new Set(queueIds);
    const best = scored.filter(s => !queued.has(s.player.player_id))
      .slice(0, bestDepth).map(s => row(s.player, s));

    // 3. By position, with the tier break marked on the last man in each tier.
    //    That mark is the whole reason this section exists on paper.
    const positions = opts.positions || CFG.SHEET_POSITIONS;
    const byPosition = positions.map(pos => {
      const players = scored.filter(s => s.player.position === pos)
        .slice(0, posDepth).map(s => row(s.player, s));
      players.forEach((p, i) => {
        const nxt = players[i + 1];
        p.tier_break = !!(nxt && p.tier && nxt.tier && nxt.tier !== p.tier);
      });
      return { position: pos, players: players };
    }).filter(g => g.players.length);

    if (!queue.length) warnings.push('your queue is empty — this sheet is the board\'s opinion only');
    if (!scored.length) warnings.push('the board is empty — nothing to print');

    return {
      // Provenance, not decoration. Read it before trusting the sheet.
      generated: {
        current_pick: ctx.currentPick || null,
        next_pick: next,
        my_picks_left: ctx.myPicksLeft == null ? null : ctx.myPicksLeft,
        roster_size: (ctx.roster || []).length,
        board_size: (ctx.board || []).length,
        blocked: avoid.size,
      },
      queue: queue,
      best: best,
      byPosition: byPosition,
      warnings: warnings,
    };
  }

  /**
   * The same sheet as plain text, for the clipboard.
   *
   * Plain text because it has to survive being pasted into a notes app, a
   * group chat, or Sleeper's own search box one name at a time — none of which
   * render HTML, and all of which are more likely to be working than this site
   * is at the moment somebody needs this.
   */
  function sheetText(sheet, meta) {
    meta = meta || {};
    const L = [];
    const pad = (s, n) => (String(s == null ? '' : s) + '                              ').slice(0, n);
    const tag = p => (p.targeted ? '*' : ' ');
    const line = p => pad(p.name, 22) + pad(p.position + (p.team ? ' ' + p.team : ''), 8)
      + pad(p.bye ? 'bye' + p.bye : '', 6) + pad(p.tier ? 'T' + p.tier : '', 4)
      + pad(p.adp == null ? '' : 'adp' + p.adp, 7)
      + (p.survives_to_next == null ? '' : p.survives_to_next + '% there next turn');

    L.push('MFGA DRAFT SHEET' + (meta.title ? ' — ' + meta.title : ''));
    const g = sheet.generated || {};
    L.push('snapshot: pick ' + (g.current_pick || '?') + ', ' + (g.roster_size || 0)
      + ' already on your roster, ' + (g.my_picks_left == null ? '?' : g.my_picks_left) + ' picks left');
    if (meta.myPicks && meta.myPicks.length) L.push('your picks: ' + meta.myPicks.join(', '));
    if (meta.built_at) L.push('board built: ' + meta.built_at);
    L.push('* = target. Percentages are the chance he lasts to your NEXT turn.');
    (sheet.warnings || []).forEach(w => L.push('!! ' + w));

    L.push('', '== YOUR QUEUE (your order — take them top down) ==');
    if (!sheet.queue.length) L.push('  (empty)');
    sheet.queue.forEach(p => {
      if (p.gone) { L.push(pad(p.rank + '.', 4) + '[already drafted]'); return; }
      L.push(pad(p.rank + '.', 4) + tag(p) + line(p));
    });

    L.push('', '== BEST AVAILABLE (the board\'s order) ==');
    sheet.best.forEach((p, i) => L.push(pad((i + 1) + '.', 4) + tag(p) + line(p)));

    sheet.byPosition.forEach(grp => {
      L.push('', '== ' + grp.position + ' ==');
      grp.players.forEach((p, i) => {
        L.push(pad((i + 1) + '.', 4) + tag(p) + line(p));
        if (p.tier_break) L.push('    ---- tier break ----');
      });
    });
    return L.join('\n');
  }

  /**
   * Your own read, applied as a nudge rather than an override.
   *
   * Every drafter has players they want and players they will not touch, and a
   * tool that ignores that gets argued with instead of used. But a star is not
   * an argument — it moves a player up a close call, it does not drag a
   * materially worse one to the top. Do-not-draft is absolute, because that one
   * IS an argument you have already had with yourself.
   */
  function applyPersonalLists(scored, lists) {
    const targets = new Set((lists && lists.targets) || []);
    const avoid = new Set((lists && lists.avoid) || []);
    if (!targets.size && !avoid.size) return scored;

    const kept = scored.filter(s => !avoid.has(s.player.player_id));
    if (avoid.size) {
      kept.forEach(s => { s.avoided_count = scored.length - kept.length; });
    }
    for (const s of kept) {
      if (!targets.has(s.player.player_id)) continue;
      s.score += CFG.TARGET_NUDGE;
      s.targeted = true;
      s.reasons = ['⭐ On your target list'].concat(s.reasons || []);
    }
    kept.sort((a, b) => b.score - a.score);
    return kept;
  }

  /**
   * Plausibility rails — catch model failure instead of shipping it.
   *
   * Eight composite terms, three survival layers and a keeper-option term all
   * interacting means an integration bug produces CONFIDENT nonsense rather
   * than a crash. This codebase has already done exactly that three times: a
   * three-layer survival model computed and discarded, an opportunity join that
   * matched nobody, and a board where every projection was zero. All three
   * passed every test.
   *
   * These rails change nothing. They flag. On draft day nobody notices a subtly
   * wrong number; everybody notices a yellow bar.
   */
  function plausibilityRails(entry, ctx, scored) {
    const flags = [];
    const p = entry.player;
    const adp = p.adjusted_adp || p.raw_adp;
    const pick = ctx.currentPick;

    if (adp && pick && adp - pick > CFG.RAIL_ADP_AHEAD) {
      flags.push('~' + Math.round(adp - pick) + ' picks ahead of ADP — verify before taking');
    }

    const roundsLeft = ctx.roundsLeft == null ? 99 : ctx.roundsLeft;
    if ((p.position === 'K' || p.position === 'DEF') && roundsLeft > CFG.RAIL_LATE_ROUNDS
        && !entry.forced) {
      flags.push(p.position + ' this early is almost never right');
    }

    const limits = (ctx.league || {}).position_limits || {};
    const held = (ctx.roster || []).filter(r => r.position === p.position).length;
    const cap = limits[p.position] != null ? limits[p.position] : CFG.RAIL_DEFAULT_POS_CAP[p.position];
    if (cap != null && held >= cap) {
      flags.push('you already hold ' + held + ' at ' + p.position + ' (cap ' + cap + ')');
    }

    // A component dwarfing the player's whole value is the signature of a bug,
    // not of an insight.
    const comps = entry.components || {};
    const vorp = Math.abs(p.vorp || 0) || 1;
    ['keeper', 'ceiling', 'tier', 'need'].forEach(k => {
      const v = Math.abs(comps[k] || 0);
      if (v > vorp * CFG.RAIL_COMPONENT_RATIO) {
        flags.push(k + ' is ' + (v / vorp).toFixed(1) + 'x this player\'s VORP — possible bug');
      }
    });

    if (scored && scored.length > 1 && entry === scored[0]) {
      const a = scored[0].score, b = scored[1].score;
      if (b > 0 && a / b > CFG.RAIL_RUNAWAY_RATIO) {
        flags.push('top score is ' + (a / b).toFixed(1) + 'x the runner-up — suspicious, not a slam dunk');
      }
    }
    return flags;
  }

  /* ── THE MOVEMENT LINE ──────────────────────────────────────────────────────
   *
   * One thin line: is the model changing its mind as the board moves, and why?
   * PURE over two snapshots of the top of the board taken at two DIFFERENT picks.
   * The caller remembers the previous snapshot (state.lastRecommendation); the
   * board's own run machinery supplies the "why", passed in as `reason` rather
   * than re-derived here — so this function invents no causal claim of its own.
   *
   *   snap = { pick, topId, topName, topScore, secondName, secondScore }
   *
   *   MOVED   the top recommendation changed between the two picks.
   *   ALMOST  the top HELD, but the runner-up closed materially without passing.
   *   STEADY  nothing worth a line — kind 'steady', empty line.
   *
   * The `reason` is appended, never fabricated: an empty reason yields a bare
   * factual line ("Shifted to X.") rather than an invented explanation.
   */
  function movementLine(prev, curr, opts) {
    opts = opts || {};
    var CLOSE = opts.closeBand != null ? opts.closeBand : 3.0;   // "within N pts"
    var SHRINK = opts.minShrink != null ? opts.minShrink : 0.5;  // gap must actually close
    var reason = opts.reason || '';
    if (!prev || !curr || !curr.topName) return { kind: 'steady', line: '' };

    if (prev.topId != null && curr.topId != null
        && String(prev.topId) !== String(curr.topId)) {
      return { kind: 'moved',
        line: 'Shifted to ' + curr.topName + (reason ? ' — ' + reason : '') + '.' };
    }

    // Same top: did the runner-up close in without passing?
    var prevGap = (prev.secondScore != null && prev.topScore != null)
      ? prev.topScore - prev.secondScore : null;
    var currGap = (curr.secondScore != null && curr.topScore != null)
      ? curr.topScore - curr.secondScore : null;
    if (prevGap != null && currGap != null
        && currGap >= 0 && currGap <= CLOSE && currGap < prevGap - SHRINK) {
      var name = curr.secondName || 'the runner-up';
      return { kind: 'almost',
        line: name + ' closed to within ' + currGap.toFixed(1) + ' pts'
          + (reason ? ' on the ' + reason : '') + " — didn't pass." };
    }
    return { kind: 'steady', line: '' };
  }

  /* ── LIVE STACK ROUTES ──────────────────────────────────────────────────────
   *
   * Enumerate the same-team QB↔pass-catcher completions still on the board,
   * ranked by the stack value the ENGINE ITSELF uses (CFG.STACK_*), so the line
   * cannot claim a value the scorer would not. Single-partner routes rank first
   * — exp 6's finding that the FIRST partner is the value; a second catcher is a
   * flattened marginal and sorts below.
   *
   * HONESTY, load-bearing: `stack` is classed weak / LEAN / NOT INSTALLED in
   * deviation.js, and this surface would otherwise give a not-installed term
   * standing visual prominence — the deviation badge's failure mode in reverse,
   * decoration reading as evidence. So each result carries `klass`/`classLabel`
   * DERIVED from EVIDENCE.stack, never hard-coded here. If exp 6 or 21 promotes
   * the term, the label changes in one place (deviation.js) and the prominence
   * becomes earned rather than assumed.
   *
   * Takes the SCORED board (same list the recs render from — never a second
   * computation) so survival and adp come from the render, not a re-derive.
   */
  function liveStackRoutes(roster, scored, opts) {
    opts = opts || {};
    var max = opts.max || 4;
    roster = roster || [];
    scored = scored || [];

    // The class comes from the evidence table, in one place.
    var DEV = (typeof DraftDeviation !== 'undefined') ? DraftDeviation
      : (typeof require === 'function' ? require('./deviation.js') : null);
    var ev = DEV && DEV.EVIDENCE ? DEV.EVIDENCE.stack : { klass: 'weak', note: 'LEAN only — not installed' };
    var installed = ev.klass === 'moderate' || ev.klass === 'validated';
    var classLabel = installed ? 'installed' : 'LEAN, not installed';

    var byTeam = {};
    roster.forEach(function (r) {
      if (r && r.team) (byTeam[r.team] = byTeam[r.team] || []).push(r);
    });

    var adpOf = function (p) { return p.adjusted_adp != null ? p.adjusted_adp
      : (p.raw_adp != null ? p.raw_adp : null); };

    var routes = [];
    scored.forEach(function (s) {
      var p = (s && s.player) ? s.player : s;
      if (!p || !p.team) return;
      var mates = byTeam[p.team];
      if (!mates || !mates.length) return;

      var qbs = mates.filter(function (m) { return m.position === 'QB'; });
      var catchers = mates.filter(function (m) { return m.position === 'WR' || m.position === 'TE'; });

      var value = 0, anchor = null;
      if (p.position === 'QB' && catchers.length) {
        value = catchers[0].position === 'TE' ? CFG.STACK_QB_TE : CFG.STACK_QB_WR1;
        anchor = catchers[0];
      } else if ((p.position === 'WR' || p.position === 'TE') && qbs.length) {
        value = p.position === 'TE' ? CFG.STACK_QB_TE : CFG.STACK_QB_WR1;
        anchor = qbs[0];
      } else {
        return; // same-team competition is a penalty, not a route to complete
      }

      // First pairing on this team (single) vs an add-on to an existing QB+catcher pair (double).
      var single = !(qbs.length && catchers.length);
      routes.push({
        partner_id: String(p.player_id),
        partner: p.name,
        position: p.position,
        anchor: anchor.name,
        anchor_position: anchor.position,
        value: value,
        single: single,
        survival: (s && s.survival_to_next != null) ? s.survival_to_next : null,
        adp: adpOf(p),
        klass: ev.klass,
        class_label: classLabel,
        label: p.name + (single ? ' completes ' : ' extends ') + anchor.name + ' stack',
      });
    });

    // Single-partner first, then higher stack value, then the one most at risk
    // of being gone (lower survival) so "best" surfaces the fleeting one.
    routes.sort(function (a, b) {
      if (a.single !== b.single) return a.single ? -1 : 1;
      if (b.value !== a.value) return b.value - a.value;
      var as = a.survival == null ? 1 : a.survival, bs = b.survival == null ? 1 : b.survival;
      return as - bs;
    });

    var partnerIds = {};
    routes.forEach(function (r) { partnerIds[r.partner_id] = r; });
    return {
      count: routes.length,
      routes: routes.slice(0, max),
      best: routes[0] || null,
      partnerIds: partnerIds,      // player_id -> route, for the rec-card badge
      klass: ev.klass,
      class_label: classLabel,
    };
  }

  global.DraftEngine = {
    CFG, DEFAULT_WEIGHTS,
    normalCdf, adpSd, survival, runMultipliers, detectRuns,
    expectedBestAvailable, vona,
    tierCliffUrgency, starterSlotMarginal, riskAdjustment, upsideBonus,
    scorePlayer, onesieState, positionRank, doctrineTilt, doctrineReport, recommend, mandatoryGaps, applyRosterLegality, plausibilityRails,
    demoteFlaggedOnesies, computeRailBudget, railFireSig, bestFlexAlt, liveStackRoutes, movementLine,
    confidence, branchForecast, computePaths, dollarGap, playerDollars, applyPersonalLists, onTheClock, rosterPlan, byeGrid,
    cheatSheet, sheetText, managerTells, threatBoard,
    WEIGHT_PRESETS, matchPreset, rankDiff, autoWeights, MEASURED_WEIGHTS,
    formatDefaults, applyFormatDefaults,
    // A2/A3 surfaces, re-exported so callers need only one handle.
    survivalModel: S, compositeTerms: C,
    keeperOptionValue: C.keeperOptionValue, byeCollisionPenalty: C.byeCollisionPenalty,
    correlationAdjustment: C.correlationAdjustment,
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).DraftEngine;
}
