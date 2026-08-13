# THE FANTASY VALUE LITERATURE, AND WHERE THIS MODEL SITS IN IT

*Written 2026-08-13, after Cory's ruling: "Do research on existing mathematical
equations in fantasy football. Understanding these numbers we're dealing with
would've prevented our earlier mistake."*

**It would have prevented more than one.** The single most useful thing this
research produced is not a new formula — it is the recognition that at least
three of the four terms this model measured and discarded were never football
results. That finding, and the screen built from it, are in §5.

---

## 0. THE LIMITATION ON THIS RESEARCH, STATED FIRST

**Most primary sources were unreachable.** The environment's egress policy
blocked `footballguys.com`, `subvertadown.com`, `support.fantasypros.com`,
`en.wikipedia.org` and most analytics sites. What I could read in full was
**one GitHub repository**. Everything else below comes from **search-engine
summaries of those pages**, not from reading them.

That matters for how much weight each claim carries:

| tier | what it means | how to treat it |
|---|---|---|
| **MEASURED** | computed here against `public/draft_data.json` | trust; the code is in the repo and re-runnable |
| **READ** | I read the primary source in full | trust the description |
| **SUMMARISED** | search-result summary only; I did not read the source | **a formula could be misremembered or a caveat dropped** — verify before implementing |

Every claim below is labelled. **No SUMMARISED formula should be implemented
without first reading its source.** Nothing here is implemented on that basis.

---

## 1. FAMILY ONE — STATIC BASELINES (computed once, before the draft)

All of them share one equation, which is Joe Bryant's original contribution,
borrowed from fantasy baseball's positional-scarcity idea:

> **value(player) = projected points − baseline(his position)**

*A player's value is not what he scores, it is how much he outscores the
alternative at his position.* Everything in this family is an argument about
what "the alternative" means.

| name | baseline is… | in a 10-team league with QB1/RB2/WR2/TE1/FLEX1 |
|---|---|---|
| **VOLS** — value over last starter | the worst player at that position who still starts for *somebody* | RB20 before flex |
| **VORP** — value over replacement | the best player still **unrostered** when the draft ends | ~RB40 |
| **man-games** | weights the baseline by how many games you actually need covered | — |
| **BEER** | equal weight to starters **and "needed bench players"** | — |
| **BEER+** | BEER, plus risk-adjustment by historical positional variance, plus a **QB-streaming adjustment** | — |

*(all SUMMARISED)*

**Harstad's per-game correction** *(SUMMARISED)* — he argues the central flaw in
all of the above is that they are computed on **season totals**, which punishes
a great player who missed games:

> **VBD = (PPG − baseline PPG) × games played**

His example: Gronkowski 2013 scored 83.2 points in 7 games. On season totals he
looks below replacement. On a per-game basis he was 6.63 VBD/game — one of the
strongest at the position.

### WHERE WE SIT

- Our engine's `vorp` is on the board and **`replacement` is one value per
  position** (QB 341.7 / RB 188.5 / WR 172.7 / TE 150.7 / K 97.0 / DEF 99.0), so
  `vorp = proj_mean − constant` **(MEASURED)**. Within a position it is a shift,
  and it therefore **cannot reorder anything** a value weight has not already
  ordered. That is the last link of the six-link VORP chain, confirmed
  mechanically rather than argued.
- **We have never implemented Harstad's correction and we cannot** —
  `games_expected` is a **pure position constant** (QB 15.5 / RB 14.2 / WR 15.0 /
  TE 14.8 / K 16.5 / DEF 17.0, one value each, **MEASURED**). Reranking RBs by
  points-per-game moves nobody more than one place. **See §5.3 — this is the
  largest single data gap in the stack.**
- **BEER is the closest published relative of our bench equation.** Its "equal
  weight to needed bench players" is the same instinct as
  `P(need Nth backup) × E[max(0, X − waiver)]`. **BEER+'s QB-streaming
  adjustment is a generalisation of our `RENTED = {K, DEF}`** — it says QB should
  be *partially* rented too. Our plan spends pick 73 on Dak Prescott; whether
  that seat should be rented instead is a concrete, testable question.

---

