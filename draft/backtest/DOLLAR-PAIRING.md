# PAIRING INTERVENTION RATE WITH DOLLAR EDGE — why the obvious version is circular

_Written 2026-08-08, before building it, because the honest answer changes what
gets built._

## The 2×2 this is meant to resolve

> *"Rare-and-valuable is the goal; rare-and-worthless means the edges are wrong,
> frequent-and-worthless means we're adding noise."*

| | valuable | worthless |
|---|---|---|
| **rare** | ✅ the goal | edges are wrong |
| **frequent** | real but overconfident-looking | **adding noise** |

**We have measured FREQUENT: 73.7%, 8.8 per draft, mean 17.1 picks.** So the
dollar axis is the entire remaining question — it decides between "adding noise"
and "real but loud." Nothing else about the tool matters as much.

## ⚠️ Why the obvious build is worthless

The obvious version: simulate drafts on the 2026 board, take the model's pick in
one arm and the consensus pick in the other, grade both in E[$].

**It cannot work, and the reason is not a data gap — it is circularity.**

The 2026 board carries `proj_mean`, `proj_floor`, `proj_ceiling` and **no
realized outcomes** (verified: no `actual_points` field; the season has not been
played). So the grader would score both arms using *our own projections*.

But **our projections are what the deviations are made of.** `value` — VONA over
our projections — is the joint-lead driver of these interventions. Grading a
deviation that our projections caused, using those same projections, asks the
model to mark its own exam. It would return a positive dollar edge by
construction, at any rate, however wrong the projections are.

That number would be worse than no number: it would look like validation and
would be cited as such.

**This is the exact failure mode experiment 33 exists to expose** — projections
never raced against the market — and it would be laundered into a dollar figure
that appears to settle the question 33 was registered to ask.

## The non-circular version already has a name: EXPERIMENT 34

Grade the interventions against **realized** 2023–25 outcomes, at Cory's real
picks, through the substituted-seat money grader — three arms: what the tool
would have recommended · what ADP said · what he actually took.

That is experiment 34, verbatim, and it is **not implemented** (see
`LAB-RUN-STATE.md`). Its data gate is green — the bridge path is certified — so
it is blocked by build, not by data.

Its own pre-registered limitation rides along and must be quoted with any
result: **~36 decisions total, underpowered by construction.**

## What CAN be said today, honestly

1. **The rate: 73.7%, frozen** as the pre-tree baseline
   (`pre-tree-baseline.json`).
2. **The evidence behind it: 100% LEAN.** Not one deviation reached LIKELY. The
   two lead drivers are `need` (structural — arithmetic, not a belief) and
   `value` (**untested**).
3. **The direction: 212 reaches to 9 falls.** Systematic, not opportunistic.
4. **The dollar axis: UNKNOWN, and not knowable from the 2026 board at all.**

On the 2×2, that places us in the **frequent** row with the column genuinely
open. Anyone who fills that column before 34 runs is filling it with our own
projections.

## The build order this implies

**34 before the decision tree.** Building a five-stage architecture whose Stage 4
is an aggressive edge layer, on top of a composite that intervenes 74% of the
time on untested evidence, means designing the aggressive layer before knowing
whether the aggression pays. If 34 says the deviations lose to ADP, Stage 4 does
not need tuning — it needs to be small.
