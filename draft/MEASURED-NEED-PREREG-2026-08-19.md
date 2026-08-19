# PREREGISTRATION — stop modelling need. MEASURE it from three seasons of this league's own lineups.

**A, 2026-08-19, committed BEFORE the module runs.**

**Cory: *"they shouldnt be at 0 for Rb and WR!!!!"*** — on P149 pricing his RB5
at `0.128` and WR4 at `0.031`.

**He is right and the cause is identifiable.** My `q` comes from the board's
`games_expected`, which is a **positional CONSTANT** — every RB is modelled as
missing exactly 2.8 games, **with no player-level variation and no variance at
all** (QB 15.5 · RB 14.2 · WR 15.0 · TE 14.8). A binomial on a median cannot see
that real backfields collapse, that roles change mid-season, or that a bust is
benched. **So it prices the 4th and 5th back at nearly nothing.**

## STOP MODELLING IT

`league_history.json` carries **`starters` and `players` per roster per week for
2023, 2024 and 2025** — three full seasons of this league's actual lineup
decisions. **The need curve does not have to be derived from an injury rate. It
can be counted.**

```
for each (season, roster, week):
    rank that roster's players at position P by their season points ON THAT ROSTER
    ask: is the Nth-ranked one in `starters` this week?

need_measured(P, N) = (weeks the Nth-ranked body STARTED) / (weeks he was rostered)
```

**That is the fraction of the season an owner's Nth-best player at a position
actually plays — injuries, byes, role changes, benchings and all, without
modelling any of them.**

## PREDICTIONS

**P150 — the measured curve is far higher than my binomial at RB4 and WR4.**
Measured `need(RB, 4th)` and `need(WR, 4th)` are **both ≥ 0.25**, against my
model's **0.128 and 0.031**.

**FALSE if either measures below 0.25** — in which case my binomial was right,
Cory's intuition is not supported by this league's own history, and I must say so.

**P151 — and it still collapses at QB and TE.** Measured `need(QB, 2nd)` and
`need(TE, 2nd)` are **both below 0.20**, and both below measured `need(RB, 4th)`.

**FALSE if either exceeds 0.20**, which would mean the one-slot positions do not
behave the way both Cory and I assumed.

## CONTROLS

1. **Starter counts.** Every team-week must have exactly 9 starters (the league's
   `roster_positions`), or that week is excluded and the exclusion is counted.
2. **Known positive.** `need(QB, 1st)` must be ≈ 1.0 — a team's best quarterback
   starts essentially every week. If it is not, the ranking or the join is wrong
   and nothing else in the output counts.
3. **Positions from `player_positions.json`**, and any unmapped player id is
   counted and reported, never silently dropped.
4. **Three seasons present** — 2023, 2024 and 2025 must all contribute, and the
   per-season numbers are reported separately so one odd season cannot carry it.
5. **Denominator is weeks ROSTERED, not weeks in the season** — a player added in
   week 10 must not be scored as having sat for nine weeks.

## GUARD

**REPORT ONLY.** No board field, no weight, nothing ships. This measures what the
league did; it does not select anything.
