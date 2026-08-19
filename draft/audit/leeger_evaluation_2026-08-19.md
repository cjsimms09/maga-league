# `leeger` evaluation — build, not depend

_TERRITORY: D. Written 2026-08-19, against the ROUTES ask filed 08-18
("RESOURCE RETAINED FROM CORY — `github.com/joeyagreco/leeger`"), whose
own DEFAULT is satisfied by this write-up: "D evaluates the library vs
building the two stats... by 08-27; either way the two uses above are the
deliverable, the library is the reference implementation."_

**Recommendation: build the three stats directly against
`draft/data/league_history.json`. Do not add the dependency.**

## 1. What the two named uses actually need

The ask names two deliverables: (1) Team Luck / AWAL / Smart Wins as a
weekly opponent-profile artifact, in-season; (2) grading the tool's own
2026 roster by ALL-PLAY record rather than raw W-L, for the 2027 program.
Both need exactly three numbers per team-season, computed from data we
already hold.

## 2. Read the library's actual source, not its README

Downloaded `leeger` 2.7.0 from PyPI and read the three calculators the ask
names, rather than trusting the pitch:

- **AWAL** (`AWALYearCalculator.getAWAL`): per week, count how many other
  teams' scores you beat (+0.5 per tie), divide by `(league_size − 1)`,
  sum across weeks. A closed formula over per-team weekly points — nothing
  it needs is missing from our data.
- **Smart Wins** (`SmartWinsYearCalculator.getSmartWins`): same idea, but
  each week's score is compared against **every score in the whole
  season's pool**, not just that week's opponents — a smoother variant of
  the same all-play idea.
- **Team Luck** (`SSLYearCalculator.getTeamLuck`): `Team Success − Team
  Score`, where `Team Success = 100·(actual WAL per game) + 2·(scoring
  share) + 0.05·(max score + min score)` and `Team Score` is the same
  formula with **AWAL** substituted for actual WAL. **The library's own
  docstring flags this: "these formulas use several 'magic' numbers as
  multipliers, which typically should be avoided."**

## 3. The magic numbers are a red herring for the one stat we want

Team Success and Team Score share the scoring-share and max/min terms
**verbatim, same multipliers** — they cancel in the subtraction:

```
Team Luck = Team Success − Team Score
          = 100·WAL_per_game − 100·AWAL_per_game
          = 100 · (actual win rate − deserved win rate)   [per game]
```

So the number this project actually wants — "is this team's record better
than its schedule of scores deserves" — reduces to a clean, explainable
quantity with no unexplained constant left in it once you don't need the
composite Team Score/Team Success ranking the library also offers. We
would inherit the caveat for nothing: we only want the difference, and
the difference doesn't carry the magic numbers.

## 4. The data is already here — verified against the real file, not assumed

`draft/data/league_history.json`, `seasons[].weeks['<n>']`: a list of
`{roster_id, points, ...}` per roster per week, for all 18 weeks of 2023,
2024 and 2025 (2026 is empty, correctly — season hasn't started).
`seasons[].standings`: `{roster_id, wins, losses, ties, points_for, ...}`
per roster for the season. That is every input all three formulas need:
per-week points (AWAL, Smart Wins) and actual win/loss record (Team
Luck's WAL half). No new fetch, no new store — the "existing weekly-points
+ matchup fetch" the ask names is already committed and already covers
three full historical seasons.

## 5. What adding the dependency would actually cost

`pip download leeger --no-deps` then reading its wheel metadata:
`Requires-Dist: espn_api, fleaflicker, numpy, openpyxl, pymfl,
setuptools, sleeper, yahoofantasy` — **four different fantasy-platform
SDKs** (ESPN, Fleaflicker, MFL, Yahoo) pulled in for a Sleeper-only
league, plus `numpy`/`openpyxl` this repo doesn't otherwise carry as a
runtime dependency. And its own Sleeper loader is a full league-model
ingestion layer (`Year`/`Week`/`Matchup` objects, its own validators) we
would have to map our already-committed `league_history.json` shape onto
— translation work either way, not a shortcut past our own data.

## 6. The estimate

AWAL, Smart Wins, and Team Luck (via the cancelled-constant form above)
are each a loop over `weeks[w][roster].points` — roughly the ~80 lines
the ask itself estimated, no new dependency, no unexplained multiplier to
carry forward or defend to Cory. `leeger`'s tests remain useful as a
**reference to check the build against** (the ask's own framing: "the
library is the reference implementation") — e.g. hand-verify one team's
AWAL against `AWALYearCalculator.getAWAL` on the same input, as a
known-positive control, without shipping the package.

## 7. What's NOT done here

This is the evaluation only, per the ask's DEFAULT deadline (08-27). The
two deliverables themselves — the weekly opponent-profile artifact and
the ALL-PLAY season-grade adoption into `PROJECTION-PROGRAM-2027` — are
separate, larger pieces of work, correctly NOT draft-week items, and not
attempted here. Recommend filing them as their own dated rows once
claimed.
