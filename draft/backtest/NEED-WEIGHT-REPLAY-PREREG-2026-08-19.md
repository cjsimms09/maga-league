<!-- TERRITORY: A -->
# PREREGISTRATION — should `need` be ON for Cory's 2026 draft? (register 59)

**Filed 2026-08-19 by A, BEFORE any arm ran.** Ledger **P110**.
Grade-by **2026-08-21**, before keeper lock, because the answer is a draft-night
configuration.

> ⚠️ **THIS DOES NOT REPLACE `NEED-WEIGHT-PREREG.md`, AND I NEARLY DESTROYED
> THAT FILE WRITING THIS ONE.** A `need`-weight study was already preregistered
> on **2026-08-17** — four arms (0 / 0.35 / 0.9 / 1.45) on the `archetype_rooms`
> harness, money-proxy metric, both replacement models, deliberately scheduled
> to run **after** the draft. I wrote this design straight over it, and the only
> reason it survived is that the P109 sweep's own restore guard — built an hour
> earlier for an unrelated reason — checked the file back out from under me.
> **The older design is the better one and it still stands for the post-draft
> run.** This is a different, smaller study with a different instrument and a
> draft-week deadline, and it lives in its own file for exactly that reason.

---

## 1. Why a second, smaller study now

The 08-17 design is deliberately post-draft. Register 59 is not something that
can wait: measured on the live board at Cory's own fifteen picks with his real
keepers, the shipped tool drafts **RB10 / WR1 / TE1 / QB1 / K1 / DEF1**. With
his keepers that is **RB 12, WR 2** against a lineup starting WR2 — and the only
drafted receiver has a **week-11 bye**, so week 11 has an empty WR2 slot.

`need` is the only roster-aware term in the score and it ships at **0**.

**Two things the 08-17 prereg already established, which I am not re-deriving:**
- The `need: 0` justification — *"redundant with the lineup mask"* — is FALSE
  for the composite: `engine.recommend()` never calls `withinCap`. That file
  says so, and `engine.js` already carries the retraction. **The zero was
  untested, not tested and upheld.**
- The composite's roster blindness was measured at **215 admitted QBs → 0, with
  the top 70 unmoved.**

⚠️ **AND THE 08-17 FILE'S OWN WARNING NOW APPLIES AND IS UNPAID:** it states the
215→0 blindness holds *"only while `MEASURED_WEIGHTS.ceiling = 0`"* and that the
measurement must be re-taken **if the ceiling weight ships**. The ceiling weight
**shipped at 0.45** (Cory's ruling, `09f94f99`). **That re-measurement is owed
and this study does not discharge it** — it is a separate debt, named here so it
is not quietly forgotten a second time.

## 2. The comparison — ONE binary, chosen before the data

| arm | weights |
|---|---|
| **N0** | `MEASURED_WEIGHTS` as shipped — `need: 0` |
| **N1** | `MEASURED_WEIGHTS` with `need: 1.0` |

**DELIBERATELY NOT A SWEEP.** Grading several weights on three seasons and
shipping the argmax is fitting, and `no_fit_guard` exists here because that has
happened before. **1.0 is not chosen for looking good — it is the value
`DEFAULT_WEIGHTS` already carries**, so the challenger is named by an existing
artifact rather than by me. (The 08-17 study's 4-value grid is the honest way to
learn the shape; it runs post-draft on its own harness.)

Everything else held: same bundles, same seats, same keepers, same fixed
opponents, `VONA_INCLUDE_SELF: true` on both arms. Instrument:
`replay_seats.js --need 1.0` + `replay_seats_grade.py` — the harness P107 was
graded on, both arms driven through **one** CI bundle.

## 3. Predictions, registered before the run

**P110-a (primary, points).** `mean(N1 − N0)` on the `optimal` estimand across
30 seat-seasons; season-clustered CI.
- **TRUE** positive and CI-clear · **FALSE** negative and CI-clear · **NULL**
  otherwise.
- **I predict NULL or weakly positive.** `need` changes *which position* is
  taken, and this estimand grades a season total under a hindsight-optimal
  lineup — forgiving of imbalance, because it never has to field a bad week.

**P110-b (the one I expect to move).** N1's rosters carry **more receivers** —
mean WR per seat-season strictly higher than N0's in at least 2 of 3 seasons.

**P110-c (the refusal condition).** N1 does **not** collapse into the market:
its disagreement rate with the ADP-order baseline does not fall to near zero. If
turning `need` on merely makes the tool follow ADP, it bought balance by
surrendering the edge.

## 4. Decision rule, fixed in advance

- **TRUE on P110-a** → recommend `need: 1.0` for Saturday.
- **NULL on P110-a + TRUE on P110-b** → **still recommend turning it on.** The
  points instrument is structurally blind to the week-11 empty slot, because the
  optimal-lineup estimand never has to field a lineup. Buying insurance against
  an un-fieldable roster at a measurably zero cost is the right trade — and
  fixing that rule *before* the run is what stops it from being a
  rationalisation after one.
- **FALSE on P110-a** → do not ship. The roster tilt is then a real cost paid
  for a real gain, and the repair belongs in `bye`/legality, not `need`.
- **P110-c fails** → do not ship regardless of points.

**Cory decides.** This produces a recommendation with numbers attached.

## 5. What this cannot say

- The seat replay **mirrors K/DEF** and grades **skill slots only**.
- The `optimal` estimand is blind to the exact failure that motivated the study
  (§4 accounts for that in advance).
- Three seasons of one league is three clusters.
- This grades a **flat** `need` against a flat zero. It does **not** grade the
  war room's Auto phase ramp (0.35 → 1.45), which is what Cory would actually
  draft under, and a result here is not a result about Auto.
- It does not discharge the ceiling-dependency re-measurement named in §1.