## 2. FAMILY TWO — DYNAMIC / DRAFT-FLOW (recomputed at every pick)

**VONA — value over next available** *(SUMMARISED, and it matches our
implementation exactly)*:

> how many more points a player scores than the **best player you expect to be
> available at that position at your next pick**.

The literature's stated caveats are the ones we hit independently:

- it **cannot be computed before the draft** — it shifts with the room;
- it **requires predicting who your opponents take between your picks**;
- it is described as "a decades-old idea… very difficult to do on your own in a
  draft" — i.e. **the compute is the edge**, not the concept.

**Drop-off / tier-break** *(SUMMARISED)*: take the position about to fall off a
cliff. Stated as *"knowing when a position is about to drop off is more
important than where you pick."* This is the same quantity as our
`QBdrop(now→later) > RBWRdrop(now→later)` framing.

**Auction dollar values** *(SUMMARISED)*: distribute the budget in proportion to
positive VBD share, `$1` floor per roster slot, recompute dollars-per-point as
money leaves the room. Not directly applicable to a snake draft — but the
**dollars-per-point idea is a common currency**, and we currently have no common
currency between a starter's value (season points) and a bench player's value
(insurance price). That is a real gap in `draft_plan.js` and it is why the
"total value 1502.4" figure sums two different units.

### WHERE WE SIT

**VONA is the one place we are genuinely at or past the state of the art**, for a
boring reason: we have the compute and a wired opponent model
(`survival.js:246 tendencyTilt`, 450 picks / 10 managers / 3 seasons). The
literature says the hard part is prediction; we have three seasons of *these
nine opponents*.

**The known defect stands:** VONA excludes the player from his own replacement
pool, which inflated Allen's QB VONA to 33.6 against a corrected 1.3.

---

## 3. FAMILY THREE — OPPORTUNITY & USAGE (predicts the projection, doesn't consume it)

This is the family we are **weakest** in, and it is exactly what Cory asked for
("teams that run more plays, players that get more touches, faster pace").

| metric | formula | what it is for |
|---|---|---|
| **xFP** — expected fantasy points | value each opportunity by what an average player scores from that situation (location, down, distance, air yards) | **volume**, stable, predictive |
| **FPOE** — points over expected | actual − xFP | **efficiency**, noisy, regresses |
| **WOPR** | `1.5 × target share + 0.7 × air-yards share` | receiver opportunity; 0.5+ starter-level, 0.7+ elite |
| **RACR** | `receiving yards / air yards` | efficiency; >1 = beats the throw depth |
| **Dominator rating** | share of team receiving production | >30% predicts NFL success |
| **Neutral-situation pace** | seconds/play in Q1–Q3, within 7 points, >2 min left in half | **≈5 sec/play ⇒ ≈15 more plays/game** |

*(all SUMMARISED)*

**The xFP/FPOE split is the important idea, not any single metric.** It says:
separate what a player was *given* from what he *did with it*, because the first
persists and the second regresses. A tiebreaker built on the second is a
tiebreaker built on noise.

### WHERE WE SIT — AND THE SURPRISE

**`wopr`, `target_share` and `opportunity_share` are already on our board**, on
428 of 576 players, and they **clear the independence screen (MEASURED)**:

```
wopr               428/576   R² 0.234 from (mean, sd, adp)   INDEPENDENT
target_share       428/576   R² 0.305                        INDEPENDENT
opportunity_share  428/576   R² 0.282                        INDEPENDENT
```

> ### CORRECTION — 2026-08-13, same day, before anything was built on it
>
> I first wrote here, and in commit `98487b6`, that **"nothing in the scoring
> path reads them."** **That is false.** `draft/projections.py` reads all three,
> in two places, and the effect is not decorative:
>
> 1. **`composite_z` → `opportunity_adj` → `proj_mean`.** `wopr` (WR/TE) or
>    `opportunity_share × 10 + rz_share` (RB) is z-scored within position, then
>    `adj = clamp(±0.15, (z/2) × 0.15)` and `proj_mean = baseline × (1 + adj)`.
>    **MEASURED: 359 of 576 players carry a non-zero adjustment. Median move 1.5
>    points, p90 20.8, max 45.0.**
> 2. **`player_variance` → `proj_sd`**, via bell-cow / committee thresholds on
>    the same shares.
>
> The usage signal is **already inside the projection.** I read the board's field
> list, saw no consumer in the JS scoring path, and inferred non-use without
> reading the Python producer. **That is the same error class this whole document
> is about: concluding from an absence I had not actually looked for.** It is
> also, precisely, the constitutional rule firing — the claim that flattered the
> finding was the one I checked least.

