<!-- TERRITORY: E -->
# PREREGISTRATION — the tier-ramped mean→ceiling blend (register 60/62, P120)

**Filed 2026-08-19 by E, BEFORE any arm ran.** Routed by A:
*"THE TIER-RAMPED MEAN→CEILING BLEND IS NOW BUILDABLE AND IT IS YOURS TO
PREREGISTER."* Grade-by **post-draft**, per A's own stated default in the
routing ("it goes after the draft, behind the prereg, graded on the seat
replay — unless Cory rules otherwise with that document in front of him") —
unchanged here; nothing about writing this prereg argues for moving the date.

---

## 1. What this is answering

Cory sent an r/fantasyfootball proposal (gawake): weight a player's MEAN
projection heavily near the top of the board, and shift the weight toward his
CEILING as he gets more mediocre — because a replaceable player's mean is
worth little; his value is the option on the tail. `draft/audit/
ceiling_inputs_and_tier_ramp_2026-08-19.md` (A, same day) argues this is
decision-theoretically correct and now buildable, because the mean-of-4 blend
just supplied the missing ingredient the proposal's own author said was
scarce: **real cross-source ceiling/floor**, not a per-band constant.

**What we already have is a flat ceiling weight (0.45, Cory's ruling,
shipped) ramped by `autoWeights` — but by ROUND, not by tier.** Round 8 means
two different things depending on whether the player who fell there is
tier-1 talent or a tier-9 flier, and the current ramp cannot tell them apart.
That distinction is the entire content of this prereg.

## 2. The arm, precisely — and why it is NOT stackable with the shipped `ceiling` weight

```
tier_frac(p)      = p.tier / max_tier[p.position]      # 0 (best) .. 1 (deepest)
effective_mean(p) = (1 − w(tier_frac)) · proj_mean(p) + w(tier_frac) · proj_ceiling(p)
```

`effective_mean` REPLACES `proj_mean` as the value the rest of the score sees
(the `value` term, VONA, everything downstream). **This must ship with
`ceiling: 0` in the same arm, never alongside the existing 0.45.** The flat
`ceiling` weight and this blend are two different mechanisms expressing the
same idea — upside matters more on marginal players — and running both at
once double-counts ceiling information into the score. Isolating which
mechanism is better is the question; stacking them answers neither.

## 3. The ramp shape — named from an existing artifact, never swept

`no_fit_guard` exists to stop exactly what a grid-search-and-ship would be
here. **`w(tier_frac)` reuses the four VALUES `autoWeights` already ramps
`ceiling` through by round — 0.45 / 0.6 / 0.8 / 0.5 — Cory's own ruling and
A's already-validated phase design, not new numbers.** What changes is the
AXIS: round position (`AUTO_ANCHOR_ROUNDS: 2`, `AUTO_BUILD_ROUNDS: 6`,
`AUTO_FILL_ROUNDS: 10`, out of `rounds: 15`) becomes tier depth as a fraction
of the player's OWN position's deepest tier, using the identical proportional
cutoffs (2/15, 6/15, 10/15 ≈ 0.13, 0.40, 0.67):

| phase | round cutoff (existing) | tier_frac cutoff (this arm) | `w` (existing value, reused) |
|---|---|---|---|
| Anchor | round ≤ 2 | tier_frac ≤ 0.13 | 0.45 |
| Build | round ≤ 6 | tier_frac ≤ 0.40 | 0.60 |
| Fill | round ≤ 10 | tier_frac ≤ 0.67 | 0.80 |
| Endgame | round > 10 | tier_frac > 0.67 | 0.50 |

Measured on the live board (08-19): position tier depth is QB 11, RB 19, WR
28, TE 17 — so a WR's Anchor cutoff is tier ≤ 4, Build ≤ 11, Fill ≤ 19; a
QB's is tier ≤ 1, ≤ 4, ≤ 7. **No value in this table was chosen by looking at
an outcome.** If Cory or A judge these cutoffs wrong, that is a design
argument to have before any run — moving them after seeing a result is
exactly the fitting this guard exists to prevent.

## 4. What the harness needs, stated so it is a dependency and not assumed

`replay_seats.js` supports single-weight overrides (`--need <w>`, `--bye
<w>`) applied on top of `MEASURED_WEIGHTS` — it does not support replacing
`proj_mean` itself before scoring, which is what this arm requires. **This is
new harness capability, not a flag on the existing mechanism**, and building
it is not this document's job — a prereg that also quietly extends shared
replay infrastructure is the thing `KNOWN_FLAGS`'s hard-error allowlist
exists to catch, and I am naming the gap instead of working around it.
Proposed shape, for whoever builds it (myself in a follow-up, or D/A if they
reach it first): a `--tier-ramp` flag that computes `effective_mean` into a
`_scoringMean` field on each board player before the replay's engine calls,
reads `_scoringMean` in place of `proj_mean` for `value`/VONA only (never for
`replacement`, `adjusted_adp`, or anything computed pre-blend), and forces
`ceiling: 0` in the same invocation — refusing (exit 2) if `--tier-ramp` and
a nonzero `--ceiling` both appear, the same shape `--need`/`--bye`'s mutual
refusal already uses for a combined-arm case nobody preregistered.

## 5. The comparison

| arm | mechanism |
|---|---|
| **T0** | `MEASURED_WEIGHTS` as shipped — `ceiling: 0.45` flat, `proj_mean` untouched |
| **T1** | `ceiling: 0`, `proj_mean` replaced by `effective_mean` per §2-3 |

Everything else held: same bundles, same seats, same keepers, same fixed
opponents, `VONA_INCLUDE_SELF: true` on both (matching P110/P114's own
convention so results are comparable across the three).

## 6. Predictions, registered before any run

**P120-a (points/dollars, the E1-E5 estimand).** `mean(T1 − T0)` on the
`optimal` estimand, season-clustered — same instrument as P110/P114. **I
predict a SMALL POSITIVE, likely inside the seat replay's own noise floor
(±41.8 pts/season, DS1).** Reasoning: T0's flat 0.45 already captures most of
the aggregate benefit (it is Cory's ruling, backed by the already-measured
+$56/season λ=0.5 ceiling-tilt result in `FRONTIER.md` exp 21) — this arm's
entire theoretical edge over T0 is the ROUND-vs-TIER distinction for players
who fall (or rise) relative to their tier, which is a real but narrow
population. **A null here would not be evidence against the tier-vs-round
argument** — it would most likely be the same instrument-cannot-see-it shape
P114 already names for `bye`, not a refutation. Naming this before the run so
a null cannot be read as stronger than it is.

**P120-b (the mechanism — where I expect it to actually move something).**
Compare rosters' KEEPER-eligible depth at pick time: T1 should draft
MORE tier-1-talent-fallen-to-a-late-round players than T0, identifiable as
players with `tier ≤ 3` taken after round 8. This is the exact case the
round-based ramp cannot represent (Fill/Endgame phases price him as a
flier) and the tier-based one can. If T1 does not show this shift, the
mechanism itself has failed regardless of what P120-a says, and that is the
more informative failure to report.

**P120-c (does it interact with the un-fieldable-lineup problem, register
59).** **I predict NO measurable interaction, stated so it cannot be claimed
after the fact.** This arm reweights VALUE among players already selected by
hard legality and VONA; it does nothing about `need`/`bye` shipping at zero,
which is register 59's actual mechanism (already P110/P114's territory, not
this arm's). A world where T1 "also" looks like it fixes the roster-shape
problem would be worth a second look for confound, not a shared credit.

## 7. What this cannot say

- Same limit P110/P114 carry: `VONA_INCLUDE_SELF` and the seat replay's rosters
  are frozen-as-drafted; no in-season correction exists in the estimand.
- The tier-boundary cutoffs (§3) are read off the CURRENT board's tier depth
  per position (QB 11, RB 19, WR 28, TE 17) — a materially different board
  (different `assign_tiers` calibration) would shift the absolute tier
  numbers the cutoffs land on, though not the proportional design.
- Does not address whether the mean-of-4 blend's underlying cross-source
  ceiling/floor is itself MORE ACCURATE than the old per-band constant —
  that question belongs to `proj_mean_blend.py`'s own `no_control` gate
  (P113, January), and this arm inherits whatever that answer turns out to
  be rather than re-litigating it.
