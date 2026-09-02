# IN-SEASON EDGE PLAN 2026 — what makes the model better THIS season, ranked by measured dollars

**Cory, 2026-09-01, verbatim:** *"Make our model better! What can we do or implement
this year that will help our model learn and win more fantasy football matchups and
make me more money."*

Written by the relay 2026-09-01 from what is on disk — every number below has a file
behind it, and every item carries an owner, a preregistered grade, and a default so
silence is consent. **Nothing here is a new idea; it is the ranking of ideas we have
already measured, by how much money each one touches.**

---

## 0 · WHERE THE MONEY ACTUALLY IS (so we aim at it)

| pot | size | what decides it | our measured leak |
|---|---|---|---|
| **weekly high** | **$100/week, ~$1,500/season** | ONE lineup posting the top score — variance, not floor | **$370–450/team/yr** left on the table (`EFFICIENCY-LEAK.md`); 70–75% of the whole leak |
| regular-season matchups | playoff equity ~$110/matchup | floor + not starting zeros | Cory's conversion **.862, 3rd-worst of 10**; 17.9 bench pts/wk; 3.6 zero-point starts/season (dossier) |
| waivers | the ONLY roster channel — **3 trades league-wide in 3 seasons** | speed + valuation | Cory's claim fail rate **.439** (dossier) |
| side bets | opt-in | +EV pricing | `src/sidebets.js` exists; not this doc's subject |

**So the two levers that pay are: (1) a weekly projection with real distributions,
feeding the E[$] lineup solver that already exists; (2) the behaviors around it —
zero-point starts and waiver speed.** Trades are not a lever in this league.

---

## 1 · THE MEASURED FACT THAT SETS THE ORDER (register 463, A, 2026-09-01)

A ran the live weekly formula over all of 2025 with strictly-prior inputs, graded
three ways. **The champion going live on 09-10 (`own_weekly_v1`) is the worst
full-coverage arm on every grade — including making Cory's actual 2025 lineups
WORSE than the ones he started (−2.6/wk).** The Vegas *tilt* is inert (0.02 MAE
across every setting). **And the PROPS arm — that week's player lines, converted
under our scoring — beats it at ALL FOUR positions on Cory's own start/sit metric:**

| position | props arm | own_weekly_v1 |
|---|---|---|
| QB | .584 | .566 |
| RB | .853 | .802 |
| WR | .799 | .751 |
| TE | .792 | .750 |

On the unit that pays — his real 2025 roster, best legal lineup by each arm — props
is **+2.55 pts/wk** over what he started (SE ~2.2, suggestive; the pairwise metric is
the decisive one and points the same way).

**That is Cory's own sentence, measured: *"that is the edge we need in season."***
Everything below is ordered by that table.

---

## 2 · THE RANKED LIST — what ships, who, graded when

