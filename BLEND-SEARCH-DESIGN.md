# SEARCHING AN INFINITE BLEND SPACE WITH 17 WEEKS OF DATA

**Cory, 2026-08-18:** *"we need to try each of these individually but also track
different blends of them their are infinite options and we need to find the right
ones"*

He is right about the space and right that we have to search it. **The reason this
document exists is that the obvious way to do it will produce a beautiful number and
a worthless model**, and we have today's own evidence for that, not a textbook's.

---

## 1. THE TRAP, WITH TODAY'S RECEIPTS

**P3 (Cory's expert-skill arm) died exactly here.** Expert skill genuinely persists
(ρ 0.19). Selecting the top quartile on 2023–24 and evaluating on 2025 produced
**+0.0009 over the all-expert consensus — the 36th percentile of 200 random subsets
of the same size.** It looked like a real edge and was noise. **P4 died the same way**
across three arms, all landing *below* the shuffle median.

Both would have shipped without a null attached. **A blend search multiplies that
risk by the number of blends tried**, and "infinite options" means infinite chances
for one of them to look good by accident.

**The honest constraint:** a season is ~17 weeks. Roughly 500 players/week gives
~8,500 player-weeks, but they are **not 8,500 independent observations** — the same
players, the same teams, the same offenses recur every week. Effective sample size is
far smaller than the row count, and it is what bounds how many blends we can honestly
choose between.

---

## 2. TWO TIERS, AND THE SECOND ONE IS NOT A GRID

### Tier 1 — SINGLE-AXIS ARMS (main effects). Do this first, always.

One arm per signal, at one sensible weight. Vegas · usage (`tgt_share`) · air
yards/EPA (`ay_share`, `wopr`, `rec_epa`) · Kalshi · pace · props.

**Why first:** an axis that carries nothing alone almost never earns its place in a
blend, and single arms are interpretable — when the champion changes you can say *why*
in one sentence. **The current arm set is five variants of ONE axis; Tier 1 alone is
the single biggest improvement available** (ledger P27–P30).

### Tier 2 — BLENDS, and only three kinds are allowed

1. **PREREGISTERED blends** — a handful named in advance for a stated reason
   (e.g. *"market + usage"*, *"market + efficiency"*). Small, fixed, honest.
2. **ONE adaptive stacker** — non-negative weights over the Tier-1 arms, refit
   **walk-forward** (select on weeks 1..t, predict week t+1, never the same week for
   both). Non-negativity matters: it stops the fit inventing a signal by subtracting
   two noisy arms from each other.
3. **Nothing else.** An unconstrained sweep over weightings is **not** a search, it is
   a lottery with as many tickets as weightings.

**Every Tier-2 arm must beat the best Tier-1 arm.** A blend that ties its own best
ingredient is complexity with no product.

---

## 3. THE NULLS — non-negotiable, because they are the only thing that has worked

| null | what it kills |
|---|---|
| **RANDOM-WEIGHT** | a stacker that beats the champion only because averaging reduces variance — draw random non-negative weights, rebuild, compare |
| **SHUFFLE** | a signal that is really a proxy for rank/scale — permute the arm's values across players within position |
| **BEST-OF-K** | with K arms, report where the winner sits in the distribution of K random arms, not just that it won |

**BEST-OF-K is the one this program does not yet have and needs most.** With five arms
today it barely matters; with fifteen arms and blends it is the difference between a
finding and a coin flip. **The champion's margin must be compared against the spread
of margins you would see from K arms with no skill at all.**

---

## 4. WHAT MAKES THIS SAFE TO RUN AGGRESSIVELY

Cory, 08-16: *"since we aren't making decisions using that data for this year, it
needs to be quick to adapt and try new things if it's losing… no harm if we're
wrong."* **That is exactly right and it is why the search can be wide this season:**
nothing on the 2026 board consumes the weekly arm, so a wrong champion costs nothing
but a week of grading. **The cost of a wrong blend is only paid when it starts driving
decisions — so the discipline above is about what we CARRY INTO 2027, not about
slowing down now.**

**So: search wide this season, ship narrow next.** An arm needs a full season of
walk-forward grading and a clean null before it prices anything Cory acts on.

---

## 5. THE ORDER OF WORK, WITH DATES

| # | step | by |
|---|---|---|
| 1 | **Tier-1 arms for the four committed axes** (P27–P30) | **09-03**, before week 1 |
| 2 | **BEST-OF-K reporting** in the Tuesday grader — the arm count is about to grow | **09-10** |
| 3 | **Preregistered blends** (market+usage, market+efficiency) once Tier 1 has ~4 weeks of grades | **10-08** |
| 4 | **Walk-forward stacker** with the random-weight null, once Tier 1 has ~8 weeks | **11-05** |
| 5 | **Season verdict**: best arm, best blend, both against Sleeper and FantasyPros on the shared population | **2027-01-06** |

**Steps 3 and 4 are deliberately LATE.** Fitting a blend on three weeks of a
seventeen-week season is how you learn the weather. **The single most common way this
program could fail is not laziness — it is fitting blends too early on too little,
and believing them.**

---

**Owner: relay.** Enforced through `PREDICTION-LEDGER.md` (P27–P34) and
`prediction_ledger_check.js`, which fails the build on an ungraded prediction, a grade
with no consequence, and a backlog that has gone quiet.
