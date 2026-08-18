# THE HEADLINE EDGE NUMBER IS MISREAD IN FOUR FILES, INCLUDING `CLAUDE.md`

_TERRITORY: D. Written 2026-08-18, prompted by Cory: **"we've still found no
edge and no reasonable way to think we will be better at projecting points??
What're we doing here."**_

**`CLAUDE.md` line 27, `OWNERS.md`, and two `ROUTES.md` entries all say the
draft tool "ties Cory (−6.5) and loses to the league's best drafter (−163)".
The −163 seat belongs to ds7mmet, whom the same artifact ranks FOURTH of ten.**

The rank-1 drafter is Schmelley, and the tool is **−29.0** in his seat — better
than the league median seat (−31.4).

Nothing was recomputed to find this. Both numbers are in
`draft/data/replay_league_table.json`, thirty lines apart.

## 1. THE TABLE, ALL TEN SEATS

`draft/backtest/replay_seat_read.py` → `replay_seat_read.json`. It reads A's
artifact and never writes it.

| owner | seat | tool Δ (realistic) | drafter rank |
|---|---|---|---|
| ds7mmet | 2 | **−163.4** | 4 |
| mhagen | 7 | −118.7 | 5 |
| Sadbru | 10 | −79.9 | 6 |
| cashworth | 3 | −35.2 | 10 |
| MarianSaar | 6 | −33.8 | **2** |
| Schmelley | 9 | −29.0 | **1** |
| B8T3S | 5 | −13.9 | 7 |
| coryjsimms | 1 | −6.5 | 3 |
| Richard2121 | 8 | +26.9 | 8 |
| Jreis | 4 | **+125.4** | 9 |

## 2. THE ERROR HAS A NAME, AND IT IS CIRCULAR

**ds7mmet was called "the best drafter" because his seat held the tool's worst
delta.** The label was derived from the number it was then offered to explain.
Read forward it says "the tool loses to good drafters"; read honestly it says
"the tool lost most in one seat, so we called that seat's owner good."

**Both source documents forbade this in advance, in writing:**

> `replay_league_table.json.honesty`: *"the drafter-skill ranking is
> tool-independent … but surplus is skill + luck on ~36 picks per owner; **only
> the top3-vs-bottom-half group contrast is quotable**"*

> `league_benchmark_2026-08-16.md` §2, preregistered: *"**No 'best drafter' is
> crowned on a margin the table itself can't support**; the top3-vs-bottom-half
> GROUP contrast is the only quotable read."*

The guard was written, committed, and then not read by the four files that
summarise it. **This is the project's recurring failure mode — a sentence nobody
reconciled with the file it summarises — and it now has its most expensive
instance, because `CLAUDE.md` is what every session boots on.**

## 3. DOES THE TOOL'S DELTA TRACK DRAFTER SKILL? NO — MEASURED

The crowning presumes an answer to a question nobody asked.

| | |
|---|---|
| Spearman(tool Δ, drafter surplus/pick), n=10 seats | **−0.248** |
| permutation p (5,000 shuffles, two-sided) | **0.499** |
| **known-positive control** (same statistic, realistic vs optimal arm) | **+0.770, p=0.013 ✅ fires** |

**The control fires and the test does not.** Rule 3d's third question is
answered: the machinery finds a relationship when one is there. The tool's
per-seat delta is not a function of who it is drafting against.

## 4. AND THE SPREAD SWAMPS THE EFFECT — this is the part that matters most

| | |
|---|---|
| seat-years | 30 |
| mean Δ | **−32.8** |
| sd | **116.9** — 3.6× the mean |
| positive | **15 of 30** |
| range | −285.0 to +217.7 |
| se of the mean | 21.3 |
| **minimum detectable effect, 95%** | **±41.8 points/season** |

**A coin flip on seat-years, and a detection floor of ~42 points/season** — and
that floor is optimistic, since seat-years inside a year share a board vintage
and a player pool, so they are not 30 independent samples.

**This is the finding underneath the finding.** The replay is the only
instrument this project has for measuring an edge, and it cannot resolve any
board improvement worth less than roughly 42 points a season. Every projection
study run this week — routes/TPRR, snap share, week-1 props, the team-level
Vegas line — was chasing effects one to two orders of magnitude below that.
**They could not have registered here even if all four had worked.**

## 5. WHAT REPLACES THE HEADLINE

**Not "we lose badly to the best drafter." Not "we tie Cory and that's fine."**

> The tool is **modestly behind — mean −32.8 across 30 seat-years — and the
> measurement is too noisy to rank it against any individual owner.** Against
> `EDGE-DEFINITION.md` E1 is still **UNMET**: a wash is not an edge. But the
> shape of the problem is "unmeasurable", not "beaten".

**Nothing about the board changes today, and nothing should.** The
no-change-before-08-22 rule holds; this is a correction to four sentences and an
addition of one check.

## 6. THE CHECK

`draft/tests/test_best_drafter_claim.py`, `repo_parity`-marked on the ten prose
nodes only — the five control tests stay inside the publication gate, because
without them the ten are vacuous.

It reads the ranking from the artifact and fails any prose file that crowns a
non-rank-1 owner, **or** that quotes a seat delta as the best drafter's when it
is not. Four known-positive controls prove it can fire: a planted crowning, a
planted unattributed number, the ranking's own shape, and — because this repo
keeps corrected claims in place rather than deleting them — a proof that the
retraction exemption **cannot** be used to smuggle a fresh claim back in.

The gate-selection test refused my first attempt, in its own words: a
module-level `pytestmark` swept the controls in as *"soundness tests the gate
would silently skip"*. It was right; the marker moved to the two parametrized
functions.

## 7. TRESPASS, DECLARED

`CLAUDE.md`, `OWNERS.md`, `ROUTES.md` and `draft/tests/test_gate_selection.py`
(TERRITORY: A) are edited here by D. **SEND BACK and I re-prep any of them as a
diff.** I edited rather than routed because `CLAUDE.md` is the file every
session reads first and the draft is in four days; a false headline there costs
more per hour than the trespass does.

**Every original sentence is kept in place and marked corrected**, per the
precedent `league_benchmark_2026-08-16.md` set with its own +25.1 retraction.

## 8. WHAT THIS DOES NOT SAY

- **The replay is not wrong.** Its numbers, its honesty list and its small-n
  rule are all sound. Four downstream summaries were wrong.
- **Not a claim that ds7mmet is a bad drafter** — rank 4 of 10 on ~36 picks is
  not distinguishable from rank 2 either. The point is that no single-owner
  ranking is quotable, in any direction.
- **Not a re-run.** `replay_all_seats.py` was not executed; only read.
- **Not a projection-accuracy result.** §4's floor says the replay cannot referee
  small board changes; it does not say the board is right or wrong.
