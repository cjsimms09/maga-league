# Owner Dossiers — E, 2026-08-20

Relay ask: *"one tight paragraph per opponent from the three real drafts +
manager_profiles: reach tendencies (drafts ahead of ADP at which
positions), what they take early, whether they start position runs, their
keeper this year."* Use case: *"Cory at pick 33 wants to know WHO between
him and pick 48 takes his target."*

Source: `draft/config/manager_profiles.json` — real, quantified, three
real drafts (2023-2025, `sample_size: 3` for every manager, no proxy
values). Not a model output; this is what these nine people actually did,
three years running.

**Two honest gaps, named rather than papered over — neither can be filled
by better analysis, only by data that doesn't exist yet:**

1. **"Their keeper this year" — mostly unknown.** As of 2026-08-20, only
   4 of 10 teams have designated a keeper on Sleeper at all, and *none*
   are confirmed (register 155/164's own finding: 6 teams undesignated,
   8 keepers withheld from the board because the slate isn't locked).
   Below, each dossier states their most recent kept player as the best
   available signal of *taste*, clearly labeled as history, not this
   year's actual keeper.
2. **"Who's between pick 33 and 48" — can't be answered yet.** The 2026
   draft slot assignment (`league.slot_to_roster_id`) is empty on the
   live board; Sleeper hasn't revealed seating order. The tendencies
   below tell you *how* each owner drafts; matching that to *when* they
   pick needs one more data point that doesn't exist until draft day.
   **Recommend re-running this join the moment the slot order posts** —
   the behavioral half is done, the seating half is a five-minute update
   once the input exists.

Numbers below: `reach_mean_vs_adp` is average pick-slot minus ADP-implied
slot in ROUNDS (positive = later than ADP, i.e. patient; this league's
own average is +6.4, so read every number against that baseline, not
zero). `positional_timing.vs_league` is rounds earlier(−)/later(+) than
the league average at that position specifically — this is the "which
positions" answer.

---

## Richard2121 — the one to watch for a run-starting reach

**Reaches ~15 picks early on average (mean_vs_adp 21.5 vs league's 6.4 —
by far the league's biggest positive-value reacher) and drafts for need,
not value.** Positionally: takes RB earlier than the league norm
(+1.22 rounds ahead of league average timing) and WR/TE later than
typical. Opens WR-heavy three straight years (WR-WR most common). His
last kept player was Bijan Robinson (RB, round 1, 2025) — an RB-forward
signal consistent with his timing data. **What this means at the table:**
he's the owner most likely to trigger an early run on a position he
values regardless of board value — if he reaches for an RB a round before
ADP says he should, don't assume the position just got thin; assume
Richard2121 happened.

## Jreis — RB-committed, unusually predictable

Reaches a real but moderate amount (12.9 vs league 6.4). RB is his
**most predictable position** (consistency flag `true` — same round,
three years running) and he takes it *earlier* than league average
(−1.58 rounds). Opens RB-RB in all three drafts. Every other position he
tracks is also flagged predictable — QB, TE, WR, K all `true` — making
him the single most PATTERN-STABLE owner in the league; if you know his
round-1/round-2 shape from history, you know it again this year with
unusual confidence. Last kept: Josh Jacobs (RB, round 1, 2025).

## cashworth — QB-early specialist

Takes QB **1.41 rounds before league average**, his single strongest
positional deviation, and the profile's own auto-summary flags it
explicitly ("takes QB early, round 5 on average"). Everything else reads
close to market (reach 5.73, near the 6.4 league mean). Opens RB-RB. Last
kept: a three-position set from 2024 (Mixon RB, Evans WR, Mahomes QB) —
the Mahomes keep matches the early-QB signal directly.

## ds7mmet — QB AND TE early, chases rookies hardest in the league

The most positionally aggressive profile in the league on two fronts at
once: QB **1.41 rounds early**, TE **1.84 rounds early** (his single
biggest positional deviation of anyone, any position). Rookie rate 21.3%
against a 12.7% league average — the highest rookie-affinity in the
league by a wide margin. Opens QB-WR, unusual among these nine (only one
of ten opens on a QB). Last kept: Bucky Irving (RB, round 1, 2025) — note
this is an RB keep despite his real aggression being at QB/TE, so his
keeper doesn't predict his draft-day positional lean.

## B8T3S — patient at the top, waits hardest on QB and TE

Reaches less than league average (2.14 vs 6.4 — one of the most
patient drafters here). Explicit profile flags: waits on QB (round 8)
and waits on TE (round 8) — both **late** relative to the league by his
own summary. Opens WR-WR consistently (four straight WRs in 2025).
Keeper history is RB-heavy at the top (Gibbs kept twice, Taylor once) —
a real gap between what he KEEPS (RB) and what he's slow to draft
(QB/TE stay late either way, unaffected).

## Schmelley — RB-opens, WR-early, K oddly early too

Opens RB-RB most seasons. Positional timing: WR **0.76 rounds early**
(his clearest lean) and, unusually, K **0.94 rounds early** — one of only
two owners in the league who is measurably early on kickers at all (the
other, mhagen, is close behind at +0.54). Reach is moderate (5.23, near
league average). Last kept: Saquon Barkley (RB, round 1, 2025), Puka
Nacua (WR, round 2) — matches the RB-opens / WR-early pattern directly.

## Sadbru — patient across the board, RB/WR opener

Reach 3.07, close to market. No position shows a large positive
deviation — the closest thing to a lean is DEF **1.3 rounds early**,
which is a minor, low-stakes signal (defenses are cheap and fungible).
Opens RB-WR. Lowest rookie rate in the league (5.1% against 12.7%
average) — the one owner here who is measurably rookie-averse, worth
knowing if a rookie you like is falling and you're deciding whether to
wait a round. Last kept: CeeDee Lamb, two years running.

## MarianSaar — market-value drafter, no standout lean

Reach 1.36, one of the tightest-to-market profiles in the league.
Positional timing is flat across the board — nothing exceeds ~0.9
rounds off league norm in either direction. Opens WR-WR. Last kept:
a three-position set in 2025 (Jefferson WR, Achane RB, Bowers TE) — a
genuine star-power keep rather than a positional tell. **What this means
at the table:** the least predictable-by-mechanism of the nine — he
drafts close to consensus, so his behavior tracks the room's overall
run pattern rather than a personal one.

## mhagen — WR/TE opener, mildly early on K and QB

Reach 3.45. Opens WR-TE, the only owner here who opens on a WR-TE
combination rather than RB or WR twice. Mild positive leans at QB
(+0.99) and K (+0.54) — nothing extreme, but consistent enough to note
if a run threatens at either position. Last kept: a strong star trio
(McCaffrey RB, Allen QB, St. Brown WR, 2025) that doesn't obviously
predict a positional lean either way.

---

## Quick-reference table

| owner | reach vs league (6.4) | earliest lean | last kept (season, pos, rd) |
|---|---|---|---|
| Richard2121 | **21.5 — biggest reacher** | RB (+1.22 early) | Bijan Robinson (RB, 1, '25) |
| Jreis | 12.9 | RB (−1.58, most predictable) | Josh Jacobs (RB, 1, '25) |
| ds7mmet | 4.9 | **TE −1.84, QB −1.41 (double lean)** | Bucky Irving (RB, 1, '25) |
| cashworth | 5.7 | QB (−1.41) | Patrick Mahomes (QB, 3, '24) |
| Schmelley | 5.2 | WR (+0.76), K (+0.94) | Saquon Barkley (RB, 1, '25) |
| mhagen | 3.5 | QB (+0.99), K (+0.54) | Josh Allen (QB, 2, '25) |
| Sadbru | 3.1 | DEF (+1.3, low stakes) | CeeDee Lamb (WR, 1, '25) |
| MarianSaar | 1.4 — closest to market | none >0.9 | Brock Bowers (TE, 3, '25) |
| B8T3S | 2.1 — patient | QB/TE both late (rd 8) | Jonathan Taylor (RB, 2, '25) |

(*"reach vs league"* = `reach_mean_vs_adp`, in rounds — this league's own
average reach is 6.4, so read every number relative to that, not zero.
Negative positional leans = earlier than league average at that position;
positive = later.)

## ASK / DEFAULT

**ASK:** none blocking — this is informational, ready to use as-is.
**REC:** re-run the slot-order join the moment Sleeper reveals seating
(likely draft-day) so the "who's between my picks" application works;
five-minute update once that input exists, not a rebuild.
**DEFAULT:** ships as-is if untouched — the behavioral profiles are the
real value and don't depend on the slot-order gap closing.