**WHAT SURVIVES THE CORRECTION** (all MEASURED, and it is narrower but real):

- The adjustment is **capped at ±15% and clipped at |z| = 2**, and the cap binds
  **asymmetrically**: observed range `−0.073` to `+0.150`, with **26 players
  pinned at the upper cap.** Past that cap, additional `wopr` does **nothing**.
  That clipping is where the residual independent variation the screen detected
  actually lives.
- So the open question is **not** "should we use usage" — we do — but **"is ±15%
  the right cap, and should usage break ties *directly* as well as through the
  mean?"** Those are different channels: a tie in `proj_mean` is a tie that
  already has the usage adjustment baked in. A direct tiebreak would be reading
  the same signal a second time, and whether that is double-counting or a
  legitimate second channel is an empirical question, not an obvious one.

> ### CORRECTION TWO — THE SAME MISTAKE AGAIN, TEN MINUTES LATER
>
> Immediately after writing Correction One, I wrote that `proj_sleeper` and
> `proj_fantasypros` were *"written by the ingest and consumed by nothing — I
> have checked the producer this time."* **Also false.**
> `public/js/draft/consensus.js:45-46` reads both. I checked the producer and
> again did not check the consumers. **Twice in one document, ten minutes apart,
> asserting non-use without grepping for readers.**
>
> That is worth more than the finding it corrupted. **Claiming a thing is unused
> is a claim about EVERY file, and it cannot be established by reading one.**
> The only sound form is a repo-wide search, and both times the search took
> seconds and both times I skipped it because the conclusion was convenient.

**WHAT `consensus.js` ACTUALLY DOES** (READ, in full, this time):

- **Averages** the per-source projections into a displayed raw-consensus number
  (contract C3), labelled honestly by source count.
- Flags the **disagreement moment** — a same-position candidate projecting higher
  than the recommended player — so both numbers are on screen when the machinery
  is either finding something or broken.
- **Neither field enters the score.**

**So the narrowed finding, which does survive:** the **magnitude** of
`|sleeper − fantasypros|` is used nowhere. It is displayed as an average and as a
binary "someone projects higher" flag, never as a *size-of-disagreement* signal.
That magnitude is the Chen-tier analogue, and it remains unread (§4).

> **AND A STALE DESCRIPTION FOUND ON THE WAY (MEASURED).** `consensus.js`'s
> header states: *"TODAY IT IS SLEEPER ONLY — … FantasyPros projections are a CI
> fetch not yet populated. So this renders 'Sleeper proj', not 'consensus'."*
> **Both sources are now populated on exactly 402 players**, and the artifact's
> own provenance records `consensus_sources: 2`, `fantasypros_attached: 437`,
> `fp_proj_rows_parsed: 525`. The code branches on the data and so is correct;
> **the comment describing it is false.** Same class as the four false
> descriptions corrected in `engine.js` — a comment that was true when written
> and became a lie when the data landed. Recorded, not edited: it is B's file.

**Still genuinely absent:** team pace, plays per game, and rushing usage beyond
`opportunity_share`. Those remain a C request — now with the precise
neutral-situation definition above rather than "get pace".

---

## 4. FAMILY FOUR — UNCERTAINTY, VARIANCE AND CONSENSUS

**Boris Chen's tiers** *(SUMMARISED)*: a **Gaussian mixture model over aggregated
expert rankings**. The stated motivation is that *"rankings imply a strict
monotonic ordering and do not illustrate the true distance between players —
QB1 > QB2 > QB3 when the reality might be QB1 >> QB2 = QB3."*

