# ZONE 1 — THE MOVEMENT LINE & THE STACK LINE

_Filed 2026-08-08. Companion to the Zone-1 redesign spec (items 1–6) and to
`DOCTRINE-ENFORCEMENT-AUDIT.md`._

---

## (A) THE MOVEMENT LINE — the model thinking out loud

One thin line under the recommendation. **Replaced, never accumulated.** Full
history one tap down as the *movement log*, ledger-logged so January can grade
whether the mid-draft repositioning was right.

| # | line | example | buildable today? |
|---|---|---|---|
| 1 | **DID IT MOVE** | *"shifted to Montgomery: two RBs went in the last four picks, tier-cliff pressure up"* | ✅ **yes** |
| 2 | **ALMOST MOVED** | *"McMillan closed to within 2 pts on the WR run — didn't pass"* | ✅ **yes** |
| 3 | **WOULD MOVE** | *"if one more RB goes before your pick, Judkins becomes the call"* | ⚠️ **yes, but costly** |
| 4 | **DOCTRINE DRIFT** | *"Early-QB Strike has closed from −27 to −9 this round"* | ⚠️ **see below** |

### Notes that change the build

**(1) and (2) need a remembered previous state**, which does not exist yet —
every render currently recomputes from scratch and discards. The addition is a
`state.lastRecommendation` snapshot per pick, diffed on re-render. Cheap, and it
is also the substrate for the movement log and its ledger entries.

**(3) WOULD MOVE is a counterfactual re-score**, and that is the cost: it means
re-running the recommender with one more player removed, per candidate trigger.
At the currently measured **~1.9s per full recompute** (`PARKED #11`), a naive
implementation adds seconds to every render. It needs either the lazy/visible-only
scoring change or a restricted trigger set (top 2–3 candidates only). **Do not
build it before the latency work** or Zone 1 becomes unusable in exactly the
moment it matters.

**(4) DOCTRINE DRIFT does NOT depend on the doctrine being wired**, which is the
useful part. The `−27 → −9` figure is the **dollar-gap panel's** number — the
measured gap between the enrolled doctrine and its live alternative — and that
panel already exists and computes honestly. So this line can be truthful today.

⚠️ **But its WORDING must not imply influence.** With the doctrine display-only
(severity-1, confirmed), *"trending toward being overridden"* is misleading —
nothing is being overridden because nothing is driving. Until Stage 3 lands, the
honest phrasing is about the GAP, not about control:
> *"Early-QB Strike's edge has closed from −27 to −9 this round."*

Once Stage 3 exists, the override wording becomes true and can be used.

---

## (B) THE STACK LINE — a proper, quiet home

**One collapsed line in the context rail**, never in Zone 1's default view,
never more than one tap away:

> `Stacks: 2 live routes · best: Burrow completes Chase (61% at 26)`

Expands to the full Stack Routes panel: ranked completions with combined odds
and dollar value, **single-partner routes first** (exp 6: *the first partner is
the value*), double-stacks showing their flattened marginal.

Plus a subtle badge on any recommendation that preserves or completes a live
route: `⚡ completes Chase stack`.

### ⚠️ The honesty problem this spec must solve

Two measured facts sit against a prominent stack surface:

1. **The evidence table classifies `stack` as `weak — LEAN only, NOT INSTALLED`**
   (`deviation.js` EVIDENCE). That is a deliberate, recorded decision.
2. **The intervention-rate measurement found it barely fires**: across 25
   simulated drafts, `stack` was the *lead* driver on **5** of 221 interventions
   and material on 39. It is near the bottom of the board, just above the two
   dead terms.

So a persistent stack line and a `⚡ completes Chase stack` badge would give
**standing visual prominence to a term we have explicitly not installed and
which rarely moves a pick.** That is the deviation badge's own failure mode in
reverse — decoration that reads as evidence.

**Therefore the line ships with its class attached**, exactly as the deviation
badge does for every driver:

> `Stacks (LEAN, not installed): 2 live routes · best: Burrow completes Chase`

and the badge reads `⚡ completes Chase stack — LEAN`. If exp 6 or 21 later
promotes the term, the label changes in one place and the prominence becomes
earned rather than assumed.

**This is not a reason to skip the feature.** Cory's framing — *"stacking
influences my read without demanding a panel"* — is exactly right, and a human
weighing a lean is a legitimate decision path. It is only illegitimate when the
surface implies the model is acting on it. The model is not.

---

## Dependency summary

| piece | blocked by |
|---|---|
| Movement (1) DID IT MOVE | ✅ **BUILT 2026-08-08 (grind #4).** `E.movementLine` + `state.lastRecommendation` snapshot; Zone-1 line under the Paths panel |
| Movement (2) ALMOST MOVED | ✅ **BUILT** — same function detects a runner-up closing materially without passing; "flap" suppressed (a gap already close and barely moved stays steady) |
| Movement (3) WOULD MOVE | ⏳ still **the latency work** (`PARKED #11`) — a counterfactual re-score per candidate at ~1.9s each |
| Movement (4) DOCTRINE DRIFT | ⏳ not built. Now that Stage 3 is wired the override wording is available, but the honest gap wording is the safer default until the display-only status (DOCTRINE-ENFORCEMENT-AUDIT) is re-checked. Follow-up |
| Movement log + ledger | ⏳ not built — the snapshot substrate now exists; the log UI + a `movement` ledger kind (server+client whitelist) are the next slice so January can grade the repositioning |

**Honesty note on (1)/(2):** the "why" is the board's own run detection, passed in
and appended factually as co-occurrence ("Shifted to Montgomery — RB/WR run on."),
never a fabricated causal claim. `movement_line.test.js` asserts a move with no
supplied reason renders a BARE line, and the app-wiring suite asserts the render
path actually calls it (the doctrine-tilt "wired but never called" failure class).
| Stack line + badge | ✅ **BUILT 2026-08-08 (grind #4).** `E.liveStackRoutes` enumerates same-team QB↔catcher completions ranked by the engine's own stack value, single-partner first (exp 6); Zone-2 line + `⚡ completes X stack — LEAN` badge; **class DERIVED from `deviation.js` EVIDENCE.stack** (proven by `stack_routes.test.js`: promoting to moderate flips the label with no engine edit); CSS polish requested from B in PARKED. |
