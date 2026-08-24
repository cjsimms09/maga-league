# HOW WE GRADE — the decision-null standard

**Ruled by Cory 2026-08-21 after the SIAM paper (Getty, Li, Yano, Gao & Hosoi,
*"Luck and the Law: Quantifying Chance in Fantasy Sports and Other Contests"*,
SIAM Review 60(4) 2018), an independent audit, and one round of corrections
that the audit forced. This supersedes the split-half/R\* rule of 08-20.
Every lane grades this way from now on.**

---

## THE RULE, IN ONE LINE

**Grade the DECISION against a constructed null of the legal alternatives —
never the OUTCOME against the other owners.**

## WHY, IN THREE SENTENCES

Outcome-vs-owners needs many competitors to reach significance. We have ten,
forever, and at our own measured skill spread that comparison has **12% power
today and 20% after nine more seasons** — it will not converge in the lifetime
of the league. A null built *per decision* draws its power from the number of
decisions instead, which we have thousands of.

---

## THE FOUR REQUIREMENTS

Every grade filed from 2026-08-21 states all four. A grade missing any one of
them is not a grade.

### 1 · THE DECISION
Name the single choice being graded, and the moment it was made. "Did we have a
good season" is not a decision. "Given the roster he held in week 7, which nine
did he start" is.

### 2 · THE NULL — and it must be CONSTRUCTIBLE
Name the set of legal alternatives available *at that moment*, and how you draw
from it. If you cannot construct the alternative set, you do not have a grade;
you have a weather report.

| decision | its null | status |
|---|---|---|
| start / sit | a random legal lineup from the roster held that week | **built** — `start_sit_vs_random.py` |
| waiver claim | a random AVAILABLE player at the same position, same week | **built** — `waiver_vs_random.py` (755 claims, **0.7117** vs null [0.479, 0.521]) |
| draft pick | a random AVAILABLE player at that pick | **built** — `draft_pick_vs_random.py` (345 picks, **0.8554** vs null [0.4695, 0.5305]) |
| trade | a random swap of comparable roster slots | proposed |
| a projection | the same players/weeks scored by a published source | `PROJECTION-PROGRAM-2027` |

### 3 · TWO CONTROLS, AND THEY MUST RUN EVERY TIME
* **known-negative** — an agent choosing *at random* must land at the null's
  centre. **It must be drawn independently, not sampled from the null itself.**
* **known-positive** — an agent choosing *perfectly* (hindsight) must land at
  the extreme.

**A control that cannot fail is worse than no control**, because it converts an
assumption into a number people then trust. This is not hypothetical: the first
version of the start/sit known-negative scored an element *drawn from the null*
*against that same null* — 0.5 by construction, incapable of failing, and it
was caught by the external auditor rather than by us. Before you trust a
control, break the thing it watches and confirm it goes red.

**The controls gate the exit code.** A grader that prints "⛔ FAILED" beside a
headline and exits 0 will publish forever, because the cron commits the
artifact and the log scrolls past.

### 4 · THE MARGIN, IN THE UNIT THAT PAYS
Percentiles say *whether*. Points say *how much*. Beating random is a low bar —
random benches your stars — so always report the gap to the perfect-hindsight
choice in points, and only then the percentile.

> Measured, start/sit: the league leaves **15.90 points on the bench every week**. Cory
> 17.33 ± 1.68, best owner 12.06 ± 1.43 — a **≈2.4 SE gap worth ~74 points a
> season**. The entire *drafting* edge measured this month ran −9.4 to −188
> points. Start/sit was the same order of magnitude and nothing graded it.
>
> **⚠️ AND A UNIT TRAP, because the waiver table invites it:** waiver "points
> left" is REST-OF-SEASON per claim, and claims overlap in time — **they do not
> add up across a season.** Compare owners on it; never total it.

---

## FIVE RULES THAT COST US SOMETHING TO LEARN

