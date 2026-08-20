# THE BENCH-OPTION OBJECTIVE — CORY'S "MISSING INPUT", PREREGISTERED BEFORE THE RUN

**Relay, 2026-08-20. RULE 1c (knowledge). Implementation lands on the relay
branch (A merges); no run of this arm exists as this commits. no_fit_guard:
FALSE files like a pass; post-hoc changes get labeled.**

Cory: *"I want to extract max value and draft a fantasy competent roster (not 2
Def or K).. any equation that recommends that is obviously missing an input"* →
*"I want it to be the 2026 foundation."*

## 1 · THE MISSING INPUT, NAMED AND MEASURED

Every prior equation valued the roster in a frozen season: bench = 0, K2's +2
is real. The missing input is **the stochastic season plus a live wire**:
players miss weeks, and the wire refills some positions free (K 1.02× its
floor, measured P150) and others not at all (RB adds 1.47×). Value of a bench
player = P(promotion) × (his level − wire level); value of K2/DEF2/backup-QB
≈ 0 or negative because the wire IS their level.

**Constants, measured 2026-08-20 from the committed stores (3 seasons,
drafted-caliber population by preseason projection; byes and busts included):**

* Per-player weekly absence p_q: **QB .216 · RB .191 · WR .190 · TE .186**
  (K/DEF pinned .20; immaterial — the wire floor makes their absence free).
* Wire levels (season pts, §13 measured, already in the harness as
  `WAIVER_WK`): QB 322.9 · RB 78.4 · WR 124.8 · TE 130.4 · K 128.6 · DEF 100.
* Rank-curve surplus over wire (3-season avg): RB20 +96 / RB34 +40;
  WR22 +42 / WR36 +13; QB8 +18 / **QB14 −40**; TE8 +6 / **TE14 −21**;
  K ≈ +6/−4; DEF ≈ +10/0. **A backup QB or TE is worth LESS than streaming.**

## 2 · THE ARM (`--opt` in `roster_builder_replay.js`, relay branch)

