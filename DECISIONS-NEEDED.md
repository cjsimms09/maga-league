# DECISIONS NEEDED — findings that imply a gated change

Standing rule (SESSION-A.md habit 7): a finding that implies a change with unbounded
blast radius goes HERE as a decision with evidence — never left inert in a JSON file.
Each: what was found · what it implies · magnitude · confidence · cost of inaction ·
recommendation. Cory's call, made with the evidence. Auto-adaptable findings (bounded
blast radius) are NOT here — they change on their own and say so.

Audit date: 2026-08-09 (swept every recorded verdict in draft/backtest/*.json + *.md).

---

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

## 2. REGRESSION / SHRINKAGE WEIGHT: the blend over-regresses at the top — OPEN
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
       scale artifact. But at w≈1.0-1.5 it's separably **+$23-26** (CI excludes 0) — a real,
       well-participating positive. Single-run + murky mechanism (weekly-high split ~0) → REPLICATE
       before raising, but zeroing it turns off a separably-positive term that clearly participates.
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
