
---

## 12. PREREG — EXACT DP (`--objective-dp`): the TRUE optimum, committed before the run

Cory: "why not do the montecarlo thing now?" In the harness the opponents are
the recorded picks — deterministic — so the stochastic DP collapses to EXACT
deterministic DP, and the true optimum of the construction problem is
computable. **This is a DIAGNOSTIC, not a shipping arm:** it bounds what ANY
construction rule of ANY complexity could achieve in this framework.

**Mechanism.** A position-sequence DP over (my pick slot, position counts),
exact by three reductions, each provable in the fixed-draft setting:
(1) within a position, always take the current best available — my k-th take
at slot r is exactly the (k+1)-th best of the position's opponent-surviving
list at r (exchange argument, proven in the fixed draft); (2) the single flex
slot is handled exactly by enumerating its source (RB/WR/TE/none — four
additive DPs, max taken); (3) keepers pre-occupy their position stacks at
their recorded values. K≤1/DEF≤1 cap and full legality enforced at the
terminal (illegal = −inf). Values in the harness's own rank units.

**Built-in control, non-negotiable:** the DP's internal objective must be
≥ MLV's achieved internal objective in EVERY seat — an "optimum" that any
greedy beats anywhere is a bug, and the run refuses.

**Declared predictions:**
- **Gap prediction: DP's internal-objective gain over MLV is < 5% in ≥ 25/30
  seats.** If true, construction is CLOSED — no equation, calculus or
  otherwise, has meaningful room above the greedy in this framework, and the
  answer to "can't you find a more complex equation" becomes a measurement.
- **Grading prediction: the DP-optimal rosters do NOT beat MLV's on the skill
  grading beyond noise** (internal-optimum ≠ graded-points optimum; chasing
  the last internal points buys noise). If DP DOES beat MLV on skill by > 10
  pts/season, MLV is leaving real value behind and the DP policy becomes a
  candidate arm — that outcome would be reported as eagerly as the other.

---

## 13. PREREG — WAIVER-AWARE GRADING (`--grade-waiver`), committed before the run

Cory: the frozen-roster grading "fully excludes waiver pickups. That's terrible
and not realistic." Correct, and it applies to every arm symmetrically. Fix:
grade BOTH rosters under a streamed game — every starting slot is floored at
its position's measured weekly waiver level (season levels from
ROSTER-CONSTRUCTION-CALL.md §2, this room's own three drafts: QB 322.9 ·
RB 78.4 · WR 124.8 · TE 130.4 · K 128.6 · DEF 100.0, divided by 17; flex floor
= the best flex-eligible level). Applied inside `bestLineup`, so actual and
skill arms both inherit it, both sides identically.

**Declared before running:** under waiver-aware grading, MLV-cap still beats
the owners on BOTH gradings (actual > 0, skill > 0), and its actual delta
stays inside the frozen arm's bootstrap CI [+10.0, +81.7]. If the edge
INVERTS under the realistic game, the frozen-grading result was an artifact of
ignoring waivers and every conclusion above is downgraded accordingly — filed
either way.

## 13b. P136 HONESTY NOTE — opponent reaction was measured WITHOUT a blind prereg

The `--react` arm ran before its bar was committed (implementation preceded
declaration). Labeled exploratory, not blind: actual **+32.7 (21/30)**, skill
**+14.9 (18/30)** — both call bars still cleared, the drop from the frozen
pool is −13.1/−14.4, and the actual WIN COUNT improved. Limit 5's answer:
opponent adaptivity costs ~13 points and does not change the verdict.

