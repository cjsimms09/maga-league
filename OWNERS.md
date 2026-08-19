# OWNERS — one named lane per thing Cory cares about, owned the way he would

**Cory, 2026-08-17:** *"FEEL LIKE WE NEED SOMEONE TO OWN EACH AND EVERYONE OF
THESE THINGS AND OWN IT IN THE SAME WAY I WOULD. NOT JUST ACCEPT NO, BUT LOOK FOR
ANSWERS, ASK MORE QUESTIONS, GET MORE ANSWERS, FIND EDGE!!!"*

**"Owned the way Cory would" has a definition, and it is not enthusiasm.** It is
the four things he has actually done this week that we did not:

1. **He refused a stated limit and it collapsed — four times in one day.** Sleeper
   history "permanently unmeasurable" (false, 2025 is clean) · `spread_line`
   unobtainable (we already held 6 seasons) · "no 2022/2021 store" (both exist,
   589 and 611 players) · "the replay is one seat" (**the all-seats replay had
   already run**). An owner re-checks the limit against the disk before repeating
   it.
2. **He applied common sense to an output and it beat a study.** Same ceiling for
   everyone. An oracle worth nothing. McBride over Jefferson.
3. **He asked what it is FOR.** Nobody had written the edge down until he was
   asked point-blank.
4. **He would not accept "later."** A model that is wrong now is wrong on
   draft day.

**The standard for every owner below: a "no" is only finished when it carries a
measurement, an unblock condition, an owner and a recheck date** (Rule 3f).

---

## THE SIX, AND WHO OWNS THEM

| # | the thing | owner | how it is owned |
|---|---|---|---|
| **1** | **Adjuster / auto-function fine tuning** | **A** (fit) · **E** (does it buy edge) | `autoWeights` phases are honest guesses — the code says so. Fit against the **ALL-SEATS replay** (~30 seat-seasons), which **has already run**. Register 26, `replay_league_table.json`. |
| **2** | **FantasyPros vs Sleeper vs blend** | **C** (fetch) · **A** (rule) · **relay** (run) | Module + prereg + workflow are built. Needs one dispatch from `main`. Registers 21/24. |
| **3** | **Does the big board make FOOTBALL sense** | **E** | **NEW — nobody owned this.** Cory: *"shouldnt stray too much from ADP or something probably wrong."* See the standing check below. |
| **4** | **Is all data captured and stored** | **D** | `DATA-LIFECYCLE.md` steps 1-3. Capture never stops without Cory (Rule 3c). |
| **5** | **Are we making the predictions we need to learn** | **D** | Steps 4-5. A store that reaches no prediction is an open question, not a fact. |
| **6** | **Are they graded, acted on, loop closed** | **D** (graded) · **E** (acted on) | Steps 6-8. **A grade nobody feeds back is a diary.** |

## THE ONE THAT DID NOT EXIST — #3, THE ADP-DRIFT CHECK

**Cory's rule, verbatim:** *"SHOULDNT STRAY TOO MUCH FROM ADP OR SOMETHING
PROBABLY WRONG, IF WRONG SOMEONE NEEDS TO FIND AND FIX."*

This is a **cheap, powerful, permanently-running sanity check** and we have never
had one. The market is ten thousand drafters; when our board disagrees with it by
a lot, the prior should be that WE are wrong, not that we found an edge.

**The check, every time a board publishes:**

1. For every player, compute **board rank − ADP rank**.
2. **Flag anyone who moves more than a round** (10 picks in a 10-team league).
3. **For each flag, the board must say WHY in one line** — a real reason from the
   model (tier cliff, keeper value, positional scarcity, a stack), not a shrug.
4. **A flag with no reason is a suspected defect and goes in the register.**

**The two failure modes this catches, and they are opposite:**
- **Too much drift** → a bug, exactly as Cory says. A player 40 picks off the
  market is usually a crosswalk miss, a scoring mismatch or a degenerate field.
- **Too LITTLE drift** → we have no edge at all. **If the board never disagrees
  with ADP, we have built an expensive way to reproduce the consensus** — and
  every disagreement is where the edge lives. **This half matters as much and is
  easier to forget.**

**So the report is two-sided:** how many players drifted, how far, how many
disagreements carry a stated reason — and the distribution, not just the count.
**A board with zero drift fails this check as surely as one with wild drift.**

