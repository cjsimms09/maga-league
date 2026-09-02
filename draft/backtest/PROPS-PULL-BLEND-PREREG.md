<!-- TERRITORY: A -->
# PROPS + PULL — THE FIRST TIER-2 BLEND, PREREGISTERED (2026-09-01)

**Committed before the blend prices a single live week. The commit order is
the proof.** Precedent: `PROJ-MEAN-BLEND-PREREG.md`, `SOURCE-BLEND-2025-PREREG.md`.

## 0. The ruling this executes

Cory, 2026-09-01, on A's five-point recommendation from the 2025 backtest
(register 463): *"Do all of these!!"* — item 2: *"Treat props as the main
event… a preregistered blend — props where a line exists, `v1_pull3` where it
does not — filed now with the 2025 backtest as its prior art, entering the
grader on 10-08 when the design allows blends."*

## 1. The blend, exactly

    blend_props_pull(pid, w) = props_weekly_v1(pid, w)   if a prop line priced pid for week w
                             = v1_pull3(pid, w)          otherwise

Nothing is fitted. No weight. Props take precedence wherever they exist
because they are the only week-specific market signal we hold; the pull arm
is the best full-coverage arm measured. FULL COVERAGE BY CONSTRUCTION — every
player the champion prices is priced — so it enters the grader's `own_arms`
path as an ordinary challenger column, not as a study arm.

## 2. Prior art — 2025, strictly-prior inputs, five controls green

`draft/backtest/weekly_arms_2025_backtest.json` (register 463), arm
`blend_props_pull`, weeks 1–17 of 2025, shared population 160–265/week:

| grade | blend_props_pull | best single arm (`site_ours` = pull) | v1 champion |
|---|---|---|---|
| pooled MAE, all | **4.411** | 4.655 | 4.853 |
| MAE QB / RB / WR / TE | **8.170 / 4.185 / 4.020 / 3.266** | 8.614 / 4.468 / 4.250 / 3.347 | 9.535 / 4.645 / 4.323 / 3.415 |
| pairwise start/sit QB / RB / WR / TE | **.613 / .832 / .785 / .777** | .592 / .814 / .753 / .770 | .592 / .780 / .735 / .730 |
| Cory's 2025 roster, Δ vs the lineup he started | +1.31/wk ± 2.7 | −0.81/wk | −2.58/wk |

*(Re-run 2026-09-01 under register 467, when the `any_td` fold moved from the
backtest's hand arithmetic into the shared converter: RB/WR/TE byte-identical,
QB gained its rushing-TD expectation — pooled 4.416 → 4.411, QB MAE 8.214 →
8.170, QB start/sit .611 → .613. Control K6 in the artifact.)*

It beats its own best ingredient on every accuracy grade — the bar
BLEND-SEARCH-DESIGN §2 sets for any Tier-2 arm ("a blend that ties its own best
ingredient is complexity with no product").

**Limits carried forward:** one season; the comparator providers are PRESEASON
priors, not their weekly numbers; the 2025 prop lines are the historical API's
snapshot, treated as pre-kickoff; the roster-outcome column has SE ≈ 2.7/wk
and is suggestive only.

## 2b. Replication fold — 2024, same harness, claims fixed first (register 471, 2026-09-02)

`python3 draft/backtest/weekly_arms_2025_backtest.py --season 2024` →
`weekly_arms_2024_backtest.json`, seven controls green (K7: the in-process
own_v6 builder reproduces the reference builder 529/529). The three claims
in `REPLICATION_CLAIMS` were written before the fold was read.

| grade | blend_props_pull | `site_ours` (pull) | v1 champion |
|---|---|---|---|
| pooled MAE, all | **4.650** | 4.900 | 5.188 |
| MAE QB / RB / WR / TE | **7.323 / 4.626 / 4.432 / 3.412** | 8.054 / 4.857 / 4.619 / 3.497 | 9.015 / 5.078 / 4.815 / 3.628 |
| pairwise start/sit QB / RB / WR / TE | **.654 / .790 / .751 / .760** | .636 / .764 / .729 / .738 | .618 / .734 / .697 / .720 |
| props vs v1, shared population, start/sit | props **.643 / .805 / .765 / .766** vs v1 .611 / .753 / .709 / .737 | | |

Best on every accuracy grade in both folds. **2024 limits:** two priors
(no Sleeper 2024 archive exists); the props crosswalk leaves more names
unmatched (539 vs 183 in week 1) because 2024 names come from the FP store
and the 2026 board; and **the roster-outcome column is coverage-confounded
for every own_v6-based arm** — own_v6 prices 8.1 of Cory's 2024 rostered
players against 11.8 for props/FP (his 2024 roster carried rookies own_v6
excludes by construction, and the equalisation fill is own_v6-based), so
that column is not quoted for 2024.

## 3. When it enters, and what it must do

* **Enters the Tuesday grader as a challenger column from week 5's snapshot
  (priced Thursday 2026-10-08)**, per BLEND-SEARCH-DESIGN §5 — blends no
  earlier than 10-08. Not before, whatever the first four weeks show.
* Graded on the champion's population with the same `_score`, the same
  pairwise metric, BEST-OF-K attached as for every arm.
* **Prediction (ledger P357):** over weeks 5–8, `blend_props_pull` beats
  `v1_pull3` on per-week overall MAE in ≥ 3 of 4 weeks AND on pooled pairwise
  start/sit at ≥ 3 of 4 positions.

## 4. The nulls it must clear before anything acts on it

* **SHUFFLE** — the props component permuted within position within week;
  the blend must not beat the shuffled version by less than the pull arm's own
  margin, or the props component is scale, not signal.
* **BEST-OF-K** — where the blend's margin sits among K random one-signal
  arms of the same coverage.
* **COVERAGE CONFOUND** — the blend differs from `v1_pull3` only on players
  with a prop line; the grade is ALSO reported restricted to that subset, so a
  win cannot be an artefact of which players happen to be quoted.

## 5. What this does NOT do

It does not change the champion. It does not touch the site's lineup number.
It does not price anything Cory acts on this season — the season ruling
stands: search wide now, ship narrow in 2027. A win here is a 2027 input and a
reason to keep the props fetch healthy; a loss is a finding about the
historical-props snapshot not being a pre-kickoff line.
