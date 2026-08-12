# Is this a league-specific decision engine, or a generic model with league settings attached?

**Asked by Cory, 2026-08-12.** Architectural checkpoint. Every number below is
measured from the code and data as they exist today, by controlled perturbation —
`draft/tools/league_sensitivity.js`, 6 drafts × 12 of my picks, MEASURED_WEIGHTS,
fixed board states, trajectory driven by the control.

**The category bar was declared before the run:** an input that moves under 5% of
picks is CATEGORY 2 — wired and not deciding.

---

## PART ONE — VERDICT

**PARTIALLY, and the split is not where I expected it.**

Not "a generic model with league settings attached" — that answer is available
and it is wrong. **Layer 1, the exact league mechanics, is the most influential
thing in the system**, more than the market and far more than the room:

| perturbation | picks moved | category |
|---|---|---|
| keepers 3 → none | **21/72 = 29.2%** | 3 — can decide |
| starters 2WR → 3WR | **20/72 = 27.8%** | 3 — can decide |
| starters 1QB → superflex | **10/72 = 13.9%** | 3 — can decide |
| teams 10 → 12 | 5/72 = 6.9% | 3 — can decide |
| opponent rosters real → empty | 6/72 = 8.3% | 3 — can decide |
| **our ADP adjustment → raw public** | **0/72 = 0.0%** | **2 — INERT** |
| **room mixture measured → off** | **0/72 = 0.0%** | **2 — INERT** |
| manager profiles mapped → none | 1/72 = 1.4% | 2 — near-inert |
| my next pick real → +9 always | 1/72 = 1.4% | 2 — near-inert |

**But layers 2 and 3 are inert at the decision.** The market-mismatch layer and
the room layer — the two that were supposed to carry the proprietary edge —
change zero picks between them out of 144 opportunities.

So the honest verdict: **the engine is deeply specific to our RULES and blind to
our ROOM.** It would give a different team the same room-blind advice, and it
would give a different *format* genuinely different advice.

---

## PART TWO — THE THREE BIGGEST GAPS

### 1. The room layer is wired, measurable, and 0.13 percentage points wide

`withinFromPool` now consumes the room mixture — that graduation landed this
week with a numerically demonstrated invariant. Measured at a real board state,
turning the room off moves **all 60 per-player pick probabilities**, by a maximum
of **0.00128** — 0.13 of a percentage point. Pick flips: **0 of 72**.

This is exactly the category-2 failure Cory named, and it is worse than the
shallow one because everything about it looks right: the input is real, the
consumption is real, the invariant holds, the test passes. **The influence is a
thousandth of what a decision needs.**

The mechanism is visible in the arithmetic. `poolSoftmax` blends the room mixture
against a value softmax; the value term dominates by three orders of magnitude
because VORP spans hundreds of points while the mixture is a probability
distribution over sixty players. **This is an architecture problem, not an
evidence problem** — no amount of additional draft history changes a term that
enters at 0.1% weight.

### 2. The market-mismatch layer does not exist at the decision

Layer 2's only decision-time input is `adjusted_adp`. Replacing it with the raw
public number moves **0 of 72 picks**.

**And the perturbation is real, not trivial:** in the draftable top 150 the two
differ by a median of **3.47 picks** (max 8.13). Across the whole board the
median gap is 189 picks, but that is deep-board noise. So the honest statement is
narrow and useful: **a 3.5-pick ADP correction in the region where we draft
cannot change a recommendation.**

That does not make the adjustment wrong. It makes it invisible, and it means
every hour spent refining the ADP anchor — the FFC → MFL → FantasyPros
investigation, the source grade, the three-way de-confounding — bought a number
that has never changed a pick. Layer 2's real influence runs through
`proj_mean`, not through ADP.

### 3. The Lab that produced MEASURED_WEIGHTS does not model half the engine

`exp_participation.py:140` scores every player with **one additive formula**:
`w.value*vorp + w.need*… + w.ceiling*… + w.risk*… + w.tier*… + w.bye*… + w.stack*…`.

`scorePlayer` has **two branches**, and the second one — which fires once every
starting slot is filled — drops `value` and `tier` entirely. Measured today:
that branch decides **120 of 240 simulated picks**.

Its docstring says it mirrors `scorePlayer` "term-for-term (proxied)". It does
not mirror its **structure**. The weights we ship were fitted on a scorer that
always has a value anchor, and half of my picks are made by one that never does.

