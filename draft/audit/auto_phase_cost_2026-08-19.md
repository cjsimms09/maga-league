# The default costs 176 points in rounds 3–6 and earns 85 back in 11–15

**A, 2026-08-19.** P128, graded early. Lab:
`draft/backtest/auto_phase_cost_lab.py`. Two controls, both passing.

**Why early:** `auto` is the **default**. If Cory rules nothing on A13 by Friday
6pm he drafts behind the war room's Auto adjuster, and P127 measured it shedding
~157 roster points per seat-season without anyone asking where.

---

## 1. WHERE THE POINTS GO

Auto minus shipped, realized roster points per seat-season, bucketed by the
engine's own phase constants:

| phase | rounds | `need` | auto − shipped |
|---|---|---|---|
| Anchor | 1–2 | 0.35 | **−1.5** |
| **Build** | **3–6** | **0.9** | **−175.7** |
| Fill | 7–10 | 1.45 | −64.3 |
| **Tight** | **11+** | ramped | **+84.8** |

**EARLY (1–6): −177.2 · LATE (7+): +20.5**

**The reconciliation control is the strong one:** the per-round parts sum to
**−156.7** per seat-season, against the **−157** P127 reported from a completely
different aggregation. The parts add back to the whole.

## 2. P128 IS TRUE AS FILED, MY CORRECTION WAS WRONG, AND NEITHER MECHANISM WAS RIGHT

**Filed prediction — the loss is concentrated EARLY: TRUE.** −177.2 against
+20.5.

**But I amended this row before running**, because its stated reasoning
(*"roster-aware exactly when the best players are still on the board"*)
contradicted itself — `need` is **0.35** in Anchor, the low end, and that
branch's own comment says *"every slot is empty, so 'need' is noise."* I
recorded a corrected pre-run expectation of **LATE**, timestamped, and **it is
wrong.**

**And the interesting part: my correction was right about ANCHOR and wrong about
the conclusion.** Anchor is **−1.5** — essentially nothing, exactly as a 0.35
weight predicts. The loss is not early because auto is roster-aware early; it
is **not roster-aware early at all, and loses nothing there.**

**The real mechanism, which neither version had:** the loss tracks where `need`
is **large enough to move a pick AND the remaining players are still worth
something.** In Anchor the weight is too small to move anything. In **Build**
(0.9) it is big enough to pull auto off best-available **while the board still
holds real value** — that is the whole −175.7. In **Tight** the players are
cheap enough that roster fit wins outright and auto **gains 84.8**.

**So auto is not "worse at drafting". It trades ~176 points of round 3–6
acquisition for ~85 points of late acquisition plus the best conversion of any
arm** (P127: +0.054 / +0.035 / −0.022). Net roster −157, net lineup **+16.9**.

## 3. AND IT LANDS ON FOUR SPECIFIC PICKS OF CORY'S

Ten-team snake, his real schedule:

| phase | his picks |
|---|---|
| Anchor | 8, 13 |
| **Build — where auto costs −175.7** | **28, 33, 48, 53** |
| Fill | 68, 73, 88, 93 |
| **Tight — where auto gains +84.8** | **108, 113, 128, 133, 148** |

**If he defaults to Auto, the measured cost is concentrated on picks 28, 33, 48
and 53**, and the measured gain on his last five.

## 4. WHAT THIS DOES NOT SAY

**It does not say turn Auto off.** Auto's net on the metric that decides games —
lineup points — is **positive (+16.9)**, and its conversion is the best of six
arms. This decomposes a trade; it does not overturn it.

**It is engine-on-bundles**, handed strictly less than the live board, and the
phase table is *"not fitted — three prior drafts is nowhere near enough"* by its
own comment. **Nothing here is a licence to tune the ramp**, which would be
fitting a configuration to a diagnostic three days before a draft.

## 4b. P130, SAME DAY — EVERY ROSTER-AWARE ARM PAYS THE SAME PRICE IN BUILD

§5's rule-3g question was whether A13's arms lose in the same rounds. Run on the
same metric and the same crosswalk:

| arm | Anchor | **Build** | Fill | **Tight** | net |
|---|---|---|---|---|---|
| auto | −1.5 | **−175.7** | −64.3 | **+84.8** | −156.7 |
| `need: 1.0` | −0.8 | **−161.6** | −48.0 | **+111.4** | −99.0 |
| slot-aware | **0.0** | **−162.8** | −44.8 | **+123.9** | **−83.7** |

**P130 is FALSE and fails on the exact condition it named.** I predicted the
constant-weight arm would be flatter and would bleed in Anchor where the ramped
one does not. **Anchor is −0.8 and 0.0 — as near-zero as auto's −1.5.**

**So the ramp is not what protects the early rounds. Nothing is — the rounds
protect themselves.** With every slot empty, `need` has nothing to discriminate
on **at any weight**. `autoWeights`' own Anchor comment says so (*"every slot is
empty, so 'need' is noise"*), and I had read that as a justification for the low
weight when it is a statement that the weight is **irrelevant** there.

**And the separation is somewhere else entirely: Build costs all three arms
−162 to −176, a 14-point spread, while Tight separates them by 39.** Slot-aware
is not better because it protects the middle rounds — it loses the same there.
**It is better because it earns the most back after round 11**, which is where
Cory's last five picks sit.

## 5. RULE 3g

**Implies another failure?** ~~A13's two candidate arms have never been
decomposed this way.~~ **DONE IN §4b, within the hour, and this sentence was
already false when I left it — the exact "body outlives its label" pattern I
spent today cataloguing, in my own file.** What §4b raises instead is sharper:
**Build costs every roster-aware arm the same ~165 points**, and a cost
invariant to the arm is usually structural rather than a defect. **P131 asks
whether it is recoverable at all.**

**Invalidates something?** No. It sharpens P127 rather than contradicting it,
and the reconciliation control proves the two aggregations agree.

**Routed?** `CORY-ASKS.md` A13, because this is his default and he should know
what it costs before he chooses to accept it by saying nothing.
