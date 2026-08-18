# Roster robustness — the untested half, graded (2026-08-17)

Cory's question, verbatim: *"are we extracting as much value as possible while also still drafting a legal team that seems reasonable."* Value and legality were already tested; THIS grades whether the planned roster survives a season structurally — byes, injuries, flex depth, wire dependence. Preregistration: metrics M1-M7 in `draft/backtest/roster_robustness.py`'s docstring, written before computing. Measurement only — nothing here promotes a plan; results route to A/Cory (no_fit_guard: promotable=false, configs_tried=1).

## The verdict

**DOMINATED ON THIS YARDSTICK (17-week totals under measured availability): doctrine(s) shipped, robust_rb, early_qb, te_early dominate the seat-plan arm in the paired room test — the seat-plan overlay is giving up availability structure it did not have to give up. The tournament's own $-metric disagrees for the RB-heavy arms (it is injury-blind; this yardstick is H2H-blind) — the two verdicts are BOTH in the artifact and the doctrine call stays with the enrolled doctrine.**

| plan | value (E season pts) | floor (weekly p10) | P(unfieldable skill wk) | wire pts/season | worst-bye empty skill slots | RB1-out 4wk loss | WR1-out 4wk loss |
|---|---|---|---|---|---|---|---|
| seat_plan_planned | 2681.0 | 79.9 | 1.000 | 63.8 | 1 | 55.2 | 36.8 |
| bpa_vorp | 2637.6 | 80.9 | 0.965 | 87.5 | 0.7 | 42.7 | 32.5 |
| early_qb | 2734.4 | 88.4 | 0.999 | 127.6 | 1.12 | 50.6 | 34.8 |
| late_qb | 2726.5 | 82.3 | 0.999 | 123.5 | 1.09 | 50.5 | 34.1 |
| market_adp | 2746.1 | 85.7 | 1.000 | 117.3 | 1.1 | 52.2 | 36.9 |
| robust_rb | 2746.5 | 86.5 | 1.000 | 140.9 | 1.27 | 45.2 | 32.7 |
| seat_plan | 2718.8 | 85.1 | 0.988 | 110.8 | 0.97 | 51.9 | 35.3 |
| shipped | 2743.6 | 87.2 | 0.999 | 125.6 | 1.09 | 49.7 | 34.5 |
| te_early | 2742.6 | 86.7 | 0.999 | 125.1 | 1.08 | 49.8 | 34.6 |
| zero_rb | 2653.9 | 83.8 | 0.993 | 113.0 | 1.05 | 51.9 | 33.3 |
| cory_actual_2025 | 2192.7 | 61.5 | 1.000 | 135.2 | 1 | 54.9 | 29.6 |
| seat_plan_shortlist_literal | 2666.3 | 80.6 | 1.000 | 112.4 | 1 | 35.1 | 15.9 |
| fragile_bye_stack | 2622.0 | 82.4 | 1.000 | 142.5 | 2 | 55.3 | 29.6 |


HOW TO READ THE TABLE. Doctrine rows are means over each arm's own 120 tournament rooms (N=250 seasons each) because no single planned roster exists per arm — all 120 rooms differ (mean pairwise Jaccard 0.12-0.24, measured). Named rosters are N=10000. The doctrine rows and the named rows sit in DIFFERENT LUCK REGIMES — room opponents sample a softmax, so stars sometimes fall to seat 8 in rooms, while the planned roster assumes the room drafts near ADP — so doctrines are judged against the SEAT-PLAN ARM, paired on room seed, never against the planned-roster row directly. And the value axis here is 17-week OPTIMAL-LINEUP TOTALS UNDER MEASURED AVAILABILITY, not the tournament's $ yardstick — the two can and do disagree: archetype_rooms' own paired table has robust_rb at -16.1pp playoff probability vs shipped (injury-blind, H2H money, rho-lineups) while it clears the seat-plan arm here (availability-aware, totals, optimal lineups). Neither sees everything; this artifact adds the structural axis the $ sim admits it cannot see, and promotes nothing.

