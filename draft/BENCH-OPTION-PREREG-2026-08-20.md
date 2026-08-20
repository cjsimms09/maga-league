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

## 3 · BLIND BARS (P257, P255–P256, filed with this commit)

* **P257 — THE THEOREM (known-positive control):** uncapped, `--opt` drafts
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

Grades land tonight/Thursday. If P257 AND P256 pass: the arm ships to the war
room **as the seat-plan panel's generator** (report-only, the exact class MLV
shipped in), Friday-freeze compatible; A merges the harness code, B repoints
the panel artifact. P255's result prints beside it either way — a FALSE there
does not block the ship (the theorem, not the delta, is what Cory asked for).
If P257 fails: nothing ships, the FALSE files, and the shipped MLV-cap +
bench rule stand for Saturday. **DEFAULT if grading is not done by Friday
noon: nothing ships; the prereg grades post-draft.**