**§13 GRADED, SAME DAY: PARTIAL FALSE, AND CORY'S INSTINCT WAS RIGHT.**
Clause (a) holds: MLV-cap still beats the owners under waiver-aware grading —
**actual +2.6 (18/30), skill +2.1 (16/30)**, sign preserved on both. Clause
(b) FAILS: +2.6 is far outside [+10.0, +81.7]. **The downgrade applies: most
of the frozen-game +45.8 was an artifact of grading a streamed game as
frozen** — the floors raise exactly the weak slots that real waivers patch for
the humans. What survives, and it is the durable ordering: **MLV ≥ humans ≥
shipped curve under EVERY grading tried** (frozen, opponent-reaction,
waiver-aware, points-units). The shipped curve gets WORSE under the realistic
game: **−39.1 actual (12/30)** vs −20.4 frozen. The strongest robust claim in
this document is now: the shipped curve should not draft Saturday; MLV-cap is
the best measured rule; and its real-game margin over a good human is small.

## 14. PREREG — THE REALISTIC VONA EQUATION (`--real`, `--real-vona`), committed before the run

Cory: *"So find me a more realistic calc equation that drafts a normal roster
with most value (VONA)."* This section composes every graded lesson above into
ONE objective and commits its bar before any line of it runs.

**The equation.** At each of my picks, over every candidate `c` still on the
board:

```
score(c) = M(c)                                   (myopic arm, --real)
score(c) = M(c) − max over s∈Surv(pos(c)) M(s)    (VONA arm,   --real-vona)

M(c)  = L(roster + c) − L(roster)
L(R)  = Σ over starting slots  max(points(slot), WAIVER_season(slot))
        + max(points(flex), WAIVER_flex)
points(player) = LOO pick→points curve at his recorded pick_no
Surv(q) = same-position candidates whose recorded pick_no is AFTER my own
          next pick slot (they demonstrably survived until my next turn)
```

Piece by piece, each from a graded result: the value scale is the leave-one-
season-out pick→points curve (retires §9 limit 4, rank units — P135 proved the
transform is safe; 15-pick buckets, monotone-enforced, keeper picks excluded
from the fit because a kept star's slot is not a market price). The objective
is the waiver-FLOORED lineup (§13's floors, season units: QB 322.9 · RB 78.4 ·
WR 124.8 · TE 130.4 · K 128.6 · DEF 100.0; flex floor 130.4) — the drafter now
optimizes the streamed game the grading grades, answering Cory's "excludes
waiver pickups" objection at DRAFT time, not only at grading time. The normal
roster is the K≤1/DEF≤1 cap plus displacement (§6). The timing term is VONA
proper: marginal now minus the best same-position marginal still available at
my next pick, estimated from the recorded draft's own survivors — no
projections, no hindsight beyond the market order already used everywhere in
this harness. If `Surv(q)` is empty, score = M(c) (full urgency). Ties on
score break by M(c).

**Bars, declared before the run — graded on `--grade-waiver`, the realistic
game (frozen grading reported beside, no bar):**

1. The winning realistic arm beats MLV-cap's waiver-graded mean deltas:
   actual > **+2.6** AND skill > **+2.1**, on the same 30 seat-years.
2. Head-to-head: ≥ **16/30** seats where the arm's waiver-graded skill delta
   beats MLV-cap's for the same seat.
3. 30/30 legal rosters, K ≤ 1 and DEF ≤ 1 in every seat.

Decision rule: if `--real-vona` clears all three and ≥ `--real`, VONA is the
recommendation; if only `--real` clears, the myopic realistic arm is; if
neither clears, **MLV-cap stands and this is filed FALSE like §8 and §10.**

**Controls (Rule 3e), all mandatory:** (a) byte-guard — `--mlv` untouched by
the patch, must reprint +45.84/+29.33; (b) engagement — the realistic arm must
differ from `--mlv`'s rosters in ≥1 seat or the flag is presumed dead;
(c) curve known-positive — curve(pick 1) > curve(pick 101) strictly, printed;
(d) clobber-guard — the harness writes ONE output file, so every arm's JSON is
copied aside before the next run and the baseline re-asserted (the §7 bug).

**Predictions filed blind (ledger P138, P139):** P138 — `--real` clears bar 1.
P139 — `--real-vona` does NOT beat `--real` beyond noise (§8's lesson:
lookahead terms on this value signal hurt; VONA is a lighter lookahead, so the
honest prior is "no gain", filed so a reversal is a real surprise, not a
retrofit).

## 14b. §14 GRADED, SAME DAY — FALSE, and the failure mode is the finding

Baseline re-asserted first (clobber-guard): MLV-cap waiver-graded reprinted
**+2.57 (18/30) / +2.10 (16/30)**. Curve control live (LOO-2025: pick 1 →
211.3, pick 101 → 111.0, strictly decreasing). Engagement: the realistic arm
differs from MLV-cap in **30/30 seats**.

| arm (waiver-graded) | actual | skill | h2h vs MLV (skill) | legal |
|---|---|---|---|---|
| `--mlv` (champion) | **+2.57** (18/30) | **+2.10** (16/30) | — | 30/30 |
| `--real` | −5.29 (15/30) | **+5.69** (21/30) | 16/30 | **23/30** ❌ |
| `--real-vona` | −19.83 (13/30) | −9.70 (14/30) | 17/30 | 25/30 ❌ |

Frozen beside (no bar): `--real` −61.4/−51.2, `--real-vona` −61.0/−50.6.

**Bar 1 FAILS** (actual −5.29 vs required > +2.6; skill clause alone would
have passed at +5.69). **Bar 3 FAILS: 7 seats end the draft with an
unfillable starting slot** (5 for VONA). **P138 FALSE. P139 TRUE** — the VONA
timing term made everything worse, §8's lookahead lesson now measured a third
time on a third construction. **MLV-cap stands.**

**The mechanism, and it is exactly Cory's constraint biting back:** the floor
makes an empty slot FREE inside the objective — a late kicker whose curve
value (~111) sits under the K floor (128.6) has marginal **zero**, so the
drafter rationally never rosters one and "streams" a slot the real game makes
you fill on someone. The §13 floors were built to grade waivers realistically;
moved to DRAFT time unmodified, they optimize a game where you may field 8
starters. "Fielding a normal roster" is a CONSTRAINT, not an emergent
property of a realistic objective — which was Cory's original sentence all
along. Follow-ups (3g): does §13's grading under-punish illegal rosters the
same way (no — grading floors the slot, both sides symmetric, checked);
does this invalidate §13's verdict (no — MLV fills all slots, floors never
exempted it); routed to A with §14c below.

