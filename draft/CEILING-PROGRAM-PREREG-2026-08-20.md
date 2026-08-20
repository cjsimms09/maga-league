# THE CEILING PROGRAM — projecting upside, with the loop and the audit gate built in
<!-- TERRITORY: relay (the program frame); features land in their owners' lanes.
     2026-08-20. Cory, verbatim: "We also need to be finding way to project ceiling!
     Come up with plan and submit to A... Look into things like age, rookie, draft
     capital spent (1st round pick), opportunity (player in front leaving), player
     increasing target share at end of previous year, and anything else that helps
     project ceiling. Predict grade improve prediction grade, close the loop. Again
     implement policy for this, have A submit to integrated openAI before confirming." -->

## 0. GOVERNANCE — the policy Cory ordered, stated as a rule

**No part of this program is CONFIRMED (shipped to a surface, wired into a
weight, or declared the house method) until A has submitted the plan — and
later, each graded result — to an external OpenAI audit and triaged the
response.** Mechanics: if A's environment carries an OpenAI integration, A
uses it; if not (the relay's sandbox measured no key and no route on 08-20),
the audit runs through the paste path already established by
`draft/audit/EXTERNAL-AUDIT-BRIEF-2026-08-20.md` — a self-contained brief
Cory pastes into ChatGPT, whose reply comes back as an inbox item. Audit
responses are HYPOTHESES: each adopted suggestion gets its own prereg;
nothing is adopted on authority. Until the audit round-trips, everything
below is measurement-only and touches no live number.

## 1. THE TARGET — "ceiling" defined so it can be graded

Vague upside talk is how the old dispersion fields ended up as
`proj_mean × a per-band constant`. Two gradeable targets, declared now:

* **Season BOOM (the draft-time question):** a player booms in season Y if
  his realized season points finish in the **top decile of
  (realized − LOO pick-curve expectation) within his position**. Base rate
  10% by construction — every feature is graded as LIFT over 10%,
  leave-one-season-out across 2021-25.
* **Weekly BOOM (the start/sit question):** P(top-12 positional week) —
  the number the underdog side of a matchup actually wants. Graded weekly
  in-season on the scoreboard cadence, beside the blend.

Reference-model constraint the auditor should attack (register 99): the
published model we are duplicating emits ceiling as a **separate ranking**
(weighted 95th-percentile Harrell–Davis) and never adds it into value —
upside is a bench/underdog instrument. Our engine currently ships
`ceiling × 0.45` into every player's score (Cory's ruling, 09f94f99). This
program measures; the ruling stands unless a graded result and Cory move it.

## 2. THE FEATURE SLATE — Cory's five plus the rest, each with its data truth

| feature | data | status | owner |
|---|---|---|---|
| Late-season target/snap-share trend (Δshare wks 10-17 vs 1-9) | `component_stats_*` weeks + `snap_counts_2021-25` | **ON DISK — measurable today** | D (P151) |
| Vacated opportunity (man in front leaving) | C4's backfield-competition/team-change store | **already dispatched, due 08-24** — this program JOINS it, never duplicates | C build, D grade |
| Age (position-specific curve) | not on disk | C fetch (nfl_data_py rosters/birthdates), as-of stamped | C |
| Rookie flag | same fetch | C | C |
| NFL draft capital (round/pick, esp. 1st round) | not on disk | C fetch (nfl_data_py draft picks, static history — leak-safe) | C |
| QB-context change for receivers | C6, already dispatched (due 08-28) | joins here | C/D |
| Market-implied ceiling: Kalshi ladder skew | `market_upside_2026.json` (live P(≥threshold) per player) | on disk, 2026 only — no historical grade, week-forward only | E |
| Draft Sharks band width | board `proj_ceiling` (247 covered) | on disk | D (as the incumbent to beat) |
| Efficiency-vs-volume gap (air yards/EPA over usage) | study #44 artifacts | on disk | D |
| Preseason usage | never captured | named GAP — August-only signal, decide next July | — |

**Gates every feature faces, committed now:** blind P-row BEFORE its lift is
measured · LOSO across seasons, never in-sample · lift reported against the
10% base rate AND against a shuffled-label null · correlation gate — a
"new" ceiling signal that rank-correlates > 0.9 with the Draft Sharks band
or with `proj_mean` itself is a costume, filed as one · Rule 3e known
positive per instrument (the trend feature's: 2024 breakout WRs must show
positive Δshare in 2023 at above-chance rate, or the join is broken).

## 3. THE LOOP — predict, grade, improve, on a stated cadence

Weekly in-season beside the blend grades (Tuesday), fortnightly for the
season-grain features (with the 09-15 / fortnightly projection grades).
Every graded feature row states what changed or `NOTHING — <reason>`; the
ledger checker enforces successors. Features that clear their gates feed ONE
preregistered composite ceiling ranking (not a weight change — a separate
ranking per the reference model) which then fights the incumbent
`proj_ceiling` on the weekly-boom grade. Only after THAT wins, and the
external audit of the result round-trips, does A bring Cory a wiring
decision.

## 4. FIRST BLIND PREDICTION — filed with this plan, runnable on disk

**P151 (owner D, grade by 08-28, DEFAULT: relay runs it 08-29 and D inherits
my joins):** among WR/TE with ≥30 targets in season Y, the top quintile of
late-season target-share trend (Δ = share weeks 10-17 − share weeks 1-9)
booms in season Y+1 at **≥ 1.5× the 10% base rate**, LOSO across the four
year-pairs 2021→22 … 2024→25. Cory named this signal himself; if it grades
below 1.5× lift, that is a real finding about a popular heuristic and it is
filed exactly as loudly.
