# Decisions needed

_Questions no spec already answers. Each carries my recommended answer; I take
the conservative option and mark the item PROVISIONAL until you rule._

### ✅ Open inputs — ALL RESOLVED 2026-08-08 (master sheet + config)
- **Pick timer:** ✅ **UNTIMED** (`draft.untimed=true`, `pick_timer=0` at source).
- **RS tiebreak:** ✅ **TOTAL POINTS** (`regular_season.tiebreak="total_points"`, master-sheet rules tab).
- **2023 payout era:** ✅ **RESOLVED by the master sheet** — 2023 = $3,500 pot (playoffs 550/450/400/300, RS 200/100). Encoded in `payouts.json.by_season`; money_history recomputed per-season (Cory 2023 3rd corrected $475→$400). No longer pending.
- **Draft slot:** claim in progress on `/draft` (site-claimed provenance); auto-verifies on Sleeper draft-order assignment.
- **⏳ Only outstanding data:** the master-sheet **XLSX file itself** (for the 2016–2022 pre-Sleeper import) was NOT attached to the ingestion message — send the file and the pre-Sleeper history/settlement import lands. This is a data hand-off, not a decision.

## ✅ D12 — RANDOMISED COMPLIANCE: DECLINED for 2026 (Cory, 2026-08-08) — closed

I raised randomising compliance on near-tie decisions as the only route to
*causal* evidence for experiment 37. **Declined for 2026**, with reasoning
recorded so this is a decision on the record and not an omission:

1. the **shadow season already provides a quasi-experimental comparison at zero
   cost** to real decisions;
2. the marginal causal information from near-tie randomisation is **small by
   construction** — near-ties are exactly where the effect size is smallest;
3. *"I want to play this season believing my own decisions."*

**RE-RAISE IN THE JANUARY ANNUAL as a 2027 option**, once the tool has real
evidence behind it. Hooked into the annual run so it resurfaces without anyone
remembering to.

**The consequence, which the January report must honor:** 37's 2026 numbers are
**associational, not causal**. Wording discipline — never *"the tool earned
$X"*, only *"$X was realised on decisions where the tool recommended Y"*. With
no control arm, no stronger claim is available at any sample size.

## ✅ D13 — DOCTRINE COUNTERFACTUAL: the Balanced archetype (Cory, 2026-08-08) — closed

Doctrine calls have no behavioral baseline in the historical record. Graded
against the **Balanced control archetype** as the naive alternative, carrying the
**verbatim report label**: `measured vs Balanced archetype; no behavioral
baseline exists in the historical record`. Cory's standard: **narrow and honest
beats empty.** Same denominator as 19b, so the live figure is directly
comparable to its +$187 simulated edge.

## 🛑 D11 — HOLD. Treat +$226.50 as SUSPECT until diagnosed (Cory, 2026-08-08)

**Do not install. No recommendation until four checks are reported.** Cory's
reasoning, which is correct: *a swing that large, produced by a grader change,
that INVERTS a previously refuted hypothesis, is the classic signature of a
defect rather than a discovery.*

**Required before D11 gets a recommendation — PARKED behind mock #2 per the lane
rule below, then run as a batch:**
1. **Decompose the swing** — how much is playoff dollars vs the ramp itself.
2. **Verify the bracket resim's 12/12 reproduction wasn't achieved by fitting.**
3. **Run the null baseline on the new grader.** A grader that inflates real
   edges inflates null edges too; if the null p95 also jumped, the effect is
   **grader scale, not signal**.
4. **Confirm the ceiling-ramp result survives the heterogeneous rooms.**

### ⚠️ PARTIAL ANSWER TO (3) ALREADY IN HAND — and it half-confirms the suspicion

No compute needed; these numbers were already recorded across the two runs:

| quantity | pre-playoff grader | complete grader | ratio |
|---|---|---|---|
| §6 conditional **null p95** | $65.83 | $157.23 | **2.39×** |
| WR Feast edge | $91.50 | $187.25 | 2.05× |
| frontier λ=0.5 | $70.67 | $171.00 | 2.42× |
| stack peak 0.5× | $80.42 | $204.58 | 2.54× |

**The null scaled 2.39× and the surviving edges scaled 2.0–2.5×.** That is
Cory's hypothesis landing: *most of the apparent growth is grader scale, not new
signal.* Every "edge grew" line in `PLAYOFF-MONEY-VALIDATION.md` should be read
against a null that grew by the same factor — the verdicts survive, but they did
not strengthen, and I reported growth without normalising. **That framing error
is mine and is corrected here.**

