<!-- TERRITORY: A -->
# PREREGISTRATION — BRACKET THE CEILING WEIGHT

**Committed BEFORE the run. No results in this commit.**

**Cory, 2026-08-17:** *"Then let's actually fine tune our model for best
outcome!"*

---

## 1. WHY THIS IS A RESOLUTION PROBLEM, NOT A NEW HYPOTHESIS

`EXP-CEILING-REDERIVATION.md` found a ceiling weight of **0.65 beating the
shipped zero in 3/3 seeds, separably in 3/3** (+$35.5 mean). It also found the
effect falling monotonically as the weight rose:

| w=0.65 | w=1.0 | w=1.5 |
|---|---|---|
| +35.5 · 3/3 sep | +21.1 · 1/3 | +19.9 · 1/3 |

**0.65 was the smallest weight on that grid.** The winner sitting on the edge
means the peak is at or below it and that run could not locate it — its own
verdict string says so. This asks the same question at a scale that can answer
it. It is not a second hypothesis, and it must not become one: the grid, the
seeds, the controls and the decision rule are all fixed below, before any
number exists.

## 2. THE GRID, THE SEEDS, THE INSTRUMENT

- **w ∈ {0.15, 0.30, 0.45, 0.65}** — declared here, not chosen after looking.
- **Seeds 20268727 / 20365537 / 21560517** — the same three, so the comparison
  is like-for-like and a fresh-seed replication remains an *independent* step
  still owed before anything ships.
- **400 paired rooms**, per-seed paired bootstrap CI, `core` = the shipped
  `MEASURED_WEIGHTS.ceiling = 0.0`.
- `draft/backtest/exp_ceiling_bracket.py`, reusing `race`/`_paired`/`summarise`
  from `exp_ceiling_replicate.py` rather than copying them.

**The one change to the existing instrument is additive and is disclosed here:**
`race()` gained an optional `weights=` argument, defaulting to the original
grid. Every room's RNG state derives from `(seed, room)` alone and never from
which arms are present, so the replication run is bit-identical with or without
it — which is exactly what makes the control in §3 possible.

## 3. THE CONTROL RUNS FIRST AND CAN REFUSE THE WHOLE RUN

**w=0.65 is carried over and must reproduce its published per-seed edges
exactly: +27.56 / +52.50 / +26.56** (tolerance 0.005).

If it does not, then something other than the grid moved — the board, the money
proxy, or the RNG wiring — and every number in the run would be measuring that
change instead of the ceiling weight. **In that case the script prints the drift
and reports NOTHING else.** A finer grid whose shared arm has shifted is not a
sharper measurement, it is a different experiment wearing the same name.

The expected values are hard-coded in the script rather than read back from
`exp_ceiling_replicate.json`, because that file is overwritten by any re-run of
the script it controls, and a control the subject can rewrite is not a control.

## 4. DECLARED IN ADVANCE ABOUT THE OUTCOME

- **The most likely result is that the low end is flat.** Between 0.15 and 0.65
  the ceiling term is a small perturbation of a value-dominated score, and the
  measured ceiling is still `proj_mean × a per-cell constant` at Spearman 0.9607
  against `proj_mean` — so the arms are similar boards, not different
  philosophies. **"No resolvable difference across 0.15–0.65" is a real result
  and is publishable as one.**
- **If the peak is again at the smallest weight tested**, that is reported as
  *still unbracketed* — NOT as "so use 0.15". A grid that keeps failing to
  bracket its optimum is evidence that the effect is a step away from zero
  rather than a curve with an interior maximum, and saying so is the honest
  reading.
- **A non-monotone grid is expected noise at this effect size**, not structure.
  Three seeds at 400 rooms will not resolve a bump between neighbouring weights,
  and no interior wiggle may be read as an optimum.

## 5. PASS/FAIL, DECLARED NOW

1. **Anchor control** (§3) — reproduce or refuse.
2. **Input gate** — the board must carry more than one distinct
   `proj_ceiling/proj_mean` ratio, stamped into the artifact.
3. **The full grid is reported for every seed**, whatever it says.
4. **Same bar as before**: a weight "replicates" only if its sign holds in all
   three seeds AND its CI excludes 0 in at least two. Enforced by the shared
   `summarise()`, not by my reading of the table.
5. **Ranking within the replicating set is descriptive only.** With three seeds
   at this effect size, "0.45 beat 0.30 by $4" is not a finding, and the
   write-up may not present it as one.

## 6. WHAT MAY NOT HAPPEN

- **Nothing ships before 2026-08-22.** Unchanged from
  `CEILING-REDERIVATION-PREREG.md` §6 and `HARNESS-DISPERSION-PREREG.md` §6.
  This run cannot promote a weight even if it comes back clean — a fresh-seed
  replication is still owed first.
- **No further grids without a further prereg.** This is the second grid on one
  question; a third chosen after seeing this one's shape would be a search, and
  the record must show the difference.
- `risk` stays UNMEASURED. No `ADP_SD_RATE` re-fit rides along.

**Refusal at the anchor control, "flat across the low end", and "still
unbracketed" are all valid outcomes and need no further permission.**
