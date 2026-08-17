<!-- TERRITORY: A -->
# ROOKIE WR UPSIDE, QUANTIFIED — EXPLORATORY — 2026-08-17

> **Cory:** *"Still think we should target rookie WR with opportunities later in
> the draft. KC Concepcion, Cyrus Allen.. their cost is cheap and upside is
> there.. can you find a way to quantify why I think they have upside and look
> for similar players. If we can, how do we account for that in our model?
> Especially if we decide barbell theory is right"*

**⚠️ EXPLORATORY. The numbers here were computed BEFORE any preregistration
existed.** Every other study in this repo prereg's first, in an earlier commit;
this one did not. It is hypothesis-generating, not confirmatory, and **nothing
may ship on it** without a preregistered confirmatory pass. Saying so is cheaper
than pretending the order was different.

**Runner:** `draft/backtest/rookie_wr_capital.py` · **Artifact:**
`rookie_wr_capital.json` · **Tests:** 12 in
`draft/tests/test_rookie_wr_capital.py`.

---

## THE ANSWER, FIRST

**Your instinct is right about Concepcion and wrong about Cyrus Allen, and one
measurable variable we already hold separates them: NFL draft capital.**

Every NFL rookie WR of 2023–25, graded against the **WR waiver wire (124.1
pts/season)** — the honest alternative use of a late roster spot, and the same
bar the barbell study used:

| NFL round | n | mean | vs wire | 95% CI | ≥150 pts | verdict |
|---|---|---|---|---|---|---|
| **rd 1** | 15 | 131.5 | **+7.4** | [−19.7, +34.3] | **8/15 = 53%** | not distinguishable from the wire |
| rd 2 | 12 | 91.0 | −33.1 | [−62.3, +0.0] | 3/12 = 25% | not distinguishable (borderline) |
| rd 3 | 17 | 50.2 | −73.9 | [−91.0, −53.8] | **0/17** | **CLEARLY BELOW** |
| rd 4–7 | 55 | 24.7 | **−99.4** | [−108.6, −88.6] | **1/55 = 1.8%** | **CLEARLY BELOW** |

- **KC Concepcion — NFL rd 1, pick 24, CLE.** Top row. Board ADP **147**,
  proj 127.4.
- **Cyrus Allen — NFL rd 5, pick 176, KAN.** Bottom row. Board ADP **228.5**,
  proj 30.2.

**I am not claiming rd1 rookie WRs beat the wire. Their interval spans zero.**
The claim is narrower and it is the one the data supports: *rd1 is the only
tier that is not measurably worse than streaming the spot, and rd4–7 is
measurably, badly worse.*

## 1. WHERE YOUR "UPSIDE" ACTUALLY LIVES — it is a tail claim, so it needs a tail metric

You did not say rookie WRs score more on average. You said the **upside** is
there, and upside is a statement about the top of the distribution. Measured at
a 150-point season (comfortably above the 124.1 wire):

    rd1   53%     rd2   25%     rd3   0%     rd4-7   1.8%

That is your intuition, quantified. **A first-round rookie WR is a coin flip on
a WR1-adjacent season.** Nothing else in the late board that we have measured
offers that.

And the mean hides it. Rookie WRs taken at pick 61+ in our own league returned
**125.4** against veterans' **121.3** at the same picks — a wash. But the tail
rate was **47% vs 32%**. *If you had only looked at the average you would have
concluded there was nothing here.* That is the specific reason this was missed.

## 2. WHY NONE OF OUR TEN NULLS ALREADY ANSWERED THIS

Two committed studies look like they cover it. Neither does, and I checked
before running anything:

- **`barbell_strategy_2026-08-17.md`** — rounds 11–15 dead, −27.8 vs the wire.
  Its population **does** include rookies (`universe()` requires only ≥1 game,
  not a prior-season row). But it **never split rookies out**, so a live
  subgroup inside a dead band is invisible to it. The word "rookie" appears
  **zero times** in that audit.
- **`opportunity_inheritance_2026-08-17.md`** — its pick-61+ cell contains
  **zero rookies by construction**, because the shared population rule requires
  a prior-season stat row and no rookie has one. That study escalated the point
  itself: the league drafted **37** rookies at pick 61+ across three seasons and
  the graded cell could not see one of them.

There is also a **structural** reason the veteran null need not transfer. That
study's null was explained by mean reversion: `own_share_y1` predicts decline,
and "vacated volume above you" is its arithmetic complement. **For a rookie
`own_share_y1` is zero by definition**, so the confound that killed the veteran
arm cannot operate on this population.

**This is not a tenth null overturned. It is a cell nobody had graded.**

## 3. THE PART THAT ARGUES AGAINST YOU — Cyrus Allen, and Puka Nacua

The rd4–7 tier is where the late-round-rookie-WR *belief* comes from, and it is
the tier with the hardest number in the table: **−99.4 [−108.6, −88.6]**, one
150-point season in **55**.

That one is **Puka Nacua (234 pts, 2023)** — the single most-cited late rookie
WR outcome in recent memory. That is exactly the shape of an availability trap:
the example everyone can name IS the base rate, and the base rate is **1.8%**.
Cyrus Allen is a rd5 pick. On this evidence he is not a cheap lottery ticket;
he is the measurably worst kind of late pick we have found, alongside the
late-round backup QB the barbell pass flagged (−76.1).

**Your two examples are not the same bet.** One is the best late subgroup we
have measured; the other is in the worst.