**BUT this does NOT explain H1.** −$37.29 → +$226.50 is a **sign flip**, and a
scale factor cannot flip a sign. So the reversal is either (a) the real
mechanism — playoffs are a two-week single-elimination tournament and pay for
variance in a way sixteen accumulating weeks never did — or (b) a defect in how
the bracket prices ceiling. **Checks 1, 2 and 4 are what separate those, and
none of them has been run.** Until they are, +$226.50 is a suspect number, not a
finding.

## 🚨 D11 — URGENT: the phase-shape refutation REVERSES on the complete money function

**You are rehearsing on a config tuned without 53% of the money.** Playoff $ is
$2,125 of the $4,000 pot; until today the Lab graded weekly-high + RS only. The
bracket resim landed (format derived from, and reproducing, all 12 harvested
playoff games), every simulated verdict was re-run, and one finding **reversed**:

| | weekly-high + RS only | complete money function |
|---|---|---|
| **H1 — ceiling weighted toward EARLY picks** | −$37.29 **REFUTED** | **+$226.50, CI [168, 288] — best in the sweep** |
| frontier flat λ=0.5 (the D9 basis) | +$70.67 | +$171.00 [109, 234] |
| over-dosing λ=2.0 / 3.0 | negative | still negative (−$89 / −$117) |

The mechanism is plain: **the playoffs are a two-week single-elimination
tournament** — you need to win one game, not accumulate over sixteen — so
variance is worth far more there, and excluding the half of the pot that pays
for it underpriced ceiling everywhere.

**NOTHING WAS CHANGED.** D9 stands exactly as installed (`ceiling 0.65`, endgame
`0.5`, core tilts unchanged). Reversing a refutation is precisely the case where
a fitted parameter is most tempting and least earned, so it is filed, not
applied.

**My recommendation: HOLD through the mocks, decide before the final one.**
Rehearse the config you will draft on — that is the fixture-keepers lesson, and
it outranks a same-day retune. The open question for you is whether the ceiling
term's phase profile should move toward the early ramp for draft night, and
whether the slider should come off the conservative end now that its evidence
base is the whole money function rather than 47% of it.

Everything else survived and mostly grew: **WR Feast +$91.50 → +$187.25** (still
enrolled), Late-QB −$61 → −$212, stack peak 0.5× +$80.42 → +$204.58, still a LEAN and still not installed, §6 still
clearing **zero** conditional rules (its null floor scaled with the money, from
$65.83 to $157.23).

**One thing I fixed rather than filed:** on the complete money function Early-QB
Strike posts a *higher mean* than WR Feast (+$200.62 vs +$187.25), and the old
rule — highest mean among those clearing the control — would have flipped your
enrolled doctrine. It should not have. The paired head-to-head is
**+$13.38, CI [−$53.75, +$78.00] — not separable.** A head-to-head gate now sits
after the control gate: co-leaders that cannot be told apart retain the
incumbent. WR Feast stands because nothing beat it, not because it won. Full
detail in `draft/backtest/PLAYOFF-MONEY-VALIDATION.md`.

## D1 — Backtest grading metric — RESOLVED BY DATA (needs your acknowledgement)

The value-over-replacement cut ran alongside raw points. It did **not** clear
the round-1 alarm — under value grading the alarm still fires (round-1 +130) and
the composite is worse overall (B3−B0 −157/pick vs −66 raw). So the alarm is
**not a pure metric artifact.**