## 14c. PREREG — LEGALITY-FORCED REALISTIC ARM (`--real-fill`), committed before the run

One amendment, mechanical: when my remaining picks ≤ my unfilled dedicated
starting slots, candidates are restricted to positions with an unfilled
dedicated slot. Nothing else changes — same curve, same floors, same cap,
optionally the same VONA term (`--real-vona --real-fill`). This encodes the
constraint the way a human does: "I still need a kicker and I have two picks."

**Bars: identical to §14's three, unchanged numbers.** Decision rule
identical. **P140, filed blind:** `--real-fill` goes 30/30 legal AND beats
MLV-cap on waiver-graded skill (> +2.1); I do NOT expect it to also clear the
actual bar (+2.6) — the skill arm is where a construction rule shows, the
actual arm is where 2024's variance lives. FALSE on any clause missing, filed
either way.

## 14c-GRADED, SAME DAY — FALSE AGAIN (P140), and the root cause is a units mismatch I shipped

`--real-fill --grade-waiver`: actual **−5.72** (15/30), skill **+3.44**
(20/30), h2h 15/30 — and **STILL 7/30 unfillable**, the very clause the arm
existed to fix. P140 FALSE on its legality clause (the skill clause passed).

Two mechanisms, both measured, neither a guess: **(1) the forcing engaged and
the shelf was empty** — every failed seat is missing a QB or TE, and by the
time remaining-picks ≤ unfilled-slots fires, the candidate pool (players
drafted AFTER that point in the real draft) holds no QB. Supply failed, not
will. **(2) The root cause is mine: a position-BLIND value curve under
per-position floors.** The curve tops out at 211.3 (pick 1); the QB floor is
322.9. `max(curve, floor) − floor = 0` for every QB at every pick, so a QB
never has positive marginal and the drafter rationally hoards RB/WR — the
+5.69 skill number in §14b was partly this exploit, not football sense. Same
for TE (floor 130.4) past the earliest picks.

