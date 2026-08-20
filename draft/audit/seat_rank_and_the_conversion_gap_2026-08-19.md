# The tool finishes 8th of 10 — and in two of three seasons it out-drafts the room and loses anyway

**A, 2026-08-19.** Prereg: `draft/SEAT-RANK-PREREG-2026-08-19.md` (P125, P126),
filed before the rank was computed and explicitly **not blind** — every per-seat
delta was already visible, which that document says in its own first section.

Cory: *"Once we get further along need to rerun our model to see how we would've
drafted compared to other owners. Need to strive for top 3!"* and, separately,
*"Roster still not normal."*

**Those turn out to be the same finding.**

Lab: `draft/backtest/seat_rank_lab.py` → `draft/backtest/seat_rank_lab.json`.
Eleven controls, all passing, listed in §6.

---

## 1. THE ANSWER TO THE QUESTION ASKED: 8th

Fixed-opponents counterfactual — the tool's roster replaces one seat, the other
nine owners keep their real season totals, everything graded on the same arm.

| arm | mean rank of 10 | top-3 | rate | chance |
|---|---|---|---|---|
| **optimal** (preregistered primary) | **7.80** | **3 of 30** | **10%** | 30% |
| realistic | 7.57 | 5 of 30 | 17% | 30% |

Per season, optimal arm:

| season | mean rank | top-3 | the ten seat ranks |
|---|---|---|---|
| 2023 | 7.30 | 2/10 | 9 3 9 10 8 9 7 9 3 6 |
| **2024** | **10.00** | **0/10** | **10 10 10 10 10 10 10 10 10 10** |
| 2025 | 6.10 | 1/10 | 5 10 5 7 7 5 3 4 8 7 |

**P125 is TRUE.** The tool lands top-3 at a third of the chance rate. In 2024 it
finishes dead last in all ten seats.

**Read this with its limit attached every time it is quoted, because the limit is
large:** this is the engine **on bundle boards**, which hand it strictly less
than the live board does — the risk term is age-only, injury/depth/opportunity
inputs are *declared absent* by the bundle builder, and the projections are a
walk-forward reconstruction rather than the multi-source mean now shipping. A
bad rank here is a bad rank for engine-on-bundles.

## 2. AND THE NUMBER EVERY FILE QUOTES IS THE WRONG ONE

