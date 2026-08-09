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
  uncovered (all deep; top-130 ~100% covered). **APPROVED by Cory — wiring at build.py
  adp seam; stamp `adp_source: mfl+ffc-fallback`.** (EXP-MFL-SWAP.md)

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

## 3. FANTASYPROS AS A THIRD SOURCE — PENDING MEASUREMENT (not yet a decision)
- **Found:** source grade is FFC-vs-MFL only; FantasyPros structure captured in the probe
  but the parser isn't built.
- **Implies:** could corroborate, sharpen per-region, or change the anchor verdict.
- **Status:** measurement pending — build the parser, add it to the grade, THEN this
  becomes a decision (or confirms #1). Not inert; it's on the model queue.

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
