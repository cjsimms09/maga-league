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
proxy**. `ceiling` now ships at **0.45** (Cory's ruling, shipped) rather than
the zero this section originally described — the number below is stale on that
one fact and is corrected here rather than silently.

## RE-ANSWERED, 2026-08-19 — does the mean-of-4 board move where the edge is?

Routed by A: the shipped multi-source projection blend leaves the top-12 at
each position almost untouched (median move 0.5–3.0 pts) and substantially
reorders the tail (whole-position max move 24–29 slots). **Either that is
exactly right, or it is a warning that we shipped a change whose entire effect
sits in the one region our grading cannot see.** Both readings are true, and
they are not in tension — they are two separate facts about the same shape.

**This is the same question A already filed BLIND as P117** (`PREDICTION-LEDGER.md`,
grade-by 09-05): a NULL on the seat replay is predicted and explicitly must
NOT be read as "the blend does not help" — only as "the instrument cannot see
tail-of-board reordering." What follows here is the E1-E5/football-sense
reasoning behind that same prediction, not a second measurement — P117 owns
the graded number when it lands.

**Why the shape is structurally correct, not a coincidence.** VORP is
`proj_mean − replacement[pos]`, and `replacement` itself is a function of
`proj_mean` across the whole position — a small, real projection change near
the top moves both the player's number and the shelf it is measured against by
similar amounts, so early picks are naturally stable under almost any honest
re-projection. The blend's actual NEW information — real cross-source
disagreement instead of a per-band constant — is inherently a **late-round
signal**: three independent scrapers agree closely on Josh Allen (sd 1.45)
and disagree by 34x on whether Ashton Dulin plays a meaningful role at all.
Tier-1 players don't have role uncertainty to disagree about. **The tail is
where genuine disagreement lives, which is also where Cory says the draft is
won** (*"find upside late"*, this session) — this is the same match the
tier-ramped ceiling proposal (routed to me, same day) derives from first
principles rather than asserts.

**But the honest second half, not waved away: we cannot currently PROVE this
helps E1-E5.** The seat replay — this project's only instrument that grades in
E1-E5's own currency (points, dollars, finish) rather than accuracy — has a
measured detection floor of **±41.8 pts/season** (session D, register DS1,
same shape P110 was built to respect). A change concentrated in bench-tier
reordering is exactly the kind of effect that floor is least likely to resolve
from noise. So: the blend is well-argued to be *pointed* at the edge, and it
is *not yet measured* to have moved it. Those are different claims, and only
the first one is currently true.

**What would close the gap, in order:** (1) the tier-ramped mean→ceiling blend
I am preregistering per A's routed ask — if the ramp shape is named from an
existing artifact and graded on the seat replay rather than swept, a positive
result there is a real E1-E5 signal, not an accuracy footnote; (2) re-running
`FRONTIER.md` experiment 21's ceiling-tilt study on the blended dispersion
instead of the old band-constant one — if cross-source ceiling/floor is a
truer per-player signal (which is the whole argument for shipping it), the
already-measured +$56/season λ=0.5 result should either strengthen or hold,
and a study that already speaks E1-E5's language is the cheapest way to find
out. Neither is done yet; both are now named rather than assumed.
