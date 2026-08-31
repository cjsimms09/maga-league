# The 17.33 points a week are real. A trailing average does not take them — it loses 14.91 more.

**E (red team), 2026-08-24.** Reproduce with
`python3 draft/tools/is_the_bench_gap_recoverable.py`.

---

## 1. The question nobody had asked of a number we quote constantly

`CLAUDE.md` reports the margin in the unit that pays: **points left on the bench
— league 15.90/wk, Cory 17.33 ± 1.68 against the best owner's 12.06 ± 1.43.**

That figure is `optimal − actual`, and `optimal` knows every score **before
kickoff**. It says how much was left on the bench. It has never said whether any
rule available on Sunday morning could have taken it — and the whole in-season
programme is pointed at closing it.

## 2. The simplest honest rule loses to every owner in the league

Arm: start the best legal lineup by **season-to-date points per game through week
W−1**. No leakage; it is what a person could compute on Sunday morning.

| | pts per team-week |
|---|---|
| what owners actually started | 111.19 |
| persistence (last week's lineup) | 102.02 |
| **season-to-date PPG rule** | **96.28** |
| optimal (hindsight ceiling) | 126.10 |

> **PPG rule minus owner: −14.91 pts/team-week, se 0.92, n = 390.**

Not a wash and not close. It loses in **every one of the ten seats**, across all
three seasons — Sadbru −8.84 at best, ds7mmet −18.77 at worst, Cory −12.45. A
result that held for one owner would be noise; one that holds for ten is the
rule.

## 3. 83% of the failure is not knowing who is playing

A deficit that large is a bug report until its cause is named. The diagnostic:
run the **same ranking** restricted to players who actually scored that week.
That is hindsight and therefore **not a legal arm** — it separates *"the rule
cannot see who is playing"* from *"the gap is unrecoverable"*, and only one of
those is a finding about the gap.

| arm | vs owners |
|---|---|
| PPG over the whole roster (legal) | **−14.91** ± 0.92 |
| PPG over players who scored (hindsight) | **−2.58** ± 0.59 |

> **Availability accounts for 12.33 of the 14.91 — 83% of it.**

So the naive rule's failure is overwhelmingly **byes, injuries and inactives**,
which every owner can see and a trailing average cannot.

**And the residual matters too.** Handed perfect availability for free, the
trailing average *still* loses **2.58 ± 0.59**. Owners carry matchup, role and
news that a season-to-date mean does not.

## 4. What this constrains, which is the point of measuring it

- **Availability is a precondition, not a refinement.** Any in-season start/sit
  surface must model who is playing *before* it models who is better. Shipping
  the ranking half first is not a partial win — measured here, it is −14.91
  points a week worse than doing nothing.
- **A trailing average is not a projection.** Even with availability solved, it
  loses. The in-season tool needs a real weekly projection, which is what
  `PROJECTION-PROGRAM-2027.md` is already building — this puts a number on why
  the shortcut is not available.
- **The 17.33 is not yet shown to be takeable.** It remains the right target and
  the honest statement is that nothing tested so far captures any of it. That is
  a different claim from *"Cory is leaving 17 points a week on the table"*, which
  is how the line reads today.

## 5. An unreconciled number, flagged rather than smoothed

The control reproduces **Cory's** published figure to 0.02 — 17.31 at weeks 2-13
against a quoted 17.33 — so the harness computes this quantity correctly.

It does **not** reproduce the published **league** figure. Every week window
tried lands **15.0–15.3** against the quoted **15.90**:

```
weeks 1-13  league 15.11   Cory 17.46
weeks 2-13  league 14.99   Cory 17.31   <- Cory reproduces here
weeks 1-14  league 15.03   Cory 17.11
weeks 2-14  league 14.91   Cory 16.94
weeks 1-15  league 15.34   Cory 17.70
```

That is a disagreement about **which population the published league number
covers**, not about the arms — which are a paired comparison inside a single
window and are unaffected either way. The control fails loudly on it (K1b) and
the probe explains why the arm result still stands rather than leaving the reader
to decide. **Register 298 carries the reconciliation.**

## 6. Limits

- **One league, three seasons, 390 team-weeks.** The per-owner result is n=39
  each — enough to say *"all ten seats"*, not enough to rank them, and I am not
  ranking them.
- **The legal arm is the simplest one, deliberately.** A better leak-free arm
  (real weekly projections, an availability feed) may well beat owners; nothing
  here argues it cannot. What is measured is that the *shortcut* does not.
- **Availability is diagnosed, not modelled.** "Scored more than zero" is a proxy
  for "played", and it is hindsight. It is used only to attribute the deficit,
  never as an arm.
- Bye weeks are knowable in advance and would fix part of the 83% with no
  leakage at all — but no historical bye-week store exists for 2023-25, so the
  size of *that* recoverable slice is not measured here.

## 7. ⚠️ CORRECTION, same day — my first ask was wrong

**I filed §7 asking A to build an availability feed. It exists.** Checked after
filing, which is the wrong order and is why this section is here rather than
only in the register.

The live start/sit surface already models availability, traced end to end:

- `lineup.js:474` `isInactive` covers the injury vocabulary
  (OUT/IR/PUP/SUS/NA/DNR/COV/RES/DNP) **and** bye week
- `member.js:3400` applies `LO.activeProjection` to every roster row **before**
  the solver
- `LO.optimize` has **exactly one call site** (`member.js:3450`), and it receives
  the guarded rows

I went looking for register 60's *built-and-disconnected* shape. It is not there.

`src/nfl_byes.json` is **complete for 2026** — 32 of 32 teams, weeks 5-14, and
the only board team absent from it is `FA`, which correctly has no bye. And the
missing *historical* store is a deliberate decision with a reason stated in the
file itself: *"a WRONG bye false-zeros a playing player (worse than a dormant
guard). Add a season only from an authoritative source."* That is sound.

**What survives is still the finding** — the measurement is untouched, and so is
the constraint that any *new* start/sit arm must model availability before
ranking. What changes is the audience: it is a bar for future arms, **not an
exposure on the live surface, which already clears it.**

And it reframes the headline: **−14.91 is the measured cost of the shortcut the
live tool already declined** — a better thing to be able to say than what I
first filed.

## 8. Ask (revised)

**ASK (A):** none. **The earlier recommendation is withdrawn** — see §7.
**WHAT REPLACES IT:** treat §2-3 as the bar any *new* start/sit arm is measured
against. A proposal that ranks without modelling availability is not a partial
win; it is −14.91 points a week worse than doing nothing.
**DEFAULT if silent:** the finding stands on the register and the next start/sit
proposal is measured against −14.91 rather than against zero.

**ASK (relay):** reconcile the published **league 15.90**. Cory's 17.33
reproduces; the league figure does not, in any window.
**DEFAULT:** register 298 stays open and the league figure is quoted with its
disagreement attached.