## 14d. PREREG — POSITION-CONSISTENT UNITS + SUPPLY-AWARE FORCING (`--real-pos`), committed before the run

The two fixes the two mechanisms dictate, and nothing else: **(a)
per-position rank curves** — the k-th QB drafted is valued at the mean points
of the k-th QB in the OTHER seasons (leave-target-out, monotone-enforced,
keepers excluded, no-score picks count as 0); value and floor now share
units within every position. **(b) supply-aware forcing on top of §14c's** —
for each unfilled position, if the remaining candidates of that position ≤
the gap, that position is forced NOW, whole-pool counted. Myopic timing only
(P139 retired VONA). Controls: `--mlv` byte-guard; per-position known
positive: QB rank 1 > QB rank 10 and RB rank 1 > RB rank 20, printed or throw.

**Bars: §14's three, verbatim.** **P141, filed blind:** `--real-pos` goes
30/30 legal AND beats MLV-cap on waiver-graded skill (> +2.1); the actual bar
(+2.6) is again NOT expected. **Declared closure rule: if P141 fails, this
program CLOSES with MLV-cap as the realistic equation** — the floors belong
in grading, not in the objective — and the register row routes to A with that
sentence.

## 14d-GRADED, SAME DAY — FALSE (P141), AND THE PROGRAM CLOSES AS DECLARED

Controls first: `--mlv` byte-guard held all day (+45.84/+29.33 re-printed
before every implementation commit); per-position curves live (LOO-2025:
QB1 342.7 · QB10 96.5 · RB1 192.1 · RB20 35.8, strictly decreasing).

`--real-pos --grade-waiver`: actual **−40.79** (11/30), skill **−22.27**
(12/30), h2h vs MLV-cap **10/30**. Legality: **29/30** — the one failure is a
seat whose remaining candidate pool contains ZERO quarterbacks at forcing
time; no rule can conjure supply the recorded draft does not hold. Frozen
beside: −96.0/−43.1.

**P141 FALSE. The declared closure rule executes: the realistic-equation
program CLOSES with MLV-cap as the realistic equation.** Four preregistered
arms (§14 real, §14 vona, §14c fill, §14d pos) all failed the same committed
bar from four different directions, each failure diagnosed to a mechanism,
none rescued post-hoc. The durable lesson each one paid for:

* **Floors belong in GRADING, not the objective.** An agent optimizing
  floored lineup points learns the floor is free and stops rostering the
  floored positions (§14b: 7/30 illegal; QB marginal identically zero).
* **Fixing the units (per-position curves) fixes legality and still loses**
  (§14d): once starters are seated the floored objective prices every bench
  pick at ~zero, so mid-draft picks stop discriminating — displacement
  against an UNFLOORED lineup (MLV) keeps discriminating all draft long.
* **Timing terms lose a third time** (P139; §8, §10 before it).

**The equation Cory asked for, final answer with the whole trail graded:**
`marginal-lineup-value displacement + K≤1/DEF≤1, graded under waiver floors`
— MLV-cap. It beats the humans under the realistic game (+2.6/+2.1, §13),
beats every realistic-objective variant tried against it head-to-head, and
fields a normal roster in 30/30 seats without ever being told to. The floors'
place is the GRADING, where Cory's waiver-realism objection is now
permanently encoded (P137).

## 12-GRADED, 2026-08-20 — P142 TRUE ON BOTH CLAUSES: CONSTRUCTION IS CLOSED, BY MEASUREMENT

Cory, 08-20: *"Your equation still sucks."* The §12 diagnostic (committed
08-19, run today as `draft/tools/objective_dp.js`) measures what ANY equation
could add. Controls first, all mandatory, all passed: the closed-form keeper
marginal equals brute lineup top-C on 500 random mixes; the replicated MLV
greedy reproduces the harness's **+45.84/+29.33 to the decimal** by an
independent implementation path; DP ≥ MLV internal in every seat (the run
refuses otherwise); and each seat's reconstruction replays forward to the
DP's own total or throws.

