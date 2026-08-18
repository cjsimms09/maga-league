# THE 2027 GOAL — our projections beat Sleeper and FantasyPros for THIS league

**Cory, 2026-08-18:** *"We really need to try to predict as much things as possible
to try to make our own rankings next year, ceiling, floor, volatility, etc. testing
all sorts of things, Vegas, Kalshi, pace of play, etc. and we need to grade and close
the loop. This time next year our projections should be better than sleeper and
fantasy pros for this league."*

**And: *"So are you going to own this part?"* — YES. The relay owns it.** Named here
so it is not a sentence in a chat log: the relay files every prediction, chases every
grade, and carries every consequence to whoever can act on it.
`draft/tools/prediction_ledger_check.js` is what makes that ownership cost something —
it fails the build on a prediction past its grade date, and on a grade that changed
nothing.

---

## 1. THE BAR, AS A NUMBER — because "better" is not gradeable

**We beat Sleeper and FantasyPros when, over the 2026 season, on THIS league's
scoring, our published weekly projection beats BOTH of theirs on the same players and
weeks, at 3 of 4 positions, on start/sit accuracy.**

Every clause of that is doing work:

* **THIS league's scoring** — half-PPR with a 6-point passing TD. A projection tuned
  to full PPR is not a competitor, it is a different question. Everything is scored
  through our own table (`score_stat_line`), never a vendor's points column.
* **the same players and weeks** — head-to-head on the intersection only. Beating a
  source on players it did not project is not beating it. (Register 4r is what
  happens when a population goes unasserted.)
* **start/sit accuracy, not MAE** — already the house metric (`test_start_sit`). MAE
  rewards being nearly right about a bench player; start/sit accuracy asks the only
  question a manager actually faces: *of these two, who do I play?* A projection that
  wins on MAE and loses on start/sit has not helped Cory once.
* **3 of 4 positions** — winning at one position is noise; winning everywhere is a
  claim nobody should believe on one season.
* **the PUBLISHED projection** — the one that was on the board *before* the week, read
  from the frozen snapshot. Not a refit.

**Graded weekly, cumulative, all season. The scoreboard already exists
(`/admin/model-scoreboard`, `model_accuracy_v6.json`); the bar above is what it is
now graded AGAINST.**

**AND ONE SCALE CHANGES — the SEASON-LEVEL self-grade is ALL-PLAY, not W-L.**
Ruled 2026-08-18 (A, from Cory's leeger find). Raw record pollutes the model's
grade with schedule luck: the tool could build a genuinely better roster and go
6-8 on matchups, or a worse one and go 9-5. The season grade is therefore the
roster's ALL-PLAY record (vs every score in the league, every week — leeger's
AWAL/Smart Wins construction, computed on our own committed weekly points) with
raw W-L REPORTED beside it, never graded against. This changes nothing above:
the weekly bar (start/sit, head-to-head, our scoring, published-only) was
already luck-free by construction — points against a projection have no
schedule. Only the season-summary number moves.

## 2. WHAT WE PREDICT — four quantities, not one

Cory named them: **ceiling, floor, volatility** — and the point projection under them.
Today three of the four are in poor shape, and today's board says so precisely:

| quantity | state on the 08-18 board |
|---|---|
| **mean** | `own_v6` blended, live, graded — the healthy one |
| **volatility** | per-player CV **landed today** — 271 of 693 players, RB now has **92 distinct ceiling ratios** where v23 had one per band |
| **ceiling** | **partial.** `measured-2023-25-p90-x-player-cv` 271 · plain cohort p90 264 · `gaussian_z` 158 |
| **floor** | same construction as the ceiling, same defect |

**⚠️ AND THE COVERAGE IS INVERTED AGAINST CORY'S ACTUAL QUESTION.** Per-player ceiling
coverage by ADP band on the live board:

| ADP | 1–24 | 25–48 | 49–72 | 73–108 | 109–160 | 161–300 | 300+ |
|---|---|---|---|---|---|---|---|
| **% per-player** | 100% | 86% | 85% | 91% | 69% | **46%** | **24%** |

**Rookies: 0 of 66.** The volatility term needs realized weeks, so the players with no
history — rookies, and the deep bench where Cory hunts upside — still get the cohort
constant. **The fix landed where the problem was smallest.** That is P9 below, and it
is the single highest-value open question in this program.

## 3. THE HYPOTHESIS BACKLOG

Everything Cory named, plus what this repo has already half-built and never graded.
**Each becomes a row in `PREDICTION-LEDGER.md` with an owner and a grade-by date, so
the CI check chases it whether or not anyone remembers.**

