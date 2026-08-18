# STOP TRYING TO BEAT SLEEPER. MODEL WHERE SLEEPER IS WRONG.

**Relay, 2026-08-18, for A. A PROPOSAL, not a ruling — and deliberately NOT filed
into A's inbox before the draft.** Cory asked for ideas on structuring the next
projection lab. Read `BLEND-SEARCH-DESIGN.md` first; this assumes it and adds one
reframing plus four smaller things.

---

## 0 · THE HEADLINE IS ALREADY IN OUR OWN DOC, AND IT IS NOT A NEW IDEA

> *"The current arm set is five variants of ONE axis; Tier 1 alone is the single
> biggest improvement available."* — `BLEND-SEARCH-DESIGN.md` §2

**Nothing below matters more than that sentence.** Five arms on one axis is not a
model search, and no blend of five correlated arms will beat Sleeper. If the next
lab does only one thing, it should be Tier-1 breadth — Vegas, usage, air
yards/EPA, Kalshi, pace, props — one arm each, one sensible weight.

The rest of this document is about **how to aim** that work.

---

## 1 · THE REFRAMING: PREDICT THE RESIDUAL, NOT THE POINTS

**Today every arm predicts `actual`. Predict `actual − sleeper_proj` instead.**

`own_v6` is "close but not better" because it is spending almost all of its
capacity **re-deriving what Sleeper already knows** — that Gibbs is the lead back,
that Detroit scores, that a WR3 sees fewer targets. Sleeper has that. Every point
of accuracy we spend rebuilding it is a point not spent on what Sleeper misses.

**Ship `sleeper_proj + λ · residual_hat`.**

Four things follow, and they are why this is worth A's time:

1. **It cannot be worse than Sleeper by construction.** `λ = 0` *is* Sleeper. The
   champion is nested inside the challenger, so "we did not beat it" and "we made
   it worse" become the same measurable quantity instead of two different failures.
2. **The null is free and unarguable.** The BEST-OF-K / random-weight machinery
   still applies, but the first null is simply **λ = 0**. An arm that cannot beat
   λ = 0 has no product — no interpretation needed.
3. **It is honest about the actual goal.** The goal in
   `PROJECTION-PROGRAM-2027.md` is not *a better model*, it is **a better
   published number**. Residual modelling optimises the number directly.
4. **It shrinks the search space, which is the whole problem.** The doc's binding
   constraint is effective sample size against infinite blends. A residual target
   has far less variance to explain than a points target, so the same 17 weeks buy
   a much sharper answer.

**⚠️ The honest risk, stated up front:** residuals are noisier than levels, and a
λ fitted on noise will look like signal. This is P3's death exactly. So λ is
fitted **walk-forward only** (weeks 1..t → predict t+1), it is **non-negative**,
and it is reported **with a CI**, not as a point estimate.

---

## 2 · FIT λ PER POSITION, AND EXPECT IT TO BE ZERO SOMEWHERE

The goal already says **3 of 4 positions**, so a global λ is the wrong object.

**Two predictions worth writing down before the data is seen:**

- **λ_QB ≈ 0.** P37 already suspects our QB projection is genuinely worse than
  both sources, not a population artifact. If that is true, the right answer at QB
  is *defer to Sleeper*, and a per-position λ will say so by itself. **A model
  that knows where to shut up is the product**, and it is what P39 (per-position
  source selection) is reaching for.
- **λ_RB > 0, and RB is where I would look first.** Measured on today's board:
  the board ranks RBs a mean **+49.6 slots below the market**, permutation
  **p = 0.0024**, while WR/QB/TE are all null (register 2d). Something at RB
  disagrees with the market systematically. Separately, P58 predicts RB is the one
  position where opponent strength survives an offseason. **Two independent lines
  pointing at the same position is where to spend the first week.**

---

## 3 · GRADE ON THE PLAYERS CORY ACTUALLY STARTS

A model that is better across 500 players and worse across the top 100 is
**worse**, and MAE over the full population will call it better.

Weight the grade by startability — or at minimum report the headline on the
rostered pool. P63 gets at this with top-tier precision (P@12/P@24); I would make
it the **primary** report rather than a corroborating one. Start/sit accuracy is
already the program's headline metric, which is right; the population it is
computed over should match.

---

## 4 · TWO METHOD FIXES THAT ARE CHEAP AND LOAD-BEARING

**(a) Cluster-bootstrap by TEAM-WEEK, not player-week.** The doc correctly warns
that ~8,500 player-weeks are not 8,500 independent observations. The concrete fix
is to resample **team-weeks**: players in the same team-week share game script,
weather, pace and whether the game was a blowout. Treating them as independent
inflates confidence *exactly* where the doc says our effective N is smallest —
which is how a 36th-percentile result (P3) gets mistaken for an edge.