`CLAUDE.md`, `OWNERS.md` and two `ROUTES.md` entries carry the tool as **"roughly
a wash with Cory (−9.4)"**. That is `replay_league_table.json` — **the PROXY**
(own_v6_nomarket projections, the proxy's own selection rule) — and it is the
**realistic** arm, which that artifact's own honesty note says is *"the tool's
best case and is not the headline."*

**The shipped engine has had its own replay for days and nobody has quoted it:**

| | optimal | realistic |
|---|---|---|
| pooled `beats_n_of_10` | **0** | **0** |
| median owner mean delta | **−174.43** | −181.54 |
| Cory mean delta | **−188.35** | −181.61 |

**Verified rather than read.** The graded store's `git_head` (`b62b906d`) differs
from its input choices file's (`1f74a747`), so the store looked stale. I re-ran
`replay_seats_grade.py` against the current choices file: **every pooled figure
reproduced to the decimal.** Only two provenance strings moved. The −174 is live.

This is register 80's shape again — a diagnostic sitting in a committed file,
its existence mistaken for the check having been done.

## 3. MY OWN EXPLANATION FOR 2024 IS FALSE, AND THAT IS THE USEFUL PART

**P126 predicted** the first-appearing gap (players with no weekly points in any
prior season — the population a walk-forward projection cannot price) explains a
large share of 2024 and little of 2025.

| season | engine roster | owner roster | gap |
|---|---|---|---|
| 2023 | **0 players, 0.0 pts, 0.0%** | 12 players, 1554.1 pts, 7.7% | +7.7 pp |
| 2024 | **0 players, 0.0 pts, 0.0%** | 16 players, 2196.4 pts, 10.1% | +10.1 pp |
| 2025 | **0 players, 0.0 pts, 0.0%** | 17 players, 1968.7 pts, 9.8% | +9.8 pp |

**The gap is essentially constant — 10.1 against 9.8 — so it cannot explain why
2024 is four times worse than 2025. P126's substantive half is FALSE.** It is a
persistent ~9pp tax in every season, not a 2024 effect, and the excuse I was
reaching for is gone.

**What it does establish is worse than what I predicted: the engine drafts ZERO
first-appearing players in 30 of 30 rosters.** Never one, in three seasons. The
counter that reports that zero was given its own known-positive (§6, control 5)
precisely because a zero from an untested counter is a bug report, not a result.

## 4. THE REAL DECOMPOSITION — a season total is points ACQUIRED × share STARTED

−174 pooled two different failures with two different owners.

| season | engine roster/lineup | conv | owner roster/lineup | conv | roster vs owner | conv gap |
|---|---|---|---|---|---|---|
| 2023 | 20650 / 15286 | **0.740** | 20218 / 16732 | 0.828 | **+2.1%** | **−0.087** |
| 2024 | 17990 / 14656 | 0.815 | 21749 / 17955 | 0.826 | **−17.3%** | −0.011 |
| 2025 | 21127 / 16300 | 0.771 | 20111 / 16766 | 0.834 | **+5.1%** | **−0.062** |

**In 2023 and 2025 the engine's roster holds MORE total points than the owners'
rosters — +2.1% and +5.1% — and loses anyway.** Every point of those two seasons'
loss is conversion: value acquired that never reaches a starting slot.

**2024 is the opposite and the only season of its kind:** conversion is nearly
level (−1.1pp) and the roster is simply 17.3% short of points.

So there are two defects, not one:
- **A conversion defect in all three seasons** — 6 to 9 points of every 100 the
  roster holds. **This is Cory's "roster still not normal", measured in points.**
- **A 2024 selection defect** — one season where the engine picked worse players.

**The flattering half got the check it needed (rule 3d).** "The engine out-drafts
the owners on raw points" is exactly what a size mismatch would fake — a bigger
bench inflates roster points and mechanically depresses conversion. **Skill
roster sizes are like-for-like: engine 13.0 / 12.9 / 12.9, owners 13.0 / 13.1 /
12.8.** The confound is dead and the finding survives.

## 5. WHAT THE CONVERSION DEFECT ACTUALLY IS — and it is not the running backs

Mean positional counts, engine against owners:

| season | engine | owner | engine conv gap |
|---|---|---|---|
| 2023 | QB **2.30** RB 5.00 WR 4.70 TE **1.00** | QB 1.70 RB 4.80 WR 5.20 TE 1.30 | −0.087 |
| 2024 | QB **1.20** RB 4.20 WR 6.50 TE **1.00** | QB 1.60 RB 4.70 WR 5.40 TE 1.40 | −0.011 |
| 2025 | QB **2.70** RB 5.10 WR 4.10 TE **1.00** | QB 1.50 RB 4.70 WR 5.10 TE 1.50 | −0.062 |

**The conversion gap tracks the QB surplus monotonically and nothing else.** QB
1.9 → conv 0.740; QB 2.7 → 0.771; QB 1.2 → 0.815, where the gap nearly vanishes.
In a league that starts one quarterback, a second and third can never be started
— those points sit on the bench by construction.

**Per seat, it is worse than a mean suggests. One 2023 seat drafted SEVEN
quarterbacks:**

```
2023 QB [1, 1, 1, 1, 1, 2, 7, 2, 4, 3]
2025 QB [3, 5, 3, 2, 1, 2, 4, 2, 1, 4]
2024 QB [1, 1, 2, 1, 1, 1, 1, 1, 1, 2]
```

Seven quarterbacks on a 13-player skill roster is six players who cannot ever be
started. **RB is NOT the pileup here** — engine 5.00/4.20/5.10 against owners'
4.80/4.70/4.70.

**And the other constant is degenerate:**

```
2023 TE [1,1,1,1,1,1,1,1,1,1]
2024 TE [1,1,1,1,1,1,1,1,1,1]
2025 TE [1,1,1,1,1,1,1,1,1,1]
```

**Exactly one tight end in 30 of 30 rosters** — not a mean of 1.0, literally one
every time, across three different boards and ten seats each. A count that
constant across 30 independent drafts is a mechanism, not a preference. It is the
same shape as the family `CLAUDE.md` already names: `rookie_affinity` 0 for 10 of
10, `adp_sd` 617/617 on a default, dispersion as `proj_mean × a per-band
constant` — **full coverage, no information.**

**This corroborates the roster-shape lab independently:** that lab found top-3
teams in this league draft 1.83 tight ends against everyone else's 1.29, and the
tool drafts 1.00. Two instruments, different data, same gap.

### The live board fails the same way at a different position

`fieldability_probe.js` on the published 2026 board (`06:45:15Z`), shipped arm:

```
shipped     {"WR":4,"RB":10,"QB":1,"TE":1,"K":1,"DEF":1}   🔴 wk7 QB, wk10 TE
```

**RB 10 here, QB 1 — the mirror image of the bundle boards.** But **TE is 1
again**, and the roster is again un-fieldable in two weeks.

**That is the unifying mechanism, and it is already filed as register 60:
`need` is the only roster-aware term in the composite and it ships at weight
zero.** With nothing penalising a pileup, whatever position happens to price
best gets taken repeatedly — quarterbacks on the 2023/2025 bundle boards,
running backs on the 2026 board. **Register 60 has never carried a cost. It has
one now: 6 to 9 points of conversion per 100 roster points, which in 2023 and
2025 is larger than the entire acquisition edge the tool earns.**

⚠️ **The live-board walk drains the room in strict ADP order and is the engine's
own tendency, not a forecast of the 22nd** (register 67). The comparison between
arms on one shared room is what is meaningful; the absolute counts are not.

## 6. CONTROLS — eleven, all passing, and one of them failed first

| control | result |
|---|---|
| rank ceiling: a total above every owner must return 1 | ✅ 1 |
| rank floor: a total below every owner must return 10 | ✅ 10 |
| ranking the ten REAL owners must give a clean permutation | ✅ `[1..10]` |
| first-appearance known-positive: a 2024 rookie fires, a veteran does not | ✅ Nabers 2024, Henry 2021 |
| **the counter that reports the engine's zero must be able to return non-zero** | ✅ fires 1 player / 10.0 pts |
| conversion ∈ (0, 1] for both sides in all three seasons | ✅ 6 of 6 |

**The fourth control FAILED on its first run, and its failure was itself the
finding.** It looked both players up in the 2024 **engine** rosters and Nabers
came back `null` — because the engine never drafted him in any 2024 seat, which
is the very blindness §3 measures. **A control must not be routed through the
population under test.** Re-pointed at the league-wide name map, it passes.

**The fifth exists because §3's headline is a zero.** `share_first()` reports 0
first-appearing players in 30 of 30 engine rosters; a counter that can never
return a positive prints exactly that. Rule 3e.

**And one defect was caught before it ran at all:** my first draft read
`seat["owner_roster"]`, a key `engine_seat_replay.json` does not carry. It would
have printed `0 players, 0.0 pts, 0.0% of total` for **every owner in every
season** — the exact shape P126 predicts, confirming my own hypothesis with
nothing. Caught by listing the seat's keys instead of assuming them. Owner
rosters now come from the grading module's own crosswalk (rule 11).

## 7. RULE 3g — what else does this mean

**Does it imply another failure we have not looked for?**
Yes, and it is specific: **`need` at weight 0 means no term in the shipped
composite prevents ANY positional pileup.** The two boards we have measured
pile up at two different positions, so the next board will pile up at whichever
position it happens to price best — this is not a QB bug or an RB bug. It also
implies the `bye` term's measured impotence (register 69/`bye_term_participation.js`:
fires on 5 of 15 picks, changes the pick once in fifteen at four times its
shipped weight) is the *second* disconnected roster-aware term, not an isolated
one.

**Does it invalidate something we already trust?**
Yes — **the "−9.4, roughly a wash" headline in four files.** It is the proxy's
best-case arm and the shipped engine's own number is −188.35 on the primary.
Corrected in `CLAUDE.md` in the same commit as this file, because that is what
every session boots on. It also puts a cost on register 60, which has been open
without one, and it independently corroborates the roster-shape lab's TE finding
by a completely different route.

**Is it routed to the lane that can act?**
Register 60 is A's and is where the mechanism lives. The TE=1 constant is a
composite question (E owns whether the model makes football sense; A owns the
code). **Nothing ships from this before Saturday** — §5 of the prereg forbids
selecting a configuration from a diagnostic, and a weight change three days out
on the strength of a bundle-board replay is exactly what `no_fit_guard` exists
to stop. **The deliverable is a measured cost on an open row, not a new weight.**