1. **Never quote a rank as a finding.** Adjacent owners in the start/sit table
   sit inside one standard error. Print ±SE beside every per-entity number and
   say plainly that the ordering is not evidence.
2. **A threshold on n is not a power calculation.** The withdrawn rule said
   "≥20 graded outcomes". Power follows the size of the real *effect*; at our
   spread, n=50 gives 12%. A threshold that admits n=20 manufactures
   non-significant results that get quoted as "not skill" — a false negative
   dressed as a finding.
3. **Fix the seed AND the iteration order.** `SEED` at the top of a file
   advertises a reproducibility it does not deliver if a *set* decides the
   candidate order — Python randomises string hashing per process. Verify by
   running twice in separate processes and under two `PYTHONHASHSEED` values.
4. **Non-random dropping is a bias, and uneven n is how you see it.** The
   start/sit grader silently refused any week containing an unmapped player:
   28 weeks lost, one owner losing 10 and four losing none. The tell was a
   ragged n column. Print what you dropped and why, every run.
5. **Wire it, or it is not a policy.** The rule this replaces named an
   instrument that **nothing called** — no grader, no CI, no workflow. A rule
   with no mechanism decays from the day it is written.

---

## WHAT THIS DOES NOT CLAIM

Beating a random null says a decision *type* carries skill. It does not say the
beliefs behind the decision were good — start/sit skill is not projection
accuracy. It does not rank owners. And a low-powered null returning
"not significant" means **we cannot tell**, never "there is no skill."

---

## WHERE SKILL LIVES — the paper's design insight, and our edge map

> *"More accurate pricing algorithms push games toward the luck end of the
> spectrum... as the pricing becomes less accurate, skilled players can
> capitalize on undervalued players."* (§4.1)

**Our prices are ADP, the waiver wire, and FAAB.** Our edge is exactly the gap
between those prices and true value. Point tools at the places where the market
prices worst; grade every one of them against its null.

---

## MECHANISM

* `draft/backtest/start_sit_vs_random.py` — start/sit. Wired into
  `weekly-grade.yml`; controls gate the exit code; artifact committed.
* `draft/backtest/waiver_vs_random.py` — waiver claims (the ADD). Same shape.
* `draft/backtest/drop_vs_random.py` — **the DROP, added 2026-08-24.** The
  other half of the same transaction: 1,026 cuts were captured and none were
  graded, which is how the wire came to recommend dropping Ja'Marr Chase with
  nothing measuring the advice (register 277/288). 676 graded, 0.8001 against
  a null of [0.4782, 0.5218]. **Its direction is INVERTED — for a drop, less
  rest-of-season value is the good outcome — and the known-positive control
  (cut the least-scoring man, reads 0.955) is what pins the sign.**
* `draft/backtest/draft_pick_vs_random.py` — the draft pick itself. **This is
  the replacement yardstick for the retired engine-minus-owner comparison** in
  `engine_seat_replay.json` / `replay_league_table.json`, whose estimand reads
  "mean engine-minus-owner season total" and which contain neither the string
  `random` nor `control`.
  **⚠️ IT DOES NOT YET REPLACE THE −188.35 HEADLINE, and saying so plainly
  matters: it grades the HUMAN picks in our historical drafts, not the engine's.
  Retiring that number needs the engine run through the same counterfactual and
  its picks scored against this same null.** What it establishes today is the
  yardstick and that the yardstick works.
* `draft/tests/test_start_sit_determinism.py` — reproducibility guard.
* `draft/tools/skill_luck_r.py` — **retained as a descriptive instrument only.**
  Not required of any arm; never run on standings as a certification; never
  quoted without its null band.

Evidence: `draft/audit/GETTY-TEST3-STARTSIT-2026-08-21.md`,
`SKILL-LUCK-R-POWER-2026-08-21.md`,
`DECISION-NULL-GRADING-CLAIM-2026-08-21.md` (the audited claim).