**The exact optimum's gain over the MLV-cap greedy: < 5% in 30/30 seats
(bar was ≥ 25/30) — median gap 0.00%, max 3.60%.** In the median seat the
greedy IS the optimum. And the gap that exists is not worth taking:
**the DP-optimal rosters grade WORSE than the greedy's — skill −10.65
pts/season (DP wins 14/30), actual −7.59** — the second prediction landed
too: internal-optimum ≠ graded-points optimum, and chasing the last internal
points buys noise.

**What this closes:** within this framework — market-order values, fixed
opponents, legal roster, K≤1/DEF≤1 — **no construction rule of any
complexity (calculus, Bellman, Monte Carlo, anything) has meaningful room
above the greedy displacement rule.** "Find a better equation" is now a
measured dead end on the CONSTRUCTION side. What it does NOT close, stated
plainly: a better VALUE SIGNAL (projections that beat market order) or a
real opponent model would move every rule including this one — and those are
exactly Cory's two stated goals for the year. The equation is not the
bottleneck. The inputs are.

## 15. PREREG — CORY'S DEPTH DISCOUNT (`--mlv-depth`), committed before the run

Cory, 08-20: *"study # of players taken in previous 3 sleeper drafts... if
only 13 TE are taken on average every year, the 14th TE should have little to
no value as I can get that on waiver wire."* **Premise verified before this
was written: TE drafted = 13/14/15 across 2023-25 (mean 14.0), and every
position's depth is stable to ±1-2: QB 16.0 · RB 47.3 · WR 52.3 · K 10.3 ·
DEF 9.7.** The league's drafted depth is a real, repeatable constant.

**Mechanism — the depth-anchored positional replacement:**
`D_q` = leave-target-season-out mean drafted count at position q (rounded).
`repl_q` = the market value of the D_q-th player of q taken in the TARGET
draft (its own order, era-correct). Candidate value becomes
`v'(c) = max(0, v(c) − repl_q)` — the k-th positional player is worth what he
returns OVER the last man the league historically bothers to draft, and past
that depth he is worth ~zero, which is Cory's sentence as an equation. MLV
displacement then runs on `v'` unchanged, K≤1/DEF≤1 retained.

**What this adds that MLV lacks:** MLV already zeroes SAME-position surplus
(a 2nd TE displaces nothing) — the discount changes CROSS-position priority:
positions whose replacement is worthless (K, DEF, late TE) deflate relative
to positions whose D_q-th man still carries value.

**Bars (waiver-graded, the realistic game; frozen reported beside, no bar):**
actual > **+2.6** AND skill > **+2.1** · h2h vs MLV-cap ≥ **16/30** on skill
· 30/30 legal, K≤1/DEF≤1. **Controls:** `--mlv` byte-guard (+45.84/+29.33);
computed D printed with D_TE required in [13,15] (the premise, re-derived
inside the run); engagement — differs from MLV-cap in ≥1 seat or the flag is
presumed dead (P135 taught byte-identity is a real outcome, so it is a
declared one).

**P146, filed blind:** the discount is a benign re-pricing — waiver-graded
means land within ±10 of MLV-cap's (+2.6/+2.1) and the full champion bar is
NOT cleared, because MLV's displacement already contains most of Cory's
mechanism within-position. If it DOES clear the bar, the cross-position half
was the missing piece and the depth constant becomes a shipped input — filed
as eagerly either way.

## 15-GRADED, SAME DAY — CORY'S MECHANISM IS THE BEST ARM IN THE PROGRAM, AND ONE CLAUSE SHORT OF CHAMPION

Controls: byte-guard held; depth control live (LOO-2025: QB 17 · RB 48 ·
WR 53 · TE 14 · K 10 · DEF 10); engagement real — 21/30 seats differ, 8 are
byte-identical rosters (a declared outcome, not a dead flag; the discount only
matters where cross-position priority was contested).

