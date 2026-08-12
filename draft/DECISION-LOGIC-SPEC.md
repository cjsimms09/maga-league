# Decision-Logic Specification — Draft Engine & In-Season Optimizer

**Purpose.** This document states, in prose, exactly what the model does at each
decision point. It is written so a skeptical reviewer with no repository access
can judge whether the logic is sound. Every quantity is tagged one of three ways:

- **[MEASURED]** — a number or sign that came out of a backtest against realized
  results. The confidence is stated with it.
- **[DESIGNED-GUESS]** — a number we chose because it seemed reasonable, *not*
  because we measured it. These are the load-bearing assumptions and the places a
  reviewer should push hardest.
- **[HARD-CODED]** — a league rule, a structural constant, or an arithmetic
  identity. Right or wrong, it is not up for tuning; it encodes a fact.

Where a term is off, the document says so and says why. If a reviewer disagrees
with a **[DESIGNED-GUESS]**, they are disagreeing with a judgment call, which is
the correct target. If they disagree with a **[MEASURED]** claim, they should ask
to see the backtest. If they disagree with a **[HARD-CODED]** value, they are
telling us we got a league rule wrong, which is the most important thing they
could find.

---

## PART A — THE DRAFT RECOMMENDATION, END TO END

### A0. What is on the board

The board is a few hundred players, each carrying, before the draft starts:

- `proj_mean` — a consensus season-point projection. **[MEASURED]**, in the weak
  sense that it is an average of public projection sources (Sleeper ≈ FantasyPros,
  ρ = 0.93 between them), *not* something our model derived or graded. We do not
  claim an edge in the projection itself; we claim an edge in what we do with it.
  Scored under our league's exact rules (see A2).
- `proj_ceiling` — a high-outcome projection from the same sources. Used only late
  (A6).
- `adjusted_adp` / `raw_adp` — average draft position, the market's ordering.
  **[MEASURED]** off public ADP; the anchor is FantasyPros.
- `vorp` — value over replacement, precomputed. **[HARD-CODED]** identity given the
  projections and the league's starter counts.
- `tier`, `tier_drop` — a positional tier and how many projected points fall off
  when the tier is exhausted.
- `age`, `injury_status`, `bye`, depth-chart and opportunity fields — inputs to
  the risk term.

Everything below is a pure function of that board plus the live draft state (who
has been picked, whose turn, my roster so far, my remaining picks).

### A1. What the board is ranked by

Every player gets a single composite **score** (A3). The list is sorted by that
score, descending. Two post-sort adjustments then run, in order:

1. **Ceiling tiebreak** (A6) — reorders only near-ties within the same position
   and tier.
2. **Stage-2 deviation cap** — **OFF by default.** It is pre-registered but
   unmeasured, so it does nothing unless explicitly enabled for a measurement run.
   Mentioned only so a reviewer knows the hook exists; it is not in the live path.

Then legality and plausibility rails run (A7), which can *demote* a player but
never invent one. The result is the ranked list the human sees.

### A2. Is the value metric computed under our league's exact rules?

Yes, and this was verified. `proj_mean` is converted to fantasy points by
`score_stat_line` under `league_config`, which encodes:

- **6-point passing touchdowns** **[HARD-CODED, league rule]**
- **Half-PPR** (0.5 points per reception) **[HARD-CODED, league rule]**
- the starter slots: QB 1, RB 2, WR 2, TE 1, FLEX 1 (RB/WR/TE), K 1, DEF 1
  **[HARD-CODED, league rule]**

Both VORP and VONA (A3) are computed on these league-scored projections, so
scarcity and value are priced in *our* points, not standard-scoring points. If the
league rules in the config are wrong, every number downstream is wrong — that is
the single most important thing for a reviewer to confirm against the actual
league settings.

### A3. The score composition — every term and every weight

For a player the model computes eight raw terms, then combines them. **The weights
the tool actually loads on** (the "measured" preset) are given first; the code's
structural defaults differ and are noted where they do.

The eight terms:

**1. VONA (value over next available) — the primary metric.**
`VONA = player.proj_mean − E[best player of the same position still available at
my next pick]`. The expectation is survival-weighted: for each same-position
player, P(he is the best survivor) = P(he lasts to my next pick) × Π P(everyone
better is taken by then). Survival probabilities come from the three-layer model
in A4. If I have no next pick, VONA = the player's full projection (everything is
at stake now). **[HARD-CODED]** as an identity; its *inputs* (survival) are
partly measured, partly designed — see A4. **Review catch:** that "no next pick"
fallback is a *discontinuity*, not a limit — at the very last pick VONA jumps to
the full projection scale (~150-250) while every other pick's VONA is a small
difference (~0-30). Harmless in practice (it only affects the final pick, where
the choice barely matters), but a reviewer should know the metric is not
continuous at the boundary.
- Weight: **value = 1.0**, floored at 0.25 so the slider can never fully unanchor
  the board. **[MEASURED]**: removing the value anchor is the largest single loss in the
  participation test. The dollar figure is board-dependent and drifts every Lab run
  ($362 -> $288 -> $267 across three) — see EDGE-LEDGER for the current one —
  roughly half the entire edge. This is the most confidently-positive term we have.