## 4. THE COMPARABLES — this year's class, joined to the live board

**Similar players to Concepcion (the tier that is not measurably dead):**

| NFL | player | tm | ADP | proj | tier |
|---|---|---|---|---|---|
| rd1 pk4 | Carnell Tate | TEN | 71.7 | 154.8 | rd1 |
| rd1 pk8 | Jordyn Tyson | NOR | 86.3 | 133.8 | rd1 |
| rd1 pk20 | Makai Lemon | PHI | 101.0 | 138.5 | rd1 |
| **rd1 pk24** | **KC Concepcion** | **CLE** | **147.0** | **127.4** | **rd1** |
| rd1 pk30 | Omar Cooper Jr. | NYJ | 178.0 | 104.6 | rd1 |
| rd2 pk33 | De'Zhaun Stribling | SFO | 155.7 | 105.4 | rd2 |
| rd2 pk39 | Denzel Boston | CLE | 167.7 | 99.9 | rd2 |
| rd2 pk47 | Germie Bernard | PIT | 259.5 | 80.9 | rd2 |

**Concepcion and Omar Cooper Jr. are the two cheapest first-round rookie WRs on
the board.** For reference, our league's own drafts took rd1 rookie WRs at picks
15–107 across the last three years — Concepcion at an ADP of 147 would be
cheaper than any of them. *(Units caveat: those are our league's pick numbers,
this is a market ADP; they are not the same scale, so treat it as an
indication, not a measurement.)*

Everything from **rd3 down** — Branch, Lane, Williams, Fields, Brazzell, Hurst,
Bell, Sarratt, Cyrus Allen, and the rest — sits in the two tiers that are
**clearly below** the wire. There are 28 of them on the board and the honest
read is that they are all the same bet.

## 5. HOW TO ACCOUNT FOR IT IN THE MODEL — and what NOT to do

**Do NOT put this in the projections.** That exact instrument was already
built and graded: the rookie draft-capital *projection prior*
(`apply_rookie_prior_own_model_2026.py`) **failed its preregistered bar**
(+1.6 against a required +16.4). Re-litigating it with a smaller, exploratory
sample would be moving the goalposts to reach the answer we now like.

**The recommendation is a board COLUMN, not a weight.** Surface
`nfl_draft_round` and the tier on every rookie row in the war room, so at the
pick you see "rd1 — 53% hit the 150-pt tail" or "rd5 — 1 in 55" instead of a
projection that cannot express either. It changes nothing the engine computes;
it changes what you know when VONA hands you two similar names. That fits what
the last two days established — **trust the decision logic, distrust the
projection inputs** — because it adds *information at the decision*, not another
guessed multiplier upstream.

**On the barbell interaction, which is the sharpest version of your question.**
The barbell pass said the late band is dead (−27.8) and that there is *no late
upside tail* — P(league-winner) is lower late than in the middle. This says
there is **one identifiable subgroup where that is not true**. Those are
compatible: the band average is dead *and* contains a live cell. So the honest
form of "barbell" that survives both results is not *"take upside late"* — that
was measured and lost ten times — it is:

> **Late-round picks are dead by default. Spend them only where a
> pre-declared, measurable filter says otherwise. Right now exactly one such
> filter has evidence: NFL round 1 rookie WR.**

That is a much narrower instruction than the barbell theory, and it is the only
version of it the data supports.

## 6. WHAT WOULD MAKE THIS CONFIRMATORY

Preregister, in its own earlier commit, before touching anything:

1. **Decision rule fixed in advance** — what interval, on what metric, licenses
   a board column.
2. **The n problem.** 15 rd1 WRs over three seasons is thin. Extend to
   2019–2025 (the capital store covers 2021+; earlier needs a fetch) and to
   **rd1 rookie RB/TE**, which tests whether this is a *capital* effect or a
   *WR* effect — the current design cannot tell those apart.
3. **A negative control**, the way the position-weight study used a scrambled
   assignment: shuffle capital within season and confirm the tier ordering
   collapses.
4. **The market-pricing check.** Capital is *not* unpriced — the board's own
   projections already order the 2026 rookie WRs roughly monotonically by NFL
   pick (154.8 → 133.8 → 138.5 → 127.4 → 104.6 as you walk pk4 → pk30). So the
   live question is not "is capital ignored" but "is the *tail* mispriced", and
   that needs a distributional test, not a mean one.

## 7. LIMITATIONS

1. **n = 15 for rd1, and its interval spans zero.** "Not measurably worse than
   the wire" is the finding. It is not "beats the wire".
2. **Absent counted as zero** — a drafted player who never took a snap returned
   nothing to the roster spot, which is an outcome, not missing data. This
   departs from the repo's usual absent≠zero rule and is flagged for that
   reason. For rd1 it cannot be driving anything: **15 of 15 played**, so mean
   and played-only mean are identical.
3. **The 2026 join is by name** — the 2026 capital store carries no
   `sleeper_id` for any row. Unmatched rookies are reported as unmatched rather
   than dropped (3 of 36).
4. **Selection.** The tier table is all NFL rookie WRs, which removes the room's
   filter — but our league's own rookie picks are a hyped subset, so the
   pick-61+ comparison in §1 is conditioned on the room being willing to draft
   them.
5. **Capital vs WR is confounded.** Nothing here separates "first-round players
   are good" from "first-round *receivers* are good".
