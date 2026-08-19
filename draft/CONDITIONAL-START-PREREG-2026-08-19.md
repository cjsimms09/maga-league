# PREREGISTRATION — condition the start rate on the draft capital already spent

**A, 2026-08-19, committed BEFORE the run.**

**Cory:** *"should it take into account the draft capital you gave up to get QB or
TE, ie if you draft one early you probably arent streaming that position"*

## WHY THIS IS THE RIGHT NEXT MEASUREMENT

The model uses a **pooled** start rate — an owner's 2nd QB starts **0.427** of the
weeks he is rostered. **That number averages two completely different
strategies:**

- an owner who **drafted a quarterback in round 4** starts him every healthy week,
  so his QB2 plays only during an absence
- an owner who **streams** the position starts whichever of his two has the better
  matchup — roughly half the weeks each

**Pooling them inflates the QB2 rate for anyone in the first group**, and Cory is
in it. **This is exactly why signals 4 and 5 came back PARTIAL** — QB and TE
halve where he expects a collapse.

**Draft capital is sunk as a COST and must not enter the value term. But it is
evidence about BEHAVIOUR, and behaviour is what the start rate measures.**

## THE MEASUREMENT

For each **(season, roster, position)** across 2023-25:

1. Find the **rank-1 body** by season points on that roster.
2. Classify how he was acquired — **drafted in rounds 1-6** ("invested"), or
   **drafted round 7+ / added off waivers** ("not invested").
3. Compute the **rank-2 and rank-3 start rates separately within each group.**

**Same 540 team-weeks, same ranking, same denominator (weeks rostered). The only
new thing is the split.**

## PREDICTIONS

**P163 — investing in a starter suppresses the backup's start rate at the onesie
positions.** For **QB and TE**, `rank-2 start rate | invested` is at least
**0.10 lower** than `rank-2 start rate | not invested`.

**FALSE if either gap is under 0.10** — which would mean draft capital does not
predict behaviour and Cory's intuition, and my explanation of signals 4 and 5,
are both wrong.

**P164 — and it does NOT do the same at RB and WR.** For **RB and WR**, the gap
is **under 0.10** — because you cannot stream a startable back, so what you spent
on your RB1 says little about whether your RB2 plays.

**FALSE if either gap is 0.10 or more**, which would mean the effect is about
rosters generally rather than about streaming, and the interpretation is wrong.

⚠️ **P164 is the one that makes P163 mean something.** If investment suppressed
the backup everywhere, it would just be "good teams have deep benches" and not
about streaming at all.

## CONTROLS

1. **Known positive:** rank-1 start rates must be high in both groups — investment
   should not change whether your BEST body plays. If it does, the split is
   picking up something else.
2. **Both groups must be non-trivial** — at least 25% of (season, roster,
   position) cells in each, per position, or the split is not measuring a
   contrast.
3. **Draft join verified** — a drafted player must appear on his drafting roster
   in week 1, reported per season.
4. **Same denominator as before**: weeks rostered, not weeks in the season.
5. **Three seasons contribute**, reported separately.

## GUARD

**REPORT ONLY.** No board field, no weight, nothing ships. **The round-6 cut is
declared HERE, before the run, and is not to be moved afterwards** — if the split
shows nothing at 6, that is the answer, not an invitation to try 4 and 8.
