# DECISIONS NEEDED — findings that imply a gated change

Standing rule (SESSION-A.md habit 7): a finding that implies a change with unbounded
blast radius goes HERE as a decision with evidence — never left inert in a JSON file.
Each: what was found · what it implies · magnitude · confidence · cost of inaction ·
recommendation. Cory's call, made with the evidence. Auto-adaptable findings (bounded
blast radius) are NOT here — they change on their own and say so.

Audit date: 2026-08-09 (swept every recorded verdict in draft/backtest/*.json + *.md).

---

## 1. ANCHOR SOURCE: ✅ WIRED & VERIFIED LIVE 2026-08-09 — board anchors on FantasyPros
> **LANDED (main @ FP-anchor commit + real egress rebuild):** the live board now ranks by
> FantasyPros PRIMARY, FFC gap-fill, search_rank last. Verified on the rebuilt board:
> `primary_source=fantasypros`, 342 FP rows matched, **primary_priced 342 / ffc_gap_fill 3**
> (Pearsall/Metchie/Wease — the exact probe gap), top-200 = 197 FP / 3 FFC / 0 search_rank,
> fallback_rate 0.0. Coverage-gated so a thin/failed FP fetch keeps FFC untouched. The
> record below is the evidence that drove the swap.

## 1. ANCHOR SOURCE: the three-way LANDED — anchor on FantasyPros (our format), not MFL — 2026-08-09
- **Three-way result (FantasyPros now IN the grade, 126/105 players):** n-weighted ρ —
  2023: FFC 0.281 · MFL **0.397** · FP 0.307; 2024: FFC −0.03 · MFL 0.070 · FP **0.075**.
  Region wins FP 5 / MFL 4 / FFC 3; **composite beats no single source** (blend nothing).
- **The format confound is resolved:** **FantasyPros (half-PPR, OUR format) beats FFC
  (half-PPR) in BOTH seasons** — so the market-read edge is REAL and format-independent, not
  an artifact. MFL edges FP only in 2023 (0.397 vs 0.307) and ties in 2024, but MFL carries a
  full-PPR handicap (2023 was receiver-friendly, which full-PPR over-weights) — exactly the
  confound we refused to act on. Per the pre-registered rule (FP beats FFC like MFL did →
  crowd quality, anchor on the clean same-format source): **anchor on FantasyPros.**
- **Recommendation:** swap the live anchor FFC → **FantasyPros** (single source; composite
  doesn't beat it; FFC fallback for deep gaps). FP wins the EARLY regions (r1-3, r4-7) where
  Cory drafts, and it feeds the value anchor that the participation test showed is half our
  edge. **Still thin (2 seasons, n~90/67, no CI on gaps, 2024 ~0 for all — leans on 2023),**
  so directional; but FP is our exact format with no handicap, so it's the *cleaner* anchor
  regardless of the thinness. MFL's residual 2023 edge is format-confounded — do not chase it.
- **Cost of inaction:** the live board ranks by FFC, which FP beats in both graded seasons.
- **Status:** supersedes the earlier MFL lean. Wiring = ingest FP 2026 ADP onto the live
  board (was HELD on this result; the block is cleared). Confirm the FP endpoint reproduces
  (re-fire in flight) before wiring. (EXP-SOURCE-GRADE.md, exp_source_grade.json)

## 1b. (superseded) ANCHOR SOURCE: MFL over FFC — the MFL-only lean, now replaced by #1
- **Found:** source grade — MFL orders realized value better than FFC (ρ 0.40 vs 0.28
  in 2023; 0.07 vs −0.03 in 2024; MFL won 7 pooled regions to 5; composite/hybrid does
  not beat MFL alone). Decomposition: MFL's edge is strongest in **rounds 1-7** (where
  Cory drafts), not the deep board; FFC wins r12+.
- **Implies:** swap the live board's ADP anchor from FFC to MFL.
- **Magnitude:** at Cory's picks, top-50 median rank move 18; pick 41 (Bucky Irving)
  moves 25 ranks. Real where he drafts, not cosmetic.
- **Confidence:** directional — two graded seasons, resting substantially on 2023 (2024
  near-zero for both); thin per-cell n (10-18).
- **Cost of inaction:** the whole draft rule ranks by the worse board through Aug 22.
- **Recommendation:** swap, MFL-alone (hybrid doesn't beat it), FFC fallback for the 28%
  uncovered (all deep; top-130 ~100% covered). Approved by Cory — but **WIRING ON HOLD
  pending the three-way grade (2026-08-09), because a FORMAT CONFOUND surfaced that we
  hadn't turned on this banked result:** MFL is FULL-PPR, which tilts receivers/pass-catching
  backs up for a game we don't play; the grade never isolated "better ordering" from "a
  receiver-lean that aligned with a receiver-friendly 2023" (and the finding rests on 2023).
  FantasyPros is **half-PPR (our format)** and is the natural de-confounding CONTROL: if FP
  beats FFC like MFL does, it's crowd quality not format tilt → **anchor on FP (cleaner, no
  handicap), not MFL**; if only MFL wins, the edge is provisional and we do NOT swap on it.
  So the swap is still on, but the SOURCE (MFL vs FP) and whether it survives format-matching
  are settled by the three-way — do not wire until it lands. (EXP-MFL-SWAP.md)

## 2. REGRESSION / SHRINKAGE WEIGHT: over-regresses — ACCURACY+OVERFITTING GATE CLEARED, $ pending (2026-08-10)
- **✅ CV UPDATE (exp_regression_cv):** the gate exp35 set ("leave-one-season-out CV")
  is PASSED. Holding out each season and picking the weight by top-decile on the other
  two selected a LOW weight every fold (**0.1, 0.1, 0.0**) and it **beat-or-tied the
  shipped 0.35 out-of-sample on all three** (margins +0.065, +0.13, +0.0 — never loses).
  Most robust single value = **0.1** (mean held-out top-decile 0.536 vs 0.35's ~0.41;
  rank-corr 0.62 vs 0.60; 0.0 edges it on worst-case + rho). So the pooled monotonic-to-0
  curve is NOT an in-sample artifact — lowering the weight generalises. **RECOMMEND
  0.35 → 0.1** (or 0.0). REMAINING GATE: the dollar arm (roster grader, egress) to size
  it at Cory's picks before the numeric install — accuracy is cleared, $ is not. 4/4 tests.
- **Found:** exp33 — the blend over-regresses and loses to a naive baseline at
  identifying ELITE players. exp35 regression sweep — top-decile accuracy peaks BELOW
  the shipped 0.35, **peak at 0.0**; report says verbatim "over-regression is a real
  lever — but installing a new value is a separate gated SHIP decision, not done here."
- **Implies:** lower the projection blend's regression-toward-prior weight (0.35 → lower)
  for elite identification; connects to the rookie/2nd-year under-ranking (young players
  have thin priors to regress from — same mechanism).
- **Magnitude:** not yet in dollars — measured in top-decile rank accuracy; needs the
  sweep's dollar arm to size it at the picks.
- **Confidence:** the sweep is on real data but the optimum-at-0.0 needs a held-out /
  dollar check before install (a naive 0.0 may overfit noise elsewhere on the board).
- **Cost of inaction:** the board keeps under-ranking high-upside young players (Nabers
  was the trigger case) — matters for a closer keeper/draft call than this year's.
- **Recommendation:** run the sweep's dollar arm + held-out, then bring a specific
  proposed weight here. NOT ready to install blind. (queued behind slate rails + cron)

## 3. SIMPLIFY AUTO: mask + value is the WHOLE measured edge — the 6 adjusters don't earn — OPEN
- **Found (exp_participation, 400 paired rooms — the all-terms test):** built each adjuster UP
  from the defensible core (mask + value anchor). **Core = $704; core + every adjuster at
  engine default = $407** — the adjuster panel, at fair-fight strength, *loses ~$300*. On the
  clean core NOTHING earns a place: **need-weight +6.5 [−8,+20]** (decoration — confirms
  exp_need_phase; it's the always-on MASK that earns, not the additive weight), **ceiling −4.8
  [−26,+17] with no clean weekly-high gain** (my pre-registered "shape pays" guess did NOT
  survive de-confounding — the apparent weekly-high win was a confound of the ablation-from-full
  frame), **bye ~0**, and **tier −235 / risk −143 actively HURT** (they pull picks off the value
  anchor toward a mechanism no payout rewards). **stack reads −63 but that is an INSTRUMENT
  ARTIFACT** — grade_room draws weekly scores independently (no within-team correlation), so
  this harness can't reward a stack; exp6/stack_sweep (rho=0.35) is the sound instrument and
  found stack a **WINNER (+$196 @ dose 0.5)** — kept ON. Value anchor removal costs $362 — it
  and the mask are the earners.
- **Implies:** Auto collapses to **mask + value anchor + a STACK tilt (~0.5)**; drop tier/risk
  (measured drag) and need-weight/ceiling/bye (decoration). The slider panel should say which
  controls do anything rather than presenting eight equals.
- **Magnitude:** the harmful dollar figures are an **upper bound at a uniform ~30-pt nudge**
  (see caveat) — the ROBUST claim is the SIGN/ordering: no adjuster earns; at any strength big
  enough to move a pick, tier/risk lose (stack is instrument-limited here — see below). The win is a large **robustness/legibility**
  gain plus removing a measured drag.
- **Regional check (exp_participation_regional, 400 rooms — disaggregate before discard):** split
  each term by Cory's pick bands (early r4-6 / mid r7-10 / late r11-15). No term earns in ANY band,
  so the pooled "drop them" STANDS — but it sharpened the picture: tier hurts early −147 AND mid −68,
  risk hurts early −97, bye hurts early −13, all neutral late; ceiling flat everywhere. The harm
  concentrates in the EARLY rounds (4-6, Cory's most valuable picks) where the value anchor is
  strongest — i.e. the terms distort a good ranking exactly where ranking matters most, and go inert
  once the board flattens. (An n=20 pass falsely showed "risk earns mid +44"; n=400 killed it — a
  reminder that regional cells must be read at full power.)
- **Confidence — split by faithfulness:** **need-weight (drop/flatten): STRONG & FAITHFUL** —
  need_signal is the exact harness term, and exp_need_phase agrees. **tier/risk/ceiling/bye:
  DIRECTIONAL via PROXY** — computed from the same board fields the engine uses but not the
  engine's exact functions, so a proxy null bounds the *mechanism*, it doesn't by itself convict
  the *live term*. **stack: NOT JUDGED HERE** — grade_room has no within-team correlation, so
  the harness can't reward it; stack_sweep (+$196) is authoritative. The proper instrument to
  convict tier/risk is a faithful JS-engine ablation (queued, not built).
- **Cost of inaction:** Auto drives six hand-built terms on draft day, at least two of which
  (tier, risk) measurably drag against the value anchor; the panel teaches distrust by
  presenting inert/harmful controls as equal to the two that matter.
- **Recommendation (GATED — the live pick screen, 13 days out):**
  1. **DO NOW (robust+faithful):** flatten Auto's need-weight ramp to a flat ~0.5 (or drop the
     additive need term; mask stays). Zero risk to the measured edge.
  2. **DRAFT-DAY PRESET (recommended):** run Auto as **mask + value(1.0)**, with tier/risk/bye
     at **0** and **stack ~0.5** (exp6 winner). This is the "flat preset" Cory floated.
     **REVISED 2026-08-09 by the interior look (Cory's flat-vs-structured question) — two numbers
     move off Cory's approved "need & ceiling at zero":**
     - **need-weight: 0 or 0.5 barely matters — it's NEAR-INERT (redundant with the mask).**
       Participation-rate probe (exp_participation_rate): need-weight flips only **5% of picks at
       w=0.5, 8% even at w=3.0** — because within the startable-cap MASK the need signal is nearly
       uniform, so the additive weight rarely changes the argmax. The +$16 peak at w=0.5 is real
       but comes from that ~5% slice. So the mask IS the need mechanism; the weight is a marginal
       tweak. Cory's approved 0 is fine; 0.5 captures a thin +$16 — his call, low-stakes either way.
     - **ceiling: do NOT zero — it GENUINELY participates and has a real positive region.** Probe:
       ceiling flips **49% of picks at default, 58% at w=1.0** (giving up ~14 VORP/flip to chase
       upside) — so its flatness at DEFAULT is a REAL null (moves half the picks, nets ~0), NOT a
       scale artifact. The single-seed curve showed +$23-26 at w≈1.0-1.5, but **REPLICATION across
       3 fresh seeds (exp_ceiling_replicate, 2026-08-09): w=1.0 = +6/+7/+18 (mean +$10, positive
       every seed but separable in 0/3)** — the +$23 was the high end of a thin effect (winner's
       curse on the peak). VERDICT: **draft at 0.65 (settled, unchanged); w=1.0 stays an OPEN
       question — it leans positive so do NOT zero it, but not enough to raise it.** Ceiling is the
       live lead for the public-league scale-up (37.5% of the pot pays weekly-high — the mechanism).
     - tier/risk stay 0 (negative or fading everywhere sampled; risk-late is a dead zone, not a
       positive). **Cory's call to confirm the two revised numbers before wiring.**
  3. **BEFORE ripping the live terms out of engine.js:** build the faithful JS-engine ablation
     to convict tier/risk on the real functions (proxy caveat); stack's mechanism (within-team correlation) needs a correlation-aware grader, which stack_sweep already is. Until then, the *preset*
     (weights→0) achieves the same draft-day effect without deleting code.
  - The autoWeights edit is staged and ready to bundle; **Cory's call on scope before Aug 22.**

## 4. FANTASYPROS AS A THIRD SOURCE — ✅ RESOLVED (endpoint found, in the grade) → folds into #1
- **Found:** the FP page SSR-renders only a top-5 teaser; the full board is served by an
  export/data variant of the ADP URL, surfaced by the self-discovering fetch after prioritizing
  export variants over the proven-teaser nav links. FP now crosswalks 126 (2023) / 105 (2024)
  players and is IN the three-way grade. See #1 for the result and the anchor decision.
- **Status:** measurement DONE; the decision is #1 (anchor on FantasyPros). Reproducibility of
  the endpoint re-firing in CI; endpoint recorded in `fantasypros_source` for future runs.

### (historical) FANTASYPROS — the discovery path, kept for the record
- **Found:** the parser is correct, but the FantasyPros ADP page **server-renders only the
  top-5 rows** (a teaser; `ssrHeader:true`) — players 6-300 are hydrated client-side from a
  data endpoint the initial HTML never contains. So the grade only ever saw 5 rows (self-
  diagnosing dump caught it — a miss looked like a miss, not an absent source). First discovery
  probe: the reports bundle references **no `api.fantasypros.com` host** and two guessed
  endpoints 403'd, so the endpoint is a relative/other-host path; a broadened discovery pass is
  in flight.
- **Implies:** until the data endpoint is found, FP **cannot** de-confound the MFL swap (#1),
  so the three-way stays unresolved and **the MFL wiring stays HELD** and format-confounded.
- **Confidence/cost:** FP feeds the input to our LARGEST earner (the value anchor — see the
  participation test), so it's worth the discovery iterations; but it may not be cheaply
  scrapable (endpoint could be constructed dynamically in minified JS). If two more discovery
  passes don't surface it, fall back: keep FFC (our format) as the live anchor, hold MFL, and
  record the source question as format-confounded-and-parked rather than burn more egress.
- **Status:** measurement blocked on discovery; NOT a decision yet. On the model queue.

---

### Acted-on findings checked in this audit (no decision needed — recorded so they're not re-surfaced)
- **Keeper-need rule** (b0_need +$258, value_depth +$51): WIRED live (needrule.js). ✅
- **Dead zone** (mid-round RB worst allocation): board marker live. ✅
- **Doctrine "enroll as THE PLAN"** (frontier/19b): board shows `enrolled: wr_anchor`,
  edge +172 — the plan IS enrolled. ✅
- **Keeper decision (Nabers)**: settled — keep Chase/Henry/Walker. ✅

### ⚠️ NEEDS VALIDATION before promotion (Cory 2026-08-09 — do not surface ghosts)
Several recorded "install" verdicts predate later work that may have SUPERSEDED, REFUTED,
or CONFOUNDED-INSTRUMENTED them. Validate each against everything learned since before
writing it up as a live decision; record the ones that don't survive as RETIRED-with-reason.
- **`install via the gates (slider change, cited)` ×4** and **`WINNER — dose pays` (exp6
  stack) / `enroll as THE PLAN` ×2** — check against: the keeper-need rule (changed what
  the composite does), the market-reliability surface (changed the anchor story), exp43's
  within-position fix (invalidated confounded cross-position readings), and the phantom-null
  result. Present only survivors, ranked by dollars.
- **This validation pass + the AUTOMATIC finding→decision mechanism** (fire at experiment
  conclusion, not via a remembered audit) are queued BEHIND the slate rails and the weekly
  cron per Cory — they are the process fix that prevents the next backlog, worth more than
  clearing this one.

## 5. IN-SEASON MARKET SIGNALS + MOCK-DRAFT FORWARD EVIDENCE — sequenced 2026-08-09
Cory raised three in-season/forward inputs. Sequencing verdict (dollars × soonness),
recorded so the calls don't evaporate. My recommendations; Cory's to override.

**5a. Betting-market movement as a Sunday start-sit input — IN-SEASON, no window, test-before-build.**
- **The signal:** implied team total (spread+total) is the workhorse; game total = shootout/
  ceiling (matters doubly — 37.5% of the pot pays weekly-high); spread = game script; props
  where they exist; **line MOVEMENT** = info that arrived after projections were built.
- **Key correction to the ADP analogy:** betting movement is NOT an archival-window problem.
  Opening lines, closing lines, and outcomes are all public HISTORICAL data — testable today,
  no archiving needed. (Contrast ADP: no history, archive started 2026-08-09, predictive half
  blocked.) We DO NOT retain as-built weekly projection snapshots, so "moved since OUR Tuesday
  projection" is not reconstructable from our history — but the thread is validated without it.
- **LEVEL vs MOVEMENT:** level likely already in our projections (double-count risk, expensive
  to disentangle). Movement is cleaner, is the un-priced part, and self-gates (silent when
  nothing changed). Cory's instinct confirmed.
- **The ~$0 gate (do FIRST):** does line movement predict outcome-vs-OPENING? Pure external
  data, no dependence on our projection archive. Fails → thread dies cheap. Passes → THEN the
  harder "incremental over our projection" build earns it, and we start stamping projection
  build-time going forward.
- **Kalshi:** probe for game-level depth/volume, but expect thin player-prop coverage (a thin
  market is not a wise one); props likely need a sportsbook odds aggregator. Implied team total
  is derivable from Kalshi's spread+total if volume carries.
- **Recommendation:** QUEUE post-draft. Zero cost to waiting. Post-draft slack → run the
  movement-vs-outcome backtest; if it passes, build the movement signal into the Sunday alert,
  attached to a specific chase-vs-protect call (render nothing that doesn't change a decision).

**5b. Mock drafts as forward evidence — PRE-22nd WINDOW, in Session A's lane (survival + ledger).**
- **What they are:** real picks/boards/behaviour, run on demand. NOT a strategy-earning
  substitute for MFL (no season outcomes). Three uses, judged against the overfit objection:
  - **Use 2 — calibrate survival: STRONGEST, survives.** Survival = board-depletion rate at a
    position, not opponent psychology; mocks deplete too. "91% to last to my next pick" has
    NEVER been graded. Caveat to STAMP: mock autopickers deplete ADP-strict → curve may run
    slightly optimistic vs our noisier real room. "Never graded → graded" is strict progress.
  - **Use 3 — forward evidence: valid, same activity as Use 2.** Pre-pick prediction answered
    by reality, no re-running. The ONLY non-retrospective source we have. Window closes 22nd.
  - **Use 1 — opponent model vs strangers: run it, but a NULL is INCONCLUSIVE.** Mocks lack
    keepers/money/rivalries and half autopick/abandon → a non-firing run-detector can't be told
    apart from behaviorally-degenerate mocks. Pre-register that a mock null doesn't convict the
    mechanism. Downweight.
- **Clean interface:** I don't need the live war room driven through a mock. Give me the ordered
  PICK LOG; I replay it through the survival estimator at each of "my" picks and grade offline.
  B's open question (can mocks be driven/logged programmatically?) gates only how fast logs
  arrive, not whether I can consume them. Human-only is fine — Cory clicks, log still captures.
- **Recommendation:** BUILD the offline survival-calibration grader (Session A lane), sequenced
  AFTER the FP-anchor wiring, still pre-22nd. Live data collection gates on B's driving check.

**Sequence (unchanged draft work first):** (1) FP-anchor wiring [active] → (2) mock survival
grader [new, pre-22nd, windowed] → (3) betting movement-vs-outcome backtest [post-draft, no
window] → (4) betting LEVEL [lowest, only if movement proves out].

## 6. PROJECTION SOURCE — the board's projection quality is UNGRADED on clean data (2026-08-10)
- **Trigger (Cory):** is the Sleeper projection number clean, and have we graded FantasyPros
  projections? Answers: (1) NO — exp33's Sleeper grade (0.69 top-decile / 0.82 rank-corr) is
  LEAKED (in-season endpoint, safe=False, disqualified). (2) NO — we've only ever graded ADP,
  never projections from any source.
- **Implies:** we do not actually know the best projection source. The live board uses Sleeper
  PRESEASON projections (fine at draft time, no leak in live use) but that choice is unproven vs
  FantasyPros projections (free, we already parse FP) or a naive/low-regression prior (which BEAT
  our blend on clean data).
- **The catch:** a clean projection grade needs a PRESEASON-FROZEN snapshot — any source whose
  endpoint updates in-season can't be graded retroactively without leaking. So a clean grade of
  past seasons is not recoverable; the honest path is to snapshot 2026 preseason projections from
  Sleeper + FP NOW and grade after the season (same shape as the ADP archive; every un-snapshotted
  day before the season is unrecoverable).
- **Magnitude:** projections drive proj_mean/VORP/VONA/tiers — the entire value side. A better
  source would beat the ADP-anchor swap in impact. But UNKNOWN until graded clean.
- **Recommendation (pre-Aug 22, cheap):** (a) snapshot the 2026 preseason projections from Sleeper
  AND FantasyPros now (frozen, for a clean grade after the season); (b) compare the two on the 2026
  board — do they diverge at Cory's picks (34/41/54…)? If they largely agree, the source choice is
  cosmetic; if they diverge, flag it. (c) Do NOT swap the projection source blind — unlike the ADP
  anchor (which had a clean grade), there is NO clean projection grade to justify a swap yet.

## 7. CONSERVATION TILT — WIRED LIVE as a gated departure (2026-08-11), baseline v3 → v4

- **Trigger (Cory):** "conservedSurvival is built, exported, and exercised only by its own test.
  The app reads s.survival_to_next straight from the engine. So the conservation correction I
  approved IS DOING NOTHING. Wire it through the gate, and make sure it actually reaches the app
  this time rather than being wired to a test."
- **What changed:** `DraftEngine` no longer binds `survival` to `S.survivalProbability`. One
  accessor now routes all five call sites — VONA's `expectedBestAvailable`, the tier-cliff
  exhaustion product, `survival_to_next`, the branch forecast, and the draft sheet — through
  `S.conservedSurvival`. Tilting some and not others would leave the board's expected-best
  disagreeing with the number printed beside the player, on the same screen.
- **Two corrections found while wiring, neither of which was the wiring:**
  - **N was the whole window.** `conservedSurvival` solved for `targetPick - currentPick`, which
    counts MY OWN pick among the departures. Now `ctx.intervening.length`: 6, not 7.
  - **The tilt was one-sided.** `solveTilt` returned null unless the raw mass EXCEEDED the count —
    a guard written when the model over-predicted (v1: 7.279 over 6). Correcting the frozen
    context flipped the sign to 5.258 over 6, so on first wiring the tilt fired **zero times on
    every state** and the baseline did not trip. That was not the wiring failing:
    `conservedSurvival` was measured being called 1,687,612 times with N correct at 6. It was a
    correction that only knew how to push one way while the error had moved to the other.
- **Why two-sided is right, not merely symmetric:** six opponent picks remove six players. A board
  summing to 5.26 expected departures claims fewer players will be taken than there are picks to
  take them. That is not conservatism; it makes every player look **safer to wait on than he is**,
  which is the direction that costs money in a draft room.
- **Result:** conservation ratio exactly **1.000000** on all three canonical states (was 0.876,
  0.900, 0.862). λ 1.26–1.43. **Top-10 ranking and the rule headline are UNCHANGED on every
  state**; composite scores moved. 8 baseline checks tripped, as a gated departure must.

### The two caveats, carried into the gate rather than discovered later

- **ENFORCING THE IDENTITY IS NOT CALIBRATION.** It makes the total right. If the model's *shape*
  is wrong, the tilt yields per-player numbers that are still wrong and now merely sum correctly —
  necessary, insufficient. Calibration needs outcome data this project does not have. Nothing here
  should be read as "survival is now accurate"; it is "survival now stops claiming an impossible
  total".
- **λ IS FITTED PER BOARD STATE, which is a NEW instability.** Two adjacent windows can produce
  different λ, so in principle a player's number could move between renders with no pick
  occurring. The independent model did not have that property. **Mitigation, stated rather than
  assumed:** λ is fitted ONCE per (board version, currentPick, targetPick, N) and memoised in a
  `WeakMap` keyed on the board array, so repeated renders of the same state return byte-identical
  numbers. The instability is real between states, contained within one.

### Reversal, and what it costs

`CFG.CONSERVE_SURVIVAL_ON = false` restores the pre-departure surface **exactly** — asserted in
`survival_honesty` against v3's frozen mass to 1e-6, not assumed. One edit on draft morning. The
app's conservation banner widens its band automatically in that mode, because a raw model that
does not conserve should not paint the banner red on every render of a deliberate revert.

### Open, and NOT resolved by this

The per-player *ordering* within the tilted total is unvalidated. The tilt concentrates correction
where the weight is, which is defensible but untested against outcomes. That is a **post-draft**
question (mock-calibration arm), not a pre-Aug-22 one.