## THE MEASUREMENT THAT SHOULD SET EVERYONE'S PRIORITY

**The all-seats replay has run** (`replay_league_table.json`, `replay_all_seats.py`,
every owner's real seat 2023-25) and it answers Cory's older question — *"does
the model lose to everyone's drafting or just mine?"*

> **⚠️ CORRECTED 2026-08-18.** This section used to print a three-row table
> labelling ds7mmet *"best drafter"* and reading *"the tool LOSES BADLY to the
> league's best drafter (−163.43)"*. **That label is wrong on the artifact's own
> data** — the replay's tool-independent drafter study ranks ds7mmet **4th of
> 10**. Worse, the artifact forbids the read in advance (`honesty`: *"only the
> top3-vs-bottom-half group contrast is quotable"*), as does the audit doc's
> preregistered small-n rule. The seat was crowned because it held the tool's
> worst delta — the number the crown was offered to explain.
> `draft/audit/replay_best_drafter_claim_2026-08-18.md`.

**Realistic-arm mean delta vs the owner's actual draft — all ten seats, with
each owner's tool-independent drafter rank:**

| seat | tool Δ | drafter rank |
|---|---|---|
| ds7mmet | **−163.4** | 4 |
| mhagen | −118.7 | 5 |
| Sadbru | −79.9 | 6 |
| cashworth | −35.2 | 10 |
| MarianSaar | −33.8 | **2** |
| Schmelley | −29.0 | **1** |
| B8T3S | −13.9 | 7 |
| **coryjsimms** | **−6.5** | 3 |
| Richard2121 | +26.9 | 8 |
| Jreis | **+125.4** | 9 |

**Read the whole column and the story changes.** The tool's delta does **not**
track how good the opposing drafter is — Spearman **−0.25, permutation p=0.50**
on ten seats, with a known-positive control firing at p=0.013, so the test could
have found a relationship and did not. Against the two drafters the study
actually ranks 1st and 2nd, the tool is −29.0 and −33.8 — both at the league
median seat (−31.4).

**And the spread swamps the effect.** Across 30 seat-years: mean **−32.8**, sd
**116.9** (3.6× the mean), **15 of 30 positive**, range −285 to +218. Each cell
is one alternative history.

**What survives:** the tool is modestly behind, roughly a wash, and the
measurement is too noisy to rank the tool against any individual owner. Against
`EDGE-DEFINITION.md` that is still **E1 unmet** — a wash is not an edge — but
"loses badly to the best drafter" was never in the data. Read
`draft/audit/league_benchmark_2026-08-16.md` before quoting any number from it.

> **⚠️ EVERY NUMBER ABOVE IS THE *PROXY*, AND IT IS NOT THE SHIPPED TOOL —
> corrected 2026-08-19, register 88.** These are `replay_league_table.json`:
> `own_v6_nomarket` projections with the proxy's own selection rule. **The real
> `engine.js` at `MEASURED_WEIGHTS` has its own replay through the same
> fixed-opponents counterfactual, and it says something much worse:
> `beats_n_of_10_pooled` = 0 on both arms, median owner delta −174.43, Cory
> −188.35 on the preregistered primary.** Where it would have FINISHED: **8th of
> 10** (mean rank 7.80, top-3 in 3 of 30 against a 30% chance rate).
>
> **"Roughly a wash" is a statement about the projection model. It is not a
> statement about the tool, and the two were being read as one.** The gap is
> where the tool SELECTS: in 2023 and 2025 the engine's roster holds MORE points
> than the owners' (+2.1%, +5.1%) and loses entirely on **conversion** — 6 to 9
> points of every 100 that never reach a starting slot, because `need` ships at
> weight 0 and nothing penalises a positional pileup.
> `draft/audit/seat_rank_and_the_conversion_gap_2026-08-19.md`.

**This is still the most important measurement in the project**, and the first
thing owners 1-3 should notice is that its noise floor is the binding
constraint: at sd 116.9 per seat-year, **an improvement worth less than ~42
points/season cannot be detected in 30 samples at all** — and that floor is
optimistic, since seat-years inside a year share a board vintage and a player
pool. **In projection units: ΔMAE ±0.310 points per player-week, which is 5.4%
of `own_v6`'s own weekly error.** Not unreachable — but nothing measured this
week was within a factor of 39 of it. `draft/backtest/replay_seat_read.json`.
