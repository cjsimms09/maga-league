# RESIDUAL-ARM STORE READINESS — five Tier-1 signals, measured not remembered

**TERRITORY: C.** Routed A → C, ROUTES.md 2026-08-18 ("RESIDUAL-ARM STORE
READINESS"), answering `RESIDUAL-ARM-PROPOSAL.md` §0's five signals (Vegas,
usage, air-yards/EPA, pace, props) for D's residual-arm lab. Per Rule 3e: every
cell below is a measurement against a committed file, not a memory of one.

## THE TABLE

| signal | store(s) | exists 2023-25? | weekly? | leak-free AS A SAME-WEEK FEATURE? | coverage |
|---|---|---|---|---|---|
| **Vegas** | `vegas_lines_2021_2026.json` | ✅ yes | ✅ yes (per-game) | ✅ **YES** — closing `spread_line`/`total_line`, the store's own `_note` states the leak rule directly and it matches the walk-forward use case exactly | 272 games/season, 18 weeks, all three seasons — team/game level, not player level |
| **Usage** | `component_stats_{2023,2024,2025}.json` | ✅ yes | ✅ yes (18 weeks each) | ❌ **NO** — post-hoc box-score volume (targets, receptions, target share); `_note`: "row-presence means was on a field." Leak-free **only with ≥1-week lag** (week N−1 or trailing avg → predict week N) | 5,372 / 5,298 / 6,108 player-weeks (2023/24/25); by position 2025: WR 2,511 · RB 1,646 · TE 1,287 · QB 664 |
| **Air-yards/EPA** | `advanced_stats_{2023,2024,2025}.json` | ✅ yes | ✅ yes (18 weeks each) | ❌ **NO** — same class as usage; `_note` names it a sibling store, "same crosswalk, same player-week grain" as component_stats. Same ≥1-week-lag requirement | 5,897 / 5,935 / 6,108 player-weeks; near-identical position split to usage (sibling store) |
| **Pace** | `team_pace_2021_2025.json` | ✅ yes | ✅ yes (team-week) | ❌ **NO** — derived from that week's actual play-by-play (neutral-script play count), inherently post-hoc. Same ≥1-week-lag requirement | 544 team-weeks/season (32 teams), 515/505/499 measured (2023/24/25) — **team-level only, no position axis** |
| **Props** | `historical_props_{2023,2024,2025}.json` (full-season scope) | ✅ yes | ✅ yes (18 weeks each) | ✅ **YES** — verified in `fetch_historical_props.py:403-404`: each snapshot is requested at the game's own `commence_time`, "the closing line is the last snapshot at or before that instant." Pre-kickoff by construction, same class as Vegas | 3,795 / 3,224 / 3,257 player-week market entries; **keyed by raw bookmaker NAME string, not an id** — needs the same fuzzy crosswalk `props_season_projection.py`/`props_week1_arm.py` already use, not yet run against the full-season store |

## ⚠️ KALSHI IS A SEPARATE QUESTION FROM "PROPS", AND THE HONEST ANSWER IS A STRUCTURAL NULL, NOT A GAP

The routing order groups "props (Kalshi/odds captures)" as one line. They are not
one store. `kalshi-capture.yml`'s own header is explicit about why:

> *"Kalshi runs season-long PLAYER threshold ladders for 2026-27 that The Odds
> API does not sell at any price... Cory, 2026-08-16: 'Set it up for the
> future... not upset we didn't capture something [in 2027].'"*

**Kalshi cannot have 2023-2025 historical data by construction — the market
category is new in 2026, not a fetch we failed to run.** Rule 3e's three
questions (did the input vary / did it arrive / could the test have fired) don't
apply here the way they do to a genuine gap: there is no "arrival" to check
because nothing existed to arrive. The odds-captures half of this line
(historical player props via The Odds API) is real and covered by the props row
above; the Kalshi half starts from 2026 forward, tracked separately, and is not
part of the 2023-25 graded-fold question at all.

## WHAT THIS MEANS FOR D'S WALK-FORWARD FIT

Two signals (Vegas, props) are genuinely usable as same-week pre-game features
with no lag. Three (usage, air-yards/EPA, pace) are real, weekly, and fully
covered for all three graded seasons — **but every one of them is an outcome
store, not a pre-game signal**, and using a player's own week-N usage/EPA/pace
to predict his week-N points would be the exact leakage class this project has
been burned by before (nflverse_weekly_points appearing in three files as
"doesn't exist" when it did; the ceiling-collinearity defect). The fix is
mechanical and already how `own_model_v5.py`'s recency-blend features are built:
**lag every usage/EPA/pace feature by at least one week** (trailing single-week
value or a trailing multi-week average, walk-forward, never the graded week's
own row). Team-level stores (Vegas, pace) have no position axis and need the
per-player attachment step C4/C6 already established this session (offseason
depth-chart / roster join) if D wants them at player grain rather than team
grain — noted as a design question for D's fit, not answered here since grading
design is D's lane.

## VERIFICATION RECIPE

```
python3 -c "
import json
for f, key in [('component_stats_2023','weeks'), ('advanced_stats_2023','weeks'),
               ('historical_props_2023','weeks')]:
    d = json.load(open(f'draft/backtest/{f}.json'))
    print(f, len(d[key]), 'weeks')
"
grep -n "Leakage rule" draft/backtest/vegas_lines_2021_2026.json  # closing-line rule, in the artifact itself
sed -n '400,405p' draft/tools/fetch_historical_props.py           # pre-kickoff snapshot proof
```

No new fetch, no new code — every number above reads an already-committed store.
