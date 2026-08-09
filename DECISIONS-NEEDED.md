# DECISIONS NEEDED — findings that imply a gated change

Standing rule (SESSION-A.md habit 7): a finding that implies a change with unbounded
blast radius goes HERE as a decision with evidence — never left inert in a JSON file.
Each: what was found · what it implies · magnitude · confidence · cost of inaction ·
recommendation. Cory's call, made with the evidence. Auto-adaptable findings (bounded
blast radius) are NOT here — they change on their own and say so.

Audit date: 2026-08-09 (swept every recorded verdict in draft/backtest/*.json + *.md).

---

## 1. ANCHOR SOURCE: rank the live board by MFL, not FFC — ✅ APPROVED 2026-08-09, WIRING
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
  frame), **bye ~0**, and **tier −235 / risk −143 / stack −63 actively HURT** (they pull picks
  off the value anchor toward a mechanism no payout rewards). Value anchor removal costs $362 —
  it and the mask are the earners.
- **Implies:** Auto should collapse to **mask ON + value anchor at default + all additive
  adjusters at/near zero.** The war-room slider panel should say which controls do anything
  rather than presenting eight equals.
- **Magnitude:** the harmful dollar figures are an **upper bound at a uniform ~30-pt nudge**
  (see caveat) — the ROBUST claim is the SIGN/ordering: no adjuster earns; at any strength big
  enough to move a pick, tier/risk/stack lose. The win is a large **robustness/legibility**
  gain plus removing a measured drag.
- **Confidence — split by faithfulness:** **need-weight (drop/flatten): STRONG & FAITHFUL** —
  need_signal is the exact harness term, and exp_need_phase agrees. **tier/risk/ceiling/bye/
  stack: DIRECTIONAL via PROXY** — computed from the same board fields the engine uses but not
  the engine's exact functions, so a proxy null bounds the *mechanism*, it doesn't by itself
  convict the *live term*. The proper instrument to convict them is a faithful JS-engine
  ablation (queued, not built).
- **Cost of inaction:** Auto drives six hand-built terms on draft day, at least two of which
  (tier, risk) measurably drag against the value anchor; the panel teaches distrust by
  presenting inert/harmful controls as equal to the two that matter.
- **Recommendation (GATED — the live pick screen, 13 days out):**
  1. **DO NOW (robust+faithful):** flatten Auto's need-weight ramp to a flat ~0.5 (or drop the
     additive need term; mask stays). Zero risk to the measured edge.
  2. **DRAFT-DAY PRESET (recommended):** run Auto as **mask + value(1.0)**, with tier/risk/
     ceiling/bye/stack at **0** (or ceiling left at its harmless default 0.65 — it's ~0, not
     negative). This is the "flat preset on draft day" Cory floated — defensible, legible,
     sheds the measured drag.
  3. **BEFORE ripping the live terms out of engine.js:** build the faithful JS-engine ablation
     to convict tier/risk/stack on the real functions (proxy caveat). Until then, the *preset*
     (weights→0) achieves the same draft-day effect without deleting code.
  - The autoWeights edit is staged and ready to bundle; **Cory's call on scope before Aug 22.**

## 4. FANTASYPROS AS A THIRD SOURCE — BLOCKED ON ENDPOINT DISCOVERY (not yet measurable)
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
