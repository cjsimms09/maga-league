<!-- TERRITORY: A -->
# RESULT — BRACKETING THE CEILING WEIGHT

**Prereg:** `CEILING-BRACKET-PREREG.md`, committed before the run (`f8277c67`).
**Generated table:** `EXP-CEILING-BRACKET.md` · **data:** `exp_ceiling_bracket.json`
**Run:** 400 paired rooms × the same 3 fixed seeds · anchor control **reproduced**.

---

## THE HEADLINE: IT IS A ZERO-VERSUS-NON-ZERO QUESTION, AND THE VALUE BARELY MATTERS

| w | mean vs shipped 0.0 | positive | separable |
|---|---|---|---|
| 0.15 | +$24.0 | 3/3 | **3/3** |
| 0.30 | +$36.1 | 3/3 | **3/3** |
| 0.45 | +$35.7 | 3/3 | **3/3** |
| 0.65 | +$35.5 | 3/3 | **3/3** |

**All twelve seed × weight cells are positive, and all twelve have a bootstrap CI
that excludes zero.** Every non-zero ceiling weight tested beats the shipped zero
in every seed. There is no setting in this range that fails to.

**0.30 / 0.45 / 0.65 are indistinguishable** — means within **$0.6** of each
other while individual CIs span roughly $40. Per the prereg, that ranking is
descriptive only and **0.30 is NOT "the optimum"**; presenting a $0.6 gap as a
finding is exactly what §5.5 was written to forbid.

**0.15 is the one visible structure**: clearly lower (+$24.0) but still separably
positive in 3/3. So the surface rises off zero, reaches a plateau by ~0.30, and
is flat from there through 0.65. The peak is now interior rather than on the
grid edge, which is what this run was for — but "interior" here means "on a
plateau", not "located".

## WHAT THE ANCHOR CONTROL BOUGHT

w=0.65 was carried over and reproduced its published per-seed edges **exactly**
(+27.56 / +52.50 / +26.56). That matters twice: it proves the finer grid did not
disturb the arms it shares — `race()` derives each room's RNG state from
`(seed, room)` alone — and it proves the board and money proxy did not move
between the two runs. Without it, a flat grid could equally have meant "the
instrument drifted", and the run was written to print the drift and report
nothing else if it had.

## WHAT THIS DOES AND DOES NOT CHANGE

**It strengthens the re-derivation and does not extend it.** The claim that
survives is the one already made: `MEASURED_WEIGHTS.ceiling = 0.0` is
contradicted by measurement, and now robustly — the conclusion does not depend
on having picked 0.65. Every limit from `EXP-CEILING-REDERIVATION.md` still
stands **unchanged**, because this run shares its board, its proxy, its seeds and
its collinearity:

- still a **money-proxy** result, not a graded historical replay;
- still **cross-band** dispersion only (the measured ceiling is `proj_mean × a
  per-cell constant`, Spearman 0.9607) — it says nothing about whether **this**
  player has upside;
- still the **same three seeds**, so a fresh-seed replication is owed and this
  run does not supply it.

**Nothing ships before 2026-08-22.** Two preregistered runs on the same seeds
are one experiment measured twice, not two experiments.

## WHAT IS OWED NEXT, IN ORDER

1. **Fresh-seed replication** — three seeds disjoint from these, at a weight in
   the flat range. This is the outstanding blocker on any weight change, and it
   is deliberately not run here: doing it in the same breath as the grid that
   suggested it would defeat the point.
2. **Then a shipping decision**, post-draft, which is Cory's. The honest framing
   for him is *"the model is currently ignoring upside entirely; measurement says
   it should not, and says the exact amount hardly matters"* — not *"set it to
   0.30"*.
3. **Then the per-player question**, which none of this touches:
   `weekly_volatility.py` (`VOLATILITY-WIRING-PREREG.md`).