The real cause, and it is the one the pre-registration named ("investigate the
projection fit"): **B3 runs on our crude walk-forward projection; B0 runs on the
real contemporaneous market's ADP.** The projection floated Carson Wentz to
round 1 in 2024. So the backtest is measuring "composite-on-a-crude-projection
vs the market," and the projection stand-in — which the spec itself flagged as
"not a test of projection accuracy" — is the confound. B3 < B0 tells us our
era-appropriate projection is worse than the market had, which we already knew;
it does NOT tell us the composite logic is bad.

**Consequence, and it is the pre-registered "boring outcome":** the backtest
cannot grade the composite or select a strategy on this projection. **Default
stands.** No strategy install, no adp_sd fit, no Section-A exploitation fit —
all of those would be fitting to projection noise.

**What IS still valid, because it does NOT touch our projection:**
- KOV verdict (projection-independent; done directly on the production board) — proceeding.
- Exploitation Section B intel (value-fall map, reach map, run archaeology,
  faller verdict, blunder map) — these mine the ACTUAL PICKS your league-mates
  made vs contemporaneous ADP and actual outcomes. No walk-forward projection is
  involved, so they are unaffected. This is the "richest vein", and it survives.

**Your call (not blocking — Default stands meanwhile):** is it worth building a
real projection model (post-draft) to make the backtest able to grade the engine
and select a strategy? My recommendation: yes, post-draft, as part of the
in-season rankings work — a genuine projection is the prerequisite for the
backtest to mean anything, and it is out of scope before Aug 22.

## D3 — Flex-fill discount in the need term — ✅ RESOLVED + IMPLEMENTED (2026-08-08)

**Cory approved marginal-over-best-flex-alternative pricing; BUILT, tested, and re-quantified.** `CFG.FLEX_DISCOUNT` + `bestFlexAlt` price a flex-only fill at candidate-VORP minus the best flex-eligible alternative on the board, floored at 0, capped at full VORP (`FLEX_ALT_WEIGHT` knob). Cited engine test + `R-flex` robot. **Re-quantified at real pick-34:** before/after top-5 flips from 3 redundant flex-only RBs (Williams/Swift/Love) to dedicated-slot fills (Warren TE1 / McMillan WR2 / Maye QB1). 221 engine / 67 robot green. _Original open-item text retained below for provenance._

## D3 — Flex-fill discount in the need term (original — OPEN — tracked, quantify before mocks)

The Final Pass A1 review surfaced this: `starterSlotMarginal` values a player who
fills the **FLEX** slot at **full VORP**, identical to one filling a dedicated
slot. So with my 3 keepers (2 RB + 1 WR), an additional RB still "starts in your
flex" at full value — RB need does not drop until the flex is ALSO consumed. This
is arguably correct (a flex RB does start) but it prices my literal first pick.

**Question:** should a flex-fill be valued at *marginal-over-best-flex-alternative*
rather than full VORP?

**Plan (before mocks):** quantify at MY actual draft state (keepers rostered,
first live pick, real board) — how much does top-of-board ordering change if
flex-fills are marginalized? **If any top-5 candidate moves >2 composite points,
it's a pre-mock fix through the normal gates; if it's noise, document why and
close.**

**QUANTIFIED 2026-08-08 (real board, pick 34, keepers rostered):** the effect is
**MASSIVE, not noise.** With 2 RB keepers filling both RB slots, every top RB
"starts in your flex" at FULL VORP; marginalizing that produces **−148 to −156
composite-point deltas** and **reorders the top-5 from RB-led (Gibbs, Bijan,
Nacua…) to WR-led (Nacua #1, then Gibbs, Bijan, JSN, St. Brown)**. Max top-5
delta **156 ≫ 2**. Per the pre-registered rule this **triggers a pre-mock fix
through the gates** — it decides my literal first pick (RB vs WR at 34).

**⚠️ CRITICAL CAVEAT — do NOT blind-install the naive version.** My test
marginalized need as `vorp − best_other_flex_vorp`, which **double-counts VONA**
(the composite already has a VONA term pricing "what you lose by waiting"). So
the 156-pt swing OVERSTATES the true effect — a correct flex-discount must be a
small, capped adjustment that doesn't re-apply VONA. The honest read: flex-fills
ARE currently over-valued vs dedicated-slot fills (a 3rd RB and a WR2 both start,
but the WR fills a genuine positional hole), and the effect is material enough to
fix — but the RIGHT fix is a **capped flex-discount** designed through the gates,
not the double-counting formula I stress-tested. **This decides pick 34, so it's
Cory's call on the formulation.** September's quantile-V BenchValue dissolves it
properly; the August fix should be conservative. **My recommendation:** a small
capped discount (flex-fill worth ~0.7× dedicated-fill, tuned so the top-5 shifts
only where genuinely warranted), re-quantified, before mock #1.

## D4 — Draft slot — ✅ RESOLVED as built (auto-verifies on the external Sleeper draft-order assignment; no Cory input needed)

**All four machinery items below are BUILT** (`state.slotVerified`/`slotSource`, "SLOT UNVERIFIED" watermark, checklist line "Draft slot verified against Sleeper draft object", auto-import-and-clear on draft-object sync, `R-slot` robot). The ONLY remaining block is external: Sleeper draft order isn't assigned yet, so the real slot is unknown. The tool is armed and verifies automatically the moment the order lands. _Original item text retained below._


Slot 9 is a **placeholder**, not a claim — draft positions have not been selected
in Sleeper yet. Per Final Pass A2, the machinery to build (not blocking; captured
so it's not lost):
1. Label the slot **"manually set — UNVERIFIED, draft order not yet assigned"**
   with amber treatment; propagate a **provisional watermark** to everything
   slot-derived (my pick numbers, live-pick mapping, branch forecasts,
   survival-to-next, the opening script when it generates).
2. Add **slot-assignment to the watched-state list** (alongside keeper
   designations): when the Sleeper draft room is created and slots assign,
   auto-import, flip the label to **"from Sleeper — verified,"** and clear the
   watermarks.
3. Pre-draft checklist line: **"Draft slot verified against Sleeper draft object"**
   — red until true.
4. The **opening script regenerates on slot assignment** (same trigger discipline
   as keeper-lock regeneration).

**Interaction with A1:** the keeper pre-population matches `team_slot ==
my_draft_slot`. The CI rebuild stamps keepers with whatever slot the config
carries; once the real slot is verified and the board rebuilt for it, A1
populates correctly. Until then A1 shows keepers for the config's current slot.

## D6 — NO FAAB: waiver economics are priority-based (Cory, 2026-08-08) — REFIT DONE, one verify pending

Cory confirmed the league has **no FAAB**. Actions taken (built-ahead in-season
work, none of it live yet, so this is spec + capture refit, no live code to break):
- **Config capture (Part 1):** `sleeper_import` now stamps `config.waivers`
  (`waiver_type`, `day_of_week`, `clear_days`, `budget`, `is_faab`). **Verify pending:**
  the sandbox can't reach api.sleeper.app (egress-blocked); the next CI import
  stamps the real values — confirm `is_faab=false` and the priority mechanism
  (rolling vs reverse-standings) once it lands.
- **Audit (Part 2):** only two FAAB touchpoints in code — `engine.js:553` already
  says the FAAB consequence doesn't apply; `history_export.py` captured bids
  (now noted null under no-FAAB). No live bid logic to rip out.
- **Waiver spec refit (Parts 3–4):** `season-readiness-kit.md` — recommendation is
  add-value vs the **option value of my priority position** (track everyone
  weekly), with a **burn/hold** verdict per target; plus an **FA-speed clear-time
  alert** (post-clear FA is first-come-first-served). Method tag `waiver-priority-v1`.
- **Dossier pivot (Part 5):** bid-aggression → **priority-usage patterns** (who
  burns priority on marginal adds, who camps FA) + **add-speed** after clears.
- **History (Part 6):** the export already carries `type` (waiver vs free_agent)
  and `created` (add-speed) per transaction — the raw material to fit these
  patterns from our actual league history is already captured; the fit itself is
  in-season work (built-ahead, activation-flagged awaiting season data).

## D7 — ✅ RESOLVED: rounds=15 verified at source (the draft_rounds:3 was a red herring)

Chat-Claude pulled the draft OBJECT directly: `draft 1374848328474324992
settings.rounds = 15`. The `draft_rounds:3` in the LEAGUE settings is a stale/unused
field; the draft object is authoritative and says **15**. Our pipeline fix (15
rounds, 12 my-picks) is correct and confirmed at source. The checklist line
confirms it green on first sync. No commissioner action needed. **Closed.**

## D8 — IR config oddity — ✅ RESOLVED (2026-08-08, per Cory: don't burn time on it)

`reserve_slots=1`, every `reserve_allow_*` flag = 0. **Resolution (Cory):** treat the
IR slot as configured — **1 slot, restrictive flags** — and add a **one-line
in-season check that flags if a player I try to IR is REJECTED** by those flags
(the fix is literally its own description). Requirement folded into
`in-season-master.md` (roster-capacity / IR-eligibility guard: on an IR move,
if `reserve_allow_<status>`=0 for the player's status → loud "IR rejected: <player>
isn't IR-eligible under league settings" rather than a silent no-op). Closed —
implement the one-liner when the in-season roster tooling activates (post-draft).

_No decisions require Cory's input (D4 auto-resolves on the external Sleeper
draft-order assignment; everything else answered)._


## D2 — RESOLVED (answer: (b)) — top_picks_flat implemented

_Answered: the k-th keeper costs round k (keeping N forfeits rounds 1..N). Implemented as the `top_picks_flat` cost model; optimizer, true-pick-order and KOV all handle it; config set. See STATUS K0 for the settled keeper decision. Original open text retained below for the record._

### (original)
## D2 — Exact definition of the `top_picks_flat` keeper cost model (K0 blocker)

K0 needs this before the cost model can be implemented, because implementing the
wrong formula mis-costs every keeper and corrupts adjusted_adp, KOV and the
optimizer.

`top_picks_flat` is not an implemented model (only original_round, fixed_round,
escalator, no_cost exist) and the config currently uses `original_round`. I need
the precise rule. Common "flat top picks" variants:
  (a) each keeper costs a FIXED round regardless of where drafted (e.g. all
      keepers cost your round-N pick) — this is essentially `fixed_round`.
  (b) keepers cost your top picks in order: 1st keeper costs round 1, 2nd costs
      round 2, 3rd costs round 3 (flat escalating off the top).
  (c) all keepers cost the same flat round (e.g. round 3), full stop.

**My recommendation:** tell me which of (a)/(b)/(c) — or the exact rule — and I
implement it as a new `top_picks_flat` cost model with a parity test, rebuild
the artifact under it, and run the keep-0/1/2/3 optimizer. If (a) or (c) reduce
to `fixed_round`, I can proceed today by setting cost_model=fixed_round with the
right round; only (b) or a novel rule needs new code.

**Conservative action meanwhile:** the artifact stays on `original_round` (its
current, validated model) and K0's model-agnostic half — the keep-0/1/2/3
optimizer — is built and run now, so it is ready to re-run the instant D2 is
answered. K0 is NOT blocked from all progress by D2.

## F-2 — "Dashboard widening" scope — ✅ RESOLVED (Cory ruled: collapsible full-program panel; BUILT 2026-08-08)

Cory queued **"dashboard widening as a small backlog item"** without a spec. The
term is ambiguous between at least three readings, so per the power-through rule
I took the safe, unambiguously-correct slice and parked the rest for a one-word
ruling:

- **(a) VISUAL** — the `/admin/status` dashboard renders in a narrow phone
  column; widen the container to use desktop width (multi-column on wide screens).
  A CSS-only change in `views/admin/dashboard.ejs` / the stylesheet.
- **(b) CONTENT** — the dashboard model parses only the single "Continuous queue"
  line of STATUS.md; "widen" it to also surface the backlog list, the RESUME
  marker, and recently-shipped milestones as their own sections.
- **(c) both.**

**Done meanwhile (no ruling needed):** refreshed the STATUS "Continuous queue"
line so the dashboard's parse reflects reality (was stale at "§2(c) [NEXT]"; now
19/21 done, current = Phase H / opening script / A-1..3). That fixes the
dashboard's ACCURACY, which is its whole job, regardless of which widening Cory
meant.

**My recommendation + action taken:** (a) — the visual widen, the literal reading
and the "small" one — is **BUILT** (2026-08-08): `/admin/status` now puts the
Queue and Decisions cards side by side on desktop (≥900px `.dash-cols` grid),
phone-stacked below. (b) is a redesign better folded into the data-spine dashboard
work and is **parked** for a one-word ruling ((b)/(c) if you also want the
content-widen). Not blocking anything.

## D9 — Ceiling-weight install — ✅ RESOLVED + INSTALLED 2026-08-08 (Cory: "INSTALL, the conservative end")

**Installed:** `DEFAULT_WEIGHTS.ceiling` 0.5 → **0.65** (the conservative end of the winning band, not its peak), cited-constant path with the full evidence line in `engine.js`. **Shape finding applied:** the auto-adjuster's ceiling phase profile was a LATE ramp (0.45 → 0.60 → 0.80 → **1.40**) — backwards, and the Lab said so — now EARLY-weighted (**0.75** → 0.70 → 0.65 → **0.60**). **The bench-lottery policy is untouched** (`upsideBonus`'s lateness × endgame multipliers — a different mechanism: the floor is free on the wire); what was removed is the DOUBLE ramp of a 1.4 weight on top of it, which is exactly the over-tilt the dose-response priced as negative. Pinned by 4 cited engine tests so it cannot silently revert. Quantified at pick 34: top-5 **order unchanged**, max score delta 0.8 — a genuinely conservative install. September's quantile re-run certifies or reverts. _Original decision text retained below._

## D9 — Ceiling-weight install (experiment 21's winner) — the original call, evidence attached

The frontier race cleared its pre-registered in-experiment gate: **moderate
ceiling tilt is worth ~+$45–56/season** on the Cory-conditional paired rooms
(flat λ=0.5 CI [33,78]; early-phase λ=1 CI [35,79]), heavy tilt provably burns
money (λ=3: −$27, CI excludes 0), and the effect concentrates in EARLY rounds
(the late-ramp hypothesis is refuted — Upside-Late's shape is backwards for our
money). **Why I did NOT install:** the program's install bar demands held-out
real-season evidence; this ran in the simulated-room proxy (v1 money model).
It is a STRONG LEAN, not a certified edge.

**Recommendation:** a conservative bump of the composite's ceiling slider
(0.5 → ~0.65–0.7, calibrated so pick-34's top-5 reorders only where the frontier
says it should), installed through the normal cited-constant path, robot green,
before mock #2 — so the mocks rehearse the tilt. September's quantile re-run
either certifies or reverts it. One word (install / hold) and it lands.
