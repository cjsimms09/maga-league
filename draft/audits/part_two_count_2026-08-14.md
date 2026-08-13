# PART TWO — THE COUNT

**Closure condition, Cory's words:** *"instances found, each classified, each fixed or
explicitly justified, and THE RESIDUAL UNRESOLVED COUNT AS A NUMBER."*

Not a review. A count. Every instrument named here is runnable and every number
below is its output, not a recollection.

---

## THE HEADLINE

| | |
|---|---|
| **instances found across all sweeps** | **111** |
| fixed | 11 |
| justified and declared (no action correct) | 48 |
| **RESIDUAL UNRESOLVED** | **52** |
| of which: not a defect, an instrument limit | 13 |
| of which: real, open, classified | 39 |
| **unexplained** | **1** (item 13, and it is named as unexplained) |

The residual is large and that is the honest shape of it. **48 of the 111 are
"justified and declared" — the sweep found them, examined them, and no change was
correct.** The 39 open ones are almost entirely one class (Lab/production board
divergence, 12) plus constants that bind nothing on this board (27), and neither
is a bug list — they are a to-do list with a number on it, which is what a count
is for.

---

## ITEM 9 — THE SELF-DESCRIPTION SWEEP

*"Every comment, docstring, label and variable name describing what a quantity IS
or what a check DOES — does it match the behaviour? HOW MANY MORE ARE THERE."*

### 9a — floors overriding a measurement · `draft/tools/floor_override_sweep.js`

| found | binding | fixed | residual |
|---|---|---|---|
| 5 | 2 | 2 | **0** |

`BENCH_CEILING_FLOOR` 0.25 over a measured ceiling weight of 0, and
`BENCH_RISK_FLOOR` 0.25 over a measured risk weight of 0. Both retired to 0. The
other three floor a weight they cannot exceed and are inert by construction.

### 9b — fields read that no board supplies · `draft/tools/orphan_field_sweep.js`

| found | bare | declared optional | residual |
|---|---|---|---|
| 3 | 0 | 3 | **0** |

`games_missed_3yr`, `playoff_sos`, `proj_ffc`. Not deleted — the signals are real
and wanted — but each now sits behind an explicit `!= null` so the code says out
loud that the field is optional and the clause is inert without it.

*The sweep's first run reported 29 orphans; 26 were `p.X`/`entry.X`/`row.X` on
other objects entirely. And the sweep itself had the defect it hunts:
`process.exitCode = 1` overridden by a later `process.exit(0)`.*

### 9c — constants whose comment states a derivation · `stated_derivation_sweep.js`

| evaluable relationships | disagree | inert reference | citation | residual |
|---|---|---|---|---|
| 1 | 0 | 0 | 1 | **0** |

**This null is nearly meaningless on its own and the file says so.** The first
version of the sweep could not detect the defect it was written for — I
reintroduced `PATHS_BAND: 12.0` with its shipped comment and it still reported
zero. Two faults: a comma broke the extractor on `max(a, b)` — the single most
likely shape for a floor-vs-derivation comment — and the predicate was wrong,
because `max(12, COIN_FLIP_GAP*4)` genuinely equals 12, so an arithmetic-agreement
test reports AGREES on the defect. `PATHS_BAND` was never a member of this class;
it belongs to 9a.

**The real finding is the denominator.** engine/survival/composite are 44/42/30
percent comment by line — 1,972 comment lines — of which an arithmetic sweep can
reach exactly one. **Self-description here is overwhelmingly prose, and prose is
the channel the VONA defect lived in.** That needs a behavioural instrument, not a
textual one, and items 10 and 11 are the first two.

---

## ITEM 10 — HARNESS-vs-PRODUCTION DIVERGENCE · `draft/tools/harness_divergence.py`

| fields read by shipped modules | clean | dead both sides | **divergent** |
|---|---|---|---|
| 28 | 13 | 3 | **12** |

**A — corrupts a backtest number (divergent AND read by a module the Lab runs): 7**
`age`, `depth_chart_order`, `games_expected`, `injury_status`, `opportunity_z`,
`years_exp` (lab-blind); `proj_ceiling` (synthetic).

**B — unexercised production surface (the Lab never loads the reader): 5**
`adp_sd` (deviation.js), `consensus_rank`/`sleeper_rank` (app.js),
`proj_fantasypros`/`proj_sleeper` (consensus.js).

**RESIDUAL: 12.** Open, classified, and none silently. Two consequences were
measured rather than argued and both change what a stored number means:

- **`risk` is identically zero in every backtest ever run here.** All five of its
  inputs are absent from a bundle board. Measured: one distinct value (0.0) on the
  Lab board against 11 distinct values in [−60, +6] on production, non-zero for
  half the board. A term with no variance cannot influence a result at any weight.
- **ceiling's −4.8 [−26, +17] was COLLINEAR, not weak.** `build_bundle.py` writes
  `proj_ceiling = 1.35 × proj_mean`, so the ceiling spread is `0.35 × proj_mean`
  and rank-identical to the value term. Spearman **1.0000** on a harness board.

