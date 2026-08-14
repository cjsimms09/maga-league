# PRE-REGISTRATION — the three-season replay

**Written before the harness exists.** Every threshold, arm and exclusion below
is fixed now, while the answer is unknown. A criterion chosen after seeing the
result is a criterion chosen to pass.

TERRITORY: A · seasons 2023, 2024, 2025 · one league · one seat (Cory's)

---

## 1. THE QUESTION

> If the tools had run the team — draft, waivers, lineups — how would it have
> done?

Stated as an estimand rather than a slogan: **the difference in end-of-season
money and finish between a roster managed by the model and the same seat managed
by the two comparison arms, over the three seasons we hold complete data for.**

Not "did the model pick good players". Every measurement so far grades a
component against itself. This grades the whole system against reality.

**THE ANSWER THAT MATTERS MOST IS "IT DID WORSE."** If the design cannot return
that, it is not a test. §7 below is the specific property that keeps it able to.

---

## 2. THE THREE ARMS

Same seasons, same room, same schedule. They differ **only in who decides**.

| arm | draft | waivers | lineup |
|---|---|---|---|
| **ACTUAL** | Cory's real picks | Cory's real transactions | Cory's real starts |
| **MARKET** | best available by that year's ADP | never claims | highest projected, as of that week |
| **TOOL** | the composite under shipped weights | the waiver tool | the lineup tool |

**ACTUAL is the honest baseline** — the thing the tool has to beat to be worth
running.

**MARKET is the load-bearing control**, and it is the one most experiments in
this repo have lacked. It answers "did we beat *doing nothing thoughtfully*". A
tool that beats ACTUAL but not MARKET has demonstrated that Cory should follow
ADP, not that the model has edge.

**A fourth arm is deliberately excluded**: no "tool with hindsight". It would be
the most flattering number available and it answers nothing.

---

## 3. THE AS-OF RULE — the thing that makes or breaks this

**Every decision may use only what was knowable at the moment it was made.**

- **Draft** uses that season's PRE-SEASON projections and that season's ADP as
  published before the draft date. Not end-of-season stats. Not a projection
  file regenerated later.
- **Week N lineup** uses weeks 1..N−1 only. Never week N's own scores.
- **Waivers** claim only from players actually unrostered in that league that
  week, and the tool must not know who breaks out in week N+1.
- **Injury and status flags** must be the flags as of that week, not the
  season's final injury record.

**THE LEAK THIS IS MOST LIKELY TO HAVE, and it is not a hypothetical:** the
projection archive is REGENERATED. If a 2023 projection file on disk today was
built with any 2023 outcome in it, the draft arm is drafting with hindsight and
the tool wins by construction. **Provenance of every projection file used must
be established before any number is reported**, and if it cannot be established
for a season, that season is reported as UNAVAILABLE rather than estimated.

`league_history.json` carries 450 real picks across the three seasons and is
outcome-free by construction, so the ACTUAL draft arm is safe. **The projections
are the exposure.**

---

## 4. WHAT IS GRADED

Through the certified money layer (`roster_sim.py` -> money grade), the same one
exp34-dollars uses, because the league pays for weekly highs and playoff
finishes rather than for total points.

Reported per season and pooled:
- **money** — the objective Cory actually stated
- **final standing**
- **regular-season record**
- **total starting-lineup points** — the proxy, reported alongside so a
  divergence between it and money is visible rather than assumed away

---

## 5. PRE-REGISTERED DECISION RULE

**n = 3 SEASONS. THE UNIT IS THE SEASON, NOT THE WEEK.** Weeks within a season
share a roster, a draft and an opponent set; treating them as independent would
manufacture significance out of one draft. Three clusters supports a SIGN, not
an interval, and no confidence interval will be computed on three points.

Declared before running:

- **TOOL beats MARKET in all three seasons** -> the strongest result this design
  can produce. Still n=3; still not a promotion on its own.
- **TOOL beats MARKET in two of three** -> suggestive, reported as suggestive.
- **TOOL beats MARKET in one or zero** -> the tool has not demonstrated
  advantage over following the market, and that is the finding.
- **TOOL loses to ACTUAL in two or more** -> the tool is doing HARM at the seat,
  and that is reported first and loudest.

**No constant, weight, or threshold changes on the strength of this backtest.**
It is evidence about whether the system helps. Promotion is a separate decision
with its own evidence, per the standing rule.

---

## 6. THE DECOMPOSITION, DECLARED IN ADVANCE

Because a single money number cannot say WHERE the advantage came from, each arm
is also run with **one subsystem at a time** swapped to the tool:

- draft only · waivers only · lineup only

Declared now so it is not chosen after seeing which one looks good. If the total
is positive and every single-subsystem arm is flat, that is an interaction claim
and needs saying rather than assuming.

---

## 7. HOW THIS RETURNS "THE TOOL DID WORSE"

The property that keeps it honest, stated so it can be checked:

1. **The comparison arms are not strawmen.** MARKET follows ADP, which is the
   consensus of thousands of drafters and beats most humans.
2. **No arm gets information another lacks.** All three see the same week's data.
3. **The grader is certified and shared**, not written for this experiment.
4. **The losing outcomes are enumerated above BEFORE running**, with the
   harm case ranked first in the reporting order.

---

## 8. LIMITS, STATED BEFORE THE NUMBERS

- **n = 3 seasons, one league, one seat.** Can show a large effect; cannot show
  a small one.
- **The room is fixed.** Opponents made their real picks. The tool drafting
  differently would in reality have changed what was available to everyone
  afterwards; this design does NOT model that reaction. Its draft arm is
  therefore optimistic in a way that grows with how far it deviates from ACTUAL,
  and the deviation must be reported alongside the result.
- **Keeper rules changed across the three seasons** and must be applied per
  season, not uniformly.
- **The waiver arm depends on knowing who was unrostered**, which is recoverable
  from Sleeper transactions but is the piece most likely to be incomplete. If
  availability cannot be established for a week, that week's waiver decision is
  recorded as UNAVAILABLE and no claim is made for it.

---

## 9. WHAT THIS DOES NOT ESTABLISH

- Not that the model will help in 2026. Three past seasons under past rules.
- Not which component is responsible, unless §6's decomposition separates them.
- Not calibration of any individual quantity — this is an end-to-end outcome
  test and cannot attribute error to a term.
- Not anything about the side-bet or league-analyzer tools, which are graded
  separately.
