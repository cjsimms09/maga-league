<!-- TERRITORY: A -->
# WHY 2025 CANNOT BE GRADED — diagnosed, and it is two defects, not one

**2026-08-17. Diagnosis only. Nothing changed — see §5 for why.**

---

## 1. THE SYMPTOM

Every backtest run reports:

```
2025: UNAVAILABLE (HTTPError: HTTP Error 404: Not Found)
recovering [2025] from play-by-play (cross-validating on 2024)
  cross-validation: {"mean_abs_diff": 0.489, "worst_diff": 11.0,
                     "worst_diff_top200": 11.0, "tolerance": 0.5, "agrees": false}
  REFUSING the rebuilt path — it does not reproduce 2024 within tolerance
```

So 2025 is replayed but **graded on nothing**, and every strategy finding rests
on N=2 seasons — below the threshold the report itself names (*"three drafts can
pick a profile, they cannot tune weights"*).

**Note the criterion.** `grade.cross_validate` sets
`agrees = (worst_diff_top200 <= tolerance)`. It is a WORST-CASE test on the
draftable 200, not a mean. `mean_abs_diff` of 0.489 is *inside* the 0.5
tolerance and is not what fails — one player is.

## 2. REPRODUCED LOCALLY, AND THE PATTERN IS NOT NOISE

Fetched 2024 pbp + weekly and re-ran the check: identical verdict
(`worst_diff_top200` 11.0, `agrees: false`). The eight worst top-200
disagreements, rebuilt always LOWER than official:

| player | diff | 2pt conversions | 2 × 2pt | explained by 2pt alone? |
|---|---|---|---|---|
| Jameson Williams | 11.0 | 0 | 0.0 | **NO — residual 11.0** |
| Jameis Winston | 8.0 | 4 | 8.0 | YES |
| Jayden Daniels | 8.0 | 4 | 8.0 | YES |
| Trevor Lawrence | 6.0 | 3 | 6.0 | YES |
| Jordan Love | 6.0 | 3 | 6.0 | YES |
| Justin Herbert | 6.0 | 3 | 6.0 | YES |
| Saquon Barkley | 6.0 | 3 | 6.0 | YES |
| Patrick Mahomes | 6.0 | 3 | 6.0 | YES |

## 3. DEFECT ONE — THE REBUILD DROPS A PRICED SCORING CATEGORY

**`grade.weekly_from_pbp` emits no two-point-conversion field at all.** Its rows
carry `pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td,
fum_lost` — and nothing else. The official weekly feed carries
`passing_2pt_conversions`, `rushing_2pt_conversions`,
`receiving_2pt_conversions`.

And these are **priced in our league**:

```json
{"pass_2pt": 2.0, "rec_2pt": 2.0, "rush_2pt": 2.0}
```

Seven of the eight worst disagreements are explained by this to the point —
`diff == 2 × (2pt conversions)` exactly, in every case. It is systematic, not
sampling: a rebuild-path player who converts two-pointers is under-scored by
exactly 2 points each, forever.

This is the same family as the day's other findings — a computed quantity that
our scoring prices and our parser never produces.

## 4. DEFECT TWO — ONE MISSING PLAY, AND IT IS THE ONE THAT ACTUALLY BLOCKS

Jameson Williams has **zero** 2pt conversions, so defect one does not touch him.
His stat-line diff is:

```
receiving_yards   official 1020   rebuilt 970   (-50)
receiving_tds     official    7   rebuilt   6   ( -1)
```

50 yards at 0.1 = 5.0, plus one TD at 6.0 = **11.0 exactly**.

**CAUSE FOUND — IT IS LATERALS, AND THE PARSER HANDLES NONE OF THEM.** Williams
has exactly two lateral receptions in 2024:

```
wk11   lateral_receiving_yards =  9.0   td = 0
wk17   lateral_receiving_yards = 41.0   td = 1
       "(10:17) 16-J.Goff pass short right to 14-A.St. Brown to SF 41 for 1 yard.
        Lateral to 9-Ja.Williams for 41 yards, TOUCHDOWN."
```

9 + 41 = **exactly the 50 missing yards**, and the week-17 play is **exactly the
missing TD**. It is the only one of his nine touchdowns where his id is absent
from `receiver_player_id` — on that play the receiver is St. Brown, and Williams
appears only in `td_player_id` and `lateral_receiver_player_id`.

`weekly_from_pbp` keys receiving off `receiver_player_id`. nflverse ships
**eighteen** lateral columns (`lateral_receiver_player_id`,
`lateral_receiving_yards`, `lateral_rusher_player_id`, `lateral_rushing_yards`,
and the return/recovery family). **The string "lateral" appears in `grade.py`
zero times.** The rebuild does not model laterals at all.

**THIS IS THE LOAD-BEARING ONE.** Because the gate is worst-case on the top 200,
fixing the 2pt gap alone would NOT unlock 2025: Williams' 11.0 would still
exceed the 0.5 tolerance and the rebuild would still be refused. Anyone who
fixes defect one and expects 2025 to appear will be disappointed, which is
exactly why both are written down here.

## 5. NOTHING WAS CHANGED, AND THE REASONS ARE SPECIFIC

1. **The rebuilt path is currently REFUSED, so defect one has zero live effect
   today.** It under-scores nobody, because nothing consumes it. It is a latent
   defect in a fallback, not an active error.
2. **Fixing it would not unlock 2025** (§4), so it does not buy the thing that
   would make it urgent.
3. **Loosening the tolerance is not on the table.** That is precisely the move
   refused for the ADP-sd ratchet hours earlier — *"widening them to make a red
   go away is the thing this repo keeps catching itself doing"*. A worst-case
   gate on the draftable 200 is a defensible design; a gate relaxed until it
   passes is not.
4. Changing the grading path late in a long session, days before the draft, is
   the shape of error this entire day was spent undoing. The grading path does
   not touch draft night — but it underpins every backtest claim, and a quiet
   mistake there is expensive and slow to notice.

## 6. RECOMMENDATION, POST-DRAFT

**Both, in order, and only then re-check the gate:**

1. Add 2pt conversions to `weekly_from_pbp` (three fields; the scoring engine
   already prices them). Cheap, correct, and closes a priced-category gap.
2. Teach `weekly_from_pbp` about laterals — at minimum
   `lateral_receiver_player_id` + `lateral_receiving_yards` and the rushing
   pair, and credit a touchdown to `td_player_id` when it differs from the
   receiver/rusher. This is the one that stands between the harness and a third
   graded season, and it is now a known edit rather than an investigation.

**A CAUTION FOR WHOEVER DOES (2):** laterals are rare, so a bug here is nearly
invisible. Fix it, then re-run `cross_validate` on 2024 and require
`worst_diff_top200 <= 0.5` — the existing gate is the test, and it is a good
one. Do not hand-check a few players and call it done.

**The prize is real:** unlocking 2025 takes every strategy finding from N=2 to
N=3, which is the threshold the report's own selection rule is written against.
