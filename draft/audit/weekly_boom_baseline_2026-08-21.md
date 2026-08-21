# THE WEEKLY BOOM BASELINE — the null is built, my blind call was FALSE and INVERTED, and the metric I preregistered cannot see the thing that actually happened

**Session D, 2026-08-21.** Builds and grades the null preregistered in
`draft/WEEKLY-BOOM-BASELINE-PREREG-2026-08-21.md` (committed before any rate
existed). Tooling: `draft/backtest/weekly_boom_baseline.py` (new, TERRITORY:
D), tests: `draft/tests/test_weekly_boom_baseline.py` (**12/12**, including
the known-positive/known-negative pair the prereg promised), artifact:
`draft/backtest/weekly_boom_baseline.json`.

**Three findings, in descending order of how much I trust them.**

---

## 1 · THE NULL EXISTS NOW — that was the deliverable

`P(top-12 positional week | position, prior-season tier)`, four target
seasons, QB/RB/WR/TE. **T1 (prior-season top-12 at his position):**

| pos | 2022 | 2023 | 2024 | 2025 | n/season |
|---|---|---|---|---|---|
| QB | 0.574 | 0.518 | 0.466 | 0.436 | 165-176 |
| RB | 0.400 | 0.402 | 0.380 | 0.435 | 164-177 |
| WR | 0.342 | 0.400 | 0.278 | 0.317 | 158-180 |
| TE | 0.510 | 0.481 | 0.466 | 0.400 | 153-163 |

Full T1-T4 table per position × season is in the artifact. **Any weekly-boom
feature is now graded against this and not against nothing.** Coverage: 0
unlabeled scoring rows in all four seasons; cutoff ties 2-9 weeks of 72 per
season, counted rather than quietly broken.

**Two things the artifact refuses to let a reader misuse**, both enforced by
tests so they cannot decay out:

* **The unconditional rate is degenerate and is labeled as such.**
  `P(top-12)` over the whole population is mechanically `12/N_that_week` —
  ~32% at QB, ~10% at WR — and reflects population size, not football. It is
  emitted only so nobody recomputes it independently and quotes it.
* **K and DEF are out of scope with the reason attached.** The component
  store's own `provenance.position_groups` is `["QB","RB","WR","TE"]`; there
  is no kicker or defense row in this population at all.

## 2 · THE BLIND CALL: FALSE, AND INVERTED ON BOTH CLAUSES

The prereg (§4) declared, against zero computed rates: **QB most stable, RB
least**, with the stability metric fixed first (range of the T1 boom rate
across the four target seasons, lower = more stable).

| pos | range | vs. pure sampling noise | shape |
|---|---|---|---|
| **RB** | **0.055** | **0.71×** | no trend |
| TE | 0.110 | 1.35× | declining |
| WR | 0.122 | 1.63× | no trend |
| **QB** | **0.138** | **1.76×** | declining |

**Ranked most→least stable: RB < TE < WR < QB.** I called the two endpoints
and got both backwards. Filed FALSE.

**The obvious mechanical explanation was checked and does NOT account for
it.** A rate near 0.5 carries more binomial variance than one near 0.1, so a
range comparison across positions with different base rates could be an
artifact. Measured: all four T1 rates sit in the 0.28-0.57 band where
`p(1−p)` is flat, giving near-identical standard errors (QB 0.0380, RB
0.0374, WR 0.0362, TE 0.0395). The comparison is apples-to-apples; the
inversion is real, not a scaling artifact. *(The expected-range constant used
for the "vs. noise" column was itself controlled before use — simulated
against the tabulated values for k=2 and k=4 iid normals, 1.126 vs 1.128 and
2.056 vs 2.059. Rule 3f: the probe answering the question got a
known-answer run first.)*

**The one substantive result inside the FALSE: RB's T1 boom rate moves LESS
than sampling noise alone would produce (0.71×).** Prior-season top-12 RBs
convert to top-12 weeks at ~0.40, and that number barely moves. This is the
opposite of the injury/committee-churn story I reasoned from, and it is the
part of this study most worth carrying forward.

## 3 · THE METRIC I PREREGISTERED CANNOT DISTINGUISH CHURN FROM DRIFT — a limitation found BY the result

QB's T1 rate is **0.574 → 0.518 → 0.466 → 0.436**: monotone, four for four.
That is not "unstable" in the sense my prediction meant (random year-to-year
churn). It is a steady one-directional move, and **range (max − min) is blind
to the difference** — it assigns the same score to a sawtooth and a slide.

**This is a defect in my own prereg, not in the data**, and it is recorded
here rather than quietly fixed, because the null in §1 will be reused and the
next person should know what its stability column does and does not measure.

**AND THE DECLINE ITSELF IS NOT A FINDING — stated plainly, because it is
exactly the shape this project keeps catching people promoting.** Three
reasons it stays an observation:

1. **Each single-year step is inside noise.** Largest step 0.056 ≈ 1.05 SE.
2. **The end-to-end move (z = 2.56) is a POST-HOC endpoint comparison**,
   chosen because the series looked like a trend. That is the
   garden-of-forking-paths, and picking the endpoints after seeing the shape
   is how a null becomes a headline.
3. **Monotone runs are cheap.** P(monotone run of 4) = 2/4! = 0.083 per
   position; across four positions **P(at least one) = 0.29** — and **two of
   my four are monotone** (QB and TE). Finding one monotone series here is
   the expected outcome, not a signal.

**Re-test trigger, filed instead of a claim:** if QB's T1 boom rate comes in
below ~0.44 again in 2026 — a prediction made *before* that season rather
than after — the decline becomes worth a real test with the shape declared
in advance (and a matching check on whether QB T4 is rising, which would be
the flattening mechanism). Until then it is a curiosity with a name on it.

## 4 · THIS ITEM WAS PARKED ON A BLOCKER I GOT WRONG

Recorded in the prereg's §0 and repeated here because it is the reason this
work exists at all. On 08-20 I replied in ROUTES that this ASK was blocked:
*"no clean full-NFL-universe position crosswalk exists in this repo."* I had
checked two candidate sources and concluded the scoring population could not
be labeled.

**The source I missed is the one the store is built from.**
`nflverse_weekly_points_<season>.json`'s own `_note`: *"REBUILT OFFLINE from
the committed component store… Population is inherited from the [component
store]."* So `component_stats`' per-player-week `pos` covers it **by
construction** — 100.0% in all five seasons.

**That 100% is a tautology and is labeled as one in the artifact and pinned
by a test.** The two files share a population by definition; no other number
was reachable. It settles the question precisely *because* there is no join
to lose — but it is not evidence of a healthy join, and a future reader who
takes it as such will be wrong.

**What the blocker got right, for a reason I never gave:** K/DEF really are
absent from this population. I stated a narrow true thing as a blanket false
one, and parked four positions of buildable work on it for a day.

**(1) Implies?** Any other item parked on a "the data isn't there" premise in
my own queue deserves the same re-check — a stated blocker decays exactly
like a stated count, and mine went unexamined until an unrelated study
happened to use the missing piece. **(2) Invalidates?** Nothing shipped; the
cost was a day of delay on this one item. **(3) Routed:** nowhere outward —
this one is mine, and the correction is the deliverable alongside the null.