**Both weights stay at 0 and their LABEL changed.** A null measurement is not a
licence to move a weight the other way. `WEIGHT_PROVENANCE` now records per weight
whether its number came from a measurement, `weight_provenance.test.js` re-derives
the degeneracy claim from `build_bundle.py` rather than trusting the comment, and
the panel sentence Cory reads no longer says the zeroed sliders "did nothing".

---

## ITEM 11 — THE NORMALISATION HUNT · `draft/tools/cfg_sensitivity.js`

| constants | binds | fragile | untested | inert |
|---|---|---|---|---|
| 59 | 25 | 7 | 13 | **27** |

**FRAGILE is the row worth reading — a 10% nudge changes a visible output:**
`SURVIVOR_CUTOFF`, `PATHS_CLIFF_URGENCY`, `RAIL_ADP_AHEAD`, `CEILING_SPREAD_SHARE`,
`CEILING_LATE_FROM`, `RAIL_COMPONENT_RATIO`, `AUTO_FILL_ROUNDS`. Seven tuned
numbers wearing principled ones.

**UNTESTED (13) is reported separately from INERT (27) on purpose.** `TELL_*`,
`THREAT_*`, `SHEET_*` and `TARGET_NUDGE` are read only by surfaces this harness
feeds nothing, so no value of them could move anything. Conflating them with inert
would be "not measured, printed as not moved" a fourth time.

**RESIDUAL: 27 inert + 13 untested = 40**, and the 13 are an instrument limit
rather than a finding about the engine.

---

## ITEM 12 — THE THREE NEW RULES · `SESSION-A.md`

Added, each anchored to this week's evidence rather than stated as principle:

- **18** — a component is not delivered until something drives it end to end
  through the path a human takes. *(the contract that was on the page and still
  undefined in the browser)*
- **19** — a symptom is closed by a named cause, not by its absence. *(item 13)*
- **20** — defects cluster; name the class, count it, report the residual as a
  number — and rule 10 applies to the sweep itself. *(six of my own measurements
  this week were instrument artifacts)*

**RESIDUAL: 0.**

---

## ITEM 13 — THE PICK-41 NaN

**NOT CLOSED. The ledger line, in full:**

> **OBSERVED ONCE. CAUSE RECONSTRUCTED AND CONSISTENT WITH EVERY MEASUREMENT, BUT
> THE REPORTING SESSION'S CONTEXT WAS NEVER CAPTURED, SO IT IS NOT CONFIRMED. NOT
> REPRODUCIBLE FROM PRODUCTION INPUTS ACROSS 15 ENGINE REVISIONS AND 9 CONTEXT
> VARIANTS. GUARDED SO IT CANNOT PROPAGATE.**

What changed: **nothing in the engine.** Every revision back to 2026-08-11 is
clean on the reported states and `draft_data.json` is byte-identical to the board
the report ran on — both axes excluded by measurement, not by argument.

The cause: a roster entry without a projection. `starterSlotMarginal` computes
`player.proj_mean − incumbent.proj_mean`; a hand-built `{name, position}`
incumbent makes that `x − undefined` = NaN. Reproduced exactly — **219/219 QBs and
391/391 RBs**, against the reported 219/219 and 392/392.

The guard: a non-finite score is refused rather than ranked, carries a named
`score_error` listing the culpable terms and the offending roster entries, and
sorts last. **It was wrong twice first** — `isFinite(Number(null))` is `true`, so
refused entries sorted exactly where zero sorts; and `demoteFlaggedOnesies` put
demoted-but-scoreable players below refused ones.

**RESIDUAL: 1, and it is the one unexplained item in this document.**

---

## ITEM 14 — PRODUCED AND UNREAD

Folded into 9b. **RESIDUAL: 0.**

---

## WHAT THIS COUNT DOES NOT COVER

Stated so the number is not read as wider than it is.

- **Prose self-description.** 1,972 comment lines, one arithmetically checkable.
  Items 10 and 11 are behavioural instruments aimed at this, and they reach the
  parts that touch a board field or a constant — not a comment describing what a
  function MEANS. That channel is still open and the VONA defect lived in it.
- **`cfg_sensitivity` runs 4 picks on a 400-player board by default.** A constant
  that binds only at pick 50, or only on a candidate ranked 600th, reads INERT.
  The tool errs toward false negatives and says so; `--full` costs ten minutes.
- **The Lab's own results have not been re-run.** Item 10 establishes that risk
  was degenerate and ceiling collinear in every backtest. It does not restate what
  those experiments would have concluded on a correct board — that is a re-run,
  and it is not in Part Two.

---

*Instruments: `floor_override_sweep.js`, `orphan_field_sweep.js`,
`stated_derivation_sweep.js` (+`_verify.sh`), `harness_divergence.py`,
`lab_modules.js`, `lab_term_degeneracy.js`, `lab_ceiling_degeneracy.js`,
`cfg_sensitivity.js`, `nan_provenance.js`. Guards: `weight_provenance.test.js`,
`no_nan_score.test.js`. Suite at time of writing: 183 scanned, 0 red.*