**This is the finding that reframes our −235 tier result.** Chen clusters
**expert rank dispersion** — how much the experts *disagree*. Our `tier` field is
**monotone in `proj_mean` rank inside every position (MEASURED)**: it is a
partition of the value ordering it is being added to. **These are not the same
quantity.** A coarsening of the ranking you already have can only lose
information relative to that ranking; measuring it as a drag is nearly a
tautology. **The −235 is evidence against our construction, not against tiers.**

**And the raw material for the real version is on the board.** `proj_sleeper` vs
`proj_fantasypros` disagreement, on 402 players **(MEASURED)**:

```
relative gap |sleeper − fantasypros| / proj_mean:   median 0.205   p90 0.733
R² of the raw gap from (proj_mean, proj_sd):        0.074
```

Nearly **independent of both level and variance** — real new information, and
nothing reads it.

**Consistency measures** *(SUMMARISED)*: coefficient of variation; boom/bust
rates against position thresholds; the **Sortino ratio**, which uses *downside*
deviation only on the argument that plain standard deviation wrongly punishes
the big weeks that win matchups.

**One strategic result worth testing** *(SUMMARISED, and I have not verified it)*:
*consistency helps average and above-average teams; inconsistency only helps
below-average teams.* If true it implies a **split variance preference**, and our
model is currently half-right by accident: the bench is priced with an
upside-only option (variance-loving, correct for a bench flier), but **starters
are priced at the mean (variance-neutral)** when a strong roster should be
variance-*averse* in its starting seats. With three keepers — Chase, Henry,
Walker — we are the above-average team in that result.

---

## 5. FAMILY FIVE — THE STRUCTURAL RESULT THIS RESEARCH ACTUALLY PRODUCED

### 5.1 The convergent objective

The one source I could **READ in full** (`github.com/dlm1223/fantasy-football`,
LP + Monte-Carlo over a snake draft) states its central correction in almost the
words we used independently:

> *"the thing you want to optimize is not all of your picks' points — a more
> appropriate objective would be to draft in a way that will give you the
> eventual best starting lineup."*

That is our objective sentence, arrived at separately. Its stated conclusions —
**draft two backup QBs**, **avoid zero-RB**, **RB-early ambiguous**, **results
sensitive to projection bias** — are all testable against our own simulator, and
the first one is interesting because *our plan already takes two QBs* and I have
not tested whether that is right. Its stated limitation is the same as ours:
**opponent picks are not modelled**, only ADP thresholds. We are ahead there.

### 5.2 The pattern behind four failed terms — THE MAIN FINDING

Four terms were measured, found worthless, and each result was recorded as a
fact about football:

```
tier     -235          "tier cliffs do not pay"
risk     -143          "safety does not pay"
ceiling  unsignable    "upside cannot be measured"
bye      null          "bye weeks do not matter"
```

**At least three were facts about algebra.** All MEASURED:

- `proj_ceiling = proj_mean + 1.036 × proj_sd` — every player, every position.
  **A ceiling weight is a relabelled mix of the value and variance weights.**

  > **FRAMING CORRECTION.** I described this as a lock *discovered* because
  > "nothing systematic was looking". That overstates it. `draft/projections.py`
  > lines 19–20 declare `FLOOR_Z = -0.674  # 25th percentile` and
  > `CEILING_Z = 1.036  # 85th percentile` as named, commented constants, and
  > line 240 applies them. **The construction was never hidden.** What was
  > missed is the *consequence*: that a quantity built this way cannot be
  > measured as a separate weight, so the "ceiling unsignable" result was
  > preordained by line 240 and not by football. **The lock was in plain sight
  > and the inference from it was never drawn** — which is a different failure
  > from a hidden defect, and arguably a worse one.
  >
  > **AND THE COMMENT AT LINE 232 DEFENDS THE WRONG FAILURE MODE.** It reads:
  > *"Keeping this per-player is what stops ceiling − mean collapsing into a
  > constant multiple of the mean, which is what made UpsideBonus inert."*
  > Since `season_sd = proj_mean × variance`, we have
  > `ceiling − mean = 1.036 × proj_mean × variance`. It **is** a multiple of the
  > mean; the multiple is `1.036 × variance`, which takes **10–24 distinct
  > values per position (MEASURED)**. So the comment is right that it is not a
  > *constant* multiple — and **being non-constant does not make the ceiling
  > identifiable**, because it remains an exact function of `(mean, sd)`. The
  > fix works against the failure it names and not against the one that matters.
