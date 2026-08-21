# STRATEGY SEARCH ON THE FIXED VONA — WHICH CONFIGURATION SHOULD CORY DRAFT WITH SATURDAY?

**Relay, 2026-08-20. Published under RULE 1c (knowledge, not code). The runs are
A's (CI holds the bundles); the bars below were committed BEFORE any run in this
batch existed. no_fit_guard applies: a FALSE files like a pass, post-hoc changes
get labeled.**

Cory, verbatim, 2026-08-20: *"the goal is to now find best strategy (roster
building, ceiling late, etc) with our new vona model."*

---

## 1 · WHAT "NEW VONA MODEL" MEANS, PINNED

Arm **a1** in `draft/backtest/replay_seats.js`: `VONA_INCLUDE_SELF: true` — the
register-56 fix (VONA no longer excludes the player from his own next-pick
pool), shipped 08-19, graded S18/P283 (renumbered off P250, see PREDICTION-LEDGER.md): worth **~15–21 pts/seat, no shipped
verdict moved**. Every arm in this batch runs ON a1, same bundle, one CI batch,
so deltas attribute to strategy and not to bundle drift (the harness's own
a0/a1 rule).

## 2 · THE YARDSTICKS, BOTH ALREADY RULED OR MEASURED

* **Cory's ruled shape** (08-19, via C): *"We should be trying to match the top
  3 finishers row… That's the winning strategy."* Measured target from this
  league's real drafts (n=9): **QB 1.56 · RB 4.78 · WR 5.00 · TE 1.67 · K 1 ·
  DEF 1.**
* **A's shape measurement (b4ffd0aa, today):** under the fixed VONA, `need=1.0`
  halves the distance to that shape — **8.45 → 4.45** (RB 9→7, WR 2→4). Shape
  is necessary but not sufficient; the batch below grades POINTS.

## 3 · THE ARMS — every one is a configuration the war room can actually ship

All on `--arm a1`, all flags already exist in `replay_seats.js` (unknown flags
refuse; resolved weights are stamped into the artifact — read the stamp, not
the request):

| id | flags | the strategy it is |
|---|---|---|
| S19a | *(none)* | **shipped baseline** — MEASURED_WEIGHTS as-is (need 0, ceiling 0.45 flat) |
| S19b | `--need 1.0` | **roster building** — the roster-aware term on, at value-parity weight |
| S19c | `--auto` | **the engine's phase ramp** — need late, ceiling late, tier/risk/bye by phase; the closest existing thing to Cory's "ceiling late", and it ships as a UI checkbox |
| S19d | `--bye 1.0` | **bye insurance** — prices the unfillable-week failure register 59 actually found |

**Deliberately NOT in this batch:** slot-aware VONA (s1) — it has its own live
prereg (`SLOT-AWARE-VONA-REPREG-2026-08-19.md`) and duplicating it here would
double-spend its one blind shot. A pure "ceiling-late-only" arm does not exist
as a flag; S19c conflates ceiling-late with the other ramps, and §5 declares
the attribution follow-up rather than pretending otherwise.

## 4 · METRICS AND DECISION RULE, DECLARED

* **Primary:** mean optimal-lineup season points vs S19a, 30 seat-years, plus
  head-to-head seats won.
* **Secondary:** distance from Cory's ruled shape (the §2 metric), reported for
  every arm but deciding nothing on its own.
* **Decision rule:** an arm is recommendable only if it beats S19a on the
  primary mean AND wins h2h ≥ 16/30. If two arms clear, the one with the
  better mean is the recommendation; ties break toward the simpler
  configuration (need slider < auto checkbox < anything else).
* **The recommendation is a TOGGLE, not code** — need slider and Auto checkbox
  both exist in the shipped UI, so a Friday ruling by Cory is compatible with
  the freeze (no engine change; the board's default weights are untouched
  unless Cory rules).

## 5 · BLIND CLAIMS (P251–P253, filed with this commit, before any run)

* **P251 — need-1.0 beats the shipped baseline on the primary, under the fixed
  VONA.** Prior: P110 graded it +68.6 pre-fix; the fix moved VONA by 15–21
  pts/seat, so the magnitude is genuinely open — the CLAIM is direction only.
* **P252 — auto lands within ±15 pts/seat of need-1.0.** The live-board probe
  showed them converging to the same shape (WR3/TE2/RB7); if auto beats
  need-1.0 by MORE than +15, the phase ramps add something beyond
  roster-awareness, and the declared follow-up fires: A adds a
  `--ceiling-late` flag (ceiling ramp ONLY) so the "ceiling late" half of
  Cory's question gets its own attribution run. If auto ≈ need, ceiling-late
  is answered by parsimony: the ramp added nothing roster-awareness didn't.
* **P253 — bye-1.0 lands within ±10 of baseline** (small, honest prior:
  slightly positive; the optimal-lineup estimand builds legal weekly lineups,
  so collisions cost real points but are rare at 10 teams).

## 6 · CLOCK AND DEFAULT

Draft is Saturday 18:00 CDT; freeze Friday 18:00. **ASK (A): dispatch the four
runs as one CI batch today or Thursday morning; grading is arithmetic once the
choice files land.** **DEFAULT if the batch cannot complete by Friday noon:
nothing ships — weights stay as ruled, the war room's Auto checkbox stays
available with its existing "ungraded under fixed VONA" honesty label, and
this prereg grades post-draft as 2027 knowledge.** A silent Friday is that
default, not a blocker.

---

## 7 · PRE-RUN AMENDMENT, 2026-08-20 (BEFORE ANY S19 RUN EXISTS): THE BASELINE MOVED UNDER THE PREREG

Between this prereg's commit and any dispatch, **`need` shipped at 1.0 on main
and Cory confirmed it directly** (*"It was my call"* — A20/register 164 closed,
`MEASURED_WEIGHTS.need === 1.0` verified live). Two §3 rows are therefore
stale AS LABELED, and this amendment re-labels them BEFORE the batch runs —
the same discipline as §5's bav≡adp amendment in the Gauntlet prereg:

* **S19a (no flags) now means the shipped need-1.0 configuration.** It is the
  thing Cory will actually draft with; still the control.
* **S19b becomes `--need 0`** — the counterfactual that prices Cory's need
  ruling on the fixed VONA. P251's claim is UNCHANGED in substance (need-1.0
  beats need-0 on arm a1); only which arm-id carries which weight flipped.
  Dispatching S19b as `--need 1.0` would produce a choice file byte-identical
  to S19a — the exact false-null the harness's weight stamp exists to catch.
* **⚠️ A, one verification before trusting S19b:** confirm the harness treats
  `--need 0` as an override and not as "flag absent" (a truthiness check on
  the parsed value would silently run the baseline; the artifact's stamped
  `weights.need` must read 0).
* S19c (`--auto`) and S19d (`--bye 1.0`) are unchanged; note both now run on
  top of the need-1.0 baseline, which is what "shippable configuration" means
  after the ruling.
