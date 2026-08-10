# EDGE LEDGER — our verified edges, ranked by expected dollars

The single artifact SESSION-A habit 8 keeps current. Each edge: measured size · confidence
· what it rests on · **what was actually searched** (habit 9) · what would sharpen it. When
a finding lands, update this and re-sequence the queue to match. Ranking is by expected
dollars weighted by breadth (an edge touching every pick outranks one at the margin, at
equal per-decision size).

_Last updated 2026-08-09 (all-terms participation test + FP SSR discovery)._

---

## 1. MARKET READ — rank off a board graded against realized outcomes  ← LARGEST
- **Size:** touches **every pick**, not the ~2 contested ones. MFL orders realized value
  better than FFC (ρ 0.40 vs 0.28 in 2023), and the edge is in **rounds 1-7 where Cory
  drafts**. Per-pick rank moves are modest (top-50 median 18) but structural × every pick.
- **Confidence:** DIRECTIONAL. **Searched: 2 sources × 2 seasons, resting substantially on
  2023** (2024 near-zero for both); thin per-cell n (10-18). A composite did not beat MFL.
- **Rests on:** exp_source_grade (EXP-SOURCE-GRADE.md, EXP-MFL-SWAP.md).
- **Uncopyable:** required 3 seasons of outcomes + a grading harness; no opponent has graded
  their source. This is why it's the biggest verified edge — breadth + moat.
- **Why it's #1, now CONFIRMED by the participation test (2026-08-09):** the all-terms test
  found our whole measured edge is **the mask + the VALUE ANCHOR** (removing the anchor costs
  $362; every adjuster is decoration or a drag). The value anchor = *ranking off the ADP
  board*. So board quality directly sets the value of our single biggest term — the source
  question isn't a side control, it's the input to the largest earner. This elevates it.
