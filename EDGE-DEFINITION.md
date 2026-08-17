# EDGE — what this model is actually for, in Cory's numbers

**Cory, 2026-08-17, asked what an edge means to him:**

> *"EDGE COMES FROM BEATING MY CURRENT DRAFTING (OR AT LEAST IN TOP 4), WINNING
> MORE MONEY, WINNING LEAGUE MORE OFTEN THEN 3/10 TIMES. MAKING PLAYOFFS 50% OF
> THE TIME, SCORING MORE THAN LEAGUE AVERAGE. ANY OF THOSE I CALL AN EDGE."*

**Nobody had written this down.** Until today the model had no stated target, and
that is the deepest version of the problem Cory has been circling all week: a
project can be rigorous about everything and still not know what it is for.

---

## THE FIVE CRITERIA — any one of them counts

| # | criterion | the number |
|---|---|---|
| **E1** | beat Cory's own drafting | **> his actual result**, or **top 4** |
| **E2** | win more money | **$ per season**, against the payout table |
| **E3** | win the league more often | **> 3 in 10** |
| **E4** | make the playoffs | **≥ 50%** |
| **E5** | score more than league average | **> league mean PF** |

## THE GAP THIS EXPOSES — we measure ACCURACY, he wants OUTCOMES

**Almost every number this project holds is an accuracy metric: MAE, Spearman,
bias.** Not one of Cory's five criteria is an accuracy metric. **They are all
outcomes**, and a more accurate projection does not automatically win more games
— it has to survive roster construction, positional scarcity, the other nine
managers, and variance.

**So "our MAE improved" is not evidence of an edge, and we have been reporting it
as though it were.**

| what we measure constantly | what Cory asked for |
|---|---|
| MAE, Spearman, bias vs realized points | finish position, $ per season, title rate, playoff rate, PF vs league mean |

## THE ONE STUDY THAT ALREADY SPEAKS HIS LANGUAGE

**`FRONTIER.md` experiment 21 is denominated in DOLLARS PER SEASON** — E2,
directly. Across 150 paired rooms built from Cory's real keeper base it found an
inverted-U on ceiling tilt: **λ=0.5 worth +$56/season (CI [33, 78])**, λ=0.25
+$44, and heavy tilt provably negative (λ=2 −$18; λ=3 −$27, CI excludes zero).
`POLICY-TOURNAMENT.md` §5 reproduced the shape from a different control.

**That is what an edge measurement looks like**, and it is the exception rather
than the rule. Its own caveat is stated and stands: both ran in the simulated-room
PROXY on the v1 money model, not on held-out real seasons.

## WHAT EACH CRITERION NEEDS TO BE MEASURABLE

| # | can we measure it today? | what it needs |
|---|---|---|
| **E1** beat his drafting | **partly** — `replay.js` drives the real engine over his prior drafts, one seat | grade the replayed roster against his actual roster in points and in finish |
| **E2** more money | **yes, in proxy** — the payout table is committed ground truth and `exp34_dollars` / `FRONTIER` already price in $ | move off the v1 money proxy onto held-out seasons |
| **E3** title rate > 3/10 | **not yet** — needs a season simulator over the drafted roster | `champodds` exists; point it at the replayed rosters |
| **E4** playoff rate ≥ 50% | **not yet** — same machinery as E3 | same |
| **E5** PF > league mean | **yes** — realized stores are populated 2021-2025 (585-611 players each) | join replayed rosters to realized weekly points |

**Three of five are reachable with machinery that already exists.** None of them
is being reported.

## THE BASELINE — measured 2026-08-17, from `career_reconcile.json` + `league_history.json`

**You cannot beat a number nobody has computed.** This is that number.

| | Cory, 2023–2025 |
|---|---|
| record | **23–22 (.511)** |
| rank among 10 managers | **5th–6th** |
| playoff cut | **top 4 of 10** (`playoff_teams: 4`) |
| top-4 finishes | **1 or 2 of 3 seasons — 33%–67%** |

**The league, three-season win rate:** ds7mmet .667 · mhagen .622 · Jreis .556 ·
MarianSaar .533 · **Schmelley and coryjsimms .511** · cashworth .467 · B8T3S .422
· Richard2121 .378 · Sadbru .333.

**STATED LIMIT:** two rosters finished 23–22 and the roster→user map is not in
these artifacts, so per-season finishes cannot be attributed to Cory with
certainty. Both candidate paths give the same answer to the question that matters
(1 or 2 top-4s in 3 years), so the range is reported rather than a point estimate.
**Closing that map is a one-line fix and it turns a range into a number.**

### What this does to the five criteria

- **E1 / E4 are THE SAME BAR** in this league — top 4 *is* the playoff cut.
- **E4 at 50% means beating 40%**, which is what four playoff spots in ten teams
  gives you by chance alone. So the target is real but modest, and it is roughly
  "convert the seasons you currently finish 5th into 4th."
- **E3 at >3-in-10 is the hard one.** A .511 manager is not a 30% title favourite
  in a 10-team league, and no amount of draft-board accuracy alone gets there —
  that criterion needs the in-season tools too.
- **E5 needs PF**, which is not in these artifacts; the realized stores can supply
  it once rosters are joined.

**The honest read: the model's job is to move Cory from just-outside the cut to
inside it, repeatedly.** That is a smaller and much more tractable target than
"be more accurate", and it is measurable against the number above.

## THE RULE THIS CREATES

**Every T1 and T2 change is ultimately justified in one of E1-E5, or it is not
justified — it is merely accurate.** Accuracy is a means. It is allowed as
intermediate evidence, and it is never the headline.

**E's standing weekly question is answered in these terms:** *where does our edge
come from, in points or dollars, and which input is carrying it?*

**And the honest current answer, stated plainly so it can be improved on:** the
only edge number this project holds is **+$56/season from ceiling tilt, in a
proxy** — and that weight has been shipping at **zero** in the composite while
the study that priced it sat in the repo.
