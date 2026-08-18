# THE PAID PROPS DATA IS GRADED — and the headline number must never be quoted alone

_TERRITORY: D — data stewardship. Written 2026-08-17._

**Register 15b is closed.** `props_season_projection.py` was re-run; three seasons
of paid odds-API data have been graded for the first time. The stale refusal
naming three files that exist is gone.

**The verdict is `clears: false`.** And the result contains a number that looks
like a triumph and is not one — **props post Spearman 0.93–0.97 against own_v6's
0.66–0.74.** That is far too good, so Rule 3d was applied before anything was
recorded.

---

## 1. WHAT I EXPECTED, AND WHAT CAME BACK

I expected a thin, unimpressive arm — 43 kickers' worth of scepticism about
whether a name crosswalk would even join. What came back was near-perfect
ranking, which is the shape Rule 3d exists to stop being celebrated.

| position | n | props MAE | own_v6 MAE | Δ | props ρ | own_v6 ρ | Δρ |
|---|---|---|---|---|---|---|---|
| QB | 45 | **45.38** | 78.38 | **−33.00** | **0.9631** | 0.6555 | **+0.308** |
| RB | 78 | 54.03 | 41.84 | +12.19 | **0.9671** | 0.7443 | +0.223 |
| WR | 129 | 36.81 | 35.88 | +0.93 | **0.9448** | 0.7019 | +0.243 |
| TE | 68 | 30.02 | 26.73 | +3.29 | **0.9348** | 0.7437 | +0.191 |

Coverage: **424 props forecasts**, 18 weeks in store, **4 unmatched names**
(Cameron Ward, Gabe Davis, Hollywood Brown, Zonovan Knight). The crosswalk I
warned would lose rows lost four.

## 2. RULE 3d — AND THE ANSWER IS "NOT A BUG, BUT NOT A PROJECTION EITHER"

**The design already named this, before the grade existed.** The artifact carries
a preregistered field:

> `in_season_information_asymmetry`: *"props-implied totals absorb in-season
> role/injury information own_v6 (a preseason forecast) cannot see by
> construction — a props win here answers 'how much is on the table given
> in-season market access', not 'should the preseason board switch to this'."*

**Structurally verified, not taken on trust.** `season_implied_totals()` (`:199`)
sums `week_implied_points` across **all 18 weeks** of the `full_season` store. So:

- **A week-17 prop line is set knowing everything through week 16.** The "season
  projection" is 18 market opinions formed *during* the season, added up.
- **Availability is baked in.** A player who tore an ACL in week 3 has no props
  rows after week 3, so his total is correctly low. own_v6 forecast him healthy
  in August. The module handles this honestly — a missing week contributes
  nothing, never a zero, and a `games` counter travels with every total — but it
  is precisely why the ranking is near-perfect.

**So the Spearman figures are a measure of the market watching a season unfold,
not of projection skill.** They are exactly what a well-built in-season market
should produce, and they say nothing about what a preseason board should do.

**Rule 3d verdict: not a wiring bug, not a finding either — a correctly-labelled
asymmetry whose headline is dangerously quotable.** The tell was size, and the
size is explained.

## 3. THE PART THAT IS GENUINELY INFORMATIVE

**Props win ranking overwhelmingly and LOSE level at three of four positions.**
That pattern is not explained by the asymmetry alone and is worth keeping:

- ρ says the in-season market orders players almost perfectly.
- MAE says the summed level is biased — **+12.19 at RB, +3.29 at TE, +0.93 at
  WR** — even with the information advantage.
- **QB is the exception in both directions** (−33.00 MAE, +0.308 ρ), and the
  likeliest cause is availability again: injured starters dominate QB error, and
  props see them going missing while a preseason forecast cannot.

**`clears: false`** on the preregistered bar (beat own_v6 on **both** metrics at
**all four** positions). It fails on MAE at RB, WR and TE.

## 4. THE FAIR TEST EXISTS, HAS NEVER BEEN RUN, AND THE DATA IS ALREADY PAID FOR

`historical_props_week1_2023/2024/2025.json` are committed — **2,283
player-weeks, 3,889 quotes.** Week-1 lines close *before any game of that season
is played*, which is the project's own established rule for a leak-free
season-total feature (`vegas_lines_2021_2026.json`'s `_note`: *"Leakage rule for
season-Y season-total features: WEEK 1 LINES ONLY"*).

**That is the arm that answers the question this one cannot:** can a market
signal available in August improve a preseason board? It needs a prereg and a
different code path — the module reads the `full_season` store — and it is
**A's file**, so it is parked, not built.

**This is the cheapest real study left in the props agenda.** The data is bought,
committed and leak-free by construction.

## 5. WHAT THIS DOES NOT COVER

- **No claim that props should feed anything.** `clears: false`, and even a pass
  would not have licensed it: the asymmetry makes this comparison structurally
  unfair to own_v6 in props' favour.
- **2023 and 2024 were not graded here.** `GRADED_SEASON = 2025` only. The other
  two paid seasons remain ungraded — a second and third fold sitting on disk.
- **The 4 unmatched names are unexamined.** Small, but `match_player_name` is
  still fixture-tested only, and 4 of 428 is the number to watch if the arm ever
  runs on more seasons.
- **I did not re-verify the v6 reproduction** that the artifact registry pins.

## 6. WHAT I CHANGED

- Re-ran `props_season_projection.py` — **its output is A's artifact; I ran the
  committed module unmodified and changed no code in it.** Authorised directly by
  Cory ("fix"), recorded here because it is otherwise A's call.
- `DEFECT-REGISTER` 15b → CLOSED, with the asymmetry stated in the row so the
  Spearman figure cannot travel without it.
- `draft/tests/test_props_asymmetry_is_declared.py` — **new**: the artifact may
  not report a props-vs-v6 comparison without carrying the
  `in_season_information_asymmetry` statement. Known-positive control included.

## 7. THE TEST, AND WHY THIS ONE IS WORTH HAVING

The risk here is not a wrong number — it is a **right number quoted without its
caveat**. "Props beat own_v6 by +0.31 Spearman" is true, catastrophically
misleading, and exactly the kind of sentence this project has been finding in its
own files all day.

`test_props_asymmetry_is_declared.py` asserts that whenever the artifact reports
a graded props-vs-v6 comparison, it also carries the asymmetry statement naming
in-season information. **Known-positive control:** the same checker must reject a
synthetic artifact that reports the comparison with the statement stripped, so a
pass cannot mean "the checker found nothing to check".

It cannot stop a human quoting the number out of context. It can stop the
*artifact* shipping without the sentence that makes the number readable — which
is the half that is mechanisable.