- **THREE-WAY LANDED (2026-08-09): FantasyPros beats FFC in BOTH seasons → the edge is REAL
  and FORMAT-INDEPENDENT.** n-weighted ρ: 2023 FFC 0.281 / MFL 0.397 / FP 0.307; 2024 FFC −0.03
  / MFL 0.070 / FP 0.075. FP (half-PPR, OUR format) > FFC (half-PPR) both years, so the
  market-read edge is not a format artifact. MFL edges FP in 2023 only, carrying a full-PPR
  handicap (2023 receiver-friendly) — the confound we refused to act on. **Anchor decision:
  FantasyPros** (same format, no handicap, wins the early rounds where Cory drafts, feeds the
  value anchor the participation test showed is half our edge). Composite beats no single
  source — blend nothing. Still 2 seasons/thin/leans-on-2023. (DECISIONS-NEEDED #1)
- **Sharpen:** ① wire FP onto the live 2026 board (block cleared). ② 20yr nflverse + public
  leagues at scale for a real CI on the source gap.
- **A 4th/5th source (NFFC, FantasyData) — GATED ON THE THREE-WAY RESULT (Cory, 2026-08-09).**
  The probe flagged both, untouched. They are NOT equivalent: **NFFC is a different CROWD**
  (high-stakes real-money drafters), a structurally different signal — the way Underdog's
  ceiling-weighted best-ball board could price differently from redraft consensus.
  **FantasyData is just another free consensus** (redundant if FFC/MFL/FP already agree).
  **Decision rule:** run the three-way first. If FFC/MFL/FP **correlate tightly by region**,
  a 4th free-consensus source lands in the same place → **close the question** (skip
  FantasyData; NFFC only marginal, since its value would be in disagreement that isn't
  there). If they **disagree meaningfully by region**, a different crowd becomes MORE
  interesting → **NFFC earns a parser** (test whether the money crowd prices the
  disagreement regions differently); FantasyData still skippable. Caveat if NFFC is built:
  it's a different-format context too (deep/high-stakes), so grade by RANK to cancel the
  format offset, same discipline as MFL. **The three-way grade decides this — don't build a
  4th blind.**
- **Status:** three-way landed → **anchor on FantasyPros** (DECISIONS-NEEDED #1, supersedes the
  MFL-only lean); wire FP onto the live 2026 board once the endpoint reproduces.

## 2. KEEPER-NEED RULE — follow ADP within startable need  ← LIVE
- **Size:** b0_need beats b0_pure **+$258** [CI 206,309]; value-depth beats fill-first
  **+$51** [17,88]. At the MARGIN (masks filled positions), not every pick.
- **Confidence:** STRONG. **Searched: fill-first vs value-depth, across all 10 seats, both
  dossier + uniform opponents, alt keeper slates** — held everywhere; cleared the paired null.
- **Rests on:** exp_keeper_b0. **LIVE** on the pick-34 board (needrule.js).
- **Sharpen:** public Sleeper leagues at our format (test it beyond our 3 seasons).

## 3. WEEKLY-HIGH POOL EMPHASIS — 37.5% of the pot, ignored league-wide  (in-season)
- **Size:** large — 37.5% of the pot pays on weekly-high, and the league underplays it.
- **Confidence:** structural (an accounting fact, not an estimate).
- **Sharpen:** the in-season lineup-capture work (exp35) + the weekly grade.

## 4. PLAYER-EVALUATION BIASES — young underranked / aging overranked  (potential, unsized)
- **Size:** unmeasured in dollars. 2nd-year players are the most underranked-vs-market
  (rank gap +61.6 vs vet +43.0, cross-sectional). exp33: the blend over-regresses at the
  top. Age-cliff (mirror) not yet tested.
- **Confidence:** directional; **searched only model-vs-market on the current board** — a
  bias SHARED by model+market needs realized outcomes (20yr nflverse), not tested yet.
- **Sharpen:** 20yr nflverse by experience/age bucket; the regression-weight sweep's dollar
  arm (DECISIONS-NEEDED #2, currently OPEN not settled).

---

## PROGRAM-LEVEL AGENDA — the sample ceiling is the binding constraint (2026-08-09)

**ROUTE TO THE EXTERNAL SAMPLE — FOUND (2026-08-09, exp_route_probe).** The gate on this whole
program is "can we obtain real leagues at our format at volume." Answer, after a proper search:
- **Sleeper is a dead end:** crawl-from-our-league exhausts at 16 calls (members cluster); ID
  enumeration is precluded (snowflakes, ~1e-11 hit rate); no listing/search endpoint (4x 404).
- **MFL is the route:** `TYPE=leagueSearch` returns THOUSANDS of PUBLIC leagues (11,283 across
  terms) with readable settings (franchises, scoring, keepers, starters) → format-filterable to
  10-team/half-PPR/6ptTD/keeper. We already have an MFL fetcher (mfl_adp.py). **The post-draft
  sample program is VIABLE.** Concrete build: leagueSearch → filter to our format → pull
  TYPE=draftResults + weeklyResults per matched league → the real-rooms sample for the
  strategy/interior questions; grade by RANK (per-league scoring varies) to cancel offsets.
- **Decomposition that matters:** the PLAYER-VALUE questions (pace→projection error, exp33
  over-regression, does ceiling/tier predict realized value) need PLAYER-SEASONS, not leagues →
  20yr nflverse, obtainable regardless. Only the STRATEGY-in-real-rooms question needs leagues →
  MFL. In-season data accrues weekly regardless. So NONE of the three halves is blocked.

Cory's observation, and I agree: nearly every edge above rests on **3 seasons of one
league, n in the tens, provisional**. Re-measuring against the same data gives *clearer*
answers (better design), never *stronger* ones — the intervals stay wide because the
sample is small. So the EVSI of another 3-season experiment is capped, while two
sample-ceiling breakers have much higher EVSI:
- **20yr nflverse** for anything about PLAYER EVALUATION (rookie/2nd-yr bias, age cliff,
  the regression weight, injury base rates, positional value by round) — thousands of
  player-seasons turn directional guesses into real answers. **Quantified ROI (2026-08-09):**
  the realized-outcome grade holds a MEDIAN OF 6 obs/cell at (band × position) today; a
  round×pos×strength scan is ~1-2/cell (empty). nflverse ≈ 3-4k player-seasons ≈ **~55 obs/cell,
  an ~8-10× jump** — precisely the threshold where the broad exploratory scan (SESSION-A: two-
  stage search) stops generating phantoms and its follow-up becomes powerable. THAT number is
  what the ingest buys; below it, a broad term-by-region-by-strength scan is a noise generator.
- **Public Sleeper leagues in our exact format** for the DRAFT RULE (keeper-need, dead
  zone, reaching, participation) — tests whether it's a property of the FORMAT or an
  artifact of our 3 seasons.

**My call on the ordering (refining Cory's retraction of the post-draft framing):**
1. **Pre-Aug-22, the draft-actionable 3-season work still wins** — the sample ingest can't
   land before the draft, and only the 3-season work changes what the pick screen shows on
   the 22nd. So: **FantasyPros** (cheap, improves the anchor everything else is tested
   against — do it first regardless) → **need-by-phase factorial** (Auto is live 3h on
   draft day; the need-WEIGHT ramp is unraced) → wire MFL → participation test.
2. **The gating uncertainty is discoverability/settings-match, and it's cheap to resolve —
   PROBE IT NOW** (standing rule: probe, don't infer; the MFL blocker dissolved when
   probed). Can Sleeper return 10-team/half-PPR/6pt-passTD leagues by search or id
   enumeration? Does nflverse re-score cleanly to our rules? A probe before the 21st tells
   us whether the post-draft plan is even obtainable — worth knowing now, not on the 21st.
3. **Post-Aug-22, the sample-ceiling program outranks any further 3-season experiment.**
   Design it as ONE ingest per source answering EVERY open question in the same pass (the
   ingest is the cost; each question is a fraction of it). This is the top post-draft item.

## NOT edges (synthesis corrections — recorded so they stop being cited as edges)
- **Dead zone (mid-round RB).** Real as a pattern, but exp43 found **the market already
  prices it** — so it is NOT an independent exploitable edge, it is a caveat the market
  read already captures. Reclassified from "edge" to "priced."
- **Reaching early.** Neither pays nor hurts (exp43, within-position, FDR-survived) —
  scope: our league only.
- **Adjuster sliders / ceiling tilt / auto-adjust.** **NOT a top edge — and now MEASURED as a
  net DRAG.** The all-terms participation test (exp_participation, 400 paired rooms, 2026-08-09)
  built each adjuster up from the mask+value core: **core $704; core + all six adjusters at
  engine default $407.** On the clean core NOTHING new earns beyond mask+value — need-weight
  +6.5 [−8,+20], ceiling −4.8 [−26,+17] (no clean weekly-high gain — my "shape pays" prereg
  guess did NOT survive de-confounding), bye ~0; **tier −235, risk −143 actively hurt** at
  fair-fight strength. **stack reads −63 here but that is an INSTRUMENT ARTIFACT** — grade_room
  draws weekly scores independently (no within-team correlation), so this harness *can't* reward
  a stack; the sound instrument is exp6/stack_sweep (rho=0.35), which found stack a **WINNER
  (+$196 @ dose 0.5)** — that verdict STANDS. This RETIRES the weak-scope "defaults win" null
  (it raced 3 shapes; this is a build-up over the panel). **Scope honesty:** need+value faithful;
  tier/risk/ceiling/bye are PROXIES (SIGN robust, harmful $ an upper bound at a ~30-pt nudge);
  stack instrument-limited here. → DECISIONS-NEEDED #3: draft-day Auto = mask + value + a stack
  tilt (~0.5); tier/risk off; need/ceiling/bye ~0.
- **The keeper-need MASK vs the need-WEIGHT ramp (MEASURED 2026-08-09, exp_need_phase).**
  The MASK (startable-cap) is a real, large earner — **~$443** vs no-mask over 300 paired
  rooms (consistent with the $258 keeper-B0). Auto's additive need-**WEIGHT ramp**
  (0.35→0.9→1.45→1.3), by contrast, is **near-decoration**: the flat response curve peaks at
  a small w≈0.5 (+$16, barely separable) and decays; **Auto's actual ramp is +$4.9, CI
  [−13,+23] — not separable from zero — and is beaten by a flat 0.5** (ramp−best_flat −11.3).
  Ramping the need-weight by phase adds nothing. This is a *raced* result (a swept curve +
  schedules, not a 3-point race), so unlike the sliders-null above it is not weak-scope —
  though still 3-season/our-league (public leagues would firm it). → DECISIONS-NEEDED:
  simplify Auto (keep the mask, flatten/drop the need-weight ramp).

## ⚠️ Findings to RE-OPEN or mark provisional (habit 9 instrument/scope audit)
- **Conditional-mining null (policy_tournament §6).** Ran **before heterogeneous rooms and
  before the within-position confound fix** — instrument since corrected. Mark **provisional**;
  re-run under the current harness before citing "no conditional edges exist."
- **Slider-defaults null.** Scope = 3 configurations, not a grid (above). Provisional.
- **Source grade.** Three-way now COMPLETE (FP endpoint found): FP > FFC both seasons resolves
  the format confound (edge is real, format-independent) → anchor on FantasyPros, not MFL.
  Still 2 seasons/thin — a real CI needs the nflverse/public-league scale-up. (DECISIONS-NEEDED #1)

## RB-vs-WR "dominance" (Cory's 2024 observation) — TESTED, it's a 2024 FLUKE (2026-08-10)
- **Cory's read:** "5 RBs outscored every WR but Chase in 2024 — does the board reflect RB
  dominance?" exp_value_pockets showed RB top-band realized (~182) > WR (~165) POOLED, which
  looked like corroboration. **It was almost entirely 2024.**
- **exp_positional_persistence (per-season split at Cory's early picks, overall 31-70):**
  RB−WR realized gap by season — **2023: −8.7 · 2024: +69.3 · 2025: −41.3.** Pooled gap **+1.7**
  (≈ zero). RB beat WR at his early picks in **1 of 3 seasons.** Cells are NOT thin (n 8-18),
  so the split is powered enough to call — this is a real null, not an underpowered shrug.
- **DECISION: do NOT tilt RB early.** Cory's 2024 observation is true for 2024 and does not
  generalize; 2025 swung hard the other way (WR +41). Tilting the board toward RB on a 2024
  memory is precisely the single-year-fluke mistake the persistence rule exists to catch.
- **Methodological catch (habit 9):** the POOLED value_pockets "RB > WR at the top" was carried
  by one season — pooling masked year-to-year sign instability, same shape as the regional-
  structure diagnostic. Mark value_pockets' cross-position RB>WR read **provisional / 2024-driven**;
  the within-position dead-zone finding is unaffected. Pre-registered rule + test locked so a
  data refresh can't move the bar to fit a result. (exp_positional_persistence.json, test 4/4)

## STRATEGY TOURNAMENT — which draft strategy won the most $ 2023-25? (2026-08-10, Cory's Q)
- **Q:** replay Cory's seat under different strategies vs the real room, grade in $, all 3 years,
  with an injury rule. **Signal:** the room's own draft order that year = market ADP (no lookahead).
  **Injury rule:** real score in weeks played, own season PPG in weeks missed (credit the pick for
  a healthy slate at its rate; keep played-week variance). Both real and neutralized $ reported.
- **ANSWER — no single strategy won all three years**, and the "winner" FLIPS with the injury
  treatment (neutralized #1 hero_rb, real #1 robust_rb). Season winners: hero_rb / robust_rb /
  hero_rb. The whole strategy spread is **~$725 over 3 years ≈ noise** (a weekly-high hit is
  $100-150). So there is no clean "draft THIS way" edge from positional discipline.
- **What IS robust:** RB-early disciplines (robust_rb top on real $2500, hero_rb top on neut) and
  **need_value = the measured mask+value rule** ($2250 real, 3rd) cluster at the top on BOTH
  treatments; **wr_feast/zero_rb sit at the bottom** both ways. Reconciles with the RB/WR
  persistence null: that null was Cory's MIDDLE picks (overall 31-70); the tournament's edge is
  grabbing ELITE RBs at the very top (picks 5/15) — different pick range, not a contradiction.
- **THE DOMINANT FINDING (matters more than any strategy):** the oracle ceiling (perfect realized
  selection, lookahead) is **~$1975 ABOVE the best implementable strategy over 3 years**
  ($5100 vs $3125). **Player SELECTION dwarfs positional discipline** — the money is in hitting
  the picks (value/accuracy), which is exactly why the FP anchor + the regression-weight fix
  (#1, #2) are worth more than the positional doctrine. Cory's real drafts land mid-pack (~$400
  below the top real strategy — within noise of most).
- **Scope:** 1 seat × 3 seasons, threshold-lumpy $, fixed (untuned) positional rules; injury
  rule fills byes too (~1/17, equal to all). Installs nothing. (exp_strategy_tournament.json, 6/6)

## INVERSE ADJUSTER — where would the dial be set to get the best per-round picks? (2026-08-10, Cory's Q)
- **Q:** take the top-3-by-value players available at each of Cory's picks and solve backwards for
  the adjuster setting that selects one; report where none reaches. Signals (in-hand): MARKET = the
  room's draft order that year (all 3 seasons); VALUE = walk_forward from prior season (2024-25).
- **TWO self-corrections en route (the valuable part):** (1) ranking by RAW realized crowned a QB
  every round — fixed the target to VORP (points over positional replacement). (2) the best-VORP
  "unreachable" bucket was then dominated by K/DEF — unforecastable, trivially streamed (the
  injury-analog) — so scored SKILL only (QB/RB/WR/TE); K/DEF reported as correctly-unreachable.
- **ANSWER:** best-available by MARKET already surfaces the top-3-VORP skill player in its top-3
  at **19/41 picks (46%)** — no special dial. A value-over-market TILT recovers **4 more** (2024-25).
  **8 are UNREACHABLE** by either signal — breakouts (rookie Jayden Daniels, JSN's leap) no setting
  reaches without fitting noise. **Third independent confirmation of the measured mask+value rule**
  (after participation + strategy tournament): the knobs that earn are value + best-available.
- **BIG CAVEAT (kept, not buried):** 25/41 "best value available" were ELITE QBs the market faded —
  but single-QB VORP OVERSTATES value in our 1-QB league (start one; top-10 QB is streamable),
  which is why the dollar-graded tournament did NOT reward QB-early. VORP flags QB as unclaimed,
  the dollars say the room is right to fade it → do NOT tune the adjuster to chase QB.
- **The real leak is Cory's own reaching**, not a missing adjuster: repeated deep-negative-VORP
  picks (Quentin Johnston -163, Joe Burrow '25 -160, Braelon Allen -136, Keon Coleman -110) — value
  destroyed by reaching past best-available. The fix is behavioral (take best-available value), not
  a new knob. (exp_inverse_adjuster.json, 4/4 tests)

## ⚠️ RETRACTION — the "Sleeper projections dominate" number is LEAKED (2026-08-10, Cory caught it)
- **What I claimed (WRONG):** that Sleeper consensus projections grade 0.69/0.63 top-decile (rank-corr
  0.82), far above our walk_forward model, so "the live board is already on the best projection source"
  and lowering the regression weight is lab-only with no board upside.
- **The contamination:** exp33 itself marks `sleeper_proj` **safe=False** — `/projections/nfl/regular/
  {season}` is updated IN-SEASON, so a retroactive fetch for a past season carries post-draft info.
  exp33's own words: its "~0.8 rank-corr vs the real market's ~0.4 is the leak's fingerprint," and it
  is **DISQUALIFIED from the verdict**. I quoted the disqualified number as if it were clean. Cory
  flagged exactly this.
- **The CLEAN picture (decision-time-safe sources only):** naive (raw prior pts) 0.59 > our_blend
  (walk_forward) 0.41-0.51 > FFC-ADP 0.31. We have **NO clean grade proving Sleeper-preseason is best.**
  The live board uses Sleeper PRESEASON projections for 2026 (legitimate at draft time — no leak in
  live use), but "it's the best source" is unproven.
- **Unaffected:** the FP ANCHOR decision (#1) — ADP is decision-time-safe (set preseason, no leak);
  that grade is clean and stands. Only the PROJECTION-source claim was contaminated.
- **The deeper rule:** a clean projection grade needs a PRESEASON-FROZEN snapshot; ANY source whose
  endpoint updates in-season (Sleeper, likely FP) can't be graded retroactively without leaking. So the
  only honest path is to snapshot 2026 preseason projections NOW (Sleeper + FP) and grade after the
  season — same shape as the ADP archive. → DECISIONS-NEEDED #6.