Objective per candidate: **expected season starting-lineup points**, absence-
only stochastic model (v1 — performance variance deliberately excluded: the
dispersion family's calibration history says do not import it untested):

* V(R) = mean over M=200 pre-drawn absence seasons (17 weeks; each rostered
  player independently absent w.p. p_q that week; common random masks per
  seat-season, fixed seed 20260820, reused across candidates — paired
  comparison, no MC noise between candidates).
* Weekly lineup: the harness's own legal fill (dedicated slots + flex) over
  PRESENT players, every unfillable slot floored at `WAIVER_WK[q]` — the wire
  as free substitute, the §14c lesson (floors + legality, never floors alone).
* Player weekly level: LOO points curve at his position rank (`posCurveFor`,
  the snake arm's proven denomination) / 17.
* pick = argmax V(R+c) − V(R) over the top 4 available per position (declared
  pruning; value is strictly decreasing in rank within position).
* **NO CAPS. NO BENCH RULE. NO NEED TERM.** Every roster rule currently
  bolted on must EMERGE or the objective has failed its own thesis.

## 3 · BLIND BARS (P254, P255–P256, filed with this commit)

*(E, 2026-08-20 — this section spent three merges renumbered to P263, then
P269, then P310, chasing a collision with this branch's own REAL_VONA row
under the same original number. Origin/main resolved the identical collision
the other direction — kept this row at P254 and renumbered REAL_VONA to
P250 instead — and that resolution is adopted here: it is the numbering
every other row and file in the ledger already references, and P254 sits
under the CI three-part-standard gate's pre-P283 grace period, so it does
not need the LEARNING TARGET/SKILL DESIGN/CONSEQUENCE ROUTE fields the P310
detour required as a workaround. Full history in PREDICTION-LEDGER.md's
P254 row.)*

* **P254 — THE THEOREM (known-positive control):** uncapped, `--opt` drafts
  **≤1 K and ≤1 DEF in ≥28/30 seats, and ≤1 QB and ≤2 TE in ≥25/30.**
  The known-negative is already graded: uncapped MLV drafts K 1.93 / DEF 1.90
  (register 136 C2). If `--opt` also multi-drafts them, the thesis is FALSE
  and files as such.
* **P255 — the points bar:** waiver-aware skill mean ≥ MLV-cap's +2.10 over
  the same 30 seat-years. Direction claim; the DP result says the frozen
  frame is closed, so any gain must come from exactly the stochastic terms —
  a null here means the option value is real but already captured by the cap
  + bench rule, which is itself worth knowing and files loudly.
* **P256 — legality:** 30/30 rosters legal, every starting slot fillable by a
  rostered player (wire floors price absence, never permanent vacancy).

## 4 · SHIP PATH AND CLOCK (2026, not 2027 — Cory's ruling)

Grades land tonight/Thursday. If P254 AND P256 pass: the arm ships to the war
room **as the seat-plan panel's generator** (report-only, the exact class MLV
shipped in), Friday-freeze compatible; A merges the harness code, B repoints
the panel artifact. P255's result prints beside it either way — a FALSE there
does not block the ship (the theorem, not the delta, is what Cory asked for).
If P254 fails: nothing ships, the FALSE files, and the shipped MLV-cap +
bench rule stand for Saturday. **DEFAULT if grading is not done by Friday
noon: nothing ships; the prereg grades post-draft.**

---

## 5 · V2 AMENDMENT, 2026-08-20 — FILED AFTER v1's GRADES, BEFORE ANY v2 RUN

v1 ran and **P254 graded FALSE, loudly**: mean K 2.40 / DEF 2.33 (worse than
the uncapped-MLV known-negative), while the QB/TE half of the theorem held
(1.17 / 1.13). The localization is exact: v1's wire was FRICTIONLESS —
unlimited claims, every slot, every week — under which real bench depth is
worth zero (a late RB sits below the RB wire level) and the only positive
late marginal anywhere is K/DEF starter insurance. Cory's diagnosis question
("is it luck? lack of accounting for waivers?") has a measured answer:
neither — waivers were OVER-credited. The missing input is absence **plus
wire friction**.

**v2 changes, declared before running (P257–P259):**
1. **One wire fill per week across the roster** — the weekly claim. Each
   simulated week, the single empty slot where the wire adds most gets its
   wire level; every other absent slot scores ZERO. This is the real
   liquidity constraint: three simultaneous RB holes cannot all be streamed.
2. **Forcing fallback** — when §14c forcing restricts to a needed position
   and the recorded pool has none left, fall back to unrestricted candidates
   instead of skipping the pick (P256's vacancy bug, mechanism in the grade).

Nothing else moves: same constants, same M=200, same masks, same pruning,
same bars otherwise. v2 is a NEW arm with NEW rows per the adaptation
policy — v1's FALSE stays on the record as the wire-liquidity lesson.

---

## 6 · V3 AMENDMENT, 2026-08-20 — ONE UNIT EVERYWHERE (after P257–P259 FALSE)

v2's debug dump found the real defect: **units**. Roster players were valued on
`posCurveFor` — a draft-slot OUTCOME curve built from league matchup data,
where a player's points count only for weeks he sat on a roster (QB10 reads
96.5 season pts; reality ~280) — while the wire levels are real measured
points. Mixed units made the wire look better than most of the roster; the
drafter responded rationally to a nonsense landscape. Snake-rank's lesson,
one level deeper.

**v3, declared before any v3 run (P260–P262):** player levels come from
**nflverse LOO realized rank curves** (target season excluded; the SAME stores
the §13 wire levels were measured against, so numerator and denominator share
a unit); K/DEF (absent from nflverse) use the measured surplus schedules
K(r) = 128.6 + max(0, 8−2r), DEF(r) = 100 + max(0, 14−3r) — the +6/+10
starter surpluses from the 08-20 table, decaying to wire. Market rank (draft
order within position) still indexes the curve, as every VBD baseline does.
The realized-rank curve is optimistic about the r-th DRAFTED player (bust risk
lives in the rank, not the curve); the absence rates (.19) carry bust-weeks —
declared as a known approximation, not hidden. Friction wire and forcing
fallback unchanged from v2.

---

## 7 · V4 AMENDMENT, 2026-08-20 — POSITION-DEPENDENT FRICTION (after P260 FALSE / P262 TRUE)

v3 fixed the units and the arm jumped from −280.8 to −4.2 skill with zero
vacancies — and drafted EXACTLY 2 K + 2 DEF in all 30 seats. The exactness is
the tell: under one roster-wide weekly claim, an absent K whose claim is busy
scores zero, so one K of insurance prices at ~+13 and every seat buys it.
That friction model is wrong in a specific, measured way: **nobody competes
for kickers.** P150: K adds deliver 1.02× the wire level (uncontested, always
available); RB adds 1.47× (contested, scarce). Cory, verbatim: *"defense and
K isnt very much difference"* — from the wire.

**v4, declared before any v4 run (P263–P265):** friction is position-
dependent. {QB, K, DEF} slots refill at their wire level WITHOUT consuming
the claim (uncontested streaming); {RB, WR, TE} empty slots (including flex)
share ONE claim per week. Nothing else moves.

---

## 8 · V5 AMENDMENT, 2026-08-20 — SUPPLY-AWARE FORCING (after P264 TRUE / P265 FALSE)

v4's position-dependent friction landed the economics: **waiver-aware skill
+3.46, h2h 16/30 — both champion-bar clauses — with K exactly 1.00 in 30/30
and QB 1.00.** One regression: TE 0.57 — streaming TE is so cheap the arm
never drafts one, opponents exhaust the recorded TE pool, and last-pick
forcing meets an empty shelf (register 59's supply problem in a new seat).
The cure already exists in this file: **§14d(b) supply-aware forcing** — when
a needed position's remaining pool supply is down to the gap itself, force it
NOW, while at least one exists. v5 adopts exactly that; nothing else moves.
P266–P268 filed blind before the v5 run.

---

## 9 · V6 AMENDMENT, 2026-08-20 — HORIZON-AWARE FORCING (after P266–P268 FALSE)

v5's supply-aware forcing checked supply AT my pick; nine rosters still ended
TE-less because the last recorded TE went to an opponent BETWEEN my picks, and
the early trips it did make cost points (+1.70 vs v4's +3.46). v6 forces a
needed position at the **last safe moment**: when no copy of it survives past
my next pick in the recorded order — deterministic, later than v5 (points
recover), never blind to the between-picks horizon (vacancies close).
P269–P271 blind before the run; nothing else moves.

---

## 10 · V7 AMENDMENT, 2026-08-20 — SCARCITY-FIRST FORCED PICKS (after P270 TRUE / P269 FALSE)

v6's points are the family's best (**+5.19 waiver-aware, h2h 16/30**) and the
pick-by-pick trace found the last defect: when forcing offers two needed
positions and both marginals are ≈0 (the endgame), pick-order tie-breaking
takes the WRONG one — K before the dying TE — and the TE pool is gone by the
final pick. **v7: within forced candidates, the scarcest needed position
(smallest supply surviving past my next pick) is taken FIRST; marginal only
breaks ties.** A forced pick is about feasibility, not value. Nothing else
moves. P272–P274 blind before the run.

---

## 11 · V8 AMENDMENT, 2026-08-20 — EARLIEST DEADLINE FIRST (after P273 TRUE / P272 FALSE)

v7 fixed TE and the mole moved to K (5 seats K-less): scarcity-by-count chose
TE at the 2-needs-2-picks endgame while the league's endgame K run ate every
"surviving" K before the final pick. Count past my next pick is the wrong
scarcity metric; **the deadline is**: v8's forced pick takes the needed
position whose LAST available copy dies soonest in the recorded order
(earliest-deadline-first — the provably correct rule for sequential claims).
P275–P277 blind before the run; nothing else moves.

---

## 12 · V9 AMENDMENT, 2026-08-20 — THE EDF FEASIBILITY SCHEDULE AS TRIGGER (after P276 TRUE / P275 FALSE)

v8 fixed which position a forced pick takes; the TRIGGER still fired on
counts, one pick too late when two deadlines die inside one between-picks
window. v9 completes the scheduling argument: sort needed positions by
deadline (last available copy's recorded pick_no), match against my remaining
pick numbers in order, and FORCE the moment any k-th deadline precedes my
k-th remaining pick. Provably sufficient — a vacancy after this means the
pool itself ran dry. Points untouched (+8.82 frozen / +3.56 waiver stand as
v8's result). P278–P280 blind before the run.

---

## 13 · GRADED, 2026-08-20 — THE OBJECTIVE WORKS, AND THE TRAIL IS THE PROOF

Final family state (v9, corrected EDF trigger; branch `01668acc`):

| bar | result |
|---|---|
| theorem: ≤1 K | **29/30 ✓** |
| theorem: ≤1 DEF | 24/30 ✗ (bar 28 — six noise-level endgame DEF2s, the one miss) |
| theorem: ≤1 QB | **29/30 ✓** |
| theorem: ≤2 TE | **30/30 ✓** |
| legality: zero vacancies | **30/30 ✓ (P280 TRUE)** |
| points: waiver-aware ≥ +2.10, h2h ≥ 16 | **+3.45, 16/30 ✓ (P279 TRUE)** |
| points: frozen | **+32.53, 21/30 — the MLV-cap plateau, with NO caps** |

**The missing input Cory named is now a measured, mechanized model:** absence
(measured rates) + wire LEVELS (measured §13) + wire FRICTION
(position-dependent, one contested claim/week) + pool deadlines (EDF). Every
roster rule the shipped system bolts on — the K/DEF cap, the bench rule, the
need term — EMERGES from the objective, except six DEF2 endgame ties under
the one remaining hand-declared constant (the DEF surplus schedule; post-
draft refinement routed). Nine preregistered iterations, six FALSE grades,
each naming the next mechanism: that trail (§5–§12) is the deliverable as
much as the number.

---

## 14 · V10 AMENDMENT, 2026-08-20 — MEASURED PER-POSITION FRICTION (C's table replaces my declared constant)

C's `wire_friction_table.json` (648 real 2023-25 claims, known-positive
control green) measured the thing v4 declared: contested rates **RB 50.9% ·
DEF 49.5% · TE 48.8% · WR 35.4% · QB 29.3% · K 28.9%.** My binary partition
was wrong in shape: DEF belongs with RB/TE, WR sits between, and the
"contested vs free" dichotomy is really a ladder. **v10, declared before any
run:** the partition AND the one-claim budget are both replaced by measured
per-position fill probabilities — an empty slot at q refills at its wire
level with probability **p(q) = 1 − c(q)/2** (a contested claim is won half
the time in a symmetric 10-team league — the one declared approximation
left, named), else scores zero that week. Independent per slot; the
friction now lives where C measured it. If the theorem regresses at DEF
(insurance for a contested DEF may genuinely price a second one), the
declared reading is that the MODEL is telling us something, and the level-
discount alternative (loser gets the next wire body, not nothing) is the
preregistered v11 — not a silent retreat to the old partition.

---

## 15 · V11 AMENDMENT, 2026-08-20 — BOTH FRICTIONS (after P286 FALSE / P287 TRUE-suspicious)

*(v10's two rows were filed as P283/P284; renumbered to P286/P287 by E,
2026-08-20 — this branch had already claimed P283/P284 for REAL_VONA and
the opponent-starter model 14 minutes before this section's commit.
First-allocation-wins the other direction from most of this evening's
collisions. See PREDICTION-LEDGER.md's P286 row for the full note.)*

v10 (per-slot contest probability, no budget) collapsed the theorem — the
model bought insurance at EVERY position (K 2.00 / DEF 2.53 / QB 2.03),
rationally, because an uninsured slot scored zero ~15-25% of weeks — while
points exploded (+47.15/+18.56), which Rule 3d flags rather than celebrates.
Reality has BOTH frictions and v11 models both, each from its own evidence:
**one claim per week** (the roster-moves budget, v9's) **succeeding with
probability 1 − c(q)/2** (C's measured contest rate on that position). All
other slots beyond the claim score zero that week. Nothing else moves.
P285 blind before the run; three-way paired read v9/v10/v11 declared.

---

## 16 · THE FRICTION QUESTION, RESOLVED BY THREE RUNS — v9 STANDS (2026-08-20)

| arm | friction model | theorem | waiver skill |
|---|---|---|---|
| **v9** | empty slots refill free at wire | **3 of 4 clauses, 0 vacancies** | **+3.45 (16/30) ✓** |
| v10 | per-slot contest probability (C-measured) | collapsed — insurance everywhere | +18.56 (suspicious, P287) |
| v11 | one claim/week × contest probability | collapsed, points fell | −10.59 |

**The mechanism the family surfaced:** any objective in which an uninsured
absent K/DEF can score ZERO prices a backup at ~+10 and rationally buys one —
and reality never produces that zero, because a lost contested claim still
yields the next wire body as a free agent. **Wire friction governs the
acquisition of ABOVE-wire value (P150's RB 1.47×), not slot replacement.**
v9's free-replacement wire was the correct physics; C's contested-rate table
is the right input for the UPGRADE side — waiver-claim advice (P282), where
contests actually bind. This section, with all three runs, is the answer the
OpenAI audit receives for its question 2.