This is rule 11e at the level of an instrument rather than a comment, and it is
the root cause of the bench-branch defect reported yesterday.

---

## PART THREE — WHAT GENUINELY CONTRIBUTES TODAY

- **Roster and starter structure.** 27.8% of picks move on one starting slot.
  This is real, load-bearing league specificity and it is not decoration.
- **Keeper rules.** 29.2%, the largest single input measured. `keeperOptionValue`
  reaches the score and our three keepers shape the whole draft.
- **Draft state.** Emptying every opponent roster moves 8.3% of picks — the tool
  does read the room it is sitting in, through `starterSlotMarginal` and the
  intervening window. Modest, but genuinely above the bar.
- **Scoring, upstream.** The engine never reads the scoring table — measured, five
  `scoring` hits in `engine.js` and every one is a comment or an unrelated word.
  Scoring enters at BUILD via `score_stat_line`, baked into `proj_mean`. **That
  is the correct place for it**, and it means scoring cannot be perturbed at this
  layer at all. Classification: *consumed upstream*, not influential-or-inert.
- **The startable-cap mask.** Always on, in `needrule.js`, and it carries the
  whole need mechanism. Measured as half the edge.

---

## PART FOUR — DRIFT

**The drift is not toward a generic model. It is toward a model whose
league-specific parts are additive terms competing against a dominant value
anchor, and losing.**

Every layer-3 mechanism built so far — manager profiles, room mixture, doctrine
tilt — enters the score as a small additive or multiplicative adjustment to a
VORP-dominated composite. Their measured influence: 1.4%, 0.0%, 0.7%. Three
different mechanisms, three different builds, the same architectural outcome.

That is a pattern, not three coincidences. **A room signal that modulates a value
score will always lose to the value score**, because the value score is
denominated in points and the room signal is denominated in probability. The room
has to enter somewhere the value term is not already deciding — which is what
survival does structurally and what the mixture failed to do numerically.

---

## PART FIVE — NEXT ACTIONS

**MUST FIX NOW** (before Aug 22)
1. The bench-branch anchor — DECISIONS-NEEDED 00. Three options costed below.
2. Nothing else. Both inert layers are architecture problems and none of them can
   be safely re-architected in ten days.

**SHOULD CAPTURE NOW FOR FUTURE LEARNING** — the justification is
*unrecoverable*, not *modellable*
3. **Sleeper trending adds/drops** — shipped today, daily.
4. **Our own league's full transaction history.** Sleeper holds it, we do not
   store it. Every waiver claim and trade by the nine managers we are modelling.
   Per Cory's refinement this is NOT an n=3 feature: three seasons of a ten-team
   league is **hundreds of transactions**, clustered by manager and by week.
   HIGH priority, cheap, one endpoint we already authenticate against.
5. **Weekly roster snapshots** — who each manager actually started, which is
   thousands of observations and speaks to layer 3 without touching the draft.

**WAIT FOR MORE EVIDENCE**
6. Per-manager draft tendencies. Effective n really is ~3 drafts per manager, the
   dossier's shrinkage weight is already 0.6, and the measured influence is 1.4%.
   More modelling of this cannot help until the architecture can carry it.

**DO NOT BUILD**
7. Any further refinement of the ADP anchor until something downstream can feel
   it. Measured: 0/72.
8. Opponent-blind vs opponent-modelled as a strategy comparison. 0.7%.

---

## PART SIX — THE DIAGNOSTIC: how much survives a different league?

**Same format, same rules, different ten people, different history.**

**Essentially all of it. I measure the change at roughly 1–2% of picks.**

The only inputs that would differ are the room ones: manager profiles (1.4%),
the room mixture (0.0%), and the accumulated draft history behind them. Every
input that actually decides a pick — starters, keepers, teams, the board, the
current draft state — is either identical between the two leagues or is a
function of the seat rather than the people in it.

**So: hand the frozen system a different ten-team half-PPR league with three
keepers, and it gives essentially the same draft.**

That is the answer to the question Cory said was the most important diagnostic,
and it is the uncomfortable one. But the useful half is the part that qualifies
it: **change the RULES rather than the people and the system changes a lot** —
29% on keepers, 28% on one starting slot. The engine has real specificity. It is
specific to the *format*, not to the *room*.

**A generic model with league settings attached would score 0% on both.** This
one scores ~30% on settings and ~1% on the room. That is a different failure and
it has a different fix: the room layer needs a path to the decision that does not
route through an additive term competing with VORP.