| # | hypothesis | why it might work | already in the repo? |
|---|---|---|---|
| **P9** | A rookie/no-history ceiling from **draft capital + landing spot + team pace**, not realized weeks | 0 of 66 rookies have a per-player ceiling today; the rookie draft-capital prior already CLEARED its bar (+25.1, 38% of the pooled Cory gap) | `apply_rookie_prior_own_model_2026.py`, `nflverse` draft picks |
| **P10** | **Vegas season-long win totals + team totals** improve team-context priors | team scoring environment is the largest single input to a skill player's opportunity | `historical_props_*.json` (3 seasons, 6 markets, real) |
| **P11** | **Weekly prop lines** beat our weekly projection outright | a market with real money at stake, per player, per week | weekly props store exists; **task #43 still PENDING** |
| **P12** | **Alternate-line props** give a genuine per-player DISTRIBUTION (the ceiling we could not buy) | over/under at multiple strikes ⇒ an implied CDF, which is exactly a ceiling | odds API key live, 75,681 credits remaining |
| **P13** | **Kalshi** markets add signal beyond sportsbooks | different participants, different pricing | `kalshi-capture.yml` exists |
| **P14** | **Pace of play / neutral-script plays per game** predicts opportunity better than prior-year usage | `opportunity_z` is a VETERAN BONUS built from last season — a rookie cannot earn it | `opportunity_is_a_veteran_bonus_2026-08-17.md` |
| **P15** | **Air yards / EPA / CPOE** add to the mean projection | study ran; never promoted | `exp` air-yards study, `wopr`/`adot` on the board |
| **P16** | **Weekly own-projection loop** beats the preseason projection by week 4 | in-season information should dominate | `own_weekly_v1` live |
| **P17** | **Floor** deserves its own construction, not `1 − ceiling` | floor is about missed games; ceiling is about role — different mechanisms | `proj_floor` shares the ceiling's defect today |

## 3b. 🔑 CORRECTION, 2026-08-18 — HALF THE BACKLOG ABOVE WAS ALREADY IN THE CHAMPION

**Written the same night as §3, after actually reading `own_model_v5.py`'s shipped
config instead of assuming.** The table above lists usage, pace and air-yards/EPA as
new axes. **Two of them are already inside `own_v6`:**

| position | volume term | pace term |
|---|---|---|
| QB | `raw` | — |
| RB | `raw` | — |
| **WR** | **`share`** | **`pace_lam` 1.0** |
| **TE** | **`share`** | **`pace_lam` 0.5** |

plus v5's stated components: usage volume, xFP efficiency regression, share-of-team
volume, availability regression, Vegas week-1 tilt.

**That is the cleanest explanation for two graded nulls this repo already held and I
had not read:** `pace_arm.json` (`clears: false`) and `advanced_efficiency_study.json`
(`clears: false`, 4 of 12 cells). **Both were re-adding a term the champion already
carries.** An arm cannot beat a model by giving it something it has.

### So the target moves, and this is the useful part

**The champion is built from USAGE AND EFFICIENCY STATISTICS.** Every axis in that
family is a variation on what it already does, and the two graded nulls are what that
looks like when measured. **The genuinely untapped axis is MARKET INFORMATION** —
numbers set by people with money at stake, from outside the statistical family
entirely:

* **P11** — weekly prop lines, per player, per week
* **P12** — alternate-line props, which imply the per-player *distribution* no source
  will state outright (and which is what survived P4 killing the expert route)
* **P29** — Kalshi, different participants and different pricing from the sportsbooks

**Those three are the priority.** **P27 survives but narrows**: RB and QB still use
`raw` volume rather than share, so a share-based arm is untested *there* and only there.

**The lesson worth keeping past this week:** the question is never *"what could we
add?"* — it is *"what does the champion NOT already have?"* Those are different
questions, and answering the first one cost this project two graded studies before
anyone asked the second.

## 4. THE RULES, FIXED NOW SO NO RESULT CAN BEND THEM

Written before any of P9–P17 has a number, for the same reason every prereg this week
was: **this is the only moment at which fixing them is free.**

1. **A null with every arm.** A shuffle, a random-subset, or a permutation that keeps
   the marginal distribution and kills the player↔signal link. **This is not
   ceremony — it killed P3 and P4 this week**, both of which showed positive-looking
   margins over their baselines and both of which a null reproduced.
2. **A known-positive control with every harness.** If a planted signal is invisible,
   "we found nothing" means nothing. `fp-projections-probe.yml` reported a clean
   verdict through a 9-key whitelist that would have dropped a ceiling field on the
   way in.
3. **Walk-forward only.** Select on seasons strictly earlier than the season you
   evaluate on. P3 died precisely here.
4. **Population asserted, never assumed.** QB/RB/WR/TE, stated and tested. Register
   4r: punters entered the calibration because nothing checked.
5. **Absent ≠ zero, and a fetch failure is an error.** Register 4s: a season vanished
   through three silent layers and the artifact still looked complete.
6. **The consequence is written down, including "NOTHING — <reason>".** A grade that
   moves nothing is a note, not a closed loop.

## 5. HOW THIS GETS DONE WITHOUT ANYONE REMEMBERING

* **Every row above is in `PREDICTION-LEDGER.md`** with an owner and a grade-by date.
* **`prediction_ledger_check.js` runs in CI** and turns the build red on an overdue
  prediction or a consequence-free grade.
* **Dates are staggered across the season**, not piled on one week, because a check
  that goes red on twelve rows at once gets ignored.
* **In-season is when this program actually runs.** The draft is 08-22; P10–P17 are
  season-long questions with weekly data arriving. **The loop closes 17 times, not
  once.**

**Owner: relay. Reviewed by A. First scoreboard grade: 2026-09-15 (after week 2).**