**① SHIP THE PROPS ARM LIVE as a weekly challenger, week 2 onward.** *(owner A for the
loop, C for the capture; prereg P354)* The backtest arm (`weekly_arms_2025_backtest.py:
props_arm`) prices from `historical_props_*`; the live version reads Thursday's lines
(**FREE, keyless — Cory's standing ruling 09-01: no paid props, no Odds API. Measured 09-02 (`free_props_census_2026.json`): UNDERDOG carries game-week lines for every market the arm needs across all 16 games, including the joint `Rush + Rec TDs` line that closes the TD gap; Bovada is the Thursday complement. The writer to the arm's contract is C's, deadline 09-08.**). Converts through
`market_convert.py` (one scoring engine, component-matched: yards+receptions only,
**no TDs — 23–47% uncovered by position**, so the arm is a *component* and its
TD share must come from the prior, never be silently zero). Emits as arm `'props'`
beside `'ours'`/`'sleeper'`; the mechanical promotion rule and the kill switch (D4)
decide who is champion. **DEFAULT if unbuilt by 09-17: the relay files the build as
a routed patch from the backtest code and A merges or sends back.**

**② POINT THE MONEY TOOL AT THE BEST ARM.** *(owner A; prereg P355)* `src/routes/
lineup.js` maximises E[$] = P(win)·$110 + P(weekly high)·$100 — the right objective,
already built and replay-validated to the decimal — but its per-player inputs are
the projection feed's point estimate with a harvested *band*, not per-player
distributions. Props lines ARE distributions (an over/under is a median; the juice
is the skew). Feed the solver the champion arm's projection plus props-implied
per-player spread, and the weekly-high chase stops treating every player as
equally volatile. **This is the $1,500 pot. DEFAULT: solver keeps its current
inputs; P355 grades whether the chase actually clears the band more often.**

**③ ZERO-POINT STARTS TO ZERO.** *(live — P351, grade 11-01)* Sunday alert 11:45 ET
(after inactives) + Thursday TNF check. Each zero start is ~10–15 pts, a coin-flip
matchup. Nothing to build; the grade is whether Cory's ≤1 across weeks 1–8. **The
one behavior worth more than the whole draft edge.**

**④ TUESDAY-MORNING WAIVER SPEED.** *(owner B for the surface, relay for the rail;
prereg P356)* Monday-night injuries → a claim recommendation in Cory's hand before
waivers process, from `waiver_reco.js` (already the graded computation). His claim
fail rate is .439; in a trade-dead league the wire is the whole roster channel.
**DEFAULT: the Tuesday reco-cron row is already captured for grading; the alert
surface is B's, and if unbuilt by 09-15 the relay pushes the row to Cory by hand
each Tuesday.**

**⑤ THE USAGE ARM.** *(owner D; through the backtest harness first, ledger-only)*
`weekly-snap-counts.yml` captures snaps Wednesdays. Opportunity (snap %, target
share) is the most-cited weekly predictor in the literature we have not measured.
Run it through `weekly_arms_2025_backtest.py` **before** it touches the live loop —
the backtest is now the August/preseason screen (P353's consequence route). **≤3
arms per week, per the explorer cap; DEFAULT: D backtests it by 09-15 and files
the number, TRUE or FALSE.**

**⑥ ALIGN THE PROMOTION RULE WITH THE BAR.** *(owner A)* `weekly_player_projection.js`
picks the champion by **MAE** (line ~462); `PROJECTION-PROGRAM-2027.md` says the bar
is **start/sit accuracy**, and the 2025 backtest shows the two can disagree (Sleeper-
prior best at QB on start/sit, `site_ours` best on MAE). The Tuesday grader should
promote on the metric Cory is actually judged by. **DEFAULT if unruled by 09-15: MAE
stays and the first grade is quoted on both, with the disagreement named.**

**✗ NOT THIS SEASON, named so nobody builds them:** the trade advisor (3 trades in 3
seasons — no market to price); season-long Draft Sharks bands (frozen, retired
08-31); anything that "tilts" by Vegas game total — measured inert.

---

## 3 · HOW IT LEARNS (the loop that already exists, now with something worth learning)

Thursday 10:00 UTC every arm emits → Sunday resolves → **Tuesday grades**
(`grade-cron`) → mechanical promotion after 3 of 4 weeks → kill switch benches a
champion nothing can dethrone (D4, A's ruling due 09-04). First grade **09-15**,
fortnightly after. The Monday explorer proposes ≤3 preregistered arms a week,
backtested on 2025 before going live. Every recommendation the site shows Cory is
captured and graded whether or not he takes it (Cory's own mandate, 08-24).

**The honest expectation:** one season is ~17 weeks and the same players recur, so
the effective sample is small. We will know by mid-October whether props beats the
champion live (P354); we will NOT be able to prove a +2 pts/wk lineup edge to
significance in one season — that is why the pairwise metric, not the outcome, is
the decider. The money shows up anyway; the proof takes longer than the profit.