- `tier` is monotone in `proj_mean` rank within every position. **A tier weight
  is a coarsening of the ordering it is added to.**
- `games_expected` is one value per position, so points-per-game is `proj_mean`
  divided by a constant. **Rank-identical within position.**

> **A REGRESSOR THAT IS A FUNCTION OF THE REGRESSORS ALREADY PRESENT CANNOT BE
> MEASURED. ITS FITTED WEIGHT IS WHATEVER THE FIT NEEDS AND ITS SIGN IS NOISE.
> REPORTING THAT AS "THE IDEA DOES NOT WORK" IS THE ERROR.**

This is the same shape as the vacuous `check(..., true)` assertions (task #23)
and the ratio-locks (task #24): **a procedure that cannot fail, whose passing was
read as information.** Three instances, three different layers of the stack.

`draft/tools/independence_screen.js` finds the condition mechanically. It found
**11 of 25 fully-populated board fields affine-locked to others at R² > 0.9999.**

**It reports and does not decide.** DERIVED means "cannot be independently
measured on this board" — never "delete it". Per the timing ruling, **no removals
before Aug 22.**

### 5.3 The largest data gap: no player-level durability

`games_expected` being a position constant means **the board asserts every RB
plays 14.2 games.** Consequences:

1. **Harstad's per-game VBD — the literature's single most-cited correction to
   season-total VBD — is unavailable to us.** Not unimplemented: the input does
   not exist.
2. Our `INJURY` table in `draft_plan.js` (flat per-position rates) is **not a
   shortcut we chose over better data. It is exactly as much as the board
   supports.**
3. **A durability tiebreaker is currently impossible**, and durability is
   plausibly a larger real edge than pace or touches.

This is the same "treat every member of a class as interchangeable" pattern as
the 1,181 identical projections — but **in the source data rather than in our
code**, which is why nothing we own caught it.

---

## 6. WHAT THIS CHANGES, IN PRIORITY ORDER

| # | item | cost | status |
|---|---|---|---|
| 1 | **Test the ±15% usage cap.** Usage is already in `proj_mean`; 26 players are pinned at the upper cap and get no credit past it. The question is the cap, not the signal | low | **A, actionable now** |
| 2 | **Source-disagreement MAGNITUDE** from `proj_sleeper` vs `proj_fantasypros` — displayed as an average and a binary flag, never as a size-of-disagreement signal. The real Chen-tier analogue | low | **A, actionable now** |
| 3 | **Player-level expected games / durability** — unblocks the per-game correction and a durability tiebreaker | needs data | **C — the biggest gap** |
| 4 | **Neutral-situation pace + plays per game + rushing usage** — spec is now precise (Q1–Q3, within 7, >2 min left) | needs data | **C** |
| 5 | **Test the split variance preference** — starters variance-averse, bench variance-loving | medium | A, post-draft |
| 6 | **Test "two backup QBs" and BEER+'s partial QB-streaming** against our own simulator | medium | A, post-draft |
| 7 | **A common currency** between starter points and bench insurance price (the auction dollars-per-point idea) | medium | A, post-draft |

**Nothing in this document is implemented on a SUMMARISED basis.** Items 1 and 2
rest on MEASURED facts about our own board and are the only two I would move on
before the draft.

---

## 7. WHAT NOT TO BUILD

- **Anything keyed on RACR, FPOE, or other efficiency metrics as a tiebreaker.**
  The whole point of the xFP/FPOE split is that efficiency regresses. A
  tiebreaker on the regressing half is a tiebreaker on noise.
- **A ceiling term, until the ceiling is estimated independently of mean and sd.**
  Rebuilding it on this board reproduces the collinearity exactly.
- **A tier term rebuilt on point gaps.** That is the construction that measured
  −235, and now we know why.
- **Any tiebreaker at all without a backtest to score it against.** The frontier
  is 42 projected points (`tiebreak_frontier.js`). Every intuition-added term so
  far has measured negative or null. The rule that would have prevented all four:
  **screen for independence before measuring, and measure before shipping.**
