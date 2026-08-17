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

**Realistic-arm mean delta vs the owner's actual draft:**

| seat | mean delta |
|---|---|
| **coryjsimms** | **−6.53** — essentially a tie |
| ds7mmet (best drafter) | **−163.43** — the tool is far worse than him |
| cashworth | **+12.56** — the tool beats him |

**The draft tool currently TIES Cory and LOSES BADLY to the league's best
drafter.** Against `EDGE-DEFINITION.md` that is **E1 unmet** — measured, not
guessed. Read `draft/audit/league_benchmark_2026-08-16.md` before quoting any
number from it; each seat-year is one alternative history.

**This is the most important number in the project** and it should set every
owner's priority above, because it says the draft board is not currently the
edge. Whether that is the board, the roster policy, or the replay's own
assumptions is exactly what owners 1-3 are for.