Wire levels (measured, wire_level.json, 422 scored adds 2023-25): RB 7.8 / WR 11.1 / TE 11.6 pts/week (acquisition-week medians — a hole there is filled the week it opens); QB 19.46/week = 330.8/season (the ongoing-hold line — a streamed QB is a held add, and the acquisition-week 23.38 exceeds most startable QBs' weekly mean); K/DEF at board replacement/17 (assumption A4). Availability: games-played distributions of this league's own 2023-25 draft picks (QB 48 / RB 142 / WR 157 / TE 42 player-seasons) measured from the committed weekly/component stores; missed games arrive as one contiguous spell (weeks_out_when_injured.json: absences run 3.3+ weeks on average).

## The paired doctrine test (M7a — value delta, floor delta vs the seat-plan arm, 120 paired rooms)

| doctrine | Δ value (± se) | Δ floor p10 (± se) | dominates | dominated by seat-plan arm |
|---|---|---|---|---|
| bpa_vorp | -81.3 ± 8.4 | -4.21 ± 0.40 | no | YES |
| early_qb | +15.6 ± 6.8 | +3.35 ± 0.39 | YES | no |
| late_qb | +7.6 ± 5.6 | -2.81 ± 0.41 | no | no |
| market_adp | +27.3 ± 6.9 | +0.66 ± 0.39 | no | no |
| robust_rb | +27.7 ± 5.3 | +1.42 ± 0.40 | YES | no |
| shipped | +24.7 ± 6.3 | +2.11 ± 0.41 | YES | no |
| te_early | +23.8 ± 5.7 | +1.62 ± 0.36 | YES | no |
| zero_rb | -64.9 ± 7.1 | -1.28 ± 0.38 | no | YES |

## Mechanism sentences

- The seat plan's low wire dependence comes from its shape (QB2/RB4/WR5/TE2/K1/DEF1): two QBs and two TEs mean the two most expensive holes (QB wire 19.46, TE 11.6 pts/wk, both measured) have a rostered backup, so an absence costs bench points, not wire points.
- The shortlist-literal probe (QB5/RB4/WR3/TE1/K1/DEF1) exists because the realized-wire MV ranking at the demoted bench seats puts backup QBs on top — followed literally it drafts that shape, whose surplus QBs can never start together while its lone TE is backed only by an 11.6-pt wire slot; the guard against it is shape reasonableness, which the MV number alone does not encode.
- The fail arm (QB1/RB5/WR6/TE1/K1/DEF1, five RBs ALL on bye 10) grades worse because both RB slots are empty that week by construction: 2 empty skill slots in its worst bye week versus 1 for the seat plan, and the worst deterministic week drops to 90.1 versus 104.1 — the grader distinguishes structure, not just totals.
- Why depth-heavy arms can clear the seat-plan arm on both axes HERE while the tournament's own paired $-table runs the other way (robust_rb -16.1pp playoff prob vs shipped there): this yardstick draws measured availability (league draftees played 13.0-13.6 of 16 non-bye weeks on average), so a bench body at a thin position keeps paying when a starter sits — insurance the injury-blind $ sim admits it cannot see — while the $ sim prices H2H schedule variance this yardstick cannot see. The seat plan also spends picks 108/113 on DEF/K (rounds 11-12) where shipped's rooms average K/DEF near pick 140 — two rounds of skill depth the overlay gives away by construction.
- QB holes are priced at the ongoing-hold wire line (19.46/wk = 330.8/season) because a streamed QB is a held add and the acquisition-week median (23.38) exceeds most startable QBs' weekly mean — pricing an empty slot above a healthy starter would make QB holes profitable, an artifact, not a finding.
- P(unfieldable skill week) is ~1.0 for EVERY graded roster — corroborated by the league itself completing 1.498 adds per team per week (measured, seat_plan.json bench_basis): nobody survives a season without the wire, so the discriminating quantity is how MANY wire points a roster consumes, not whether it ever needs one.

## Assumptions (named, not measured)

- A1 proj_mean/17 active-week mean (double-counts availability at the mean; identical for every roster)
- A2 IID weekly draws, no cross-player/week correlation
- A3 K/DEF available every non-bye week (stores offense-only)
- A4 K/DEF wire = board replacement/17
- A5 one contiguous missed spell per player-season
- A6 position-level (not round-conditioned) availability
- A7 2025 control mapped to 2026 board rows; pid 12530 graded as an empty bench spot

Seat plan roster graded: WR Ja'Marr Chase, RB Derrick Henry, RB Kenneth Walker, TE Colston Loveland, QB Drake Maye, WR Mike Evans, WR Parker Washington, RB J.K. Dobbins, WR Jayden Reed, QB Jordan Love, DEF Los Angeles Rams, K Brandon Aubrey, TE Brenton Strange, WR Jayden Higgins, RB Chris Rodriguez.