**2. Tier-cliff urgency.**
`tier_drop × P(every remaining player in this player's tier is gone by my next
pick)`. It says "take him now because the tier falls off a cliff and won't be here
next time." **[HARD-CODED]** structure; survival-driven.
- Weight: **tier = 0.0 (OFF).** **[MEASURED]**: as an additive term on top of VONA
  it is measured *drag* — it pulls picks off the value anchor toward a mechanism no
  payout rewarded (−$235 pooled), worst in early rounds. Turned off. (It still
  appears as a *panel*, A8, because "this tier is about to empty" is useful
  information even when it shouldn't move the composite.)

**3. Need — the startable-slot marginal. This is the roster-construction brain.**
Given my current roster and the league's starter slots, a candidate is classed:
- **starter** — I don't yet have enough at his position to fill the dedicated
  slots. Marginal value = his full VORP … *except* for single-starter positions
  (QB, TE, K, DEF), where VONA already prices the scarcity, so re-crediting full
  VORP would double-count. There we keep only an insurance premium =
  `injury_rate[pos] × VORP × 0.5`. **[DESIGNED-GUESS]** on the 0.5
  (`ONESIE_NEED_INSURANCE`); the *reasoning* (don't double-count scarcity VONA
  already carries) is sound, the fraction is a guess.
- **flex** — dedicated slots full but he can still start in the FLEX. Priced at his
  marginal VORP *over the best flex-eligible alternative realistically on the
  board*, floored at 0, capped at full VORP. So a third RB into the flex is worth
  what he adds over the next RB I could take, not his whole value. **[DESIGNED-GUESS]**
  on `FLEX_ALT_WEIGHT = 1.0` (weight the best alternative fully); pre-registered as
  material.
- **bench** — every startable slot he could fill is already full. He is depth. His
  "need" value = `(his projection − the man he'd replace) × BENCH_DISCOUNT +
  insurance`. *(Corrected 2026-08-10: this said a flat 0.35, which is only the
  12-team baseline. `formatDefaults()` DERIVES the runtime value from league
  shape — `clamp(0.35 × teams/12 − 0.35 × keepers/startersPerTeam, 0.15, 0.45)` —
  because a shallower league with keepers leaves replacement level high and the
  wire stocked, so bench depth is worth less. **For our league it computes to
  0.175, half the number the spec was quoting.**)* The 0.35 baseline and the
  shape of the adjustment are **[DESIGNED-GUESS]**; the derivation is at least a
  function of what changes rather than a constant pretending league shape does
  not matter. Insurance = `injury_rate[pos] × max(0, VORP) × 0.5`.
- Weight: **need = 0.0 (OFF).** **[MEASURED]**, and this one needs care: the need
  *weight* is inert **not because need doesn't matter** but because the real need
  mechanism lives in a separate, always-on **startable-capacity MASK** (A5) applied
  outside this composite. Inside the mask, the additive need signal is ~uniform, so
  the slider flips only ~5–8% of picks at any setting. It is settled at 0 as the
  simpler number; the mask carries all of need. A reviewer should read A5 as the
  real answer to "how does roster construction affect picks," not this weight.

**4. Risk adjustment.** A points penalty (or small bonus): past the positional age
cliff (RB 27 / WR 30 / TE 31 / QB 36) costs `min(25, 6 × years past)`; a serious
injury status −12; ≥8 games missed in 3 years −8; each depth-chart rung below
starter −6; opportunity metrics a full SD ahead of consensus +6, behind −6. All
thresholds **[DESIGNED-GUESS]**; the age cliffs are **[MEASURED]**-ish
(conventional positional aging, not our own study).
- Weight: **risk = 0.0 (OFF).** **[MEASURED]** drag (−$143 pooled), same story as
  tier.

**5. Ceiling / upside.** `proj_ceiling − proj_mean` is a *spread* (a variance
measure), so it is scaled onto the composite's points scale by
`CEILING_SPREAD_SHARE = 0.15` and hard-capped at `CEILING_MAX_BONUS = 20` points.
Crucially it is **late-only**: the term is exactly **zero until 60% of the draft
is gone** (`CEILING_LATE_FROM = 0.6`), then ramps to full by the end, times a 1.6
end-game multiplier when I have ≤5 picks left. This encodes Cory's explicit rule:
mean + VONA + tiers decide the early and middle rounds; ceiling is for the
throwaway late-round lottery tickets only. **Clarification (review catch):** the
60% is measured on the **overall draft by absolute pick number** (`currentPick /
totalPicks`), not on my personal pick count. In a 150-pick draft it switches on
around pick ~90 (≈ round 9). Because my keepers consume rounds 1-3, my first pick
is round 4, so ceiling stays off for my first ~5-6 picks and turns on for my last
~7 — which is the intended "throwaway rounds," but it keys off the room's
progress, not mine. Whether it *should* key off my remaining picks instead is an
open design question, noted not decided.
- Weight: **ceiling = 0 (SETTLED 2026-08-10).** The ledger's de-confounded
  measurement is **−4.8 [−26, +17]** — a sign we cannot distinguish from zero.
  It had been loaded at 0.65, and a flip diagnostic showed that deciding **2 of 6
  late-round #1s and 4 of 6 top-5s** — a third of the late board ridden by a term
  with no defensible sign. Zeroed: late picks now order by the value anchor + board
  ("best available late"). The weekly-payout ceiling *lean* survives in the
  same-tier **tiebreak** (genuine ties only) and the opt-in **Ceiling Chase**
  doctrine. The stale 0.65 is a case study for the graduation gate (no gate existed
  between MEASURED and LOADED). Prior note kept for the record: it was —
- **[SUPERSEDED] Weight: ceiling = 0.65.** **[MEASURED]** as separably positive but **from a
  SINGLE run, not yet replicated** (review catch: the earlier "single-run,
  replicated" was self-contradictory — resolving it, ceiling is the *single-run*
  finding, `need`/`stack` are the replicated ones, so treat ceiling's positive
  sign as **provisional**, firmer than a guess but not yet confirmed). Kept at the
  structural default rather than zeroed. The 0.15 share, the 20-point cap, the 0.6
  gate, and the 1.6 end-game bump are all **[DESIGNED-GUESS]**.

**6. Keeper option value.** A cross-season value that only fires for
keeper-eligible young players and only ramps in late; drives the informational
KEEPER-TARGET badge more than normal picks.
- Weight: **keeper = 1.0 (ON), but unmeasured.** **[DESIGNED-GUESS]** to leave on:
  a single-season backtest structurally cannot price a cross-season option, and it
  only nudges keeper-eligible players, so the downside of leaving it on is small.
  A reviewer should treat any keeper-driven recommendation as un-graded.

**7. Bye-collision penalty.** Penalizes stacking too many starters on one bye week
— but only when the roster genuinely can't field a position that week.
- Weight: **bye = 0.0 (OFF).** **[MEASURED]** null: it flips ~40% of picks and
  earned nothing.

**8. Stack / correlation. The one adjuster that earned money.**
Bumps a QB when I already have his pass-catchers, and vice versa (Burrow gets a
bump because I have Chase). It reads the actual player's team, not just position.
- Weight: **stack = 0.5.** **[MEASURED]** and this is the headline positive lever
  beyond value: +$196/season at 0.5 in the stack sweep, built on a same-team
  QB↔WR weekly-scoring correlation of **ρ = 0.357** measured directly. The
  correlation mechanism is not represented in the money Monte-Carlo, so we trust
  the sweep over the MC here. This is the strongest *constructive* finding in the
  whole project.

**How the eight combine.** For a normal (startable) candidate:

```
score = value·VONA + tier·tierUrgency + need·needMarginal + risk·riskAdj
      + ceiling·upside + keeper·KOV − bye·byePenalty + stack·stackAdj
```

then two multiplicative/additive gates:

- **Onesie discount** (A5b): if he is a duplicate at a single-starter position you
  already have filled, the whole assembled score is multiplied by 0.10
  (`ONESIE_KEEP`) — priced as a backup — unless a stated exception fires. Applied
  last so no slider can argue a bench QB into a starter.
- **Doctrine tilt** (A9): up to ±2.5 points if an enrolled draft plan prefers him,
  **scaled by the onesie discount when one applies** (fixed 2026-08-10). *(Corrected
  2026-08-10: this said a FLAT ±2.5. It is not flat — `doctrine.prefers()` returns
  a CONTINUOUS strength clamped to [−1, +1] and the tilt is `pref × DOCTRINE_TILT`,
  so 2.5 is the maximum magnitude, not the value. A weak preference tilts weakly.)*
  The
  earlier code added the flat tilt *after* the 0.10 multiply at full magnitude —
  which did the opposite of the intent: a +2.5 tilt on a score cut to a tenth was
  10× more influential on exactly the unstartable backups the discount was meant
  to bury (skeptical-review catch). Multiplying the tilt by the same discount
  restores the intent. **Known remaining limit:** the tilt is still bounded by a
  FIXED ±2.5 ceiling
  against a score whose scale shrinks late (a bench composite tops out ~6 pts), so
  its *share* of the decision grows in the throwaway rounds — a deliberate
  flat-tiebreaker design, but its late-round weight is real and on the agenda.

**For a BENCH-ONLY candidate the composition changes** (this is the fix for a real
bug — see A5c): VONA and tier-urgency are *dropped entirely*, because "value over
the next starter" and "the tier is about to empty" are meaningless for a man you
cannot start. A bench pick is scored as a lottery ticket:

```
score = ceiling·upside + stack·stackAdj + keeper·KOV
      + max(0, need·insurance) − max(0, bye·penalty) + risk·min(0, riskAdj)
```

**CORRECTION (skeptical-review catch, 2026-08-10).** An earlier draft of this
spec said "keeper/bye/risk still order the depth below it." That is false in the
live preset: **bye and risk are both weight 0.0**, so of the six bench terms only
three are live — **ceiling, stack, and keeper**. Every bench pick is decided by
those three alone.

That puts **keeper (weight 1.0, unmeasured) as one of only three live terms in
exactly the region where it fires** (KOV ramps in late). Everywhere else the
policy was strict — tier, risk, bye turned off as drag-or-null, need settled at 0
as the simpler number — so keeper is the lone full-strength term with no point
estimate. We ran the sensitivity the reviewer asked for: across four late-draft
board states, dropping keeper 1.0→0.5 changed the **#1 pick in 0 of 4** and the
top-5 in 1 of 4. Low live impact, because `keeperOptionValue` is narrowly gated
(only keeper-eligible young players, ramped), so most late board players carry
~0 KOV regardless of the weight. So the term is *on at full strength but rarely
decisive* — the honest state, and a reason the unmeasured 1.0 is tolerable rather
than dangerous. The **[DESIGNED-GUESS]** structure (bench = upside, not scarcity)
stands; the correction is to the claim about which terms are live.

### A4. Survival — how "will he last to my next pick" is computed

VONA and tier-urgency both need P(player survives to pick N). Three layers:

- **Layer 1 — ADP normal.** Treat the player's draft position as Normal(ADP, sd).
  The sd is source-provided when available, else `max(3.0, 0.15 × ADP)` capped at
  15. The floor/rate/cap are **[DESIGNED-GUESS]** and explicitly labeled interim,
  not a calibration. P(survives to N) = P(his draw > N).
- **Layer 2 — roster-need aware.** The near-horizon layer: who actually picks
  between now and my next turn, what their rosters still need, and (since
  2026-08-10) a MIXTURE over this room's ten profiled managers when a seat is not
  yet mapped to a person.
- **Layer 3 — run detection.** *(Corrected 2026-08-10: the spec called this
  "Layer 2" and called the method "a Bayesian update". Both were wrong. It is
  Layer 3 in the code, and there is no prior and no posterior anywhere in it.)*
  What it actually does: count picks per position over the last 10, compare with
  the number ADP expected in that window, and take a **binomial z-score**
  `z = (observed − n·p) / sqrt(n·p·(1−p))`. The multiplier stays exactly 1.0 below
  `RUN_Z_MIN` = 1.5σ and ramps to full effect at `RUN_Z_FULL` = 3.0σ, clamped to
  [0.6, 1.8]; a "RUN DETECTED" banner at 1.4×. Damping 0.5. A frequentist
  significance gate with a ramp, **[DESIGNED-GUESS]** thresholds.
- **Dynamic / season-forward** — a post-draft build, not in the live pre-draft
  path.

The survival model is the softest measured part of the engine. It is *calibrated
against mock-draft data where available* but the constants above are largely
chosen, not fit. A reviewer should read every survival-derived number (VONA
included) as "correct structure, approximately-calibrated inputs."

### A5. The startable-capacity MASK — the actual roster-construction mechanism

This is the part that earns roster money, and it lives **outside** the composite,
applied in the app layer (`needrule.js`), always on, not on any slider.

The mask enforces: **value only counts if it can reach your starting lineup.** It
looks at your roster and the league slots and caps how many of each position can
still be "startable value." Once your QB slot is filled, the next QB is not
competing for a starting job; the mask stops crediting him starter value. Same for
every position and the single flex. **[MEASURED]**: the mask is the +$443/season
roster-fill earner in backtest — the biggest single constructive result after the
value anchor itself. It is a *separate voice* from the engine composite by design,
which is why the additive `need` weight can be zero without roster construction
going dark.

This is the honest answer to "does the tool see how the draft is going and pick
the right time for QB/TE?" — **yes, through the mask and through VONA's survival
term**, not through the need slider. As slots fill, VONA for that position
collapses (the best available next pick is nearly as good as now), the mask stops
crediting starter value, and the position naturally falls down the board until
scarcity elsewhere makes it the right pick again.

**A5b. The onesie discount.** At a single-starter position you have already filled
(QB, TE once flex is also closed, K, DEF), a duplicate is multiplied to 10% of his
value — with three sayable exceptions: (1) he fell ≥18 picks past his ADP *and* is
a top-3 player at the position (real value + trade/insurance), (2) your starter is
seriously hurt (OUT/IR/PUP/SUS — *not* "Questionable," which in August means
almost nothing), (3) the last 2 picks of the draft, when nothing else matters. Any
onesie duplicate that surfaces must show its reason; one that surfaces silently is
a bug. Thresholds **[DESIGNED-GUESS]**; the exceptions are structural.

**A5c. Why the bench reprice exists (a fixed failure).** Before the fix, a benched
QB2 could float to #1 once starters filled, because VONA and tier-urgency kept
pricing him as though he'd play; the tool drafted 6 backup QBs across late rounds
and posted negative top scores for rounds on end. Root cause: two scarcity terms
rewarding an unstartable player. The A3 bench-reprice drops those two terms for
bench-only players. Verified in simulation: QBs drafted dropped from 6 to 2–3, and
the negative-#1 rounds went to zero. This is a **[DESIGNED-GUESS]** fix to a
**[MEASURED]** failure, with an acceptance test guarding it.

### A6. Ceiling as a late-round lever and a same-tier tiebreak

Two uses, both matching Cory's stated intuition:

1. As a composite term, ceiling is zero until 60% through the draft, then ramps
   (A3 term 5).
2. As a **tiebreak**: among players of the *same position and same tier* whose
   scores are within `TIE_THRESHOLD = 2.0` composite points, the model leans to the
   higher `proj_ceiling` — because the league pays a weekly high-score prize, so
   when two picks are otherwise even, the higher-ceiling one is worth more. A real
   value/VORP gap is *not* overridden by this. `TIE_THRESHOLD = 2.0` is
   **[DESIGNED-GUESS]**.

### A7. Legality and plausibility rails

After scoring, before display: roster-legality demotes picks that would be illegal
(over a position cap the league forbids, etc.), and plausibility rails demote
runaway components — e.g. `RAIL_COMPONENT_RATIO = 1.0` says no single component may
exceed the player's own VORP; this is the rail that caught the ceiling unit-mismatch
bug. Rails demote, never promote, so they can make the list more conservative but
cannot manufacture a recommendation. Rail thresholds **[DESIGNED-GUESS]**, but they
are *safety catches*, not the decision.

### A8. How the recommendation is chosen, and the "close field"

The #1 scored player is the recommendation. Alongside it:

- **Contested flag / gap-to-second.** If score[0] − score[1] < `TIE_THRESHOLD`
  (2.0), the top pick is flagged *contested* — the honest "these two are a coin
  flip" signal. Below `COIN_FLIP_GAP = 1.0` the tool says "either" outright rather
  than fake a ranking. `CLOSE_GAP = 3.5` widens the band of picks shown as live
  alternatives. All three **[DESIGNED-GUESS]**, chosen so false precision doesn't
  cost trust on the one loud pick it gets wrong.
- **Branch forecast.** For the top 3, what each costs you at your *next* pick
  (survival-weighted), so you can see the price of waiting.

### A9. The other panels (context around the pick)

- **Paths panel** (the primary decision surface): clusters the top ~10 candidates
  into 2–4 *directions* (e.g. "Fill WR2 now," "cliff — take the last tier-1 RB,"
  "best value on the board"), each named for its real mechanism and its best player.
  A direction named "Fill TE now" only appears if the TE slot is actually open —
  the mislabel where a full slot got a "fill" name was a fixed bug. Cap of 4:
  more than four is a ranking, not a decision. Pool/band/cap **[DESIGNED-GUESS]**.
- **Strategy split / doctrine banner**: reads the *same* scored board and shows what
  an enrolled draft plan (doctrine) would take, so plan and list can't disagree.
- **Tier-cliff panel**: surfaces "this tier is about to empty" as information even
  though the tier *term* is off in the composite.
- **LRM (Live Roster Map)** and **deviation badges**: derived from the same board;
  the deviation badge prices how far a pick departs from consensus, per-region, off
  a pre-registered surface.
- **Grab-by strip** (QB/TE/DEF/K): projects who will be gone and how much value
  drops if you wait to next round, with a "grab by pick N" verdict. Reuses the same
  survival and expected-best-available functions as VONA, so the live timing advice
  and the composite can't contradict each other.

### A10. The resolver — one voice on disagreement

**CORRECTION (skeptical-review catch, 2026-08-10).** The earlier claim — "one
canonical fact, one derivation" — was an overstatement, and the reviewer's
suggested test (find a panel using a number the recommendation didn't) would miss
the real seam. What is actually built is **two derivations with a stated
precedence**: (1) the engine **composite** (VONA + adjusters), and (2) the
startable-capacity **mask** (§A5), which lives outside the composite in the app
layer and *overrides* it, plus (3) an **explainer** that fires when they differ —
the on-screen line "the composite suggests X but that over-fills RB; the rule
recommends Y." Every panel except that headline reads the one scored board and
the one resolved seat; the mask is the deliberate second voice. **Surfacing the
disagreement is correct and we are keeping it** — it is the tool telling you the
measured-money rule and the value engine want different things, which is real
information, not a bug. The honest description is: a composite, a mask that
overrides it within its measured domain, and an explainer at the one seam where
they diverge. (Cory's separate request to make the *list and headline agree* is
handled by gating the composite list to within-cap so it never headlines an
over-fill — the explainer for genuine value-vs-need disagreement stays.)

### A11. What the draft engine does NOT know (limits worth stating)

- It does not model *other managers' rosters' needs* beyond ADP + run detection.
  Survival is market-shaped, not opponent-roster-shaped, pre-draft.
- Keeper value is un-graded (A3 term 6).
- Projection accuracy is the public sources' accuracy; we did not beat it, we
  priced it under league rules and against scarcity.
- Survival constants are interim, not calibrated (A4).
- The money magnitudes are Monte-Carlo-harness tier; **the robust claim is the
  sign and ordering of the levers, not the dollar figures.** Value anchor > mask >
  stack, all positive; tier/risk/bye negative-or-null. That ordering is what we'd
  defend.

---

## PART B — THE IN-SEASON LINEUP OPTIMIZER, END TO END

### B0. What it optimizes

Not points. **Expected dollars**, under a dual objective:

```
E[$] = P(win the matchup) · matchupValue  +  P(clear the weekly-high band) · $100
```

**matchupValue is now DERIVED, not guessed** (corrected 2026-08-10). It shipped at
$25, described as "a typical side-bet stake" — wrong twice over: (1) side bets
live *outside* fantasy and must never enter the optimizer, and (2) a matchup win
is worth its **playoff equity**, not a side bet. Our standings-tied money is
$2,125 in playoffs (top 4 of 10) + $375 in regular-season prizes, and a
regular-season win's only value is moving you up those standings.
`draft/backtest/matchup_value.py` measures it two ways that converge: the direct
playoff-probability slope peaks at ~0.19 dP(playoff)/win at the 7-8-win bubble,
which × ~$530 playoff-entry equity ≈ **$100**; and a flip-and-rerank Monte Carlo
gives an ex-ante average of **$110**. Shipped default is $110 but the honest range is **\$70-110, UNSETTLED**
**[MEASURED]** (one stated modelling input — the game-level win-probability
spread — swept in the script). At $110 it is ≈ the $100 weekly-high, so **the two
objectives are comparable** — not the 4:1 the old $25 implied, which had the tool
chasing the weekly-high roughly four times harder than the real stakes justify.

The two objectives pull *against* each other: chasing the weekly-high rewards
variance (a boom bench play can clear a high bar a safe floor never will), while
winning the head-to-head rewards a high floor. So the dollar-optimal lineup is
**not always "start your highest projections."** That gap is the entire edge, and
it is priced in dollars per lineup call. **[MEASURED]** motivation: a
`replayEfficiency()` backtest reproduces the league's realized-vs-optimal figures
on 2023–25 to the decimal, and the optimal-in-hindsight lineup would have earned
each team **$445–595/season more** than they actually collected in weekly-high +
regular-season money. That is the size of the prize this tool chases.

### B1. Inputs

- **Roster** — each player `{id, name, pos, proj, sd?}`. `proj` is this week's
  projection. **Source (OPEN-2 answer):** it comes from Sleeper's live weekly
  projection (`row.proj` → `projSource = 'sleeper'`). If that field is absent
  (pre-season, before the weekly feed lands), it degrades gracefully: first to
  season-average (season points ÷ games), then to last-week's points, then to 0 —
  and the tool *labels which source it used*, so a season-average fallback is never
  passed off as a live projection. **[HARD-CODED]** fallback ladder.
- **Per-player SD** — Sleeper's own per-player uncertainty when supplied, else a
  position-typical SD learned from history (B2).
- **Opponent mean** — the opponent's projected total from the same feed
  (`myMatchup`). If the opponent isn't set yet, it falls back to the median
  weekly-high band value and the matchup term is treated as unknown (B4).
- **Weekly-high band** — a distribution of historical winning scores, harvested
  from 2023–25, so the bar to clear is a realistic *distribution*, not one
  flattering number. **[MEASURED]** from league history.

### B2. The variance model

Each starter's weekly score is modeled Normal(projection, σ[pos]). The σ per
position is **[MEASURED]** — learned from the harvested history (the standard
deviation of actual weekly scores by position), with a **[DESIGNED-GUESS]**
fallback set (QB 8, RB 7, WR 7, TE 6, K 4, DEF 5) used only if a position is
absent from history. Starters are treated as **independent** — **[DESIGNED-GUESS]**,
and a known simplification: it ignores same-game correlation (your QB and his WR
boom together). This *understates* lineup variance for stacked lineups, which
makes the high-chase term slightly conservative. Worth a reviewer's attention.

The lineup total is therefore Normal(Σ projections, Σ σ²). Mean adds; variances
add under independence.

### B3. The non-playing-player guard

The optimizer has no calendar — it will seat whoever carries the highest
projection for a slot. That is correct *only* if a player who won't play this week
carries a **zero** projection. The fallbacks in B1 don't guarantee that (a
season-average is a full positive number for a man on bye). So before the roster
reaches the solver, any player known not to play has his projection forced to
zero:

- **Injury** — Sleeper injury status in {OUT, IR, PUP, SUS, NA, DNR, COV, RES,
  DNP}. **"Questionable" and "Doubtful" are deliberately left alone** — they might
  play, and that uncertainty is exactly what the variance model prices.
  **[HARD-CODED]** status set.
- **Bye** — the player's team bye equals the week being optimized. Wired from
  `nfl_byes.json` (team→bye), joined on the player's *current* team so a trade
  resolves to the new team's bye. If a season has no bye map, this arm is a no-op
  and only the injury guard fires. **[HARD-CODED]** rule.

Every player the guard zeroes is surfaced ("Jefferson — bye 6") so an absence is
explained rather than silent.

### B4. The two probability terms

- **P(win the matchup)** = `Φ((myMean − oppMean) / sqrt(myVar + oppVar))` — both
  teams Normal, opponent SD defaults to a team-typical 24 **[DESIGNED-GUESS]**.
  If the opponent isn't set, this term is **null** and drops out of E[$] entirely
  (the lineup then optimizes purely for the weekly-high). **[HARD-CODED]** identity.
- **P(clear the weekly-high)** = averaged `Φ((myMean − threshold) / mySD)` over the
  harvested band of historical winning scores. Averaging over the distribution,
  not a point, is what keeps the bar honest. **[HARD-CODED]** identity over
  **[MEASURED]** band.

### B5. The dual-objective tradeoff and how the lineup is chosen

`matchupValue` = $110 in code but cite it as **\$70-110 (UNSETTLED)** — playoff equity, from
B0 above — and this number *is the tradeoff dial.* It sets how many dollars a
percentage point of win-probability is worth against the fixed **$100**
weekly-high prize **[HARD-CODED, league rule]**. Raise it and the tool protects
the head-to-head; lower it and the tool chases the $100 harder. It is no longer
the soft spot it was at $25 — it is derived from the payout table and a swept
win-probability model — but the one remaining modelling input (the game-level
strength spread) is worth a reviewer's eye, and refining it against three seasons
of *real* standings would upgrade it from "measured with one assumption" to fully
empirical.

**The search:** start from the naive lineup (highest projections = the E[points]
optimum), then hill-climb — try every legal single bench-for-starter swap, keep the
one that raises E[$] most, repeat until no swap improves E[$] (≤24 iterations, a
~15-man roster converges fast). The only lineups that beat the naive one are those
that trade a little mean for enough variance to raise P(clear high) by more dollars
than it costs P(win). **[DESIGNED-GUESS]**: hill-climbing can in principle miss a
two-swap optimum a full search would find; in practice on a real roster it lands
the dual optimum. A reviewer could ask for a brute-force check on a sample of
weeks — that's the honest test of this shortcut.

### B6. What the tool tells you — priced calls and posture

- **Calls.** Every difference between the recommended lineup and the naive one,
  each priced *in isolation against naive*: "start X over Y, worth +$Z," split into
  the win-dollars (ΔP(win) × $110) and high-dollars (ΔP(high) × $100) it buys.
  Sorted by dollars.
- **Weekly posture.** A plain-language read of the week's incentive, driven by
  P(win):
  - P(win) ≥ 0.75 → the win is nearly banked, so the live money is the $100 —
    start your ceiling, it can clear the high and can't cost you the near-certain
    matchup.
  - P(win) ≤ 0.25 → the matchup is likely lost, so the $100 is your only live
    money — go maximum ceiling.
  - 0.35–0.65 (coin flip) with the $100 out of reach → protect the floor, bank the
    head-to-head.
  - opponent not set → no matchup to protect, swing for the $100.
  Thresholds (0.25 / 0.35 / 0.65 / 0.75) **[DESIGNED-GUESS]**. This is the
  "weekly-high consideration" made explicit: the tool doesn't just optimize, it
  tells you *which game you're playing this week* and why.

### B7. In-season ↔ draft: how they relate

They share the same league rules, the same weekly-high band, and the same
variance-and-dollars philosophy. The draft's late-round **ceiling** term and its
**stack** term are the draft-time expression of the same fact the in-season tool
prices weekly: in a league that pays a weekly high, *variance you can deploy is
worth dollars.* The intended loop (not yet built as a closed feedback system):
in-season realized weekly-high outcomes are the ground truth that should, over a
season, calibrate the draft's ceiling weight and the stack coefficient — predict at
draft, verify in-season, feed back. Today that link is conceptual; the two tools
agree by construction (shared config), not yet by learned feedback.

### B8. What the in-season tool does NOT do (limits)

- Starters are independent — no same-game correlation (B2). Conservative for
  stacks, and the draft is *engineered to build stacks* (stack weight 0.5), so the
  optimizer systematically underprices the ceiling of exactly the rosters this
  system builds. **This is the single highest-value modelling fix on the list**
  and belongs with the scale-up work (review catch: the same correlation blind
  spot shows up three times — here, in the money Monte-Carlo, and in why the stack
  finding needs a separate sweep).
- Hill-climb, not exhaustive search (B5).
- `matchupValue` = $110 in code, cite $70-110 UNSETTLED (B0/B5), with one modelling input (the
  game-level strength spread) still to be pinned against real standings.
- Opponent variance is a flat 24 (B4).
- No calendar beyond the injury/bye guard — it trusts the projection feed's weekly
  numbers and the two zeroing signals.

---

## SUMMARY FOR THE REVIEWER — where to push

The places most likely to be wrong, ranked:

1. **The league rules in `league_config`** (A2) and the **$100 weekly-high /
   payout structure** (B5). If any league rule is wrong, everything downstream is
   wrong. Verify against actual settings first.
2. **Starter independence + the stack blind spot** (B2/B8) — the optimizer models
   starters as independent, but the draft is built to create QB↔WR correlation
   (ρ = 0.357). It therefore underprices the stacked-roster ceiling this system
   exists to build. **Now the top structural fix**, promoted from a footnote after
   the review; belongs with scale-up.
3. **Survival constants** (A4) — interim, not calibrated; VONA rides on them.
4. **Keeper at 1.0, unmeasured** (A3/A6) — one of only three live bench terms, in
   the region where it fires. Sensitivity: 0/4 late #1 picks flipped at 1.0→0.5,
   so low live impact, but it is the lone full-strength unmeasured term.
5. **Hill-climb vs exhaustive** (B5) — a shortcut that *should* land the optimum
   but isn't proven to on every roster.
6. **The bench-reprice term list** (A3/A5c) — a sound-structure fix to a real bug,
   but the exact terms kept are a judgment.

**RESOLVED since the first draft** (skeptical-review round, 2026-08-10):
`matchupValue` was a side-bet guess ($25) — now derived playoff equity ($110,
B0). The doctrine tilt applied at full strength after the onesie discount — now
scaled by it (A3/A9). Both were the review's top actionable catches; both fixed.

The claims we would defend hardest, because they were measured against realized
dollars:

- **Value anchor is ~half the edge** (the dollar figure drifts with the board; see EDGE-LEDGER).
- **The startable-capacity mask earns ~+$443/season** — the roster-construction win.
- **Stacking earns ~+$196/season at weight 0.5, on a measured QB↔WR ρ = 0.357** —
  the one constructive adjuster.
- **Tier, risk, and bye are drag-or-null** and are turned off for that reason.
- **In-season: hindsight-optimal lineups left $445–595/season on the table**, and
  the optimizer reproduces the historical efficiency figures to the decimal.

The one thing we will not claim: that our *projections* are better than the public
consensus. They are the consensus (Sleeper ≈ FantasyPros, ρ = 0.93). The edge is
entirely in pricing that consensus under our exact rules, against scarcity (VONA +
mask), for a weekly-high payout (ceiling + stack + the dual-objective optimizer).