| waiver-graded | actual | skill | h2h vs MLV (skill) | legal |
|---|---|---|---|---|
| MLV-cap | +2.57 (18/30) | +2.10 (16/30) | — | 30/30 |
| **`--mlv-depth`** | **+25.90** (21/30) | **+18.56** (19/30) | **15/30** ❌ | 30/30 |

Frozen beside: **+86.2 / +42.8** (vs +45.8/+29.3), h2h 21/30.

**Bar verdict: NOT CLEARED — the h2h clause missed by one seat (15/30 vs
≥16).** Both mean clauses cleared by an order of magnitude. **P146 FALSE, in
the good direction:** my blind claim was "benign re-pricing, within ±10" and
the truth is +23/+16 on the means — the CROSS-position half of Cory's
mechanism was NOT already inside MLV, and it is worth real points.

**Rule 3i, before anyone quotes the mean:** the per-seat skill difference runs
−180 to +166 with 15 wins / 7 losses / 8 ties, and the **bootstrap 95% CI of
the mean difference includes zero** (skill [−10.2, +42.1], actual [−2.2,
+49.6]). Per-season means are positive in ALL THREE seasons on both gradings
(actual +33.0/+25.8/+11.2) — the direction is consistent, the magnitude is not
separable from noise on 30 seats. **Status: the leading CANDIDATE, one
independent confirmation short of champion.** The honest sentence for Cory:
your idea beats everything I built today, and three seasons cannot yet prove
it beats the incumbent beyond luck.

**Follow-ups (3g):** (1) out-of-sample premise test filed as P147 — Saturday's
own draft grades whether TE depth lands in [12,16]; (2) routed to A: the live
board prices VORP off replacement levels — do they match the league's MEASURED
drafted depth (the reference model's TE13 vs our measured TE14 agree; RB35/
WR36 vs drafted RB47/WR52 do not, and which is right depends on whether
replacement means "last starter" or "last man worth drafting"); (3) the 8
identical seats say the discount binds only when scarce-position timing is
contested — the mechanism to watch live is WHEN it moves K/DEF/TE picks.

## 16. PREREG — CORY'S HARD POSITIONAL CAP (`--pos-cap`), committed before the run

Cory, 08-20: *"What if we set a hard cap on position after average # of
players at each position are taken?"* Distinct mechanism from §15: the
discount RE-PRICES a player past the depth at ~zero but can still take him;
the cap FORBIDS the position once the league (opponents' recorded picks +
my own takes) has consumed `D_q` — the same LOO drafted-depth constant.

**One declared exemption, or the rule eats itself:** the cap never applies
while I still owe a STARTER at the position (`held < STARTERS`), otherwise a
drafter who waited on TE is locked out of TE1 by everyone else's 14 — a
legality failure by construction, which §14c already taught us to see coming.

**Arms:** `--mlv --pos-cap` (cap alone, vs the champion) and
`--mlv --mlv-depth --pos-cap` (cap on top of the leading candidate — does the
constraint add anything the re-pricing has not already done?).

**Bars (waiver-graded; frozen beside, no bar):** same as §15 — beat MLV-cap's
+2.6/+2.1 on both means, h2h ≥ 16/30 on skill, 30/30 legal; for the combined
arm, additionally reported (no bar): does it beat depth-alone's
+25.90/+18.56? Controls: `--mlv` byte-guard; depth control (D_TE ∈ [13,15]);
engagement counted with byte-identical seats reported as such.

**P148, filed blind:** **the cap is largely REDUNDANT — cap-alone lands
within ±10 of MLV-cap's means, and combined lands within ±10 of depth-alone's
means — because MLV rarely volunteers a beyond-depth player and the discount
already prices him at zero, so the cap mostly re-ties tie-breaks among
worthless picks.** The one channel that could break this prediction: ACTUAL
grading counts bench bodies through weekly best-lineup, and the cap changes
WHICH zero-marginal bodies fill the bench. Filed either way.