**(b) Do BEST-OF-K BEFORE the arm count grows, not after.** The doc calls it *"the
one this program does not yet have and needs most"*, and P31 grades it 09-10.
With five arms it barely matters; with fifteen it is the difference between a
finding and a coin flip. **It is cheapest to build now, while the answer it gives
is boring.** Building it after the arm count grows means building it under
pressure to validate something someone already wants to ship.

---

## 5 · THE FIRST EXPERIMENT, CONCRETELY

**EXP: residual arms, Tier 1, per position.**

- **Target:** `actual − sleeper_proj`, this league's scoring, weekly.
- **Arms:** one per axis, per §2 of the blend doc. No blends in run one.
- **Fit:** non-negative λ per position, walk-forward, weeks 1..t → t+1.
- **Champion:** `λ = 0` (i.e. Sleeper unmodified).
- **Report:** per-position λ with a team-week cluster-bootstrap CI; start/sit
  accuracy on the startable pool; BEST-OF-K placement of the winner.
- **Ships if:** λ > 0 with a CI excluding zero at ≥2 positions, **and** the
  start/sit gain survives on the startable pool, **and** the winner is not inside
  the BEST-OF-K null band.
- **Nothing ships from run one** regardless — same rule as every other prereg here.

**Why this is a good first run even if λ is zero everywhere:** a per-position λ of
zero is a *publishable, useful answer* — it says Sleeper is not beatable with the
signals we hold, which retires a question the project has been circling since
August and redirects the effort. **A null here is worth as much as a hit**, which
is not true of most of the arms we have run.

---

*Not filed into `## TO: A` before 08-22 — the relay committed to adding nothing to
that inbox before the draft. Cory has the pointer; A can pick this up after.*

---

# AMENDMENT 1 — A, 2026-08-18, COMMITTED BEFORE ANY FIT

**Cory's ruling, verbatim: "okay! lets get V7 rolling and if its better, lets
use it."** Two consequences, recorded here so the grade IS the decision:

1. **Promotion is PRE-AUTHORIZED.** If the residual challenger clears §5's
   ships-if bar on the graded folds, it ships as the published projection —
   no second ask to Cory at grade time. The bar itself does not move.
2. **The lab starts tonight**, not post-draft (Cory lifted the gate). Nothing
   reaches the live draft board before 08-22 regardless.

**MEASURED CONSTRAINT THAT RESHAPES RUN ONE (found before fitting, recorded
before fitting):** no historical WEEKLY baseline store exists. Measured, not
remembered — `exp_fp_hist_proj.json` is preseason season-totals with only
metrics retained; `proj_series.json` starts 2026; Sleeper weekly is
unarchived anywhere. Therefore:

- **The WEEKLY λ fit (this doc's §5 as written) begins at week 1 with the
  live capture the loop already performs.** P94/P95 remain its blind
  predictions, untouched.
- **What runs tonight is the SEASON-LEVEL residual lab on the same nested
  frame:** target = `actual_season − sleeper_season_proj`, 2025 fold — the
  one season whose Sleeper baseline passed every leak gate — using the
  per-player rows the sleeper-vs-fp workflow retains
  (`sleeper_vs_fp_rows_2025.json`, dispatch queued 08-18).
- **Features:** C4 (`rb_offseason_features`) and C6
  (`qb_context_receiver_features`) — both leak-free by construction
  (prior-season inputs only). **Their blind predictions are already filed:
  P64 (C4 helps RB mid-board more than top-12) and P81 (C6 helps TE more
  than WR), both filed before either feature store produced a graded
  number.**
- **Fit protocol for a single-season fold (one row per player, no time
  axis):** non-negative per-position λ, **player-split cross-validation
  clustered by NFL TEAM** (all of a team's players stay on the same side of
  every split — the season-grain analogue of §4a's team-week rule), 200
  splits, λ chosen on the fit half, error reported on the held half only.
- **Report:** per-position λ with team-cluster bootstrap CI · within-position
  MAE/Spearman vs the λ=0 champion on the held halves · the startable pool
  (top-24 QB/TE, top-48 RB/WR by baseline) reported beside the full
  population · BEST-OF-K over {λ=0, +C4, +C6}.
- **Ships-if for THIS run: nothing ships from run one** (§5's own rule —
  Cory's pre-authorization applies to the graded bar, and one
  cross-validated season is not it). What run one buys: the first honest
  per-position λ, the first grades feeding P64/P81, and the harness the
  weekly lab inherits at week 1.
- **Fold 2 (2024) is BLOCKED on data, stated rather than implied:** Sleeper
  2024 failed its leak gates and FP 2024 rows were not retained. The
  unblock is a re-run of the FP historical fetch with row retention — filed
  as a follow-up, not assumed.
