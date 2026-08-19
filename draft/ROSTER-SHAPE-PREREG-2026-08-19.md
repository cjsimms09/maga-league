# PREREGISTRATION — what a "normal" roster is in THIS league, and where the tool sits

**A, 2026-08-19. Filed BEFORE running anything.** Draft 08-22.

Cory: *"Still need to run much more labs on roster building, too many RB. Roster
still not normal. Find best way to get normal roster while extracting most value
early and most upside late!!!"* and *"Need to strive for top 3!"*

---

## 1. The problem with every roster-shape claim we have made so far

Every time this project has said the tool's roster is wrong — RB10/WR1, RB12/WR2,
"too many RBs" — **the standard it was wrong against was somebody's intuition.**
Register 59 quotes counts; it does not quote a target. That is why the complaint
keeps recurring without ever closing: there is nothing to close it against.

**This lab builds the target from the league's own history, and it is the target
that makes "normal" a measurement instead of a feeling.**

The inputs are already committed — no network, no new capture:
`draft/data/league_history.json` carries per season the full `drafts[].picks`
(150 rows, `roster_id` + `player_id` + `is_keeper`), the `standings` with
`rank`, and `final_rosters`. Three complete seasons: 2023, 2024, 2025.

## 2. The estimand, named before the run

**Drafted position counts per team-season** — QB / RB / WR / TE / K / DEF —
built from draft picks only, **keepers included and flagged**, joined to that
team's finishing `rank`.

Two contrasts, both preregistered:

- **T3** — mean position counts for teams finishing **rank 1–3**.
- **B7** — the same for **rank 4–10**.

Cory's goal is stated as top 3, so T3 is the target and B7 is what it must be
distinguished from. **n = 9 team-seasons in T3 and 21 in B7 across three
seasons — small, non-independent within a season, and I am writing that here so
the result cannot be quoted as though it were not.**

## 3. What would make this worthless, stated up front

**If T3 and B7 have the same shape, there is no such thing as a winning roster
shape in this league, and every "too many RBs" claim — including Cory's and
mine — is unfalsifiable.** That is a real possible outcome and it is the one I
consider most likely (see §6). It would be a finding, not a failed lab, and it
would mean roster shape should be dropped as an objective in favour of points.

**A difference is not automatically signal either.** Ten teams, three seasons,
six positions: something will differ. So the difference must clear a
**permutation null — shuffle the rank labels WITHIN each season** (preserving
the season's own draft economy and the fact that exactly 3 of 10 are top-3),
4,000 shuffles, fixed seed 20260819.

## 4. The decision rule

| finding | consequence |
|---|---|
| **No position differs at p < 0.05** | roster shape is NOT a lever in this league. Say so plainly, stop tuning toward a shape, and grade arms on points alone. |
| **A position differs and the tool sits on the WRONG side of it** | that is register 59's complaint, finally with a number, and it becomes a graded arm — not a hand-set weight. |
| **A position differs and the tool already matches** | "too many RBs" is folk wisdom about this tool and should stop being repeated, mine included. |

**No configuration is selected from this lab.** It measures a target; it does not
choose a weight to hit it. Fitting weights to a nine-team-season shape target is
exactly what `no_fit_guard` exists to stop, and the target's own n makes that
worse, not better.

## 5. The tool's side

The same counts for the engine's rosters, from the committed seat-replay grade
files — **arms s0 (`VONA_SLOT_AWARE` off, shipped) and s1 (on)**, 30 seat-years
each, `engine_roster[].pos`. Reported beside T3/B7, never merged into them.

**Control (rule 3e):** the tool's counts and the owners' counts are computed by
**the same function** over the same position vocabulary. If a probe reports "the
tool is skewed" while silently counting a different universe — kept players in
one and not the other, K/DEF present in one and not the other — the finding is an
artifact. The function takes a list of `(position, is_keeper)` and nothing else,
and both sides are asserted to have the same roster size.

## 6. Registered prediction — P120

**(a)** T3 and B7 will NOT differ at p < 0.05 on any position after the
within-season permutation. Ten-team leagues are shallow; the waiver wire is
live; and the champion is usually the team whose players scored, not the team
that bought a shape.

**(b)** If anything does clear, it is **WR**, not RB — because the recurring
complaint is a shortage of receivers rather than a surplus of backs, and those
are the same observation only if roster size is fixed, which it is.

**(c)** The tool under s1 will sit CLOSER to T3 than under s0 on RB count,
because slot-aware pricing reprices backs as flex once the RB starter slots are
full — measured at Cory's pick 48, RBs left the top-40 VONA entirely (7 → 0).

**I expect (a) to hold, which means I expect this lab to REMOVE an objective
rather than tune one.** Writing that first so a difference cannot be discovered
after the fact and read as vindication of the complaint that motivated the lab.