## 16-GRADED, SAME DAY — P148 TRUE: THE HARD CAP IS REDUNDANT, AND WHERE IT BINDS IT ONLY HURTS

Controls: byte-guard held; depth control live; 24/30 seats byte-identical to
the reference arm in both comparisons (the cap rarely binds). One analysis
correction made before quoting anything: the frozen arms were first compared
against waiver-graded references — those identical/h2h cells were invalid and
are discarded; means below are all correctly referenced.

| waiver-graded | actual | skill | vs its reference |
|---|---|---|---|
| MLV-cap (ref) | +2.57 | +2.10 | — |
| `--pos-cap` alone | −0.64 | −1.41 | **h2h 0/30** — never once improved a differing seat |
| depth discount (ref) | +25.90 | +18.56 | — |
| `--pos-cap` + discount | +23.41 | +18.56 | actual −2.5, skill identical |

Frozen beside: cap-alone +40.3/+24.1 (vs +45.8/+29.3), combined +82.4/+42.2
(vs +86.2/+42.8) — the same slight decline both gradings.

**P148 TRUE on both blind clauses** (cap-alone within ±10 of MLV-cap;
combined within ±10 of depth-alone). The mechanism, now measured twice from
opposite directions: MLV plus the discount already never VOLUNTEERS a
beyond-depth player — the only thing a hard constraint adds is removing
bench option value in the ~6 seats where it binds, and in those seats it
never once won. **The soft version of Cory's idea (§15's re-pricing) strictly
dominates the hard version (§16's constraint). Keep the discount as the
candidate; the cap is retired.**

## 17. PREREG — CORY'S ENSEMBLE VOTE (`--vote`), committed before the run

Cory, 08-20: *"a test to see how it performs where we use lots of the models
and strategies and then choose the player with most models agreeing?"*
Never tested as a DRAFTING rule — the war room's shadow panel displays
seven-strategy agreement (and has already caught a 7/7 consensus driven
entirely by a zero-weighted term — agreement can be hollow), but the vote
has never made the picks.

**Mechanism.** One shared roster. At each pick, each of SEVEN committed
strategies names its candidate GIVEN that shared roster: (1) the shipped
curve · (2) MLV-cap · (3) MLV + depth discount · (4) shipped + persistence
shrink · (5) shipped + K/DEF supply deadline · (6) shipped + TE boost ·
(7) shipped + measured RB row. Plurality wins; ties break toward the
candidate with the best market rank among the tied. All seven are committed
flag families — nothing invented for the vote.

**Bars (waiver-graded primary, frozen beside):** the §14 set — beat
MLV-cap's +2.6/+2.1 on both means, h2h ≥16/30 on skill, 30/30 legal.
Controls: `--mlv` byte-guard; per-pick vote tallies written to the artifact
(a 7/7 sweep on every pick = the voters are costumes, declared not
discovered); engagement vs MLV-cap counted.

**P152, blind:** the ensemble does NOT beat MLV-cap — it lands BETWEEN its
members. Majority voting helps when errors are independent, and these seven
share one value signal (market order) — D measured five weekly arms at
ρ≈0.997 and called it one signal in five costumes; the drafting version of
that lesson predicts the vote tracks the shipped/MLV family rather than
transcending it. A win would mean strategy DIVERSITY carries information the
best single rule misses — filed so that result would be a genuine surprise.

## 17-GRADED, SAME DAY — P152 TRUE: THE VOTE LANDS BETWEEN ITS MEMBERS, AND DEMOCRACY ELECTED A SECOND KICKER

Controls: byte-guard held; tallies written (814 picks, unanimous on only
13% — mode 5-6 of 7, so the voters genuinely disagree and the costume-sweep
concern is CLEARED; the result is about voting, not about fake diversity).

| ensemble vote | actual | skill | vs MLV-cap |
|---|---|---|---|
| waiver-graded | **−28.31** (13/30) | +3.07 | fails the +2.6 actual bar; h2h 18/30 on skill |
| frozen | −1.84 (16/30) | +20.02 | far under +45.84/+29.33 |

**And 2 of 30 seats drafted a SECOND K/DEF** — the four shipped-family
voters outvote the MLV cap, so the plurality violates the normal-roster
constraint the champion enforces. Cory's own "that's terrible" case, elected
by majority.

**P152 TRUE on its blind claim.** The mechanism is the textbook one:
majority voting adds value when errors are INDEPENDENT; these seven share
the market-order value signal, so the vote regresses the best member toward
the family average instead of transcending it. Same lesson as D's ρ≈0.997
weekly-arm null, now measured on drafting. **The way to use multiple models
is the one already shipped: ONE champion picks, the others show as labeled
second opinions (the shadow panel, the source toggle) — advisors, never
electors.** RETIRES the ensemble line.

## 18. PREREG — REAL_VONA RE-RUN UNDER THE INCLUDE-SELF FIX (P250), committed before the run

**Why now.** Cory, 2026-08-20: *"We made changes to VONA calculation. Make sure
we're doing it correctly now and need to rerun roster construction test as
previous tests would've been flawed!!"* The change is register 56's fix —
`VONA_INCLUDE_SELF: false → true` in `engine.js` (`b62b906d`, preregistered
blind as P107 and graded +114.1 pts/seat-season CI [+48.0, +180.1] before it
shipped). The harness audit that answers his first sentence, run before this
section was written:

* **`--gauntlet=vona` / `hybrid` / `snake` (P153–P156): CLEAN.** The replay
  frame is deterministic — a candidate whose recorded pick lands after my next
  slot IS in `survOf[q]`, so a self-surviving man's urgency is already 0. The
  Gauntlet grades stand.
* **A's `--mlv-look` (P240): CLEAN.** Its next-pick scan does not exclude the
  candidate; a self-surviving man zeroes his own wait cost. The replication
  stands — and it is now the stronger evidence on the lookahead question,
  because it reproduced the §8-family split (actual up, skill down) with
  include-self semantics already correct.
* **MLV-cap, `--mlv-depth`, `--pos-cap`, exact DP, BAV/ADP, Zero-RB, Hero-RB,
  Late-QB (P133–P156 champions and nulls): NO EXPOSURE.** No probabilistic
  survival term anywhere — value is the market's own order. The champion's
  +45.84/+29.33 and +2.57/+2.10 are untouched by the engine fix.
* **`--real-vona` (§14, P139): THE ONE FLAWED ARM.** Line 969 substitutes the
  SECOND survivor when the best survivor is the candidate himself —
  `(a[0].player_id !== c.player_id) ? a[0] : a[1]` — which asserts a player
  who demonstrably survives to my next pick cannot be had there. Register 56's
  exact shape, in my code, found by auditing for it.

**The fix.** `s = a[0]` unconditionally. When the best survivor IS the
candidate, the cost of waiting on him is zero by construction (`v = m − m`),
which is the truth the old line papered over. No flag: the old behaviour is
the defect, both runs are reported here, and P139's grade stays as the record
of the code as it stood.

**Blind claims, committed before the re-run (grading: waiver-aware skill and
actual, same 30 seat-years, vs myopic `--real` at −5.29 actual / +5.69 skill
and old `--real-vona` at −19.83 / −9.70):**

* **(a)** The fixed arm lands BETWEEN the old `--real-vona` and myopic
  `--real` on both waiver-graded means (±3 tolerance at the boundaries) —
  self-exclusion could only overstate urgency, so removing it can only shrink
  the deviation from myopic.
* **(b)** The P139 verdict does NOT flip: fixed VONA still fails to beat the
  myopic arm beyond noise. A flip would mean the timing term's value was
  hiding behind the self-exclusion bug all along — filed as the surprise
  direction, worth a program reopen if it happens.
* **(c)** It does not reach MLV-cap's +2.6/+2.1 waiver-graded.

Mechanism note for the grade: the fix binds ONLY at picks where the best
surviving same-position man is the candidate himself — exactly the picks
where the old code invented urgency out of the second survivor.
